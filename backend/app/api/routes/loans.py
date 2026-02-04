import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import and_, func, or_, select

from app.api.deps import CurrentUser, SessionDep
from app.api.utils import check_item_availability, filter_loan_privacy
from app.models import (
    Community,
    CommunityItem,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    Friendship,
    FriendshipStatus,
    Item,
    Loan,
    LoanCreate,
    LoanPublic,
    LoansPublic,
    LoanStatus,
    NotificationType,
)
from app.notifications import notify_user

router = APIRouter(prefix="/loans", tags=["loans"])


def get_community_admin_count(session: SessionDep, community_id: uuid.UUID) -> int:
    """
    Get the number of admins in a community.
    """
    statement = (
        select(func.count())
        .select_from(CommunityMember)
        .where(
            CommunityMember.community_id == community_id,
            CommunityMember.role == CommunityMemberRole.ADMIN,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED
        )
    )
    return session.exec(statement).one()


@router.post("/request", response_model=LoanPublic)
async def create_loan_request(
    *, session: SessionDep, current_user: CurrentUser, loan_in: LoanCreate
) -> Any:
    """
    Submit a loan request for an item.
    """
    item = session.get(Item, loan_in.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check if user is already the owner
    if item.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="You already own this item")

    # Determine if this is a community loan or personal loan
    owner_id = None
    community_id = None

    if loan_in.community_id:
        # Borrowing from a community pool
        community_id = loan_in.community_id

        # Check if item is in this community pool
        statement = select(CommunityItem).where(
            CommunityItem.community_id == community_id,
            CommunityItem.item_id == loan_in.item_id
        )
        if not session.exec(statement).first():
            # Also check if it's exclusively community owned
            if item.owner_id != community_id:
                raise HTTPException(status_code=400, detail="Item is not in this community")

        # Check if requester is a member (Admins are members)
        statement = select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED
        )
        if not session.exec(statement).first() and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Must be a member of the community to borrow its items")
    else:
        # Personal loan OR borrowing community-owned item directly
        if item.user_owner:
            owner_id = item.owner_id

            # Check if they are friends or share a community
            friends_stmt = select(Friendship).where(
                Friendship.status == FriendshipStatus.ACCEPTED,
                or_(
                    and_(Friendship.user_id == current_user.id, Friendship.friend_id == owner_id),
                    and_(Friendship.user_id == owner_id, Friendship.friend_id == current_user.id)
                )
            )
            is_friend = session.exec(friends_stmt).first() is not None

            if not is_friend:
                # Try to find a shared community to act as a bridge
                shared_comm_stmt = select(CommunityMember.community_id).where(
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                    CommunityMember.community_id.in_(
                        select(CommunityMember.community_id).where(
                            CommunityMember.user_id == owner_id,
                            CommunityMember.status == CommunityMemberStatus.ACCEPTED
                        )
                    )
                )
                shared_comm_ids = session.exec(shared_comm_stmt).all()
                if shared_comm_ids:
                    # Use the first shared community as the bridge
                    community_id = shared_comm_ids[0]
                else:
                    # No bridge found
                    raise HTTPException(status_code=403, detail="You must be friends or share a community to borrow this item")
        elif item.community_owner:
            community_id = item.owner_id
            # Ensure they are members if it's community owned
            statement = select(CommunityMember).where(
                CommunityMember.community_id == community_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
            if not session.exec(statement).first():
                raise HTTPException(status_code=403, detail="Must be a member of the community to borrow its items")

    # Check for existing active or pending loans for this item
    if not check_item_availability(session, loan_in.item_id):
        raise HTTPException(status_code=400, detail="Item is already requested or on loan")

    db_loan = Loan(
        item_id=loan_in.item_id,
        owner_id=owner_id,
        community_id=community_id,
        requester_id=current_user.id,
        start_date=loan_in.start_date,
        end_date=loan_in.end_date,
        status=LoanStatus.PENDING
    )
    session.add(db_loan)
    session.commit()
    session.refresh(db_loan)

    # Notify owner or admins
    if community_id:
        # Notify all admins of the community
        community = session.get(Community, community_id)
        admin_statement = select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        admins = session.exec(admin_statement).all()
        for admin in admins:
            if admin.user_id == current_user.id:
                continue
            await notify_user(
                session=session,
                recipient_id=admin.user_id,
                title="New Community Loan Request",
                message=f"{current_user.full_name or current_user.email} wants to borrow '{item.title}' from {community.name}.",
                type=NotificationType.INFO,
                link=f"/communities/{community_id}"
            )
    elif owner_id:
        # Notify single owner
        await notify_user(
            session=session,
            recipient_id=owner_id,
            title="New Loan Request",
            message=f"{current_user.full_name or current_user.email} wants to borrow '{item.title}'.",
            type=NotificationType.INFO,
            link="/loans"
        )

    return filter_loan_privacy(db_loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.get("/incoming", response_model=LoansPublic)
def read_incoming_loan_requests(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve loan requests for items owned by the current user.
    Community loans are managed within the community's own loans section.
    """
    statement = (
        select(Loan)
        .where(Loan.owner_id == current_user.id)
        .order_by(Loan.created_at.desc())
    )

    count_statement = (
        select(func.count())
        .select_from(Loan)
        .where(Loan.owner_id == current_user.id)
    )

    count = session.exec(count_statement).one()
    loans = session.exec(statement.offset(skip).limit(limit)).all()

    return LoansPublic(
        data=[
            filter_loan_privacy(
                loan_obj,
                current_user.id,
                is_admin=current_user.is_superuser,
                session=session,
            )
            for loan_obj in loans
        ],
        count=count,
    )


@router.get("/outgoing", response_model=LoansPublic)
def read_outgoing_loan_requests(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve loan requests submitted by the current user.
    """
    statement = (
        select(Loan)
        .where(Loan.requester_id == current_user.id)
        .order_by(Loan.created_at.desc())
    )
    count_statement = select(func.count()).select_from(Loan).where(Loan.requester_id == current_user.id)

    count = session.exec(count_statement).one()
    loans = session.exec(statement.offset(skip).limit(limit)).all()
    return LoansPublic(
        data=[
            filter_loan_privacy(
                loan_obj,
                current_user.id,
                is_admin=current_user.is_superuser,
                session=session,
            )
            for loan_obj in loans
        ],
        count=count,
    )


@router.patch("/{id}/respond", response_model=LoanPublic)
async def respond_to_loan_request(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, accept: bool
) -> Any:
    """
    Accept or reject a loan request (Owner or Community Admin only).
    Admins cannot approve their own requests if there is more than 1 admin.
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan request not found")

    # Permission check
    can_respond = False
    if loan.owner_id == current_user.id:
        can_respond = True
    elif loan.community_id:
        statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        if session.exec(statement).first():
            # Check if admin is the requester
            if loan.requester_id == current_user.id:
                admin_count = get_community_admin_count(session, loan.community_id)
                if admin_count > 1:
                    raise HTTPException(
                        status_code=403,
                        detail="You cannot approve your own loan request when other admins are present"
                    )
            can_respond = True

    if not can_respond and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if loan.status != LoanStatus.PENDING:
        raise HTTPException(status_code=400, detail="Loan is not in pending state")

    loan.status = LoanStatus.ACCEPTED if accept else LoanStatus.REJECTED
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify requester
    status_msg = "accepted" if accept else "rejected"
    await notify_user(
        session=session,
        recipient_id=loan.requester_id,
        title=f"Loan Request {status_msg.capitalize()}",
        message=f"Your request for '{loan.item.title}' has been {status_msg}.",
        type=NotificationType.SUCCESS if accept else NotificationType.WARNING,
        link=f"/communities/{loan.community_id}" if loan.community_id else "/loans"
    )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.patch("/{id}/cancel", response_model=LoanPublic)
async def cancel_loan(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Cancel a loan request (Requester or Owner/Admin).
    Only possible before ratification (ACTIVE status).
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    # Permission check
    is_requester = loan.requester_id == current_user.id
    is_owner = False
    if loan.owner_id == current_user.id:
        is_owner = True
    elif loan.community_id:
        statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        if session.exec(statement).first():
            is_owner = True

    if not is_requester and not is_owner and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if loan.status not in [LoanStatus.PENDING, LoanStatus.ACCEPTED]:
        raise HTTPException(status_code=400, detail="Loan cannot be cancelled at this stage")

    loan.status = LoanStatus.CANCELLED
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify the other party
    notif_link = f"/communities/{loan.community_id}" if loan.community_id else "/loans"
    if is_requester:
        # Notify owner or admins
        if loan.community_id:
            admin_statement = select(CommunityMember).where(
                CommunityMember.community_id == loan.community_id,
                CommunityMember.role == CommunityMemberRole.ADMIN
            )
            admins = session.exec(admin_statement).all()
            for admin in admins:
                await notify_user(
                    session=session,
                    recipient_id=admin.user_id,
                    title="Loan Request Cancelled",
                    message=f"{current_user.full_name or current_user.email} has cancelled their request for '{loan.item.title}'.",
                    type=NotificationType.WARNING,
                    link=notif_link
                )
        elif loan.owner_id:
            await notify_user(
                session=session,
                recipient_id=loan.owner_id,
                title="Loan Request Cancelled",
                message=f"{current_user.full_name or current_user.email} has cancelled their request for '{loan.item.title}'.",
                type=NotificationType.WARNING,
                link=notif_link
            )
    else:
        # Owner/Admin cancelled, notify requester
        await notify_user(
            session=session,
            recipient_id=loan.requester_id,
            title="Loan Request Cancelled",
            message=f"The owner/admin has cancelled the loan for '{loan.item.title}'.",
            type=NotificationType.WARNING,
            link=notif_link
        )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.patch("/{id}/ratify", response_model=LoanPublic)
async def ratify_loan(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Confirm possession of the item (Requester only).
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if loan.status != LoanStatus.ACCEPTED:
        raise HTTPException(status_code=400, detail="Loan must be accepted before ratification")

    loan.status = LoanStatus.ACTIVE
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify owner or admins
    if loan.community_id:
        admin_statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        admins = session.exec(admin_statement).all()
        for admin in admins:
            await notify_user(
                session=session,
                recipient_id=admin.user_id,
                title="Loan Ratified",
                message=f"{current_user.full_name or current_user.email} confirmed receipt of '{loan.item.title}' from the community.",
                type=NotificationType.INFO,
                link="/loans"
            )
    elif loan.owner_id:
        await notify_user(
            session=session,
            recipient_id=loan.owner_id,
            title="Loan Ratified",
            message=f"{current_user.full_name or current_user.email} confirmed they have received '{loan.item.title}'.",
            type=NotificationType.INFO,
            link="/loans"
        )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.patch("/{id}/return-signal", response_model=LoanPublic)
async def signal_return(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Signal that the item is being returned (Requester only).
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if loan.status != LoanStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Loan must be active to signal return")

    loan.status = LoanStatus.RETURN_PENDING
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify owner or admins
    if loan.community_id:
        admin_statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        admins = session.exec(admin_statement).all()
        for admin in admins:
            await notify_user(
                session=session,
                recipient_id=admin.user_id,
                title="Return Signaled",
                message=f"{current_user.full_name or current_user.email} signaled that they have returned '{loan.item.title}' to the community.",
                type=NotificationType.INFO,
                link="/loans"
            )
    elif loan.owner_id:
        await notify_user(
            session=session,
            recipient_id=loan.owner_id,
            title="Return Signaled",
            message=f"{current_user.full_name or current_user.email} signaled that they have returned '{loan.item.title}'. Please confirm receipt.",
            type=NotificationType.INFO,
            link="/loans"
        )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.patch("/{id}/return", response_model=LoanPublic)
async def return_loan(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Mark an item as returned (Owner or Community Admin only).
    Allows unilateral return by owner/admin regardless of 'return_pending' status.
    Admins cannot confirm their own returns if there is more than 1 admin.
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    # Permission check
    can_confirm = False
    if loan.owner_id == current_user.id:
        can_confirm = True
    elif loan.community_id:
        statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        if session.exec(statement).first():
            # Check if admin is the borrower
            if loan.requester_id == current_user.id:
                admin_count = get_community_admin_count(session, loan.community_id)
                if admin_count > 1:
                    raise HTTPException(
                        status_code=403,
                        detail="You cannot confirm receipt of your own loan return when other admins are present"
                    )
            can_confirm = True

    if not can_confirm and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if loan.status not in [LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING]:
        raise HTTPException(status_code=400, detail="Loan must be active or return pending to be returned")

    loan.status = LoanStatus.RETURNED
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify requester
    await notify_user(
        session=session,
        recipient_id=loan.requester_id,
        title="Return Confirmed",
        message=f"Receipt of '{loan.item.title}' has been confirmed.",
        type=NotificationType.SUCCESS,
        link="/loans"
    )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.post("/{id}/extension", response_model=LoanPublic)
async def create_extension_request(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, new_end_date: datetime
) -> Any:
    """
    Request an extension for a loan (Requester only).
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if loan.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if loan.status != LoanStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Loan must be active to request extension")

    if new_end_date <= loan.end_date:
        raise HTTPException(status_code=400, detail="New end date must be after current end date")

    loan.pending_extension_date = new_end_date
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify owner or admins
    message_text = f"{current_user.full_name or current_user.email} requested an extension for '{loan.item.title}' until {new_end_date.strftime('%Y-%m-%d')}."
    if loan.community_id:
        admin_statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        admins = session.exec(admin_statement).all()
        for admin in admins:
            await notify_user(
                session=session,
                recipient_id=admin.user_id,
                title="Extension Requested",
                message=message_text,
                type=NotificationType.INFO,
                link="/loans"
            )
    elif loan.owner_id:
        await notify_user(
            session=session,
            recipient_id=loan.owner_id,
            title="Extension Requested",
            message=message_text,
            type=NotificationType.INFO,
            link="/loans"
        )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)


@router.patch("/{id}/extension/respond", response_model=LoanPublic)
async def respond_to_extension_request(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, accept: bool
) -> Any:
    """
    Accept or reject a loan extension request (Owner or Community Admin only).
    Admins cannot approve their own extensions if there is more than 1 admin.
    """
    loan = session.get(Loan, id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    # Permission check
    can_respond = False
    if loan.owner_id == current_user.id:
        can_respond = True
    elif loan.community_id:
        statement = select(CommunityMember).where(
            CommunityMember.community_id == loan.community_id,
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == CommunityMemberRole.ADMIN
        )
        if session.exec(statement).first():
            # Check if admin is the borrower
            if loan.requester_id == current_user.id:
                admin_count = get_community_admin_count(session, loan.community_id)
                if admin_count > 1:
                    raise HTTPException(
                        status_code=403,
                        detail="You cannot approve your own loan extension when other admins are present"
                    )
            can_respond = True

    if not can_respond and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if not loan.pending_extension_date:
        raise HTTPException(status_code=400, detail="No pending extension request")

    if accept:
        loan.end_date = loan.pending_extension_date

    loan.pending_extension_date = None
    session.add(loan)
    session.commit()
    session.refresh(loan)

    # Notify requester
    status_msg = "accepted" if accept else "rejected"
    await notify_user(
        session=session,
        recipient_id=loan.requester_id,
        title=f"Extension Request {status_msg.capitalize()}",
        message=f"Your extension request for '{loan.item.title}' has been {status_msg}.",
        type=NotificationType.SUCCESS if accept else NotificationType.WARNING,
        link="/loans"
    )

    return filter_loan_privacy(loan, current_user.id, is_admin=current_user.is_superuser, session=session)
