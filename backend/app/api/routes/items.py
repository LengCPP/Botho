import uuid
import json
from typing import Any, Annotated

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlmodel import func, select, col, or_

from app.api.deps import CurrentUser, SessionDep
from app.api.utils import filter_owner_privacy
from app.storage import upload_image, delete_image, upload_image_from_url
from app.search import sync_item_to_search, delete_item_from_search
from app.models import (
    Item,
    ItemCreate,
    ItemPublic,
    ItemsPublic,
    ItemUpdate,
    ItemType,
    OwnerType,
    Message,
    Friendship,
    FriendshipStatus,
    ItemOwnerPublic,
    Loan,
    LoanStatus,
    CommunityMember,
    CommunityMemberStatus,
)

router = APIRouter(prefix="/items", tags=["items"])


def check_item_availability(session: SessionDep, item_id: uuid.UUID) -> bool:
    """
    Check if an item is available (not currently loaned out).
    """
    active_loan = session.exec(
        select(Loan).where(
            Loan.item_id == item_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, LoanStatus.RETURN_PENDING])
        )
    ).first()
    return active_loan is None


@router.get("/", response_model=ItemsPublic)
def read_items(
    session: SessionDep, 
    current_user: CurrentUser, 
    skip: int = 0, 
    limit: int = 100,
    owner_id: uuid.UUID | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    exclude_collections: bool = False,
    category: str | None = None,
    genre: str | None = None
) -> Any:
    """
    Retrieve items. Filters by current user's owner_id by default.
    """
    
    # Permission check and target owner selection
    if owner_id and owner_id != current_user.id:
        # Check if it's a community owner_id
        is_community = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        
        if not is_community:
            # Check if friend
            is_friend = session.exec(
                select(Friendship).where(
                    ((Friendship.user_id == current_user.id) & (Friendship.friend_id == owner_id)) |
                    ((Friendship.user_id == owner_id) & (Friendship.friend_id == current_user.id)),
                    Friendship.status == FriendshipStatus.ACCEPTED
                )
            ).first()
            if not is_friend and not current_user.is_superuser:
                raise HTTPException(status_code=403, detail="Not enough permissions to view this user's items")
        target_owner_id = owner_id
    else:
        target_owner_id = current_user.id

    # Filter items by owner_id
    statement = select(Item).where(Item.owner_id == target_owner_id)

    if category:
        statement = statement.where(
            func.json_extract_path_text(Item.extra_data, 'category') == category
        )
    
    if genre:
        statement = statement.where(
            func.json_extract_path_text(Item.extra_data, 'genre') == genre
        )

    if exclude_collections:
        from app.models import CollectionItem
        # Exclude items that are in any collection
        statement = statement.where(
            Item.id.not_in(select(CollectionItem.item_id))
        )

    # Count total
    count_stmt = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_stmt).one()

    # Apply sorting
    sort_column = Item.created_at
    if sort_by == "title":
        sort_column = Item.title
        
    if sort_order == "desc":
        statement = statement.order_by(sort_column.desc())
    else:
        statement = statement.order_by(sort_column.asc())

    items = session.exec(statement.offset(skip).limit(limit)).all()
    
    public_items = []
    for item in items:
        is_avail = check_item_availability(session, item.id)
        
        owner_pub = None
        if item.owner_type == OwnerType.USER and item.user_owner:
            owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        
        item_pub = ItemPublic(
            id=item.id,
            owner_id=item.owner_id,
            title=item.title,
            description=item.description,
            author=item.author,
            item_type=item.item_type,
            owner_type=item.owner_type,
            image_url=item.image_url,
            extra_data=item.extra_data,
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            is_available=is_avail
        )
        public_items.append(item_pub)

    return ItemsPublic(data=public_items, count=count)


@router.get("/{id}", response_model=ItemPublic)
def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get item by ID.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    # Permission check
    if item.owner_id != current_user.id and not current_user.is_superuser:
        if item.owner_type == OwnerType.USER:
            is_friend = session.exec(
                select(Friendship).where(
                    ((Friendship.user_id == current_user.id) & (Friendship.friend_id == item.owner_id)) |
                    ((Friendship.user_id == item.owner_id) & (Friendship.friend_id == current_user.id)),
                    Friendship.status == FriendshipStatus.ACCEPTED
                )
            ).first()
            if not is_friend:
                 raise HTTPException(status_code=403, detail="Not enough permissions (Not a friend of owner)")
        else: # Community item
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()
            if not is_member:
                raise HTTPException(status_code=403, detail="Not enough permissions (Not a member of owning community)")

    is_avail = check_item_availability(session, item.id)
    
    owner_pub = None
    if item.owner_type == OwnerType.USER and item.user_owner:
        owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
        owner_pub.is_available = is_avail
    
    item_pub = ItemPublic(
        id=item.id,
        owner_id=item.owner_id,
        title=item.title,
        description=item.description,
        author=item.author,
        item_type=item.item_type,
        owner_type=item.owner_type,
        image_url=item.image_url,
        extra_data=item.extra_data,
        count=item.count,
        created_at=item.created_at,
        owner=owner_pub,
        is_available=is_avail
    )
    return item_pub


@router.post("/", response_model=ItemPublic)
def create_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    title: Annotated[str, Form()],
    description: Annotated[str | None, Form()] = None,
    item_type: Annotated[ItemType, Form()] = ItemType.general,
    extra_data: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
    community_owner_id: Annotated[uuid.UUID | None, Form()] = None,
) -> Any:
    """
    Create a new item. Associates with current user or community as owner.
    """
    parsed_extra = {}
    if extra_data:
        try:
            parsed_extra = json.loads(extra_data)
        except json.JSONDecodeError:
            pass

    # Handle image upload
    final_image_url = image_url
    if image:
        final_image_url = upload_image(image.file.read(), image.filename, folder="items")
    elif image_url and image_url.startswith("http"):
        # Download and store external image (e.g. from Google Books)
        stored_url = upload_image_from_url(image_url, folder="items")
        if stored_url:
            final_image_url = stored_url

    # Determine owner and type
    target_owner_id = current_user.id
    target_owner_type = OwnerType.USER
    should_pool = False

    if community_owner_id:
        # Check if user is admin of this community
        statement = select(CommunityMember).where(
            CommunityMember.community_id == community_owner_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == CommunityMemberRole.ADMIN,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED
        )
        is_admin = session.exec(statement).first() or current_user.is_superuser
        
        if is_admin:
            target_owner_id = community_owner_id
            target_owner_type = OwnerType.COMMUNITY
        else:
            # If not admin, item is owned by user but pooled in community
            target_owner_id = current_user.id
            target_owner_type = OwnerType.USER
            should_pool = True

    db_item = Item(
        title=title,
        description=description,
        item_type=item_type,
        owner_type=target_owner_type,
        extra_data=parsed_extra,
        image_url=final_image_url,
        owner_id=target_owner_id,
    )
    session.add(db_item)
    session.flush() # Get ID for pooling if needed

    if should_pool and community_owner_id:
        # Check if user is at least a member
        statement = select(CommunityMember).where(
            CommunityMember.community_id == community_owner_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED
        )
        if session.exec(statement).first():
            comm_item = CommunityItem(
                community_id=community_owner_id,
                item_id=db_item.id,
                added_by=current_user.id
            )
            session.add(comm_item)

    session.commit()
    session.refresh(db_item)
    sync_item_to_search(db_item)
    
    # Prepare public response
    owner_pub = None
    if target_owner_type == OwnerType.USER:
        owner_pub = filter_owner_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)
        owner_pub.is_available = True
    
    item_pub = ItemPublic(
        id=db_item.id,
        owner_id=db_item.owner_id,
        title=db_item.title,
        description=db_item.description,
        author=db_item.author,
        item_type=db_item.item_type,
        owner_type=db_item.owner_type,
        image_url=db_item.image_url,
        extra_data=db_item.extra_data,
        count=db_item.count,
        created_at=db_item.created_at,
        owner=owner_pub,
        is_available=True
    )
    return item_pub


@router.patch("/{id}", response_model=ItemPublic)
def update_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    title: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    item_type: Annotated[ItemType | None, Form()] = None,
    extra_data: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
) -> Any:
    """
    Update an item.
    """
    db_item = session.get(Item, id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Permission check: User must be owner OR admin of owning community
    if db_item.owner_type == OwnerType.USER:
        if db_item.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    else: # Community owned
        is_member = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == db_item.owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        if not is_member and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions (Community admin required)")

    if title is not None:
        db_item.title = title
    if description is not None:
        db_item.description = description
    if item_type is not None:
        db_item.item_type = item_type
    if image_url is not None:
        if image_url.startswith("http"):
            stored_url = upload_image_from_url(image_url, folder="items")
            if stored_url:
                db_item.image_url = stored_url
        else:
            db_item.image_url = image_url
    if extra_data is not None:
        try:
            db_item.extra_data = json.loads(extra_data)
        except json.JSONDecodeError:
            pass

    if image:
        if db_item.image_url:
            delete_image(db_item.image_url)
        db_item.image_url = upload_image(image.file.read(), image.filename, folder="items")

    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    sync_item_to_search(db_item)
    
    is_avail = check_item_availability(session, db_item.id)
    
    owner_pub = None
    if db_item.owner_type == OwnerType.USER and db_item.user_owner:
        owner_pub = filter_owner_privacy(db_item.user_owner, current_user.id, is_admin=current_user.is_superuser)
        owner_pub.is_available = is_avail
    
    item_pub = ItemPublic(
        id=db_item.id,
        owner_id=db_item.owner_id,
        title=db_item.title,
        description=db_item.description,
        author=db_item.author,
        item_type=db_item.item_type,
        owner_type=db_item.owner_type,
        image_url=db_item.image_url,
        extra_data=db_item.extra_data,
        count=db_item.count,
        created_at=db_item.created_at,
        owner=owner_pub,
        is_available=is_avail
    )
    return item_pub


@router.delete("/{id}", response_model=Message)
def delete_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Delete an item.
    """
    db_item = session.get(Item, id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Permission check: User must be owner OR admin of owning community
    if db_item.owner_type == OwnerType.USER:
        if db_item.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    else: # Community owned
        is_member = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == db_item.owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        if not is_member and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions (Community admin required)")

    if db_item.image_url:
        delete_image(db_item.image_url)

    session.delete(db_item)
    session.commit()
    delete_item_from_search(id)
    return Message(message="Item deleted successfully")