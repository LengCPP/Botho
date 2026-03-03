import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, update
from sqlmodel import Session, or_, select

from app.core.config import settings
from app.core.db import engine
from app.models import Community, CommunityAnnouncement, CommunityLog, CommunityMember, CommunityMemberStatus, CommunityMessage, Item, ItemType, Loan, LoanStatus, NotificationType, User

logger = logging.getLogger(__name__)


async def check_overdue_loans():
    """
    Flag users with overdue loans and clear delinquency when resolved.
    Scheduled to run every hour via APScheduler.
    """
    logger.info("Checking for overdue loans...")
    try:
        with Session(engine) as session:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(days=settings.LOAN_OVERDUE_GRACE_DAYS)

            # Subquery: distinct requester IDs with currently overdue active loans
            overdue_user_ids = select(Loan.requester_id).where(
                Loan.status == LoanStatus.ACTIVE,
                Loan.end_date < cutoff,
            )

            # Bulk-set is_delinquent = True for all overdue borrowers
            session.execute(
                update(User)
                .where(User.id.in_(overdue_user_ids))
                .values(is_delinquent=True)
            )

            # Bulk-clear is_delinquent for users who no longer have overdue loans
            session.execute(
                update(User)
                .where(
                    User.is_delinquent == True,
                    ~User.id.in_(overdue_user_ids),
                )
                .values(is_delinquent=False)
            )

            session.commit()
    except Exception:
        logger.exception("Error in overdue loan check")


async def check_expired_suspensions():
    """
    Auto-lift time-limited suspensions that have expired.
    Scheduled to run every 5 minutes via APScheduler.
    """
    from app.notifications import notify_user

    try:
        expired_info: list[tuple] = []
        with Session(engine) as session:
            now = datetime.now(timezone.utc)
            expired = session.exec(
                select(CommunityMember).where(
                    CommunityMember.status == CommunityMemberStatus.SUSPENDED,
                    CommunityMember.suspension_until.is_not(None),
                    CommunityMember.suspension_until <= now,
                )
            ).all()
            for m in expired:
                community = session.get(Community, m.community_id)
                community_name = community.name if community else "the community"
                user = session.get(User, m.user_id)
                user_name = (user.full_name or user.email) if user else str(m.user_id)
                expired_info.append((m.user_id, m.community_id, community_name))
                m.status = CommunityMemberStatus.ACCEPTED
                m.suspension_until = None
                m.action_by_role = None
                m.action_reason = None
                session.add(m)
                log_entry = CommunityLog(
                    community_id=m.community_id,
                    event_type="MEMBER_UNSUSPENDED",
                    actor_name="system",
                    target_name=user_name,
                )
                session.add(log_entry)
            if expired:
                session.commit()
                logger.info("Lifted %d expired suspension(s)", len(expired))

        # Send notifications in a new session after commit
        if expired_info:
            with Session(engine) as notif_session:
                for user_id, community_id, community_name in expired_info:
                    await notify_user(
                        session=notif_session,
                        recipient_id=user_id,
                        title="Suspension Lifted",
                        message=f"Your suspension in {community_name} has ended. You are now an active member again.",
                        type=NotificationType.SUCCESS,
                        link=f"/communities/{community_id}",
                    )
    except Exception:
        logger.exception("Error in suspension expiry check")


async def check_expired_board_content():
    """Delete non-pinned messages and announcements older than 30 days."""
    try:
        with Session(engine) as session:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            session.execute(
                delete(CommunityMessage).where(
                    CommunityMessage.created_at < cutoff,
                    CommunityMessage.is_pinned == False,  # noqa: E712
                )
            )
            session.execute(
                delete(CommunityAnnouncement).where(
                    CommunityAnnouncement.created_at < cutoff,
                    CommunityAnnouncement.is_pinned == False,  # noqa: E712
                )
            )
            session.commit()
    except Exception:
        logger.exception("Error in board content expiry check")


async def classify_pending_books():
    """
    Single-sweep book classifier: process up to MAX_PER_SWEEP books that are
    missing or have only generic AI classification (category/genre).
    Scheduled every 30 seconds via APScheduler (max_instances=1 prevents overlap).
    Inter-book sleep is preserved to avoid saturating the local LLM hardware.
    """
    SLEEP_BETWEEN_BOOKS = 5  # pause between successive LLM calls within a sweep
    MAX_PER_SWEEP = 5        # max books to attempt per sweep (spread load over time)

    # Step aside while an admin bulk-classify job is running so they
    # don't compete for Ollama on the same slow hardware.
    from app.state import classification_state
    if classification_state.bulk_running:
        logger.debug("Classification worker: bulk task active, skipping sweep.")
        return

    # ------------------------------------------------------------------
    # 1. Collect IDs + data of books that need classification.
    #    We read everything we need from a short-lived session so that
    #    per-book write sessions are fully independent.
    # ------------------------------------------------------------------
    with Session(engine) as session:
        stmt = (
            select(Item)
            .where(
                Item.item_type == ItemType.book,
                or_(
                    Item.category.is_(None),
                    Item.genre.is_(None),
                    Item.category.in_(["Fiction", "Non-Fiction"]),
                ),
            )
            .limit(MAX_PER_SWEEP)
        )
        pending_data = [
            {
                "id": b.id,
                "title": b.title,
                "author": b.author,
                "description": b.description,
            }
            for b in session.exec(stmt).all()
        ]

    if not pending_data:
        return

    logger.info(
        "Classification worker: %d book(s) to classify this sweep.",
        len(pending_data),
    )

    # Lazy imports to avoid circular-import issues at module level.
    from app.ai import classify_books
    from app.api.utils import ensure_work_metadata, map_book_classification
    from app.search import _build_item_document, _build_work_document, _push_doc

    # ------------------------------------------------------------------
    # 2. Classify each book individually with its own write session.
    # ------------------------------------------------------------------
    for book_info in pending_data:
        try:
            results = await classify_books(
                [
                    {
                        "title": book_info["title"],
                        "author": book_info["author"] or "",
                        "description": book_info["description"],
                    }
                ]
            )

            if not results or not results[0] or not any(results[0]):
                logger.warning(
                    "Classification worker: no result for %r, skipping.",
                    book_info["title"],
                )
            else:
                cat_raw, gen_raw, sub_raw = results[0]
                cat, gen, _ = map_book_classification([cat_raw, gen_raw])

                item_doc: dict | None = None
                work_doc: dict | None = None
                with Session(engine) as ws:
                    book = ws.get(Item, book_info["id"])
                    if book:
                        if cat:
                            book.category = cat
                        if gen:
                            book.genre = gen
                        if sub_raw:
                            book.subject = sub_raw

                        ws.add(book)
                        ws.flush()
                        # Build docs while session is open (lazy-load safe)
                        item_doc = _build_item_document(book)

                        tags = [s.strip() for s in sub_raw.split(",")] if sub_raw else []
                        meta = ensure_work_metadata(
                            ws,
                            book.author,
                            book.title,
                            category=cat,
                            genre=gen,
                            tags=tags,
                            overwrite=True,
                            sync_search=False,
                        )
                        work_doc = _build_work_document(meta) if meta else None
                        ws.commit()
                # Non-blocking Meilisearch pushes outside the session context
                if item_doc:
                    await asyncio.to_thread(_push_doc, "items", item_doc)
                if work_doc:
                    await asyncio.to_thread(_push_doc, "works", work_doc)
                logger.info(
                    "Classification worker: '%s' → %s / %s",
                    book_info["title"],
                    cat,
                    gen,
                )

        except Exception as e:
            logger.error(
                "Classification worker: failed to classify id=%s title=%r: %s",
                book_info["id"],
                book_info["title"],
                e,
            )

        # Pause between books so we don't saturate the LLM/hardware.
        await asyncio.sleep(SLEEP_BETWEEN_BOOKS)
