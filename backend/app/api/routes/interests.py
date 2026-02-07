from typing import Any

from fastapi import APIRouter
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Interest, InterestCreate, InterestPublic

router = APIRouter(prefix="/interests", tags=["interests"])


@router.get("/", response_model=list[InterestPublic])
def read_interests(
    session: SessionDep, skip: int = 0, limit: int = 100, q: str | None = None
) -> Any:
    """
    Retrieve interests.
    """
    statement = select(Interest)
    if q:
        statement = statement.where(col(Interest.name).ilike(f"%{q}%"))

    statement = statement.offset(skip).limit(limit)
    interests = session.exec(statement).all()
    return interests


@router.post("/", response_model=InterestPublic)
def create_interest(
    *, session: SessionDep, current_user: CurrentUser, interest_in: InterestCreate
) -> Any:
    """
    Create a new interest.
    """
    # Check if exists (case insensitive)
    existing = session.exec(
        select(Interest).where(col(Interest.name).ilike(interest_in.name))
    ).first()
    if existing:
        return existing

    interest = Interest.model_validate(interest_in)
    session.add(interest)
    session.commit()
    session.refresh(interest)
    return interest
