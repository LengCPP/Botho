import logging
import uuid

import meilisearch
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Community, Item, WorkMetadata

client = meilisearch.Client(settings.MEILI_URL, settings.MEILI_MASTER_KEY, timeout=5)
logger = logging.getLogger(__name__)


def configure_search():
    """Set up Meilisearch indexes with correct filterable and sortable attributes."""
    items_index = client.index("items")
    items_index.update_filterable_attributes([
        "owner_id",
        "pooled_in",
        "category",
        "genre",
        "author",
        "subject",
        "item_type",
        "is_available",
        "is_lost",
        "is_private",
        "isbn",
        "brand",
        "year",
        "language",
        "platform",
    ])
    items_index.update_sortable_attributes([
        "title",
        "author",
        "created_at"
    ])

    works_index = client.index("works")
    works_index.update_filterable_attributes(["isbn", "category", "genre", "subject"])
    works_index.update_sortable_attributes(["title", "author"])

    communities_index = client.index("communities")
    communities_index.update_filterable_attributes(["id"])


# ---------------------------------------------------------------------------
# Primitive helpers — safe to call from any thread (no SQLAlchemy access)
# ---------------------------------------------------------------------------

def _push_doc(index_name: str, doc: dict) -> None:
    """Push a single document dict to a Meilisearch index.
    Takes only plain Python values — safe to call from asyncio.to_thread().
    """
    client.index(index_name).add_documents([doc])


def _build_item_document(item: Item) -> dict:
    """Build the Meilisearch document dict for an item.
    Must be called while the SQLAlchemy session is still active (accesses
    item.communities via lazy load). Returns a plain dict with no ORM deps.
    """
    pooled_in = [str(c.id) for c in item.communities]
    tags = [s.strip().title() for s in item.subject.split(",")] if item.subject else []
    return {
        "id": str(item.id),
        "title": item.title,
        "description": item.description,
        "author": item.author,
        "item_type": str(item.item_type.value) if hasattr(item.item_type, "value") else str(item.item_type),
        "image_url": item.image_url,
        "owner_id": str(item.owner_id),
        "pooled_in": pooled_in,
        "category": item.category,
        "genre": item.genre,
        "subject": tags,
        "isbn": item.isbn,
        "created_at": int(item.created_at.timestamp()) if item.created_at else None,
        "is_available": True,
        "is_lost": item.is_lost,
        "is_private": item.is_private,
        "brand": item.brand,
        "year": item.year,
        "language": item.language,
        "platform": item.platform,
        "format": item.format,
        "series": item.series,
        "color": item.color,
        "material": item.material,
        "publisher": item.publisher,
        "edition": item.edition,
        "model_number": item.model_number,
        "age_group": item.age_group,
        "player_count": item.player_count,
        "weight": item.weight,
        "dimensions": item.dimensions,
        "condition_notes": item.condition_notes,
        "pieces_count": item.pieces_count,
    }


def _build_work_document(meta: WorkMetadata) -> dict:
    """Build the Meilisearch document dict for a WorkMetadata record.
    Returns a plain dict with no ORM deps — safe to pass to asyncio.to_thread().
    """
    normalized_tags = [t.strip().title() for t in (meta.tags or []) if t.strip()]
    return {
        "id": _work_search_id(meta.author, meta.title),
        "author": meta.author,
        "title": meta.title,
        "isbn": meta.isbn,
        "description": meta.description,
        "category": meta.category,
        "genre": meta.genre,
        "image_url": meta.image_url,
        "subject": normalized_tags,
    }


# ---------------------------------------------------------------------------
# Sync convenience wrappers — used from sync (def) route handlers.
# These are safe because sync FastAPI routes run in a thread-pool executor
# and do not block the event loop.
# ---------------------------------------------------------------------------

def sync_item_to_search(item: Item) -> None:
    _push_doc("items", _build_item_document(item))


def delete_item_from_search(item_id: uuid.UUID) -> None:
    client.index("items").delete_document(str(item_id))


def sync_community_to_search(community: Community) -> None:
    index = client.index("communities")
    if community.is_private:
        index.delete_document(str(community.id))
    else:
        _push_doc("communities", {
            "id": str(community.id),
            "name": community.name,
            "description": community.description,
        })


def delete_community_from_search(community_id: uuid.UUID) -> None:
    client.index("communities").delete_document(str(community_id))


def _work_search_id(author: str, title: str) -> str:
    """Stable Meilisearch document ID derived from the WorkMetadata composite PK."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{author}:{title}"))


def delete_work_metadata_from_search(author: str, title: str) -> None:
    """Remove a WorkMetadata document from Meilisearch. Safe to call even if doc doesn't exist."""
    try:
        client.index("works").delete_document(_work_search_id(author, title))
    except Exception as e:
        logger.warning("Failed to delete work from search index (%s / %s): %s", author, title, e)


def sync_work_metadata_to_search(meta: WorkMetadata) -> None:
    _push_doc("works", _build_work_document(meta))


def reindex_all_data(session: Session) -> None:
    """Reindex all data into Meilisearch. Superuser only trigger."""
    configure_search()

    # 1. Reindex Items — eager-load communities to avoid N+1 lazy loads
    items = session.exec(select(Item).options(selectinload(Item.communities))).all()
    for item in items:
        sync_item_to_search(item)

    # 2. Reindex Communities
    communities = session.exec(select(Community)).all()
    for community in communities:
        sync_community_to_search(community)

    # 3. Reindex Work Metadata
    works = session.exec(select(WorkMetadata)).all()
    for work in works:
        sync_work_metadata_to_search(work)


# Aliases for compatibility
def sync_book_to_search(book: Item):
    sync_item_to_search(book)

def delete_book_from_search(book_id: uuid.UUID):
    delete_item_from_search(book_id)
