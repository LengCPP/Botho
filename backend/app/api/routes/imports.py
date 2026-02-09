import json
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.api.utils import ensure_work_metadata
from app.models import (
    Item,
    ItemType,
    Message,
    StagedItem,
    StagedItemPublic,
    StagedItemsPublic,
    StagedItemStatus,
)
from app.search import sync_item_to_search
from app.storage import upload_image_from_url
import httpx
import asyncio
from app.core.config import settings

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/stage")
async def stage_items(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    data: list[dict[str, Any]], # Raw data from frontend
    mapping: str,               # JSON string of mapping
    community_id: uuid.UUID | None = None,
) -> Any:
    """
    Process the raw data and stage items for review.
    """
    try:
        mapping_dict = json.loads(mapping)
        staged_count = 0
        
        for row in data:
            raw_data = {}
            for system_key, file_key in mapping_dict.items():
                if file_key and file_key in row:
                    raw_data[system_key] = row[file_key]

            if not raw_data.get("title"):
                continue

            db_obj = StagedItem(
                owner_id=current_user.id,
                community_id=community_id,
                raw_data=raw_data,
                status=StagedItemStatus.PENDING,
            )
            session.add(db_obj)
            staged_count += 1

        session.commit()
        return {"count": staged_count}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to stage items: {str(e)}")


@router.get("/", response_model=StagedItemsPublic)
def read_staged_items(
    session: SessionDep,
    current_user: CurrentUser,
    community_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Get staged items for current user or community.
    """
    statement = select(StagedItem).where(StagedItem.owner_id == current_user.id)
    if community_id:
        statement = statement.where(StagedItem.community_id == community_id)
    else:
        statement = statement.where(StagedItem.community_id == None)

    # Filter data list to exclude COMPLETED items (they are now in the main collection)
    data_statement = statement.where(StagedItem.status != StagedItemStatus.COMPLETED)
    
    count_stmt = select(func.count()).select_from(data_statement.subquery())
    count = session.exec(count_stmt).one()
    items = session.exec(data_statement.offset(skip).limit(limit)).all()

    # Aggregate counts for progress tracking
    def get_count_stmt(status: StagedItemStatus):
        stmt = select(func.count(StagedItem.id)).where(
            StagedItem.owner_id == current_user.id,
            StagedItem.status == status
        )
        if community_id:
            stmt = stmt.where(StagedItem.community_id == community_id)
        else:
            stmt = stmt.where(StagedItem.community_id == None)
        return stmt

    pending = session.exec(get_count_stmt(StagedItemStatus.PENDING)).one()
    processing = session.exec(get_count_stmt(StagedItemStatus.PROCESSING)).one()
    completed = session.exec(get_count_stmt(StagedItemStatus.COMPLETED)).one()
    failed = session.exec(get_count_stmt(StagedItemStatus.FAILED)).one()

    return StagedItemsPublic(
        data=items, 
        count=count,
        pending_count=pending,
        processing_count=processing,
        completed_count=completed,
        failed_count=failed
    )


@router.patch("/{id}", response_model=StagedItemPublic)
def update_staged_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    raw_data: dict[str, Any],
) -> Any:
    """
    Update a staged item's data (cleaning).
    """
    db_obj = session.get(StagedItem, id)
    if not db_obj or db_obj.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Staged item not found")

    db_obj.raw_data = raw_data
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


@router.delete("/{id}", response_model=Message)
def delete_staged_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Delete a staged item.
    """
    db_obj = session.get(StagedItem, id)
    if not db_obj or db_obj.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Staged item not found")

    session.delete(db_obj)
    session.commit()
    return Message(message="Staged item deleted")


@router.delete("/clean/all", response_model=Message)
def clean_staged_items(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    community_id: uuid.UUID | None = None,
) -> Any:
    """
    Clear all staged items for the current user/community.
    """
    statement = select(StagedItem).where(StagedItem.owner_id == current_user.id)
    if community_id:
        statement = statement.where(StagedItem.community_id == community_id)
    else:
        statement = statement.where(StagedItem.community_id == None)

    items = session.exec(statement).all()
    for item in items:
        session.delete(item)
    session.commit()
    return Message(message=f"Deleted {len(items)} staged items")


import logging

logger = logging.getLogger(__name__)
google_books_semaphore = asyncio.Semaphore(5) # Throttling for external APIs

async def enrich_and_import_item(
    session_factory: Any,
    staged_id: uuid.UUID,
    owner_id: uuid.UUID,
    community_id: uuid.UUID | None,
):
    """
    Background task to enrich a book from Google Books and import it.
    """
    from app.core.db import engine
    from sqlmodel import Session

    # Use a small random jitter to avoid synchronized spikes
    import random
    await asyncio.sleep(random.uniform(0.1, 0.5))

    with Session(engine) as session:
        staged = session.get(StagedItem, staged_id)
        if not staged:
            return

        staged.status = StagedItemStatus.PROCESSING
        session.add(staged)
        session.commit()

        try:
            data = staged.raw_data
            title = str(data.get("title", "")).strip()
            author = str(data.get("author", "")).strip()
            isbn = str(data.get("isbn", "")).strip() if data.get("isbn") else None
            
            logger.info(f"Enriching item: {title} by {author} (ISBN: {isbn})")

            if not title:
                staged.status = StagedItemStatus.FAILED
                staged.error_log = "Title is required for enrichment."
                session.add(staged)
                session.commit()
                return

            # 1. Search Local Registry
            from app.models import WorkMetadata
            meta = None
            clean_isbn = None
            if isbn:
                # Support ISBN-10 with 'X' checksum while removing brackets/symbols
                clean_isbn = "".join(c for c in isbn if c.isdigit() or c.upper() == "X").upper()
                meta = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == clean_isbn)).first()
            
            if not meta and author and title:
                # Try fuzzy-ish match or direct get
                meta = session.get(WorkMetadata, (author, title))

            # 2. Search Google Books if not in local registry
            google_data = None
            if not meta:
                async with google_books_semaphore:
                    await asyncio.sleep(0.5) # Forced delay between API calls
                    
                    search_query = f"isbn:{clean_isbn}" if clean_isbn else f"intitle:{title} inauthor:{author}"
                    api_key = settings.VITE_GOOGLE_BOOKS_API_KEY
                    url = f"https://www.googleapis.com/books/v1/volumes?q={search_query}&maxResults=1"
                    if api_key:
                        url += f"&key={api_key}"

                    logger.info(f"Searching Google Books: {url}")
                    async with httpx.AsyncClient() as client:
                        response = await client.get(url, timeout=10.0)
                        if response.status_code == 200:
                            res_json = response.json()
                            if res_json.get("items"):
                                google_data = res_json["items"][0]["volumeInfo"]
                                logger.info(f"Found Google data for {title}")
                            else:
                                logger.warning(f"No Google results for {title}")
                        else:
                            logger.error(f"Google API error {response.status_code}: {response.text}")

            # 3. Search Open Library if still no results
            open_library_data = None
            if not meta and not google_data:
                logger.info(f"Fallback to Open Library for {title}")
                async with httpx.AsyncClient() as client:
                    try:
                        if clean_isbn:
                            ol_url = f"https://openlibrary.org/api/books?bibkeys=ISBN:{clean_isbn}&format=json&jscmd=data"
                            ol_res = await client.get(ol_url, timeout=10.0)
                            if ol_res.status_code == 200:
                                ol_json = ol_res.json()
                                if f"ISBN:{clean_isbn}" in ol_json:
                                    open_library_data = ol_json[f"ISBN:{clean_isbn}"]
                        
                        if not open_library_data:
                            ol_search_url = f"https://openlibrary.org/search.json?title={title}&author={author}&limit=1"
                            ol_res = await client.get(ol_search_url, timeout=10.0)
                            if ol_res.status_code == 200:
                                ol_json = ol_res.json()
                                if ol_json.get("docs"):
                                    doc = ol_json["docs"][0]
                                    open_library_data = {
                                        "title": doc.get("title"),
                                        "authors": [{"name": a} for a in doc.get("author_name", [])],
                                        "cover": {"medium": f"https://covers.openlibrary.org/b/id/{doc.get('cover_i')}-M.jpg"} if doc.get("cover_i") else None,
                                        "subjects": [{"name": s} for s in doc.get("subject", [])[:5]]
                                    }
                    except Exception as ol_err:
                        logger.error(f"Open Library lookup failed: {ol_err}")

            # Final data assembly
            final_title = title
            final_author = author
            final_description = str(data.get("description", "")).strip() or None
            final_image_url = None
            final_extra = {}

            if meta:
                logger.info(f"Using local metadata for {title}")
                final_title = meta.title
                final_author = meta.author
                final_description = meta.description or final_description
                final_image_url = meta.image_url
                final_extra = {
                    "category": meta.category,
                    "isbn": meta.isbn,
                    "tags": meta.tags
                }
            elif google_data:
                final_title = google_data.get("title", title)
                google_authors = google_data.get("authors", [])
                final_author = ", ".join(google_authors) if google_authors else author
                final_description = google_data.get("description", final_description)
                
                # Image processing
                img_links = google_data.get("imageLinks", {})
                thumb = img_links.get("medium") or img_links.get("small") or img_links.get("thumbnail")
                if thumb:
                    thumb = thumb.replace("http://", "https://")
                    try:
                        logger.info(f"Uploading image from Google for {title}: {thumb}")
                        stored_url = upload_image_from_url(thumb, folder="items")
                        final_image_url = stored_url or thumb
                    except Exception as img_err:
                        logger.error(f"Image upload failed for {title}: {img_err}")
                        final_image_url = thumb
                
                # Extract clean ISBN from Google if possible
                industry_ids = google_data.get("industryIdentifiers", [])
                found_isbn = clean_isbn
                for id_obj in industry_ids:
                    if id_obj["type"] in ["ISBN_13", "ISBN_10"]:
                        found_isbn = id_obj["identifier"]
                        if id_obj["type"] == "ISBN_13": break

                google_categories = google_data.get("categories", [])
                final_extra = {
                    "isbn": found_isbn,
                    "categories": google_categories,
                    "category": google_categories[0] if google_categories else None,
                    "pageCount": google_data.get("pageCount")
                }
            elif open_library_data:
                logger.info(f"Using Open Library data for {title}")
                final_title = open_library_data.get("title", title)
                ol_authors = [a["name"] for a in open_library_data.get("authors", [])]
                final_author = ", ".join(ol_authors) if ol_authors else author
                
                ol_cover = open_library_data.get("cover", {})
                thumb = ol_cover.get("large") or ol_cover.get("medium") or ol_cover.get("small")
                if thumb:
                    try:
                        logger.info(f"Uploading image from OpenLibrary for {title}: {thumb}")
                        stored_url = upload_image_from_url(thumb, folder="items")
                        final_image_url = stored_url or thumb
                    except Exception:
                        final_image_url = thumb
                
                final_extra = {
                    "isbn": clean_isbn,
                    "subjects": [s["name"] for s in open_library_data.get("subjects", [])]
                }
            else:
                logger.warning(f"No enrichment found for {title}. Using raw data.")

            # Create Item
            target_owner = community_id if community_id else owner_id
            db_item = Item(
                title=final_title,
                author=final_author,
                description=final_description,
                image_url=final_image_url,
                owner_id=target_owner,
                item_type=ItemType.book,
                extra_data=final_extra,
            )
            session.add(db_item)
            session.flush()

            # Record contribution
            from app.models import Contribution
            contribution = Contribution(
                user_id=owner_id,
                item_id=db_item.id,
                work_author=final_author,
                work_title=final_title,
                description=f"Imported book: {final_title}"
            )
            session.add(contribution)
            
            # Create WorkMetadata if it didn't exist
            if final_author and final_title:
                ensure_work_metadata(
                    session,
                    final_author,
                    final_title,
                    isbn=final_extra.get("isbn") or clean_isbn,
                    description=final_description,
                    category=final_extra.get("category"),
                    image_url=final_image_url
                )

            staged.status = StagedItemStatus.COMPLETED
            session.add(staged)
            session.commit()
            sync_item_to_search(db_item)
            logger.info(f"Successfully imported and enriched: {final_title}")

        except Exception as e:
            logger.exception(f"Enrichment failed for staged item {staged_id}")
            staged.status = StagedItemStatus.FAILED
            staged.error_log = str(e)
            session.add(staged)
            session.commit()


@router.post("/process")
async def process_staged_items(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    ids: list[uuid.UUID],
    community_id: uuid.UUID | None = None,
) -> Any:
    """
    Start processing selected staged items.
    """
    statement = select(StagedItem).where(
        StagedItem.id.in_(ids),
        StagedItem.owner_id == current_user.id
    )
    items = session.exec(statement).all()

    for item in items:
        item.status = StagedItemStatus.PROCESSING
        session.add(item)
        background_tasks.add_task(
            enrich_and_import_item,
            None, # session_factory not strictly needed if we use engine
            item.id,
            current_user.id,
            community_id
        )

    session.commit()
    return {"message": f"Started processing {len(items)} items"}