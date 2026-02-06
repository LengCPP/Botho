from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Item, UserCreate


def get_superuser_token_headers(client: TestClient) -> dict[str, str]:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}
    return headers

def get_user_token_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    login_data = {
        "username": email,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}
    return headers

def test_create_item(
    client: TestClient, db: Session
) -> None:
    # Ensure superuser exists
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

    headers = get_superuser_token_headers(client)
    data = {"title": "Foo", "description": "Bar", "item_type": "general"}
    response = client.post(
        f"{settings.API_V1_STR}/items/",
        headers=headers,
        data=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == data["title"]
    assert content["description"] == data["description"]
    assert "id" in content
    assert "created_at" in content
    assert content["owner_id"] == str(user.id)

def test_read_item(
    client: TestClient, db: Session
) -> None:
    # Ensure superuser exists
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

    item = Item(title="Test Item", description="Test Description", owner_id=user.id)
    db.add(item)
    db.commit()
    db.refresh(item)

    headers = get_superuser_token_headers(client)
    response = client.get(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == item.title
    assert content["description"] == item.description
    assert content["id"] == str(item.id)
    assert content["owner_id"] == str(user.id)

def test_ownership_enforcement(
    client: TestClient, db: Session
) -> None:
    # Create User A
    email_a = "user_a@example.com"
    password_a = "password123"
    user_a = crud.get_user_by_email(session=db, email=email_a)
    if not user_a:
        user_a = crud.create_user(session=db, user_create=UserCreate(email=email_a, password=password_a))

    if not user_a.is_verified:
        user_a.is_verified = True
        db.add(user_a)
        db.commit()
        db.refresh(user_a)

    # Create User B
    email_b = "user_b@example.com"
    password_b = "password123"
    user_b = crud.get_user_by_email(session=db, email=email_b)
    if not user_b:
        user_b = crud.create_user(session=db, user_create=UserCreate(email=email_b, password=password_b))

    if not user_b.is_verified:
        user_b.is_verified = True
        db.add(user_b)
        db.commit()
        db.refresh(user_b)

    # User A creates an item
    item_a = Item(title="User A Item", owner_id=user_a.id)
    db.add(item_a)
    db.commit()
    db.refresh(item_a)

    # User B tries to read User A's item (not friends)
    headers_b = get_user_token_headers(client, email_b, password_b)
    response = client.get(
        f"{settings.API_V1_STR}/items/{item_a.id}",
        headers=headers_b,
    )
    assert response.status_code == 403 # Forbidden

    # User B tries to delete User A's item
    response = client.delete(
        f"{settings.API_V1_STR}/items/{item_a.id}",
        headers=headers_b,
    )
    assert response.status_code == 403

    # User B reads items list (should not see User A's item)
    response = client.get(
        f"{settings.API_V1_STR}/items/",
        headers=headers_b,
    )
    assert response.status_code == 200
    data = response.json()
    item_ids = [item["id"] for item in data["data"]]
    assert str(item_a.id) not in item_ids
