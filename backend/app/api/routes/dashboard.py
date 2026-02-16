from typing import Any
import uuid
from fastapi import APIRouter
from sqlmodel import func, select, or_
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Community,
    CommunityItem,
    CommunityMember,
    CommunityMemberStatus,
    Friendship,
    FriendshipStatus,
    Item,
    Loan,
    LoanStatus,
    User,
    ItemsPublic,
    ItemPublic,
    WorkMetadata,
    ItemConditionRating,
    ItemOwnerPublic
)
from app.api.utils import (
    check_item_availability, 
    get_item_condition_data, 
    check_possession, 
    filter_owner_privacy,
    get_work_metadata
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(session: SessionDep, current_user: CurrentUser) -> Any:
    """
    Get aggregated stats for the user dashboard.
    """
    # 1. Active Loans (Incoming - Borrowed by user)
    # Status: ACTIVE, RETURN_PENDING, EXTENSION_PENDING
    active_loans_count = session.exec(
        select(func.count())
        .select_from(Loan)
        .where(
            Loan.requester_id == current_user.id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING])
        )
    ).one()

    # 2. Pending Requests (Outgoing - Items requested from user)
    # This includes personal items AND community items where user is admin
    # Personal items
    personal_pending = session.exec(
        select(func.count())
        .select_from(Loan)
        .where(
            Loan.owner_id == current_user.id,
            Loan.status.in_([LoanStatus.PENDING, LoanStatus.EXTENSION_PENDING])
        )
    ).one()

    # Community items (where user is admin)
    # Find communities where user is admin
    admin_communities = session.exec(
        select(CommunityMember.community_id)
        .where(
            CommunityMember.user_id == current_user.id,
            CommunityMember.role == "ADMIN",
            CommunityMember.status == CommunityMemberStatus.ACCEPTED
        )
    ).all()
    
    community_pending = 0
    if admin_communities:
        community_pending = session.exec(
            select(func.count())
            .select_from(Loan)
            .where(
                Loan.community_id.in_(admin_communities),
                Loan.status.in_([LoanStatus.PENDING, LoanStatus.EXTENSION_PENDING])
            )
        ).one()

    total_pending_actions = personal_pending + community_pending

    return {
        "honor_score": current_user.honor_score,
        "reliability_rate": current_user.reliability_rate,
        "active_loans_count": active_loans_count,
        "pending_actions_count": total_pending_actions
    }


@router.get("/recent-activity", response_model=ItemsPublic)
def get_recent_activity(
    session: SessionDep, 
    current_user: CurrentUser,
    limit: int = 10
) -> Any:
    """
    Get recently added items from friends and communities.
    """
    # 1. Get Social Graph (Friends & Communities)
    # Friends
    friends_stmt = select(Friendship).where(
        (Friendship.user_id == current_user.id) | (Friendship.friend_id == current_user.id),
        Friendship.status == FriendshipStatus.ACCEPTED
    )
    friendships = session.exec(friends_stmt).all()
    friend_ids = set()
    for f in friendships:
        if f.user_id == current_user.id:
            friend_ids.add(f.friend_id)
        else:
            friend_ids.add(f.user_id)
            
    # Communities
    comm_stmt = select(CommunityMember.community_id).where(
        CommunityMember.user_id == current_user.id,
        CommunityMember.status == CommunityMemberStatus.ACCEPTED
    )
    community_ids = {cid for cid in session.exec(comm_stmt).all()}
    
    # 2. Query Items
    # owner_id IN friends OR owner_id IN communities OR id IN (pooled items of my communities)
    
    if not friend_ids and not community_ids:
        return ItemsPublic(data=[], count=0)
        
    # Exclude items with DEFAULTED loans
    defaulted_item_ids = select(Loan.item_id).where(Loan.status == LoanStatus.DEFAULTED)

    # Subquery for pooled items in user's communities
    pooled_item_ids_stmt = select(CommunityItem.item_id).where(CommunityItem.community_id.in_(list(community_ids)))

    statement = (
        select(Item)
        .options(selectinload(Item.user_owner), selectinload(Item.community_owner))
        .where(
            or_(
                Item.owner_id.in_(list(friend_ids | community_ids)),
                Item.id.in_(pooled_item_ids_stmt)
            )
        )
        .where(Item.id.not_in(defaulted_item_ids))
        .order_by(Item.created_at.desc())
        .limit(limit)
    )
    
    items = session.exec(statement).all()
    
    if not items:
        return ItemsPublic(data=[], count=0)

    # 3. Bulk Enrichment (Optimized)
    item_ids = [item.id for item in items]
    work_keys = {(item.author, item.title) for item in items if item.author and item.title}
    
    # 3.1 Bulk fetch WorkMetadata
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

    # 3.2 Bulk fetch active loans for availability
    active_loan_item_ids = set(session.exec(
        select(Loan.item_id).where(
            Loan.item_id.in_(item_ids),
            Loan.status.in_([
                LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, 
                LoanStatus.RETURN_PENDING, LoanStatus.EXTENSION_PENDING, LoanStatus.DEFAULTED
            ])
        )
    ).all())

    # 3.3 Bulk fetch possession history for current user
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

    # 3.4 Bulk fetch condition ratings
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
            condition_data_map[r.item_id]["notes"].append({
                "user_id": str(r.user_id),
                "note": r.notes,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })

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
            
        cond_stats = condition_data_map.get(item.id, {"sum": 0.0, "count": 0, "notes": []})
        avg_grade = cond_stats["sum"] / cond_stats["count"] if cond_stats["count"] > 0 else 0.0
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
            had_possession=had_possession,
            category=item.extra_data.get("category") if item.extra_data else None,
            genre=item.extra_data.get("genre") if item.extra_data else None,
            subject=item.extra_data.get("subject") if item.extra_data else None
        )
        public_items.append(item_pub)
        
    return ItemsPublic(data=public_items, count=len(public_items))

