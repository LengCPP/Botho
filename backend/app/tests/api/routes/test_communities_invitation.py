import random
import string
import uuid
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    CommunityCreate, 
    CommunityMemberRole, 
    CommunityMemberStatus, 
    UserCreate,
    Friendship,
    FriendshipStatus,
    CommunityMember
)

def random_lower_string() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=32))

def random_email() -> str:
    return f"{random_lower_string()}@{random_lower_string()}.com"

def get_user_headers(client: TestClient, db: Session, email: str, password: str) -> dict[str, str]:
    login_data = {"username": email, "password": password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

def create_verified_user(db: Session) -> tuple[str, str, uuid.UUID]:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user.is_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return email, password, user.id

def test_community_invitation_staff_flow(client: TestClient, db: Session) -> None:
    """
    Test that an invitation from an Admin/Moderator allows immediate joining.
    """
    # 1. Create Admin
    admin_email, admin_pass, admin_id = create_verified_user(db)
    admin_headers = get_user_headers(client, db, admin_email, admin_pass)

    # 2. Create Community
    comm_in = CommunityCreate(name="Staff Community", description="Test staff flow")
    response = client.post(f"{settings.API_V1_STR}/communities/", headers=admin_headers, json=comm_in.model_dump())
    community_id = uuid.UUID(response.json()["id"])

    # 3. Create Invitee
    invitee_email, invitee_pass, invitee_id = create_verified_user(db)
    invitee_headers = get_user_headers(client, db, invitee_email, invitee_pass)

    # 4. Establish Friendship (required for inviting)
    friendship = Friendship(user_id=admin_id, friend_id=invitee_id, status=FriendshipStatus.ACCEPTED)
    db.add(friendship)
    db.commit()

    # 5. Staff invites User
    client.post(
        f"{settings.API_V1_STR}/communities/{community_id}/invite", 
        headers=admin_headers, 
        json={"friend_id": str(invitee_id)}
    )

    # 6. User accepts invitation (Joins)
    response = client.post(f"{settings.API_V1_STR}/communities/{community_id}/join", headers=invitee_headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Joined successfully via invitation"

    # 7. Verify membership status is ACCEPTED
    membership = db.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == invitee_id
        )
    ).first()
    assert membership.status == CommunityMemberStatus.ACCEPTED
    assert membership.role == CommunityMemberRole.MEMBER

def test_community_invitation_member_referral_flow(client: TestClient, db: Session) -> None:
    """
    Test that an invitation from a regular member becomes a PENDING application (referral).
    """
    # 1. Create Admin and Community
    admin_email, admin_pass, admin_id = create_verified_user(db)
    admin_headers = get_user_headers(client, db, admin_email, admin_pass)
    comm_in = CommunityCreate(name="Member Community", description="Test referral flow")
    response = client.post(f"{settings.API_V1_STR}/communities/", headers=admin_headers, json=comm_in.model_dump())
    community_id = uuid.UUID(response.json()["id"])

    # 2. Create Member and Join
    member_email, member_pass, member_id = create_verified_user(db)
    member_headers = get_user_headers(client, db, member_email, member_pass)
    client.post(f"{settings.API_V1_STR}/communities/{community_id}/join", headers=member_headers)
    
    # 3. Create Invitee
    invitee_email, invitee_pass, invitee_id = create_verified_user(db)
    invitee_headers = get_user_headers(client, db, invitee_email, invitee_pass)

    # 4. Establish Friendship between Member and Invitee
    friendship = Friendship(user_id=member_id, friend_id=invitee_id, status=FriendshipStatus.ACCEPTED)
    db.add(friendship)
    db.commit()

    # 5. Member invites User (Referral)
    client.post(
        f"{settings.API_V1_STR}/communities/{community_id}/invite", 
        headers=member_headers, 
        json={"friend_id": str(invitee_id)}
    )

    # 6. User accepts invitation (Should become PENDING)
    response = client.post(f"{settings.API_V1_STR}/communities/{community_id}/join", headers=invitee_headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Application sent via referral"

    # 7. Verify membership status is PENDING
    membership = db.exec(
        select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == invitee_id
        )
    ).first()
    assert membership.status == CommunityMemberStatus.PENDING
    assert membership.role == CommunityMemberRole.APPLICANT
