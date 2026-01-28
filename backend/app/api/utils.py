from typing import Any
from app.models import User, UserPublic, ItemOwnerPublic, UserSettingsSchema

def filter_user_privacy(user: User, current_user_id: Any = None) -> UserPublic:
    """
    Apply privacy filters to a user object based on their settings.
    """
    # If the user is the current user, don't filter anything
    is_me = current_user_id and str(user.id) == str(current_user_id)
    
    settings = user.settings or {}
    show_contact = settings.get("show_contact_details", False)
    
    user_public = UserPublic.model_validate(user)
    user_public.show_contact_details = show_contact
    
    if not is_me and not show_contact:
        # Hide email
        user_public.email = "[Hidden]"
        # Replace name with alias if available
        if user.profile and user.profile.alias:
            user_public.full_name = user.profile.alias
        else:
            user_public.full_name = "Private User"
            
    return user_public

def filter_owner_privacy(owner: User, current_user_id: Any = None) -> ItemOwnerPublic:
    """
    Apply privacy filters to an owner object for item listings.
    """
    is_me = current_user_id and str(owner.id) == str(current_user_id)
    
    settings = owner.settings or {}
    show_contact = settings.get("show_contact_details", False)
    
    if is_me or show_contact:
        return ItemOwnerPublic(
            id=owner.id,
            full_name=owner.full_name,
            email=owner.email,
            show_contact_details=show_contact
        )
    else:
        full_name = "Private User"
        if owner.profile and owner.profile.alias:
            full_name = owner.profile.alias
            
        return ItemOwnerPublic(
            id=owner.id,
            full_name=full_name,
            email="[Hidden]",
            show_contact_details=show_contact
        )
