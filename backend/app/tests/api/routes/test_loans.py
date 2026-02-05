import uuid
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Item, Loan, LoanStatus, ItemType, UserCreate, User
from app.tests.utils.utils import random_email, random_lower_string

def get_superuser_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        user = crud.create_user(session=db, user_create=user_in)
    
    if not user.is_verified:
        user.is_verified = True
        db.add(user)
        db.commit()
        db.refresh(user)

    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}
    return headers

def create_random_item(db: Session, owner_id: uuid.UUID) -> Item:
    item = Item(
        title=random_lower_string(),
        description=random_lower_string(),
        owner_id=owner_id,
        item_type=ItemType.general,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

def test_loan_lifecycle(
    client: TestClient, db: Session
) -> None:
    # 1. Setup: Superuser (owner) and Normal User (requester)
    superuser = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)
    if not superuser:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        superuser = crud.create_user(session=db, user_create=user_in)
    if not superuser.is_verified:
        superuser.is_verified = True
        db.add(superuser)
        db.commit()
        db.refresh(superuser)
    
    superuser_headers = get_superuser_token_headers(client, db)
    
    user_email = random_email()
    user_password = random_lower_string()
    user_data = {"email": user_email, "password": user_password}
    client.post(f"{settings.API_V1_STR}/users/signup", json=user_data)
    requester = crud.get_user_by_email(session=db, email=user_email)
    requester.is_verified = True
    db.add(requester)
    db.commit()
    db.refresh(requester)
    
    login_data = {"username": user_email, "password": user_password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    requester_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    
    # 2. Owner creates an item
    item = create_random_item(db, owner_id=superuser.id)

    # NEW: Establish friendship so they can borrow from each other
    from app.models import Friendship, FriendshipStatus
    friendship = Friendship(
        user_id=requester.id,
        friend_id=superuser.id,
        status=FriendshipStatus.ACCEPTED
    )
    db.add(friendship)
    db.commit()

    # 3. Requester submits loan request
    start_date = datetime.now(timezone.utc) + timedelta(days=1)
    end_date = start_date + timedelta(days=7)
    loan_data = {
        "item_id": str(item.id),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }
    response = client.post(f"{settings.API_V1_STR}/loans/request", headers=requester_headers, json=loan_data)
    assert response.status_code == 200
    loan_id = response.json()["id"]
    
    # 4. Owner accepts loan request
    response = client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/respond?accept=true", headers=superuser_headers)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.ACCEPTED
    
    # 5. Requester ratifies loan
    response = client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/ratify", headers=requester_headers)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.ACTIVE
    
    # 6. Requester signals return
    response = client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/return-signal", headers=requester_headers)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.RETURN_PENDING
    
    # 7. Owner confirms return
    response = client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/return", headers=superuser_headers)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.RETURNED

def test_read_incoming_loan_requests(
    client: TestClient, db: Session
) -> None:
    superuser_token_headers = get_superuser_token_headers(client, db)
    response = client.get(f"{settings.API_V1_STR}/loans/incoming", headers=superuser_token_headers)
    assert response.status_code == 200
    content = response.json()
    assert "data" in content
    assert "count" in content

def test_read_outgoing_loan_requests(
    client: TestClient, db: Session
) -> None:
    superuser_token_headers = get_superuser_token_headers(client, db)
    response = client.get(f"{settings.API_V1_STR}/loans/outgoing", headers=superuser_token_headers)
    assert response.status_code == 200
    content = response.json()
    assert "data" in content
    assert "count" in content
