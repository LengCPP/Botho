import asyncio
import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Session, and_, func, or_, select

from app.models import (
    Community,
    CommunityItem,
    Friendship,
    FriendshipStatus,
    Item,
    ItemConditionRating,
    ItemOwnerPublic,
    ItemType,
    Loan,
    LoanPublic,
    LoanStatus,
    User,
    UserPublic,
    UserReview,
    WorkMetadata,
)


def _update_collection_index_logic(session: Session, owner_id: uuid.UUID):
    """
    Internal logic to update the collection_index for a user or community.
    Calculates totals and sample images for genre, category, subject, and author.
    Groups by name AND item_type.
    """
    import logging
    logger = logging.getLogger(__name__)

    user = session.get(User, owner_id)
    community = None
    if not user:
        community = session.get(Community, owner_id)

    if not user and not community:
        logger.warning(f"Owner {owner_id} not found for index update.")
        return

    # Fetch all items for this owner
    if community:
        # Include pooled items for communities
        comm_item_stmt = select(CommunityItem.item_id).where(CommunityItem.community_id == owner_id)
        items_stmt = select(Item).where(or_(Item.owner_id == owner_id, Item.id.in_(comm_item_stmt)))
        items = session.exec(items_stmt).all()
        logger.info(f"Rebuilding index for community {owner_id}, found {len(items)} items.")
    else:
        items = session.exec(select(Item).where(Item.owner_id == owner_id)).all()
        logger.info(f"Rebuilding index for user {owner_id}, found {len(items)} items.")

    index = {
        "total": len(items),
        "item_type": {},
        "genre": {},
        "category": {},
        "subject": {},
        "author": {},
        "ownership": {},
        "updated_at": datetime.now().isoformat()
    }

    for item in items:
        # 0. Item Type
        i_type = item.item_type.value if hasattr(item.item_type, 'value') else str(item.item_type)
        if i_type not in index["item_type"]:
            index["item_type"][i_type] = {"name": i_type, "item_type": i_type, "count": 0, "sample_images": []}
        index["item_type"][i_type]["count"] += 1
        if item.image_url and len(index["item_type"][i_type]["sample_images"]) < 5:
            if item.image_url not in index["item_type"][i_type]["sample_images"]:
                index["item_type"][i_type]["sample_images"].append(item.image_url)

        # Helper to update index with item_type awareness
        def update_facet(facet_key: str, name: str):
            clean_name = name or "Others"
            key = f"{clean_name}|{i_type}"
            if key not in index[facet_key]:
                index[facet_key][key] = {
                    "name": clean_name, 
                    "item_type": i_type, 
                    "count": 0, 
                    "sample_images": []
                }
            index[facet_key][key]["count"] += 1
            if item.image_url and len(index[facet_key][key]["sample_images"]) < 5:
                if item.image_url not in index[facet_key][key]["sample_images"]:
                    index[facet_key][key]["sample_images"].append(item.image_url)

        # 1. Author
        update_facet("author", item.author)

        # 2. Category & Genre
        update_facet("category", item.category)
        update_facet("genre", item.genre)

        # 3. Subject (Tags)
        tags = [s.strip() for s in item.subject.split(",")] if item.subject else []
        if not tags:
            tags = ["Others"]
        for tag in tags:
            update_facet("subject", tag)

        # 4. Ownership (Community only)
        if community:
            owner_type = "Community Owned" if item.owner_id == owner_id else "Member Shared Pool"
            update_facet("ownership", owner_type)

    if user:
        user.collection_index = index
        session.add(user)
    elif community:
        community.collection_index = index
        session.add(community)

    session.commit()
    logger.info(f"Successfully updated collection index for {owner_id}")

def update_collection_index(session: Session, owner_id: uuid.UUID):
    """
    Deprecated: Use rebuild_collection_index_task for background execution.
    Maintains synchronous behavior for legacy calls.
    """
    _update_collection_index_logic(session, owner_id)

def invalidate_item_caches(session: Session, item_id: uuid.UUID, background_tasks: Any = None):
    """
    Trigger index rebuild for the item owner and all communities it is pooled in.
    """
    from app.models import CommunityItem, Item
    item = session.get(Item, item_id)
    if not item:
        return

    owners_to_update = {item.owner_id}
    # Find all communities this item is pooled in
    pooled_communities = session.exec(
        select(CommunityItem.community_id).where(CommunityItem.item_id == item_id)
    ).all()
    owners_to_update.update(pooled_communities)

    for owner_id in owners_to_update:
        if background_tasks:
            background_tasks.add_task(rebuild_collection_index_task, owner_id)
        else:
            rebuild_collection_index_task(owner_id)

def rebuild_collection_index_task(owner_id: uuid.UUID):
    """
    Background task to rebuild collection index.
    Creates its own session.
    """
    from app.core.db import engine
    with Session(engine) as session:
        _update_collection_index_logic(session, owner_id)


async def maintenance_bulk_classify(user_id: uuid.UUID):
    """Background task to classify all books and clean up polluted ISBNs."""
    import logging

    from app.api.websocket_manager import notification_manager
    from app.core.db import engine
    from app.search import sync_item_to_search

    logger = logging.getLogger(__name__)
    logger.info("Starting maintenance bulk classification and cleanup...")

    with Session(engine) as session:
        # 1. Clean up polluted ISBNs in Item and WorkMetadata
        items_to_fix = session.exec(select(Item).where(Item.item_type == ItemType.book)).all()
        fixed_items = 0
        for item in items_to_fix:
            if item.isbn in ["[]", "", []]:
                item.isbn = None
                session.add(item)
                fixed_items += 1

        works_to_fix = session.exec(select(WorkMetadata)).all()
        fixed_works = 0
        for work in works_to_fix:
            if work.isbn in ["[]", "", []]:
                work.isbn = None
                session.add(work)
                fixed_works += 1

        session.flush()
        logger.info(f"ISBN Cleanup: Fixed {fixed_items} items and {fixed_works} work metadata entries.")

        # 2. Bulk Classify
        statement = select(Item).where(Item.item_type == ItemType.book)
        books = session.exec(statement).all()

        books_to_classify = []
        books_objects = []

        for book in books:
            # Re-classify if generic or missing
            is_generic = book.category in ["Fiction", "Non-Fiction", None] or book.genre is None

            if is_generic:
                books_to_classify.append({
                    "title": book.title,
                    "author": book.author or "",
                    "description": book.description
                })
                books_objects.append(book)

        classified_count = 0
        from app.ai import classify_books

        # Process in chunks of 1 for high reliability with small local models
        CHUNK_SIZE = 1
        for i in range(0, len(books_to_classify), CHUNK_SIZE):
            chunk = books_to_classify[i:i + CHUNK_SIZE]
            chunk_objs = books_objects[i:i + CHUNK_SIZE]

            logger.info(f"Classifying chunk {i//CHUNK_SIZE + 1}/{len(books_to_classify)} ({len(chunk)} books)...")

            try:
                results = await classify_books(chunk)

                chunk_classified = 0
                for book, res in zip(chunk_objs, results):
                    if not res: continue
                    cat_raw, gen_raw, sub_raw = res

                    # Use map_book_classification for fuzzy matching against valid constants
                    cat, gen, _ = map_book_classification([cat_raw, gen_raw])

                    if cat: book.category = cat
                    if gen: book.genre = gen
                    if sub_raw: book.subject = sub_raw
                    
                    session.add(book)
                    session.flush()
                    sync_item_to_search(book)

                    # Convert subjects string to tags list
                    tags = [s.strip() for s in sub_raw.split(",")] if sub_raw else []

                    # Ensure WorkMetadata also gets updated
                    ensure_work_metadata(session, book.author, book.title, category=cat, genre=gen, tags=tags)
                    classified_count += 1
                    chunk_classified += 1

                if chunk_classified > 0:
                    session.commit() # Commit after EACH successful chunk
                else:
                    logger.warning(f"Chunk {i//CHUNK_SIZE + 1} failed to classify any books.")

            except Exception as e:
                logger.error(f"Error processing chunk {i//CHUNK_SIZE + 1}: {e}")
                session.rollback()

            await asyncio.sleep(0.5) # Minimal throttle for local execution

        logger.info(f"Maintenance complete: Classified {classified_count} books.")

        # Notify user
        await notification_manager.send_personal_message(
            {"type": "BOOK_ARCHIVE_UPDATED", "count": classified_count, "action": "classified"},
            user_id
        )

async def ai_classify_specific_books(
    books_to_classify: list[dict[str, str]],
    user_id: uuid.UUID
):
    """Administrative task to trigger AI classification for specific books in the registry."""
    import logging

    from app.ai import classify_books
    from app.api.websocket_manager import notification_manager
    from app.core.db import engine
    from app.search import sync_item_to_search

    logger = logging.getLogger(__name__)
    logger.info(f"Starting AI classification for {len(books_to_classify)} specific books...")

    with Session(engine) as session:
        books_data = []
        books_meta_objs = []

        for b in books_to_classify:
            author, title = b.get("author"), b.get("title")
            if not author or not title: continue

            meta = session.get(WorkMetadata, (author, title))
            if not meta: continue

            books_data.append({
                "title": title,
                "author": author,
                "description": meta.description
            })
            books_meta_objs.append(meta)

        classified_count = 0
        # Process in chunks of 1 for high reliability with small local models
        CHUNK_SIZE = 1
        for i in range(0, len(books_data), CHUNK_SIZE):
            chunk = books_data[i:i + CHUNK_SIZE]
            chunk_metas = books_meta_objs[i:i + CHUNK_SIZE]

            try:
                results = await classify_books(chunk)

                for meta, res in zip(chunk_metas, results):
                    if not res: continue
                    cat_raw, gen_raw, sub_raw = res

                    # Use fuzzy mapping to canonical constants
                    cat, gen, _ = map_book_classification([cat_raw, gen_raw])

                    if cat: meta.category = cat
                    if gen: meta.genre = gen
                    if sub_raw:
                        meta.tags = [s.strip() for s in sub_raw.split(",")]

                    session.add(meta)
                    session.flush()

                    # Also sync items that use this metadata
                    items = session.exec(select(Item).where(Item.author == meta.author, Item.title == meta.title)).all()
                    for item in items:
                        if cat: item.category = cat
                        if gen: item.genre = gen
                        if sub_raw: item.subject = sub_raw
                        session.add(item)
                        sync_item_to_search(item)

                    classified_count += 1

                session.commit() # Commit after each successful chunk
            except Exception as e:
                logger.error(f"Error processing AI classification chunk {i//CHUNK_SIZE + 1}: {e}")
                session.rollback()

            await asyncio.sleep(0.5)

        logger.info(f"AI classification complete: {classified_count} books processed.")
        await notification_manager.send_personal_message(
            {"type": "BOOK_ARCHIVE_UPDATED", "count": classified_count, "action": "ai_classified"},
            user_id
        )

async def fetch_external_book_metadata(
    author: str,
    title: str,
    isbn: str | None = None,
    source_api: str = "auto"
) -> tuple[dict | None, dict | None]:
    """Consolidated helper to fetch metadata from Google Books and OpenLibrary."""
    import httpx

    from app.core.config import settings

    google_data = None
    open_library_data = None
    clean_isbn = "".join(c for c in isbn if c.isdigit() or c.upper() == "X").upper() if isbn else None

    # 1. Google Books
    if source_api in ["auto", "google_books"]:
        search_query = f"isbn:{clean_isbn}" if clean_isbn else f"intitle:{title} inauthor:{author}"
        api_key = settings.VITE_GOOGLE_BOOKS_API_KEY
        url = f"https://www.googleapis.com/books/v1/volumes?q={search_query}&maxResults=1"
        if api_key: url += f"&key={api_key}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=10.0)
                if response.status_code == 200:
                    res_json = response.json()
                    if res_json.get("items"):
                        google_data = res_json["items"][0]["volumeInfo"]
            except Exception:
                pass

    # 2. Open Library
    if source_api == "open_library" or (source_api == "auto" and not google_data):
        try:
            async with httpx.AsyncClient() as client:
                if clean_isbn:
                    ol_url = f"https://openlibrary.org/api/books?bibkeys=ISBN:{clean_isbn}&format=json&jscmd=data"
                    ol_res = await client.get(ol_url, timeout=10.0)
                    if ol_res.status_code == 200:
                        ol_json = ol_res.json()
                        if f"ISBN:{clean_isbn}" in ol_json:
                            raw = ol_json[f"ISBN:{clean_isbn}"]
                            open_library_data = {
                                "title": raw.get("title"),
                                "isbn": [clean_isbn],
                                "description": raw.get("description"),
                                "authors": raw.get("authors"),
                                "subject": [s.get("name") for s in raw.get("subjects", [])],
                                "cover_url": raw.get("cover", {}).get("large") or raw.get("cover", {}).get("medium")
                            }

                if not open_library_data:
                    ol_search_url = f"https://openlibrary.org/search.json?title={title}&author={author}&limit=1"
                    ol_res = await client.get(ol_search_url, timeout=10.0)
                    if ol_res.status_code == 200:
                        ol_json = ol_res.json()
                        if ol_json.get("docs"):
                            open_library_data = ol_json["docs"][0]

                # Second Call: Fetch description from Work API if missing
                if open_library_data and not open_library_data.get("description"):
                    work_key = open_library_data.get("key")
                    if work_key:
                        try:
                            work_res = await client.get(f"https://openlibrary.org{work_key}.json", timeout=5.0)
                            if work_res.status_code == 200:
                                work_data = work_res.json()
                                desc = work_data.get("description")
                                open_library_data["description"] = desc.get("value") if isinstance(desc, dict) else desc
                        except Exception:
                            pass
        except Exception:
            pass

    return google_data, open_library_data

async def sync_items_from_archive(
    item_ids: list[uuid.UUID],
    user_id: uuid.UUID,
):
    """
    Background task to sync items with the latest data from the WorkMetadata archive.
    Priority: ISBN first, then Title + Author.
    Subjects are merged, other fields are replaced.
    """
    from app.api.websocket_manager import notification_manager
    from app.core.db import engine
    from app.search import sync_item_to_search

    with Session(engine) as session:
        count = 0
        for item_id in item_ids:
            item = session.get(Item, item_id)
            if not item or item.item_type != ItemType.book:
                continue

            # 1. Match by ISBN first
            meta = None
            if item.isbn:
                meta = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == item.isbn)).first()
            
            # 2. Match by Author/Title
            if not meta and item.author and item.title:
                meta = session.get(WorkMetadata, (item.author, item.title))

            if not meta:
                continue

            updated = False
            # Replace fields (except subject)
            if meta.isbn and item.isbn != meta.isbn:
                item.isbn, updated = meta.isbn, True
            if meta.description and item.description != meta.description:
                item.description, updated = meta.description, True
            if meta.image_url and item.image_url != meta.image_url:
                item.image_url, updated = meta.image_url, True
            if meta.category and item.category != meta.category:
                item.category, updated = meta.category, True
            if meta.genre and item.genre != meta.genre:
                item.genre, updated = meta.genre, True
            
            # Merge subject
            if meta.tags:
                existing_tags = [t.strip() for t in (item.subject.split(",") if item.subject else []) if t.strip()]
                merged_tags = list(set(existing_tags) | set(meta.tags))
                new_subject = ", ".join(merged_tags)
                if item.subject != new_subject:
                    item.subject, updated = new_subject, True

            if updated:
                session.add(item)
                sync_item_to_search(item)
                count += 1

        session.commit()
        await notification_manager.send_personal_message(
            {"type": "BOOK_ARCHIVE_UPDATED", "count": count, "action": "synced"},
            user_id
        )

async def enrich_specific_books(
    books_to_enrich: list[dict[str, str]],
    user_id: uuid.UUID,
    fields_to_overwrite: list[str] | None = None,
    source_api: str = "auto"
):
    """Background task to enrich specific books using external APIs and syncing with WorkMetadata (no AI)."""
    from app.api.websocket_manager import notification_manager
    from app.core.db import engine
    from app.search import sync_item_to_search
    from app.storage import upload_image_from_url

    # Default to NO fields overwritten if not specified (safe default)
    if fields_to_overwrite is None:
        fields_to_overwrite = []

    semaphore = asyncio.Semaphore(3)

    with Session(engine) as session:
        count = 0
        for book_info in books_to_enrich:
            author, title, isbn = book_info.get("author"), book_info.get("title"), book_info.get("isbn")
            if not author or not title: 
                continue

            # Attempt to find ISBN if not provided
            items = session.exec(select(Item).where(Item.author == author, Item.title == title)).all()
            
            # Prioritize ISBN for metadata lookup
            meta = None
            if isbn:
                meta = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == isbn)).first()
            if not meta:
                meta = session.get(WorkMetadata, (author, title))

            if not isbn:
                isbn = meta.isbn if meta and meta.isbn else next((i.isbn for i in items if i.isbn), None)

            async with semaphore:
                google_data, ol_data = await fetch_external_book_metadata(author, title, isbn, source_api)

            new_desc, new_isbn, new_img, new_cat, new_genre, new_tags = None, None, None, None, None, []

            if google_data:
                new_desc = google_data.get("description")
                for id_obj in google_data.get("industryIdentifiers", []):
                    if id_obj["type"] in ["ISBN_13", "ISBN_10"]:
                        new_isbn = id_obj["identifier"]
                        if id_obj["type"] == "ISBN_13": break

                if google_data.get("categories"):
                    c, gn, sj = map_book_classification(google_data["categories"])
                    new_cat, new_genre = c, gn
                    if sj: new_tags.append(sj)

                img_links = google_data.get("imageLinks", {})
                thumb = (img_links.get("medium") or img_links.get("small") or img_links.get("thumbnail") or "").replace("http://", "https://")
                if thumb and (not meta or not meta.image_url or "image_url" in fields_to_overwrite):
                    try: new_img = await upload_image_from_url(thumb, folder="items")
                    except Exception: pass

            elif ol_data:
                new_isbn = ol_data.get("isbn", [None])[0]
                new_desc = ol_data.get("description")
                thumb = ol_data.get("cover_url") or (f"https://covers.openlibrary.org/b/id/{ol_data['cover_i']}-M.jpg" if ol_data.get("cover_i") else None)
                if thumb and (not meta or not meta.image_url or "image_url" in fields_to_overwrite):
                    try: new_img = await upload_image_from_url(thumb, folder="items")
                    except Exception: pass

                ol_subjects = ol_data.get("subject") or ol_data.get("subject_name", [])
                if ol_subjects:
                    c, gn, sj = map_book_classification(ol_subjects)
                    new_cat, new_genre = c, gn
                    if sj: new_tags.append(sj)
                new_tags = list(set(new_tags) | set(ol_subjects[:5]))

            # Determine final values. 
            def get_final_val(field_name: str, new_val: Any, current_val: Any):
                if field_name in fields_to_overwrite:
                    return new_val if new_val is not None else current_val
                return current_val if current_val else new_val

            final_isbn = get_final_val("isbn", new_isbn, meta.isbn if meta else None)
            final_desc = get_final_val("description", new_desc, meta.description if meta else None)
            final_img = get_final_val("image_url", new_img, meta.image_url if meta else None)
            final_cat = get_final_val("category", new_cat, meta.category if meta else None)
            final_genre = get_final_val("genre", new_genre, meta.genre if meta else None)

            final_tags = meta.tags if meta else []
            if new_tags:
                # Subjects should ONLY be added to and not replaced
                final_tags = list(set(final_tags) | set(new_tags))

            if final_isbn or final_desc or final_img or final_cat or final_genre or final_tags:
                meta = ensure_work_metadata(
                    session,
                    author,
                    title,
                    isbn_val=final_isbn,
                    description=final_desc,
                    image_url=final_img,
                    category=final_cat,
                    genre=final_genre,
                    tags=final_tags,
                    overwrite=True
                )
                count += 1

            for item in items:
                updated = False
                if not meta: continue

                # Overwrite item fields if field is in overwrite list OR if item field is missing
                if ( "isbn" in fields_to_overwrite or not item.isbn) and meta.isbn:
                    item.isbn, updated = meta.isbn, True
                if ("description" in fields_to_overwrite or not item.description) and meta.description:
                    item.description, updated = meta.description, True
                if ("image_url" in fields_to_overwrite or not item.image_url) and meta.image_url:
                    item.image_url, updated = meta.image_url, True
                if ("category" in fields_to_overwrite or not item.category) and meta.category:
                    item.category, updated = meta.category, True
                if ("genre" in fields_to_overwrite or not item.genre) and meta.genre:
                    item.genre, updated = meta.genre, True
                
                if meta.tags:
                    existing_tags = [t.strip() for t in (item.subject.split(",") if item.subject else []) if t.strip()]
                    # Subjects should ONLY be added to and not replaced
                    merged_tags = list(set(existing_tags) | set(meta.tags))
                    new_subject = ", ".join(merged_tags)
                    if item.subject != new_subject:
                        item.subject, updated = new_subject, True

                if updated:
                    session.add(item)
                    sync_item_to_search(item)

        session.commit()
        await notification_manager.send_personal_message({"type": "BOOK_ARCHIVE_UPDATED", "count": count}, user_id)



async def sync_item_to_archive(session: Session, item_id: uuid.UUID):
    """Sync a specific item's metadata to the global WorkMetadata archive."""
    item = session.get(Item, item_id)
    if not item or item.item_type != ItemType.book:
        return

    tags = [s.strip() for s in item.subject.split(",")] if item.subject else []

    ensure_work_metadata(
        session,
        item.author,
        item.title,
        isbn_val=item.isbn,
        description=item.description,
        category=item.category,
        genre=item.genre,
        image_url=item.image_url,
        tags=tags
    )
    session.commit()

def get_work_metadata(session: Session, author: str | None, title: str) -> WorkMetadata | None:
    if not author:
        return None
    return session.get(WorkMetadata, (author, title))


def ensure_work_metadata(
    session: Session,
    author: str | None,
    title: str,
    isbn_val: str | None = None,
    description: str | None = None,
    category: str | None = None,
    genre: str | None = None,
    image_url: str | None = None,
    tags: list[str] | None = None,
    overwrite: bool = False
) -> WorkMetadata | None:
    meta = None

    # 1. Match by ISBN first
    if isbn_val:
        meta = session.exec(select(WorkMetadata).where(WorkMetadata.isbn == isbn_val)).first()

    # 2. Match by Author/Title if no ISBN match or ISBN missing
    if not meta and author:
        meta = session.get(WorkMetadata, (author, title))

    # If category/genre are missing but we have tags/subjects, try to map them
    if (not category or not genre) and tags:
        c, g, s = map_book_classification(tags)
        if c: category = category or c
        if g: genre = genre or g
        if s and s not in (tags or []):
            tags = (tags or []) + [s]

    if not meta:
        if not author: return None # Can't create without author (PK)
        meta = WorkMetadata(
            author=author,
            title=title,
            isbn=isbn_val,
            description=description,
            category=category,
            genre=genre,
            image_url=image_url,
            tags=tags or []
        )
        session.add(meta)
    else:
        # Update info if missing OR if overwrite is requested
        if isbn_val and (overwrite or not meta.isbn):
            meta.isbn = isbn_val
        if description and (overwrite or not meta.description):
            meta.description = description
        if category and (overwrite or not meta.category):
            meta.category = category
        if genre and (overwrite or not meta.genre):
            meta.genre = genre
        if image_url and (overwrite or not meta.image_url):
            meta.image_url = image_url
        if tags:
            # Merge tags, avoiding duplicates
            current_tags = set(meta.tags or [])
            new_tags = set(tags)
            meta.tags = list(current_tags | new_tags)
        session.add(meta)
    session.flush()
    from app.search import sync_work_metadata_to_search
    sync_work_metadata_to_search(meta)
    return meta


def filter_user_privacy(user: User, current_user_id: Any = None, is_admin: bool = False, is_friend: bool = False, session: Session | None = None) -> UserPublic:
    """
    Apply privacy filters to a user object based on their settings.
    Superusers or friends bypass these filters.
    """
    # If the user is the current user or an admin or a friend, don't filter anything
    is_me = current_user_id and str(user.id) == str(current_user_id)

    # Auto-check friendship if session provided
    if not is_me and not is_admin and not is_friend and session and current_user_id:
        is_friend = session.exec(
            select(Friendship).where(
                Friendship.user_id == current_user_id,
                Friendship.friend_id == user.id,
                Friendship.status == FriendshipStatus.ACCEPTED
            )
        ).first() is not None

    settings = user.settings or {}
    show_contact = settings.get("show_contact_details", False)
    show_name = settings.get("show_full_name", False)

    user_public = UserPublic.model_validate(user)
    user_public.show_contact_details = show_contact

    # Privacy bypass: me, system admin, or confirmed friend
    if is_me or is_admin or is_friend:
        return user_public

    if not show_contact:
        user_public.email = "[Hidden]"

    if not show_name:
        if user.profile and user.profile.alias:
            user_public.full_name = user.profile.alias
        else:
            user_public.full_name = "Private User"

    return user_public

def filter_owner_privacy(owner: User, current_user_id: Any = None, is_admin: bool = False, is_friend: bool = False, session: Session | None = None) -> ItemOwnerPublic:
    """
    Apply privacy filters to an owner object for item listings.
    Superusers or friends bypass these filters.
    """
    is_me = current_user_id and str(owner.id) == str(current_user_id)

    # Auto-check friendship if session provided
    if not is_me and not is_admin and not is_friend and session and current_user_id:
        is_friend = session.exec(
            select(Friendship).where(
                Friendship.user_id == current_user_id,
                Friendship.friend_id == owner.id,
                Friendship.status == FriendshipStatus.ACCEPTED
            )
        ).first() is not None

    settings = owner.settings or {}
    show_contact = settings.get("show_contact_details", False)
    show_name = settings.get("show_full_name", False)

    # Privacy bypass
    bypass = is_me or is_admin or is_friend

    email = owner.email if (bypass or show_contact) else "[Hidden]"

    if bypass or show_name:
        full_name = owner.full_name
    else:
        full_name = "Private User"
        if owner.profile and owner.profile.alias:
            full_name = owner.profile.alias

    return ItemOwnerPublic(
        id=owner.id,
        full_name=full_name,
        email=email,
        show_contact_details=show_contact
    )

def filter_loan_privacy(loan: Loan, current_user_id: Any = None, is_admin: bool = False, session: Session | None = None) -> LoanPublic:
    """
    Apply privacy filters to a loan object's owner and requester.
    Reveals details if they are friends or share a private community.
    """
    loan_public = LoanPublic.model_validate(loan)

    # Populate convenience fields for the item
    if loan.item:
        loan_public.item.category = loan.item.category
        loan_public.item.genre = loan.item.genre
        loan_public.item.subject = loan.item.subject

    reveal_requester = is_admin
    reveal_owner = is_admin

    if session and loan.owner_id and loan.requester_id:
        # Check if current user is the owner - they always see requester details
        is_owner = current_user_id and str(loan.owner_id) == str(current_user_id)
        if is_owner:
            reveal_requester = True

        # Check if current user is the requester - they always see owner details
        is_requester = current_user_id and str(loan.requester_id) == str(current_user_id)
        if is_requester:
            reveal_owner = True

        # Check friendship
        is_friend = session.exec(
            select(Friendship).where(
                Friendship.status == FriendshipStatus.ACCEPTED,
                or_(
                    and_(Friendship.user_id == loan.owner_id, Friendship.friend_id == loan.requester_id),
                    and_(Friendship.user_id == loan.requester_id, Friendship.friend_id == loan.owner_id)
                )
            )
        ).first() is not None

        if is_friend:
            reveal_requester = True
            reveal_owner = True
        else:
            # Check shared private community
            from app.models import Community, CommunityMember, CommunityMemberStatus

            shared_private_comm = session.exec(
                select(Community)
                .join(CommunityMember, Community.id == CommunityMember.community_id)
                .where(
                    Community.is_private == True,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                    CommunityMember.user_id == loan.owner_id,
                    Community.id.in_(
                        select(CommunityMember.community_id).where(
                            CommunityMember.user_id == loan.requester_id,
                            CommunityMember.status == CommunityMemberStatus.ACCEPTED
                        )
                    )
                )
            ).first() is not None

            if shared_private_comm:
                reveal_requester = True
                reveal_owner = True

    # Check if current user is an admin of the loan's community
    if session and current_user_id and loan.community_id:
        from app.models import (
            CommunityMember,
            CommunityMemberRole,
            CommunityMemberStatus,
        )
        is_community_admin = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == loan.community_id,
                CommunityMember.user_id == current_user_id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first() is not None

        if is_community_admin:
            reveal_requester = True
            reveal_owner = True

    if loan.owner:
        loan_public.owner = filter_user_privacy(loan.owner, current_user_id, is_admin=reveal_owner)

    if loan.requester:
        loan_public.requester = filter_user_privacy(loan.requester, current_user_id, is_admin=reveal_requester)

    if session and current_user_id:
        existing_review = session.exec(
            select(UserReview).where(
                UserReview.loan_id == loan.id,
                UserReview.reviewer_id == current_user_id
            )
        ).first()
        loan_public.has_review = existing_review is not None

        # Check if other admins exist for community loans
        if loan.community_id:
            from app.models import (
                CommunityMember,
                CommunityMemberRole,
                CommunityMemberStatus,
            )
            other_admins = session.exec(
                select(func.count()).select_from(CommunityMember).where(
                    CommunityMember.community_id == loan.community_id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                    CommunityMember.user_id != current_user_id
                )
            ).one()
            loan_public.other_admins_exist = other_admins > 0

    return loan_public

def check_item_availability(session: Session, item_id: uuid.UUID) -> bool:
    """
    Check if an item is available (not currently loaned out and not lost).
    """
    item = session.get(Item, item_id)
    if not item or item.is_lost:
        return False

    active_loan = session.exec(
        select(Loan).where(
            Loan.item_id == item_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING, LoanStatus.DEFAULTED])
        )
    ).first()
    return active_loan is None


def check_possession(session: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> bool:
    item = session.get(Item, item_id)
    if not item:
        return False
    if item.owner_id == user_id:
        return True

    # Check loans
    loan = session.exec(
        select(Loan).where(
            Loan.item_id == item_id,
            Loan.requester_id == user_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.RETURNED, LoanStatus.EXTENSION_PENDING])
        )
    ).first()
    return bool(loan)


def get_item_condition_data(session: Session, item_id: uuid.UUID) -> dict[str, Any]:
    ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id == item_id)
    ).all()

    if not ratings:
        return {"average_grade": 0.0, "notes": []}

    avg_grade = sum(r.grade for r in ratings) / len(ratings)
    notes = [
        {
            "user_id": str(r.user_id),
            "note": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in ratings if r.notes
    ]

    return {"average_grade": avg_grade, "notes": notes}


def normalize_isbn(isbn: str | None) -> str | None:
    """
    Normalizes ISBN by removing non-alphanumeric characters and verifying basic structure.
    Returns cleaned ISBN (digits + X) or None if invalid.
    """
    if not isbn:
        return None
    
    # Remove all characters except digits and 'X'
    cleaned = "".join(c for c in str(isbn) if c.isdigit() or c.upper() == "X").upper()
    
    # Valid ISBNs are usually 10 or 13 characters. 
    # We'll be slightly lenient but discard obvious garbage (too short or too long)
    if 9 <= len(cleaned) <= 14:
        return cleaned
    return None

def map_book_classification(raw_values: str | list[str] | None) -> tuple[str | None, str | None, str | None]:
    """
    Maps raw genre/category strings to the app's BOOK_CLASSIFICATION.
    Returns (category, genre, subject).
    """
    if not raw_values:
        return None, None, None

    from app.constants import BOOK_CLASSIFICATION

    # Normalize inputs to a list of strings
    candidates = [raw_values] if isinstance(raw_values, str) else raw_values
    
    found_cat = None
    found_gen = None
    
    # 1. First Pass: Try to find any EXACT Genre Match (most specific)
    for val in candidates:
        if not val or not isinstance(val, str): continue
        val_strip = val.strip().strip('"').strip("'").strip("`").strip()
        if not val_strip: continue
        val_lower = val_strip.lower()

        for cat, genres in BOOK_CLASSIFICATION.items():
            for genre in genres:
                if genre.lower() == val_lower:
                    return cat, genre, None

    # 2. Second Pass: Try to find any EXACT Category Match
    for val in candidates:
        if not val or not isinstance(val, str): continue
        val_strip = val.strip().strip('"').strip("'").strip("`").strip()
        if not val_strip: continue
        val_lower = val_strip.lower()

        for cat in BOOK_CLASSIFICATION.keys():
            if cat.lower() == val_lower:
                found_cat = cat
                break
        if found_cat: break

    # 3. Third Pass: Try to find any PARTIAL Genre Match
    for val in candidates:
        if not val or not isinstance(val, str): continue
        val_strip = val.strip().strip('"').strip("'").strip("`").strip()
        if not val_strip: continue
        val_lower = val_strip.lower()

        for cat, genres in BOOK_CLASSIFICATION.items():
            for genre in genres:
                if val_lower in genre.lower() or genre.lower() in val_lower:
                    return cat, genre, None

    # 4. No specific genre found, return found category or use first candidate as subject
    if found_cat:
        return found_cat, None, None
        
    first_val = candidates[0] if candidates else None
    return None, None, str(first_val) if first_val else None
