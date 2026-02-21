import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.models import Loan, LoanStatus, User

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