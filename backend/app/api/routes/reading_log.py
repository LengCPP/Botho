import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    ReadingLog,
    ReadingLogCreate,
    ReadingLogPublic,
    ReadingLogsPublic,
    ReadingLogStatus,
    ReadingLogUpdate,
    WorkMetadata,
)

router = APIRouter(prefix="/reading-log", tags=["reading-log"])

@router.get("/", response_model=ReadingLogsPublic)
def read_reading_log(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    status: ReadingLogStatus | None = None,
    author: str | None = None,
    title: str | None = None
) -> Any:
    """
    Retrieve reading log entries for the current user.
    """
    statement = select(ReadingLog).where(ReadingLog.user_id == current_user.id)

    if status:
        statement = statement.where(ReadingLog.status == status)
    if author:
        statement = statement.where(ReadingLog.author == author)
    if title:
        statement = statement.where(ReadingLog.title == title)

    statement = statement.order_by(ReadingLog.updated_at.desc())

    count = session.exec(select(func.count()).select_from(statement.subquery())).one()
    logs = session.exec(statement.offset(skip).limit(limit)).all()

    # Populate work_metadata if available
    public_logs = []
    for log in logs:
        meta = session.get(WorkMetadata, (log.author, log.title))
        public_logs.append(
            ReadingLogPublic(
                id=log.id,
                user_id=log.user_id,
                author=log.author,
                title=log.title,
                status=log.status,
                created_at=log.created_at,
                updated_at=log.updated_at,
                work_metadata=meta
            )
        )

    return ReadingLogsPublic(data=public_logs, count=count)

@router.post("/", response_model=ReadingLogPublic)
def create_reading_log_entry(
    *, session: SessionDep, current_user: CurrentUser, log_in: ReadingLogCreate
) -> Any:
    """
    Create or update a reading log entry.
    """
    # Check if entry already exists
    existing = session.exec(
        select(ReadingLog).where(
            ReadingLog.user_id == current_user.id,
            ReadingLog.author == log_in.author,
            ReadingLog.title == log_in.title
        )
    ).first()

    if existing:
        existing.status = log_in.status
        session.add(existing)
        session.commit()
        session.refresh(existing)
        log = existing
    else:
        log = ReadingLog(
            user_id=current_user.id,
            author=log_in.author,
            title=log_in.title,
            status=log_in.status
        )
        session.add(log)
        session.commit()
        session.refresh(log)

    meta = session.get(WorkMetadata, (log.author, log.title))
    return ReadingLogPublic(
        id=log.id,
        user_id=log.user_id,
        author=log.author,
        title=log.title,
        status=log.status,
        created_at=log.created_at,
        updated_at=log.updated_at,
        work_metadata=meta
    )

@router.patch("/{id}", response_model=ReadingLogPublic)
def update_reading_log_entry(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, log_in: ReadingLogUpdate
) -> Any:
    """
    Update a reading log entry status.
    """
    log = session.get(ReadingLog, id)
    if not log:
        raise HTTPException(status_code=404, detail="Reading log entry not found")
    if log.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    log.status = log_in.status
    session.add(log)
    session.commit()
    session.refresh(log)

    meta = session.get(WorkMetadata, (log.author, log.title))
    return ReadingLogPublic(
        id=log.id,
        user_id=log.user_id,
        author=log.author,
        title=log.title,
        status=log.status,
        created_at=log.created_at,
        updated_at=log.updated_at,
        work_metadata=meta
    )

@router.delete("/{id}", response_model=Message)
def delete_reading_log_entry(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Delete a reading log entry.
    """
    log = session.get(ReadingLog, id)
    if not log:
        raise HTTPException(status_code=404, detail="Reading log entry not found")
    if log.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    session.delete(log)
    session.commit()
    return Message(message="Reading log entry deleted successfully")
