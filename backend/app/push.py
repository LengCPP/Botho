import json
import logging

from pywebpush import WebPushException, webpush

from app.core.config import settings
from app.models import PushSubscription

logger = logging.getLogger(__name__)

def send_push_notification(subscription: PushSubscription, title: str, message: str, link: str | None = None):
    """
    Send a push notification to a single subscription.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY or not settings.VAPID_MAILTO:
        logger.warning("VAPID keys not configured, push notification skipped")
        return

    payload = {
        "title": title,
        "body": message,
    }
    if link:
        payload["data"] = {"url": link}

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth
                }
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": f"mailto:{settings.VAPID_MAILTO}"
            }
        )
    except WebPushException as ex:
        logger.error(f"WebPush error: {ex}")
        # If subscription is no longer valid (404 Not Found or 410 Gone),
        # it should be handled by the caller (e.g. remove from DB)
        raise ex
