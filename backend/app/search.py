import uuid

import meilisearch
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
        "is_private"
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
    
    # Extract category and genre from extra_data
    category = None
    genre = None
    if item.extra_data:
        category = item.extra_data.get("category")
        genre = item.extra_data.get("genre")
        
    # Get pooled communities
    pooled_in = [str(c.id) for c in item.communities]

    # Fetch tags from WorkMetadata registry
    tags = []
    from app.core.db import engine
    from sqlmodel import Session, select
    if item.author and item.title:
        with Session(engine) as session:
            meta = session.get(WorkMetadata, (item.author, item.title))
            if meta:
                tags = meta.tags
    
    document = {
        "id": str(item.id),
        "title": item.title,
        "description": item.description,
        "author": item.author,
        "item_type": str(item.item_type.value) if hasattr(item.item_type, 'value') else str(item.item_type),
        "image_url": item.image_url,
        "owner_id": str(item.owner_id),
        "pooled_in": pooled_in,
        "category": category,
        "genre": genre,
        "subject": tags,
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

def sync_work_metadata_to_search(meta: WorkMetadata):
    index = client.index("works")
    # Use deterministic UUID based on author and title for safe Meilisearch ID
    safe_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{meta.author}:{meta.title}"))
    document = {
        "id": safe_id,
        "author": meta.author,
        "title": meta.title,
        "isbn": meta.isbn,
        "description": meta.description,
        "category": meta.category,
        "genre": meta.genre,
        "image_url": meta.image_url,
        "subject": meta.tags,
    }
    index.add_documents([document])

def reindex_all_data(session: Session) -> None:
    """Reindex all data into Meilisearch. Superuser only trigger."""
    configure_search()
    
    # 1. Reindex Items
    items = session.exec(select(Item)).all()
    for item in items:
        # Trigger loading of communities relationship
        _ = item.communities
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
