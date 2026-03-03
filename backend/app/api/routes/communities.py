import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlmodel import String, cast, col, func, or_, select, text

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.api.utils import (
    _write_log,
    decode_item_cursor,
    encode_item_cursor,
    filter_loan_privacy,
    filter_owner_privacy,
    filter_user_privacy,
    get_community_admin_count,
    invalidate_item_caches,
    rebuild_collection_index_task,
)
from app.models import (
    CommunitiesPublic,
    Community,
    CommunityAnnouncement,
    CommunityAnnouncementCreate,
    CommunityAnnouncementPublic,
    CommunityAnnouncementsPublic,
    CommunityCreate,
    CommunityDemotionVote,
    CommunityDemotionVoteStatus,
    CommunityDisbandVote,
    CommunityDisbandVoteStatus,
    CommunityFavorite,
    CommunityInvitationCreate,
    CommunityItem,
    CommunityItemRequest,
    CommunityItemRequestPublic,
    CommunityItemRequestsPublic,
    CommunityLog,
    CommunityLogPublic,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    CommunityMemberUpdate,
    CommunityMessage,
    CommunityMessageCreate,
    CommunityMessagePublic,
    CommunityMessagesPublic,
    CommunityPinUpdate,
    CommunityPublic,
    CommunityRulesUpdate,
    CommunitySettingsUpdate,
    CommunityUpdate,
    Friendship,
    FriendshipStatus,
    Item,
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
    WorkMetadata,
)
from app.notifications import notify_user
from app.search import delete_community_from_search, sync_community_to_search
from app.utils import generate_donation_notification_email, send_email

router = APIRouter()


def _get_accepted_membership(
    session: SessionDep, community_id: uuid.UUID, user_id: uuid.UUID
) -> CommunityMember | None:
    """Return the CommunityMember only if the user is an ACCEPTED member."""
    return session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
        )
    ).first()


def _is_last_admin(session: SessionDep, community_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """Return True if user_id is the only accepted ADMIN in the community."""
    membership = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
    ).first()
    if not membership:
        return False
    admin_count = session.exec(
        select(func.count()).where(
            CommunityMember.community_id == community_id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
    ).one()
    return admin_count == 1


@router.get("/", response_model=CommunitiesPublic)
def read_communities(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=settings.MAX_PAGE_SIZE),
    member_only: bool = False,
    browse: bool = False,
) -> Any:
    """
    Retrieve communities.
    """
    if member_only:
        # Status: ACCEPTED only for "My Communities"
        user_memberships = session.exec(
            select(CommunityMember.community_id).where(
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
        ).all()
        statement = select(Community).where(Community.id.in_(user_memberships))
    elif browse:
        # Browse: global (public) communities the user is NOT an accepted member of
        accepted_memberships = session.exec(
            select(CommunityMember.community_id).where(
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
        ).all()
        statement = select(Community).where(
            Community.is_private == False,  # noqa: E712
            Community.id.not_in(accepted_memberships),
        )
    else:
        # All memberships (including INVITED/PENDING) to allow discovery of private/joined ones
        user_memberships = session.exec(
            select(CommunityMember.community_id).where(
                CommunityMember.user_id == current_user.id
            )
        ).all()
        # Filter: Public OR (Private AND (Member OR Invited OR Applicant))
        statement = select(Community).where(
            or_(Community.is_private == False, Community.id.in_(user_memberships))
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
                CommunityMember.community_id.in_(community_ids),
            )
        ).all()
        membership_map = {
            m.community_id: {
                "role": m.role,
                "status": m.status,
                "notif": m.notifications_enabled,
            }
            for m in memberships
        }
    else:
        membership_map = {}

    # Get favorites for current user among fetched communities
    favorite_ids: set[uuid.UUID] = set()
    if community_ids:
        favorites = session.exec(
            select(CommunityFavorite.community_id).where(
                CommunityFavorite.user_id == current_user.id,
                CommunityFavorite.community_id.in_(community_ids),
            )
        ).all()
        favorite_ids = set(favorites)

    for community in communities:
        comm_pub = CommunityPublic.model_validate(community)
        meta = membership_map.get(community.id)
        if meta:
            comm_pub.current_user_role = meta["role"]
            comm_pub.current_user_status = meta["status"]
            comm_pub.notifications_enabled = meta["notif"]
        comm_pub.is_favorited = community.id in favorite_ids
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
def read_community(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Get community by ID.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Get membership info for current user
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id, CommunityMember.user_id == current_user.id
    )
    membership = session.exec(statement).first()

    # Privacy check: Private communities only for members or invited
    if community.is_private and not current_user.is_superuser:
        if not membership:
            raise HTTPException(status_code=403, detail="This is a private community")

    comm_pub = CommunityPublic.model_validate(community)

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

    # Admins act on behalf of the community — must be an accepted admin
    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_dict = community_in.model_dump(exclude_unset=True)
    community.sqlmodel_update(update_dict)
    session.add(community)
    session.commit()
    session.refresh(community)
    sync_community_to_search(community)
    return community


@router.patch("/{id}/rules", response_model=CommunityPublic)
def update_community_rules(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    rules_in: CommunityRulesUpdate,
) -> Any:
    """
    Update a community's rules text (Admin or Moderator only).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (
        membership and membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    ) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    community.rules = rules_in.rules
    session.add(community)
    _write_log(
        session,
        community_id=id,
        event_type="RULES_UPDATED",
        actor_name=current_user.full_name or current_user.email,
    )
    session.commit()
    session.refresh(community)

    comm_pub = CommunityPublic.model_validate(community)
    if membership:
        comm_pub.current_user_role = membership.role
        comm_pub.current_user_status = membership.status
        comm_pub.notifications_enabled = membership.notifications_enabled
    return comm_pub


@router.delete("/{id}")
def delete_community(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete a community (superuser emergency bypass only).
    Admins should use the disband-vote endpoint.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Use the disband vote endpoint to disband a community")

    session.delete(community)
    session.commit()
    delete_community_from_search(id)
    return Message(message="Community deleted successfully")


@router.post("/{id}/join", response_model=Message)
async def join_community(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Join a community. Handles accepting invitations.
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
            raise HTTPException(
                status_code=400, detail="Already a member of this community"
            )
        if membership.status == CommunityMemberStatus.REJECTED:
            raise HTTPException(status_code=400, detail="Join request was rejected")
        if membership.status == CommunityMemberStatus.BANNED:
            raise HTTPException(
                status_code=403, detail="You are banned from this community"
            )
        if membership.status == CommunityMemberStatus.SUSPENDED:
            raise HTTPException(
                status_code=403, detail="Your account is suspended in this community"
            )

        if membership.status == CommunityMemberStatus.INVITED:
            # Check who invited them
            # Check inviter's role
            inviter_membership = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == id,
                    CommunityMember.user_id == membership.invited_by,
                )
            ).first()

            if inviter_membership and inviter_membership.role in [
                CommunityMemberRole.ADMIN,
                CommunityMemberRole.MODERATOR,
            ]:
                # Staff invite -> Auto join
                membership.status = CommunityMemberStatus.ACCEPTED
                membership.role = CommunityMemberRole.MEMBER
                session.add(membership)
                _write_log(session, id, "MEMBER_JOINED", actor_name=current_user.full_name or current_user.email)
                session.commit()
                return Message(message="Joined successfully via invitation")
            else:
                # Regular member invite -> Application
                membership.status = CommunityMemberStatus.PENDING
                membership.role = CommunityMemberRole.APPLICANT
                session.add(membership)
                session.commit()
                # Notify staff
                admin_statement = select(CommunityMember).where(
                    CommunityMember.community_id == id,
                    CommunityMember.role.in_(
                        [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
                    ),
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
                staff = session.exec(admin_statement).all()
                for staff_member in staff:
                    await notify_user(
                        session=session,
                        recipient_id=staff_member.user_id,
                        title="New Join Request",
                        message=f"{current_user.full_name or current_user.email} applied to join {community.name} (Referral).",
                        type=NotificationType.INFO,
                        link=f"/communities/{id}?tab=manage",
                    )
                return Message(message="Application sent via referral")

    crud.join_community(session=session, community_id=id, user_id=current_user.id)

    if not community.requires_approval:
        _write_log(session, id, "MEMBER_JOINED", actor_name=current_user.full_name or current_user.email)
        session.commit()

    # If closed, notify admins and moderators
    if community.requires_approval:
        admin_statement = select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.role.in_(
                [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
            ),
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
        )
        staff = session.exec(admin_statement).all()
        for member in staff:
            await notify_user(
                session=session,
                recipient_id=member.user_id,
                title="New Join Request",
                message=f"{current_user.full_name or current_user.email} applied to join {community.name}.",
                type=NotificationType.INFO,
                link=f"/communities/{id}?tab=manage",
            )

    return Message(
        message="Application sent"
        if community.requires_approval
        else "Joined successfully"
    )


@router.post("/{id}/invite", response_model=Message)
async def invite_friend(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    invite_in: CommunityInvitationCreate,
) -> Any:
    """
    Invite a friend to join a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check if current user is member
    my_membership = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
        )
    ).first()
    if not my_membership:
        raise HTTPException(status_code=403, detail="Only members can invite others")

    # Check if friend exists
    friend = session.get(User, invite_in.friend_id)
    if not friend:
        raise HTTPException(status_code=404, detail="User not found")

    # Check friendship
    is_friend = session.exec(
        select(Friendship).where(
            Friendship.user_id == current_user.id,
            Friendship.friend_id == invite_in.friend_id,
            Friendship.status == FriendshipStatus.ACCEPTED,
        )
    ).first()
    if not is_friend and not current_user.is_superuser:
        raise HTTPException(status_code=400, detail="You can only invite friends")

    # Check existing membership
    existing = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.user_id == invite_in.friend_id,
        )
    ).first()
    if existing:
        if existing.status == CommunityMemberStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="User is already a member")
        if existing.status == CommunityMemberStatus.INVITED:
            return Message(message="User is already invited")
        if existing.status == CommunityMemberStatus.PENDING:
            raise HTTPException(
                status_code=400, detail="User has a pending application"
            )

        # Update existing record (e.g. if REJECTED, BANNED or SUSPENDED we allow re-inviting to reset status)
        existing.status = CommunityMemberStatus.INVITED
        existing.invited_by = current_user.id
        existing.role = CommunityMemberRole.MEMBER
        session.add(existing)
    else:
        # Create invitation (represented as a CommunityMember with status INVITED)
        membership = CommunityMember(
            community_id=id,
            user_id=invite_in.friend_id,
            status=CommunityMemberStatus.INVITED,
            role=CommunityMemberRole.MEMBER,  # Default
            invited_by=current_user.id,
        )
        session.add(membership)

    session.commit()

    # Notify friend
    await notify_user(
        session=session,
        recipient_id=invite_in.friend_id,
        title="Community Invitation",
        message=f"{current_user.full_name or current_user.email} invited you to join {community.name}.",
        type=NotificationType.INFO,
        link=f"/communities/{id}",
    )

    return Message(message="Invitation sent")


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
        # Only accepted admins can remove other members
        membership = _get_accepted_membership(session, id, current_user.id)
        if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        # Last-admin guard for removal target
        if _is_last_admin(session, id, target_user_id):
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last admin. Promote another member first.",
            )
    else:
        # Last-admin guard for self-leave
        if _is_last_admin(session, id, current_user.id):
            raise HTTPException(
                status_code=400,
                detail="Cannot leave as the last admin. Promote another member first.",
            )

    leaving_user = session.get(User, target_user_id)
    leaving_name = (leaving_user.full_name or leaving_user.email) if leaving_user else str(target_user_id)
    _write_log(session, id, "MEMBER_LEFT", actor_name=leaving_name)
    crud.leave_community(session=session, community_id=id, user_id=target_user_id)
    return Message(message="Left community successfully")


@router.get("/{id}/members", response_model=UsersPublic)
def read_community_members(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=settings.MAX_PAGE_SIZE),
    status: CommunityMemberStatus | None = None,
) -> Any:
    """
    Get members of a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Get current user's membership
    my_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id, CommunityMember.user_id == current_user.id
    )
    my_membership = session.exec(my_membership_stmt).first()
    is_staff = (
        my_membership
        and my_membership.status == CommunityMemberStatus.ACCEPTED
        and my_membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    ) or community.created_by == current_user.id

    # Privacy check for closed communities
    if community.requires_approval and not current_user.is_superuser and not is_staff:
        if not my_membership or my_membership.status != CommunityMemberStatus.ACCEPTED:
            raise HTTPException(
                status_code=403,
                detail="This community is closed. You must be a member to view the member list.",
            )

    # Base statement
    base_stmt = (
        select(User, CommunityMember)
        .join(CommunityMember, User.id == CommunityMember.user_id)
        .where(CommunityMember.community_id == id)
    )

    # Filter by status if provided, otherwise default to ACCEPTED/INVITED for non-admins
    if status:
        if (
            status != CommunityMemberStatus.ACCEPTED
            and not is_staff
            and not current_user.is_superuser
        ):
            raise HTTPException(
                status_code=403, detail="Only staff can filter by non-accepted status"
            )
        base_stmt = base_stmt.where(CommunityMember.status == status)
    elif not is_staff and not current_user.is_superuser:
        # Non-staff see both accepted and invited to avoid double-invites
        base_stmt = base_stmt.where(
            CommunityMember.status.in_(
                [CommunityMemberStatus.ACCEPTED, CommunityMemberStatus.INVITED]
            )
        )

    count = session.exec(select(func.count()).select_from(base_stmt.subquery())).one()
    results = session.exec(base_stmt.offset(skip).limit(limit)).all()

    # Get friendship statuses for members
    member_ids = [u.id for u, m in results]
    friendship_map = {}
    if member_ids:
        friendships = session.exec(
            select(Friendship).where(
                Friendship.user_id == current_user.id,
                Friendship.friend_id.in_(member_ids),
            )
        ).all()
        friendship_map = {f.friend_id: f.status for f in friendships}

    # Reveal details if Closed community AND current user is an accepted member (or superuser)
    reveal_details = community.requires_approval and (
        current_user.is_superuser
        or (my_membership and my_membership.status == CommunityMemberStatus.ACCEPTED)
    )

    users_with_meta = []
    for user, membership in results:
        f_status = friendship_map.get(user.id)
        is_friend = f_status == FriendshipStatus.ACCEPTED

        user_public = filter_user_privacy(
            user,
            current_user.id,
            is_admin=current_user.is_superuser or reveal_details,
            is_friend=is_friend,
        )
        user_public.community_role = membership.role
        user_public.community_status = membership.status
        user_public.friendship_status = f_status

        # Restrict data if not friends and not revealed
        if (
            not current_user.is_superuser
            and not reveal_details
            and user.id != current_user.id
            and not is_friend
        ):
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
        CommunityMember.community_id == id, CommunityMember.user_id == current_user.id
    )
    my_membership = session.exec(my_membership_stmt).first()

    # Permission check: must be an ACCEPTED admin or moderator
    is_admin = (
        my_membership
        and my_membership.status == CommunityMemberStatus.ACCEPTED
        and my_membership.role == CommunityMemberRole.ADMIN
    ) or current_user.is_superuser
    is_moderator = (
        my_membership
        and my_membership.status == CommunityMemberStatus.ACCEPTED
        and my_membership.role == CommunityMemberRole.MODERATOR
    )

    if not is_admin and not is_moderator:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Target member
    target_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id, CommunityMember.user_id == user_id
    )
    target_membership = session.exec(target_membership_stmt).first()
    if not target_membership:
        raise HTTPException(
            status_code=404, detail="Member not found in this community"
        )

    # Moderator restrictions: can only manage non-staff
    if is_moderator and not is_admin:
        # Cannot promote to ADMIN or MODERATOR
        if member_in.role and member_in.role in [
            CommunityMemberRole.ADMIN,
            CommunityMemberRole.MODERATOR,
        ]:
            raise HTTPException(
                status_code=403,
                detail="Moderators cannot promote members to staff roles",
            )
        # Cannot modify existing staff
        if target_membership.role in [
            CommunityMemberRole.ADMIN,
            CommunityMemberRole.MODERATOR,
        ]:
            raise HTTPException(
                status_code=403, detail="Moderators cannot modify staff members"
            )

    # Admin demotion requires majority vote — block direct demotion
    if (
        target_membership.role == CommunityMemberRole.ADMIN
        and member_in.role in [CommunityMemberRole.MEMBER, CommunityMemberRole.MODERATOR]
    ):
        raise HTTPException(
            status_code=400,
            detail="Admin demotion requires a majority vote. Use the demotion vote endpoint.",
        )

    # Last-admin guard: cannot demote/remove the last admin
    if member_in.role and member_in.role != CommunityMemberRole.ADMIN:
        if _is_last_admin(session, id, user_id):
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last admin. Promote another member first.",
            )

    # When lifting ban/suspend: moderator cannot undo an admin's action
    if member_in.status == CommunityMemberStatus.ACCEPTED and target_membership.status in [
        CommunityMemberStatus.BANNED,
        CommunityMemberStatus.SUSPENDED,
    ]:
        if target_membership.action_by_role == "ADMIN" and not is_admin:
            raise HTTPException(
                status_code=403,
                detail="Cannot undo an action taken by an admin.",
            )

    # Determine action_by_role for ban/suspend
    new_action_by_role: str | None = target_membership.action_by_role
    new_action_reason: str | None = target_membership.action_reason
    new_suspension_until = target_membership.suspension_until

    if member_in.status in [CommunityMemberStatus.BANNED, CommunityMemberStatus.SUSPENDED]:
        new_action_by_role = "ADMIN" if is_admin else "MODERATOR"
        new_action_reason = member_in.action_reason
        if member_in.status == CommunityMemberStatus.SUSPENDED:
            new_suspension_until = member_in.suspension_until
        else:
            new_suspension_until = None
    elif member_in.status == CommunityMemberStatus.ACCEPTED:
        new_action_by_role = None
        new_action_reason = None
        new_suspension_until = None

    updated_member = crud.update_community_member(
        session=session,
        community_id=id,
        user_id=user_id,
        role=member_in.role,
        status=member_in.status,
    )

    if not updated_member:
        raise HTTPException(
            status_code=404, detail="Member not found in this community"
        )

    # Persist governance fields
    updated_member.action_by_role = new_action_by_role
    updated_member.action_reason = new_action_reason
    updated_member.suspension_until = new_suspension_until
    session.add(updated_member)

    # Log the governance action
    actor_label = current_user.full_name or current_user.email
    target_user_obj = session.get(User, user_id)
    target_label = (target_user_obj.full_name or target_user_obj.email) if target_user_obj else str(user_id)
    prev_status = target_membership.status
    if member_in.status == CommunityMemberStatus.ACCEPTED and prev_status == CommunityMemberStatus.BANNED:
        _write_log(session, id, "MEMBER_UNBANNED", actor_name=actor_label, target_name=target_label)
    elif member_in.status == CommunityMemberStatus.ACCEPTED and prev_status == CommunityMemberStatus.SUSPENDED:
        _write_log(session, id, "MEMBER_UNSUSPENDED", actor_name=actor_label, target_name=target_label)
    elif member_in.status == CommunityMemberStatus.ACCEPTED:
        _write_log(session, id, "MEMBER_JOINED", actor_name=target_label)
    elif member_in.status == CommunityMemberStatus.BANNED:
        _write_log(session, id, "MEMBER_BANNED", actor_name=actor_label, target_name=target_label, extra=member_in.action_reason)
    elif member_in.status == CommunityMemberStatus.SUSPENDED:
        until_extra = f"until {member_in.suspension_until.strftime('%Y-%m-%d')}" if member_in.suspension_until else None
        _write_log(session, id, "MEMBER_SUSPENDED", actor_name=actor_label, target_name=target_label, extra=until_extra)
    elif member_in.role and member_in.role > target_membership.role:
        _write_log(session, id, "MEMBER_PROMOTED", actor_name=actor_label, target_name=target_label, extra=str(member_in.role.value))
    elif member_in.role and member_in.role < target_membership.role:
        _write_log(session, id, "MEMBER_DEMOTED", actor_name=actor_label, target_name=target_label, extra=str(member_in.role.value))

    session.commit()
    session.refresh(updated_member)

    # Notifications
    if member_in.status == CommunityMemberStatus.ACCEPTED and prev_status in [
        CommunityMemberStatus.BANNED,
        CommunityMemberStatus.SUSPENDED,
    ]:
        action_word = "ban" if prev_status == CommunityMemberStatus.BANNED else "suspension"
        await notify_user(
            session=session,
            recipient_id=user_id,
            title=f"{'Ban' if prev_status == CommunityMemberStatus.BANNED else 'Suspension'} Lifted",
            message=f"Your {action_word} in {community.name} has been lifted.",
            type=NotificationType.SUCCESS,
            link=f"/communities/{id}",
        )
    elif member_in.status == CommunityMemberStatus.ACCEPTED:
        await notify_user(
            session=session,
            recipient_id=user_id,
            title="Community Request Accepted",
            message=f"You are now a member of {community.name}.",
            type=NotificationType.SUCCESS,
            link=f"/communities/{id}",
        )
    elif member_in.status == CommunityMemberStatus.BANNED:
        await notify_user(
            session=session,
            recipient_id=user_id,
            title="Banned from Community",
            message=f"You have been banned from {community.name}.",
            type=NotificationType.WARNING,
            link=None,
        )
    elif member_in.status == CommunityMemberStatus.SUSPENDED:
        until_str = (
            member_in.suspension_until.strftime("%Y-%m-%d")
            if member_in.suspension_until
            else "an unspecified date"
        )
        await notify_user(
            session=session,
            recipient_id=user_id,
            title="Suspended from Community",
            message=f"You have been suspended from {community.name} until {until_str}.",
            type=NotificationType.WARNING,
            link=None,
        )
    elif member_in.role:
        await notify_user(
            session=session,
            recipient_id=user_id,
            title="Community Role Updated",
            message=f"Your role in {community.name} has been updated to {member_in.role}.",
            type=NotificationType.INFO,
            link=f"/communities/{id}",
        )

    user = session.get(User, user_id)
    user_public = filter_user_privacy(
        user, current_user.id, is_admin=current_user.is_superuser
    )
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


@router.post("/{id}/resign", response_model=Message)
async def resign_from_community(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Resign from a staff role (ADMIN or MODERATOR) and become a regular MEMBER.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not membership or membership.role == CommunityMemberRole.MEMBER:
        raise HTTPException(status_code=403, detail="Only staff can resign a position")

    if membership.role == CommunityMemberRole.ADMIN and _is_last_admin(session, id, current_user.id):
        raise HTTPException(
            status_code=400,
            detail="Cannot resign as the last admin. Promote another member first.",
        )

    old_role = membership.role
    membership.role = CommunityMemberRole.MEMBER
    session.add(membership)
    _write_log(
        session, id, "MEMBER_RESIGNED",
        actor_name=current_user.full_name or current_user.email,
        extra=str(old_role.value),
    )
    session.commit()

    # Notify all community admins
    admins = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
    ).all()
    name = current_user.full_name or current_user.email
    for admin in admins:
        await notify_user(
            session=session,
            recipient_id=admin.user_id,
            title="Staff Resignation",
            message=f"{name} has resigned from their {old_role} position in {community.name}.",
            type=NotificationType.INFO,
            link=f"/communities/{id}?tab=settings",
        )

    return Message(message="Resigned successfully")


@router.get("/{id}/disband-vote", response_model=CommunityDisbandVoteStatus)
def get_disband_vote(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Get the current disband vote status (admin only).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can view disband votes")

    # All accepted admins
    all_admins = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
    ).all()
    all_admin_ids = {m.user_id for m in all_admins}

    # Who voted YES
    votes = session.exec(
        select(CommunityDisbandVote).where(CommunityDisbandVote.community_id == id)
    ).all()
    voted_ids = [v.voter_id for v in votes]
    pending_ids = list(all_admin_ids - set(voted_ids))

    return CommunityDisbandVoteStatus(
        voted_ids=voted_ids,
        pending_ids=pending_ids,
        total_admins=len(all_admin_ids),
    )


@router.post("/{id}/disband-vote", response_model=CommunityDisbandVoteStatus | Message)
async def cast_disband_vote(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    vote: bool,
) -> Any:
    """
    Cast a vote to disband the community (admin only).
    vote=True  → add/keep YES vote
    vote=False → cancel the motion (delete all votes)
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can vote to disband")

    if not vote:
        # Cancel the motion — delete all votes
        votes = session.exec(
            select(CommunityDisbandVote).where(CommunityDisbandVote.community_id == id)
        ).all()
        for v in votes:
            session.delete(v)
        session.commit()

        # Notify all admins
        all_admins = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                CommunityMember.role == CommunityMemberRole.ADMIN,
            )
        ).all()
        name = current_user.full_name or current_user.email
        for admin in all_admins:
            if admin.user_id != current_user.id:
                await notify_user(
                    session=session,
                    recipient_id=admin.user_id,
                    title="Disband Motion Cancelled",
                    message=f"The disband motion for {community.name} was cancelled by {name}.",
                    type=NotificationType.INFO,
                    link=f"/communities/{id}?tab=settings",
                )
        return Message(message="Disband vote cancelled")

    # vote=True: upsert this admin's YES vote
    existing_vote = session.exec(
        select(CommunityDisbandVote).where(
            CommunityDisbandVote.community_id == id,
            CommunityDisbandVote.voter_id == current_user.id,
        )
    ).first()
    if not existing_vote:
        new_vote = CommunityDisbandVote(community_id=id, voter_id=current_user.id)
        session.add(new_vote)
        session.commit()

    # Count
    all_admins = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
    ).all()
    all_admin_ids = {m.user_id for m in all_admins}
    total_admins = len(all_admin_ids)

    all_votes = session.exec(
        select(CommunityDisbandVote).where(CommunityDisbandVote.community_id == id)
    ).all()
    voted_ids = [v.voter_id for v in all_votes]
    yes_count = len(voted_ids)

    if yes_count >= total_admins:
        # Unanimous — disband
        # Notify all members first
        all_members = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
        ).all()
        for member in all_members:
            await notify_user(
                session=session,
                recipient_id=member.user_id,
                title="Community Disbanded",
                message=f"The community '{community.name}' has been disbanded by unanimous admin vote.",
                type=NotificationType.WARNING,
                link="/communities",
            )
        session.delete(community)
        session.commit()
        delete_community_from_search(id)
        return Message(message="Community disbanded successfully")

    # Not yet unanimous — notify admins who haven't voted
    pending_ids = list(all_admin_ids - set(voted_ids))
    for admin_id in pending_ids:
        await notify_user(
            session=session,
            recipient_id=admin_id,
            title="Disband Vote in Progress",
            message=f"A disband vote is in progress for {community.name} — {yes_count}/{total_admins} admins have voted.",
            type=NotificationType.WARNING,
            link=f"/communities/{id}?tab=settings",
        )

    return CommunityDisbandVoteStatus(
        voted_ids=voted_ids,
        pending_ids=pending_ids,
        total_admins=total_admins,
    )


@router.get(
    "/{id}/members/{user_id}/demotion-vote",
    response_model=CommunityDemotionVoteStatus,
)
def get_demotion_vote(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    user_id: uuid.UUID,
) -> Any:
    """
    Get current demotion vote status for a target admin (admin only).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can view demotion votes")

    # Count eligible voters (all accepted admins except target)
    eligible_voters = session.exec(
        select(func.count()).where(
            CommunityMember.community_id == id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
            CommunityMember.user_id != user_id,
        )
    ).one()

    votes = session.exec(
        select(CommunityDemotionVote).where(
            CommunityDemotionVote.community_id == id,
            CommunityDemotionVote.target_user_id == user_id,
        )
    ).all()
    voted_ids = [v.voter_id for v in votes]
    needed = (eligible_voters // 2) + 1  # strict majority

    return CommunityDemotionVoteStatus(
        target_user_id=user_id,
        yes_votes=len(voted_ids),
        needed=needed,
        voted_ids=voted_ids,
    )


@router.post(
    "/{id}/members/{user_id}/demotion-vote",
    response_model=CommunityDemotionVoteStatus | Message,
)
async def cast_demotion_vote(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    user_id: uuid.UUID,
    vote: bool,
) -> Any:
    """
    Cast a vote to demote a target admin to member.
    vote=True  → add YES vote
    vote=False → cancel the motion for this target
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can vote on demotion")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot vote to demote yourself")

    target = session.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == id,
            CommunityMember.user_id == user_id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
        )
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target is not an accepted admin in this community")

    if not vote:
        # Cancel motion for this target
        votes = session.exec(
            select(CommunityDemotionVote).where(
                CommunityDemotionVote.community_id == id,
                CommunityDemotionVote.target_user_id == user_id,
            )
        ).all()
        for v in votes:
            session.delete(v)
        session.commit()

        target_user = session.get(User, user_id)
        target_name = (target_user.full_name or target_user.email) if target_user else str(user_id)

        all_admins = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                CommunityMember.role == CommunityMemberRole.ADMIN,
            )
        ).all()
        for admin in all_admins:
            if admin.user_id != current_user.id:
                await notify_user(
                    session=session,
                    recipient_id=admin.user_id,
                    title="Demotion Motion Cancelled",
                    message=f"The demotion motion for {target_name} in {community.name} was cancelled.",
                    type=NotificationType.INFO,
                    link=f"/communities/{id}?tab=settings",
                )
        return Message(message="Demotion vote cancelled")

    # vote=True: upsert
    existing_votes_count = session.exec(
        select(func.count()).where(
            CommunityDemotionVote.community_id == id,
            CommunityDemotionVote.target_user_id == user_id,
        )
    ).one()
    is_first_vote = existing_votes_count == 0

    existing_my_vote = session.exec(
        select(CommunityDemotionVote).where(
            CommunityDemotionVote.community_id == id,
            CommunityDemotionVote.target_user_id == user_id,
            CommunityDemotionVote.voter_id == current_user.id,
        )
    ).first()
    if not existing_my_vote:
        new_vote = CommunityDemotionVote(
            community_id=id,
            target_user_id=user_id,
            voter_id=current_user.id,
        )
        session.add(new_vote)
        session.commit()

    # If first vote, notify target
    if is_first_vote:
        await notify_user(
            session=session,
            recipient_id=user_id,
            title="Demotion Vote Initiated",
            message=f"A demotion vote has been initiated against you in {community.name}.",
            type=NotificationType.WARNING,
            link=f"/communities/{id}",
        )

    # Count eligible voters (all accepted admins except target)
    eligible_voters = session.exec(
        select(func.count()).where(
            CommunityMember.community_id == id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            CommunityMember.role == CommunityMemberRole.ADMIN,
            CommunityMember.user_id != user_id,
        )
    ).one()

    all_votes = session.exec(
        select(CommunityDemotionVote).where(
            CommunityDemotionVote.community_id == id,
            CommunityDemotionVote.target_user_id == user_id,
        )
    ).all()
    voted_ids = [v.voter_id for v in all_votes]
    yes_count = len(voted_ids)
    needed = (eligible_voters // 2) + 1

    if yes_count > eligible_voters / 2:
        # Majority reached — demote
        target.role = CommunityMemberRole.MEMBER
        session.add(target)

        # Delete all votes for (community, target)
        for v in all_votes:
            session.delete(v)

        target_user = session.get(User, user_id)
        target_name = (target_user.full_name or target_user.email) if target_user else str(user_id)
        _write_log(session, id, "MEMBER_DEMOTED", actor_name="vote", target_name=target_name, extra="to MEMBER")
        session.commit()

        target_user = session.get(User, user_id)
        target_name = (target_user.full_name or target_user.email) if target_user else str(user_id)

        # Notify target
        await notify_user(
            session=session,
            recipient_id=user_id,
            title="Demoted",
            message=f"You have been demoted to Member in {community.name} by majority admin vote.",
            type=NotificationType.WARNING,
            link=f"/communities/{id}",
        )
        # Notify all admins
        all_admins = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                CommunityMember.role == CommunityMemberRole.ADMIN,
            )
        ).all()
        for admin in all_admins:
            await notify_user(
                session=session,
                recipient_id=admin.user_id,
                title="Demotion Passed",
                message=f"Demotion of {target_name} to Member in {community.name} passed.",
                type=NotificationType.INFO,
                link=f"/communities/{id}?tab=settings",
            )
        return Message(message=f"{target_name} has been demoted to Member")

    return CommunityDemotionVoteStatus(
        target_user_id=user_id,
        yes_votes=yes_count,
        needed=needed,
        voted_ids=voted_ids,
    )


@router.post("/{id}/favorite", response_model=Message)
def toggle_favorite_community(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Toggle favorite status for a community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    existing = session.exec(
        select(CommunityFavorite).where(
            CommunityFavorite.community_id == id,
            CommunityFavorite.user_id == current_user.id,
        )
    ).first()

    if existing:
        session.delete(existing)
        session.commit()
        return Message(message="Removed from favorites")
    else:
        fav = CommunityFavorite(community_id=id, user_id=current_user.id)
        session.add(fav)
        session.commit()
        return Message(message="Added to favorites")


@router.get("/{id}/item-facets")
def read_community_item_facets(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    group_by: str = "category",  # category, genre, author, subject, ownership
    q: str | None = Query(default=None, max_length=200),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=settings.MAX_PAGE_SIZE),
) -> Any:
    """
    Get unique values and counts for a specific facet belonging to a community.
    Uses Meilisearch for fuzzy search when q is provided.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Access check
    statement = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    membership = session.exec(statement).first()
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to view community items")

    # Search filtering logic
    search_item_ids = None
    if q:
        from app.search import client as meili_client
        try:
            index = meili_client.index("items")
            search_params = {
                "filter": f'owner_id = "{id}" OR pooled_in = "{id}"',
                "limit": 1000,
                "attributesToRetrieve": ["id"]
            }
            search_results = index.search(q, search_params)
            search_item_ids = [uuid.UUID(hit["id"]) for hit in search_results["hits"]]
        except Exception:
            logger.warning("Meilisearch fuzzy facet search failed in community, falling back to SQL", exc_info=True)

    # Filter for items in this community (owned or pooled)
    comm_item_ids_sub = select(CommunityItem.item_id).where(CommunityItem.community_id == id)
    base_filter = or_(Item.owner_id == id, Item.id.in_(comm_item_ids_sub))

    results = []
    total_count = 0
    next_cursor: str | None = None

    def apply_q_filter(stmt, query_str):
        pattern = f"%{query_str}%"
        return stmt.where(
            or_(
                Item.title.ilike(pattern),
                Item.author.ilike(pattern),
                Item.category.ilike(pattern),
                Item.genre.ilike(pattern),
                Item.subject.ilike(pattern),
                Item.description.ilike(pattern)
            )
        )

    def build_search_condition(stmt):
        if search_item_ids: # Meilisearch hits found
            return stmt.where(or_(Item.id.in_(search_item_ids), apply_q_filter(select(Item.id), q).exists()))
        elif q: # Meilisearch failed or returned nothing
            return apply_q_filter(stmt, q)
        return stmt

    from sqlalchemy import case as sa_case

    if group_by == "author":
        core_stmt = select(
            Item.author, Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(base_filter)
        core_stmt = build_search_condition(core_stmt)
        group_stmt = core_stmt.group_by(Item.author, Item.item_type)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()
        subq = group_stmt.subquery("fq")
        ordered_stmt = select(subq).order_by(subq.c.author.asc().nulls_last(), subq.c.item_type.asc())
        if cursor:
            ordered_stmt = ordered_stmt.where(or_(subq.c.author > cursor, subq.c.author.is_(None)))
        rows = session.execute(ordered_stmt.limit(limit)).all()
        for author, i_type, count, imgs in rows:
            results.append({"name": author or "Others", "item_type": i_type, "count": count, "sample_images": [img for img in (imgs or []) if img][:5]})

    elif group_by == "category":
        core_stmt = select(
            Item.category.label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(base_filter)
        core_stmt = build_search_condition(core_stmt)
        group_stmt = core_stmt.group_by("name", Item.item_type)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()
        subq = group_stmt.subquery("fq")
        ordered_stmt = select(subq).order_by(subq.c.name.asc().nulls_last(), subq.c.item_type.asc())
        if cursor:
            ordered_stmt = ordered_stmt.where(or_(subq.c.name > cursor, subq.c.name.is_(None)))
        rows = session.execute(ordered_stmt.limit(limit)).all()
        for name, i_type, count, imgs in rows:
            results.append({"name": name or "Others", "item_type": i_type, "count": count, "sample_images": [img for img in (imgs or []) if img][:5]})

    elif group_by == "genre":
        core_stmt = select(
            Item.genre.label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(base_filter)
        core_stmt = build_search_condition(core_stmt)
        group_stmt = core_stmt.group_by("name", Item.item_type)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()
        subq = group_stmt.subquery("fq")
        ordered_stmt = select(subq).order_by(subq.c.name.asc().nulls_last(), subq.c.item_type.asc())
        if cursor:
            ordered_stmt = ordered_stmt.where(or_(subq.c.name > cursor, subq.c.name.is_(None)))
        rows = session.execute(ordered_stmt.limit(limit)).all()
        for name, i_type, count, imgs in rows:
            results.append({"name": name or "Others", "item_type": i_type, "count": count, "sample_images": [img for img in (imgs or []) if img][:5]})

    elif group_by == "ownership":
        core_stmt = select(
            Item.owner_id, User.full_name, User.email, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).outerjoin(User, User.id == Item.owner_id).where(base_filter)

        if q:
            pattern = f"%{q}%"
            if search_item_ids:
                core_stmt = core_stmt.where(or_(
                    Item.id.in_(search_item_ids),
                    User.full_name.ilike(pattern),
                    User.email.ilike(pattern),
                    Item.title.ilike(pattern),
                    Item.author.ilike(pattern)
                ))
            else:
                core_stmt = core_stmt.where(or_(
                    User.full_name.ilike(pattern),
                    User.email.ilike(pattern),
                    Item.title.ilike(pattern),
                    Item.author.ilike(pattern)
                ))

        group_stmt = core_stmt.group_by(Item.owner_id, User.full_name, User.email)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()
        subq = group_stmt.subquery("fq")
        ordered_stmt = select(subq).order_by(subq.c.full_name.asc().nulls_last())
        if cursor:
            ordered_stmt = ordered_stmt.where(or_(subq.c.full_name > cursor, subq.c.full_name.is_(None)))
        rows = session.execute(ordered_stmt.limit(limit)).all()
        if len(rows) == limit and rows:
            last_fn = rows[-1][1]  # full_name column
            if last_fn:
                next_cursor = last_fn
        for owner_id_val, full_name, email, count, imgs in rows:
            display_name = "Community Library" if str(owner_id_val) == str(id) else (full_name or email or "Unknown Member")
            results.append({"name": display_name, "owner_id": str(owner_id_val), "count": count, "sample_images": [img for img in (imgs or []) if img][:5]})

    elif group_by == "subject":
        tag_expr = func.initcap(func.btrim(func.unnest(func.string_to_array(Item.subject, ","))))
        tags_core = select(
            tag_expr.label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(base_filter).where(Item.subject.is_not(None)).where(Item.subject != "")
        tags_core = build_search_condition(tags_core)
        tags_group = tags_core.group_by("name", Item.item_type)

        others_core = select(
            cast("Others", String).label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(base_filter).where(or_(Item.subject.is_(None), Item.subject == ""))
        others_core = build_search_condition(others_core)
        others_group = others_core.group_by(Item.item_type)

        full_stmt = tags_group if q and "others" not in q.lower() else tags_group.union_all(others_group)
        try:
            total_count = session.exec(select(func.count()).select_from(full_stmt.subquery())).one()
            subq = full_stmt.subquery()
            # "Others" always last regardless of alphabetical position
            ordered_stmt = select(subq).order_by(
                sa_case((subq.c.name == "Others", 1), else_=0).asc(),
                subq.c.item_type.asc(),
                subq.c.name.asc(),
            )
            if cursor:
                ordered_stmt = ordered_stmt.where(
                    or_(subq.c.name > cursor, subq.c.name == "Others")
                )
            rows = session.execute(ordered_stmt.limit(limit)).all()
            for row in rows:
                results.append({"name": row[0], "item_type": row[1], "count": row[2], "sample_images": [img for img in (row[3] or []) if img][:5]})
        except Exception:
            pass

    # For non-ownership branches, compute next_cursor from results
    if group_by != "ownership":
        if len(results) == limit and results:
            last_name = results[-1]["name"]
            if last_name and last_name != "Others":
                next_cursor = last_name

    return {"data": results, "count": total_count, "next_cursor": next_cursor}


@router.get("/{id}/items", response_model=ItemsPublic)
def read_community_items(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=settings.MAX_PAGE_SIZE),
    cursor: str | None = Query(default=None),
    sort_by: str = "created_at",
    sort_order: str = "desc",
    category: str | None = None,
    genre: str | None = None,
    subject: str | None = None,
    author: str | None = None,
    item_type: str | None = None,
    owner_filter: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=200),
) -> Any:
    """
    Get items belonging to a community.
    Includes both pooled items (via CommunityItem) and exclusively community-owned items.
    Supports searching, sorting, and filtering via Meilisearch.
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
        raise HTTPException(
            status_code=403, detail="Must be a member to view community items"
        )

    # Exclude items with DEFAULTED loans
    defaulted_item_ids = select(Loan.item_id).where(Loan.status == LoanStatus.DEFAULTED)

    from app.search import client as meili_client

    meili_success = False

    # Only use Meilisearch if q is provided, otherwise SQL is faster
    if q:
        try:
            index = meili_client.index("items")
            # Filter: item belongs to community (owned or pooled), exclude private/lost
            filters = [f'(owner_id = "{id}" OR pooled_in = "{id}")', "is_private = false", "is_lost = false"]

            if category and category != "Others":
                filters.append(f'category = "{category}"')
            if genre and genre != "Others":
                filters.append(f'genre = "{genre}"')
            if subject:
                filters.append(f'subject = "{subject}"')
            if author:
                filters.append(f'author = "{author}"')
            if item_type:
                filters.append(f'item_type = "{item_type}"')

            search_params = {
                "limit": limit,
                "offset": skip,
                "filter": " AND ".join(filters),
                "sort": [f"{sort_by}:{sort_order}"],
            }

            search_results = index.search(q, search_params)
            item_ids = [uuid.UUID(hit["id"]) for hit in search_results["hits"]]
            count = (
                search_results.get("totalHits")
                or search_results.get("nbHits")
                or len(item_ids)
            )
            facets = search_results.get("facetDistribution")
            facet_stats = search_results.get("facetStats")

            if not item_ids:
                meili_success = False
            else:
                # Fetch from DB preserving order
                db_items = session.exec(
                    select(Item)
                    .where(Item.id.in_(item_ids))
                    .where(Item.id.not_in(defaulted_item_ids))
                ).all()
                item_map = {item.id: item for item in db_items}
                items = [item_map[iid] for iid in item_ids if iid in item_map]
                meili_success = True
        except Exception:
            meili_success = False

    if not meili_success:
        facets = {}
        facet_stats = {}
        # Fallback to SQL
        if q:
            q_filter = or_(
                col(Item.title).ilike(f"%{q}%"),
                col(Item.author).ilike(f"%{q}%"),
                col(Item.category).ilike(f"%{q}%"),
                col(Item.genre).ilike(f"%{q}%"),
                col(Item.subject).ilike(f"%{q}%"),
                col(Item.description).ilike(f"%{q}%"),
            )
            statement = (
                select(Item)
                .where(
                    q_filter,
                    or_(
                        Item.owner_id == id,
                        select(CommunityItem)
                        .where(
                            CommunityItem.item_id == Item.id,
                            CommunityItem.community_id == id,
                        )
                        .exists(),
                    ),
                )
                .where(Item.id.not_in(defaulted_item_ids))
                .where(Item.is_private == False)  # noqa: E712
                .where(Item.is_lost == False)  # noqa: E712
            )
        else:
            statement = (
                select(Item)
                .where(
                    or_(
                        Item.owner_id == id,
                        select(CommunityItem)
                        .where(
                            CommunityItem.item_id == Item.id,
                            CommunityItem.community_id == id,
                        )
                        .exists(),
                    )
                )
                .where(Item.id.not_in(defaulted_item_ids))
                .where(Item.is_private == False)  # noqa: E712
                .where(Item.is_lost == False)  # noqa: E712
            )

        # Basic SQL filtering
        if category:
            if category == "Others":
                statement = statement.where(
                    or_(Item.category.is_(None), Item.category == "")
                )
            else:
                statement = statement.where(Item.category == category)
        if genre:
            if genre == "Others":
                statement = statement.where(
                    or_(Item.genre.is_(None), Item.genre == "")
                )
            else:
                statement = statement.where(Item.genre == genre)
        if subject:
            if subject == "Others":
                statement = statement.where(
                    or_(Item.subject.is_(None), Item.subject == "")
                )
            else:
                # Precise match using PostgreSQL regex (case-insensitive)
                pattern = f"(^|,\\s*){subject}($|,)"
                statement = statement.where(text("item.subject ~* :pattern")).params(pattern=pattern)
        if author:
            statement = statement.where(col(Item.author).ilike(f"%{author}%"))
        if owner_filter:
            statement = statement.where(Item.owner_id == owner_filter)
        if item_type:
            statement = statement.where(Item.item_type == item_type)

        # Apply sorting
        sort_column = Item.created_at
        if sort_by == "title":
            sort_column = Item.title
        elif sort_by == "author":
            sort_column = Item.author

        # Apply keyset pagination when sort_by is created_at and cursor is provided
        use_keyset = sort_by == "created_at" and cursor
        cursor_data = decode_item_cursor(cursor) if use_keyset else None
        if cursor_data:
            cursor_ts, cursor_id = cursor_data
            from sqlalchemy import and_ as sa_and
            if sort_order == "desc":
                statement = statement.where(
                    or_(Item.created_at < cursor_ts, sa_and(Item.created_at == cursor_ts, Item.id < cursor_id))
                )
            else:
                statement = statement.where(
                    or_(Item.created_at > cursor_ts, sa_and(Item.created_at == cursor_ts, Item.id > cursor_id))
                )

        if sort_order == "desc":
            statement = statement.order_by(sort_column.desc(), Item.id.desc())
        else:
            statement = statement.order_by(sort_column.asc(), Item.id.asc())

        count_stmt = select(func.count()).select_from(statement.subquery())
        count = session.exec(count_stmt).one()
        if cursor_data:
            items = session.exec(statement.limit(limit)).all()
        else:
            items = session.exec(statement.offset(skip).limit(limit)).all()

    # Get all CommunityItem meta for pooled items in this batch
    item_ids = [item.id for item in items]
    comm_items = session.exec(
        select(CommunityItem).where(
            CommunityItem.community_id == id, CommunityItem.item_id.in_(item_ids)
        )
    ).all()
    comm_item_map = {ci.item_id: ci for ci in comm_items}

    # Bulk fetch WorkMetadata
    work_keys = {
        (item.author, item.title) for item in items if item.author and item.title
    }
    work_meta_map = {}
    if work_keys:
        from sqlalchemy import tuple_

        work_metas = session.exec(
            select(WorkMetadata).where(
                tuple_(WorkMetadata.author, WorkMetadata.title).in_(list(work_keys))
            )
        ).all()
        for wm in work_metas:
            work_meta_map[(wm.author, wm.title)] = wm

    # Bulk fetch active loans for availability
    active_loan_item_counts = dict(
        session.exec(
            select(Loan.item_id, func.count(Loan.id)).where(
                Loan.item_id.in_(item_ids),
                Loan.status.in_(
                    [
                        LoanStatus.ACTIVE,
                        LoanStatus.ACCEPTED,
                        LoanStatus.RETURN_PENDING,
                        LoanStatus.EXTENSION_PENDING,
                        LoanStatus.DEFAULTED,
                    ]
                ),
            ).group_by(Loan.item_id)
        ).all()
    )

    items_public = []
    for item in items:
        is_avail = active_loan_item_counts.get(item.id, 0) < item.count

        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(
                item.user_owner, current_user.id, is_admin=current_user.is_superuser
            )
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
            isbn=item.isbn,
            category=item.category,
            genre=item.genre,
            subject=item.subject,
            info=item.info,
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail,
            work_metadata=work_meta_map.get((item.author, item.title))
            if item.author
            else None,
            had_possession=item.owner_id == current_user.id,  # Simplified
        )

        # Add pooling metadata if applicable
        comm_item = comm_item_map.get(item.id)
        if comm_item:
            item_pub.added_by_id = comm_item.added_by
            item_pub.is_donation_pending = comm_item.is_donation_pending

        items_public.append(item_pub)

    next_cursor_val = (
        encode_item_cursor(items[-1])
        if items and sort_by == "created_at" and len(items) == limit
        else None
    )
    return ItemsPublic(
        data=items_public, count=count, facets=facets, facet_stats=facet_stats, next_cursor=next_cursor_val
    )


@router.post("/{id}/items/{item_id}", response_model=Message)
async def add_item_to_community(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
    item_id: uuid.UUID,
) -> Any:
    """
    Add an item to a community pool (Any member).
    If the community restricts item types, creates a pending request instead.
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
        raise HTTPException(
            status_code=403, detail="Must be a member to add items to community"
        )

    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check if current user is the owner
    if not item.user_owner or item.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Only the owner can add this item to a pool"
        )

    # Check if already added
    statement = select(CommunityItem).where(
        CommunityItem.community_id == id, CommunityItem.item_id == item_id
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(status_code=400, detail="Item already in community pool")

    # Check allowed item types restriction
    if community.allowed_item_types is not None:
        if item.item_type not in community.allowed_item_types:
            # Check for duplicate pending request
            existing_req = session.exec(
                select(CommunityItemRequest).where(
                    CommunityItemRequest.community_id == id,
                    CommunityItemRequest.item_id == item_id,
                    CommunityItemRequest.status == "PENDING",
                )
            ).first()
            if existing_req:
                raise HTTPException(status_code=400, detail="A request for this item is already pending")

            req = CommunityItemRequest(
                community_id=id,
                item_id=item_id,
                requested_by=current_user.id,
                item_type=item.item_type,
            )
            session.add(req)
            session.commit()

            # Notify all admins
            admin_statement = (
                select(CommunityMember)
                .where(
                    CommunityMember.community_id == id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
            )
            admin_members = session.exec(admin_statement).all()
            requester_name = current_user.full_name or current_user.email
            for admin_member in admin_members:
                await notify_user(
                    session=session,
                    recipient_id=admin_member.user_id,
                    title="Item Pool Request",
                    message=f"{requester_name} wants to pool a '{item.item_type}' item: '{item.title}'",
                    type=NotificationType.INFO,
                    link=f"/communities/{id}?tab=items",
                )
            return Message(message="requested")

    comm_item = CommunityItem(
        community_id=id, item_id=item_id, added_by=current_user.id
    )
    session.add(comm_item)
    _write_log(
        session, id, "BOOK_ADDED",
        actor_name=current_user.full_name or current_user.email,
        extra=item.title,
    )

    session.commit()

    # Update collection index for owner and pooled communities in background
    invalidate_item_caches(session, item_id, background_tasks)

    from app.search import sync_item_to_search

    session.refresh(item)
    sync_item_to_search(item)
    return Message(message="Item added to community pool")


@router.get("/{id}/item-requests", response_model=CommunityItemRequestsPublic)
def get_community_item_requests(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Get pending item pool requests for a community (Admin only).
    """
    community_admin = _get_accepted_membership(session, id, current_user.id)
    if not (community_admin and community_admin.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can view item requests")

    statement = (
        select(CommunityItemRequest, Item, User)
        .join(Item, CommunityItemRequest.item_id == Item.id)
        .join(User, CommunityItemRequest.requested_by == User.id)
        .where(
            CommunityItemRequest.community_id == id,
            CommunityItemRequest.status == "PENDING",
        )
        .order_by(CommunityItemRequest.created_at)
    )
    results = session.exec(statement).all()

    data = [
        CommunityItemRequestPublic(
            id=req.id,
            community_id=req.community_id,
            item_id=req.item_id,
            requested_by=req.requested_by,
            item_type=req.item_type,
            status=req.status,
            created_at=req.created_at,
            resolved_by=req.resolved_by,
            resolved_at=req.resolved_at,
            note=req.note,
            item_title=item.title,
            requester_name=user.full_name or user.email,
        )
        for req, item, user in results
    ]
    return CommunityItemRequestsPublic(data=data, count=len(data))


@router.post("/{id}/item-requests/{request_id}/approve", response_model=Message)
async def approve_item_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
    request_id: uuid.UUID,
) -> Any:
    """
    Approve an item pool request (Admin only). Pools the item.
    """
    community_admin = _get_accepted_membership(session, id, current_user.id)
    if not (community_admin and community_admin.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can approve item requests")

    req = session.get(CommunityItemRequest, request_id)
    if not req or req.community_id != id:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Request is not pending")

    item = session.get(Item, req.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check if already in pool (race condition guard)
    existing = session.exec(
        select(CommunityItem).where(
            CommunityItem.community_id == id,
            CommunityItem.item_id == req.item_id,
        )
    ).first()
    if not existing:
        comm_item = CommunityItem(
            community_id=id, item_id=req.item_id, added_by=req.requested_by
        )
        session.add(comm_item)
        _write_log(
            session, id, "BOOK_ADDED",
            actor_name=current_user.full_name or current_user.email,
            extra=item.title,
        )

    from datetime import datetime as dt
    req.status = "APPROVED"
    req.resolved_by = current_user.id
    req.resolved_at = dt.utcnow()
    session.add(req)
    session.commit()

    invalidate_item_caches(session, req.item_id, background_tasks)
    from app.search import sync_item_to_search
    session.refresh(item)
    sync_item_to_search(item)

    await notify_user(
        session=session,
        recipient_id=req.requested_by,
        title="Item Pool Request Approved",
        message=f"Your '{req.item_type}' item '{item.title}' was approved for the community pool.",
        type=NotificationType.INFO,
        link=f"/communities/{id}?tab=items",
    )
    return Message(message="Request approved")


@router.post("/{id}/item-requests/{request_id}/reject", response_model=Message)
async def reject_item_request(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    request_id: uuid.UUID,
    note: str | None = None,
) -> Any:
    """
    Reject an item pool request (Admin only).
    """
    community_admin = _get_accepted_membership(session, id, current_user.id)
    if not (community_admin and community_admin.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can reject item requests")

    req = session.get(CommunityItemRequest, request_id)
    if not req or req.community_id != id:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Request is not pending")

    item = session.get(Item, req.item_id)

    from datetime import datetime as dt
    req.status = "REJECTED"
    req.resolved_by = current_user.id
    req.resolved_at = dt.utcnow()
    if note:
        req.note = note
    session.add(req)
    session.commit()

    item_title = item.title if item else "Unknown item"
    msg = f"Your '{req.item_type}' item '{item_title}' was not approved for the community pool."
    if note:
        msg += f" Note: {note}"
    await notify_user(
        session=session,
        recipient_id=req.requested_by,
        title="Item Pool Request Rejected",
        message=msg,
        type=NotificationType.INFO,
        link=f"/communities/{id}?tab=items",
    )
    return Message(message="Request rejected")


@router.patch("/{id}/settings", response_model=Message)
def update_community_settings(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    settings: CommunitySettingsUpdate,
) -> Any:
    """
    Update community settings (Admin only).
    """
    community_admin = _get_accepted_membership(session, id, current_user.id)
    if not (community_admin and community_admin.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can update community settings")

    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    if settings.allowed_item_types is not None:
        for slug in settings.allowed_item_types:
            if not slug or not isinstance(slug, str):
                raise HTTPException(status_code=400, detail="Each allowed item type must be a non-empty string")
    community.allowed_item_types = settings.allowed_item_types
    session.add(community)
    session.commit()
    return Message(message="Settings updated")


@router.post("/{id}/items/{item_id}/donate", response_model=Message)
async def initiate_donation(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, item_id: uuid.UUID
) -> Any:
    """
    Initiate a donation of an item to the community.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    statement = select(CommunityItem).where(
        CommunityItem.community_id == id, CommunityItem.item_id == item_id
    )
    comm_item = session.exec(statement).first()
    if not comm_item:
        raise HTTPException(status_code=404, detail="Item not found in community")

    if comm_item.added_by != current_user.id:
        raise HTTPException(
            status_code=403, detail="Only the person who pooled the item can donate it"
        )

    comm_item.is_donation_pending = True
    session.add(comm_item)
    session.commit()

    # Notify admins only
    admin_statement = (
        select(CommunityMember, User)
        .join(User, CommunityMember.user_id == User.id)
        .where(
            CommunityMember.community_id == id,
            CommunityMember.role == CommunityMemberRole.ADMIN,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
        )
    )
    staff_results = session.exec(admin_statement).all()

    donor_name = current_user.full_name or current_user.email

    for member, user in staff_results:
        await notify_user(
            session=session,
            recipient_id=member.user_id,
            title="Item Donation Pending",
            message=f"{donor_name} wants to donate an item to the community.",
            type=NotificationType.INFO,
            link=f"/communities/{id}?tab=items",
        )
        # Send email notification
        email_data = generate_donation_notification_email(
            email_to=user.email,
            donor_name=donor_name,
            item_title=item.title,
            community_name=community.name,
            community_id=id,
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )

    return Message(message="Donation request sent to admins")


@router.post("/{id}/items/{item_id}/ratify-donation", response_model=Message)
async def ratify_donation(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
    item_id: uuid.UUID,
) -> Any:
    """
    Ratify a donation (Admin only).
    Admins cannot ratify their own donations if there is more than 1 admin.
    """
    # Admins act on behalf of the community — must be an accepted admin
    community_admin = _get_accepted_membership(session, id, current_user.id)
    if not (community_admin and community_admin.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can ratify donations")

    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    statement = select(CommunityItem).where(
        CommunityItem.community_id == id, CommunityItem.item_id == item_id
    )
    comm_item = session.exec(statement).first()
    if not comm_item or not comm_item.is_donation_pending:
        raise HTTPException(status_code=400, detail="No pending donation found")

    # Check if admin is the donor
    if comm_item.added_by == current_user.id:
        admin_count = get_community_admin_count(session, id)
        if admin_count > 1:
            raise HTTPException(
                status_code=403,
                detail="You cannot ratify your own donation when other admins are present",
            )

    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    donor_id = comm_item.added_by

    # Change ownership to the community
    item.owner_id = id

    # Update comm_item status
    comm_item.is_donation_pending = False

    # Update active/pending loans to reflect new ownership (Community is now the lender)
    loans_stmt = select(Loan).where(
        Loan.item_id == item_id,
        Loan.status.in_(
            [
                LoanStatus.PENDING,
                LoanStatus.ACCEPTED,
                LoanStatus.ACTIVE,
                LoanStatus.RETURN_PENDING,
                LoanStatus.EXTENSION_PENDING,
            ]
        ),
    )
    loans = session.exec(loans_stmt).all()
    for loan in loans:
        loan.owner_id = None
        loan.community_id = id
        session.add(loan)

    session.add(item)
    session.add(comm_item)
    session.commit()

    # Update collection index for owner and pooled communities in background
    invalidate_item_caches(session, item_id, background_tasks)
    # Also update previous owner's index
    background_tasks.add_task(rebuild_collection_index_task, donor_id)

    from app.search import sync_item_to_search

    session.refresh(item)
    sync_item_to_search(item)

    # Notify donor
    await notify_user(
        session=session,
        recipient_id=donor_id,
        title="Donation Ratified",
        message=f"Your donation of '{item.title}' to {community.name} has been ratified. Thank you!",
        type=NotificationType.SUCCESS,
        link=f"/communities/{id}",
    )

    return Message(message="Donation ratified! The community now owns this item.")


@router.delete("/{id}/items/{item_id}", response_model=Message)
def remove_item_from_community(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
    item_id: uuid.UUID,
) -> Any:
    """
    Remove an item from a community.
    Admins can remove any item. Members can only remove items they added.
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
        raise HTTPException(
            status_code=403, detail="Must be a member to manage community items"
        )

    # Admins and moderators can remove any item; members can only remove items they added
    is_staff = (
        membership and membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    ) or current_user.is_superuser

    # Try to find pooling meta
    statement = select(CommunityItem).where(
        CommunityItem.community_id == id, CommunityItem.item_id == item_id
    )
    comm_item = session.exec(statement).first()

    # Check for item ownership
    item = session.get(Item, item_id)
    is_owned = item and item.owner_id == id

    if not comm_item and not is_owned:
        raise HTTPException(status_code=404, detail="Item not found in community")

    # Permissions: staff can remove anything; members can only remove items they added.
    is_adder = comm_item and comm_item.added_by == current_user.id
    if not is_staff and not is_adder:
        raise HTTPException(
            status_code=403, detail="Not enough permissions to remove this item"
        )

    from app.search import delete_item_from_search, sync_item_to_search

    # Update collection index for owner and pooled communities in background BEFORE deletion
    invalidate_item_caches(session, item_id, background_tasks)

    item_title = item.title if item else str(item_id)
    _write_log(
        session, id, "BOOK_REMOVED",
        actor_name=current_user.full_name or current_user.email,
        extra=item_title,
    )

    if is_owned:
        # If community owns it, delete the item itself (cascades to CommunityItem)
        item_id_to_del = item.id
        session.delete(item)
        session.commit()
        delete_item_from_search(item_id_to_del)
    else:
        # Just remove pooling metadata
        session.delete(comm_item)
        session.commit()
        session.refresh(item)
        sync_item_to_search(item)

    return Message(message="Item removed from community")


@router.get("/{id}/announcements", response_model=CommunityAnnouncementsPublic)
def read_community_announcements(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=settings.MAX_PAGE_SIZE),
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
        raise HTTPException(
            status_code=403, detail="Must be a member to view announcements"
        )

    count = session.exec(
        select(func.count()).where(CommunityAnnouncement.community_id == id)
    ).one()
    statement = (
        select(CommunityAnnouncement)
        .where(CommunityAnnouncement.community_id == id)
        .order_by(CommunityAnnouncement.is_pinned.desc(), CommunityAnnouncement.created_at.desc())
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

    # Staff (admins and moderators) can create announcements
    membership = _get_accepted_membership(session, id, current_user.id)
    if not (
        membership and membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    ) and not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Only staff can create announcements"
        )

    announcement = CommunityAnnouncement(
        **announcement_in.model_dump(), community_id=id, author_id=current_user.id
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
        await notify_user(
            session=session,
            recipient_id=member.user_id,
            title=f"New Announcement in {community.name}",
            message=announcement.title,
            type=NotificationType.INFO,
            link=f"/communities/{id}",
        )

    return announcement


@router.patch(
    "/{id}/announcements/{announcement_id}", response_model=CommunityAnnouncementPublic
)
def update_community_announcement(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    announcement_id: uuid.UUID,
    announcement_in: CommunityAnnouncementCreate,
) -> Any:
    """
    Update an announcement (Admin only).
    """
    announcement = session.get(CommunityAnnouncement, announcement_id)
    if not announcement or announcement.community_id != id:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Staff (admins and moderators) can edit announcements
    membership = _get_accepted_membership(session, id, current_user.id)
    if not (
        membership and membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    ) and not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Only staff can edit announcements"
        )

    announcement.title = announcement_in.title
    announcement.content = announcement_in.content
    session.add(announcement)
    session.commit()
    session.refresh(announcement)
    return announcement


@router.patch(
    "/{id}/announcements/{announcement_id}/pin", response_model=CommunityAnnouncementPublic
)
def pin_community_announcement(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    announcement_id: uuid.UUID,
    pin_in: CommunityPinUpdate,
) -> Any:
    """
    Pin or unpin an announcement (Admin only).
    """
    announcement = session.get(CommunityAnnouncement, announcement_id)
    if not announcement or announcement.community_id != id:
        raise HTTPException(status_code=404, detail="Announcement not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can pin announcements")

    announcement.is_pinned = pin_in.is_pinned
    session.add(announcement)
    session.commit()
    session.refresh(announcement)
    return announcement


@router.delete("/{id}/announcements/{announcement_id}", response_model=Message)
def delete_community_announcement(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    announcement_id: uuid.UUID,
) -> Any:
    """
    Delete an announcement (Admin only).
    """
    announcement = session.get(CommunityAnnouncement, announcement_id)
    if not announcement or announcement.community_id != id:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # Staff (admins and moderators) can delete announcements
    membership = _get_accepted_membership(session, id, current_user.id)
    if not (
        membership and membership.role in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    ) and not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Only staff can delete announcements"
        )

    session.delete(announcement)
    session.commit()
    return Message(message="Announcement deleted")


@router.get("/{id}/messages", response_model=CommunityMessagesPublic)
def read_community_messages(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=settings.MAX_PAGE_SIZE),
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
        .order_by(CommunityMessage.is_pinned.desc(), CommunityMessage.created_at.desc())
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
        **message_in.model_dump(), community_id=id, author_id=current_user.id
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
        raise HTTPException(
            status_code=403, detail="Not enough permissions to edit this message"
        )

    message.content = message_in.content
    session.add(message)
    session.commit()
    session.refresh(message)
    return message


@router.patch("/{id}/messages/{message_id}/pin", response_model=CommunityMessagePublic)
def pin_community_message(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    message_id: uuid.UUID,
    pin_in: CommunityPinUpdate,
) -> Any:
    """
    Pin or unpin a board message (Admin only).
    """
    message = session.get(CommunityMessage, message_id)
    if not message or message.community_id != id:
        raise HTTPException(status_code=404, detail="Message not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not (membership and membership.role == CommunityMemberRole.ADMIN) and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can pin messages")

    message.is_pinned = pin_in.is_pinned
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

    my_membership = _get_accepted_membership(session, id, current_user.id)
    is_staff = my_membership and my_membership.role in [
        CommunityMemberRole.ADMIN,
        CommunityMemberRole.MODERATOR,
    ]

    if not is_author and not is_staff and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    session.delete(message)
    session.commit()
    return Message(message="Message deleted")


@router.get("/{id}/log", response_model=CommunityLogPublic)
def read_community_log(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=settings.MAX_PAGE_SIZE),
) -> Any:
    """
    Get the community event log (accepted members only).
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    membership = _get_accepted_membership(session, id, current_user.id)
    if not membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Must be a member to view the community log")

    count = session.exec(
        select(func.count()).where(CommunityLog.community_id == id)
    ).one()
    entries = session.exec(
        select(CommunityLog)
        .where(CommunityLog.community_id == id)
        .order_by(CommunityLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return CommunityLogPublic(data=entries, count=count)


@router.get("/{id}/loans", response_model=LoansPublic)
def read_community_loans(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=settings.MAX_PAGE_SIZE),
) -> Any:
    """
    Get loans for a community. Staff see all, members see their own.
    """
    community = session.get(Community, id)
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Get current user's membership
    my_membership_stmt = select(CommunityMember).where(
        CommunityMember.community_id == id,
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    my_membership = session.exec(my_membership_stmt).first()

    if not my_membership and not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Must be a member to view community loans"
        )

    is_staff = current_user.is_superuser or (
        my_membership
        and my_membership.role
        in [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR]
    )

    base_stmt = select(Loan).where(Loan.community_id == id)

    if is_staff:
        # Staff see all loans except BACKLOGGED (hidden until item returns)
        base_stmt = base_stmt.where(Loan.status != LoanStatus.BACKLOGGED)
    else:
        # Members only see their own loans in this community
        base_stmt = base_stmt.where(Loan.requester_id == current_user.id)

    count_statement = select(func.count()).select_from(base_stmt.subquery())
    count = session.exec(count_statement).one()

    statement = base_stmt.order_by(Loan.created_at.desc()).offset(skip).limit(limit)
    loans = session.exec(statement).all()
    return LoansPublic(
        data=[
            filter_loan_privacy(
                l, current_user.id, is_admin=current_user.is_superuser, session=session
            )
            for l in loans
        ],
        count=count,
    )
