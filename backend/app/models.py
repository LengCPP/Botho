from datetime import datetime, timezone
from enum import Enum
import uuid
from typing import Optional

from pydantic import EmailStr, field_validator
from sqlalchemy import Column, JSON, DateTime, func, and_
from sqlalchemy.orm import foreign
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


# Enums


class CommunityMemberRole(str, Enum):
    ADMIN = "ADMIN"
    MODERATOR = "MODERATOR"
    MEMBER = "MEMBER"
    APPLICANT = "APPLICANT"


class CommunityMemberStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    BANNED = "BANNED"
    SUSPENDED = "SUSPENDED"


class FriendshipStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"


class ItemType(str, Enum):
    general = "general"
    book = "book"


class CollectionType(str, Enum):
    GENERAL = "GENERAL"
    LIBRARY = "LIBRARY"


class LoanStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    ACTIVE = "ACTIVE"  # Ratified by requester
    RETURN_PENDING = "RETURN_PENDING" # Requester signaled return
    RETURNED = "RETURNED"


class NotificationType(str, Enum):
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"


class ReadingLogStatus(str, Enum):
    READING = "READING"
    COMPLETED = "COMPLETED"
    DROPPED = "DROPPED"


# Link Models
class CollectionItem(SQLModel, table=True):
    collection_id: uuid.UUID = Field(
        foreign_key="collection.id", primary_key=True, ondelete="CASCADE"
    )
    item_id: uuid.UUID = Field(
        foreign_key="item.id", primary_key=True, ondelete="CASCADE"
    )


class CommunityItem(SQLModel, table=True):
    community_id: uuid.UUID = Field(
        foreign_key="community.id", primary_key=True, ondelete="CASCADE"
    )
    item_id: uuid.UUID = Field(
        foreign_key="item.id", primary_key=True, ondelete="CASCADE"
    )
    added_by: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    is_donation_pending: bool = Field(default=False)


class CommunityMember(SQLModel, table=True):
    community_id: uuid.UUID = Field(
        foreign_key="community.id", primary_key=True, ondelete="CASCADE"
    )
    user_id: uuid.UUID = Field(
        foreign_key="user.id", primary_key=True, ondelete="CASCADE"
    )
    role: CommunityMemberRole = Field(default=CommunityMemberRole.MEMBER)
    status: CommunityMemberStatus = Field(default=CommunityMemberStatus.ACCEPTED)
    notifications_enabled: bool = Field(default=True)


class Friendship(SQLModel, table=True):
    user_id: uuid.UUID = Field(
        foreign_key="user.id", primary_key=True, ondelete="CASCADE"
    )
    friend_id: uuid.UUID = Field(
        foreign_key="user.id", primary_key=True, ondelete="CASCADE"
    )
    status: FriendshipStatus = Field(default=FriendshipStatus.PENDING)


class UserInterest(SQLModel, table=True):
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True, ondelete="CASCADE")
    interest_id: uuid.UUID = Field(foreign_key="interest.id", primary_key=True, ondelete="CASCADE")


class CommunityInterest(SQLModel, table=True):
    community_id: uuid.UUID = Field(foreign_key="community.id", primary_key=True, ondelete="CASCADE")
    interest_id: uuid.UUID = Field(foreign_key="interest.id", primary_key=True, ondelete="CASCADE")


# Support Models
class UserSettingsSchema(SQLModel):
    autocomplete_enabled: bool = Field(default=True)
    theme_mode: str = Field(default="system")
    show_contact_details: bool = Field(default=False)
    show_full_name: bool = Field(default=False)

    @field_validator("theme_mode")
    @classmethod
    def validate_theme_mode(cls, v: str) -> str:
        if v not in ["light", "dark", "system"]:
            raise ValueError("theme_mode must be one of 'light', 'dark', 'system'")
        return v


class UserProfile(SQLModel, table=True):
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True, ondelete="CASCADE")
    bio: Optional[str] = Field(default=None, max_length=500)
    alias: Optional[str] = Field(default=None, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=512)


class Notification(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    recipient_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    message: str = Field(max_length=512)
    type: NotificationType = Field(default=NotificationType.INFO)
    is_read: bool = Field(default=False)
    link: Optional[str] = Field(default=None, max_length=512)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    recipient: "User" = Relationship(back_populates="notifications")


class PushSubscription(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    endpoint: str = Field(unique=True, index=True)
    p256dh: str
    auth: str
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    user: "User" = Relationship(back_populates="push_subscriptions")


class PushSubscriptionCreate(SQLModel):
    endpoint: str
    p256dh: str
    auth: str


class Loan(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE")
    owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", ondelete="CASCADE")
    community_id: Optional[uuid.UUID] = Field(default=None, foreign_key="community.id", ondelete="CASCADE")
    requester_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    status: LoanStatus = Field(default=LoanStatus.PENDING)
    start_date: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    end_date: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    pending_extension_date: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    item: "Item" = Relationship(back_populates="loans")
    owner: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Loan.owner_id", "back_populates": "loans_out"}
    )
    requester: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Loan.requester_id", "back_populates": "loans_in"}
    )
    community: "Community" = Relationship(back_populates="loans")


# Main Models (Circular references handled by strings)
class Interest(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    category: Optional[str] = None
    users: list["User"] = Relationship(back_populates="interests", link_model=UserInterest)
    communities: list["Community"] = Relationship(back_populates="interests", link_model=CommunityInterest)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    is_verified: bool = False
    full_name: Optional[str] = Field(default=None, max_length=255)
    public_id: Optional[str] = Field(default=None, unique=True, index=True, max_length=10)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower().strip()
        return v


# Properties to receive via API on creation
class UserCreate(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    is_active: bool = True
    is_superuser: bool = False
    full_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower().strip()
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower().strip()
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=40)
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    full_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            return v.lower().strip()
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v


class UserUpdateMe(SQLModel):
    full_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = Field(default=None, max_length=255)


class UserProfileUpdate(SQLModel):
    bio: Optional[str] = Field(default=None, max_length=500)
    alias: Optional[str] = Field(default=None, max_length=255)
    interest_ids: Optional[list[uuid.UUID]] = None

    @field_validator("bio", mode="before")
    @classmethod
    def validate_bio(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
        return v


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    public_id: Optional[str] = Field(default=None, unique=True, index=True, max_length=10)
    hashed_password: str
    has_set_password: bool = Field(default=True)
    items: list["Item"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "foreign(Item.owner_id)==User.id",
            "viewonly": True
        }
    )
    collections: list["Collection"] = Relationship(back_populates="owner")
    communities: list["Community"] = Relationship(
        back_populates="members", link_model=CommunityMember
    )
    settings: Optional[dict] = Field(default={}, sa_column=Column(JSON))
    profile: Optional[UserProfile] = Relationship(
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"}
    )
    interests: list["Interest"] = Relationship(back_populates="users", link_model=UserInterest)
    notifications: list["Notification"] = Relationship(back_populates="recipient", cascade_delete=True)
    push_subscriptions: list["PushSubscription"] = Relationship(back_populates="user", cascade_delete=True)
    loans_out: list["Loan"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={"foreign_keys": "Loan.owner_id"}
    )
    loans_in: list["Loan"] = Relationship(
        back_populates="requester",
        sa_relationship_kwargs={"foreign_keys": "Loan.requester_id"}
    )


class CommunityBase(SQLModel):
    name: str = Field(min_length=1, max_length=255, unique=True, index=True)
    description: Optional[str] = Field(default=None, max_length=255)
    requires_approval: bool = Field(default=False)
    is_private: bool = Field(default=False)


class CommunityCreate(CommunityBase):
    pass


class CommunityUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)
    requires_approval: Optional[bool] = Field(default=None)
    is_private: Optional[bool] = Field(default=None)


class Community(CommunityBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_by: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    members: list["User"] = Relationship(
        back_populates="communities", link_model=CommunityMember
    )
    interests: list["Interest"] = Relationship(back_populates="communities", link_model=CommunityInterest)
    announcements: list["CommunityAnnouncement"] = Relationship(
        back_populates="community", cascade_delete=True
    )
    messages: list["CommunityMessage"] = Relationship(
        back_populates="community", cascade_delete=True
    )
    items: list["Item"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "foreign(Item.owner_id)==Community.id",
            "viewonly": True
        }
    )
    loans: list["Loan"] = Relationship(back_populates="community")
    collections: list["Collection"] = Relationship(back_populates="community")


class CommunityAnnouncement(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    community_id: uuid.UUID = Field(foreign_key="community.id", ondelete="CASCADE")
    author_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    content: str = Field(max_length=5000)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    community: "Community" = Relationship(back_populates="announcements")
    author: "User" = Relationship()


class CommunityMessage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    community_id: uuid.UUID = Field(foreign_key="community.id", ondelete="CASCADE")
    author_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    content: str = Field(max_length=2000)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    community: "Community" = Relationship(back_populates="messages")
    author: "User" = Relationship()


class CollectionBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=512)
    collection_type: CollectionType = Field(default=CollectionType.GENERAL)


class Collection(CollectionBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", ondelete="CASCADE")
    community_id: Optional[uuid.UUID] = Field(default=None, foreign_key="community.id", ondelete="CASCADE")
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    items: list["Item"] = Relationship(link_model=CollectionItem)
    owner: Optional["User"] = Relationship(back_populates="collections")
    community: Optional["Community"] = Relationship(back_populates="collections")


class WorkMetadata(SQLModel, table=True):
    author: str = Field(primary_key=True, max_length=255)
    title: str = Field(primary_key=True, max_length=255)
    isbn: Optional[str] = Field(default=None, index=True)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=512)
    tags: list[str] = Field(default=[], sa_column=Column(JSONB))
    average_rating: float = Field(default=0.0)
    review_count: int = Field(default=0)


class ItemReview(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    author: str = Field(index=True, max_length=255)
    title: str = Field(index=True, max_length=255)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    user: "User" = Relationship()
    vote_score: int = Field(default=0)


class ItemReviewVote(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    review_id: uuid.UUID = Field(foreign_key="itemreview.id", ondelete="CASCADE", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    vote: int = Field(default=0) # 1 or -1



class ItemConditionRating(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(foreign_key="item.id", ondelete="CASCADE", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    grade: int = Field(ge=1, le=10)
    notes: Optional[str] = Field(default=None, max_length=1000)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    user: "User" = Relationship()


class ItemConditionRatingCreate(SQLModel):
    item_id: uuid.UUID
    grade: int = Field(ge=1, le=10)
    notes: Optional[str] = Field(default=None, max_length=1000)


class ItemConditionRatingPublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    user_id: uuid.UUID
    grade: int
    notes: Optional[str]
    created_at: datetime
    user: "UserPublic"


class ItemBase(SQLModel):
    title: str = Field(min_length=0, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1600)
    author: Optional[str] = Field(default=None, max_length=255)
    item_type: ItemType = Field(default=ItemType.general)
    image_url: Optional[str] = Field(default=None, max_length=512)
    extra_data: Optional[dict] = Field(default={}, sa_column=Column(JSON))
    info: Optional[dict] = Field(default={}, sa_column=Column(JSON)) # physical_description, grade (1-10)


class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(index=True, nullable=False)
    title: str = Field(max_length=255, index=True)
    count: int = Field(default=1)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    user_owner: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "foreign(Item.owner_id)==User.id",
            "viewonly": True
        }
    )
    community_owner: Optional["Community"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "foreign(Item.owner_id)==Community.id",
            "viewonly": True
        }
    )
    communities: list["Community"] = Relationship(back_populates="items", link_model=CommunityItem)
    loans: list["Loan"] = Relationship(back_populates="item")


# API Models (Public)
class InterestPublic(SQLModel):
    id: uuid.UUID
    name: str
    category: Optional[str]


class UserProfilePublic(SQLModel):
    bio: Optional[str]
    alias: Optional[str]
    image_url: Optional[str]


class CommunityPublic(CommunityBase):
    id: uuid.UUID
    created_by: uuid.UUID
    current_user_role: Optional[CommunityMemberRole] = None
    current_user_status: Optional[CommunityMemberStatus] = None
    notifications_enabled: Optional[bool] = None


class CommunityAnnouncementBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=5000)


class CommunityAnnouncementCreate(CommunityAnnouncementBase):
    pass


class CommunityAnnouncementPublic(CommunityAnnouncementBase):
    id: uuid.UUID
    community_id: uuid.UUID
    author_id: uuid.UUID
    created_at: datetime
    author: "UserPublic"


class CommunityAnnouncementsPublic(SQLModel):
    data: list["CommunityAnnouncementPublic"]
    count: int


class CommunityMessageBase(SQLModel):
    content: str = Field(min_length=1, max_length=2000)


class CommunityMessageCreate(CommunityMessageBase):
    pass


class CommunityMessagePublic(CommunityMessageBase):
    id: uuid.UUID
    community_id: uuid.UUID
    author_id: uuid.UUID
    created_at: datetime
    author: "UserPublic"


class CommunityMessagesPublic(SQLModel):
    data: list["CommunityMessagePublic"]
    count: int


class CommunitiesPublic(SQLModel):
    data: list["CommunityPublic"]
    count: int


class UserPublic(UserBase):
    id: uuid.UUID
    public_id: str
    has_set_password: bool = True
    communities: list["CommunityPublic"] = []
    community_role: Optional[CommunityMemberRole] = None
    community_status: Optional[CommunityMemberStatus] = None
    profile: Optional[UserProfilePublic] = None
    settings: Optional[UserSettingsSchema] = None
    interests: list["InterestPublic"] = []
    friendship_status: Optional[FriendshipStatus] = None
    show_contact_details: bool = False


class CommunityMemberUpdate(SQLModel):
    role: Optional[CommunityMemberRole] = Field(default=None)
    status: Optional[CommunityMemberStatus] = Field(default=None)
    notifications_enabled: Optional[bool] = Field(default=None)


class FriendshipPublic(SQLModel):
    user_id: uuid.UUID
    friend_id: uuid.UUID
    status: FriendshipStatus


class UsersPublic(SQLModel):
    data: list["UserPublic"]
    count: int


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(SQLModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=512)
    collection_type: Optional[CollectionType] = None


class CollectionPublic(CollectionBase):
    id: uuid.UUID
    owner_id: Optional[uuid.UUID] = None
    community_id: Optional[uuid.UUID] = None
    items: list["ItemPublic"] = []


class CollectionsPublic(SQLModel):
    data: list["CollectionPublic"]
    count: int


class ItemCreate(ItemBase):
    pass


class BookCreate(ItemCreate):
    pass


class ItemUpdate(SQLModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1600)
    author: Optional[str] = Field(default=None, max_length=255)
    item_type: Optional[ItemType] = None
    image_url: Optional[str] = None
    extra_data: Optional[dict] = None
    info: Optional[dict] = None


class ItemOwnerPublic(SQLModel):
    id: uuid.UUID
    full_name: Optional[str]
    email: str
    is_available: bool = True
    show_contact_details: bool = False


class WorkMetadataPublic(SQLModel):
    author: str
    title: str
    isbn: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    tags: list[str] = []
    average_rating: float
    review_count: int


class WorkMetadataUpdate(SQLModel):
    tags: Optional[list[str]] = None


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    count: int
    created_at: datetime
    owner: Optional[ItemOwnerPublic] = None
    community_owner: Optional[CommunityPublic] = None
    communities: list["CommunityPublic"] = []
    collection_id: Optional[uuid.UUID] = None
    is_available: bool = True
    added_by_id: Optional[uuid.UUID] = None
    is_donation_pending: bool = False
    work_metadata: Optional[WorkMetadataPublic] = None
    had_possession: bool = False


class BookPublic(ItemPublic):
    pass


class BooksPublic(SQLModel):
    data: list["BookPublic"]
    count: int


class ItemsPublic(SQLModel):
    data: list["ItemPublic"]
    count: int


class ItemReviewCreate(SQLModel):
    author: str = Field(max_length=255)
    title: str = Field(max_length=255)
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)


class ItemReviewPublic(SQLModel):
    id: uuid.UUID
    author: str
    title: str
    user_id: uuid.UUID
    rating: int
    comment: Optional[str]
    created_at: datetime
    user: "UserPublic"
    vote_score: int = 0
    current_user_vote: Optional[int] = None


class ItemReviewsPublic(SQLModel):
    data: list["ItemReviewPublic"]
    count: int


class LoanCreate(SQLModel):
    item_id: uuid.UUID
    community_id: Optional[uuid.UUID] = None
    start_date: datetime
    end_date: datetime


class LoanPublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    owner_id: Optional[uuid.UUID]
    community_id: Optional[uuid.UUID]
    requester_id: uuid.UUID
    status: LoanStatus
    start_date: datetime
    end_date: datetime
    created_at: datetime
    item: "ItemPublic"
    owner: Optional["UserPublic"]
    requester: "UserPublic"
    community: Optional["CommunityPublic"]


class LoansPublic(SQLModel):
    data: list["LoanPublic"]
    count: int


class NotificationPublic(SQLModel):
    id: uuid.UUID
    title: str
    message: str
    type: NotificationType
    is_read: bool
    link: Optional[str]
    created_at: datetime


class NotificationsPublic(SQLModel):
    data: list["NotificationPublic"]
    count: int
    unread_count: int


class SearchResults(SQLModel):
    users: list["UserPublic"]
    items: list["ItemPublic"]
    communities: list["CommunityPublic"]


class Message(SQLModel):
    message: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    sub: Optional[str] = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)

class ReadingLog(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    author: str = Field(index=True, max_length=255)
    title: str = Field(index=True, max_length=255)
    status: ReadingLogStatus = Field(default=ReadingLogStatus.READING, index=True)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )
    
    user: "User" = Relationship()


class ReadingLogCreate(SQLModel):
    author: str = Field(max_length=255)
    title: str = Field(max_length=255)
    status: ReadingLogStatus


class ReadingLogUpdate(SQLModel):
    status: ReadingLogStatus


class ReadingLogPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    author: str
    title: str
    status: ReadingLogStatus
    created_at: datetime
    updated_at: datetime
    work_metadata: Optional["WorkMetadataPublic"] = None


class ReadingLogsPublic(SQLModel):
    data: list["ReadingLogPublic"]
    count: int
