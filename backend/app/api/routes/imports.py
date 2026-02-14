import asyncio, json, logging, random, uuid
from typing import Any
from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlmodel import func, select, Session
from app.api.deps import CurrentUser, SessionDep
from app.api.utils import ensure_work_metadata, fetch_external_book_metadata
from app.models import Item, ItemType, Message, StagedItem, StagedItemPublic, StagedItemsPublic, StagedItemStatus, Contribution, WorkMetadata
from app.search import sync_item_to_search
from app.storage import upload_image_from_url
from app.api.websocket_manager import notification_manager
from app.core.db import engine

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
    cnt = lambda s: session.exec(select(func.count(StagedItem.id)).where(StagedItem.owner_id == current_user.id, StagedItem.community_id == community_id if community_id else StagedItem.community_id == None, StagedItem.status == s)).one()
    return StagedItemsPublic(data=items, count=session.exec(select(func.count()).select_from(data_stmt.subquery())).one(), pending_count=cnt(StagedItemStatus.PENDING), processing_count=cnt(StagedItemStatus.PROCESSING), completed_count=cnt(StagedItemStatus.COMPLETED), failed_count=cnt(StagedItemStatus.FAILED))

@router.patch("/{id}", response_model=StagedItemPublic)
def update_staged_item(*, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, raw_data: dict[str, Any]) -> Any:
    db = session.get(StagedItem, id)
    if not db or db.owner_id != current_user.id: raise HTTPException(404)
    db.raw_data = raw_data
    session.add(db); session.commit(); session.refresh(db)
    return db

@router.patch("/bulk/update", response_model=Message)
def bulk_update_staged_items(*, session: SessionDep, current_user: CurrentUser, items: dict[uuid.UUID, dict[str, Any]]) -> Any:
    for id, raw_data in items.items():
        db = session.get(StagedItem, id)
        if db and db.owner_id == current_user.id:
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

@router.post("/process")
async def process_staged_items(*, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks, ids: list[uuid.UUID], community_id: uuid.UUID | None = None) -> Any:
    for i in ids: background_tasks.add_task(enrich_and_import_item, i, current_user.id, community_id)
    return {"message": "Queued"}

@router.post("/process-all")
async def process_all_staged_items(*, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks, community_id: uuid.UUID | None = None) -> Any:
    items = session.exec(select(StagedItem).where(StagedItem.owner_id == current_user.id, StagedItem.status == StagedItemStatus.PENDING, StagedItem.community_id == community_id if community_id else StagedItem.community_id == None)).all()
    for i in items: background_tasks.add_task(enrich_and_import_item, i.id, current_user.id, community_id)
    return {"message": f"Queued {len(items)}"}

@router.post("/sync-archive")
async def sync_archive_items(*, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks, ids: list[uuid.UUID]) -> Any:
    if not current_user.is_superuser: raise HTTPException(403)
    for i in ids: background_tasks.add_task(enrich_and_import_to_archive, i, current_user.id)
    return {"message": "Queued"}

async def enrich_and_import_to_archive(staged_id: uuid.UUID, owner_id: uuid.UUID):
    async with enrichment_semaphore:
        await asyncio.sleep(random.uniform(1, 3))
        with Session(engine) as session:
            s = session.get(StagedItem, staged_id)
            if not s or s.status == StagedItemStatus.COMPLETED: return
            s.status = StagedItemStatus.PROCESSING; session.add(s); session.commit()
            await notification_manager.send_personal_message({"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "PROCESSING"}, owner_id)
            try:
                d = s.raw_data; t, a, i = str(d.get("title", "")).strip(), str(d.get("author", "")).strip(), str(d.get("isbn", "")).strip() or None
                if not t or not a: raise ValueError("Title/Author required")
                m = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == "".join(c for c in i if c.isdigit() or c.upper()=="X").upper())).first() if i else None
                if not m: m = session.get(WorkMetadata, (a, t))
                img = await upload_image_from_url(d["image_url"], "items") if d.get("image_url") else None
                g, ol = await fetch_external_book_metadata(a, t, i)
                desc, cat = str(d.get("description", "")).strip() or None, None
                if m: t, a, desc, img, cat, i = m.title, m.author, m.description or desc, m.image_url or img, m.category, m.isbn or i
                elif g:
                    t, desc, cat = g.get("title", t), g.get("description", desc), (g.get("categories") or [None])[0]
                    a, i = ", ".join(g.get("authors", [])) or a, next((x["identifier"] for x in g.get("industryIdentifiers", []) if x["type"] in ["ISBN_13", "ISBN_10"]), i)
                    if not img and g.get("imageLinks"):
                        try: img = await upload_image_from_url(g["imageLinks"].get("medium") or g["imageLinks"].get("thumbnail"), "items")
                        except: pass
                elif ol:
                    t, desc = ol.get("title", t), ol.get("description") or desc
                    a = ", ".join([x["name"] if isinstance(x, dict) else x for x in ol.get("authors", [])] or ol.get("author_name", [])) or a
                    if not img:
                        try: img = await upload_image_from_url(ol.get("cover_url") or f"https://covers.openlibrary.org/b/id/{ol.get('cover_i')}-L.jpg", "items")
                        except: pass
                ensure_work_metadata(session, a, t, isbn=i, description=desc, category=cat, image_url=img)
                s.status = StagedItemStatus.COMPLETED; session.add(s); session.commit()
                await notification_manager.send_personal_message({"type": "BOOK_ARCHIVE_UPDATED", "staged_id": str(staged_id), "status": "COMPLETED"}, owner_id)
            except Exception as e:
                s.status, s.error_log = StagedItemStatus.FAILED, str(e); session.add(s); session.commit()
                await notification_manager.send_personal_message({"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "FAILED"}, owner_id)

async def enrich_and_import_item(staged_id: uuid.UUID, owner_id: uuid.UUID, comm_id: uuid.UUID | None):
    async with enrichment_semaphore:
        await asyncio.sleep(random.uniform(1, 3))
        with Session(engine) as session:
            s = session.get(StagedItem, staged_id)
            if not s or s.status == StagedItemStatus.COMPLETED: return
            s.status = StagedItemStatus.PROCESSING; session.add(s); session.commit()
            await notification_manager.send_personal_message({"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "PROCESSING"}, owner_id)
            try:
                d = s.raw_data; t, a, i = str(d.get("title", "")).strip(), str(d.get("author", "")).strip(), str(d.get("isbn", "")).strip() or None
                if not t: raise ValueError("Title required")
                m = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == "".join(c for c in i if c.isdigit() or c.upper()=="X").upper())).first() if i else None
                if not m and a: m = session.get(WorkMetadata, (a, t))
                img = await upload_image_from_url(d["image_url"], "items") if d.get("image_url") else None
                g, ol = await fetch_external_book_metadata(a, t, i)
                desc, extra = str(d.get("description", "")).strip() or None, {}
                if m: t, a, desc, img, extra = m.title, m.author, m.description or desc, m.image_url or img, {"cat": m.category, "isbn": m.isbn, "tags": m.tags}
                elif g:
                    t, desc = g.get("title", t), g.get("description", desc)
                    a, i = ", ".join(g.get("authors", [])) or a, next((x["identifier"] for x in g.get("industryIdentifiers", []) if x["type"] in ["ISBN_13", "ISBN_10"]), i)
                    if not img and g.get("imageLinks"):
                        try: img = await upload_image_from_url(g["imageLinks"].get("medium") or g["imageLinks"].get("thumbnail"), "items")
                        except: pass
                    extra = {"isbn": i, "cat": (g.get("categories") or [None])[0]}
                elif ol:
                    t, desc = ol.get("title", t), ol.get("description") or desc
                    a = ", ".join([x["name"] if isinstance(x, dict) else x for x in ol.get("authors", [])] or ol.get("author_name", [])) or a
                    if not img:
                        try: img = await upload_image_from_url(ol.get("cover_url") or f"https://covers.openlibrary.org/b/id/{ol.get('cover_i')}-L.jpg", "items")
                        except: pass
                    extra = {"isbn": i, "subjects": ol.get("subject", [])}
                item = Item(title=t, author=a, description=desc, image_url=img, owner_id=comm_id or owner_id, item_type=ItemType.book, extra_data=extra)
                session.add(item); session.flush()
                session.add(Contribution(user_id=owner_id, item_id=item.id, work_author=a, work_title=t, description=f"Imported: {t}"))
                if a and t: ensure_work_metadata(session, a, t, isbn=extra.get("isbn") or i, description=desc, category=extra.get("cat"), image_url=img)
                s.status = StagedItemStatus.COMPLETED; session.add(s); session.commit(); sync_item_to_search(item)
                await notification_manager.send_personal_message({"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "COMPLETED"}, owner_id)
            except Exception as e:
                s.status, s.error_log = StagedItemStatus.FAILED, str(e); session.add(s); session.commit()
                await notification_manager.send_personal_message({"type": "IMPORT_ITEM_PROCESSED", "staged_id": str(staged_id), "status": "FAILED"}, owner_id)
