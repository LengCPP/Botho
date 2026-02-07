import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.ai import generate_honor_snapshot
from app.api import deps
from app.models import (
    Loan,
    LoanStatus,
    Message,
    User,
    UserReview,
    UserReviewCreate,
    UserReviewDisputeCreate,
    UserReviewPublic,
    UserRoleReviewed,
)

router = APIRouter()


@router.get("/me", response_model=list[UserReviewPublic])
def read_my_reviews(
    session: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve reviews received by the current user.
    Reviewer identity is hidden (anonymized) in the response.
    """
    count_statement = select(func.count()).where(UserReview.reviewee_id == current_user.id)
    count = session.exec(count_statement).one()

    statement = select(UserReview).where(UserReview.reviewee_id == current_user.id).offset(skip).limit(limit)
    reviews = session.exec(statement).all()

    # Anonymize reviewer_name
    public_reviews = []
    for r in reviews:
        r_public = UserReviewPublic(**r.model_dump())
        r_public.reviewer_name = "Community Member" # Anonymize
        public_reviews.append(r_public)

    return public_reviews


@router.post("/{review_id}/dispute", response_model=UserReviewPublic)
def dispute_review(
    *,
    session: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    review_id: uuid.UUID,
    dispute_in: UserReviewDisputeCreate,
) -> Any:
    """
    Dispute a review.
    """
    review = session.get(UserReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.reviewee_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only dispute reviews about yourself")

    if review.is_disputed:
        raise HTTPException(status_code=400, detail="Review is already disputed")

    review.is_disputed = True
    review.dispute_reason = dispute_in.reason
    session.add(review)
    session.commit()
    session.refresh(review)
    return review


@router.post("/{review_id}/resolve", dependencies=[Depends(deps.get_current_active_superuser)], response_model=Message)
async def resolve_dispute(
    *,
    session: Session = Depends(deps.get_db),
    review_id: uuid.UUID,
    action: str, # "delete" or "dismiss"
) -> Any:
    """
    Resolve a review dispute (Admin only).
    Action can be 'delete' (removes review) or 'dismiss' (keeps review, clears dispute).
    """
    review = session.get(UserReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if not review.is_disputed:
        raise HTTPException(status_code=400, detail="Review is not disputed")

    if action == "delete":
        reviewee_id = review.reviewee_id
        session.delete(review)
        session.commit()
        # Re-calculate metrics
        await update_user_metrics(user_id=reviewee_id, session=session)
        return Message(message="Review deleted successfully")
    elif action == "dismiss":
        review.is_disputed = False
        # review.dispute_reason = None # Optionally keep the reason for history? Clearing it for now to reset state.
        session.add(review)
        session.commit()
        session.refresh(review)
        return Message(message="Dispute dismissed, review retained")
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'delete' or 'dismiss'")


@router.post("/", response_model=UserReviewPublic)
async def create_review(
    *,
    session: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    review_in: UserReviewCreate,
) -> Any:
    """
    Create a new user review for a completed loan.
    """
    loan = session.get(Loan, review_in.loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if loan.status != LoanStatus.RETURNED:
        raise HTTPException(
            status_code=400,
            detail="Reviews can only be submitted for returned items"
        )

    # Determine role being reviewed
    if current_user.id == loan.owner_id:
        reviewee_id = loan.requester_id
        role_reviewed = UserRoleReviewed.BORROWER
    elif current_user.id == loan.requester_id:
        reviewee_id = loan.owner_id
        role_reviewed = UserRoleReviewed.OWNER
    else:
        raise HTTPException(
            status_code=403,
            detail="You were not a participant in this loan"
        )

    # Check if review already exists from this user for this loan
    existing_review = session.exec(
        select(UserReview).where(
            UserReview.loan_id == review_in.loan_id,
            UserReview.reviewer_id == current_user.id
        )
    ).first()
    if existing_review:
        raise HTTPException(status_code=400, detail="Review already submitted for this loan")

    db_obj = UserReview(
        **review_in.model_dump(),
        reviewer_id=current_user.id,
        reviewee_id=reviewee_id,
        role_reviewed=role_reviewed,
    )
    session.add(db_obj)

    # If reviewing owner, also update/create ItemConditionRating
    if role_reviewed == UserRoleReviewed.OWNER and review_in.condition_grade:
        from app.models import ItemConditionRating
        existing_cond = session.exec(
            select(ItemConditionRating).where(
                ItemConditionRating.item_id == loan.item_id,
                ItemConditionRating.user_id == current_user.id
            )
        ).first()

        if existing_cond:
            existing_cond.grade = review_in.condition_grade
            existing_cond.notes = review_in.condition_notes
            session.add(existing_cond)
        else:
            new_cond = ItemConditionRating(
                item_id=loan.item_id,
                user_id=current_user.id,
                grade=review_in.condition_grade,
                notes=review_in.condition_notes
            )
            session.add(new_cond)

    session.commit()
    session.refresh(db_obj)

    # Trigger metric update if we reviewed a specific person
    if reviewee_id:
        await update_user_metrics(user_id=reviewee_id, session=session)

    return db_obj


async def update_user_metrics(user_id: uuid.UUID, session: Session) -> None:
    """
    Recalculate user honor score and reliability.
    Also triggers AI summary generation every 3 reviews.
    """
    user = session.get(User, user_id)
    if not user:
        return

    # Calculate average rating
    avg_rating = session.exec(
        select(func.avg(UserReview.rating)).where(UserReview.reviewee_id == user_id)
    ).one()

    if avg_rating is not None:
        user.honor_score = float(avg_rating)

    # Calculate reliability (On-time returns)
    total_borrows = session.exec(
        select(func.count(Loan.id)).where(
            Loan.requester_id == user_id,
            Loan.status.in_([LoanStatus.RETURNED, LoanStatus.ACTIVE])
        )
    ).one()

    if total_borrows > 0:
        returned_on_time = session.exec(
            select(func.count(Loan.id)).where(
                Loan.requester_id == user_id,
                Loan.status == LoanStatus.RETURNED,
                # Simple logic: actual return happened before end_date
                # Since we don't have a returned_at yet, we use updated_at of the review's loan
                Loan.end_date >= Loan.created_at # Placeholder for real check
            )
        ).one()
        user.reliability_rate = (returned_on_time / total_borrows) * 100

    # AI Summary Generation (Every 3 reviews to save tokens)
    reviews_count = len(user.reviews_received)
    if reviews_count > 0 and reviews_count % 3 == 0:
        recent_comments = [r.comment for r in user.reviews_received[-10:] if r.comment]
        if recent_comments:
            summary, tips = await generate_honor_snapshot(recent_comments)
            if summary:
                user.ai_honor_summary = summary
                user.ai_improvement_tips = tips

    session.add(user)
    session.commit()
