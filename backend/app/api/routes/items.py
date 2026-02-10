import json
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, BackgroundTasks
from sqlmodel import col, func, or_, select

from sqlalchemy.orm import joinedload
from app.api.deps import CurrentUser, SessionDep
from app.api.utils import (
    check_item_availability,
    check_possession,
    filter_owner_privacy,
    get_item_condition_data,
    get_work_metadata,
    ensure_work_metadata,
    maintenance_bulk_classify,
    sync_item_to_archive,
    update_collection_index,
    rebuild_collection_index_task,
)
from app.core.config import settings
from app.models import (
    Community,
    CommunityItem,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    Contribution,
    Friendship,
    FriendshipStatus,
    Interest,
    Item,
    ItemConditionRating,
    ItemConditionRatingCreate,
    ItemConditionRatingPublic,
    ItemPublic,
    ItemReview,
    ItemReviewCreate,
    ItemReviewPublic,
    ItemReviewsPublic,
    ItemReviewVote,
    ItemsPublic,
    ItemType,
    Loan,
    LoanStatus,
    Message,
    UserInterest,
    UserPublic,
    UsersPublic,
    WorkMetadata,
    WorkMetadataPublic,
    WorksMetadataPublic,
    WorkMetadataUpdate,
)
from app.search import (
    delete_item_from_search,
    sync_item_to_search,
    sync_work_metadata_to_search,
)
from app.ai import classify_book
from app.storage import delete_image, upload_image, upload_image_from_url

router = APIRouter(prefix="/items", tags=["items"])


@router.post("/maintenance/bulk-classify", response_model=Message)
def trigger_bulk_classify(
    *, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks
) -> Any:
    """
    Trigger a background task to bulk classify all books and clean up polluted ISBNs.
    Superuser only.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    background_tasks.add_task(maintenance_bulk_classify)
    return Message(message="Bulk classification and cleanup started in background.")


@router.post("/{id}/sync-to-archive", response_model=Message)
async def trigger_sync_to_archive(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Sync a specific item's metadata to the global registry.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    await sync_item_to_archive(session, id)
    return Message(message="Item synced to archive.")


@router.post("/book-registry/sync", response_model=Message)
async def sync_items_to_registry(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Scan all items and ensure they are recorded in the WorkMetadata registry.
    Superuser only. Processes in background.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    async def sync_task():
        # Using a new session for background task
        from app.core.db import engine
        from sqlmodel import Session
        with Session(engine) as bg_session:
            items = bg_session.exec(select(Item).where(Item.item_type == ItemType.book)).all()
            for item in items:
                # Use existing helper to populate registry
                ensure_work_metadata(
                    bg_session,
                    item.author,
                    item.title,
                    isbn=item.extra_data.get("isbn") if item.extra_data else None,
                    description=item.description,
                    category=item.extra_data.get("category") if item.extra_data else None,
                    image_url=item.image_url
                )
            bg_session.commit()

    background_tasks.add_task(sync_task)
    return Message(message=f"Global registry sync started in background.")


@router.get("/book-registry", response_model=WorksMetadataPublic)
def list_book_registry(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    List all books in the global registry. Superuser only for now to avoid abuse.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    count_statement = select(func.count()).select_from(WorkMetadata)
    count = session.exec(count_statement).one()

    statement = select(WorkMetadata).offset(skip).limit(limit)
    books = session.exec(statement).all()
    
    return WorksMetadataPublic(data=books, count=count)


@router.get("/book-registry/search", response_model=list[WorkMetadataPublic])
def search_book_registry(session: SessionDep, current_user: CurrentUser, q: str, limit: int = 5) -> Any:
    """
    Search the global book registry by title or author using Meilisearch.
    """
    from app.search import client
    index = client.index("works")
    search_results = index.search(q, {"limit": limit})

    works = []
    for hit in search_results["hits"]:
        works.append(WorkMetadataPublic(
            author=hit["author"],
            title=hit["title"],
            isbn=hit.get("isbn"),
            description=hit.get("description"),
            category=hit.get("category"),
            image_url=hit.get("image_url"),
            tags=hit.get("tags", []),
            average_rating=0.0, # Not indexed for now
            review_count=0      # Not indexed for now
        ))
    return works


@router.get("/book-registry/{isbn}", response_model=WorkMetadataPublic)
def lookup_book_registry(session: SessionDep, current_user: CurrentUser, isbn: str) -> Any:
    """
    Lookup a book in the global registry by ISBN.
    """
    statement = select(WorkMetadata).where(WorkMetadata.isbn == isbn)
    meta = session.exec(statement).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Book not found in registry")
    return meta


def check_possession(session: SessionDep, user_id: uuid.UUID, item_id: uuid.UUID) -> bool:
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


def get_item_condition_data(session: SessionDep, item_id: uuid.UUID) -> dict[str, Any]:
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


@router.get("/recommendations", response_model=ItemsPublic)
def recommend_items(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 10,
) -> Any:
    """
    Get recommended books based on user interests and social graph.
    Uses Meilisearch for ranking and filtering.
    """
    from app.search import client
    
    # 1. Get Social Graph (Friends & Communities)
    # Optimization: If user has 0 items and 0 interests, skip complex logic
    if current_user.collection_index and current_user.collection_index.get("total") == 0:
        # Check interests
        interests_count = session.exec(
            select(func.count(UserInterest.interest_id)).where(UserInterest.user_id == current_user.id)
        ).one()
        if interests_count == 0:
            return ItemsPublic(data=[], count=0)

    # Friends (bidirectional)
    friends_stmt = select(Friendship).where(
        (Friendship.user_id == current_user.id) | (Friendship.friend_id == current_user.id),
        Friendship.status == FriendshipStatus.ACCEPTED
    )
    friendships = session.exec(friends_stmt).all()
    friend_ids = set()
    for f in friendships:
        if f.user_id == current_user.id:
            friend_ids.add(str(f.friend_id))
        else:
            friend_ids.add(str(f.user_id))
            
    # Communities
    comm_stmt = select(CommunityMember.community_id).where(
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED
    )
    community_ids = {str(cid) for cid in session.exec(comm_stmt).all()}
    
    # 2. Get Interests
    interests = session.exec(
        select(Interest.name)
        .join(UserInterest)
        .where(UserInterest.user_id == current_user.id)
    ).all()

    # 2.1 Get Past Loans (Subjects/History)
    # Fetch last 20 items borrowed by the user
    loan_items_stmt = (
        select(Item.author, Item.title)
        .join(Loan, Loan.item_id == Item.id)
        .where(Loan.requester_id == current_user.id)
        .order_by(Loan.created_at.desc())
        .limit(20)
    )
    loan_items = session.exec(loan_items_stmt).all()

    # 2.2 Get Highly Rated Items
    # Fetch items rated 4 or 5 by the user
    rated_items_stmt = (
        select(ItemReview.author, ItemReview.title)
        .where(ItemReview.user_id == current_user.id, ItemReview.rating >= 4)
        .limit(20)
    )
    rated_items = session.exec(rated_items_stmt).all()

    # Collect unique work identifiers
    work_keys = set()
    for author, title in loan_items:
        if author and title:
            work_keys.add((author, title))
    for author, title in rated_items:
        if author and title:
            work_keys.add((author, title))

    # Fetch metadata tags/categories for these works
    extra_keywords = set()
    if work_keys:
        from sqlalchemy import tuple_
        
        works_stmt = select(WorkMetadata).where(
            tuple_(WorkMetadata.author, WorkMetadata.title).in_(work_keys)
        )
        works = session.exec(works_stmt).all()
        
        for work in works:
            if work.category:
                extra_keywords.add(work.category)
            if work.tags:
                for tag in work.tags[:3]:
                    extra_keywords.add(tag)

    # Combine Interests + Extra Keywords
    query_parts = list(interests) + list(extra_keywords)
    unique_query_parts = list(set(query_parts))
    search_query = " ".join(unique_query_parts) if unique_query_parts else ""
    
    # 3. Construct Meilisearch Filter
    allowed_owners = list(friend_ids | community_ids)
    allowed_pools = list(community_ids)
    
    filter_expression = ["item_type = 'book'"]
    
    access_filters = []
    if allowed_owners:
        owners_list = ", ".join([f"'{uid}'" for uid in allowed_owners])
        access_filters.append(f"owner_id IN [{owners_list}]")
    if allowed_pools:
        pools_list = ", ".join([f"'{pid}'" for pid in allowed_pools])
        access_filters.append(f"pooled_in IN [{pools_list}]")
        
    if access_filters:
        filter_expression.append(f"({' OR '.join(access_filters)})")
    else:
        return ItemsPublic(data=[], count=0)
        
    # 4. Execute Search
    try:
        index = client.index("items")
        search_results = index.search(
            search_query,
            {
                "filter": filter_expression,
                "limit": limit,
                "offset": skip,
            }
        )
        hits = search_results["hits"]
    except Exception:
        return ItemsPublic(data=[], count=0)
    
    if not hits:
        return ItemsPublic(data=[], count=0)
        
    item_ids = [uuid.UUID(hit["id"]) for hit in hits]
    
    # 5. Fetch DB Items
    # Exclude items with DEFAULTED loans
    defaulted_item_ids = select(Loan.item_id).where(Loan.status == LoanStatus.DEFAULTED)
    db_items = session.exec(
        select(Item)
        .where(Item.id.in_(item_ids))
        .where(~Item.id.in_(defaulted_item_ids))
    ).all()
    item_map = {item.id: item for item in db_items}
    
    ordered_items = []
    for hit in hits:
        hid = uuid.UUID(hit["id"])
        if hid in item_map:
            item = item_map[hid]
            
            # Enrich
            is_avail = check_item_availability(session, item.id)
            owner_pub = None
            community_pub = None
            if item.user_owner:
                owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
                owner_pub.is_available = is_avail
            elif item.community_owner:
                community_pub = item.community_owner
                
            cond_data = get_item_condition_data(session, item.id)
            had_possession = check_possession(session, current_user.id, item.id)
            
            item_pub = ItemPublic(
                id=item.id,
                owner_id=item.owner_id,
                title=item.title,
                description=item.description,
                author=item.author,
                item_type=item.item_type,
                image_url=item.image_url,
                extra_data=item.extra_data,
                info={
                    **(item.info or {}),
                    "average_condition_grade": cond_data["average_grade"],
                    "physical_notes": cond_data["notes"]
                },
                count=item.count,
                created_at=item.created_at,
                owner=owner_pub,
                community_owner=community_pub,
                is_available=is_avail,
                work_metadata=get_work_metadata(session, item.author, item.title),
                had_possession=had_possession
            )
            ordered_items.append(item_pub)
            
    return ItemsPublic(data=ordered_items, count=len(ordered_items))


@router.get("/facets")
def read_item_facets(
    session: SessionDep,
    current_user: CurrentUser,
    group_by: str = "category",
    owner_id: uuid.UUID | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 20,
) -> Any:
    """
    Get unique values and counts for a specific facet for user or community items.
    Returns paginated results.
    """
    target_owner_id = owner_id or current_user.id
    
    # Simple permission check (same as read_items)
    if target_owner_id != current_user.id and not current_user.is_superuser:
        is_community = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == target_owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        if not is_community:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    # Optimization: Check collection index total
    owner_obj = session.get(User, target_owner_id)
    if not owner_obj:
        owner_obj = session.get(Community, target_owner_id)
        
    if owner_obj and owner_obj.collection_index:
        total = owner_obj.collection_index.get("total")
        if total == 0:
             return {"data": [], "count": 0}

    # Map 'subject' to 'tags' for Meilisearch indexing
    # facet_field = "tags" if group_by == "subject" else group_by
    facet_field = group_by

    from app.search import client as meili_client
    meili_success = False
    # try:
    #     index = meili_client.index("items")
    #     filters = [f"owner_id = '{target_owner_id}'"]
    #     
    #     search_params = {
    #         "limit": 0,
    #         "filter": " AND ".join(filters),
    #         "facets": [facet_field]
    #     }
    #     
    #     # Use a short timeout for facet retrieval to avoid hanging
    #     search_results = index.search(q or "", search_params)
    #     facet_distribution = search_results.get("facetDistribution", {})
    #     counts = facet_distribution.get(facet_field, {})
    #     
    #     # Sort counts by value descending
    #     all_sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    #     total_count = len(all_sorted_counts)
    #     
    #     # Handle "Others" separately or include in counts
    #     # Meilisearch facetDistribution usually doesn't include nulls.
    #     # But for UI consistency, we might want to check for others.
    #     
    #     # Apply pagination
    #     paginated_counts = all_sorted_counts[skip : skip + limit]
    #     
    #     results = []
    #     for name, count in paginated_counts:
    #         # For each facet, we want ONE sample image (or multiple if we want to enrich). 
    #         sample_params = {
    #             "limit": 1,
    #             "filter": f"{facet_field} = \"{name}\" AND {' AND '.join(filters)}"
    #         }
    #         sample_res = index.search(q or "", sample_params)
    #         sample_images = []
    #         if sample_res["hits"]:
    #             img = sample_res["hits"][0].get("image_url")
    #             if img:
    #                 sample_images.append(img)
    #         
    #         results.append({
    #             "name": name, 
    #             "count": count,
    #             "sample_images": sample_images
    #         })
    #         
    #     meili_success = True
    #     return {"data": results, "count": total_count}
    # except Exception:
    #     meili_success = False

    if not meili_success:
        # SQL Fallback for facets
        results = []
        total_count = 0
        if group_by == "author":
            # Count total unique authors
            total_count = session.exec(
                select(func.count(func.distinct(Item.author))).where(Item.owner_id == target_owner_id)
            ).one()

            # Group by author with pagination
            stmt = select(Item.author, func.count(Item.id), func.max(Item.image_url))\
                .where(Item.owner_id == target_owner_id)\
                .group_by(Item.author)\
                .order_by(func.count(Item.id).desc())\
                .offset(skip).limit(limit)
            
            rows = session.exec(stmt).all()
            for author, count, img in rows:
                results.append({
                    "name": author or "Others", 
                    "count": count, 
                    "sample_images": [img] if img else []
                })

        elif group_by in ["category", "genre"]:
            json_field = group_by
            # Count total unique
            total_count = session.exec(
                select(func.count(func.distinct(func.json_extract_path_text(Item.extra_data, json_field))))\
                .where(Item.owner_id == target_owner_id)
            ).one()

            stmt = select(
                func.json_extract_path_text(Item.extra_data, json_field).label("name"),
                func.count(Item.id).label("count"),
                func.max(Item.image_url).label("sample_image")
            ).where(Item.owner_id == target_owner_id)\
            .group_by("name")\
            .order_by(func.count(Item.id).desc())\
            .offset(skip).limit(limit)
            
            rows = session.exec(stmt).all()
            for name, count, img in rows:
                results.append({
                    "name": name or "Others", 
                    "count": count, 
                    "sample_images": [img] if img else []
                })

        elif group_by == "subject":
            # Subjects (tags) are in WorkMetadata, requires join
            # This is complex for SQL total count due to JSON array elements
            base_stmt = select(
                func.json_array_elements_text(WorkMetadata.tags).label("name"),
                func.count(Item.id).label("count"),
                func.max(Item.image_url).label("sample_image")
            ).join(
                WorkMetadata, (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title)
            ).where(Item.owner_id == target_owner_id).group_by("name")

            try:
                # Get total count by wrapping in subquery
                total_count = session.exec(select(func.count()).select_from(base_stmt.subquery())).one()
                
                rows = session.exec(base_stmt.order_by(func.count(Item.id).desc()).offset(skip).limit(limit)).all()
                for name, count, img in rows:
                    results.append({
                        "name": name, 
                        "count": count, 
                        "sample_images": [img] if img else []
                    })
            except Exception:
                pass
        
        return {"data": results, "count": total_count}



@router.get("/", response_model=ItemsPublic)
def read_items(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    owner_id: uuid.UUID | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    category: str | None = None,
    genre: str | None = None,
    subject: str | None = None,
    author: str | None = None,
    item_type: ItemType | None = None,
    enable_feed: bool = False,
    q: str | None = None,
) -> Any:
    """
    Retrieve items. Filters by current user's owner_id by default, unless enable_feed is True.
    Supports searching via 'q' using Meilisearch.
    """
    print(f"DEBUG: read_items called with author={author}, subject={subject}")

    target_owner_id = None
    feed_mode = False
    allowed_community_ids = []

    # Exclude items with DEFAULTED loans
    defaulted_item_ids = select(Loan.item_id).where(Loan.status == LoanStatus.DEFAULTED)

    # Permission check and target owner selection
    if owner_id:
        if owner_id != current_user.id:
            # Check if it's a community owner_id
            is_community = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()

            if not is_community:
                # Check if public community
                is_public_community = session.exec(
                    select(Community).where(Community.id == owner_id, Community.is_private == False)
                ).first()
                
                if not is_public_community:
                    # Check if friend
                    is_friend = session.exec(
                        select(Friendship).where(
                            ((Friendship.user_id == current_user.id) & (Friendship.friend_id == owner_id)) |
                            ((Friendship.user_id == owner_id) & (Friendship.friend_id == current_user.id)),
                            Friendship.status == FriendshipStatus.ACCEPTED
                        )
                    ).first()
                    if not is_friend and not current_user.is_superuser:
                        raise HTTPException(status_code=403, detail="Not enough permissions to view this user's items")
        target_owner_id = owner_id
    elif enable_feed:
        feed_mode = True
    else:
        target_owner_id = current_user.id

    if feed_mode:
        # Get IDs of communities user is in
        my_community_ids = session.exec(
            select(CommunityMember.community_id).where(
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).all()
        
        # Get public communities
        public_community_ids = session.exec(
            select(Community.id).where(Community.is_private == False)
        ).all()
        
        allowed_community_ids = list(set(my_community_ids + public_community_ids))

    # Use Meilisearch for all listings to support facets and global filtering
    from app.search import client as meili_client
    meili_success = False
    facets = None
    facet_stats = None

    try:
        index = meili_client.index("items")
        filters = []
        if target_owner_id:
            filters.append(f'owner_id = "{target_owner_id}"')
        if category:
            filters.append(f'category = "{category}"')
        if genre:
            filters.append(f'genre = "{genre}"')
        if subject:
            filters.append(f'subject = "{subject}"')
        if author:
            # Use exact match for author in filter (frontend sends exact name)
            filters.append(f'author = "{author}"')
        if item_type:
            filters.append(f'item_type = "{item_type.value}"')
        if feed_mode:
            if allowed_community_ids:
                allowed_ids_str = "[" + ", ".join([f'"{cid}"' for cid in allowed_community_ids]) + "]"
                filters.append(f"(owner_id IN {allowed_ids_str} OR pooled_in IN {allowed_ids_str})")
            else:
                return ItemsPublic(data=[], count=0)

        search_params = {
            "limit": limit,
            "offset": skip,
            "filter": " AND ".join(filters) if filters else None,
            "facets": ["category", "genre", "author", "item_type", "subject"],
            "sort": [f"{sort_by if sort_by != 'created_at' else 'id'}:{sort_order}"]
        }
        
        search_results = index.search(q or "", search_params)
        item_ids = [uuid.UUID(hit["id"]) for hit in search_results["hits"]]
        count = search_results.get("totalHits", len(item_ids))
        facets = search_results.get("facetDistribution")
        facet_stats = search_results.get("facetStats")

        if not item_ids:
            return ItemsPublic(data=[], count=count, facets=facets, facet_stats=facet_stats)

        # Fetch from DB preserving order
        db_items = session.exec(
            select(Item)
            .where(Item.id.in_(item_ids))
            .where(~Item.id.in_(defaulted_item_ids))
            .options(joinedload(Item.user_owner), joinedload(Item.community_owner))
        ).all()
        item_map = {item.id: item for item in db_items}
        items = [item_map[iid] for iid in item_ids if iid in item_map]
        meili_success = True
    except Exception:
        meili_success = False

    if not meili_success:
        # Fallback to SQL if Meilisearch fails or is not applicable
        facets = {} # SQL fallback doesn't easily calculate all facets
        facet_stats = {}
        if q:
            q_filter = or_(
                col(Item.title).ilike(f"%{q}%"),
                col(Item.description).ilike(f"%{q}%"),
                col(Item.author).ilike(f"%{q}%")
            )
            if feed_mode:
                statement = select(Item).where(
                    q_filter,
                    or_(
                        Item.owner_id.in_(allowed_community_ids),
                        Item.community_owner.has(Community.id.in_(allowed_community_ids))
                    )
                )
            else:
                statement = select(Item).where(q_filter, Item.owner_id == target_owner_id)

            statement = statement.where(Item.id.not_in(defaulted_item_ids))

            if category:
                statement = statement.where(func.json_extract_path_text(Item.extra_data, 'category') == category)
            if genre:
                statement = statement.where(func.json_extract_path_text(Item.extra_data, 'genre') == genre)
            if subject:
                statement = statement.join(
                    WorkMetadata, 
                    (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title)
                ).where(func.json_extract_path_text(WorkMetadata.tags, '$').ilike(f'%"{subject}"%'))
            if author:
                statement = statement.where(Item.author == author)
            if item_type:
                statement = statement.where(Item.item_type == item_type)

            count_stmt = select(func.count()).select_from(statement.subquery())
            count = session.exec(count_stmt).one()
            items = session.exec(statement.offset(skip).limit(limit)).all()
        else:
            # Standard SQL filtering
            if feed_mode:
                statement = select(Item).where(
                    or_(
                        Item.owner_id.in_(allowed_community_ids),
                        Item.community_owner.has(Community.id.in_(allowed_community_ids))
                    )
                )
            else:
                statement = select(Item).where(Item.owner_id == target_owner_id)

            statement = statement.where(Item.id.not_in(defaulted_item_ids))

            if category:
                statement = statement.where(
                    func.json_extract_path_text(Item.extra_data, 'category') == category
                )

            if genre:
                statement = statement.where(
                    func.json_extract_path_text(Item.extra_data, 'genre') == genre
                )

            if subject:
                statement = statement.join(
                    WorkMetadata, 
                    (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title)
                ).where(func.json_extract_path_text(WorkMetadata.tags, '$').ilike(f'%"{subject}"%'))

            if author:
                statement = statement.where(Item.author == author)

            if item_type:
                statement = statement.where(Item.item_type == item_type)

            # Count total
            count_stmt = select(func.count()).select_from(statement.subquery())
            count = session.exec(count_stmt).one()

            # Apply sorting
            sort_column = Item.created_at
            if sort_by == "title":
                sort_column = Item.title
            elif sort_by == "author":
                sort_column = Item.author

            if sort_order == "desc":
                statement = statement.order_by(sort_column.desc())
            else:
                statement = statement.order_by(sort_column.asc())

            items = session.exec(
                statement.options(joinedload(Item.user_owner), joinedload(Item.community_owner))
                .offset(skip).limit(limit)
            ).all()

    # Assemble public items
    if not items:
        return ItemsPublic(data=[], count=count, facets=facets, facet_stats=facet_stats)

    # 1. Collect identifiers for bulk fetching
    item_ids = [item.id for item in items]
    # Unique (author, title) pairs for WorkMetadata
    work_keys = {(item.author, item.title) for item in items if item.author and item.title}
    
    # 2. Bulk fetch WorkMetadata
    work_meta_map = {}
    if work_keys:
        from sqlalchemy import tuple_
        work_metas = session.exec(
            select(WorkMetadata).where(
                tuple_(WorkMetadata.author, WorkMetadata.title).in_(list(work_keys))
            )
        ).all()
        for wm in work_metas:
            work_meta_map[(wm.author, wm.title)] = wm

    # 3. Bulk fetch active loans for availability
    # Item is available if NO active/pending loan exists
    active_loan_item_ids = set(session.exec(
        select(Loan.item_id).where(
            Loan.item_id.in_(item_ids),
            Loan.status.in_([
                LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, 
                LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING, LoanStatus.DEFAULTED
            ])
        )
    ).all())

    # 4. Bulk fetch possession history for current user
    # User had possession if they are owner OR had a loan in certain statuses
    # We already know if they are owner from item.owner_id
    possession_loan_item_ids = set(session.exec(
        select(Loan.item_id).where(
            Loan.item_id.in_(item_ids),
            Loan.requester_id == current_user.id,
            Loan.status.in_([
                LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, 
                LoanStatus.RETURNED, LoanStatus.EXTENSION_PENDING
            ])
        )
    ).all())

    # 5. Bulk fetch condition ratings
    condition_ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id.in_(item_ids))
    ).all()
    
    condition_data_map = {} # item_id -> {"sum": float, "count": int, "notes": []}
    for r in condition_ratings:
        if r.item_id not in condition_data_map:
            condition_data_map[r.item_id] = {"sum": 0.0, "count": 0, "notes": []}
        
        condition_data_map[r.item_id]["sum"] += r.grade
        condition_data_map[r.item_id]["count"] += 1
        if r.notes:
            condition_data_map[r.item_id]["notes"].append({
                "user_id": str(r.user_id),
                "note": r.notes,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })

    # 6. Build final list
    public_items = []
    for item in items:
        is_avail = item.id not in active_loan_item_ids
        
        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner

        # Condition enrichment
        cond_stats = condition_data_map.get(item.id, {"sum": 0.0, "count": 0, "notes": []})
        avg_grade = cond_stats["sum"] / cond_stats["count"] if cond_stats["count"] > 0 else 0.0
        
        # Possession enrichment
        had_possession = item.owner_id == current_user.id or item.id in possession_loan_item_ids

        item_pub = ItemPublic(
            id=item.id,
            owner_id=item.owner_id,
            title=item.title,
            description=item.description,
            author=item.author,
            item_type=item.item_type,
            image_url=item.image_url,
            extra_data=item.extra_data,
            info={
                **(item.info or {}),
                "average_condition_grade": avg_grade,
                "physical_notes": cond_stats["notes"]
            },
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail,
            work_metadata=work_meta_map.get((item.author, item.title)),
            had_possession=had_possession
        )
        public_items.append(item_pub)

    return ItemsPublic(data=public_items, count=count, facets=facets, facet_stats=facet_stats)


@router.get("/{id}", response_model=ItemPublic)
def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get item by ID.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Permission check
    if item.owner_id != current_user.id and not current_user.is_superuser:
        if item.user_owner:
            is_friend = session.exec(
                select(Friendship).where(
                    ((Friendship.user_id == current_user.id) & (Friendship.friend_id == item.owner_id)) |
                    ((Friendship.user_id == item.owner_id) & (Friendship.friend_id == current_user.id)),
                    Friendship.status == FriendshipStatus.ACCEPTED
                )
            ).first()
            if not is_friend:
                 raise HTTPException(status_code=403, detail="Not enough permissions (Not a friend of owner)")
        elif item.community_owner: # Community item
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()
            if not is_member:
                raise HTTPException(status_code=403, detail="Not enough permissions (Not a member of owning community)")

    is_avail = check_item_availability(session, item.id)

    owner_pub = None
    community_pub = None
    if item.user_owner:
        owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
        owner_pub.is_available = is_avail
    elif item.community_owner:
        community_pub = item.community_owner

    cond_data = get_item_condition_data(session, item.id)
    had_possession = check_possession(session, current_user.id, item.id)

    item_pub = ItemPublic(
        id=item.id,
        owner_id=item.owner_id,
        title=item.title,
        description=item.description,
        author=item.author,
        item_type=item.item_type,
        image_url=item.image_url,
        extra_data=item.extra_data,
        info={
            **(item.info or {}),
            "average_condition_grade": cond_data["average_grade"],
            "physical_notes": cond_data["notes"]
        },
        count=item.count,
        created_at=item.created_at,
        owner=owner_pub,
        community_owner=community_pub,
        is_available=is_avail,
        work_metadata=get_work_metadata(session, item.author, item.title),
        had_possession=had_possession
    )
    return item_pub


@router.post("/", response_model=ItemPublic)
async def create_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    title: Annotated[str, Form()],
    description: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
    item_type: Annotated[ItemType, Form()] = ItemType.general,
    extra_data: Annotated[str | None, Form()] = None,
    info: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
    community_owner_id: Annotated[uuid.UUID | None, Form()] = None,
) -> Any:
    """
    Create a new item. Associates with current user or community as owner.
    """
    try:
        parsed_extra = {}
        if extra_data:
            try:
                parsed_extra = json.loads(extra_data)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in extra_data")

        parsed_info = {}
        if info:
            try:
                parsed_info = json.loads(info)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in info")

        # Auto-extract author if not provided but in extra_data (e.g. from Google Books)
        final_author = author
        if not final_author and parsed_extra:
            final_author = parsed_extra.get("author") or parsed_extra.get("authors")
            if isinstance(final_author, list):
                final_author = ", ".join(final_author)

        # AI Classification for books if category/genre is missing
        if item_type == ItemType.book:
            current_cat = parsed_extra.get("category") or (", ".join(parsed_extra.get("categories")) if isinstance(parsed_extra.get("categories"), list) else parsed_extra.get("categories"))
            current_genre = parsed_extra.get("genre")
            
            if not current_cat or not current_genre:
                ai_cat, ai_genre = await classify_book(title, final_author or "", description)
                if not current_cat and ai_cat:
                    parsed_extra["category"] = ai_cat
                if not current_genre and ai_genre:
                    parsed_extra["genre"] = ai_genre

        # Handle image upload
        final_image_url = image_url
        if image:
            try:
                contents = await image.read()
                if len(contents) > settings.max_image_size_bytes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image size exceeds the {settings.MAX_IMAGE_SIZE_MB}MB limit."
                    )
                final_image_url = upload_image(contents, image.filename, folder="items")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")
        elif image_url and image_url.startswith("http"):
            # Download and store external image (e.g. from Google Books)
            try:
                stored_url = upload_image_from_url(image_url, folder="items")
                if stored_url:
                    final_image_url = stored_url
            except Exception:
                pass

        # Determine owner
        target_owner_id = current_user.id
        should_pool = False

        if community_owner_id:
            # Check if user is admin of this community
            statement = select(CommunityMember).where(
                CommunityMember.community_id == community_owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
            is_admin = session.exec(statement).first() or current_user.is_superuser

            if is_admin:
                target_owner_id = community_owner_id
            else:
                target_owner_id = current_user.id
                should_pool = True

        if not target_owner_id:
            raise HTTPException(status_code=400, detail="Owner ID could not be determined")

        db_item = Item(
            title=title,
            description=description,
            author=final_author,
            item_type=item_type,
            extra_data=parsed_extra,
            info=parsed_info,
            image_url=final_image_url,
            owner_id=target_owner_id,
        )
        session.add(db_item)
        session.flush()

        if should_pool and community_owner_id:
            statement = select(CommunityMember).where(
                CommunityMember.community_id == community_owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
            if session.exec(statement).first():
                comm_item = CommunityItem(
                    community_id=community_owner_id,
                    item_id=db_item.id,
                    added_by=current_user.id
                )
                session.add(comm_item)

        # Ensure WorkMetadata exists
        if final_author:
            ensure_work_metadata(
                session,
                final_author,
                title,
                isbn=parsed_extra.get("isbn"),
                description=description,
                category=parsed_extra.get("category") or (", ".join(parsed_extra.get("categories")) if isinstance(parsed_extra.get("categories"), list) else parsed_extra.get("categories")),
                image_url=final_image_url
            )

        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)

        # Update collection index for owner in background
        background_tasks.add_task(rebuild_collection_index_task, db_item.owner_id)

        owner_pub = None
        community_pub = None
        if db_item.user_owner:
            owner_pub = filter_owner_privacy(db_item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = True
        elif db_item.community_owner:
            community_pub = db_item.community_owner

        item_pub = ItemPublic(
            id=db_item.id,
            owner_id=db_item.owner_id,
            title=db_item.title,
            description=db_item.description,
            author=db_item.author,
            item_type=db_item.item_type,
            image_url=db_item.image_url,
            extra_data=db_item.extra_data,
            info=db_item.info,
            count=db_item.count,
            created_at=db_item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=True,
            work_metadata=get_work_metadata(session, db_item.author, db_item.title),
            had_possession=True
        )
        return item_pub
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred while creating the item: {str(e)}")


@router.patch("/{id}", response_model=ItemPublic)
async def update_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
    title: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
    item_type: Annotated[ItemType | None, Form()] = None,
    extra_data: Annotated[str | None, Form()] = None,
    info: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
) -> Any:
    """
    Update an item.
    """
    try:
        db_item = session.get(Item, id)
        if not db_item:
            raise HTTPException(status_code=404, detail="Item not found")

        # Permission check
        if db_item.user_owner:
            if db_item.owner_id != current_user.id and not current_user.is_superuser:
                raise HTTPException(status_code=403, detail="Not enough permissions")
        elif db_item.community_owner:
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == db_item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()
            if not is_member and not current_user.is_superuser:
                raise HTTPException(status_code=403, detail="Not enough permissions (Community admin required)")

        if title is not None:
            db_item.title = title
        if description is not None:
            db_item.description = description
        if author is not None:
            db_item.author = author
        if item_type is not None:
            db_item.item_type = item_type
        if image_url is not None:
            if image_url.startswith("http"):
                try:
                    stored_url = upload_image_from_url(image_url, folder="items")
                    if stored_url:
                        db_item.image_url = stored_url
                except:
                    db_item.image_url = image_url
            else:
                db_item.image_url = image_url
        if extra_data is not None:
            try:
                db_item.extra_data = json.loads(extra_data)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in extra_data")
        
        # AI Classification for books if category/genre is missing after update
        if (item_type == ItemType.book or db_item.item_type == ItemType.book):
            extra = db_item.extra_data or {}
            if not extra.get("category") or not extra.get("genre"):
                ai_cat, ai_genre = await classify_book(db_item.title, db_item.author or "", db_item.description)
                if not extra.get("category") and ai_cat:
                    extra["category"] = ai_cat
                if not extra.get("genre") and ai_genre:
                    extra["genre"] = ai_genre
                db_item.extra_data = extra

        if info is not None:
            try:
                db_item.info = json.loads(info)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in info")

        if image:
            try:
                if db_item.image_url:
                    delete_image(db_item.image_url)
                contents = await image.read()
                if len(contents) > settings.max_image_size_bytes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image size exceeds the {settings.MAX_IMAGE_SIZE_MB}MB limit."
                    )
                db_item.image_url = upload_image(contents, image.filename, folder="items")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")

        # Record contribution
        contribution = Contribution(
            user_id=current_user.id,
            item_id=db_item.id,
            description="Updated item specifications"
        )
        session.add(contribution)

        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)

        # Update collection index for owner in background
        background_tasks.add_task(rebuild_collection_index_task, db_item.owner_id)

        # Refresh honor score
        from app.api.routes.loans import refresh_user_honor
        await refresh_user_honor(session, current_user.id)

        is_avail = check_item_availability(session, db_item.id)

        owner_pub = None
        community_pub = None
        if db_item.user_owner:
            owner_pub = filter_owner_privacy(db_item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        elif db_item.community_owner:
            community_pub = db_item.community_owner

        cond_data = get_item_condition_data(session, db_item.id)

        item_pub = ItemPublic(
            id=db_item.id,
            owner_id=db_item.owner_id,
            title=db_item.title,
            description=db_item.description,
            author=db_item.author,
            item_type=db_item.item_type,
            image_url=db_item.image_url,
            extra_data=db_item.extra_data,
            info={
                **(db_item.info or {}),
                "average_condition_grade": cond_data["average_grade"],
                "physical_notes": cond_data["notes"]
            },
            count=db_item.count,
            created_at=db_item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail,
            work_metadata=get_work_metadata(session, db_item.author, db_item.title),
            had_possession=check_possession(session, current_user.id, db_item.id)
        )
        return item_pub
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred while updating the item: {str(e)}")


@router.delete("/{id}", response_model=Message)
def delete_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
) -> Any:
    """
    Delete an item.
    """
    db_item = session.get(Item, id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Permission check: User must be owner OR admin of owning community
    if db_item.user_owner:
        if db_item.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif db_item.community_owner:
        is_member = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == db_item.owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        if not is_member and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions (Community admin required)")

    if db_item.image_url:
        delete_image(db_item.image_url)

    owner_id = db_item.owner_id # Save for background task
    session.delete(db_item)
    session.commit()
    
    # Update collection index for owner in background
    background_tasks.add_task(rebuild_collection_index_task, owner_id)

    delete_item_from_search(id)
    return Message(message="Item deleted successfully")


@router.post("/{id}/duplicate", response_model=ItemPublic)
def duplicate_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    id: uuid.UUID,
) -> Any:
    """
    Duplicate an existing item for the current user.
    """
    source_item = session.get(Item, id)
    if not source_item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Create copy
    new_item = Item(
        title=source_item.title,
        description=source_item.description,
        author=source_item.author,
        item_type=source_item.item_type,
        image_url=source_item.image_url,
        extra_data=source_item.extra_data,
        info={}, # Physical info (grade, notes) should not be copied
        owner_id=current_user.id,
    )

    session.add(new_item)
    session.commit()
    session.refresh(new_item)
    sync_item_to_search(new_item)

    # Update collection index for owner in background
    background_tasks.add_task(rebuild_collection_index_task, new_item.owner_id)

    owner_pub = filter_owner_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)
    owner_pub.is_available = True

    return ItemPublic(
        id=new_item.id,
        owner_id=new_item.owner_id,
        title=new_item.title,
        description=new_item.description,
        author=new_item.author,
        item_type=new_item.item_type,
        image_url=new_item.image_url,
        extra_data=new_item.extra_data,
        info=new_item.info,
        count=new_item.count,
        created_at=new_item.created_at,
        owner=owner_pub,
        is_available=True,
        work_metadata=get_work_metadata(session, new_item.author, new_item.title),
        had_possession=True
    )


@router.get("/work-metadata/{author}/{title}", response_model=WorkMetadataPublic)
def read_work_metadata(
    *, session: SessionDep, current_user: CurrentUser, author: str, title: str
) -> Any:
    """
    Get metadata for a work.
    """
    meta = session.get(WorkMetadata, (author, title))
    if not meta:
        # Check if any item exists with this author/title to justify creating meta
        exists = session.exec(select(Item).where(Item.author == author, Item.title == title)).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Work not found")
        meta = WorkMetadata(author=author, title=title)
        session.add(meta)
        session.commit()
        session.refresh(meta)
    return meta


@router.patch("/work-metadata/{author}/{title}", response_model=WorkMetadataPublic)
async def update_work_metadata(
    *, session: SessionDep, current_user: CurrentUser, author: str, title: str, meta_in: WorkMetadataUpdate
) -> Any:
    """
    Update metadata for a work (Tags).
    """
    meta = session.get(WorkMetadata, (author, title))
    if not meta:
        meta = WorkMetadata(author=author, title=title)
        session.add(meta)

    update_data = meta_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(meta, key, value)

    # Record contribution
    contribution = Contribution(
        user_id=current_user.id,
        work_author=author,
        work_title=title,
        description="Updated work metadata (tags)"
    )
    session.add(contribution)

    session.add(meta)
    session.commit()
    session.refresh(meta)

    # Refresh honor score
    from app.api.routes.loans import refresh_user_honor
    await refresh_user_honor(session, current_user.id)

    return meta


@router.delete("/work-metadata/{author}/{title}", response_model=Message)
def delete_work_metadata(
    *, session: SessionDep, current_user: CurrentUser, author: str, title: str
) -> Any:
    """
    Delete metadata for a work. Superuser only.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    meta = session.get(WorkMetadata, (author, title))
    if not meta:
        raise HTTPException(status_code=404, detail="Work metadata not found")

    session.delete(meta)
    session.commit()
    return Message(message="Work metadata deleted successfully")


@router.post("/reviews", response_model=ItemReviewPublic)
def create_review(
    *, session: SessionDep, current_user: CurrentUser, review_in: ItemReviewCreate
) -> Any:
    """
    Add a review for a work.
    """
    # Check if user already reviewed this work
    existing = session.exec(
        select(ItemReview).where(
            ItemReview.author == review_in.author,
            ItemReview.title == review_in.title,
            ItemReview.user_id == current_user.id
        )
    ).first()

    if existing:
        # Update existing
        existing.rating = review_in.rating
        existing.comment = review_in.comment
        review = existing
    else:
        review = ItemReview(
            **review_in.model_dump(),
            user_id=current_user.id
        )
        session.add(review)

    session.flush()

    # Update WorkMetadata aggregate rating
    meta = ensure_work_metadata(session, review_in.author, review_in.title)
    if meta:
        all_reviews = session.exec(
            select(ItemReview).where(
                ItemReview.author == review_in.author,
                ItemReview.title == review_in.title
            )
        ).all()
        meta.review_count = len(all_reviews)
        meta.average_rating = sum(r.rating for r in all_reviews) / len(all_reviews)
        session.add(meta)

    session.commit()
    session.refresh(review)
    return review


@router.get("/reviews/{author}/{title}", response_model=ItemReviewsPublic)
def read_reviews(
    *, session: SessionDep, current_user: CurrentUser, author: str, title: str, skip: int = 0, limit: int = 100
) -> Any:
    """
    Get reviews for a work.
    """
    statement = select(ItemReview).where(
        ItemReview.author == author,
        ItemReview.title == title
    ).order_by(ItemReview.created_at.desc())

    count = session.exec(select(func.count()).select_from(statement.subquery())).one()
    reviews = session.exec(statement.offset(skip).limit(limit)).all()

    public_reviews = []
    for r in reviews:
        # Check if user voted
        vote = session.exec(
            select(ItemReviewVote).where(
                ItemReviewVote.review_id == r.id,
                ItemReviewVote.user_id == current_user.id
            )
        ).first()

        r_public = ItemReviewPublic.model_validate(r)
        if vote:
            r_public.current_user_vote = vote.vote

        public_reviews.append(r_public)

    return ItemReviewsPublic(data=public_reviews, count=count)


@router.post("/reviews/{review_id}/vote", response_model=ItemReviewPublic)
def vote_review(
    *, session: SessionDep, current_user: CurrentUser, review_id: uuid.UUID, vote: int
) -> Any:
    """
    Vote on a review. vote must be 1 (up) or -1 (down).
    """
    if vote not in [1, -1]:
        raise HTTPException(status_code=400, detail="Vote must be 1 or -1")

    review = session.get(ItemReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Check existing vote
    existing_vote = session.exec(
        select(ItemReviewVote).where(
            ItemReviewVote.review_id == review_id,
            ItemReviewVote.user_id == current_user.id
        )
    ).first()

    if existing_vote:
        if existing_vote.vote == vote:
            # Toggle off (remove vote)
            session.delete(existing_vote)
        else:
            # Change vote
            existing_vote.vote = vote
            session.add(existing_vote)
    else:
        # New vote
        new_vote = ItemReviewVote(review_id=review_id, user_id=current_user.id, vote=vote)
        session.add(new_vote)

    session.flush()

    # Recalculate score
    score = session.exec(
        select(func.sum(ItemReviewVote.vote)).where(ItemReviewVote.review_id == review_id)
    ).one()

    review.vote_score = score or 0
    session.add(review)
    session.commit()
    session.refresh(review)
    return review


@router.post("/condition-ratings", response_model=ItemConditionRatingPublic)
def create_condition_rating(
    *, session: SessionDep, current_user: CurrentUser, rating_in: ItemConditionRatingCreate
) -> Any:
    """
    Add or update condition rating for a physical item. 
    User must have had possession of the item.
    """
    if not check_possession(session, current_user.id, rating_in.item_id):
        raise HTTPException(
            status_code=403,
            detail="You must have had possession of this item to rate its condition."
        )

    existing = session.exec(
        select(ItemConditionRating).where(
            ItemConditionRating.item_id == rating_in.item_id,
            ItemConditionRating.user_id == current_user.id
        )
    ).first()

    if existing:
        existing.grade = rating_in.grade
        existing.notes = rating_in.notes
        rating = existing
    else:
        rating = ItemConditionRating(
            **rating_in.model_dump(),
            user_id=current_user.id
        )
        session.add(rating)

    session.commit()
    session.refresh(rating)
    return rating


@router.get("/condition-ratings/{item_id}", response_model=list[ItemConditionRatingPublic])
def read_item_condition_ratings(
    *, session: SessionDep, current_user: CurrentUser, item_id: uuid.UUID
) -> Any:
    """
    Get all condition ratings for a physical item.
    """
    ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id == item_id)
    ).all()
    return ratings
