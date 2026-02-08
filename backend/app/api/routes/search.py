from typing import Any

from fastapi import APIRouter
from sqlmodel import col, or_, select

from app.api.deps import CurrentUser, SessionDep
from app.api.utils import filter_owner_privacy, filter_user_privacy
from app.core.config import settings
from app.models import (
    Community,
    CommunityMember,
    CommunityMemberStatus,
    Friendship,
    FriendshipStatus,
    Item,
    ItemPublic,
    SearchResults,
    User,
)

router = APIRouter(prefix="/search", tags=["search"])

# Import meilisearch only if enabled
if settings.MEILI_URL:
    import meilisearch
    meili_client = meilisearch.Client(
        settings.MEILI_URL,
        settings.MEILI_MASTER_KEY
    )
else:
    meili_client = None


@router.get("/", response_model=SearchResults)
def search(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    q: str,
    limit: int = 10,
) -> Any:
    """
    Search for users, items, and communities.
    Users: Search by full_name, email, bio, alias.
    Items: Search by title, description (Accessible items only).
    Communities: Search by name, description.
    """
    if not q:
        return SearchResults(users=[], items=[], communities=[])

    # 1. Search Users (Global)
    user_statement = select(User).where(
        or_(
            col(User.full_name).ilike(f"%{q}%"),
            col(User.email).ilike(f"%{q}%"),
        )
    ).limit(limit)
    users_raw = session.exec(user_statement).all()
    users_public = [filter_user_privacy(u, current_user.id, is_admin=current_user.is_superuser) for u in users_raw]

    # 2. Search Items (Expansion: Filter by visibility/friends/communities)
    # Get friend IDs
    friends_stmt = select(Friendship.friend_id).where(
        Friendship.user_id == current_user.id,
        Friendship.status == FriendshipStatus.ACCEPTED
    )
    friend_ids = session.exec(friends_stmt).all()

    friends_stmt_2 = select(Friendship.user_id).where(
        Friendship.friend_id == current_user.id,
        Friendship.status == FriendshipStatus.ACCEPTED
    )
    friend_ids_2 = session.exec(friends_stmt_2).all()

    # Get community IDs
    comm_stmt = select(CommunityMember.community_id).where(
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED
    )
    user_comm_ids = session.exec(comm_stmt).all()

    accessible_owner_ids = set([current_user.id] + list(friend_ids) + list(friend_ids_2) + list(user_comm_ids))

    meili_items_raw = []
    try:
        if not meili_client:
            raise Exception("Meilisearch not configured")

        item_index = meili_client.index("items")
        search_res = item_index.search(q, {
            "limit": limit * 2, # Fetch more to allow for filtering
            "attributesToSearchOn": ["title", "description", "author"]
        })
        item_ids = [hit["id"] for hit in search_res["hits"]]
        if item_ids:
            # Re-fetch from DB to check visibility and get full objects
            stmt = (
                select(Item)
                .where(
                    Item.id.in_(item_ids),
                    Item.owner_id.in_(list(accessible_owner_ids))
                )
                .limit(limit)
            )
            meili_items_raw = session.exec(stmt).all()

            # Sort back by meili relevance
            id_to_item = {str(item.id): item for item in meili_items_raw}
            meili_items_raw = [id_to_item[id_str] for id_str in item_ids if id_str in id_to_item][:limit]

    except Exception:
        # Fallback to SQL
        item_statement = (
            select(Item)
            .where(
                col(Item.title).ilike(f"%{q}%"),
                Item.owner_id.in_(list(accessible_owner_ids))
            )
            .limit(limit)
        )
        meili_items_raw = session.exec(item_statement).all()

    # Convert raw items to ItemPublic
    items_public = []
    from app.api.utils import check_item_availability
    for item in meili_items_raw:
        is_avail = check_item_availability(session, item.id)
        if not is_avail:
            # Check if it's because of a loan status that should hide it
            # If we want to hide defaulted items, we check the loan status
            from app.models import Loan, LoanStatus
            defaulted_loan = session.exec(
                select(Loan).where(Loan.item_id == item.id, Loan.status == LoanStatus.DEFAULTED)
            ).first()
            if defaulted_loan:
                continue

        owner_pub = None
        community_pub = None
        if item.user_owner:
            owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner

        # Manually construct ItemPublic
        from app.api.utils import check_possession, get_work_metadata
        item_pub = ItemPublic(
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
            had_possession=check_possession(session, current_user.id, item.id)
        )
        items_public.append(item_pub)

    # 3. Search Communities using Meilisearch (Expansion: Global search)
    meili_communities = []
    try:
        comm_index = meili_client.index("communities")
        search_res = comm_index.search(q, {
            "limit": limit,
            "attributesToSearchOn": ["name", "description"]
        })
        comm_ids = [hit["id"] for hit in search_res["hits"]]
        if comm_ids:
            meili_communities = session.exec(
                select(Community).where(col(Community.id).in_(comm_ids))
            ).all()
            # Sort results back to match Meilisearch relevance
            id_to_comm = {str(c.id): c for c in meili_communities}
            meili_communities = [id_to_comm[id_str] for id_str in comm_ids if id_str in id_to_comm]
    except Exception:
        # Fallback to SQL
        community_statement = select(Community).where(col(Community.name).ilike(f"%{q}%")).limit(limit)
        meili_communities = session.exec(community_statement).all()

    return SearchResults(
        users=users_public,
        items=items_public,
        communities=meili_communities,
    )
