from typing import Any
import uuid
from fastapi import APIRouter
from sqlmodel import func, select, or_
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Community,
    CommunityMember,
    CommunityMemberStatus,
    Friendship,
    FriendshipStatus,
    Item,
    Loan,
    LoanStatus,
    User,
    ItemsPublic,
    ItemPublic
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
    # owner_id IN friends OR owner_id IN communities OR pooled_in communities (via CommunityItem... tough to join simply)
    # Let's stick to owner_id for now as it covers most cases
    
    allowed_ids = list(friend_ids | community_ids)
    
    if not allowed_ids:
        return ItemsPublic(data=[], count=0)
        
    statement = (
        select(Item)
        .options(selectinload(Item.user_owner), selectinload(Item.community_owner))
        .where(Item.owner_id.in_(allowed_ids))
        .order_by(Item.created_at.desc())
        .limit(limit)
    )
    
    items = session.exec(statement).all()
    
    public_items = []
    for item in items:
        # Standard enrichment from items.py logic
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
        
    return ItemsPublic(data=public_items, count=len(public_items))

