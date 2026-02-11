
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import UserCreate, Item, Friendship, FriendshipStatus
from app.tests.utils.utils import random_email, random_lower_string

def get_token_headers(client: TestClient, db: Session, email: str = None) -> dict[str, str]:
    password = "password123"
    if not email:
        email = random_email()
    
    user = crud.get_user_by_email(session=db, email=email)
    if not user:
        user_in = UserCreate(email=email, password=password)
        user = crud.create_user(session=db, user_create=user_in)
        # Verify user
        user.is_verified = True
        db.add(user)
        db.commit()
        db.refresh(user)

    login_data = {
        "username": email,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}
    return headers

def test_recent_activity_empty(client: TestClient, db: Session) -> None:
    headers = get_token_headers(client, db)
    r = client.get(f"{settings.API_V1_STR}/dashboard/recent-activity", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 0
    assert data["data"] == []

def test_recent_activity_with_friend_items(client: TestClient, db: Session) -> None:
    # Create User A (Current User)
    email_a = random_email()
    headers_a = get_token_headers(client, db, email=email_a)
    user_a = crud.get_user_by_email(session=db, email=email_a)

    # Create User B (Friend)
    email_b = random_email()
    password_b = "password123"
    user_in_b = UserCreate(email=email_b, password=password_b)
    user_b = crud.create_user(session=db, user_create=user_in_b)
    
    # Create Friendship
    friendship = Friendship(
        user_id=user_a.id,
        friend_id=user_b.id,
        status=FriendshipStatus.ACCEPTED
    )
    db.add(friendship)
    db.commit()

    # Create Item for User B
    item = Item(
        title="Test Book",
        description="A test book",
        owner_id=user_b.id,
        count=1
    )
    db.add(item)
    db.commit()
    
    # Query Recent Activity
    r = client.get(f"{settings.API_V1_STR}/dashboard/recent-activity", headers=headers_a)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 1
    assert data["data"][0]["title"] == "Test Book"
