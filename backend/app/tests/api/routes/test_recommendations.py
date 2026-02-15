import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import (
    Item,
    ItemReview,
    Loan,
    LoanStatus,
    UserCreate,
    WorkMetadata,
    Interest,
    UserInterest,
    ItemType,
    Friendship,
    FriendshipStatus
)
from datetime import datetime, timedelta

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

def test_recommendations_query_construction(
    client: TestClient, db: Session
) -> None:
    # 1. Setup Data
    
    # Ensure superuser
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
        
    # Add a friend so recommendations don't return early due to empty social graph
    friend_in = UserCreate(
        email="friend@example.com",
        password="password",
    )
    friend = crud.create_user(session=db, user_create=friend_in)
    friendship = Friendship(user_id=user.id, friend_id=friend.id, status=FriendshipStatus.ACCEPTED)
    db.add(friendship)
    db.commit()

    # Add Interest "History"
    interest = Interest(name="History")
    db.add(interest)
    db.commit()
    user_interest = UserInterest(user_id=user.id, interest_id=interest.id)
    db.add(user_interest)
    
    # Create Book A (Borrowed) - Metadata: SciFi, Space
    book_a = Item(
        title="Dune", 
        author="Frank Herbert", 
        owner_id=user.id, 
        item_type=ItemType.book
    )
    db.add(book_a)
    
    meta_a = WorkMetadata(
        author="Frank Herbert", 
        title="Dune", 
        category="SciFi", 
        tags=["Space"]
    )
    db.add(meta_a)
    
    # Create Loan for Book A
    loan = Loan(
        item_id=book_a.id,
        requester_id=user.id,
        start_date=datetime.now(),
        end_date=datetime.now() + timedelta(days=7),
        status=LoanStatus.RETURNED
    )
    db.add(loan)
    
    # Create Book B (Rated) - Metadata: Fantasy, Magic
    # Note: ItemReview is on (author, title), item instance not strictly required for this logic but good for consistency
    meta_b = WorkMetadata(
        author="J.R.R. Tolkien", 
        title="The Hobbit", 
        category="Fantasy", 
        tags=["Magic"]
    )
    db.add(meta_b)
    
    review = ItemReview(
        author="J.R.R. Tolkien",
        title="The Hobbit",
        user_id=user.id,
        rating=5,
        comment="Great!"
    )
    db.add(review)
    
    db.commit()
    
    # 2. Mock Meilisearch
    with patch("app.search.client") as mock_client:
        mock_index = MagicMock()
        mock_client.index.return_value = mock_index
        mock_index.search.return_value = {
            "hits": [], 
            "estimatedTotalHits": 0
        }
        
        # 3. Call Endpoint
        headers = get_superuser_token_headers(client)
        response = client.get(
            f"{settings.API_V1_STR}/items/recommendations",
            headers=headers,
        )
        
        # 4. Verify
        assert response.status_code == 200
        
        # Check search query
        # We expect "History", "SciFi", "Space", "Fantasy", "Magic" in the query string
        # exact order might vary due to sets
        
        assert mock_index.search.called
        call_args = mock_index.search.call_args
        query_str = call_args[0][0]
        
        print(f"Generated Query: {query_str}")
        
        assert "History" in query_str
        assert "SciFi" in query_str
        assert "Space" in query_str
        assert "Fantasy" in query_str
        assert "Magic" in query_str
