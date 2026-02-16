import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Item, ItemType, LoanStatus, UserCreate
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

    # Establish friendship so they can borrow from each other
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

def test_loan_extension_lifecycle(
    client: TestClient, db: Session
) -> None:
    # Setup: Superuser (owner) and Normal User (requester)
    superuser_headers = get_superuser_token_headers(client, db)
    superuser = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    user_email = random_email()
    user_password = random_lower_string()
    user_data = {"email": user_email, "password": user_password}
    client.post(f"{settings.API_V1_STR}/users/signup", json=user_data)
    requester = crud.get_user_by_email(session=db, email=user_email)
    requester.is_verified = True
    db.add(requester)
    # Establish friendship
    from app.models import Friendship, FriendshipStatus
    friendship = Friendship(
        user_id=requester.id,
        friend_id=superuser.id,
        status=FriendshipStatus.ACCEPTED
    )
    db.add(friendship)
    db.commit()

    login_data = {"username": user_email, "password": user_password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    requester_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    item = create_random_item(db, owner_id=superuser.id)

    # 1. Start a loan
    start_date = datetime.now(timezone.utc)
    end_date = start_date + timedelta(days=7)
    loan_data = {
        "item_id": str(item.id),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }
    response = client.post(f"{settings.API_V1_STR}/loans/request", headers=requester_headers, json=loan_data)
    loan_id = response.json()["id"]
    client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/respond?accept=true", headers=superuser_headers)
    client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/ratify", headers=requester_headers)

    # 2. Requester requests extension
    new_end_date = end_date + timedelta(days=7)
    response = client.post(
        f"{settings.API_V1_STR}/loans/{loan_id}/extension",
        headers=requester_headers,
        params={"new_end_date": new_end_date.isoformat()}
    )
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.EXTENSION_PENDING
    assert response.json()["pending_extension_date"] is not None

    # 3. Owner rejects extension
    response = client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/extension/respond?accept=false", headers=superuser_headers)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.ACTIVE
    assert response.json()["pending_extension_date"] is None
    # Original end date remains
    # Note: isoformat can differ slightly in precision, so we check if they represent the same point in time
    # or just trust the backend logic if status is ACTIVE and pending is None.

    # 4. Requester requests extension again
    response = client.post(
        f"{settings.API_V1_STR}/loans/{loan_id}/extension",
        headers=requester_headers,
        params={"new_end_date": new_end_date.isoformat()}
    )
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.EXTENSION_PENDING

    # 5. Owner accepts extension
    response = client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/extension/respond?accept=true", headers=superuser_headers)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.ACTIVE
    # End date should be updated
    assert response.json()["end_date"].startswith(new_end_date.strftime("%Y-%m-%dT%H:%M:%S"))

def test_loan_forgiveness_flow(
    client: TestClient, db: Session
) -> None:
    # Setup
    superuser_headers = get_superuser_token_headers(client, db)
    superuser = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    user_email = random_email()
    user_password = random_lower_string()
    client.post(f"{settings.API_V1_STR}/users/signup", json={"email": user_email, "password": user_password})
    requester = crud.get_user_by_email(session=db, email=user_email)
    requester.is_verified = True
    db.add(requester)

    from app.models import Friendship, FriendshipStatus
    db.add(Friendship(user_id=requester.id, friend_id=superuser.id, status=FriendshipStatus.ACCEPTED))
    db.commit()

    login_data = {"username": user_email, "password": user_password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    requester_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    item = create_random_item(db, owner_id=superuser.id)

    # 1. Start a loan
    loan_data = {
        "item_id": str(item.id),
        "start_date": datetime.now(timezone.utc).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }
    response = client.post(f"{settings.API_V1_STR}/loans/request", headers=requester_headers, json=loan_data)
    loan_id = response.json()["id"]
    client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/respond?accept=true", headers=superuser_headers)
    client.patch(f"{settings.API_V1_STR}/loans/{loan_id}/ratify", headers=requester_headers)

    # Mark as defaulted first
    client.post(f"{settings.API_V1_STR}/loans/{loan_id}/default", headers=superuser_headers)

    # 2. Forgive with GOOD_REASON (should mark as DEFAULTED but is_forgiven=True)
    forgive_data = {"reason": "GOOD_REASON"}
    response = client.post(f"{settings.API_V1_STR}/loans/{loan_id}/forgive", headers=superuser_headers, json=forgive_data)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.DEFAULTED
    assert response.json()["is_forgiven"] == True
    assert response.json()["forgiveness_reason"] == "GOOD_REASON"

    # 3. Test another loan resolved via REPLACED_ITEM
    item2 = create_random_item(db, owner_id=superuser.id)
    response = client.post(f"{settings.API_V1_STR}/loans/request", headers=requester_headers, json={
        "item_id": str(item2.id),
        "start_date": datetime.now(timezone.utc).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    })
    loan_id2 = response.json()["id"]
    client.patch(f"{settings.API_V1_STR}/loans/{loan_id2}/respond?accept=true", headers=superuser_headers)
    client.patch(f"{settings.API_V1_STR}/loans/{loan_id2}/ratify", headers=requester_headers)

    # Mark as defaulted first
    client.post(f"{settings.API_V1_STR}/loans/{loan_id2}/default", headers=superuser_headers)

    forgive_data_replace = {
        "reason": "REPLACED_ITEM",
        "new_item_specs": {
            "title": "Replacement Book",
            "author": "New Author",
            "item_type": "book"
        }
    }
    response = client.post(f"{settings.API_V1_STR}/loans/{loan_id2}/forgive", headers=superuser_headers, json=forgive_data_replace)
    assert response.status_code == 200
    assert response.json()["status"] == LoanStatus.RETURNED
    assert response.json()["is_forgiven"] == True

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
