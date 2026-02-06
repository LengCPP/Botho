import asyncio
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Loan, LoanStatus, User


async def check_overdue_loans():
    """
    Background task to flag users with overdue loans.
    Runs periodically.
    """
    while True:
        print("Checking for overdue loans...")
        with Session(engine) as session:
            now = datetime.now(timezone.utc)

            # Find all active loans past their end_date
            statement = select(Loan).where(
                Loan.status == LoanStatus.ACTIVE,
                Loan.end_date < now - timedelta(days=7) # 7 day grace period
            )
            overdue_loans = session.exec(statement).all()

            for loan in overdue_loans:
                borrower = session.get(User, loan.requester_id)
                if borrower and not borrower.is_delinquent:
                    borrower.is_delinquent = True
                    session.add(borrower)

            # Also clear flags for users who no longer have overdue items
            # (In a more optimized version, this would be triggered by return)
            # For now, we simple check all delinquent users
            delinquent_stmt = select(User).where(User.is_delinquent)
            delinquent_users = session.exec(delinquent_stmt).all()

            for user in delinquent_users:
                active_overdue = session.exec(
                    select(Loan).where(
                        Loan.requester_id == user.id,
                        Loan.status == LoanStatus.ACTIVE,
                        Loan.end_date < now - timedelta(days=7)
                    )
                ).first()
                if not active_overdue:
                    user.is_delinquent = False
                    session.add(user)

            session.commit()

        # Sleep for 1 hour before next check
        await asyncio.sleep(3600)
