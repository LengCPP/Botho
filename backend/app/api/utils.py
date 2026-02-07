import uuid
from typing import Any

from sqlmodel import Session, and_, func, or_, select

from app.models import (
    Friendship,
    FriendshipStatus,
    Item,
    ItemConditionRating,
    ItemOwnerPublic,
    Loan,
    LoanPublic,
    LoanStatus,
    User,
    UserPublic,
    UserReview,
    WorkMetadata,
)


def get_work_metadata(session: Session, author: str | None, title: str) -> WorkMetadata | None:
    if not author:
        return None
    return session.get(WorkMetadata, (author, title))


def ensure_work_metadata(
    session: Session,
    author: str | None,
    title: str,
    isbn: str | None = None,
    description: str | None = None,
    category: str | None = None,
    image_url: str | None = None
) -> WorkMetadata | None:
    if not author:
        return None
    meta = session.get(WorkMetadata, (author, title))
    if not meta:
        meta = WorkMetadata(
            author=author,
            title=title,
            isbn=isbn,
            description=description,
            category=category,
            image_url=image_url
        )
        session.add(meta)
    else:
        # Update missing info if found
        if isbn and not meta.isbn:
            meta.isbn = isbn
        if description and not meta.description:
            meta.description = description
        if category and not meta.category:
            meta.category = category
        if image_url and not meta.image_url:
            meta.image_url = image_url
        session.add(meta)
    session.flush()
    from app.search import sync_work_metadata_to_search
    sync_work_metadata_to_search(meta)
    return meta


def filter_user_privacy(user: User, current_user_id: Any = None, is_admin: bool = False, is_friend: bool = False) -> UserPublic:
    """
    Apply privacy filters to a user object based on their settings.
    Superusers or friends bypass these filters.
    """
    # If the user is the current user or an admin or a friend, don't filter anything
    is_me = current_user_id and str(user.id) == str(current_user_id)

    settings = user.settings or {}
    show_contact = settings.get("show_contact_details", False)
    show_name = settings.get("show_full_name", False)

    user_public = UserPublic.model_validate(user)
    user_public.show_contact_details = show_contact

    if not is_me and not is_admin and not is_friend:
        if not show_contact:
            # Hide email
            user_public.email = "[Hidden]"

        if not show_name:
            # Replace name with alias if available
            if user.profile and user.profile.alias:
                user_public.full_name = user.profile.alias
            else:
                user_public.full_name = "Private User"

    return user_public

def filter_owner_privacy(owner: User, current_user_id: Any = None, is_admin: bool = False, is_friend: bool = False) -> ItemOwnerPublic:
    """
    Apply privacy filters to an owner object for item listings.
    Superusers or friends bypass these filters.
    """
    is_me = current_user_id and str(owner.id) == str(current_user_id)

    settings = owner.settings or {}
    show_contact = settings.get("show_contact_details", False)
    show_name = settings.get("show_full_name", False)

    email = owner.email if (is_me or is_admin or is_friend or show_contact) else "[Hidden]"

    if is_me or is_admin or is_friend or show_name:
        full_name = owner.full_name
    else:
        full_name = "Private User"
        if owner.profile and owner.profile.alias:
            full_name = owner.profile.alias

    return ItemOwnerPublic(
        id=owner.id,
        full_name=full_name,
        email=email,
        show_contact_details=show_contact
    )

def filter_loan_privacy(loan: Loan, current_user_id: Any = None, is_admin: bool = False, session: Session | None = None) -> LoanPublic:
    """
    Apply privacy filters to a loan object's owner and requester.
    Reveals details if they are friends or share a private community.
    """
    loan_public = LoanPublic.model_validate(loan)

    reveal_requester = is_admin
    reveal_owner = is_admin

    if session and loan.owner_id and loan.requester_id:
        # Check if current user is the owner - they always see requester details
        is_owner = current_user_id and str(loan.owner_id) == str(current_user_id)
        if is_owner:
            reveal_requester = True

        # Check if current user is the requester - they always see owner details
        is_requester = current_user_id and str(loan.requester_id) == str(current_user_id)
        if is_requester:
            reveal_owner = True

        # Check friendship
        is_friend = session.exec(
            select(Friendship).where(
                Friendship.status == FriendshipStatus.ACCEPTED,
                or_(
                    and_(Friendship.user_id == loan.owner_id, Friendship.friend_id == loan.requester_id),
                    and_(Friendship.user_id == loan.requester_id, Friendship.friend_id == loan.owner_id)
                )
            )
        ).first() is not None

        if is_friend:
            reveal_requester = True
            reveal_owner = True
        else:
            # Check shared private community
            from app.models import Community, CommunityMember, CommunityMemberStatus

            shared_private_comm = session.exec(
                select(Community)
                .join(CommunityMember, Community.id == CommunityMember.community_id)
                .where(
                    Community.is_private == True,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                    CommunityMember.user_id == loan.owner_id,
                    Community.id.in_(
                        select(CommunityMember.community_id).where(
                            CommunityMember.user_id == loan.requester_id,
                            CommunityMember.status == CommunityMemberStatus.ACCEPTED
                        )
                    )
                )
            ).first() is not None

            if shared_private_comm:
                reveal_requester = True
                reveal_owner = True

    # Check if current user is an admin of the loan's community
    if session and current_user_id and loan.community_id:
        from app.models import CommunityMember, CommunityMemberRole, CommunityMemberStatus
        is_community_admin = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == loan.community_id,
                CommunityMember.user_id == current_user_id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first() is not None

        if is_community_admin:
            reveal_requester = True
            reveal_owner = True

    if loan.owner:
        loan_public.owner = filter_user_privacy(loan.owner, current_user_id, is_admin=reveal_owner)

    if loan.requester:
        loan_public.requester = filter_user_privacy(loan.requester, current_user_id, is_admin=reveal_requester)

    if session and current_user_id:
        existing_review = session.exec(
            select(UserReview).where(
                UserReview.loan_id == loan.id,
                UserReview.reviewer_id == current_user_id
            )
        ).first()
        loan_public.has_review = existing_review is not None

        # Check if other admins exist for community loans
        if loan.community_id:
            from app.models import CommunityMember, CommunityMemberRole, CommunityMemberStatus
            other_admins = session.exec(
                select(func.count()).select_from(CommunityMember).where(
                    CommunityMember.community_id == loan.community_id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                    CommunityMember.user_id != current_user_id
                )
            ).one()
            loan_public.other_admins_exist = other_admins > 0

    return loan_public

def check_item_availability(session: Session, item_id: uuid.UUID) -> bool:
    """
    Check if an item is available (not currently loaned out).
    """
    active_loan = session.exec(
        select(Loan).where(
            Loan.item_id == item_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING])
        )
    ).first()
    return active_loan is None


def check_possession(session: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> bool:
    item = session.get(Item, item_id)
    if not item:
        return False
    if item.owner_id == user_id:
        return True

    # Check loans
    loan = session.exec(
        select(Loan).where(
            Loan.item_id == item_id,
            Loan.requester_id == user_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.RETURNED, LoanStatus.EXTENSION_PENDING])
        )
    ).first()
    return bool(loan)


def get_item_condition_data(session: Session, item_id: uuid.UUID) -> dict:
    ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id == item_id)
    ).all()

    if not ratings:
        return {"average_grade": 0.0, "notes": []}

    avg_grade = sum(r.grade for r in ratings) / len(ratings)
    notes = [{"user_id": r.user_id, "note": r.notes, "created_at": r.created_at} for r in ratings if r.notes]

    return {"average_grade": avg_grade, "notes": notes}
