from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    Community,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    Item,
    ItemType,
    Notification,
    User,
)
from app.tests.utils.utils import random_email, random_lower_string


def get_token_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    login_data = {
        "username": email,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}
    return headers

def create_user(db: Session, client: TestClient) -> tuple[User, dict[str, str]]:
    email = random_email()
    password = random_lower_string()
    user_data = {"email": email, "password": password}
    client.post(f"{settings.API_V1_STR}/users/signup", json=user_data)
    user = crud.get_user_by_email(session=db, email=email)
    user.is_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    headers = get_token_headers(client, email, password)
    return user, headers

def test_loan_notification_links(client: TestClient, db: Session) -> None:
    # 1. Setup users
    lender, lender_headers = create_user(db, client)
    borrower, borrower_headers = create_user(db, client)
    admin, admin_headers = create_user(db, client)

    # 2. Setup community
    community = Community(name=random_lower_string(), created_by=admin.id)
    db.add(community)
    db.commit()
    db.refresh(community)

    # Add admin to community
    membership = CommunityMember(
        community_id=community.id,
        user_id=admin.id,
        role=CommunityMemberRole.ADMIN,
        status=CommunityMemberStatus.ACCEPTED
    )
    db.add(membership)
    # Add borrower to community
    borrower_membership = CommunityMember(
        community_id=community.id,
        user_id=borrower.id,
        role=CommunityMemberRole.MEMBER,
        status=CommunityMemberStatus.ACCEPTED
    )
    db.add(borrower_membership)
    db.commit()

    # Case A: Personal loan (between friends)
    from app.models import Friendship, FriendshipStatus
    friendship = Friendship(user_id=lender.id, friend_id=borrower.id, status=FriendshipStatus.ACCEPTED)
    db.add(friendship)
    db.commit()

    item = Item(title="Personal Item", owner_id=lender.id, item_type=ItemType.general)
    db.add(item)
    db.commit()
    db.refresh(item)

    # Borrower requests personal item
    loan_data = {
        "item_id": str(item.id),
        "start_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }
    client.post(f"{settings.API_V1_STR}/loans/request", json=loan_data, headers=borrower_headers)

    # Check lender notification link (should be /loans)
    notif = db.exec(select(Notification).where(Notification.recipient_id == lender.id).order_by(Notification.created_at.desc())).first()
    assert notif.link == "/loans"

    # Case B: Community-owned item
    comm_item = Item(title="Community Item", owner_id=community.id, item_type=ItemType.general)
    db.add(comm_item)
    db.commit()
    db.refresh(comm_item)

    # Borrower requests community item
    loan_data_comm = {
        "item_id": str(comm_item.id),
        "community_id": str(community.id),
        "start_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }
    client.post(f"{settings.API_V1_STR}/loans/request", json=loan_data_comm, headers=borrower_headers)

    # Check admin notification link (should be community loans tab)
    notif_admin = db.exec(select(Notification).where(Notification.recipient_id == admin.id).order_by(Notification.created_at.desc())).first()
    assert notif_admin.link == f"/communities/{community.id}?tab=loans"

    # Case C: Owner accepts request, borrower notified
    # We need the loan ID
    loan = db.exec(select(Item).where(Item.id == item.id)).first().loans[0]
    client.patch(f"{settings.API_V1_STR}/loans/{loan.id}/respond?accept=true", headers=lender_headers)

    # Check borrower notification link (should always be /loans)
    notif_borrower = db.exec(select(Notification).where(Notification.recipient_id == borrower.id).order_by(Notification.created_at.desc())).first()
    assert notif_borrower.link == "/loans"
