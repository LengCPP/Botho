import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    ItemTypeDefinition,
    ItemTypeDefinitionCreate,
    ItemTypeDefinitionPublic,
    ItemTypeDefinitionsPublic,
)

router = APIRouter()


def _parse_enabled_fields(raw: str) -> list[str]:
    try:
        return json.loads(raw)
    except Exception:
        return []


def _to_public(definition: ItemTypeDefinition) -> ItemTypeDefinitionPublic:
    return ItemTypeDefinitionPublic(
        id=definition.id,
        name=definition.name,
        slug=definition.slug,
        created_by=definition.created_by,
        enabled_fields=_parse_enabled_fields(definition.enabled_fields),
        label_field=definition.label_field,
        created_at=definition.created_at,
    )


@router.get("/", response_model=ItemTypeDefinitionsPublic)
def list_item_types(session: SessionDep, current_user: CurrentUser) -> Any:
    """List the current user's custom item type definitions."""
    definitions = session.exec(
        select(ItemTypeDefinition).where(ItemTypeDefinition.created_by == current_user.id)
    ).all()
    return ItemTypeDefinitionsPublic(
        data=[_to_public(d) for d in definitions],
        count=len(definitions),
    )


@router.post("/", response_model=ItemTypeDefinitionPublic)
def create_item_type(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    body: ItemTypeDefinitionCreate,
) -> Any:
    """Create a new custom item type for the current user."""
    slug = body.name.lower().strip().replace(" ", "_")

    # Reject reserved slugs
    if slug in ("book", "general"):
        raise HTTPException(status_code=400, detail=f"'{slug}' is a reserved item type")

    # Reject duplicate slug for this user
    existing = session.exec(
        select(ItemTypeDefinition).where(
            ItemTypeDefinition.slug == slug,
            ItemTypeDefinition.created_by == current_user.id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"You already have an item type named '{slug}'",
        )

    definition = ItemTypeDefinition(
        name=body.name.strip(),
        slug=slug,
        created_by=current_user.id,
        enabled_fields=json.dumps(body.enabled_fields),
        label_field=body.label_field,
    )
    session.add(definition)
    session.commit()
    session.refresh(definition)
    return _to_public(definition)


@router.get("/{slug}", response_model=ItemTypeDefinitionPublic)
def get_item_type(*, session: SessionDep, current_user: CurrentUser, slug: str) -> Any:
    """Get one of the current user's item type definitions by slug."""
    definition = session.exec(
        select(ItemTypeDefinition).where(
            ItemTypeDefinition.slug == slug,
            ItemTypeDefinition.created_by == current_user.id,
        )
    ).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Item type not found")
    return _to_public(definition)