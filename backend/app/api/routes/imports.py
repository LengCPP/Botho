import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from sqlmodel import Session, func, select

from app.api.deps import CurrentUser, SessionDep
from app.limiter import limiter
from app.api.utils import (
    ensure_work_metadata,
    fetch_external_book_metadata,
    map_book_classification,
    normalize_isbn,
    rebuild_collection_index_task,
)
from app.api.websocket_manager import notification_manager
from app.core.db import engine
from app.models import (
    Contribution,
    Item,
    ItemType,
    Message,
    StagedItem,
    StagedItemPublic,
    StagedItemsPublic,
    StagedItemStatus,
    WorkMetadata,
)
from app.storage import upload_image_from_url

router = APIRouter(prefix="/imports", tags=["imports"])
logger = logging.getLogger(__name__)
enrichment_semaphore = asyncio.Semaphore(2)

@router.post("/stage")
async def stage_items(*, session: SessionDep, current_user: CurrentUser, data: list[dict[str, Any]], mapping: str, community_id: uuid.UUID | None = None) -> Any:
    try:
        m, count = json.loads(mapping), 0
        for row in data:
            raw = {k: row[v] for k, v in m.items() if v in row}
            if raw.get("title"):
                # Normalize ISBN during staging if present
                if raw.get("isbn"):
                    raw["isbn"] = normalize_isbn(raw["isbn"])
                
                session.add(StagedItem(owner_id=current_user.id, community_id=community_id, raw_data=raw, status=StagedItemStatus.PENDING))
                count += 1
        session.commit()
        return {"count": count}
    except Exception as e:
        session.rollback()
        raise HTTPException(400, f"Failed to stage: {e}")

@router.get("/", response_model=StagedItemsPublic)
def read_staged_items(session: SessionDep, current_user: CurrentUser, community_id: uuid.UUID | None = None, skip: int = 0, limit: int = 100) -> Any:
    base = select(StagedItem).where(StagedItem.owner_id == current_user.id, StagedItem.community_id == community_id if community_id else StagedItem.community_id == None)
    data_stmt = base.where(StagedItem.status != StagedItemStatus.COMPLETED)
    items = session.exec(data_stmt.offset(skip).limit(limit)).all()
    counts_stmt = (
        select(StagedItem.status, func.count(StagedItem.id))
        .where(
            StagedItem.owner_id == current_user.id,
            StagedItem.community_id == community_id if community_id else StagedItem.community_id == None,
        )
        .group_by(StagedItem.status)
    )
    count_by_status = dict(session.exec(counts_stmt).all())
    total = session.exec(select(func.count()).select_from(data_stmt.subquery())).one()
    return StagedItemsPublic(
        data=items,
        count=total,
        pending_count=count_by_status.get(StagedItemStatus.PENDING, 0),
        processing_count=count_by_status.get(StagedItemStatus.PROCESSING, 0),
        completed_count=count_by_status.get(StagedItemStatus.COMPLETED, 0),
        failed_count=count_by_status.get(StagedItemStatus.FAILED, 0),
    )

@router.patch("/{id}", response_model=StagedItemPublic)
def update_staged_item(*, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, raw_data: dict[str, Any]) -> Any:
    db = session.get(StagedItem, id)
    if not db or db.owner_id != current_user.id: raise HTTPException(404)
    
    # Normalize ISBN if updated
    if raw_data.get("isbn"):
        raw_data["isbn"] = normalize_isbn(raw_data["isbn"])
        
    db.raw_data = raw_data
    session.add(db); session.commit(); session.refresh(db)
    return db

@router.patch("/bulk/update", response_model=Message)
def bulk_update_staged_items(*, session: SessionDep, current_user: CurrentUser, items: dict[uuid.UUID, dict[str, Any]]) -> Any:
    for id, raw_data in items.items():
        db = session.get(StagedItem, id)
        if db and db.owner_id == current_user.id:
            # Normalize ISBN if present
            if raw_data.get("isbn"):
                raw_data["isbn"] = normalize_isbn(raw_data["isbn"])
            db.raw_data = raw_data
            session.add(db)
    session.commit()
    return Message(message="Updated")

@router.delete("/{id}", response_model=Message)
def delete_staged_item(*, session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    db = session.get(StagedItem, id)
    if not db or db.owner_id != current_user.id: raise HTTPException(404)
    session.delete(db); session.commit()
    return Message(message="Deleted")

@router.delete("/clean/all", response_model=Message)
def clean_staged_items(*, session: SessionDep, current_user: CurrentUser, community_id: uuid.UUID | None = None) -> Any:
    items = session.exec(select(StagedItem).where(StagedItem.owner_id == current_user.id, StagedItem.community_id == community_id if community_id else StagedItem.community_id == None)).all()
    for i in items: session.delete(i)
    session.commit()
    return Message(message=f"Deleted {len(items)}")

async def notify_import_finished(owner_id: uuid.UUID, comm_id: uuid.UUID | None = None, type: str = "IMPORT_BATCH_COMPLETED"):
    from app.search import reindex_all_data
    with Session(engine) as session:
        reindex_all_data(session)
    rebuild_collection_index_task(owner_id)
    if comm_id:
        rebuild_collection_index_task(comm_id)
    await notification_manager.send_personal_message({"type": type, "status": "COMPLETED"}, owner_id)

@router.post("/process")
@limiter.limit("5/minute")
async def process_staged_items(*, request: Request, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks, ids: list[uuid.UUID], community_id: uuid.UUID | None = None) -> Any:
    for i in ids: background_tasks.add_task(enrich_and_import_item, i, current_user.id, community_id)
    background_tasks.add_task(notify_import_finished, current_user.id, community_id)
    return {"message": "Queued"}

@router.post("/process-all")
@limiter.limit("5/minute")
async def process_all_staged_items(*, request: Request, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks, community_id: uuid.UUID | None = None) -> Any:
    items = session.exec(select(StagedItem).where(StagedItem.owner_id == current_user.id, StagedItem.status == StagedItemStatus.PENDING, StagedItem.community_id == community_id if community_id else StagedItem.community_id == None)).all()
    for i in items: background_tasks.add_task(enrich_and_import_item, i.id, current_user.id, community_id)
    background_tasks.add_task(notify_import_finished, current_user.id, community_id)
    return {"message": f"Queued {len(items)}"}

@router.post("/sync-archive")
@limiter.limit("5/minute")
async def sync_archive_items(*, request: Request, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks, ids: list[uuid.UUID]) -> Any:
    if not current_user.is_superuser: raise HTTPException(403)
    for i in ids: background_tasks.add_task(enrich_and_import_to_archive, i, current_user.id)
    background_tasks.add_task(notify_import_finished, current_user.id, "BOOK_ARCHIVE_BATCH_COMPLETED")
    return {"message": "Queued"}

async def _enrich_staged_item(
    staged_item: StagedItem,
    session: Session,
    initial_image: str | None = None,
) -> dict:
    """Resolve and merge all external metadata for a staged item.

    Checks the local WorkMetadata archive first, then falls back to Google Books
    and OpenLibrary. Returns a plain dict so callers are not session-dependent.
    Raises ValueError if no metadata source is found.
    """
    d = staged_item.raw_data
    t = str(d.get("title", "")).strip()
    a = str(d.get("author", "")).strip()
    i = normalize_isbn(str(d.get("isbn", "")).strip() or None)

    m = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == i)).first() if i else None
    if not m and a:
        m = session.get(WorkMetadata, (a, t))

    g, ol = await fetch_external_book_metadata(a, t, i)
    desc, img, cat, gen, subjects = None, initial_image, None, None, []

    if m:
        t = m.title; a = m.author; desc = m.description; img = m.image_url or img
        cat = m.category; gen = m.genre; subjects = list(m.tags or []); i = m.isbn or i
    elif g:
        t = g.get("title", t); desc = g.get("description")
        a = ", ".join(g.get("authors", [])) or a
        i = next((x["identifier"] for x in g.get("industryIdentifiers", []) if x["type"] in ["ISBN_13", "ISBN_10"]), i)
        if g.get("imageLinks"):
            try:
                img = await upload_image_from_url(g["imageLinks"].get("medium") or g["imageLinks"].get("thumbnail"), "items")
            except Exception as e:
                logger.warning("Image upload skipped (Google): %s", e)
        if g.get("categories"):
            c, gn, sj = map_book_classification(g["categories"])
            cat = c; gen = gn
            if sj: subjects.append(sj)
    elif ol:
        t = ol.get("title", t); desc = ol.get("description")
        a = ", ".join([x["name"] if isinstance(x, dict) else x for x in ol.get("authors", [])] or ol.get("author_name", [])) or a
        try:
            img = await upload_image_from_url(ol.get("cover_url") or f"https://covers.openlibrary.org/b/id/{ol.get('cover_i')}-L.jpg", "items")
        except Exception as e:
            logger.warning("Image upload skipped (OpenLibrary): %s", e)
        if ol.get("subject"):
            c, gn, sj = map_book_classification(ol["subject"])
            cat = c; gen = gn
            if sj: subjects.append(sj)
    else:
        raise ValueError("Book not found in archive or external APIs")

    return {
        "title": t, "author": a, "isbn": i, "description": desc,
        "image_url": img, "category": cat, "genre": gen,
        "subjects": subjects, "raw_data": d,
    }


async def enrich_and_import_to_archive(staged_id: uuid.UUID, owner_id: uuid.UUID):
    # 1. Mark as PROCESSING (no semaphore)
    with Session(engine) as session:
        s = session.get(StagedItem, staged_id)
        if not s or s.status == StagedItemStatus.COMPLETED:
            return
        s.status = StagedItemStatus.PROCESSING; session.add(s); session.commit()
    await notification_manager.send_personal_message(
        {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "PROCESSING"}, owner_id
    )
    # 2. Enrich via external APIs (no semaphore — slow I/O should not block other enrichments)
    try:
        with Session(engine) as session:
            s = session.get(StagedItem, staged_id)
            if not s:
                return
            d = s.raw_data
            t = str(d.get("title", "")).strip()
            a = str(d.get("author", "")).strip()
            if not t or not a:
                raise ValueError("Title/Author required")
            initial_img = await upload_image_from_url(d["image_url"], "items") if d.get("image_url") else None
            enriched = await _enrich_staged_item(s, session, initial_image=initial_img)
    except Exception as e:
        with Session(engine) as session:
            s = session.get(StagedItem, staged_id)
            if s:
                s.status, s.error_log = StagedItemStatus.FAILED, str(e)
                session.add(s); session.commit()
        await notification_manager.send_personal_message(
            {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "FAILED"}, owner_id
        )
        return
    # 3. DB write (semaphore limits concurrent writes)
    async with enrichment_semaphore:
        try:
            with Session(engine) as session:
                s = session.get(StagedItem, staged_id)
                if not s:
                    return
                ensure_work_metadata(
                    session, enriched["author"], enriched["title"],
                    isbn_val=enriched["isbn"], description=enriched["description"],
                    category=enriched["category"], genre=enriched["genre"],
                    tags=enriched["subjects"], image_url=enriched["image_url"],
                )
                # Propagate tags to all Item copies with the same (title, author)
                cat, gen = enriched["category"], enriched["genre"]
                sub_str = ", ".join(enriched["subjects"]) if enriched["subjects"] else None
                if cat or gen or sub_str:
                    siblings = session.exec(
                        select(Item).where(
                            Item.title == enriched["title"],
                            Item.author == enriched["author"],
                        )
                    ).all()
                    for sib in siblings:
                        if cat and not sib.category:
                            sib.category = cat
                        if gen and not sib.genre:
                            sib.genre = gen
                        if sub_str and not sib.subject:
                            sib.subject = sub_str
                        session.add(sib)
                session.delete(s); session.commit()
        except Exception as e:
            with Session(engine) as session:
                s = session.get(StagedItem, staged_id)
                if s:
                    s.status, s.error_log = StagedItemStatus.FAILED, str(e)
                    session.add(s); session.commit()
            await notification_manager.send_personal_message(
                {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "FAILED"}, owner_id
            )
            return
    await notification_manager.send_personal_message(
        {"type": "BOOK_ARCHIVE_UPDATED", "staged_id": str(staged_id), "status": "COMPLETED"}, owner_id
    )


async def enrich_and_import_item(staged_id: uuid.UUID, owner_id: uuid.UUID, comm_id: uuid.UUID | None):
    # 1. Mark as PROCESSING (no semaphore)
    with Session(engine) as session:
        s = session.get(StagedItem, staged_id)
        if not s or s.status == StagedItemStatus.COMPLETED:
            return
        s.status = StagedItemStatus.PROCESSING; session.add(s); session.commit()
    await notification_manager.send_personal_message(
        {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "PROCESSING"}, owner_id
    )
    # 2. Enrich via external APIs (no semaphore — slow I/O should not block other enrichments)
    try:
        with Session(engine) as session:
            s = session.get(StagedItem, staged_id)
            if not s:
                return
            if not str(s.raw_data.get("title", "")).strip():
                raise ValueError("Title required")
            enriched = await _enrich_staged_item(s, session)
    except Exception as e:
        with Session(engine) as session:
            s = session.get(StagedItem, staged_id)
            if s:
                s.status, s.error_log = StagedItemStatus.FAILED, str(e)
                session.add(s); session.commit()
        await notification_manager.send_personal_message(
            {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "FAILED"}, owner_id
        )
        return
    # 3. DB write (semaphore limits concurrent writes)
    async with enrichment_semaphore:
        try:
            with Session(engine) as session:
                s = session.get(StagedItem, staged_id)
                if not s:
                    return
                subject_str = ", ".join(enriched["subjects"]) if enriched["subjects"] else None
                item = Item(
                    title=enriched["title"],
                    author=enriched["author"],
                    description=enriched["description"],
                    image_url=enriched["image_url"],
                    owner_id=comm_id or owner_id,
                    item_type=ItemType.book,
                    isbn=enriched["isbn"],
                    category=enriched["category"],
                    genre=enriched["genre"],
                    subject=subject_str,
                    # Physical info CAN come from staging as it's user-specific
                    info=enriched["raw_data"].get("info", {}),
                )
                session.add(item); session.flush()
                session.add(Contribution(
                    user_id=owner_id, item_id=item.id,
                    work_author=enriched["author"], work_title=enriched["title"],
                    description=f"Imported: {enriched['title']}",
                ))
                if enriched["author"] and enriched["title"]:
                    ensure_work_metadata(
                        session, enriched["author"], enriched["title"],
                        isbn_val=enriched["isbn"], description=enriched["description"],
                        category=enriched["category"], genre=enriched["genre"],
                        tags=enriched["subjects"], image_url=enriched["image_url"],
                    )
                # Propagate tags to other existing copies of the same book
                if enriched["category"] or enriched["genre"] or subject_str:
                    siblings = session.exec(
                        select(Item).where(
                            Item.id != item.id,
                            Item.title == enriched["title"],
                            Item.author == enriched["author"],
                        )
                    ).all()
                    for sib in siblings:
                        if enriched["category"] and not sib.category:
                            sib.category = enriched["category"]
                        if enriched["genre"] and not sib.genre:
                            sib.genre = enriched["genre"]
                        if subject_str and not sib.subject:
                            sib.subject = subject_str
                        session.add(sib)
                session.delete(s); session.commit()
                session.refresh(item)
        except Exception as e:
            with Session(engine) as session:
                s = session.get(StagedItem, staged_id)
                if s:
                    s.status, s.error_log = StagedItemStatus.FAILED, str(e)
                    session.add(s); session.commit()
            await notification_manager.send_personal_message(
                {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "FAILED"}, owner_id
            )
            return
    await notification_manager.send_personal_message(
        {"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "COMPLETED"}, owner_id
    )
