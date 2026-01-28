from typing import Any
from app.models import User, UserPublic, ItemOwnerPublic, UserSettingsSchema, Loan, LoanPublic

def filter_user_privacy(user: User, current_user_id: Any = None, is_admin: bool = False) -> UserPublic:
    """
    Apply privacy filters to a user object based on their settings.
    Superusers bypass these filters.
    """
    # If the user is the current user or an admin, don't filter anything
    is_me = current_user_id and str(user.id) == str(current_user_id)
    
    settings = user.settings or {}
    show_contact = settings.get("show_contact_details", False)
    show_name = settings.get("show_full_name", False)
    
    user_public = UserPublic.model_validate(user)
    user_public.show_contact_details = show_contact
    
    if not is_me and not is_admin:
        if not show_contact:
            # Hide email
            user_public.email = "[Hidden]"
            
        if not show_name:
            # Replace name with alias if available
            if user.profile and user.profile.alias:
                user_public.full_name = user.profile.alias
            else:
                user_public.full_name = "Private User"
            
    return user_public

def filter_owner_privacy(owner: User, current_user_id: Any = None, is_admin: bool = False) -> ItemOwnerPublic:
    """
    Apply privacy filters to an owner object for item listings.
    Superusers bypass these filters.
    """
    is_me = current_user_id and str(owner.id) == str(current_user_id)
    
    settings = owner.settings or {}
    show_contact = settings.get("show_contact_details", False)
    show_name = settings.get("show_full_name", False)
    
    email = owner.email if (is_me or is_admin or show_contact) else "[Hidden]"
    
    if is_me or is_admin or show_name:
        full_name = owner.full_name
    else:
        full_name = "Private User"
        if owner.profile and owner.profile.alias:
            full_name = owner.profile.alias
            
    return ItemOwnerPublic(
        id=owner.id,
        full_name=full_name,
        email=email,
        show_contact_details=show_contact
    )

def filter_loan_privacy(loan: Loan, current_user_id: Any = None, is_admin: bool = False) -> LoanPublic:
    """
    Apply privacy filters to a loan object's owner and requester.
    """
    loan_public = LoanPublic.model_validate(loan)
    
    if loan.owner:
        loan_public.owner = filter_user_privacy(loan.owner, current_user_id, is_admin)
    
    if loan.requester:
        loan_public.requester = filter_user_privacy(loan.requester, current_user_id, is_admin)
        
    return loan_public
