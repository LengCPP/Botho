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
    Background task to flag users with overdue loans.
    Runs every hour. Uses bulk UPDATE statements to avoid N+1 queries.
    """
    while True:
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

        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            logger.info("Overdue loan checker shutting down")
            return


async def check_expired_suspensions():
    """
    Background task to auto-lift time-limited suspensions.
    Runs every 5 minutes.
    """
    from app.notifications import notify_user

    while True:
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

        try:
            await asyncio.sleep(300)  # every 5 minutes
        except asyncio.CancelledError:
            logger.info("Suspension expiry checker shutting down")
            return


async def check_expired_board_content():
    """Delete non-pinned messages and announcements older than 30 days."""
    while True:
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
        try:
            await asyncio.sleep(86400)  # once per day
        except asyncio.CancelledError:
            logger.info("Board content expiry checker shutting down")
            return


async def classify_pending_books():
    """
    Persistent background worker: poll for books that are missing or have only
    generic AI classification (category is None/'Fiction'/'Non-Fiction' or genre
    is None) and classify them one at a time using the local Ollama model.

    Processes a small batch per sweep with a pause between each LLM call so the
    hardware is never overwhelmed. Results are committed independently per book
    so a single failure does not block the rest.
    """
    # Tune these to match how fast/slow the local hardware is.
    POLL_INTERVAL = 30        # seconds between sweeps when there is pending work
    IDLE_INTERVAL = 60        # seconds to wait when nothing needs classifying
    SLEEP_BETWEEN_BOOKS = 5   # pause between successive LLM calls within a sweep
    MAX_PER_SWEEP = 5         # max books to attempt per sweep (spread load over time)

    logger.info("Book classification worker started.")

    while True:
        try:
            # Step aside while an admin bulk-classify job is running so they
            # don't compete for Ollama on the same slow hardware.
            from app.state import classification_state
            if classification_state.bulk_running:
                logger.debug("Classification worker: bulk task active, skipping sweep.")
                try:
                    await asyncio.sleep(POLL_INTERVAL)
                except asyncio.CancelledError:
                    logger.info("Book classification worker shutting down.")
                    return
                continue

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
                try:
                    await asyncio.sleep(IDLE_INTERVAL)
                except asyncio.CancelledError:
                    logger.info("Book classification worker shutting down.")
                    return
                continue

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
                                    book.title,
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
                try:
                    await asyncio.sleep(SLEEP_BETWEEN_BOOKS)
                except asyncio.CancelledError:
                    logger.info("Book classification worker shutting down.")
                    return

        except asyncio.CancelledError:
            logger.info("Book classification worker shutting down.")
            return
        except Exception:
            logger.exception("Error in classify_pending_books sweep")

        try:
            await asyncio.sleep(POLL_INTERVAL)
        except asyncio.CancelledError:
            logger.info("Book classification worker shutting down.")
            return