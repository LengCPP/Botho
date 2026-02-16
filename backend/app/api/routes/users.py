import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, func, or_, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.api.utils import filter_user_privacy
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.models import (
    CommunityItem,
    Contribution,
    ForgivenessReason,
    Friendship,
    FriendshipStatus,
    Interest,
    Item,
    ItemReview,
    Loan,
    LoanStatus,
    Message,
    UpdatePassword,
    User,
    UserCreate,
    UserProfile,
    UserProfileUpdate,
    UserPublic,
    UserRegister,
    UserReportCardPublic,
    UserReputationSchema,
    UserReview,
    UserReviewPublic,
    UserRoleReviewed,
    UserSettingsSchema,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.search import delete_item_from_search
from app.storage import delete_image, upload_image
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


def calculate_honor_score(session: Session, user: User) -> dict[str, Any]:
    """
    Calculate honor score based on user activity.
    """
    # 1. Defaulted/Returned Penalty: defaulted/total_returned * -100
    returned_count = session.exec(
        select(func.count()).select_from(Loan).where(Loan.requester_id == user.id, Loan.status == LoanStatus.RETURNED)
    ).one()

    # Only count defaults that are NOT forgiven, OR forgiven for "OTHER" reasons
    # (GOOD_REASON, FOUND_AND_RETURNED, REPLACED_ITEM clear the penalty)
    defaulted_count = session.exec(
        select(func.count()).select_from(Loan).where(
            Loan.requester_id == user.id,
            Loan.status == LoanStatus.DEFAULTED,
            or_(
                Loan.is_forgiven == False,
                Loan.forgiveness_reason == ForgivenessReason.OTHER
            )
        )
    ).one()

    total_returned_or_penalized_default = returned_count + defaulted_count

    default_penalty = 0
    if total_returned_or_penalized_default > 0:
        # Penalty is proportional to default rate, capped at -100
        default_penalty = (defaulted_count / total_returned_or_penalized_default) * -100

    # 2. Community Pooling: (pooled / owned) * 15 (capped at 6 items)
    owned_count = session.exec(
        select(func.count()).select_from(Item).where(Item.owner_id == user.id)
    ).one()

    pooled_count = session.exec(
        select(func.count()).select_from(CommunityItem).where(CommunityItem.added_by == user.id)
    ).one()

    pooling_bonus = 15 # Baseline: full points if no items owned yet
    if owned_count > 0:
        # Bonus based on what percentage of your (up to 6) items you share
        denominator = min(owned_count, 6)
        numerator = min(pooled_count, denominator)
        pooling_bonus = (numerator / denominator) * 15

    # 3. Book Reviews: (reviews / borrowed) * 15 (capped at 1:1)
    borrowed_count = session.exec(
        select(func.count()).select_from(Loan).where(Loan.requester_id == user.id, Loan.status.in_([LoanStatus.RETURNED, LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.DEFAULTED]))
    ).one()

    reviews_count = session.exec(
        select(func.count()).select_from(ItemReview).where(ItemReview.user_id == user.id)
    ).one()

    review_bonus = 15 # Baseline: full points if never borrowed anything
    if borrowed_count > 0:
        review_bonus = (min(reviews_count, borrowed_count) / borrowed_count) * 15

    # 4. Approval Rate: (approved / received) * 10
    received_count = session.exec(
        select(func.count()).select_from(Loan).where(Loan.owner_id == user.id)
    ).one()

    # Exclude cancelled/pending from approval calculation to be fair
    decided_stmt = select(func.count()).select_from(Loan).where(
        Loan.owner_id == user.id,
        Loan.status.in_([LoanStatus.ACCEPTED, LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.RETURNED, LoanStatus.REJECTED, LoanStatus.DEFAULTED])
    )
    decided_count = session.exec(decided_stmt).one()

    approved_count = session.exec(
        select(func.count()).select_from(Loan).where(
            Loan.owner_id == user.id,
            Loan.status.in_([LoanStatus.ACCEPTED, LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.RETURNED])
        )
    ).one()

    approval_bonus = 10 # Baseline: full points if never received a request
    if decided_count > 0:
        approval_bonus = (approved_count / decided_count) * 10

    # 5. Spec Updates: (contributions / borrowed) * 10 (clamped 1:1)
    updates_count = session.exec(
        select(func.count()).select_from(Contribution).where(Contribution.user_id == user.id)
    ).one()

    updates_bonus = 10 # Baseline: full points if never borrowed
    if borrowed_count > 0:
        updates_bonus = (min(updates_count, borrowed_count) / borrowed_count) * 10

    # 6. Average Rating from Lenders: (avg_rating / 5) * 25
    ratings_stmt = select(func.avg(UserReview.rating)).where(
        UserReview.reviewee_id == user.id,
        UserReview.role_reviewed == UserRoleReviewed.BORROWER
    )
    avg_rating = session.exec(ratings_stmt).one() or 0.0
    rating_bonus = (float(avg_rating) / 5.0) * 25
    if not avg_rating:
        rating_bonus = 25 # Start with full trust until rated poorly

    # 7. Punctuality: (on_time / total_returned) * 25
    on_time_count = session.exec(
        select(func.count()).select_from(Loan).where(
            Loan.requester_id == user.id,
            Loan.status == LoanStatus.RETURNED,
            Loan.returned_at <= Loan.end_date
        )
    ).one()

    punctuality_bonus = 0
    if returned_count > 0:
        punctuality_bonus = (on_time_count / returned_count) * 25
    else:
        punctuality_bonus = 25 # Perfect punctuality if never borrowed

    # 8. Overdue Penalty: -15 per item currently past end_date
    overdue_count = session.exec(
        select(func.count()).select_from(Loan).where(
            Loan.requester_id == user.id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING]),
            Loan.end_date < datetime.now(timezone.utc)
        )
    ).one()

    overdue_penalty = overdue_count * -15

    # Final Score Calculation
    total_score = default_penalty + pooling_bonus + review_bonus + approval_bonus + updates_bonus + rating_bonus + punctuality_bonus + overdue_penalty
    final_score = max(0.0, min(100.0, total_score))

    # Delinquent if any un-forgiven defaults OR significantly overdue (e.g. > 7 days)
    unforgiven_defaults = session.exec(
        select(func.count()).select_from(Loan).where(
            Loan.requester_id == user.id,
            Loan.status == LoanStatus.DEFAULTED,
            Loan.is_forgiven == False
        )
    ).one()

    return {
        "honor_score": round(final_score, 2),
        "is_delinquent": unforgiven_defaults > 0,
        "reliability_rate": round((punctuality_bonus / 25.0) * 100, 2) if punctuality_bonus > 0 else 100.0
    }


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
def read_users(session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100) -> Any:
    """
    Retrieve users.
    """

    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = select(User).offset(skip).limit(limit)
    users = session.exec(statement).all()

    return UsersPublic(
        data=[filter_user_privacy(u, current_user.id, is_admin=current_user.is_superuser) for u in users],
        count=count
    )


@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    """
    Create new user.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    user = crud.create_user(session=session, user_create=user_in)
    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.patch("/me", response_model=UserPublic)
def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe,
    current_user: CurrentUser
) -> Any:
    """
    Update own user.
    """

    user_data = user_in.model_dump(exclude_unset=True)
    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return filter_user_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)


@router.patch("/me/password", response_model=Message)
def update_password_me(
    *, session: SessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """
    Update own password.
    """
    # If the user has not set a password (e.g. Google signup), skip verification
    if current_user.has_set_password:
        if not verify_password(body.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect password")

    if body.current_password == body.new_password and current_user.has_set_password:
        raise HTTPException(
            status_code=400, detail="New password cannot be the same as the current one"
        )
    hashed_password = get_password_hash(body.new_password)
    current_user.hashed_password = hashed_password
    current_user.has_set_password = True
    session.add(current_user)
    session.commit()
    return Message(message="Password updated successfully")


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """
    Get current user.
    """
    return filter_user_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)



@router.patch("/me/profile", response_model=UserPublic)
def update_user_profile(
    *, session: SessionDep, profile_in: UserProfileUpdate, current_user: CurrentUser
) -> Any:
    """
    Update own user profile.
    """
    if not current_user.profile:
        current_user.profile = UserProfile(user_id=current_user.id)

    if profile_in.bio is not None:
        current_user.profile.bio = profile_in.bio

    if profile_in.alias is not None:
        current_user.profile.alias = profile_in.alias

    if profile_in.interest_ids is not None:
        current_user.interests.clear()
        for interest_id in profile_in.interest_ids:
            interest = session.get(Interest, interest_id)
            if interest:
                current_user.interests.append(interest)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return filter_user_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)


@router.post("/me/profile-picture", response_model=UserPublic)
async def upload_user_profile_picture(
    *, session: SessionDep, current_user: CurrentUser, file: UploadFile = File(...)
) -> Any:
    """
    Upload a profile picture for the current user.
    """
    if not current_user.profile:
        current_user.profile = UserProfile(user_id=current_user.id)

    contents = await file.read()
    if len(contents) > settings.max_image_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Image size exceeds the {settings.MAX_IMAGE_SIZE_MB}MB limit."
        )

    image_url = upload_image(contents, file.filename, folder="profile-pictures")

    if not image_url:
        raise HTTPException(status_code=500, detail="Failed to upload image")

    current_user.profile.image_url = image_url
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return filter_user_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)


@router.get("/me/settings", response_model=UserSettingsSchema)
def read_user_settings_me(current_user: CurrentUser) -> Any:
    """
    Get current user settings.
    """
    return current_user.settings


@router.patch("/me/settings", response_model=UserPublic)
def update_user_settings(
    *, session: SessionDep, settings_in: UserSettingsSchema, current_user: CurrentUser
) -> Any:
    """
    Update own user settings.
    """
    current_settings = current_user.settings or {}
    new_settings = settings_in.model_dump(exclude_unset=True)
    updated_settings = {**current_settings, **new_settings}

    current_user.settings = updated_settings
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return filter_user_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)


@router.delete("/me", response_model=Message)
def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Delete own user.
    """
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )

    # Check for outstanding loans where user is the borrower and has possession
    outstanding_loans = session.exec(
        select(Loan).where(
            Loan.requester_id == current_user.id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING])
        )
    ).first()

    if outstanding_loans:
        raise HTTPException(
            status_code=400,
            detail="You have active borrowed items. Please return all items before deleting your account."
        )

    # Handle items deletion and cleanup
    for item in list(current_user.items):
        if item.image_url:
            delete_image(item.image_url)
        delete_item_from_search(item.id)
        session.delete(item)

    session.delete(current_user)
    session.commit()
    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
def register_user(session: SessionDep, user_in: UserRegister) -> Any:
    """
    Create new user without the need to be logged in.
    """
    user = crud.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    user_create = UserCreate.model_validate(user_in)
    user = crud.create_user(session=session, user_create=user_create)

    if settings.emails_enabled and user_in.email:
        from datetime import timedelta

        from app.utils import generate_password_reset_token, generate_verification_email
        verification_token = generate_password_reset_token(email=user_in.email, expires_delta=timedelta(minutes=3))
        email_data = generate_verification_email(
            email_to=user_in.email, email=user_in.email, token=verification_token
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check friendship status
    statement = select(Friendship).where(
        Friendship.user_id == current_user.id,
        Friendship.friend_id == user_id
    )
    friendship = session.exec(statement).first()
    is_friend = friendship.status == FriendshipStatus.ACCEPTED if friendship else False

    user_public = filter_user_privacy(user, current_user.id, is_admin=current_user.is_superuser, is_friend=is_friend)
    user_public.friendship_status = friendship.status if friendship else None

    # Restrict data if not friends (and not the same user, though this route is for "other" users)
    if not current_user.is_superuser and user_id != current_user.id and (not friendship or friendship.status != FriendshipStatus.ACCEPTED):
        user_public.communities = []
        user_public.interests = []
        # We don't have items in UserPublic directly yet based on models.py but it has Relationship.
        # If UserPublic had items, we'd clear them here too.

    return user_public


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
) -> Any:
    """
    Update a user.
    """

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user_in.email:
        existing_user = crud.get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=409, detail="User with this email already exists"
            )

    db_user = crud.update_user(session=session, db_user=db_user, user_in=user_in)
    return db_user


@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_user(
    session: SessionDep, current_user: CurrentUser, user_id: uuid.UUID
) -> Message:
    """
    Delete a user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user == current_user:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )

    # Check for outstanding loans where user is the borrower and has possession
    outstanding_loans = session.exec(
        select(Loan).where(
            Loan.requester_id == user.id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING])
        )
    ).first()

    if outstanding_loans:
        raise HTTPException(
            status_code=400,
            detail="User has active borrowed items. These must be resolved before deletion."
        )

    # Handle items deletion and cleanup
    for item in list(user.items):
        if item.image_url:
            delete_image(item.image_url)
        delete_item_from_search(item.id)
        session.delete(item)

    session.delete(user)
    session.commit()
    return Message(message="User deleted successfully")


@router.get("/me/reputation", response_model=UserReputationSchema)
def read_user_reputation_me(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get current user's reputation summary (AI synthesized).
    """
    score_data = calculate_honor_score(session, current_user)
    current_user.honor_score = score_data["honor_score"]
    current_user.reliability_rate = score_data["reliability_rate"]
    current_user.is_delinquent = score_data["is_delinquent"]
    session.add(current_user)
    session.commit()

    # Ensure ai_honor_summary is a string if it's stored as JSON
    summary = current_user.ai_honor_summary
    if isinstance(summary, dict):
        summary = json.dumps(summary)

    return UserReputationSchema(
        honor_score=current_user.honor_score,
        reliability_rate=current_user.reliability_rate,
        is_delinquent=current_user.is_delinquent,
        ai_honor_summary=summary,
        ai_improvement_tips=current_user.ai_improvement_tips or [],
        review_count=len(current_user.reviews_received)
    )


@router.get("/{user_id}/report-card", response_model=UserReportCardPublic)
def read_user_report_card(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a user's full report card (Raw comments).
    Only accessible by Admins or if the user is requesting a loan from the current user.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Access Control: Admin or active/pending loan interaction
    has_access = current_user.is_superuser

    if not has_access:
        # Check if this user has requested anything from current_user
        loan_interaction = session.exec(
            select(Loan).where(
                Loan.owner_id == current_user.id,
                Loan.requester_id == user_id,
                Loan.status.in_([LoanStatus.PENDING, LoanStatus.ACCEPTED, LoanStatus.ACTIVE, LoanStatus.EXTENSION_PENDING])
            )
        ).first()
        if loan_interaction:
            has_access = True

    if not has_access:
        # Check if they are in a community where current_user is admin
        from app.models import CommunityMember, CommunityMemberRole
        admin_communities = session.exec(
            select(CommunityMember.community_id).where(
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN
            )
        ).all()

        if admin_communities:
            shared_community = session.exec(
                select(CommunityMember).where(
                    CommunityMember.user_id == user_id,
                    CommunityMember.community_id.in_(admin_communities)
                )
            ).first()
            if shared_community:
                has_access = True

    if not has_access:
        raise HTTPException(status_code=403, detail="Insufficient permissions to view raw report card")

    reviews = []
    for r in user.reviews_received:
        if r.role_reviewed != UserRoleReviewed.BORROWER:
            continue
        reviewer_name = r.reviewer.full_name or r.reviewer.email
        reviews.append(
            UserReviewPublic(
                **r.model_dump(),
                reviewer_name=reviewer_name
            )
        )

    # Ensure ai_honor_summary is a string if it's stored as JSON
    summary = user.ai_honor_summary
    if isinstance(summary, dict):
        import json
        summary = json.dumps(summary)

    return UserReportCardPublic(
        user=filter_user_privacy(user, current_user.id, is_admin=current_user.is_superuser),
        reviews=reviews,
        metrics=UserReputationSchema(
            honor_score=user.honor_score,
            reliability_rate=user.reliability_rate,
            is_delinquent=user.is_delinquent,
            ai_honor_summary=summary,
            ai_improvement_tips=user.ai_improvement_tips or [],
            review_count=len(user.reviews_received)
        )
    )
