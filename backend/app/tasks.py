import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, update
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.models import Community, CommunityAnnouncement, CommunityLog, CommunityMember, CommunityMemberStatus, CommunityMessage, Loan, LoanStatus, NotificationType, User

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