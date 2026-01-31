import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select, or_

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.api.websocket_manager import notification_manager
from app.models import (
    CommunitiesPublic,
    Community,
    CommunityAnnouncement,
    CommunityAnnouncementCreate,
    CommunityAnnouncementPublic,
    CommunityAnnouncementsPublic,
    CommunityCreate,
    CommunityItem,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    CommunityMemberUpdate,
    CommunityMessage,
    CommunityMessageCreate,
    CommunityMessagePublic,
    CommunityMessagesPublic,
    CommunityPublic,
    CommunityUpdate,
    Friendship,
    FriendshipStatus,
    Item,
    ItemOwnerPublic,
    ItemPublic,
    ItemsPublic,
    Loan,
    LoansPublic,
    LoanStatus,
    Message,
    NotificationType,
    User,
    UserPublic,
    UsersPublic,
    CollectionCreate,
    CollectionType,
    ItemType,
    Collection,
    CollectionItem,
)
from app.api.utils import filter_user_privacy, filter_owner_privacy, filter_loan_privacy, check_item_availability
from app.search import delete_community_from_search, sync_community_to_search

router = APIRouter()


@router.get("/", response_model=CommunitiesPublic)
def read_communities(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve communities.
    """
    # Get communities where user is a member
    user_memberships = session.exec(
        select(CommunityMember.community_id).where(
            CommunityMember.user_id == current_user.id
        )
    ).all()

    # Filter: Public OR (Private AND Member)
    statement = select(Community).where(
        or_(
            Community.is_private == False,
            Community.id.in_(user_memberships)
        )
    )
    
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()
    
    communities = session.exec(statement.offset(skip).limit(limit)).all()

    # Populate current_user_role, current_user_status and notifications_enabled
    communities_public = []

    # Get all memberships for current user in fetched communities
    community_ids = [c.id for c in communities]
    if community_ids:
        memberships = session.exec(
            select(CommunityMember).where(
                CommunityMember.user_id == current_user.id,
                CommunityMember.community_id.in_(community_ids)
            )
        ).all()
        membership_map = {
            m.community_id: {
                "role": m.role, 
                "status": m.status,
                "notif": m.notifications_enabled
            } for m in memberships
        }
    else:
        membership_map = {}

    for community in communities:
        comm_pub = CommunityPublic.model_validate(community)
        meta = membership_map.get(community.id)
        if meta:
            comm_pub.current_user_role = meta["role"]
            comm_pub.current_user_status = meta["status"]
            comm_pub.notifications_enabled = meta["notif"]
        communities_public.append(comm_pub)

    return CommunitiesPublic(data=communities_public, count=count)


@router.post("/", response_model=CommunityPublic)
def create_community(
    *, session: SessionDep, current_user: CurrentUser, community_in: CommunityCreate
) -> Any:
    """
    Create new community.
    """
    community = crud.create_community(
        session=session, community_in=community_in, creator_id=current_user.id
    )
    return community


@router.get("/{id}", response_model=CommunityPublic)
def read_community(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get community by ID.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    comm_pub = CommunityPublic.model_validate(community)

    # Get membership info for current user
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id
    )
    membership = session.exec(statement).first()
    if membership:
        comm_pub.current_user_role = membership.role
        comm_pub.current_user_status = membership.status
        comm_pub.notifications_enabled = membership.notifications_enabled

    return comm_pub


@router.patch("/{id}", response_model=CommunityPublic)
def update_community(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    community_in: CommunityUpdate,
) -> Any:
    """
    Update a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check if user is admin
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.role == CommunityMemberRole.ADMIN
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=400, detail="Not enough permissions")

    update_dict = community_in.model_dump(exclude_unset=True)
    community.sqlmodel_update(update_dict)
    session.add(community)
    session.commit()
    session.refresh(community)
    sync_community_to_search(community)
    return community


@router.delete("/{id}")
def delete_community(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check if user is creator or admin
    if community.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=400, detail="Not enough permissions")

    session.delete(community)
    session.commit()
    delete_community_from_search(id)
    return Message(message="Community deleted successfully")


@router.post("/{id}/join", response_model=Message)
async def join_community(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Join a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check existing membership
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()
    
    if membership:
        if membership.status == CommunityMemberStatus.PENDING:
            raise HTTPException(status_code=400, detail="Join request already pending")
        if membership.status == CommunityMemberStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Already a member of this community")
        if membership.status == CommunityMemberStatus.REJECTED:
            raise HTTPException(status_code=400, detail="Join request was rejected")
        if membership.status == CommunityMemberStatus.BANNED:
            raise HTTPException(status_code=403, detail="You are banned from this community")
        if membership.status == CommunityMemberStatus.SUSPENDED:
            raise HTTPException(status_code=403, detail="Your account is suspended in this community")

    crud.join_community(session=session, community_id=id, user_id=current_user.id)

    # If closed, notify admins and moderators
    if community.requires_approval:
        admin_statement = select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.role.in_([CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]),
            CommunityMember.status == CommunityMemberStatus.ACCEPTED
        )
        staff = session.exec(admin_statement).all()
        for member in staff:
            crud.create_notification(
                session=session,
                recipient_id=member.user_id,
                title="New Join Request",
                message=f"{current_user.full_name or current_user.email} applied to join {community.name}.",
                type=NotificationType.INFO,
                link=f"/communities/{id}"
            )
            await notification_manager.send_personal_message(
                {"type": "new_notification"},
                member.user_id
            )

    return Message(message="Application sent" if community.requires_approval else "Joined successfully")


@router.post("/{id}/leave", response_model=Message)
def leave_community(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> Any:
    """
    Leave a community or remove a member.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    target_user_id = user_id or current_user.id

    if target_user_id != current_user.id:
        # Check if current user is admin
        statement = select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
        membership = session.exec(statement).first()
        if not membership and not current_user.is_superuser:
            raise HTTPException(status_code=400, detail="Not enough permissions")

    crud.leave_community(session=session, community_id=id, user_id=target_user_id)
    return Message(message="Left community successfully")


@router.get("/{id}/members", response_model=UsersPublic)
def read_community_members(
    *, 
    session: SessionDep, 
    current_user: CurrentUser, 
    id: uuid.UUID, 
    skip: int = 0, 
    limit: int = 100,
    status: CommunityMemberStatus | None = None
) -> Any:
    """
    Get members of a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Get current user's membership
    my_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id
    )
    my_membership = session.exec(my_membership_stmt).first()
    is_staff = my_membership and my_membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]

    # Privacy check for closed communities
    if community.requires_approval and not current_user.is_superuser:
        if not my_membership or my_membership.status != CommunityMemberStatus.ACCEPTED:
            raise HTTPException(
                status_code=403,
                detail="This community is closed. You must be a member to view the member list."
            )

    # Base statement
    base_stmt = select(User, CommunityMember).join(CommunityMember, User.id == CommunityMember.user_id).where(CommunityMember.community_id == id)

    # Filter by status if provided, otherwise default to ACCEPTED for non-admins
    if status:
        if status != CommunityMemberStatus.ACCEPTED and not is_staff and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Only staff can filter by non-accepted status")
        base_stmt = base_stmt.where(CommunityMember.status == status)
    elif not is_staff and not current_user.is_superuser:
        base_stmt = base_stmt.where(CommunityMember.status == CommunityMemberStatus.ACCEPTED)

    count = session.exec(select(func.count()).select_from(base_stmt.subquery())).one()
    results = session.exec(base_stmt.offset(skip).limit(limit)).all()

    # Get friendship statuses for members
    member_ids = [u.id for u, m in results]
    friendship_map = {}
    if member_ids:
        friendships = session.exec(
            select(Friendship).where(
                Friendship.user_id == current_user.id,
                Friendship.friend_id.in_(member_ids)
            )
        ).all()
        friendship_map = {f.friend_id: f.status for f in friendships}

    # Reveal details if Closed community AND current user is an accepted member (or superuser)
    reveal_details = community.requires_approval and (
        current_user.is_superuser or 
        (my_membership and my_membership.status == CommunityMemberStatus.ACCEPTED)
    )

    users_with_meta = []
    for user, membership in results:
        f_status = friendship_map.get(user.id)
        is_friend = f_status == FriendshipStatus.ACCEPTED
        
        user_public = filter_user_privacy(
            user, 
            current_user.id, 
            is_admin=current_user.is_superuser or reveal_details,
            is_friend=is_friend
        )
        user_public.community_role = membership.role
        user_public.community_status = membership.status
        user_public.friendship_status = f_status

        # Restrict data if not friends and not revealed
        if not current_user.is_superuser and not reveal_details and user.id != current_user.id and not is_friend:
            user_public.communities = []
            user_public.interests = []

        users_with_meta.append(user_public)

    return UsersPublic(data=users_with_meta, count=count)


@router.patch("/{id}/members/{user_id}", response_model=UserPublic)
async def update_community_member_role(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    user_id: uuid.UUID,
    member_in: CommunityMemberUpdate,
) -> Any:
    """
    Update a member's role or status in a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Get current user's membership
    my_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id
    )
    my_membership = session.exec(my_membership_stmt).first()
    
    # Permission check: ADMIN or MODERATOR (for specific tasks)
    is_admin = (my_membership and my_membership.role == CommunityMemberRole.ADMIN) or current_user.is_superuser
    is_moderator = (my_membership and my_membership.role == CommunityMemberRole.MODERATOR)
    
    if not is_admin and not is_moderator:
        raise HTTPException(status_code=400, detail="Not enough permissions")

    # Target member
    target_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == user_id
    )
    target_membership = session.exec(target_membership_stmt).first()
    if not target_membership:
         raise HTTPException(status_code=404, detail="Member not found in this community")

    # Moderator restrictions: can only manage non-staff
    if is_moderator and not is_admin:
        # Cannot promote to ADMIN or MODERATOR
        if member_in.role and member_in.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]:
            raise HTTPException(status_code=403, detail="Moderators cannot promote members to staff roles")
        # Cannot modify existing staff
        if target_membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]:
            raise HTTPException(status_code=403, detail="Moderators cannot modify staff members")

    updated_member = crud.update_community_member(
        session=session,
        community_id=id,
        user_id=user_id,
        role=member_in.role,
        status=member_in.status,
    )

    if not updated_member:
        raise HTTPException(status_code=404, detail="Member not found in this community")

    # Notify user of status/role change
    if member_in.status == CommunityMemberStatus.ACCEPTED:
        crud.create_notification(
            session=session,
            recipient_id=user_id,
            title="Community Request Accepted",
            message=f"You are now a member of {community.name}.",
            type=NotificationType.SUCCESS,
            link=f"/communities/{id}"
        )
        await notification_manager.send_personal_message(
            {"type": "new_notification"},
            user_id
        )
    elif member_in.role:
        crud.create_notification(
            session=session,
            recipient_id=user_id,
            title="Community Role Updated",
            message=f"Your role in {community.name} has been updated to {member_in.role}.",
            type=NotificationType.INFO,
            link=f"/communities/{id}"
        )
        await notification_manager.send_personal_message(
            {"type": "new_notification"},
            user_id
        )

    user = session.get(User, user_id)
    user_public = filter_user_privacy(user, current_user.id, is_admin=current_user.is_superuser)
    user_public.community_role = updated_member.role
    user_public.community_status = updated_member.status
    return user_public


@router.post("/{id}/notifications", response_model=Message)
def update_community_notifications(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    enabled: bool,
) -> Any:
    """
    Toggle notifications for a community.
    """
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")

    membership.notifications_enabled = enabled
    session.add(membership)
    session.commit()
    return Message(message=f"Notifications {'enabled' if enabled else 'disabled'}")


@router.get("/{id}/items", response_model=ItemsPublic)
def read_community_items(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, skip: int = 0, limit: int = 100
) -> Any:
    """
    Get items belonging to a community.
    Includes both pooled items (via CommunityItem) and exclusively community-owned items.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Access check: member or admin
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to view community items")

    # Query for pooled items
    pooled_stmt = (
        select(Item)
        .join(CommunityItem, Item.id == CommunityItem.item_id)
        .where(CommunityItem.community_id == id)
    )
    
    # Query for exclusively community-owned items
    owned_stmt = (
        select(Item)
        .where(
            Item.owner_id == id
        )
    )
    
    # Combine using OR
    statement = select(Item).where(
        or_(
            Item.id.in_(pooled_stmt.with_only_columns(Item.id)),
            Item.owner_id == id
        )
    )

    count_stmt = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_stmt).one()
    
    items = session.exec(statement.offset(skip).limit(limit)).all()
    
    # Get all CommunityItem meta for pooled items in this batch
    item_ids = [item.id for item in items]
    comm_items = session.exec(
        select(CommunityItem).where(
            CommunityItem.community_id == id,
            CommunityItem.item_id.in_(item_ids)
        )
    ).all()
    comm_item_map = {ci.item_id: ci for ci in comm_items}
    
    items_public = []
    for item in items:
        # Check availability
        is_avail = check_item_availability(session, item.id)
        
        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner
            
        item_pub = ItemPublic(
            id=item.id,
            owner_id=item.owner_id,
            title=item.title,
            description=item.description,
            author=item.author,
            item_type=item.item_type,
            image_url=item.image_url,
            extra_data=item.extra_data,
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail
        )
        
        # Add pooling metadata if applicable
        comm_item = comm_item_map.get(item.id)
        if comm_item:
            item_pub.added_by_id = comm_item.added_by
            item_pub.is_donation_pending = comm_item.is_donation_pending
            
        items_public.append(item_pub)

    return ItemsPublic(data=items_public, count=count)


@router.post("/{id}/items/{item_id}", response_model=Message)
def add_item_to_community(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, item_id: uuid.UUID
) -> Any:
    """
    Add an item to a community pool (Any member).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Member check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to add items to community")

    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check if current user is the owner
    if not item.user_owner or item.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can add this item to a pool")

    # Check if already added
    statement = select(CommunityItem).where(
        CommunityItem.community_id == id,
        CommunityItem.item_id == item_id
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(status_code=400, detail="Item already in community pool")

    comm_item = CommunityItem(
        community_id=id, 
        item_id=item_id, 
        added_by=current_user.id
    )
    session.add(comm_item)

    # Ensure one bucket per user per community for books
    if item.item_type == ItemType.book:
        # Check if user already has a bucket in this community
        bucket_stmt = select(Collection).where(
            Collection.owner_id == current_user.id,
            Collection.community_id == id,
            Collection.collection_type == CollectionType.BUCKET
        )
        bucket = session.exec(bucket_stmt).first()
        
        if not bucket:
            visible_name = current_user.full_name or (current_user.profile.alias if current_user.profile else None) or current_user.email
            collection_in = CollectionCreate(
                title=f"{visible_name}'s Bucket",
                description=f"Collection of items {visible_name} is sharing with this community.",
                collection_type=CollectionType.BUCKET
            )
            bucket = crud.create_collection(
                session=session, 
                collection_in=collection_in, 
                owner_id=current_user.id,
                community_id=id
            )
        
        crud.add_item_to_collection(session=session, collection_id=bucket.id, item_id=item_id)

    session.commit()
    return Message(message="Item added to community pool")


@router.post("/{id}/items/{item_id}/donate", response_model=Message)
def initiate_donation(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, item_id: uuid.UUID
) -> Any:
    """
    Initiate a donation of an item to the community.
    """
    statement = select(CommunityItem).where(
        CommunityItem.community_id == id,
        CommunityItem.item_id == item_id
    )
    comm_item = session.exec(statement).first()
    if not comm_item:
        raise HTTPException(status_code=404, detail="Item not found in community")
    
    if comm_item.added_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the person who pooled the item can donate it")

    comm_item.is_donation_pending = True
    session.add(comm_item)
    session.commit()
    
    # Notify admins only
    admin_statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.role == CommunityMemberRole.ADMIN,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED
    )
    staff = session.exec(admin_statement).all()
    for member in staff:
        crud.create_notification(
            session=session,
            recipient_id=member.user_id,
            title="Item Donation Pending",
            message=f"{current_user.full_name or current_user.email} wants to donate an item to the community.",
            type=NotificationType.INFO,
            link=f"/communities/{id}"
        )
        notification_manager.send_personal_message(
            {"type": "new_notification"},
            member.user_id
        )
    
    return Message(message="Donation request sent to admins")


@router.post("/{id}/items/{item_id}/ratify-donation", response_model=Message)
def ratify_donation(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, item_id: uuid.UUID
) -> Any:
    """
    Ratify a donation (Admin only).
    """
    # Admin check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.role == CommunityMemberRole.ADMIN
    )
    if not session.exec(statement).first() and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can ratify donations")

    statement = select(CommunityItem).where(
        CommunityItem.community_id == id,
        CommunityItem.item_id == item_id
    )
    comm_item = session.exec(statement).first()
    if not comm_item or not comm_item.is_donation_pending:
        raise HTTPException(status_code=400, detail="No pending donation found")

    item = session.get(Item, item_id)
    # Change ownership
    item.owner_id = id
    
    # Update comm_item status
    comm_item.is_donation_pending = False
    
    session.add(item)
    session.add(comm_item)
    session.commit()
    
    return Message(message="Donation ratified! The community now owns this item.")


@router.delete("/{id}/items/{item_id}", response_model=Message)
def remove_item_from_community(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, item_id: uuid.UUID
) -> Any:
    """
    Remove an item from a community.
    Admins can remove any item. Members can only remove items they added.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    
    statement = select(CommunityItem).where(
        CommunityItem.community_id == id,
        CommunityItem.item_id == item_id
    )
    comm_item = session.exec(statement).first()
    if not comm_item:
        raise HTTPException(status_code=404, detail="Item not found in community")
    
    # Admin or added_by check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    
    is_admin = membership and membership.role == CommunityMemberRole.ADMIN
    is_adder = comm_item.added_by == current_user.id
    
    if not is_admin and not is_adder and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions to remove this item")
    
    # Bucket cleanup
    statement = (
        select(Collection)
        .join(CollectionItem, Collection.id == CollectionItem.collection_id)
        .where(
            Collection.community_id == id,
            Collection.collection_type == CollectionType.BUCKET,
            CollectionItem.item_id == item_id
        )
    )
    buckets = session.exec(statement).all()
    for bucket in buckets:
        crud.remove_item_from_collection(session=session, collection_id=bucket.id, item_id=item_id)
            
    session.delete(comm_item)
    session.commit()
    return Message(message="Item removed from community")


@router.get("/{id}/announcements", response_model=CommunityAnnouncementsPublic)
def read_community_announcements(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, skip: int = 0, limit: int = 100
) -> Any:
    """
    Get announcements for a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Access check: member or admin
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to view announcements")

    count = session.exec(
        select(func.count()).where(CommunityAnnouncement.community_id == id)
    ).one()
    statement = (
        select(CommunityAnnouncement)
        .where(CommunityAnnouncement.community_id == id)
        .order_by(CommunityAnnouncement.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    announcements = session.exec(statement).all()
    return CommunityAnnouncementsPublic(data=announcements, count=count)


@router.post("/{id}/announcements", response_model=CommunityAnnouncementPublic)
async def create_community_announcement(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    announcement_in: CommunityAnnouncementCreate,
) -> Any:
    """
    Create an announcement (Staff only).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Staff check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.role.in_([CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]),
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only staff can create announcements")

    announcement = CommunityAnnouncement(
        **announcement_in.model_dump(),
        community_id=id,
        author_id=current_user.id
    )
    session.add(announcement)
    session.commit()
    session.refresh(announcement)

    # Notify all members who have notifications enabled
    member_statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
        CommunityMember.user_id != current_user.id,
        CommunityMember.notifications_enabled,
    )
    members = session.exec(member_statement).all()
    for member in members:
        crud.create_notification(
            session=session,
            recipient_id=member.user_id,
            title=f"New Announcement in {community.name}",
            message=announcement.title,
            type=NotificationType.INFO,
            link=f"/communities/{id}"
        )
        # Notify via websocket
        await notification_manager.send_personal_message(
            {"type": "new_notification"},
            member.user_id
        )

    return announcement


@router.get("/{id}/messages", response_model=CommunityMessagesPublic)
def read_community_messages(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, skip: int = 0, limit: int = 100
) -> Any:
    """
    Get messages for a community board.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Access check: member or admin
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to view messages")

    count = session.exec(
        select(func.count()).where(CommunityMessage.community_id == id)
    ).one()
    statement = (
        select(CommunityMessage)
        .where(CommunityMessage.community_id == id)
        .order_by(CommunityMessage.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    messages = session.exec(statement).all()
    return CommunityMessagesPublic(data=messages, count=count)


@router.post("/{id}/messages", response_model=CommunityMessagePublic)
def create_community_message(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    message_in: CommunityMessageCreate,
) -> Any:
    """
    Post a message to the community board.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Member check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to post messages")

    message = CommunityMessage(
        **message_in.model_dump(),
        community_id=id,
        author_id=current_user.id
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return message


@router.patch("/{id}/messages/{message_id}", response_model=CommunityMessagePublic)
def update_community_message(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    message_id: uuid.UUID,
    message_in: CommunityMessageCreate,
) -> Any:
    """
    Update a message on the community board.
    """
    message = session.get(CommunityMessage, message_id)
    if not message or message.community_id != id:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.author_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions to edit this message")

    message.content = message_in.content
    session.add(message)
    session.commit()
    session.refresh(message)
    return message


@router.delete("/{id}/messages/{message_id}", response_model=Message)
def delete_community_message(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    message_id: uuid.UUID,
) -> Any:
    """
    Delete a message from the community board.
    Author, Admins, and Moderators can delete messages.
    """
    message = session.get(CommunityMessage, message_id)
    if not message or message.community_id != id:
        raise HTTPException(status_code=404, detail="Message not found")

    # Permission check
    is_author = message.author_id == current_user.id
    
    my_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id
    )
    my_membership = session.exec(my_membership_stmt).first()
    is_staff = my_membership and my_membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]

    if not is_author and not is_staff and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    session.delete(message)
    session.commit()
    return Message(message="Message deleted")


@router.get("/{id}/loans", response_model=LoansPublic)
def read_community_loans(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, skip: int = 0, limit: int = 100
) -> Any:
    """
    Get loans for a community (Staff only).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Staff check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.role.in_([CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]),
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only staff can view community loans")

    count_statement = select(func.count()).select_from(Loan).where(Loan.community_id == id)
    count = session.exec(count_statement).one()

    statement = (
        select(Loan)
        .where(Loan.community_id == id)
        .order_by(Loan.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    loans = session.exec(statement.offset(skip).limit(limit)).all()
    return LoansPublic(
        data=[filter_loan_privacy(l, current_user.id, is_admin=current_user.is_superuser) for l in loans], 
        count=count
    )
