import asyncio
import uuid
from typing import Any

from sqlmodel import Session, and_, func, or_, select

from app.models import (
    Community,
    CommunityItem,
    Friendship,
    FriendshipStatus,
    Item,
    ItemConditionRating,
    ItemOwnerPublic,
    ItemType,
    Loan,
    LoanPublic,
    LoanStatus,
    User,
    UserPublic,
    UserReview,
    WorkMetadata,
)

def _update_collection_index_logic(session: Session, owner_id: uuid.UUID):
    """
    Internal logic to update the collection_index for a user or community.
    Calculates totals and sample images for genre, category, subject, and author.
    """
    user = session.get(User, owner_id)
    community = None
    if not user:
        community = session.get(Community, owner_id)
    
    if not user and not community:
        return

    # Fetch all items for this owner
    if community:
        # Include pooled items for communities
        comm_item_ids = select(CommunityItem.item_id).where(CommunityItem.community_id == owner_id)
        items_stmt = select(Item).where(or_(Item.owner_id == owner_id, Item.id.in_(comm_item_ids)))
        items = session.exec(items_stmt).all()
    else:
        items = session.exec(select(Item).where(Item.owner_id == owner_id)).all()
    
    # Pre-fetch work metadata for subjects (tags)
    work_keys = {(item.author, item.title) for item in items if item.author and item.title}
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

    index = {
        "total": len(items),
        "item_type": {},
        "genre": {},
        "category": {},
        "subject": {},
        "author": {},
        "ownership": {}
    }

    for item in items:
        # 0. Item Type
        item_type = item.item_type.value if hasattr(item.item_type, 'value') else str(item.item_type)
        if item_type not in index["item_type"]:
            index["item_type"][item_type] = {"count": 0, "sample_images": []}
        index["item_type"][item_type]["count"] += 1
        if item.image_url and len(index["item_type"][item_type]["sample_images"]) < 5:
            if item.image_url not in index["item_type"][item_type]["sample_images"]:
                index["item_type"][item_type]["sample_images"].append(item.image_url)

        # 1. Author
        author = item.author or "Others"
        if author not in index["author"]:
            index["author"][author] = {"count": 0, "sample_images": []}
        index["author"][author]["count"] += 1
        if item.image_url and len(index["author"][author]["sample_images"]) < 5:
            if item.image_url not in index["author"][author]["sample_images"]:
                index["author"][author]["sample_images"].append(item.image_url)

        # 2. Category & Genre
        extra = item.extra_data or {}
        category = extra.get("category") or "Others"
        genre = extra.get("genre") or "Others"

        if category not in index["category"]:
            index["category"][category] = {"count": 0, "sample_images": []}
        index["category"][category]["count"] += 1
        if item.image_url and len(index["category"][category]["sample_images"]) < 5:
            if item.image_url not in index["category"][category]["sample_images"]:
                index["category"][category]["sample_images"].append(item.image_url)

        if genre not in index["genre"]:
            index["genre"][genre] = {"count": 0, "sample_images": []}
        index["genre"][genre]["count"] += 1
        if item.image_url and len(index["genre"][genre]["sample_images"]) < 5:
            if item.image_url not in index["genre"][genre]["sample_images"]:
                index["genre"][genre]["sample_images"].append(item.image_url)

        # 3. Subject (Tags)
        meta = work_meta_map.get((item.author, item.title))
        tags = meta.tags if meta and meta.tags else []
        if not tags:
            tags = ["Others"]
        
        for tag in tags:
            if tag not in index["subject"]:
                index["subject"][tag] = {"count": 0, "sample_images": []}
            index["subject"][tag]["count"] += 1
            if item.image_url and len(index["subject"][tag]["sample_images"]) < 5:
                if item.image_url not in index["subject"][tag]["sample_images"]:
                    index["subject"][tag]["sample_images"].append(item.image_url)

        # 4. Ownership (Community only)
        if community:
            owner_type = "Community Owned" if item.owner_id == owner_id else "Member Shared Pool"
            if owner_type not in index["ownership"]:
                index["ownership"][owner_type] = {"count": 0, "sample_images": []}
            index["ownership"][owner_type]["count"] += 1
            if item.image_url and len(index["ownership"][owner_type]["sample_images"]) < 5:
                if item.image_url not in index["ownership"][owner_type]["sample_images"]:
                    index["ownership"][owner_type]["sample_images"].append(item.image_url)

    if user:
        user.collection_index = index
        session.add(user)
    elif community:
        community.collection_index = index
        session.add(community)
    
    session.commit()

def update_collection_index(session: Session, owner_id: uuid.UUID):
    """
    Deprecated: Use rebuild_collection_index_task for background execution.
    Maintains synchronous behavior for legacy calls.
    """
    _update_collection_index_logic(session, owner_id)

def rebuild_collection_index_task(owner_id: uuid.UUID):
    """
    Background task to rebuild collection index.
    Creates its own session.
    """
    from app.core.db import engine
    with Session(engine) as session:
        _update_collection_index_logic(session, owner_id)


async def maintenance_bulk_classify():
    """Background task to classify all books and clean up polluted ISBNs."""
    from app.ai import classify_book
    from app.search import sync_item_to_search
    from app.core.db import engine
    import logging

    logger = logging.getLogger(__name__)
    logger.info("Starting maintenance bulk classification and cleanup...")
    print("DEBUG: Starting maintenance bulk classification and cleanup...")

    with Session(engine) as session:
        # 1. Clean up polluted ISBNs in Item extra_data and WorkMetadata
        # Some ISBNs are stored as "[]" or empty strings
        items_to_fix = session.exec(select(Item).where(Item.item_type == ItemType.book)).all()
        fixed_items = 0
        for item in items_to_fix:
            extra = item.extra_data or {}
            isbn = extra.get("isbn")
            if isbn == "[]" or isbn == "" or isbn == []:
                extra["isbn"] = None
                item.extra_data = extra
                session.add(item)
                fixed_items += 1
        
        works_to_fix = session.exec(select(WorkMetadata)).all()
        fixed_works = 0
        for work in works_to_fix:
            if work.isbn == "[]" or work.isbn == "" or work.isbn == []:
                work.isbn = None
                session.add(work)
                fixed_works += 1
        
        session.flush()
        logger.info(f"ISBN Cleanup: Fixed {fixed_items} items and {fixed_works} work metadata entries.")
        print(f"DEBUG: ISBN Cleanup: Fixed {fixed_items} items and {fixed_works} work metadata entries.")

        # 2. Bulk Classify
        statement = select(Item).where(Item.item_type == ItemType.book)
        books = session.exec(statement).all()
        
        classified_count = 0
        for book in books:
            extra = book.extra_data or {}
            # Re-classify if generic or missing
            is_generic = extra.get("category") in ["Fiction", "Non-Fiction", None] or extra.get("genre") is None
            
            if is_generic:
                logger.info(f"Classifying: {book.title} by {book.author}")
                print(f"DEBUG: Classifying: {book.title} by {book.author}")
                cat, gen, sub = await classify_book(book.title, book.author or "", book.description)
                if cat or gen or sub:
                    if cat: extra["category"] = cat
                    if gen: extra["genre"] = gen
                    if sub: extra["subject"] = sub
                    book.extra_data = extra
                    session.add(book)
                    session.flush()
                    sync_item_to_search(book)
                    
                    # Convert subjects string to tags list
                    tags = [s.strip() for s in sub.split(",")] if sub else []
                    
                    # Ensure WorkMetadata also gets updated
                    ensure_work_metadata(session, book.author, book.title, category=cat, tags=tags)
                    classified_count += 1
                
                await asyncio.sleep(0.5) # Throttle Gemini usage
        
        session.commit()
        logger.info(f"Maintenance complete: Classified {classified_count} books.")
        print(f"DEBUG: Maintenance complete: Classified {classified_count} books.")

async def sync_item_to_archive(session: Session, item_id: uuid.UUID):
    """Sync a specific item's metadata to the global WorkMetadata archive."""
    item = session.get(Item, item_id)
    if not item or item.item_type != ItemType.book:
        return
    
    tags = []
    if item.extra_data and item.extra_data.get("subject"):
        tags = [s.strip() for s in item.extra_data["subject"].split(",")]

    ensure_work_metadata(
        session, 
        item.author, 
        item.title, 
        isbn=item.extra_data.get("isbn") if item.extra_data else None,
        description=item.description,
        category=item.extra_data.get("category") if item.extra_data else None,
        image_url=item.image_url,
        tags=tags
    )
    session.commit()

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
    image_url: str | None = None,
    tags: list[str] | None = None
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
            image_url=image_url,
            tags=tags or []
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
        if tags:
            # Merge tags, avoiding duplicates
            current_tags = set(meta.tags or [])
            new_tags = set(tags)
            meta.tags = list(current_tags | new_tags)
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
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING, LoanStatus.DEFAULTED])
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


def get_item_condition_data(session: Session, item_id: uuid.UUID) -> dict[str, Any]:
    ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id == item_id)
    ).all()

    if not ratings:
        return {"average_grade": 0.0, "notes": []}

    avg_grade = sum(r.grade for r in ratings) / len(ratings)
    notes = [
        {
            "user_id": str(r.user_id),
            "note": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in ratings if r.notes
    ]

    return {"average_grade": avg_grade, "notes": notes}
