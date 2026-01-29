import uuid
import json
from typing import Any, Annotated

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlmodel import func, select, col, or_

from app.api.deps import CurrentUser, SessionDep
from app.api.utils import filter_owner_privacy
from app.storage import upload_image, delete_image, upload_image_from_url
from app.search import sync_item_to_search, delete_item_from_search
from app.models import (
    Item,
    ItemPublic,
    ItemsPublic,
    ItemType,
    Message,
    Friendship,
    FriendshipStatus,
    Loan,
    LoanStatus,
    CommunityMember,
    CommunityMemberStatus,
    CommunityMemberRole,
    CommunityItem,
)

router = APIRouter(prefix="/items", tags=["items"])


def check_item_availability(session: SessionDep, item_id: uuid.UUID) -> bool:
    """
    Check if an item is available (not currently loaned out).
    """
    active_loan = session.exec(
        select(Loan).where(
            Loan.item_id == item_id,
            Loan.status.in_([LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.ACCEPTED, LoanStatus.RETURN_PENDING])
        )
    ).first()
    return active_loan is None


@router.get("/", response_model=ItemsPublic)
def read_items(
    session: SessionDep, 
    current_user: CurrentUser, 
    skip: int = 0, 
    limit: int = 100,
    owner_id: uuid.UUID | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    exclude_collections: bool = False,
    category: str | None = None,
    genre: str | None = None
) -> Any:
    """
    Retrieve items. Filters by current user's owner_id by default.
    """
    
    # Permission check and target owner selection
    if owner_id and owner_id != current_user.id:
        # Check if it's a community owner_id
        is_community = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        
        if not is_community:
            # Check if friend
            is_friend = session.exec(
                select(Friendship).where(
                    ((Friendship.user_id == current_user.id) & (Friendship.friend_id == owner_id)) |
                    ((Friendship.user_id == owner_id) & (Friendship.friend_id == current_user.id)),
                    Friendship.status == FriendshipStatus.ACCEPTED
                )
            ).first()
            if not is_friend and not current_user.is_superuser:
                raise HTTPException(status_code=403, detail="Not enough permissions to view this user's items")
        target_owner_id = owner_id
    else:
        target_owner_id = current_user.id

    # Filter items by owner_id
    statement = select(Item).where(Item.owner_id == target_owner_id)

    if category:
        statement = statement.where(
            func.json_extract_path_text(Item.extra_data, 'category') == category
        )
    
    if genre:
        statement = statement.where(
            func.json_extract_path_text(Item.extra_data, 'genre') == genre
        )

    if exclude_collections:
        from app.models import CollectionItem
        # Exclude items that are in any collection
        statement = statement.where(
            Item.id.not_in(select(CollectionItem.item_id))
        )

    # Count total
    count_stmt = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_stmt).one()

    # Apply sorting
    sort_column = Item.created_at
    if sort_by == "title":
        sort_column = Item.title
        
    if sort_order == "desc":
        statement = statement.order_by(sort_column.desc())
    else:
        statement = statement.order_by(sort_column.asc())

    items = session.exec(statement.offset(skip).limit(limit)).all()
    
    public_items = []
    for item in items:
        is_avail = check_item_availability(session, item.id)
        
        owner_pub = None
        community_pub = None
        
        if item.user_owner:
            owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        elif item.community_owner:
            community_pub = item.community_owner
        
        item_pub = ItemPublic(
            id=item.id,
            owner_id=item.owner_id,
            title=item.title,
            description=item.description,
            author=item.author,
            item_type=item.item_type,
            image_url=item.image_url,
            extra_data=item.extra_data,
            count=item.count,
            created_at=item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail
        )
        public_items.append(item_pub)

    return ItemsPublic(data=public_items, count=count)


@router.get("/{id}", response_model=ItemPublic)
def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get item by ID.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    # Permission check
    if item.owner_id != current_user.id and not current_user.is_superuser:
        if item.user_owner:
            is_friend = session.exec(
                select(Friendship).where(
                    ((Friendship.user_id == current_user.id) & (Friendship.friend_id == item.owner_id)) |
                    ((Friendship.user_id == item.owner_id) & (Friendship.friend_id == current_user.id)),
                    Friendship.status == FriendshipStatus.ACCEPTED
                )
            ).first()
            if not is_friend:
                 raise HTTPException(status_code=403, detail="Not enough permissions (Not a friend of owner)")
        elif item.community_owner: # Community item
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()
            if not is_member:
                raise HTTPException(status_code=403, detail="Not enough permissions (Not a member of owning community)")

    is_avail = check_item_availability(session, item.id)
    
    owner_pub = None
    community_pub = None
    if item.user_owner:
        owner_pub = filter_owner_privacy(item.user_owner, current_user.id, is_admin=current_user.is_superuser)
        owner_pub.is_available = is_avail
    elif item.community_owner:
        community_pub = item.community_owner
    
    item_pub = ItemPublic(
        id=item.id,
        owner_id=item.owner_id,
        title=item.title,
        description=item.description,
        author=item.author,
        item_type=item.item_type,
        image_url=item.image_url,
        extra_data=item.extra_data,
        count=item.count,
        created_at=item.created_at,
        owner=owner_pub,
        community_owner=community_pub,
        is_available=is_avail
    )
    return item_pub


@router.post("/", response_model=ItemPublic)
def create_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    title: Annotated[str, Form()],
    description: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
    item_type: Annotated[ItemType, Form()] = ItemType.general,
    extra_data: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
    community_owner_id: Annotated[uuid.UUID | None, Form()] = None,
) -> Any:
    """
    Create a new item. Associates with current user or community as owner.
    """
    try:
        parsed_extra = {}
        if extra_data:
            try:
                parsed_extra = json.loads(extra_data)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in extra_data")

        # Auto-extract author if not provided but in extra_data (e.g. from Google Books)
        final_author = author
        if not final_author and parsed_extra:
            final_author = parsed_extra.get("author") or parsed_extra.get("authors")
            if isinstance(final_author, list):
                final_author = ", ".join(final_author)

        # Handle image upload
        final_image_url = image_url
        if image:
            try:
                final_image_url = upload_image(image.file.read(), image.filename, folder="items")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")
        elif image_url and image_url.startswith("http"):
            # Download and store external image (e.g. from Google Books)
            try:
                stored_url = upload_image_from_url(image_url, folder="items")
                if stored_url:
                    final_image_url = stored_url
            except Exception as e:
                pass

        # Determine owner
        target_owner_id = current_user.id
        should_pool = False

        if community_owner_id:
            # Check if user is admin of this community
            statement = select(CommunityMember).where(
                CommunityMember.community_id == community_owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
            is_admin = session.exec(statement).first() or current_user.is_superuser
            
            if is_admin:
                target_owner_id = community_owner_id
            else:
                target_owner_id = current_user.id
                should_pool = True

        if not target_owner_id:
            raise HTTPException(status_code=400, detail="Owner ID could not be determined")

        db_item = Item(
            title=title,
            description=description,
            author=final_author,
            item_type=item_type,
            extra_data=parsed_extra,
            image_url=final_image_url,
            owner_id=target_owner_id,
        )
        session.add(db_item)
        session.flush()

        if should_pool and community_owner_id:
            statement = select(CommunityMember).where(
                CommunityMember.community_id == community_owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
            if session.exec(statement).first():
                comm_item = CommunityItem(
                    community_id=community_owner_id,
                    item_id=db_item.id,
                    added_by=current_user.id
                )
                session.add(comm_item)

        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)
        
        owner_pub = None
        community_pub = None
        if db_item.user_owner:
            owner_pub = filter_owner_privacy(db_item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = True
        elif db_item.community_owner:
            community_pub = db_item.community_owner
        
        item_pub = ItemPublic(
            id=db_item.id,
            owner_id=db_item.owner_id,
            title=db_item.title,
            description=db_item.description,
            author=db_item.author,
            item_type=db_item.item_type,
            image_url=db_item.image_url,
            extra_data=db_item.extra_data,
            count=db_item.count,
            created_at=db_item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=True
        )
        return item_pub
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred while creating the item: {str(e)}")


@router.patch("/{id}", response_model=ItemPublic)
def update_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    title: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
    item_type: Annotated[ItemType | None, Form()] = None,
    extra_data: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    image_url: Annotated[str | None, Form()] = None,
) -> Any:
    """
    Update an item.
    """
    try:
        db_item = session.get(Item, id)
        if not db_item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        # Permission check
        if db_item.user_owner:
            if db_item.owner_id != current_user.id and not current_user.is_superuser:
                raise HTTPException(status_code=403, detail="Not enough permissions")
        elif db_item.community_owner:
            is_member = session.exec(
                select(CommunityMember).where(
                    CommunityMember.community_id == db_item.owner_id,
                    CommunityMember.user_id == current_user.id,
                    CommunityMember.role == CommunityMemberRole.ADMIN,
                    CommunityMember.status == CommunityMemberStatus.ACCEPTED
                )
            ).first()
            if not is_member and not current_user.is_superuser:
                raise HTTPException(status_code=403, detail="Not enough permissions (Community admin required)")

        if title is not None:
            db_item.title = title
        if description is not None:
            db_item.description = description
        if author is not None:
            db_item.author = author
        if item_type is not None:
            db_item.item_type = item_type
        if image_url is not None:
            if image_url.startswith("http"):
                try:
                    stored_url = upload_image_from_url(image_url, folder="items")
                    if stored_url:
                        db_item.image_url = stored_url
                except:
                    db_item.image_url = image_url
            else:
                db_item.image_url = image_url
        if extra_data is not None:
            try:
                db_item.extra_data = json.loads(extra_data)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON in extra_data")

        if image:
            try:
                if db_item.image_url:
                    delete_image(db_item.image_url)
                db_item.image_url = upload_image(image.file.read(), image.filename, folder="items")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")

        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        sync_item_to_search(db_item)
        
        is_avail = check_item_availability(session, db_item.id)
        
        owner_pub = None
        community_pub = None
        if db_item.user_owner:
            owner_pub = filter_owner_privacy(db_item.user_owner, current_user.id, is_admin=current_user.is_superuser)
            owner_pub.is_available = is_avail
        elif db_item.community_owner:
            community_pub = db_item.community_owner
        
        item_pub = ItemPublic(
            id=db_item.id,
            owner_id=db_item.owner_id,
            title=db_item.title,
            description=db_item.description,
            author=db_item.author,
            item_type=db_item.item_type,
            image_url=db_item.image_url,
            extra_data=db_item.extra_data,
            count=db_item.count,
            created_at=db_item.created_at,
            owner=owner_pub,
            community_owner=community_pub,
            is_available=is_avail
        )
        return item_pub
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred while updating the item: {str(e)}")


@router.delete("/{id}", response_model=Message)
def delete_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Delete an item.
    """
    db_item = session.get(Item, id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Permission check: User must be owner OR admin of owning community
    if db_item.user_owner:
        if db_item.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif db_item.community_owner:
        is_member = session.exec(
            select(CommunityMember).where(
                CommunityMember.community_id == db_item.owner_id,
                CommunityMember.user_id == current_user.id,
                CommunityMember.role == CommunityMemberRole.ADMIN,
                CommunityMember.status == CommunityMemberStatus.ACCEPTED
            )
        ).first()
        if not is_member and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions (Community admin required)")

    if db_item.image_url:
        delete_image(db_item.image_url)

    session.delete(db_item)
    session.commit()
    delete_item_from_search(id)
    return Message(message="Item deleted successfully")


@router.post("/{id}/duplicate", response_model=ItemPublic)
def duplicate_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Any:
    """
    Duplicate an existing item for the current user.
    """
    source_item = session.get(Item, id)
    if not source_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Create copy
    new_item = Item(
        title=source_item.title,
        description=source_item.description,
        author=source_item.author,
        item_type=source_item.item_type,
        image_url=source_item.image_url,
        extra_data=source_item.extra_data,
        owner_id=current_user.id,
    )
    
    session.add(new_item)
    session.commit()
    session.refresh(new_item)
    sync_item_to_search(new_item)
    
    owner_pub = filter_owner_privacy(current_user, current_user.id, is_admin=current_user.is_superuser)
    owner_pub.is_available = True
    
    return ItemPublic(
        id=new_item.id,
        owner_id=new_item.owner_id,
        title=new_item.title,
        description=new_item.description,
        author=new_item.author,
        item_type=new_item.item_type,
        image_url=new_item.image_url,
        extra_data=new_item.extra_data,
        count=new_item.count,
        created_at=new_item.created_at,
        owner=owner_pub,
        is_available=True
    )
