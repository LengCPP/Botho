import logging

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Community, Item, WorkMetadata, User
from app.search import (
    configure_search,
    sync_community_to_search,
    sync_item_to_search,
    sync_work_metadata_to_search,
)
from app.api.utils import update_collection_index

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def reindex_all() -> None:
    logger.info("Configuring Meilisearch indexes...")
    configure_search()

    with Session(engine) as session:
        # Reindex Items (including Books)
        logger.info("Reindexing items...")
        items = session.exec(select(Item)).all()
        for item in items:
            # Trigger loading of communities relationship for pooled_in indexing
            _ = item.communities 
            sync_item_to_search(item)
        logger.info(f"Reindexed {len(items)} items.")

        # Reindex Communities & Rebuild Collection Index
        logger.info("Reindexing communities and rebuilding collection indexes...")
        communities = session.exec(select(Community)).all()
        for community in communities:
            update_collection_index(session, community.id)
            sync_community_to_search(community)
        logger.info(f"Reindexed and rebuilt indexes for {len(communities)} communities.")

        # Rebuild Collection Index for Users
        logger.info("Rebuilding collection indexes for users...")
        users = session.exec(select(User)).all()
        for user in users:
            update_collection_index(session, user.id)
        logger.info(f"Rebuilt indexes for {len(users)} users.")

        # Reindex Works (Global Registry)
        logger.info("Reindexing work metadata registry...")
        works = session.exec(select(WorkMetadata)).all()
        for work in works:
            sync_work_metadata_to_search(work)
        logger.info(f"Reindexed {len(works)} work metadata entries.")

    logger.info("Reindexing complete.")

if __name__ == "__main__":
    reindex_all()
