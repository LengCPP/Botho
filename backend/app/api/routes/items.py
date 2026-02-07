import json
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.api.utils import check_item_availability, filter_owner_privacy
from app.core.config import settings
from app.models import (
    CommunityItem,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
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
    WorkMetadataUpdate,
)
from app.search import (
    delete_item_from_search,
    sync_item_to_search,
    sync_work_metadata_to_search,
)
from app.storage import delete_image, upload_image, upload_image_from_url

router = APIRouter(prefix="/items", tags=["items"])


def get_work_metadata(session: SessionDep, author: str | None, title: str) -> WorkMetadata | None:
    if not author:
        return None
    return session.get(WorkMetadata, (author, title))


def ensure_work_metadata(
    session: SessionDep,
    author: str | None,
    title: str,
    isbn: str | None = None,
    description: str | None = None,
    category: str | None = None,
    image_url: str | None = None
) -> WorkMetadata | None:
    if not author:
        return None
    meta = session.get(WorkMetadata, (author, title))
    if not meta:
        meta = WorkMetadata(
            author=author,
            title=title,
            isbn=isbn,
            description=description,
            category=category,
            image_url=image_url
        )
        session.add(meta)
    else:
        # Update missing info if found
        if isbn and not meta.isbn:
            meta.isbn = isbn
        if description and not meta.description:
            meta.description = description
        if category and not meta.category:
            meta.category = category
        if image_url and not meta.image_url:
            meta.image_url = image_url
        session.add(meta)
    session.flush()
    sync_work_metadata_to_search(meta)
    return meta


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
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.RETURNED])
        )
    ).first()
    return bool(loan)


def get_item_condition_data(session: SessionDep, item_id: uuid.UUID) -> dict:
    ratings = session.exec(
        select(ItemConditionRating).where(ItemConditionRating.item_id == item_id)
    ).all()

    if not ratings:
        return {"average_grade": 0.0, "notes": []}

    avg_grade = sum(r.grade for r in ratings) / len(ratings)
    notes = [{"user_id": r.user_id, "note": r.notes, "created_at": r.created_at} for r in ratings if r.notes]

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
    search_query = " ".join(interests) if interests else ""
    
    # 3. Construct Meilisearch Filter
    # item_type = 'book' AND (owner_id IN [...] OR pooled_in IN [...])
    
    # Combine friends and communities for owner_id check
    allowed_owners = list(friend_ids | community_ids)
    allowed_pools = list(community_ids)
    
    filter_expression = ["item_type = book"]
    
    access_filters = []
    if allowed_owners:
        access_filters.append(f"owner_id IN {allowed_owners}")
    if allowed_pools:
        access_filters.append(f"pooled_in IN {allowed_pools}")
        
    if access_filters:
        filter_expression.append(f"({' OR '.join(access_filters)})")
    else:
        # If no friends and no communities, show nothing? 
        # Or maybe public items? The prompt implies "available for user to borrow".
        # Let's return empty if no access.
        return ItemsPublic(data=[], count=0)
        
    # 4. Execute Search
    index = client.index("items")
    search_results = index.search(
        search_query,
        {
            "filter": filter_expression,
            "limit": limit,
            "offset": skip,
        }
    )
    
    # 5. Fetch DB Items
    hits = search_results["hits"]
    if not hits:
        return ItemsPublic(data=[], count=0)
        
    item_ids = [uuid.UUID(hit["id"]) for hit in hits]
    
    # Fetch items preserving order (roughly)
    # SQL IN clause doesn't preserve order. We fetch all and reorder in python.
    db_items = session.exec(select(Item).where(Item.id.in_(item_ids))).all()
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
            # Add pooling meta if applicable (simplified check)
            # We don't have the CommunityItem loaded here efficiently for pooling details
            # but we can check if any of user's communities have it pooled
            # For recommendations, basic info is likely enough.
            
            ordered_items.append(item_pub)
            
    return ItemsPublic(data=ordered_items, count=search_results["estimatedTotalHits"])


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
    item_type: ItemType | None = None,
    enable_feed: bool = False
) -> Any:
    """
    Retrieve items. Filters by current user's owner_id by default, unless enable_feed is True.
    """

    target_owner_id = None
    feed_mode = False

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

    # Filter items
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
        
        statement = select(Item).where(
            or_(
                Item.owner_id.in_(allowed_community_ids),
                Item.community_owner.has(Community.id.in_(allowed_community_ids))
            )
        )
    else:
        statement = select(Item).where(Item.owner_id == target_owner_id)

    if category:
        statement = statement.where(
            func.json_extract_path_text(Item.extra_data, 'category') == category
        )

    if genre:
        statement = statement.where(
            func.json_extract_path_text(Item.extra_data, 'genre') == genre
        )

    if item_type:
        statement = statement.where(Item.item_type == item_type)

    # Count total
    count_stmt = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_stmt).one()

    # Apply sorting
    sort_column = Item.created_at
    if sort_by == "title":
        sort_column = Item.title

    if sort_order == "desc":
        statement = statement.order_by(sort_column.desc())
    else:
        statement = statement.order_by(sort_column.asc())

    items = session.exec(statement.offset(skip).limit(limit)).all()

    public_items = []
    for item in items:
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
        public_items.append(item_pub)

    return ItemsPublic(data=public_items, count=count)


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

        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)

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

    session.delete(db_item)
    session.commit()
    delete_item_from_search(id)
    return Message(message="Item deleted successfully")


@router.post("/{id}/duplicate", response_model=ItemPublic)
def duplicate_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
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
def update_work_metadata(
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

    session.add(meta)
    session.commit()
    session.refresh(meta)
    return meta


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
