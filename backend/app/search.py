import uuid

import meilisearch
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Community, Item, WorkMetadata

client = meilisearch.Client(settings.MEILI_URL, settings.MEILI_MASTER_KEY, timeout=5)

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
        "isbn"
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

def sync_item_to_search(item: Item):
    index = client.index("items")

    # Get pooled communities
    pooled_in = [str(c.id) for c in item.communities]

    # Use top-level subject tags split by comma, normalized to Title Case
    tags = [s.strip().title() for s in item.subject.split(",")] if item.subject else []

    document = {
        "id": str(item.id),
        "title": item.title,
        "description": item.description,
        "author": item.author,
        "item_type": str(item.item_type.value) if hasattr(item.item_type, 'value') else str(item.item_type),
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
        "is_private": item.is_private
    }
    index.add_documents([document])

def delete_item_from_search(item_id: uuid.UUID):
    index = client.index("items")
    index.delete_document(str(item_id))

def sync_community_to_search(community: Community):
    index = client.index("communities")
    if community.is_private:
        index.delete_document(str(community.id))
    else:
        document = {
            "id": str(community.id),
            "name": community.name,
            "description": community.description,
        }
        index.add_documents([document])

def delete_community_from_search(community_id: uuid.UUID):
    index = client.index("communities")
    index.delete_document(str(community_id))

def _work_search_id(author: str, title: str) -> str:
    """Stable Meilisearch document ID derived from the WorkMetadata composite PK."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{author}:{title}"))


def delete_work_metadata_from_search(author: str, title: str) -> None:
    """Remove a WorkMetadata document from Meilisearch. Safe to call even if doc doesn't exist."""
    try:
        client.index("works").delete_document(_work_search_id(author, title))
    except Exception as e:
        logger.warning("Failed to delete work from search index (%s / %s): %s", author, title, e)


def sync_work_metadata_to_search(meta: WorkMetadata):
    index = client.index("works")
    safe_id = _work_search_id(meta.author, meta.title)
    
    # Normalize tags to Title Case
    normalized_tags = [t.strip().title() for t in (meta.tags or []) if t.strip()]
    
    document = {
        "id": safe_id,
        "author": meta.author,
        "title": meta.title,
        "isbn": meta.isbn,
        "description": meta.description,
        "category": meta.category,
        "genre": meta.genre,
        "image_url": meta.image_url,
        "subject": normalized_tags,
    }
    index.add_documents([document])

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

# Aliases for compatibility if needed
def sync_book_to_search(book: Item):
    sync_item_to_search(book)

def delete_book_from_search(book_id: uuid.UUID):
    delete_item_from_search(book_id)
