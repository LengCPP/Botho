import json
import logging
import uuid
from typing import Annotated, Any

logger = logging.getLogger(__name__)

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from sqlmodel import String, cast, col, func, or_, select, text

from app.api.deps import CurrentUser, SessionDep
from app.limiter import limiter
from app.api.utils import (
    ai_classify_specific_books,
    check_item_availability,
    check_possession,
    enrich_specific_books,
    ensure_work_metadata,
    filter_owner_privacy,
    get_item_condition_data,
    get_work_metadata,
    invalidate_item_caches,
    maintenance_bulk_classify,
    map_book_classification,
    rebuild_collection_index_task,
    sync_item_to_archive,
    update_collection_index,
)
from app.core.config import settings
from app.models import (
    BookEnrichmentRequest,
    Community,
    CommunityInterest,
    CommunityItem,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    Contribution,
    Friendship,
    FriendshipStatus,
    Interest,
    InterestSignal,
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
    ReadingLog,
    ReadingLogStatus,
    User,
    UserInterest,
    WorkMetadata,
    WorkMetadataPublic,
    WorkMetadataUpdate,
    WorksMetadataPublic,
)
from app.search import (
    delete_item_from_search,
    delete_work_metadata_from_search,
    sync_item_to_search,
)
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
        from sqlmodel import Session

        from app.core.db import engine
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
    request: BookEnrichmentRequest,
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
        fields_to_overwrite=request.fields_to_overwrite,
        source_api=request.source_api,
    )
    return Message(message=f"Enrichment task started for {len(request.books)} books.")


@router.post("/book-registry/ai-classify", response_model=Message)
def trigger_ai_classify_books(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    request: BookEnrichmentRequest,  # Re-using this schema as it has the list of books
) -> Any:
    """
    Trigger a background task to AI-classify specific books in the registry.
    Superuser only. Strictly for administrative maintenance of the Book Archive.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    background_tasks.add_task(
        ai_classify_specific_books, request.books, current_user.id
    )
    return Message(
        message=f"AI classification task started for {len(request.books)} books."
    )


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
        from sqlmodel import Session

        from app.core.db import engine

        with Session(engine) as bg_session:
            items = bg_session.exec(
                select(Item).where(Item.item_type == ItemType.book)
            ).all()
            for item in items:
                # Use existing helper to populate registry
                ensure_work_metadata(
                    bg_session,
                    item.author,
                    item.title,
                    isbn_val=item.isbn,
                    description=item.description,
                    category=item.category,
                    image_url=item.image_url,
                )
            bg_session.commit()

    background_tasks.add_task(sync_task)
    return Message(message="Global registry sync started in background.")


@router.post("/book-registry/cleanup-broken-images", response_model=Message)
def cleanup_broken_images(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Find all WorkMetadata and Item records whose image_url points to a missing
    MinIO object and null it out so they appear in the 'Missing Image' filter.
    Superuser only. Processes in background.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    def cleanup_task():
        import logging

        from minio.error import S3Error
        from sqlmodel import Session

        from app.core.db import engine
        from app.core.config import settings as _settings
        from app.storage import minio_client

        log = logging.getLogger(__name__)

        def is_broken(url: str | None) -> bool:
            if not url or "/api/v1/storage/image/" not in url:
                return False
            object_name = url.split("/api/v1/storage/image/")[-1]
            try:
                minio_client.stat_object(_settings.MINIO_STORAGE_BUCKET, object_name)
                return False
            except S3Error:
                return True
            except Exception:
                return True

        with Session(engine) as bg_session:
            works = bg_session.exec(
                select(WorkMetadata).where(
                    WorkMetadata.image_url.is_not(None),
                    WorkMetadata.image_url != "",
                )
            ).all()
            work_cleaned = 0
            for work in works:
                if is_broken(work.image_url):
                    work.image_url = None
                    work_cleaned += 1
            bg_session.commit()

            items = bg_session.exec(
                select(Item).where(
                    Item.image_url.is_not(None),
                    Item.image_url != "",
                )
            ).all()
            item_cleaned = 0
            for item in items:
                if is_broken(item.image_url):
                    item.image_url = None
                    item_cleaned += 1
            bg_session.commit()

            log.info(
                f"Broken image cleanup complete: {work_cleaned} registry entries, "
                f"{item_cleaned} item records nulled."
            )

    background_tasks.add_task(cleanup_task)
    return Message(message="Broken image cleanup started in background.")


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
        statement = statement.where(
            or_(WorkMetadata.image_url.is_(None), WorkMetadata.image_url == "")
        )
    elif filter_missing == "description":
        statement = statement.where(
            or_(WorkMetadata.description.is_(None), WorkMetadata.description == "")
        )
    elif filter_missing == "isbn":
        statement = statement.where(
            or_(WorkMetadata.isbn.is_(None), WorkMetadata.isbn == "")
        )
    elif filter_missing == "category":
        statement = statement.where(
            or_(WorkMetadata.category.is_(None), WorkMetadata.category == "")
        )

    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    books = session.exec(statement.offset(skip).limit(limit)).all()

    return WorksMetadataPublic(data=books, count=count)


@router.get("/book-registry/search", response_model=list[WorkMetadataPublic])
def search_book_registry(
    session: SessionDep,
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=5, ge=1, le=50),
) -> Any:
    """
    Search the global book registry by title or author using Meilisearch.
    """
    from app.search import client

    index = client.index("works")
    search_results = index.search(q, {"limit": limit})

    works = []
    for hit in search_results["hits"]:
        works.append(
            WorkMetadataPublic(
                author=hit["author"],
                title=hit["title"],
                isbn=hit.get("isbn"),
                description=hit.get("description"),
                category=hit.get("category"),
                image_url=hit.get("image_url"),
                tags=hit.get("tags", []),
                average_rating=0.0,  # Not indexed for now
                review_count=0,  # Not indexed for now
            )
        )
    return works


@router.get("/book-registry/{isbn}", response_model=WorkMetadataPublic)
def lookup_book_registry(
    session: SessionDep, current_user: CurrentUser, isbn: str
) -> Any:
    """
    Lookup a book in the global registry by ISBN.
    """
    statement = select(WorkMetadata).where(WorkMetadata.isbn == isbn)
    meta = session.exec(statement).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Book not found in registry")
    return meta


@router.get("/recommendations", response_model=ItemsPublic)
def recommend_items(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 10,
) -> Any:
    """
    Get recommended books based on user interests and social graph.

    Signal hierarchy (highest → lowest weight):
      1. InterestSignal  — user explicitly clicked "notify me" on an item (weight ×3)
      2. ReadingLog COMPLETED / ItemReview 5★ — strong positive taste signals (weight ×2)
      3. ReadingLog READING / ItemReview 4★ / Loan history — moderate signals (weight ×1)
      4. User interests (manual) — broad category preferences (weight ×1)
      5. Community interests — cold-start fallback when user has no personal signals

    ReadingLog DROPPED books: author excluded from results.
    """
    from sqlalchemy import tuple_
    from app.search import client

    # ── 1. Social graph ──────────────────────────────────────────────────────
    friends_stmt = select(Friendship).where(
        (Friendship.user_id == current_user.id) | (Friendship.friend_id == current_user.id),
        Friendship.status == FriendshipStatus.ACCEPTED,
    )
    friend_ids = set()
    for f in session.exec(friends_stmt).all():
        friend_ids.add(str(f.friend_id if f.user_id == current_user.id else f.user_id))

    comm_stmt = select(CommunityMember.community_id).where(
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED,
    )
    community_ids = {str(cid) for cid in session.exec(comm_stmt).all()}
    community_uuids = {uuid.UUID(cid) for cid in community_ids}

    allowed_owners = list(friend_ids | community_ids)
    if not allowed_owners:
        return ItemsPublic(data=[], count=0)

    # ── 2. Signal collection ──────────────────────────────────────────────────

    # 2a. InterestSignal — user explicitly flagged these items (weight ×3)
    signal_rows = session.exec(
        select(Item.author, Item.category, Item.genre)
        .join(InterestSignal, InterestSignal.item_id == Item.id)
        .where(InterestSignal.user_id == current_user.id)
        .limit(20)
    ).all()

    # 2b. ReadingLog
    completed_logs = session.exec(
        select(ReadingLog.author, ReadingLog.title)
        .where(ReadingLog.user_id == current_user.id, ReadingLog.status == ReadingLogStatus.COMPLETED)
        .limit(20)
    ).all()

    reading_logs = session.exec(
        select(ReadingLog.author, ReadingLog.title)
        .where(ReadingLog.user_id == current_user.id, ReadingLog.status == ReadingLogStatus.READING)
        .limit(10)
    ).all()

    dropped_logs = session.exec(
        select(ReadingLog.author)
        .where(ReadingLog.user_id == current_user.id, ReadingLog.status == ReadingLogStatus.DROPPED)
        .limit(30)
    ).all()

    # 2c. Item reviews
    rated_rows = session.exec(
        select(ItemReview.author, ItemReview.title, ItemReview.rating)
        .where(ItemReview.user_id == current_user.id, ItemReview.rating >= 4)
        .limit(20)
    ).all()

    # 2d. Loan history (weight ×1)
    loan_rows = session.exec(
        select(Item.author, Item.title)
        .join(Loan, Loan.item_id == Item.id)
        .where(Loan.requester_id == current_user.id)
        .order_by(Loan.created_at.desc())
        .limit(15)
    ).all()

    # 2e. User interests (manual)
    interests = session.exec(
        select(Interest.name).join(UserInterest).where(UserInterest.user_id == current_user.id)
    ).all()

    has_personal_signals = bool(signal_rows or completed_logs or reading_logs or rated_rows or loan_rows or interests)

    # ── 3. Weighted keyword pool ──────────────────────────────────────────────
    # Repeat terms proportional to weight so Meilisearch BM25 ranks them higher.
    weighted_terms: list[str] = []

    # InterestSignal items (×3)
    for author, category, genre in signal_rows:
        if author:
            weighted_terms.extend([author] * 3)
        if category:
            weighted_terms.extend([category] * 3)
        if genre:
            weighted_terms.extend([genre] * 2)

    # ReadingLog COMPLETED (×2)
    completed_work_keys = set()
    for author, title in completed_logs:
        if author:
            weighted_terms.extend([author] * 2)
        if author and title:
            completed_work_keys.add((author, title))

    # ReadingLog READING (×1)
    reading_work_keys = set()
    for author, title in reading_logs:
        if author:
            weighted_terms.append(author)
        if author and title:
            reading_work_keys.add((author, title))

    # ItemReview 5★ (×2), 4★ (×1)
    rated_work_keys = set()
    for author, title, rating in rated_rows:
        if author:
            weighted_terms.extend([author] * (2 if rating == 5 else 1))
        if author and title:
            rated_work_keys.add((author, title))

    # Loan history (×1)
    loan_work_keys = set()
    for author, title in loan_rows:
        if author:
            weighted_terms.append(author)
        if author and title:
            loan_work_keys.add((author, title))

    # User interests (×1)
    weighted_terms.extend(list(interests))

    # Enrich from WorkMetadata (categories + tags) for all collected works
    all_work_keys = completed_work_keys | reading_work_keys | rated_work_keys | loan_work_keys
    if all_work_keys:
        for work in session.exec(
            select(WorkMetadata).where(
                tuple_(WorkMetadata.author, WorkMetadata.title).in_(list(all_work_keys))
            )
        ).all():
            if work.category:
                weighted_terms.append(work.category)
            if work.tags:
                weighted_terms.extend(work.tags[:3])

    # ── 4. Cold-start: use community interests when user has no personal signals ──
    if not has_personal_signals and community_uuids:
        community_interest_names = session.exec(
            select(Interest.name)
            .join(CommunityInterest)
            .where(CommunityInterest.community_id.in_(community_uuids))
        ).all()
        weighted_terms.extend(community_interest_names)

    # ── 5. Build search query and filters ────────────────────────────────────
    search_query = " ".join(weighted_terms) if weighted_terms else ""

    filter_expression: list[str] = ["item_type = 'book'", f"owner_id != '{current_user.id}'"]

    access_parts: list[str] = []
    if allowed_owners:
        access_parts.append(f"owner_id IN [{', '.join(f'{uid!r}' for uid in allowed_owners)}]")
    if community_ids:
        access_parts.append(f"pooled_in IN [{', '.join(f'{pid!r}' for pid in community_ids)}]")
    filter_expression.append(f"({' OR '.join(access_parts)})")

    # Exclude authors the user explicitly dropped
    dropped_authors = {a for a in dropped_logs if a}
    if dropped_authors:
        filter_expression.append(
            f"author NOT IN [{', '.join(f'{a!r}' for a in dropped_authors)}]"
        )

    # ── 6. Meilisearch query ─────────────────────────────────────────────────
    try:
        hits = client.index("items").search(
            search_query,
            {
                "filter": filter_expression,
                "limit": limit * 2,  # over-fetch to absorb DB-level exclusions
                "offset": skip,
            },
        )["hits"]
    except Exception:
        logger.warning("Meilisearch search failed for recommendations", exc_info=True)
        return ItemsPublic(data=[], count=0)

    if not hits:
        return ItemsPublic(data=[], count=0)

    hit_ids = [uuid.UUID(h["id"]) for h in hits]

    # ── 7. Fetch items, exclude defaulted ────────────────────────────────────
    defaulted_sub = select(Loan.item_id).where(Loan.status == LoanStatus.DEFAULTED)
    db_items = session.exec(
        select(Item).where(Item.id.in_(hit_ids), ~Item.id.in_(defaulted_sub))
    ).all()
    item_map = {item.id: item for item in db_items}
    item_ids_list = list(item_map.keys())

    # ── 8. Bulk-fetch enrichment data ────────────────────────────────────────
    active_loan_ids = set(session.exec(
        select(Loan.item_id).where(
            Loan.item_id.in_(item_ids_list),
            Loan.status.in_([
                LoanStatus.ACTIVE, LoanStatus.ACCEPTED,
                LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING,
                LoanStatus.DEFAULTED,
            ]),
        )
    ).all())

    ratings_by_item: dict[uuid.UUID, list] = {}
    for r in session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id.in_(item_ids_list))
    ).all():
        ratings_by_item.setdefault(r.item_id, []).append(r)

    possession_ids = set(session.exec(
        select(Loan.item_id).where(
            Loan.item_id.in_(item_ids_list),
            Loan.requester_id == current_user.id,
            Loan.status.in_([
                LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING,
                LoanStatus.RETURNED, LoanStatus.EXTENSION_PENDING,
            ]),
        )
    ).all())

    # Bulk-fetch WorkMetadata for result items (replaces per-item N+1 queries)
    hit_work_keys = [
        (item.author, item.title) for item in db_items if item.author and item.title
    ]
    work_meta_map: dict[tuple, WorkMetadata] = {}
    if hit_work_keys:
        for wm in session.exec(
            select(WorkMetadata).where(
                tuple_(WorkMetadata.author, WorkMetadata.title).in_(hit_work_keys)
            )
        ).all():
            work_meta_map[(wm.author, wm.title)] = wm

    # ── 9. Assemble results in Meilisearch rank order ─────────────────────────
    ordered_items: list[ItemPublic] = []
    for hit in hits:
        item = item_map.get(uuid.UUID(hit["id"]))
        if item is None:
            continue

        is_avail = item.id not in active_loan_ids
        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(
                item.user_owner, current_user.id,
                is_admin=current_user.is_superuser, session=session,
            )
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner

        item_ratings = ratings_by_item.get(item.id, [])
        avg_grade = sum(r.grade for r in item_ratings) / len(item_ratings) if item_ratings else 0.0
        cond_notes = [
            {"user_id": str(r.user_id), "note": r.notes,
             "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in item_ratings if r.notes
        ]

        ordered_items.append(ItemPublic(
            id=item.id,
            owner_id=item.owner_id,
            title=item.title,
            description=item.description,
            author=item.author,
            item_type=item.item_type,
            image_url=item.image_url,
            info={**(item.info or {}), "average_condition_grade": avg_grade, "physical_notes": cond_notes},
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail,
            work_metadata=work_meta_map.get((item.author, item.title)),
            had_possession=item.owner_id == current_user.id or item.id in possession_ids,
            category=item.category,
            genre=item.genre,
            subject=item.subject,
        ))
        if len(ordered_items) == limit:
            break

    return ItemsPublic(data=ordered_items, count=len(ordered_items))


@router.get("/facets")
def read_item_facets(
    session: SessionDep,
    current_user: CurrentUser,
    group_by: str = "category",
    owner_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=200),
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
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
        ).first()

        if not is_community:
            # Check if public community
            is_public_community = session.exec(
                select(Community).where(
                    Community.id == target_owner_id, Community.is_private == False
                )
            ).first()

            if not is_public_community:
                # Check if friend
                is_friend = session.exec(
                    select(Friendship).where(
                        (
                            (Friendship.user_id == current_user.id)
                            & (Friendship.friend_id == target_owner_id)
                        )
                        | (
                            (Friendship.user_id == target_owner_id)
                            & (Friendship.friend_id == current_user.id)
                        ),
                        Friendship.status == FriendshipStatus.ACCEPTED,
                    )
                ).first()
                if not is_friend:
                    raise HTTPException(
                        status_code=403, detail="Not enough permissions"
                    )

    # Optimization: Check collection index total
    owner_obj = session.get(User, target_owner_id)
    if not owner_obj:
        owner_obj = session.get(Community, target_owner_id)

    if owner_obj and owner_obj.collection_index:
        total = owner_obj.collection_index.get("total")
        if total == 0:
            return {"data": [], "count": 0}

    # Search filtering logic
    search_item_ids = None
    if q:
        from app.search import client as meili_client
        try:
            index = meili_client.index("items")
            search_params = {
                "filter": f'owner_id = "{target_owner_id}" OR pooled_in = "{target_owner_id}"',
                "limit": 1000, 
                "attributesToRetrieve": ["id"]
            }
            search_results = index.search(q, search_params)
            search_item_ids = [uuid.UUID(hit["id"]) for hit in search_results["hits"]]
        except Exception:
            logger.warning("Meilisearch fuzzy facet search failed, falling back to SQL ILIKE", exc_info=True)

    # SQL logic
    results = []
    total_count = 0
    
    def apply_q_filter(stmt, query_str):
        pattern = f"%{query_str}%"
        return stmt.where(
            or_(
                Item.title.ilike(pattern),
                Item.author.ilike(pattern),
                Item.category.ilike(pattern),
                Item.genre.ilike(pattern),
                Item.subject.ilike(pattern),
                Item.description.ilike(pattern)
            )
        )

    def build_search_condition(stmt):
        if search_item_ids is not None:
            # If Meilisearch hits found, use them + broaden with SQL if it might help
            if len(search_item_ids) > 0:
                return stmt.where(or_(Item.id.in_(search_item_ids), apply_q_filter(select(Item.id), q).exists()))
            else:
                return apply_q_filter(stmt, q)
        elif q: # Meilisearch failed
            return apply_q_filter(stmt, q)
        return stmt

    if group_by == "author":
        core_stmt = select(
            Item.author, Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(Item.owner_id == target_owner_id)
        core_stmt = build_search_condition(core_stmt)
        group_stmt = core_stmt.group_by(Item.author, Item.item_type)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()

        rows = session.exec(group_stmt.order_by(Item.author.asc()).offset(skip).limit(limit)).all()
        for author, i_type, count, imgs in rows:
            valid_imgs = [img for img in (imgs or []) if img][:5]
            results.append({"name": author or "Others", "item_type": i_type, "count": count, "sample_images": valid_imgs})

    elif group_by == "category":
        core_stmt = select(
            Item.category.label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(Item.owner_id == target_owner_id)
        core_stmt = build_search_condition(core_stmt)
        group_stmt = core_stmt.group_by("name", Item.item_type)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()

        rows = session.exec(group_stmt.order_by(text("name ASC")).offset(skip).limit(limit)).all()
        for name, i_type, count, imgs in rows:
            valid_imgs = [img for img in (imgs or []) if img][:5]
            results.append({"name": name or "Others", "item_type": i_type, "count": count, "sample_images": valid_imgs})

    elif group_by == "genre":
        core_stmt = select(
            Item.genre.label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(Item.owner_id == target_owner_id)
        core_stmt = build_search_condition(core_stmt)
        group_stmt = core_stmt.group_by("name", Item.item_type)
        total_count = session.exec(select(func.count()).select_from(group_stmt.subquery())).one()

        rows = session.exec(group_stmt.order_by(text("name ASC")).offset(skip).limit(limit)).all()
        for name, i_type, count, imgs in rows:
            valid_imgs = [img for img in (imgs or []) if img][:5]
            results.append({"name": name or "Others", "item_type": i_type, "count": count, "sample_images": valid_imgs})

    elif group_by == "subject":
        tag_expr = func.btrim(func.unnest(func.string_to_array(Item.subject, ",")))
        tags_core = select(
            tag_expr.label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(Item.owner_id == target_owner_id).where(Item.subject.is_not(None)).where(Item.subject != "")
        tags_core = build_search_condition(tags_core)
        tags_group = tags_core.group_by("name", Item.item_type)

        others_core = select(
            cast("Others", String).label("name"), Item.item_type, func.count(Item.id).label("count"), func.array_agg(Item.image_url).label("imgs")
        ).where(Item.owner_id == target_owner_id).where(or_(Item.subject.is_(None), Item.subject == ""))
        others_core = build_search_condition(others_core)
        others_group = others_core.group_by(Item.item_type)

        full_stmt = tags_group if q and "others" not in q.lower() else tags_group.union_all(others_group)

        try:
            total_count = session.exec(select(func.count()).select_from(full_stmt.subquery())).one()
            subq = full_stmt.subquery()
            rows = session.execute(
                select(subq).order_by(text("item_type"), text("name ASC")).offset(skip).limit(limit)
            ).all()
            for row in rows:
                name, i_type, count, imgs = row[0], row[1], row[2], row[3]
                valid_imgs = [img for img in (imgs or []) if img][:5]
                results.append({"name": name, "item_type": i_type, "count": count, "sample_images": valid_imgs})
        except Exception:
            logger.warning("Subject facet processing failed", exc_info=True)

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
    q: str | None = Query(default=None, max_length=200),
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
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
            ).first()

            if not is_community:
                is_public_community = session.exec(
                    select(Community).where(
                        Community.id == owner_id, Community.is_private == False
                    )
                ).first()

                if not is_public_community:
                    is_friend = session.exec(
                        select(Friendship).where(
                            (
                                (Friendship.user_id == current_user.id)
                                & (Friendship.friend_id == owner_id)
                            )
                            | (
                                (Friendship.user_id == owner_id)
                                & (Friendship.friend_id == current_user.id)
                            ),
                            Friendship.status == FriendshipStatus.ACCEPTED,
                        )
                    ).first()
                    if not is_friend and not current_user.is_superuser:
                        raise HTTPException(
                            status_code=403,
                            detail="Not enough permissions to view this user's items",
                        )
        target_owner_id = owner_id
    elif enable_feed:
        feed_mode = True
    else:
        target_owner_id = current_user.id

    if feed_mode:
        from sqlalchemy import union as sql_union

        my_cids_stmt = select(CommunityMember.community_id).where(
            CommunityMember.user_id == current_user.id,
            CommunityMember.status == CommunityMemberStatus.ACCEPTED,
        )
        public_cids_stmt = select(Community.id).where(Community.is_private == False)
        # Single UNION query instead of two queries + Python set merge
        allowed_community_ids = [
            row[0]
            for row in session.execute(sql_union(my_cids_stmt, public_cids_stmt))
        ]

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
                    allowed_ids_str = (
                        "["
                        + ", ".join([f'"{cid}"' for cid in allowed_community_ids])
                        + "]"
                    )
                    filters.append(
                        f"(owner_id IN {allowed_ids_str} OR pooled_in IN {allowed_ids_str})"
                    )
                else:
                    return ItemsPublic(data=[], count=0)

            search_params = {
                "limit": limit,
                "offset": skip,
                "filter": " AND ".join(filters) if filters else None,
                "facets": ["category", "genre", "author", "item_type", "subject"],
                "sort": [f"{sort_by}:{sort_order}"],
            }

            search_results = index.search(q, search_params)
            item_ids = [uuid.UUID(hit["id"]) for hit in search_results["hits"]]
            count = (
                search_results.get("totalHits")
                or search_results.get("nbHits")
                or len(item_ids)
            )
            facets = search_results.get("facetDistribution")
            facet_stats = search_results.get("facetStats")

            if not item_ids:
                meili_success = False
            else:
                # Fetch from DB preserving order
                db_stmt = (
                    select(Item)
                    .where(Item.id.in_(item_ids))
                    .where(~Item.id.in_(defaulted_item_ids))
                )
                meili_success = True

            from sqlalchemy.orm import selectinload

            if minimal:
                db_stmt = db_stmt.options(
                    selectinload(Item.community_owner), selectinload(Item.communities)
                )
            else:
                db_stmt = db_stmt.options(
                    selectinload(Item.user_owner),
                    selectinload(Item.community_owner),
                    selectinload(Item.communities),
                )

            db_items = session.exec(db_stmt).all()
            item_map = {item.id: item for item in db_items}
            items = [item_map[iid] for iid in item_ids if iid in item_map]

            # Pre-fetch availability, possession, and donation status for all items
            item_ids = [item.id for item in items]
            active_loan_item_ids = set(
                session.exec(
                    select(Loan.item_id).where(
                        Loan.item_id.in_(item_ids),
                        Loan.status.in_(
                            [
                                LoanStatus.ACTIVE,
                                LoanStatus.ACCEPTED,
                                LoanStatus.RETURN_PENDING,
                                LoanStatus.EXTENSION_PENDING,
                                LoanStatus.DEFAULTED,
                            ]
                        ),
                    )
                ).all()
            )

            possession_loan_item_ids = set(
                session.exec(
                    select(Loan.item_id).where(
                        Loan.item_id.in_(item_ids),
                        Loan.requester_id == current_user.id,
                        Loan.status.in_(
                            [
                                LoanStatus.ACTIVE,
                                LoanStatus.RETURN_PENDING,
                                LoanStatus.RETURNED,
                                LoanStatus.EXTENSION_PENDING,
                            ]
                        ),
                    )
                ).all()
            )

            pending_donation_item_ids = set(
                session.exec(
                    select(CommunityItem.item_id).where(
                        CommunityItem.item_id.in_(item_ids),
                        CommunityItem.is_donation_pending,
                    )
                ).all()
            )

            if minimal:
                minimal_items = []
                for item in items:
                    owner_name = "Unknown"
                    if item.user_owner:
                        owner_name = item.user_owner.full_name or item.user_owner.email
                    elif item.community_owner:
                        owner_name = item.community_owner.name

                    minimal_items.append(
                        ItemMinimal(
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
                            had_possession=item.owner_id == current_user.id
                            or item.id in possession_loan_item_ids,
                            is_community_owned=item.community_owner is not None,
                            is_donation_pending=item.id in pending_donation_item_ids,
                            owner_name=owner_name,
                            category=item.category,
                            genre=item.genre,
                            subject=item.subject,
                        )
                    )
                return ItemsMinimalPublic(
                    data=minimal_items, count=count, facets=facets
                )

            # Full ItemPublic mapping
            # Privacy bypass flags
            is_friend_of_target = False
            if target_owner_id:
                is_friend_of_target = (
                    session.exec(
                        select(Friendship).where(
                            (
                                (Friendship.user_id == current_user.id)
                                & (Friendship.friend_id == target_owner_id)
                            )
                            | (
                                (Friendship.user_id == target_owner_id)
                                & (Friendship.friend_id == current_user.id)
                            ),
                            Friendship.status == FriendshipStatus.ACCEPTED,
                        )
                    ).first()
                    is not None
                )

            admin_comm_ids = session.exec(
                select(CommunityMember.community_id).where(
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
            ).all()

            # Bulk-fetch friendship status for all user-item owners to avoid N+1 queries
            user_item_owner_ids = list({item.owner_id for item in items if item.user_owner})
            if user_item_owner_ids:
                friendship_records = session.exec(
                    select(Friendship).where(
                        or_(
                            (Friendship.user_id == current_user.id)
                            & (Friendship.friend_id.in_(user_item_owner_ids)),
                            (Friendship.friend_id == current_user.id)
                            & (Friendship.user_id.in_(user_item_owner_ids)),
                        ),
                        Friendship.status == FriendshipStatus.ACCEPTED,
                    )
                ).all()
                friend_owner_ids = set()
                for f in friendship_records:
                    if f.user_id == current_user.id:
                        friend_owner_ids.add(f.friend_id)
                    else:
                        friend_owner_ids.add(f.user_id)
            else:
                friend_owner_ids = set()

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
                    item_is_friend = bypass or item.owner_id in friend_owner_ids

                    owner_pub = filter_owner_privacy(
                        item.user_owner,
                        current_user.id,
                        is_admin=current_user.is_superuser,
                        is_friend=item_is_friend,
                    )
                    owner_pub.is_available = is_avail
                elif item.community_owner:
                    community_pub = item.community_owner

                items_public_data.append(
                    ItemPublic(
                        id=item.id,
                        owner_id=item.owner_id,
                        title=item.title,
                        description=item.description,
                        author=item.author,
                        item_type=item.item_type,
                        image_url=item.image_url,
                        info=item.info,
                        count=item.count,
                        created_at=item.created_at,
                        owner=owner_pub,
                        community_owner=community_pub,
                        is_available=is_avail,
                        work_metadata=get_work_metadata(
                            session, item.author, item.title
                        ),
                        had_possession=item.owner_id == current_user.id
                        or item.id in possession_loan_item_ids,
                        is_donation_pending=item.id in pending_donation_item_ids,
                        category=item.category,
                        genre=item.genre,
                        subject=item.subject,
                    )
                )

            return ItemsPublic(
                data=items_public_data,
                count=count,
                facets=facets,
                facet_stats=facet_stats,
            )
        except Exception:
            logger.warning("Meilisearch item listing failed, falling back to SQL", exc_info=True)
            meili_success = False

    if not meili_success:
        # SQL Fallback / Standard Listing
        facets = {}
        facet_stats = {}

        if feed_mode:
            statement = select(Item).where(
                or_(
                    Item.owner_id.in_(allowed_community_ids),
                    Item.community_owner.has(Community.id.in_(allowed_community_ids)),
                )
            )
        else:
            statement = select(Item).where(Item.owner_id == target_owner_id)

        statement = statement.where(Item.id.not_in(defaulted_item_ids))

        if q:
            statement = statement.where(
                or_(
                    col(Item.title).ilike(f"%{q}%"),
                    col(Item.author).ilike(f"%{q}%"),
                    col(Item.category).ilike(f"%{q}%"),
                    col(Item.genre).ilike(f"%{q}%"),
                    col(Item.subject).ilike(f"%{q}%"),
                    col(Item.description).ilike(f"%{q}%"),
                )
            )

        if category:
            if category == "Others":
                statement = statement.where(
                    or_(Item.category.is_(None), Item.category == "")
                )
            else:
                statement = statement.where(Item.category == category)

        if genre:
            if genre == "Others":
                statement = statement.where(or_(Item.genre.is_(None), Item.genre == ""))
            else:
                statement = statement.where(Item.genre == genre)

        if subject:
            # Filter on Item.subject (comma-separated string) — consistent with
            # how collection_index is built in update_collection_index().
            if subject == "Others":
                statement = statement.where(
                    or_(Item.subject.is_(None), Item.subject == "")
                )
            else:
                statement = statement.where(
                    or_(
                        Item.subject == subject,
                        Item.subject.ilike(f"{subject},%"),
                        Item.subject.ilike(f"%, {subject}"),
                        Item.subject.ilike(f"%, {subject},%"),
                    )
                )

        if author:
            if author == "Others":
                statement = statement.where(
                    or_(Item.author.is_(None), Item.author == "")
                )
            else:
                statement = statement.where(Item.author == author)

        if item_type:
            statement = statement.where(Item.item_type == item_type)

        if lost_only:
            statement = statement.where(Item.is_lost)
        elif exclude_lost:
            statement = statement.where(Item.is_lost == False)

        if private_only:
            statement = statement.where(Item.is_private)
        elif exclude_private:
            statement = statement.where(Item.is_private == False)

        count = session.exec(
            select(func.count()).select_from(statement.subquery())
        ).one()

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
                selectinload(Item.community_owner), selectinload(Item.communities)
            )
        else:
            statement = statement.options(
                selectinload(Item.user_owner),
                selectinload(Item.community_owner),
                selectinload(Item.communities),
            )
        items = session.exec(statement.offset(skip).limit(limit)).all()

    if not items:
        return ItemsPublic(data=[], count=count, facets=facets, facet_stats=facet_stats)

    item_ids = [item.id for item in items]

    # Bulk fetch availability (active loans)
    active_loan_item_ids = set(
        session.exec(
            select(Loan.item_id).where(
                Loan.item_id.in_(item_ids),
                Loan.status.in_(
                    [
                        LoanStatus.ACTIVE,
                        LoanStatus.ACCEPTED,
                        LoanStatus.RETURN_PENDING,
                        LoanStatus.EXTENSION_PENDING,
                        LoanStatus.DEFAULTED,
                    ]
                ),
            )
        ).all()
    )

    # Bulk fetch possession history for current user
    possession_loan_item_ids = set(
        session.exec(
            select(Loan.item_id).where(
                Loan.item_id.in_(item_ids),
                Loan.requester_id == current_user.id,
                Loan.status.in_(
                    [
                        LoanStatus.ACTIVE,
                        LoanStatus.RETURN_PENDING,
                        LoanStatus.RETURNED,
                        LoanStatus.EXTENSION_PENDING,
                    ]
                ),
            )
        ).all()
    )

    # Bulk fetch pending donations
    pending_donation_item_ids = set(
        session.exec(
            select(CommunityItem.item_id).where(
                CommunityItem.item_id.in_(item_ids),
                CommunityItem.is_donation_pending,
            )
        ).all()
    )

    if minimal:
        # Build ItemMinimal objects
        minimal_items = []
        for item in items:
            owner_name = "Unknown"
            if item.user_owner:
                owner_name = item.user_owner.full_name or item.user_owner.email
            elif item.community_owner:
                owner_name = item.community_owner.name

            minimal_items.append(
                ItemMinimal(
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
                    had_possession=item.owner_id == current_user.id
                    or item.id in possession_loan_item_ids,
                    is_community_owned=item.community_owner is not None,
                    is_donation_pending=item.id in pending_donation_item_ids,
                    owner_name=owner_name,
                    category=item.category,
                    genre=item.genre,
                    subject=item.subject,
                )
            )
        return ItemsMinimalPublic(data=minimal_items, count=count, facets=facets)

    # Full ItemPublic building
    work_keys = {
        (item.author, item.title) for item in items if item.author and item.title
    }
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

    condition_ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id.in_(item_ids))
    ).all()
    condition_data_map = {}
    for r in condition_ratings:
        if r.item_id not in condition_data_map:
            condition_data_map[r.item_id] = {"sum": 0.0, "count": 0, "notes": []}
        condition_data_map[r.item_id]["sum"] += r.grade
        condition_data_map[r.item_id]["count"] += 1
        if r.notes:
            condition_data_map[r.item_id]["notes"].append(
                {
                    "user_id": str(r.user_id),
                    "note": r.notes,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
            )

    public_items = []
    for item in items:
        is_avail = item.id not in active_loan_item_ids
        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(
                item.user_owner,
                current_user.id,
                is_admin=current_user.is_superuser,
                session=session,
            )
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner

        cond_stats = condition_data_map.get(
            item.id, {"sum": 0.0, "count": 0, "notes": []}
        )
        avg_grade = (
            cond_stats["sum"] / cond_stats["count"] if cond_stats["count"] > 0 else 0.0
        )
        had_possession = (
            item.owner_id == current_user.id or item.id in possession_loan_item_ids
        )

        public_items.append(
            ItemPublic(
                id=item.id,
                owner_id=item.owner_id,
                title=item.title,
                description=item.description,
                author=item.author,
                item_type=item.item_type,
                image_url=item.image_url,
                info={
                    **(item.info or {}),
                    "average_condition_grade": avg_grade,
                    "physical_notes": cond_stats["notes"],
                },
                count=item.count,
                created_at=item.created_at,
                owner=owner_pub,
                community_owner=community_pub,
                is_available=is_avail,
                is_donation_pending=item.id in pending_donation_item_ids,
                work_metadata=work_meta_map.get((item.author, item.title)),
                had_possession=had_possession,
                category=item.category,
                genre=item.genre,
                subject=item.subject,
            )
        )

    return ItemsPublic(
        data=public_items, count=count, facets=facets, facet_stats=facet_stats
    )


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
                    (
                        (Friendship.user_id == current_user.id)
                        & (Friendship.friend_id == item.owner_id)
                    )
                    | (
                        (Friendship.user_id == item.owner_id)
                        & (Friendship.friend_id == current_user.id)
                    ),
                    Friendship.status == FriendshipStatus.ACCEPTED,
                )
            ).first()
            if not is_friend:
                raise HTTPException(
                    status_code=403,
                    detail="Not enough permissions (Not a friend of owner)",
                )
        elif item.community_owner:  # Community item
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
            ).first()
            if not is_member:
                raise HTTPException(
                    status_code=403,
                    detail="Not enough permissions (Not a member of owning community)",
                )

    is_avail = check_item_availability(session, item.id)

    owner_pub = None
    community_pub = None
    if item.user_owner:
        owner_pub = filter_owner_privacy(
            item.user_owner,
            current_user.id,
            is_admin=current_user.is_superuser,
            session=session,
        )
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
        info={
            **(item.info or {}),
            "average_condition_grade": cond_data["average_grade"],
            "physical_notes": cond_data["notes"],
        },
        count=item.count,
        created_at=item.created_at,
        owner=owner_pub,
        community_owner=community_pub,
        is_available=is_avail,
        work_metadata=get_work_metadata(session, item.author, item.title),
        had_possession=had_possession,
        category=item.category,
        genre=item.genre,
        subject=item.subject,
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
    category: Annotated[str | None, Form()] = None,
    genre: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
    isbn: Annotated[str | None, Form()] = None,
    info: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
    community_owner_id: Annotated[uuid.UUID | None, Form()] = None,
) -> Any:
    """
    Create a new item. Associates with current user or community as owner.
    """
    try:
        parsed_info = {}
        if info:
            try:
                parsed_info = json.loads(info)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in info")

        # Handle image upload
        final_image_url = image_url
        if image:
            try:
                contents = await image.read()
                if len(contents) > settings.max_image_size_bytes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image size exceeds the {settings.MAX_IMAGE_SIZE_MB}MB limit.",
                    )
                final_image_url = upload_image(contents, image.filename, folder="items")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Image upload failed: {str(e)}"
                )
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
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
            is_admin = session.exec(statement).first() or current_user.is_superuser

            if is_admin:
                target_owner_id = community_owner_id
            else:
                target_owner_id = current_user.id
                should_pool = True

        if not target_owner_id:
            raise HTTPException(
                status_code=400, detail="Owner ID could not be determined"
            )

        # Book classification cleanup
        final_category = category
        final_genre = genre
        final_subject = subject

        if item_type == ItemType.book:
            c, g, s = map_book_classification(genre or category or subject)
            final_category = c or category
            final_genre = g or genre
            if s and s not in (subject or ""):
                final_subject = f"{subject}, {s}" if subject else s

        db_item = Item(
            title=title,
            description=description,
            author=author,
            item_type=item_type,
            category=final_category,
            genre=final_genre,
            subject=final_subject,
            isbn=isbn,
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
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
            if session.exec(statement).first():
                comm_item = CommunityItem(
                    community_id=community_owner_id,
                    item_id=db_item.id,
                    added_by=current_user.id,
                )
                session.add(comm_item)

        # Ensure WorkMetadata exists
        if author:
            ensure_work_metadata(
                session,
                author,
                title,
                isbn_val=db_item.isbn,
                description=description,
                category=final_category,
                genre=final_genre,
                image_url=final_image_url,
                tags=final_subject.split(",") if final_subject else None,
            )

        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)

        # Update collection index for owner and pooled communities synchronously
        invalidate_item_caches(session, db_item.id)

        owner_pub = None
        community_pub = None
        if db_item.user_owner:
            owner_pub = filter_owner_privacy(
                db_item.user_owner, current_user.id, is_admin=current_user.is_superuser
            )
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
            category=db_item.category,
            genre=db_item.genre,
            subject=db_item.subject,
            info=db_item.info,
            count=db_item.count,
            created_at=db_item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=True,
            work_metadata=get_work_metadata(session, db_item.author, db_item.title),
            had_possession=True,
        )
        return item_pub
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while creating the item: {str(e)}",
        )


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
    category: Annotated[str | None, Form()] = None,
    genre: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
    isbn: Annotated[str | None, Form()] = None,
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
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
            ).first()
            if not is_member and not current_user.is_superuser:
                raise HTTPException(
                    status_code=403,
                    detail="Not enough permissions (Community admin required)",
                )

        if title is not None:
            db_item.title = title
        if description is not None:
            db_item.description = description
        if author is not None:
            db_item.author = author
        if item_type is not None:
            db_item.item_type = item_type

        # Classification updates
        if category is not None:
            db_item.category = category
        if genre is not None:
            db_item.genre = genre
        if subject is not None:
            db_item.subject = subject
        if isbn is not None:
            db_item.isbn = isbn

        if image_url is not None:
            if image_url.startswith("http"):
                try:
                    stored_url = await upload_image_from_url(image_url, folder="items")
                    if stored_url:
                        db_item.image_url = stored_url
                except Exception as e:
                    logger.warning("Image upload failed, using original URL: %s", e)
                    db_item.image_url = image_url
            else:
                db_item.image_url = image_url

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
                        detail=f"Image size exceeds the {settings.MAX_IMAGE_SIZE_MB}MB limit.",
                    )
                db_item.image_url = upload_image(
                    contents, image.filename, folder="items"
                )
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Image upload failed: {str(e)}"
                )

        # Record contribution
        contribution = Contribution(
            user_id=current_user.id,
            item_id=db_item.id,
            description="Updated item specifications",
        )
        session.add(contribution)

        # Ensure WorkMetadata exists and is updated
        if db_item.author:
            ensure_work_metadata(
                session,
                db_item.author,
                db_item.title,
                isbn_val=db_item.isbn,
                description=db_item.description,
                category=db_item.category,
                genre=db_item.genre,
                image_url=db_item.image_url,
                tags=db_item.subject.split(",") if db_item.subject else None,
                overwrite=True,  # User explicitly updated, so overwrite archive
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
            owner_pub = filter_owner_privacy(
                db_item.user_owner,
                current_user.id,
                is_admin=current_user.is_superuser,
                session=session,
            )
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
            category=db_item.category,
            genre=db_item.genre,
            subject=db_item.subject,
            image_url=db_item.image_url,
            info={
                **(db_item.info or {}),
                "average_condition_grade": cond_data["average_grade"],
                "physical_notes": cond_data["notes"],
            },
            count=db_item.count,
            created_at=db_item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail,
            work_metadata=get_work_metadata(session, db_item.author, db_item.title),
            had_possession=check_possession(session, current_user.id, db_item.id),
        )
        return item_pub
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while updating the item: {str(e)}",
        )


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
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
        ).first()
        if not is_member and not current_user.is_superuser:
            raise HTTPException(
                status_code=403,
                detail="Not enough permissions (Community admin required)",
            )

    if db_item.image_url:
        delete_image(db_item.image_url)

    owner_id = db_item.owner_id  # Save for background task
    session.delete(db_item)
    session.commit()

    rebuild_collection_index_task(owner_id)

    try:
        delete_item_from_search(id)
    except Exception:
        logger.warning("Meilisearch delete failed for item %s", id, exc_info=True)
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
        info={},  # Physical info (grade, notes) should not be copied
        owner_id=current_user.id,
    )

    session.add(new_item)
    session.commit()
    session.refresh(new_item)
    sync_item_to_search(new_item)

    rebuild_collection_index_task(new_item.owner_id)

    owner_pub = filter_owner_privacy(
        current_user, current_user.id, is_admin=current_user.is_superuser
    )
    owner_pub.is_available = True

    return ItemPublic(
        id=new_item.id,
        owner_id=new_item.owner_id,
        title=new_item.title,
        description=new_item.description,
        author=new_item.author,
        item_type=new_item.item_type,
        image_url=new_item.image_url,
        info=new_item.info,
        count=new_item.count,
        created_at=new_item.created_at,
        owner=owner_pub,
        is_available=True,
        work_metadata=get_work_metadata(session, new_item.author, new_item.title),
        had_possession=True,
        category=new_item.category,
        genre=new_item.genre,
        subject=new_item.subject,
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
        exists = session.exec(
            select(Item).where(Item.author == author, Item.title == title)
        ).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Work not found")
        meta = WorkMetadata(author=author, title=title)
        session.add(meta)
        session.commit()
        session.refresh(meta)
    return meta


@router.patch("/work-metadata/{author}/{title}", response_model=WorkMetadataPublic)
async def update_work_metadata(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    author: str,
    title: str,
    meta_in: WorkMetadataUpdate,
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
        overwrite=True,
    )

    # Sync tags to Item.subject for the current user's matching items
    if meta_in.tags:
        new_subject = ", ".join(t.strip() for t in meta_in.tags if t.strip())
        if new_subject:
            matching_items = session.exec(
                select(Item).where(
                    Item.owner_id == current_user.id,
                    Item.author == author,
                    Item.title == title,
                )
            ).all()
            for item in matching_items:
                item.subject = new_subject
            if matching_items:
                session.flush()

    # Record contribution
    contribution = Contribution(
        user_id=current_user.id,
        work_author=author,
        work_title=title,
        description="Updated work metadata",
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
    delete_work_metadata_from_search(author, title)
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
            ItemReview.user_id == current_user.id,
        )
    ).first()

    if existing:
        # Update existing
        existing.rating = review_in.rating
        existing.comment = review_in.comment
        review = existing
    else:
        review = ItemReview(**review_in.model_dump(), user_id=current_user.id)
        session.add(review)

    session.flush()

    # Update WorkMetadata aggregate rating
    meta = ensure_work_metadata(session, review_in.author, review_in.title)
    if meta:
        all_reviews = session.exec(
            select(ItemReview).where(
                ItemReview.author == review_in.author,
                ItemReview.title == review_in.title,
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
    *,
    session: SessionDep,
    current_user: CurrentUser,
    author: str,
    title: str,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Get reviews for a work.
    """
    statement = (
        select(ItemReview)
        .where(ItemReview.author == author, ItemReview.title == title)
        .order_by(ItemReview.created_at.desc())
    )

    count = session.exec(select(func.count()).select_from(statement.subquery())).one()
    reviews = session.exec(statement.offset(skip).limit(limit)).all()

    public_reviews = []
    for r in reviews:
        # Check if user voted
        vote = session.exec(
            select(ItemReviewVote).where(
                ItemReviewVote.review_id == r.id,
                ItemReviewVote.user_id == current_user.id,
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
            ItemReviewVote.user_id == current_user.id,
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
        new_vote = ItemReviewVote(
            review_id=review_id, user_id=current_user.id, vote=vote
        )
        session.add(new_vote)

    session.flush()

    # Recalculate score
    score = session.exec(
        select(func.sum(ItemReviewVote.vote)).where(
            ItemReviewVote.review_id == review_id
        )
    ).one()

    review.vote_score = score or 0
    session.add(review)
    session.commit()
    session.refresh(review)
    return review


@router.post("/condition-ratings", response_model=ItemConditionRatingPublic)
def create_condition_rating(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    rating_in: ItemConditionRatingCreate,
) -> Any:
    """
    Add or update condition rating for a physical item.
    User must have had possession of the item.
    """
    if not check_possession(session, current_user.id, rating_in.item_id):
        raise HTTPException(
            status_code=403,
            detail="You must have had possession of this item to rate its condition.",
        )

    existing = session.exec(
        select(ItemConditionRating).where(
            ItemConditionRating.item_id == rating_in.item_id,
            ItemConditionRating.user_id == current_user.id,
        )
    ).first()

    if existing:
        existing.grade = rating_in.grade
        existing.notes = rating_in.notes
        rating = existing
    else:
        rating = ItemConditionRating(**rating_in.model_dump(), user_id=current_user.id)
        session.add(rating)

    session.commit()
    session.refresh(rating)
    return rating


@router.get(
    "/condition-ratings/{item_id}", response_model=list[ItemConditionRatingPublic]
)
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
                    (
                        (Friendship.user_id == current_user.id)
                        & (Friendship.friend_id == item.owner_id)
                    )
                    | (
                        (Friendship.user_id == item.owner_id)
                        & (Friendship.friend_id == current_user.id)
                    ),
                    Friendship.status == FriendshipStatus.ACCEPTED,
                )
            ).first()
            if is_friend:
                allowed = True
        elif item.community_owner:
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED,
                )
            ).first()
            if is_member:
                allowed = True

    if not allowed:
        raise HTTPException(
            status_code=403, detail="Not enough permissions to view condition history"
        )

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
                CommunityMember.status == CommunityMemberStatus.ACCEPTED,
            )
        ).first()
        return is_member is not None
    return False


@router.post("/batch/delete", response_model=Message)
@limiter.limit("20/minute")
def batch_delete_items(
    *,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    action: ItemBatchAction,
    background_tasks: BackgroundTasks,
) -> Any:
    """Delete multiple items. Only owner or community admin can delete."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    for item in items:
        if not _is_owner_or_admin(item, current_user, session):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify one or more items in this batch",
            )

    owner_ids = set()
    for item in items:
        if item.image_url:
            delete_image(item.image_url)
        owner_ids.add(item.owner_id)
        session.delete(item)
        delete_item_from_search(item.id)

    session.commit()
    for o_id in owner_ids:
        rebuild_collection_index_task(o_id)

    return Message(message=f"Successfully deleted {len(items)} items.")


@router.post("/batch/mark-lost", response_model=Message)
@limiter.limit("20/minute")
def batch_mark_lost(
    *, request: Request, session: SessionDep, current_user: CurrentUser, action: ItemBatchAction
) -> Any:
    """Mark multiple items as lost."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    for item in items:
        if not _is_owner_or_admin(item, current_user, session):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify one or more items in this batch",
            )

    for item in items:
        item.is_lost = True
        session.add(item)
        sync_item_to_search(item)

    session.commit()
    return Message(message=f"Successfully marked {len(items)} items as lost.")


@router.post("/batch/mark-found", response_model=Message)
@limiter.limit("20/minute")
def batch_mark_found(
    *, request: Request, session: SessionDep, current_user: CurrentUser, action: ItemBatchAction
) -> Any:
    """Mark multiple lost items as found (move back to catalogue)."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    for item in items:
        if not _is_owner_or_admin(item, current_user, session):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify one or more items in this batch",
            )

    for item in items:
        item.is_lost = False
        session.add(item)
        sync_item_to_search(item)

    session.commit()
    return Message(message=f"Successfully marked {len(items)} items as found.")


@router.post("/batch/toggle-privacy", response_model=Message)
@limiter.limit("20/minute")
def batch_toggle_privacy(
    *, request: Request, session: SessionDep, current_user: CurrentUser, action: ItemBatchAction
) -> Any:
    """Toggle privacy status for multiple items."""
    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    for item in items:
        if not _is_owner_or_admin(item, current_user, session):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to modify one or more items in this batch",
            )

    for item in items:
        item.is_private = not item.is_private
        session.add(item)
        sync_item_to_search(item)

    session.commit()
    return Message(message=f"Successfully toggled privacy for {len(items)} items.")


@router.post("/batch/enrich", response_model=Message)
@limiter.limit("10/minute")
def batch_enrich_metadata(
    *,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    action: ItemBatchEnrich,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Enrich metadata for multiple items in the background.
    Superuser only to prevent API abuse.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    books_to_enrich = []
    for item in items:
        if (
            _is_owner_or_admin(item, current_user, session)
            and item.item_type == ItemType.book
        ):
            books_to_enrich.append(
                {"author": item.author, "title": item.title, "isbn": item.isbn}
            )

    if not books_to_enrich:
        return Message(message="No valid books found for enrichment.")

    background_tasks.add_task(
        enrich_specific_books,
        books_to_enrich,
        current_user.id,
        fields_to_overwrite=action.fields_to_overwrite,
        source_api="auto",
    )
    return Message(
        message=f"Started enrichment for {len(books_to_enrich)} books in background."
    )


@router.post("/batch/sync-archive", response_model=Message)
@limiter.limit("10/minute")
def batch_sync_from_archive(
    *,
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    action: ItemBatchAction,
    background_tasks: BackgroundTasks,
) -> Any:
    """Sync items with the latest data from the WorkMetadata archive in the background."""
    from app.api.utils import sync_items_from_archive

    items = session.exec(select(Item).where(Item.id.in_(action.item_ids))).all()
    valid_ids = [
        item.id
        for item in items
        if _is_owner_or_admin(item, current_user, session) and item.item_type == ItemType.book
    ]

    if not valid_ids:
        return Message(message="No valid books found for sync.")

    background_tasks.add_task(sync_items_from_archive, valid_ids, current_user.id)
    return Message(
        message=f"Started sync from archive for {len(valid_ids)} books in background."
    )
