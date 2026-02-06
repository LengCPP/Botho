import uuid

import meilisearch

from app.core.config import settings
from app.models import Community, Item, WorkMetadata

client = meilisearch.Client(settings.MEILI_URL, settings.MEILI_MASTER_KEY)

def sync_item_to_search(item: Item):
    index = client.index("items")
    document = {
        "id": str(item.id),
        "title": item.title,
        "description": item.description,
        "author": item.author,
        "item_type": str(item.item_type.value) if hasattr(item.item_type, 'value') else str(item.item_type),
        "info": item.info,
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
        "image_url": meta.image_url,
        "tags": meta.tags,
    }
    index.add_documents([document])

# Aliases for compatibility if needed
def sync_book_to_search(book: Item):
    sync_item_to_search(book)

def delete_book_from_search(book_id: uuid.UUID):
    delete_item_from_search(book_id)
