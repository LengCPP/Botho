import json
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, BackgroundTasks, Query
from sqlmodel import col, func, or_, select, cast, String, text

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
    ai_classify_specific_books,
    enrich_specific_books,
    sync_item_to_archive,
    update_collection_index,
    rebuild_collection_index_task,
    invalidate_item_caches,
    map_book_classification,
)
from app.core.config import settings
from app.models import (
    BookEnrichmentRequest,
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
    ItemBatchAction,
    ItemBatchEnrich,
    ItemConditionRating,
    ItemConditionRatingCreate,
    ItemConditionRatingPublic,
    ItemMinimal,
    ItemPublic,
    ItemReview,
    ItemReviewCreate,
    ItemReviewPublic,
    ItemReviewsPublic,
    ItemReviewVote,
    ItemsMinimalPublic,
    ItemsPublic,
    ItemType,
    Loan,
    LoanStatus,
    Message,
    User,
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


@router.post("/maintenance/rebuild-indexes", response_model=Message)
def trigger_rebuild_all_indexes(
    *, session: SessionDep, current_user: CurrentUser, background_tasks: BackgroundTasks
) -> Any:
    """
    Trigger a background task to rebuild collection indexes for all users and communities.
    Superuser only.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    def rebuild_task():
        from app.core.db import engine
        from sqlmodel import Session
        from app.search import reindex_all_data
        with Session(engine) as bg_session:
            # 1. Rebuild Meilisearch Index
            reindex_all_data(bg_session)
            
            # 2. Rebuild Communities Collection Indexes
            communities = bg_session.exec(select(Community.id)).all()
            for c_id in communities:
                update_collection_index(bg_session, c_id)
            
            # 3. Rebuild Users Collection Indexes
            users = bg_session.exec(select(User.id)).all()
            for u_id in users:
                update_collection_index(bg_session, u_id)
            
            bg_session.commit()

    background_tasks.add_task(rebuild_task)
    return Message(message="Background task to rebuild all collection indexes started.")


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
    
    background_tasks.add_task(maintenance_bulk_classify, current_user.id)
    return Message(message="Bulk classification and cleanup started in background.")


@router.post("/book-registry/enrich", response_model=Message)
def trigger_enrich_books(
    *, 
    session: SessionDep, 
    current_user: CurrentUser, 
    background_tasks: BackgroundTasks,
    request: BookEnrichmentRequest
) -> Any:
    """
    Trigger a background task to enrich specific books in the registry.
    Superuser only.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    background_tasks.add_task(
        enrich_specific_books, 
        request.books,
        current_user.id,
        request.fields_to_update, 
        request.source_api,
        request.overwrite
    )
    return Message(message=f"Enrichment task started for {len(request.books)} books.")


@router.post("/book-registry/ai-classify", response_model=Message)
def trigger_ai_classify_books(
    *, 
    session: SessionDep, 
    current_user: CurrentUser, 
    background_tasks: BackgroundTasks,
    request: BookEnrichmentRequest # Re-using this schema as it has the list of books
) -> Any:
    """
    Trigger a background task to AI-classify specific books in the registry.
    Superuser only. Strictly for administrative maintenance of the Book Archive.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    background_tasks.add_task(
        ai_classify_specific_books, 
        request.books,
        current_user.id
    )
    return Message(message=f"AI classification task started for {len(request.books)} books.")


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
    filter_missing: str | None = None,
) -> Any:
    """
    List all books in the global registry. Superuser only for now to avoid abuse.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    statement = select(WorkMetadata)

    if filter_missing == "image":
        statement = statement.where(or_(WorkMetadata.image_url.is_(None), WorkMetadata.image_url == ""))
    elif filter_missing == "description":
        statement = statement.where(or_(WorkMetadata.description.is_(None), WorkMetadata.description == ""))
    elif filter_missing == "isbn":
        statement = statement.where(or_(WorkMetadata.isbn.is_(None), WorkMetadata.isbn == ""))
    elif filter_missing == "category":
        statement = statement.where(or_(WorkMetadata.category.is_(None), WorkMetadata.category == ""))

    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    books = session.exec(statement.offset(skip).limit(limit)).all()
    
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

    # 2.3 Get User's Own Items (to understand their taste)
    owned_items_stmt = (
        select(Item.author, Item.title)
        .where(Item.owner_id == current_user.id)
        .limit(20)
    )
    owned_items = session.exec(owned_items_stmt).all()

    # Collect unique work identifiers
    work_keys = set()
    for author, title in loan_items:
        if author and title:
            work_keys.add((author, title))
    for author, title in rated_items:
        if author and title:
            work_keys.add((author, title))
    for author, title in owned_items:
        if author and title:
            work_keys.add((author, title))

    # Fetch metadata tags/categories for these works
    extra_keywords = set()
    if work_keys:
        from sqlalchemy import tuple_
        
        works_stmt = select(WorkMetadata).where(
            tuple_(WorkMetadata.author, WorkMetadata.title).in_(list(work_keys))
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
    
    filter_expression = [f"item_type = 'book'", f"owner_id != '{current_user.id}'"]
    
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
                owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser, session=session)
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
                had_possession=had_possession,
                category=item.extra_data.get("category") if item.extra_data else None,
                genre=item.extra_data.get("genre") if item.extra_data else None,
                subject=item.extra_data.get("subject") if item.extra_data else None
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
    Returns paginated results. Uses Meilisearch for fuzzy search when q is provided.
    """
    target_owner_id = owner_id or current_user.id
    
    # Permission check
    if target_owner_id != current_user.id and not current_user.is_superuser:
        # Check if it's a community owner_id
        is_community = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == target_owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()

        if not is_community:
            # Check if public community
            is_public_community = session.exec(
                select(Community).where(Community.id == target_owner_id, Community.is_private == False)
            ).first()
            
            if not is_public_community:
                # Check if friend
                is_friend = session.exec(
                    select(Friendship).where(
                        ((Friendship.user_id == current_user.id) & (Friendship.friend_id == target_owner_id)) |
                        ((Friendship.user_id == target_owner_id) & (Friendship.friend_id == current_user.id)),
                        Friendship.status == FriendshipStatus.ACCEPTED
                    )
                ).first()
                if not is_friend:
                    raise HTTPException(status_code=403, detail="Not enough permissions")

    # Optimization: Check collection index total
    owner_obj = session.get(User, target_owner_id)
    if not owner_obj:
        owner_obj = session.get(Community, target_owner_id)
        
    if owner_obj and owner_obj.collection_index:
        total = owner_obj.collection_index.get("total")
        if total == 0:
             return {"data": [], "count": 0}

    # Meilisearch logic if q is present
    if q:
        from app.search import client as meili_client
        try:
            index = meili_client.index("items")
            
            # Map facet field
            facet_field = group_by
            if group_by == "subject":
                facet_field = "subject"
            
            search_params = {
                "filter": f'owner_id = "{target_owner_id}" OR pooled_in = "{target_owner_id}"',
                "facets": [facet_field],
                "limit": 0 # We only care about facets
            }
            
            search_results = index.search(q, search_params)
            distribution = search_results.get("facetDistribution", {}).get(facet_field, {})
            
            # Convert to list and sort by count desc or name
            all_facets = [{"name": name, "count": count} for name, count in distribution.items()]
            all_facets.sort(key=lambda x: x["name"].lower())
            
            if not all_facets:
                raise Exception("No facets found in Meilisearch, falling back to SQL")

            # Slice for pagination
            paged_facets = all_facets[skip : skip + limit]
            
            # Fetch sample images from DB for these facets
            results = []
            for f in paged_facets:
                name = f["name"]
                # Fallback to SQL to get sample images for these specific facets
                stmt = select(Item.image_url).where(Item.owner_id == target_owner_id)
                if group_by == "author":
                    stmt = stmt.where(Item.author == name)
                elif group_by in ["category", "genre"]:
                    stmt = stmt.where(func.json_extract_path_text(Item.extra_data, group_by) == name)
                elif group_by == "subject":
                    stmt = stmt.join(WorkMetadata, (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title))\
                               .where(cast(WorkMetadata.tags, String).ilike(f'%"{name}"%'))
                
                imgs = session.exec(stmt.where(Item.image_url.is_not(None)).limit(5)).all()
                results.append({
                    "name": name,
                    "count": f["count"],
                    "sample_images": list(imgs)
                })
            
            return {"data": results, "count": len(all_facets)}
        except Exception:
            pass # Fallback to SQL if Meilisearch fails

    # SQL Fallback
    results = []
    total_count = 0
    
    if group_by == "author":
        count_stmt = select(func.count(func.distinct(Item.author))).where(Item.owner_id == target_owner_id)
        if q:
            count_stmt = count_stmt.where(Item.author.ilike(f"%{q}%"))
        total_count = session.exec(count_stmt).one()

        stmt = select(Item.author, func.count(Item.id), func.array_agg(Item.image_url))\
            .where(Item.owner_id == target_owner_id)
        
        if q:
            stmt = stmt.where(Item.author.ilike(f"%{q}%"))
            
        stmt = stmt.group_by(Item.author)\
            .order_by(Item.author.asc())\
            .offset(skip).limit(limit)
        
        rows = session.exec(stmt).all()
        for author, count, imgs in rows:
            valid_imgs = [img for img in (imgs or []) if img][:5]
            results.append({
                "name": author or "Others", 
                "count": count, 
                "sample_images": valid_imgs
            })

    elif group_by in ["category", "genre"]:
        json_field = group_by
        name_expr = func.json_extract_path_text(Item.extra_data, json_field)
        
        count_stmt = select(func.count(func.distinct(name_expr)))\
            .where(Item.owner_id == target_owner_id)
        if q:
            count_stmt = count_stmt.where(name_expr.ilike(f"%{q}%"))
        total_count = session.exec(count_stmt).one()

        stmt = select(
            name_expr.label("name"),
            func.count(Item.id).label("count"),
            func.array_agg(Item.image_url).label("sample_images")
        ).where(Item.owner_id == target_owner_id)
        
        if q:
            stmt = stmt.where(name_expr.ilike(f"%{q}%"))
            
        stmt = stmt.group_by("name")\
            .order_by(name_expr.asc())\
            .offset(skip).limit(limit)
        
        rows = session.exec(stmt).all()
        for name, count, imgs in rows:
            valid_imgs = [img for img in (imgs or []) if img][:5]
            results.append({
                "name": name or "Others", 
                "count": count, 
                "sample_images": valid_imgs
            })

    elif group_by == "subject":
        # 1. Tags query
        tags_expr = func.json_array_elements_text(WorkMetadata.tags)
        tags_stmt = select(
            tags_expr.label("name"),
            func.count(Item.id).label("count"),
            func.array_agg(Item.image_url).label("sample_images")
        ).join(
            WorkMetadata, (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title)
        ).where(Item.owner_id == target_owner_id)
        
        if q:
            tags_stmt = tags_stmt.where(tags_expr.ilike(f"%{q}%"))
        tags_stmt = tags_stmt.group_by("name")

        # 2. Others query (items with no tags)
        others_stmt = select(
            cast("Others", String).label("name"),
            func.count(Item.id).label("count"),
            func.array_agg(Item.image_url).label("sample_images")
        ).outerjoin(
            WorkMetadata, (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title)
        ).where(Item.owner_id == target_owner_id)\
         .where(or_(
             WorkMetadata.tags.is_(None),
             func.json_array_length(WorkMetadata.tags) == 0,
             WorkMetadata.author.is_(None)
         ))
        
        # Combine
        if q and "others".find(q.lower()) == -1:
            full_stmt = tags_stmt
        else:
            full_stmt = tags_stmt.union_all(others_stmt)

        try:
            total_count = session.exec(select(func.count()).select_from(full_stmt.subquery())).one()
            rows = session.exec(select(full_stmt.subquery()).order_by(text("name ASC")).offset(skip).limit(limit)).all()
            for name, count, imgs in rows:
                valid_imgs = [img for img in (imgs or []) if img][:5]
                results.append({
                    "name": name, 
                    "count": count, 
                    "sample_images": valid_imgs
                })
        except Exception:
            pass
    
    return {"data": results, "count": total_count}



@router.get("/", response_model=ItemsPublic | ItemsMinimalPublic)
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
    minimal: Annotated[bool, Query()] = False,
    exclude_lost: bool = False,
    exclude_private: bool = False,
    lost_only: bool = False,
    private_only: bool = False,
) -> Any:
    """
    Retrieve items. Filters by current user's owner_id by default, unless enable_feed is True.
    Supports searching via 'q' using Meilisearch.
    If 'minimal' is True, returns ItemMinimal objects for performance.
    """
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
                is_public_community = session.exec(
                    select(Community).where(Community.id == owner_id, Community.is_private == False)
                ).first()
                
                if not is_public_community:
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
        my_community_ids = session.exec(
            select(CommunityMember.community_id).where(
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).all()
        
        public_community_ids = session.exec(
            select(Community.id).where(Community.is_private == False)
        ).all()
        
        allowed_community_ids = list(set(my_community_ids + public_community_ids))

    from app.search import client as meili_client
    meili_success = False
    facets = None
    facet_stats = None
    items = []
    count = 0

    # Only use Meilisearch if q is provided, otherwise SQL is faster for listing
    if q:
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
                filters.append(f'author = "{author}"')
            if item_type:
                filters.append(f'item_type = "{item_type.value}"')
            
            if lost_only:
                filters.append("is_lost = true")
            elif exclude_lost:
                filters.append("is_lost = false")
            
            if private_only:
                filters.append("is_private = true")
            elif exclude_private:
                filters.append("is_private = false")

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
                "sort": [f"{sort_by}:{sort_order}"]
            }
            
            search_results = index.search(q, search_params)
            item_ids = [uuid.UUID(hit["id"]) for hit in search_results["hits"]]
            count = search_results.get("totalHits") or search_results.get("nbHits") or len(item_ids)
            facets = search_results.get("facetDistribution")
            facet_stats = search_results.get("facetStats")

            if not item_ids:
                meili_success = False
            else:
                # Fetch from DB preserving order
                db_stmt = select(Item).where(Item.id.in_(item_ids)).where(~Item.id.in_(defaulted_item_ids))
                meili_success = True
            
            from sqlalchemy.orm import selectinload
            if minimal:
                db_stmt = db_stmt.options(
                    selectinload(Item.community_owner),
                    selectinload(Item.communities)
                )
            else:
                db_stmt = db_stmt.options(
                    selectinload(Item.user_owner), 
                    selectinload(Item.community_owner),
                    selectinload(Item.communities)
                )
            
            db_items = session.exec(db_stmt).all()
            item_map = {item.id: item for item in db_items}
            items = [item_map[iid] for iid in item_ids if iid in item_map]
            
            # Pre-fetch availability, possession, and donation status for all items
            item_ids = [item.id for item in items]
            active_loan_item_ids = set(session.exec(
                select(Loan.item_id).where(
                    Loan.item_id.in_(item_ids),
                    Loan.status.in_([
                        LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, 
                        LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING, LoanStatus.DEFAULTED
                    ])
                )
            ).all())

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

            pending_donation_item_ids = set(session.exec(
                select(CommunityItem.item_id).where(
                    CommunityItem.item_id.in_(item_ids),
                    CommunityItem.is_donation_pending == True
                )
            ).all())

            if minimal:
                minimal_items = []
                for item in items:
                    owner_name = "Unknown"
                    if item.user_owner:
                        owner_name = item.user_owner.full_name or item.user_owner.email
                    elif item.community_owner:
                        owner_name = item.community_owner.name

                    minimal_items.append(ItemMinimal(
                        id=item.id,
                        owner_id=item.owner_id,
                        title=item.title,
                        description=item.description,
                        author=item.author,
                        item_type=item.item_type,
                        image_url=item.image_url,
                        count=item.count,
                        created_at=item.created_at,
                        is_available=item.id not in active_loan_item_ids,
                        had_possession=item.owner_id == current_user.id or item.id in possession_loan_item_ids,
                        is_community_owned=item.community_owner is not None,
                        is_donation_pending=item.id in pending_donation_item_ids,
                        owner_name=owner_name,
                        category=item.extra_data.get("category") if item.extra_data else None,
                        genre=item.extra_data.get("genre") if item.extra_data else None,
                        subject=item.extra_data.get("subject") if item.extra_data else None
                    ))
                return ItemsMinimalPublic(data=minimal_items, count=count, facets=facets)

            # Full ItemPublic mapping
            # Privacy bypass flags
            is_friend_of_target = False
            if target_owner_id:
                is_friend_of_target = session.exec(
                    select(Friendship).where(
                        ((Friendship.user_id == current_user.id) & (Friendship.friend_id == target_owner_id)) |
                        ((Friendship.user_id == target_owner_id) & (Friendship.friend_id == current_user.id)),
                        Friendship.status == FriendshipStatus.ACCEPTED
                    )
                ).first() is not None

            admin_comm_ids = session.exec(
                select(CommunityMember.community_id).where(
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).all()

            # Map to Public
            items_public_data = []
            for item in items:
                is_avail = item.id not in active_loan_item_ids
                owner_pub = None
                community_pub = None
                
                bypass = is_friend_of_target or current_user.is_superuser
                if not bypass and item.owner_id in admin_comm_ids:
                    bypass = True

                if item.user_owner:
                    item_is_friend = bypass or session.exec(
                        select(Friendship).where(
                            ((Friendship.user_id == current_user.id) & (Friendship.friend_id == item.owner_id)) |
                            ((Friendship.user_id == item.owner_id) & (Friendship.friend_id == current_user.id)),
                            Friendship.status == FriendshipStatus.ACCEPTED
                        )
                    ).first() is not None
                    
                    owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser, is_friend=item_is_friend)
                    owner_pub.is_available = is_avail
                elif item.community_owner:
                    community_pub = item.community_owner

                items_public_data.append(ItemPublic(
                    id=item.id,
                    owner_id=item.owner_id,
                    title=item.title,
                    description=item.description,
                    author=item.author,
                    item_type=item.item_type,
                    image_url=item.image_url,
                    extra_data=item.extra_data,
                    info=item.info,
                    count=item.count,
                    created_at=item.created_at,
                    owner=owner_pub,
                    community_owner=community_pub,
                    is_available=is_avail,
                    work_metadata=get_work_metadata(session, item.author, item.title),
                    had_possession=item.owner_id == current_user.id or item.id in possession_loan_item_ids,
                    is_donation_pending=item.id in pending_donation_item_ids,
                    category=item.extra_data.get("category") if item.extra_data else None,
                    genre=item.extra_data.get("genre") if item.extra_data else None,
                    subject=item.extra_data.get("subject") if item.extra_data else None
                ))
            
            return ItemsPublic(data=items_public_data, count=count, facets=facets, facet_stats=facet_stats)
        except Exception:
            meili_success = False

    if not meili_success:
        # SQL Fallback / Standard Listing
        facets = {} 
        facet_stats = {}
        
        if feed_mode:
            statement = select(Item).where(or_(Item.owner_id.in_(allowed_community_ids), Item.community_owner.has(Community.id.in_(allowed_community_ids))))
        else:
            statement = select(Item).where(Item.owner_id == target_owner_id)

        statement = statement.where(Item.id.not_in(defaulted_item_ids))

        if q:
            statement = statement.where(or_(
                col(Item.title).ilike(f"%{q}%"),
                col(Item.description).ilike(f"%{q}%"),
                col(Item.author).ilike(f"%{q}%")
            ))

        if category:
            if category == "Others":
                statement = statement.where(or_(func.json_extract_path_text(Item.extra_data, 'category').is_(None), func.json_extract_path_text(Item.extra_data, 'category') == ""))
            else:
                statement = statement.where(func.json_extract_path_text(Item.extra_data, 'category') == category)

        if genre:
            if genre == "Others":
                statement = statement.where(or_(func.json_extract_path_text(Item.extra_data, 'genre').is_(None), func.json_extract_path_text(Item.extra_data, 'genre') == ""))
            else:
                statement = statement.where(func.json_extract_path_text(Item.extra_data, 'genre') == genre)

        if subject:
            statement = statement.join(WorkMetadata, (Item.author == WorkMetadata.author) & (Item.title == WorkMetadata.title), isouter=True)
            if subject == "Others":
                statement = statement.where(or_(WorkMetadata.tags.is_(None), func.json_array_length(WorkMetadata.tags) == 0))
            else:
                statement = statement.where(cast(WorkMetadata.tags, String).ilike(f'%"{subject}"%'))

        if author:
            if author == "Others":
                statement = statement.where(or_(Item.author.is_(None), Item.author == ""))
            else:
                statement = statement.where(Item.author == author)

        if item_type:
            statement = statement.where(Item.item_type == item_type)

        if lost_only:
            statement = statement.where(Item.is_lost == True)
        elif exclude_lost:
            statement = statement.where(Item.is_lost == False)
        
        if private_only:
            statement = statement.where(Item.is_private == True)
        elif exclude_private:
            statement = statement.where(Item.is_private == False)

        count = session.exec(select(func.count()).select_from(statement.subquery())).one()

        sort_column = Item.created_at
        if sort_by == "title":
            sort_column = Item.title
        elif sort_by == "author":
            sort_column = Item.author

        if sort_order == "desc":
            statement = statement.order_by(sort_column.desc())
        else:
            statement = statement.order_by(sort_column.asc())

        from sqlalchemy.orm import selectinload
        if minimal:
            statement = statement.options(
                selectinload(Item.community_owner),
                selectinload(Item.communities)
            )
        else:
            statement = statement.options(
                selectinload(Item.user_owner), 
                selectinload(Item.community_owner),
                selectinload(Item.communities)
            )
        items = session.exec(statement.offset(skip).limit(limit)).all()

    if not items:
        return ItemsPublic(data=[], count=count, facets=facets, facet_stats=facet_stats)

    item_ids = [item.id for item in items]
    
    # Bulk fetch availability (active loans)
    active_loan_item_ids = set(session.exec(
        select(Loan.item_id).where(
            Loan.item_id.in_(item_ids),
            Loan.status.in_([
                LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, 
                LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING, LoanStatus.DEFAULTED
            ])
        )
    ).all())

    # Bulk fetch possession history for current user
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

    # Bulk fetch pending donations
    pending_donation_item_ids = set(session.exec(
        select(CommunityItem.item_id).where(
            CommunityItem.item_id.in_(item_ids),
            CommunityItem.is_donation_pending == True
        )
    ).all())

    if minimal:
        # Build ItemMinimal objects
        minimal_items = []
        for item in items:
            owner_name = "Unknown"
            if item.user_owner:
                owner_name = item.user_owner.full_name or item.user_owner.email
            elif item.community_owner:
                owner_name = item.community_owner.name

            minimal_items.append(ItemMinimal(
                id=item.id,
                owner_id=item.owner_id,
                title=item.title,
                description=item.description,
                author=item.author,
                item_type=item.item_type,
                image_url=item.image_url,
                count=item.count,
                created_at=item.created_at,
                is_available=item.id not in active_loan_item_ids,
                had_possession=item.owner_id == current_user.id or item.id in possession_loan_item_ids,
                is_community_owned=item.community_owner is not None,
                is_donation_pending=item.id in pending_donation_item_ids,
                owner_name=owner_name,
                category=item.extra_data.get("category") if item.extra_data else None,
                genre=item.extra_data.get("genre") if item.extra_data else None,
                subject=item.extra_data.get("subject") if item.extra_data else None
            ))
        return ItemsMinimalPublic(data=minimal_items, count=count, facets=facets)

    # Full ItemPublic building
    work_keys = {(item.author, item.title) for item in items if item.author and item.title}
    work_meta_map = {}
    if work_keys:
        from sqlalchemy import tuple_
        work_metas = session.exec(select(WorkMetadata).where(tuple_(WorkMetadata.author, WorkMetadata.title).in_(list(work_keys)))).all()
        for wm in work_metas:
            work_meta_map[(wm.author, wm.title)] = wm

    condition_ratings = session.exec(select(ItemConditionRating).where(ItemConditionRating.item_id.in_(item_ids))).all()
    condition_data_map = {} 
    for r in condition_ratings:
        if r.item_id not in condition_data_map:
            condition_data_map[r.item_id] = {"sum": 0.0, "count": 0, "notes": []}
        condition_data_map[r.item_id]["sum"] += r.grade
        condition_data_map[r.item_id]["count"] += 1
        if r.notes:
            condition_data_map[r.item_id]["notes"].append({"user_id": str(r.user_id), "note": r.notes, "created_at": r.created_at.isoformat() if r.created_at else None})

    public_items = []
    for item in items:
        is_avail = item.id not in active_loan_item_ids
        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser, session=session)
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner

        cond_stats = condition_data_map.get(item.id, {"sum": 0.0, "count": 0, "notes": []})
        avg_grade = cond_stats["sum"] / cond_stats["count"] if cond_stats["count"] > 0 else 0.0
        had_possession = item.owner_id == current_user.id or item.id in possession_loan_item_ids

        public_items.append(ItemPublic(
            id=item.id,
            owner_id=item.owner_id,
            title=item.title,
            description=item.description,
            author=item.author,
            item_type=item.item_type,
            image_url=item.image_url,
            extra_data=item.extra_data,
            info={**(item.info or {}), "average_condition_grade": avg_grade, "physical_notes": cond_stats["notes"]},
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail,
            is_donation_pending=item.id in pending_donation_item_ids,
            work_metadata=work_meta_map.get((item.author, item.title)),
            had_possession=had_possession,
            category=item.extra_data.get("category") if item.extra_data else None,
            genre=item.extra_data.get("genre") if item.extra_data else None,
            subject=item.extra_data.get("subject") if item.extra_data else None
        ))

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
        owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser, session=session)
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
        had_possession=had_possession,
        category=item.extra_data.get("category") if item.extra_data else None,
        genre=item.extra_data.get("genre") if item.extra_data else None,
        subject=item.extra_data.get("subject") if item.extra_data else None
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
                stored_url = await upload_image_from_url(image_url, folder="items")
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

        # Book classification cleanup
        if item_type == ItemType.book:
            raw_c = parsed_extra.get("category")
            raw_g = parsed_extra.get("genre")
            c, g, s = map_book_classification(raw_g or raw_c)
            parsed_extra["category"] = c
            parsed_extra["genre"] = g
            if s:
                existing_s = parsed_extra.get("subject", "")
                parsed_extra["subject"] = f"{existing_s}, {s}" if existing_s else s

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
                category=parsed_extra.get("category"),
                genre=parsed_extra.get("genre"),
                image_url=final_image_url,
                tags=parsed_extra.get("subject", "").split(",") if parsed_extra.get("subject") else None
            )

        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)

        # Update collection index for owner and pooled communities in background
        invalidate_item_caches(session, db_item.id, background_tasks)

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
            had_possession=True,
            category=db_item.extra_data.get("category") if db_item.extra_data else None,
            genre=db_item.extra_data.get("genre") if db_item.extra_data else None,
            subject=db_item.extra_data.get("subject") if db_item.extra_data else None
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
                    stored_url = await upload_image_from_url(image_url, folder="items")
                    if stored_url:
                        db_item.image_url = stored_url
                except:
                    db_item.image_url = image_url
            else:
                db_item.image_url = image_url
        if extra_data is not None:
            try:
                parsed_extra = json.loads(extra_data)

                # Book classification cleanup for update
                if (item_type or db_item.item_type) == ItemType.book:
                    raw_c = parsed_extra.get("category")
                    raw_g = parsed_extra.get("genre")
                    c, g, s = map_book_classification(raw_g or raw_c)
                    parsed_extra["category"] = c
                    parsed_extra["genre"] = g
                    if s:
                        existing_s = parsed_extra.get("subject", "")
                        parsed_extra["subject"] = f"{existing_s}, {s}" if existing_s else s

                db_item.extra_data = parsed_extra
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in extra_data")
        
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

        # Ensure WorkMetadata exists and is updated
        if db_item.author:
            ensure_work_metadata(
                session,
                db_item.author,
                db_item.title,
                isbn=db_item.extra_data.get("isbn") if db_item.extra_data else None,
                description=db_item.description,
                category=db_item.extra_data.get("category") if db_item.extra_data else None,
                genre=db_item.extra_data.get("genre") if db_item.extra_data else None,
                image_url=db_item.image_url,
                tags=db_item.extra_data.get("subject", "").split(",") if db_item.extra_data and db_item.extra_data.get("subject") else None
            )

        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)

        # Update collection index for owner and pooled communities in background
        invalidate_item_caches(session, db_item.id, background_tasks)

        # Refresh honor score
        from app.api.routes.loans import refresh_user_honor
        await refresh_user_honor(session, current_user.id)

        is_avail = check_item_availability(session, db_item.id)

        owner_pub = None
        community_pub = None
        if db_item.user_owner:
            owner_pub = filter_owner_privacy(db_item.user_owner, current_user.id, is_admin=current_user.is_superuser, session=session)
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
            had_possession=check_possession(session, current_user.id, db_item.id),
            category=db_item.extra_data.get("category") if db_item.extra_data else None,
            genre=db_item.extra_data.get("genre") if db_item.extra_data else None,
            subject=db_item.extra_data.get("subject") if db_item.extra_data else None
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
        had_possession=True,
        category=new_item.extra_data.get("category") if new_item.extra_data else None,
        genre=new_item.extra_data.get("genre") if new_item.extra_data else None,
        subject=new_item.extra_data.get("subject") if new_item.extra_data else None
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
    Update metadata for a work (Tags, Category, Genre).
    """
    # Use ensure_work_metadata which already handles the classification mapping logic
    meta = ensure_work_metadata(
        session,
        author,
        title,
        category=meta_in.category,
        genre=meta_in.genre,
        tags=meta_in.tags,
        description=meta_in.description,
        image_url=meta_in.image_url,
        overwrite=True
    )

    # Record contribution
    contribution = Contribution(
        user_id=current_user.id,
        work_author=author,
        work_title=title,
        description="Updated work metadata"
    )
    session.add(contribution)
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
    Only visible to owner, friends of owner, or members of the owning community.
    """
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Permission check
    allowed = False
    if current_user.is_superuser or item.owner_id == current_user.id:
        allowed = True
    else:
        if item.user_owner:
            is_friend = session.exec(
                select(Friendship).where(
                    ((Friendship.user_id == current_user.id) & (Friendship.friend_id == item.owner_id)) |
                    ((Friendship.user_id == item.owner_id) & (Friendship.friend_id == current_user.id)),
                    Friendship.status == FriendshipStatus.ACCEPTED
                )
            ).first()
            if is_friend:
                allowed = True
        elif item.community_owner:
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()
            if is_member:
                allowed = True

    if not allowed:
        raise HTTPException(status_code=403, detail="Not enough permissions to view condition history")

    ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id == item_id)
    ).all()
    return ratings


def _is_owner_or_admin(item: Item, user: User, session: SessionDep) -> bool:
    """Helper to check if user owns item or is admin of owning community."""
    if item.owner_id == user.id or user.is_superuser:
        return True
    if item.community_owner:
        is_member = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == item.owner_id,
                CommunityMember.user_id == user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        return is_member is not None
    return False


@router.post("/batch/delete", response_model=Message)
def batch_delete_items(
    *, session: SessionDep, current_user: CurrentUser, action: ItemBatchAction, background_tasks: BackgroundTasks
) -> Any:
    """Delete multiple items. Only owner or community admin can delete."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    deleted_count = 0
    owner_ids = set()
    for item in items:
        if _is_owner_or_admin(item, current_user, session):
            if item.image_url:
                delete_image(item.image_url)
            owner_ids.add(item.owner_id)
            session.delete(item)
            delete_item_from_search(item.id)
            deleted_count += 1
    
    session.commit()
    for o_id in owner_ids:
        background_tasks.add_task(rebuild_collection_index_task, o_id)
        
    return Message(message=f"Successfully deleted {deleted_count} items.")


@router.post("/batch/mark-lost", response_model=Message)
def batch_mark_lost(
    *, session: SessionDep, current_user: CurrentUser, action: ItemBatchAction
) -> Any:
    """Mark multiple items as lost."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    updated_count = 0
    for item in items:
        if _is_owner_or_admin(item, current_user, session):
            item.is_lost = True
            session.add(item)
            sync_item_to_search(item)
            updated_count += 1
    
    session.commit()
    return Message(message=f"Successfully marked {updated_count} items as lost.")


@router.post("/batch/toggle-privacy", response_model=Message)
def batch_toggle_privacy(
    *, session: SessionDep, current_user: CurrentUser, action: ItemBatchAction
) -> Any:
    """Toggle privacy status for multiple items."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    updated_count = 0
    for item in items:
        if _is_owner_or_admin(item, current_user, session):
            item.is_private = not item.is_private
            session.add(item)
            sync_item_to_search(item)
            updated_count += 1
    
    session.commit()
    return Message(message=f"Successfully toggled privacy for {updated_count} items.")


@router.post("/batch/enrich", response_model=Message)
def batch_enrich_metadata(
    *, session: SessionDep, current_user: CurrentUser, action: ItemBatchEnrich, background_tasks: BackgroundTasks
) -> Any:
    """Enrich metadata for multiple items in the background."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    books_to_enrich = []
    for item in items:
        if _is_owner_or_admin(item, current_user, session) and item.item_type == ItemType.book:
            books_to_enrich.append({"author": item.author, "title": item.title})
    
    if not books_to_enrich:
        return Message(message="No valid books found for enrichment.")

    background_tasks.add_task(
        enrich_specific_books, 
        books_to_enrich,
        current_user.id,
        action.fields_to_update, 
        "auto",
        action.overwrite
    )
    return Message(message=f"Started enrichment for {len(books_to_enrich)} books in background.")
