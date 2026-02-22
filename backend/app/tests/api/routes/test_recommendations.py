from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import (
    Community,
    CommunityInterest,
    CommunityMember,
    CommunityMemberRole,
    CommunityMemberStatus,
    Friendship,
    FriendshipStatus,
    Interest,
    InterestSignal,
    Item,
    ItemReview,
    ItemType,
    Loan,
    LoanStatus,
    ReadingLog,
    ReadingLogStatus,
    UserCreate,
    UserInterest,
    WorkMetadata,
)


def get_superuser_token_headers(client: TestClient) -> dict[str, str]:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    return {"Authorization": f"Bearer {a_token}"}


def _ensure_superuser(db: Session):
    user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)
    if not user:
        user = crud.create_user(
            session=db,
            user_create=UserCreate(
                email=settings.FIRST_SUPERUSER,
                password=settings.FIRST_SUPERUSER_PASSWORD,
                is_superuser=True,
            ),
        )
    if not user.is_verified:
        user.is_verified = True
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _add_friend(db: Session, user, email="friend@example.com"):
    friend = crud.get_user_by_email(session=db, email=email)
    if not friend:
        friend = crud.create_user(
            session=db, user_create=UserCreate(email=email, password="Password123!")
        )
    existing = db.get(Friendship, (user.id, friend.id)) or db.get(Friendship, (friend.id, user.id))
    if not existing:
        db.add(Friendship(user_id=user.id, friend_id=friend.id, status=FriendshipStatus.ACCEPTED))
        db.commit()
    return friend


def _mock_search_empty():
    mock_client = MagicMock()
    mock_index = MagicMock()
    mock_client.index.return_value = mock_index
    mock_index.search.return_value = {"hits": [], "estimatedTotalHits": 0}
    return mock_client, mock_index


# ── Test 1: Core signals (loans, ratings, user interests) ─────────────────────

def test_recommendations_query_construction(client: TestClient, db: Session) -> None:
    user = _ensure_superuser(db)
    _add_friend(db, user)

    interest = Interest(name="History")
    db.add(interest)
    db.commit()
    db.add(UserInterest(user_id=user.id, interest_id=interest.id))

    book_a = Item(title="Dune", author="Frank Herbert", owner_id=user.id, item_type=ItemType.book)
    db.add(book_a)
    db.add(WorkMetadata(author="Frank Herbert", title="Dune", category="SciFi", tags=["Space"]))
    db.add(Loan(
        item_id=book_a.id, requester_id=user.id,
        start_date=datetime.now(), end_date=datetime.now() + timedelta(days=7),
        status=LoanStatus.RETURNED,
    ))

    db.add(WorkMetadata(author="J.R.R. Tolkien", title="The Hobbit", category="Fantasy", tags=["Magic"]))
    db.add(ItemReview(author="J.R.R. Tolkien", title="The Hobbit", user_id=user.id, rating=5, comment="Great!"))

    db.commit()

    mock_client, mock_index = _mock_search_empty()
    with patch("app.search.client", mock_client):
        headers = get_superuser_token_headers(client)
        response = client.get(f"{settings.API_V1_STR}/items/recommendations", headers=headers)

    assert response.status_code == 200
    assert mock_index.search.called
    query_str = mock_index.search.call_args[0][0]

    assert "History" in query_str
    assert "SciFi" in query_str
    assert "Space" in query_str
    assert "Fantasy" in query_str
    assert "Magic" in query_str


# ── Test 2: InterestSignal items appear (×3 weight) ──────────────────────────

def test_recommendations_interest_signal_weighted(client: TestClient, db: Session) -> None:
    user = _ensure_superuser(db)
    _add_friend(db, user)

    # Create an item the user signalled interest in
    signalled_item = Item(
        title="Foundation", author="Isaac Asimov",
        category="SciFi", genre="Space Opera",
        owner_id=user.id, item_type=ItemType.book,
    )
    db.add(signalled_item)
    db.commit()
    db.add(InterestSignal(item_id=signalled_item.id, user_id=user.id))
    db.commit()

    mock_client, mock_index = _mock_search_empty()
    with patch("app.search.client", mock_client):
        headers = get_superuser_token_headers(client)
        response = client.get(f"{settings.API_V1_STR}/items/recommendations", headers=headers)

    assert response.status_code == 200
    query_str = mock_index.search.call_args[0][0]

    # Author should appear 3 times (weight ×3)
    assert query_str.count("Isaac Asimov") == 3
    assert query_str.count("SciFi") == 3
    assert query_str.count("Space Opera") == 2


# ── Test 3: ReadingLog signals ────────────────────────────────────────────────

def test_recommendations_reading_log_signals(client: TestClient, db: Session) -> None:
    user = _ensure_superuser(db)
    _add_friend(db, user)

    db.add(ReadingLog(user_id=user.id, author="Ursula Le Guin", title="The Left Hand of Darkness",
                      status=ReadingLogStatus.COMPLETED))
    db.add(ReadingLog(user_id=user.id, author="Philip K. Dick", title="Do Androids Dream",
                      status=ReadingLogStatus.READING))
    db.commit()

    mock_client, mock_index = _mock_search_empty()
    with patch("app.search.client", mock_client):
        headers = get_superuser_token_headers(client)
        response = client.get(f"{settings.API_V1_STR}/items/recommendations", headers=headers)

    assert response.status_code == 200
    query_str = mock_index.search.call_args[0][0]

    # COMPLETED author appears ×2, READING author appears ×1
    assert query_str.count("Ursula Le Guin") == 2
    assert query_str.count("Philip K. Dick") == 1


# ── Test 4: Dropped author excluded from Meilisearch filter ──────────────────

def test_recommendations_dropped_author_excluded(client: TestClient, db: Session) -> None:
    user = _ensure_superuser(db)
    _add_friend(db, user)

    db.add(ReadingLog(
        user_id=user.id, author="Dan Brown", title="The Da Vinci Code",
        status=ReadingLogStatus.DROPPED,
    ))
    db.commit()

    mock_client, mock_index = _mock_search_empty()
    with patch("app.search.client", mock_client):
        headers = get_superuser_token_headers(client)
        client.get(f"{settings.API_V1_STR}/items/recommendations", headers=headers)

    assert mock_index.search.called
    filters: list = mock_index.search.call_args[0][1]["filter"]
    filter_str = " ".join(filters)
    assert "Dan Brown" in filter_str
    assert "NOT IN" in filter_str


# ── Test 5: Community-interest cold-start fallback ───────────────────────────

def test_recommendations_community_interest_cold_start(client: TestClient, db: Session) -> None:
    """
    A user with no personal signals (no loans, reviews, interests, reading log)
    who belongs to a community should get recommendations based on community interests.
    """
    user = _ensure_superuser(db)

    # Join a community (no friend needed — community membership alone is enough)
    community = Community(name="SciFi Readers Club", created_by=user.id)
    db.add(community)
    db.commit()

    db.add(CommunityMember(
        community_id=community.id, user_id=user.id,
        role=CommunityMemberRole.MEMBER, status=CommunityMemberStatus.ACCEPTED,
    ))

    sci_fi_interest = Interest(name="ScienceFiction")
    db.add(sci_fi_interest)
    db.commit()
    db.add(CommunityInterest(community_id=community.id, interest_id=sci_fi_interest.id))
    db.commit()

    mock_client, mock_index = _mock_search_empty()
    with patch("app.search.client", mock_client):
        headers = get_superuser_token_headers(client)
        response = client.get(f"{settings.API_V1_STR}/items/recommendations", headers=headers)

    assert response.status_code == 200
    query_str = mock_index.search.call_args[0][0]

    # Community interest should appear in the query as cold-start fallback
    assert "ScienceFiction" in query_str


# ── Test 6: No social graph returns empty ─────────────────────────────────────

def test_recommendations_no_social_graph_returns_empty(client: TestClient, db: Session) -> None:
    """Users with no friends and no community memberships get no recommendations."""
    user = _ensure_superuser(db)

    mock_client, mock_index = _mock_search_empty()
    with patch("app.search.client", mock_client):
        headers = get_superuser_token_headers(client)
        response = client.get(f"{settings.API_V1_STR}/items/recommendations", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 0
    assert data["data"] == []
    # Meilisearch should NOT be called — we short-circuit before reaching it
    assert not mock_index.search.called
