import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import EmailStr, field_validator
from sqlalchemy import JSON, Column, DateTime, func
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


class LoanStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    ACTIVE = "ACTIVE"  # Ratified by requester
    EXTENSION_PENDING = "EXTENSION_PENDING" # Requesting more time
    RETURN_PENDING = "RETURN_PENDING" # Requester signaled return
    RETURNED = "RETURNED"
    DEFAULTED = "DEFAULTED" # Marked unrecoverable by lender


class NotificationType(str, Enum):
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"


class ReadingLogStatus(str, Enum):
    READING = "READING"
    COMPLETED = "COMPLETED"
    DROPPED = "DROPPED"


class StagedItemStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ForgivenessReason(str, Enum):
    GOOD_REASON = "GOOD_REASON"  # Borrower has good reason for losing item
    FOUND_AND_RETURNED = "FOUND_AND_RETURNED"  # Found and returned item
    REPLACED_ITEM = "REPLACED_ITEM"  # Borrower replaced item
    OTHER = "OTHER"  # My choice (keeps the count)


class UserRoleReviewed(str, Enum):
    BORROWER = "BORROWER"
    OWNER = "OWNER"


# Link Models


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
    bio: str | None = Field(default=None, max_length=500)
    alias: str | None = Field(default=None, max_length=255)
    image_url: str | None = Field(default=None, max_length=512)


class Notification(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    recipient_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    message: str = Field(max_length=512)
    type: NotificationType = Field(default=NotificationType.INFO)
    is_read: bool = Field(default=False)
    link: str | None = Field(default=None, max_length=512)
    created_at: datetime | None = Field(
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
    created_at: datetime | None = Field(
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
    owner_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="CASCADE")
    community_id: uuid.UUID | None = Field(default=None, foreign_key="community.id", ondelete="CASCADE")
    requester_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    status: LoanStatus = Field(default=LoanStatus.PENDING)
    start_date: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    end_date: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    pending_extension_date: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    returned_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    is_forgiven: bool = Field(default=False)
    forgiveness_reason: ForgivenessReason | None = Field(default=None)
    created_at: datetime | None = Field(
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


class StagedItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    community_id: uuid.UUID | None = Field(default=None, foreign_key="community.id", ondelete="CASCADE", index=True)
    status: StagedItemStatus = Field(default=StagedItemStatus.PENDING)
    raw_data: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    error_log: str | None = Field(default=None, max_length=1000)
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )


# Main Models (Circular references handled by strings)
class Interest(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    category: str | None = None
    users: list["User"] = Relationship(back_populates="interests", link_model=UserInterest)
    communities: list["Community"] = Relationship(back_populates="interests", link_model=CommunityInterest)


class InterestCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=255)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    is_verified: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    public_id: str | None = Field(default=None, unique=True, index=True, max_length=10)

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
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower().strip()
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower().strip()
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=40)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    honor_score: float | None = None
    reliability_rate: float | None = None
    is_delinquent: bool | None = None
    ai_honor_summary: str | None = None
    # ai_improvement_tips: Any = None

    @field_validator("email", mode="before")
    @classmethod
    def validate_email(cls, v: EmailStr | None) -> str | None:
        if isinstance(v, str):
            return v.lower().strip()
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UserProfileUpdate(SQLModel):
    bio: str | None = Field(default=None, max_length=500)
    alias: str | None = Field(default=None, max_length=255)
    interest_ids: list[uuid.UUID] | None = None

    @field_validator("bio", mode="before")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            v = v.strip()
        return v


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    public_id: str | None = Field(default=None, unique=True, index=True, max_length=10)
    hashed_password: str
    has_set_password: bool = Field(default=True)
    honor_score: float = Field(default=100.0)
    reliability_rate: float = Field(default=100.0)
    is_delinquent: bool = Field(default=False)
    ai_honor_summary: str | None = Field(default=None, sa_column=Column(JSON))
    ai_improvement_tips: Any = Field(default=[], sa_column=Column(JSON))
    items: list["Item"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "foreign(Item.owner_id)==User.id",
            "viewonly": True
        }
    )
    communities: list["Community"] = Relationship(
        back_populates="members", link_model=CommunityMember
    )
    settings: dict[str, Any] | None = Field(default={}, sa_column=Column(JSON))
    profile: UserProfile | None = Relationship(
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
    reviews_received: list["UserReview"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "UserReview.reviewee_id"}
    )
    reviews_given: list["UserReview"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "UserReview.reviewer_id"}
    )
    contributions: list["Contribution"] = Relationship(back_populates="user")


class CommunityBase(SQLModel):
    name: str = Field(min_length=1, max_length=255, unique=True, index=True)
    description: str | None = Field(default=None, max_length=255)
    requires_approval: bool = Field(default=False)
    is_private: bool = Field(default=False)


class CommunityCreate(CommunityBase):
    pass


class CommunityUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)
    requires_approval: bool | None = Field(default=None)
    is_private: bool | None = Field(default=None)


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


class CommunityAnnouncement(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    community_id: uuid.UUID = Field(foreign_key="community.id", ondelete="CASCADE")
    author_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    content: str = Field(max_length=5000)
    created_at: datetime | None = Field(
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
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    community: "Community" = Relationship(back_populates="messages")
    author: "User" = Relationship()


class WorkMetadata(SQLModel, table=True):
    author: str = Field(primary_key=True, max_length=255)
    title: str = Field(primary_key=True, max_length=255)
    isbn: str | None = Field(default=None, index=True)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=255)
    image_url: str | None = Field(default=None, max_length=512)
    tags: list[str] = Field(default=[], sa_column=Column(JSON))
    average_rating: float = Field(default=0.0)
    review_count: int = Field(default=0)


class ItemReview(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    author: str = Field(index=True, max_length=255)
    title: str = Field(index=True, max_length=255)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    created_at: datetime | None = Field(
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
    notes: str | None = Field(default=None, max_length=1000)
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    user: "User" = Relationship()


class ItemConditionRatingCreate(SQLModel):
    item_id: uuid.UUID
    grade: int = Field(ge=1, le=10)
    notes: str | None = Field(default=None, max_length=1000)


class ItemConditionRatingPublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    user_id: uuid.UUID
    grade: int
    notes: str | None
    created_at: datetime
    user: "UserPublic"


class ItemBase(SQLModel):
    title: str = Field(min_length=0, max_length=255)
    description: str | None = Field(default=None, max_length=1600)
    author: str | None = Field(default=None, max_length=255)
    item_type: ItemType = Field(default=ItemType.general)
    image_url: str | None = Field(default=None, max_length=512)
    extra_data: dict[str, Any] | None = Field(default={}, sa_column=Column(JSON))
    info: dict[str, Any] | None = Field(default={}, sa_column=Column(JSON)) # physical_description, grade (1-10)


class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(index=True, nullable=False)
    title: str = Field(max_length=255, index=True)
    count: int = Field(default=1)
    created_at: datetime | None = Field(
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
    category: str | None


class UserProfilePublic(SQLModel):
    bio: str | None
    alias: str | None
    image_url: str | None


class CommunityPublic(CommunityBase):
    id: uuid.UUID
    created_by: uuid.UUID
    current_user_role: CommunityMemberRole | None = None
    current_user_status: CommunityMemberStatus | None = None
    notifications_enabled: bool | None = None


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
    model_config = {"arbitrary_types_allowed": True}
    id: uuid.UUID
    public_id: str
    has_set_password: bool = True
    communities: list["CommunityPublic"] = []
    community_role: CommunityMemberRole | None = None
    community_status: CommunityMemberStatus | None = None
    profile: UserProfilePublic | None = None
    settings: UserSettingsSchema | None = None
    interests: list["InterestPublic"] = []
    friendship_status: FriendshipStatus | None = None
    show_contact_details: bool = False
    honor_score: float = 0.0
    reliability_rate: float = 0.0
    is_delinquent: bool = False
    ai_honor_summary: str | None = None
    # ai_improvement_tips: Any = None


class CommunityMemberUpdate(SQLModel):
    role: CommunityMemberRole | None = Field(default=None)
    status: CommunityMemberStatus | None = Field(default=None)
    notifications_enabled: bool | None = Field(default=None)


class FriendshipPublic(SQLModel):
    user_id: uuid.UUID
    friend_id: uuid.UUID
    status: FriendshipStatus


class UsersPublic(SQLModel):
    data: list["UserPublic"]
    count: int


class ItemCreate(ItemBase):
    pass


class BookCreate(ItemCreate):
    pass


class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1600)
    author: str | None = Field(default=None, max_length=255)
    item_type: ItemType | None = None
    image_url: str | None = None
    extra_data: dict[str, Any] | None = None
    info: dict[str, Any] | None = None


class ItemOwnerPublic(SQLModel):
    id: uuid.UUID
    full_name: str | None
    email: str
    is_available: bool = True
    show_contact_details: bool = False


class WorkMetadataPublic(SQLModel):
    author: str
    title: str
    isbn: str | None = None
    description: str | None = None
    category: str | None = None
    image_url: str | None = None
    tags: list[str] = []
    average_rating: float
    review_count: int


class WorkMetadataUpdate(SQLModel):
    tags: list[str] | None = None


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    count: int
    created_at: datetime
    owner: ItemOwnerPublic | None = None
    community_owner: CommunityPublic | None = None
    communities: list["CommunityPublic"] = []
    is_available: bool = True
    added_by_id: uuid.UUID | None = None
    is_donation_pending: bool = False
    work_metadata: WorkMetadataPublic | None = None
    had_possession: bool = False


class BookPublic(ItemPublic):
    pass


class BooksPublic(SQLModel):
    data: list["BookPublic"]
    count: int


class ItemsPublic(SQLModel):
    data: list["ItemPublic"]
    count: int


class StagedItemPublic(SQLModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    community_id: uuid.UUID | None
    status: StagedItemStatus
    raw_data: dict[str, Any]
    error_log: str | None
    created_at: datetime


class StagedItemsPublic(SQLModel):
    data: list[StagedItemPublic]
    count: int
    pending_count: int = 0
    processing_count: int = 0
    completed_count: int = 0
    failed_count: int = 0


class ItemReviewCreate(SQLModel):
    author: str = Field(max_length=255)
    title: str = Field(max_length=255)
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ItemReviewPublic(SQLModel):
    id: uuid.UUID
    author: str
    title: str
    user_id: uuid.UUID
    rating: int
    comment: str | None
    created_at: datetime
    user: "UserPublic"
    vote_score: int = 0
    current_user_vote: int | None = None


class ItemReviewsPublic(SQLModel):
    data: list["ItemReviewPublic"]
    count: int


class LoanCreate(SQLModel):
    item_id: uuid.UUID
    community_id: uuid.UUID | None = None
    start_date: datetime
    end_date: datetime


class ForgivenessRequest(SQLModel):
    reason: ForgivenessReason
    new_item_specs: Optional[dict[str, Any]] = None


class LoanPublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    owner_id: uuid.UUID | None
    community_id: uuid.UUID | None
    requester_id: uuid.UUID
    status: LoanStatus
    start_date: datetime
    end_date: datetime
    pending_extension_date: datetime | None = None
    returned_at: datetime | None = None
    is_forgiven: bool = False
    forgiveness_reason: ForgivenessReason | None = None
    created_at: datetime
    item: "ItemPublic"
    owner: Optional["UserPublic"]
    requester: "UserPublic"
    community: Optional["CommunityPublic"]
    has_review: bool = False
    other_admins_exist: bool = False


class LoansPublic(SQLModel):
    data: list["LoanPublic"]
    count: int


class NotificationPublic(SQLModel):
    id: uuid.UUID
    title: str
    message: str
    type: NotificationType
    is_read: bool
    link: str | None
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
    sub: str | None = None


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
    model_config = {"arbitrary_types_allowed": True}
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


class Contribution(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    item_id: uuid.UUID | None = Field(default=None, foreign_key="item.id", ondelete="SET NULL")
    work_author: str | None = Field(default=None, max_length=255)
    work_title: str | None = Field(default=None, max_length=255)
    description: str = Field(max_length=255)
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    user: "User" = Relationship()








# Reputation Models


class UserReview(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    loan_id: uuid.UUID = Field(foreign_key="loan.id", ondelete="CASCADE")
    reviewer_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    reviewee_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", ondelete="CASCADE")
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    condition_grade: int | None = Field(default=None, ge=1, le=10)
    condition_notes: str | None = Field(default=None, max_length=1000)
    is_disputed: bool = Field(default=False)
    dispute_reason: str | None = Field(default=None, max_length=1000)
    role_reviewed: UserRoleReviewed
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    reviewer: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "UserReview.reviewer_id"}
    )
    reviewee: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "UserReview.reviewee_id"}
    )
    loan: "Loan" = Relationship()


class UserReviewCreate(SQLModel):
    loan_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    condition_grade: int | None = Field(default=None, ge=1, le=10)
    condition_notes: str | None = Field(default=None, max_length=1000)


class UserReviewDisputeCreate(SQLModel):
    reason: str = Field(min_length=10, max_length=1000)


class UserReviewPublic(SQLModel):
    model_config = {"arbitrary_types_allowed": True}
    id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewee_id: uuid.UUID | None = None
    loan_id: uuid.UUID
    rating: int
    comment: str | None
    condition_grade: int | None = None
    condition_notes: str | None = None
    role_reviewed: UserRoleReviewed
    created_at: datetime
    reviewer_name: str | None = None


class UserReputationSchema(SQLModel):
    model_config = {"arbitrary_types_allowed": True}
    honor_score: float
    reliability_rate: float
    is_delinquent: bool
    ai_honor_summary: str | None
    # ai_improvement_tips: Any
    review_count: int


class UserReportCardPublic(SQLModel):
    model_config = {"arbitrary_types_allowed": True}
    user: "UserPublic"
    reviews: list[UserReviewPublic]
    metrics: UserReputationSchema









