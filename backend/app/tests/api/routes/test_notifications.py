from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Notification, NotificationType, UserCreate


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


def setup_superuser(db: Session) -> None:
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


def test_read_notifications(client: TestClient, db: Session) -> None:
    setup_superuser(db)
    headers = get_superuser_token_headers(client)
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    n = Notification(
        recipient_id=user.id,
        title="Test Notification",
        message="This is a test notification",
        type=NotificationType.INFO,
    )
    db.add(n)
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/notifications/",
        headers=headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["count"] >= 1
    assert any(d["title"] == "Test Notification" for d in content["data"])


def test_mark_notification_as_read(client: TestClient, db: Session) -> None:
    setup_superuser(db)
    headers = get_superuser_token_headers(client)
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    n = Notification(
        recipient_id=user.id,
        title="To be read",
        message="Mark me as read",
        type=NotificationType.INFO,
    )
    db.add(n)
    db.commit()
    db.refresh(n)

    response = client.patch(
        f"{settings.API_V1_STR}/notifications/{n.id}/read",
        headers=headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["is_read"] is True


def test_delete_notification(client: TestClient, db: Session) -> None:
    setup_superuser(db)
    headers = get_superuser_token_headers(client)
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    n = Notification(
        recipient_id=user.id,
        title="To be deleted",
        message="Delete me",
        type=NotificationType.INFO,
    )
    db.add(n)
    db.commit()
    db.refresh(n)

    response = client.delete(
        f"{settings.API_V1_STR}/notifications/{n.id}",
        headers=headers,
    )
    assert response.status_code == 200
    assert db.get(Notification, n.id) is None


def test_clear_read_notifications(client: TestClient, db: Session) -> None:
    setup_superuser(db)
    headers = get_superuser_token_headers(client)
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    n1 = Notification(recipient_id=user.id, title="Read", message="msg", is_read=True)
    n2 = Notification(recipient_id=user.id, title="Unread", message="msg", is_read=False)
    db.add(n1)
    db.add(n2)
    db.commit()

    response = client.delete(
        f"{settings.API_V1_STR}/notifications/clear-read",
        headers=headers,
    )
    assert response.status_code == 200
    assert db.get(Notification, n1.id) is None
    assert db.get(Notification, n2.id) is not None


def test_delete_all_notifications(client: TestClient, db: Session) -> None:
    setup_superuser(db)
    headers = get_superuser_token_headers(client)
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)

    n1 = Notification(recipient_id=user.id, title="N1", message="msg")
    n2 = Notification(recipient_id=user.id, title="N2", message="msg")
    db.add(n1)
    db.add(n2)
    db.commit()

    response = client.delete(
        f"{settings.API_V1_STR}/notifications/delete-all",
        headers=headers,
    )
    assert response.status_code == 200
    assert db.get(Notification, n1.id) is None
    assert db.get(Notification, n2.id) is None
