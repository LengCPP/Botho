import asyncio
import json
import logging

from pywebpush import WebPushException, webpush

from app.core.config import settings
from app.models import PushSubscription

logger = logging.getLogger(__name__)


def _do_webpush(endpoint: str, p256dh: str, auth: str, payload_json: str) -> None:
    """Internal sync helper that performs the actual webpush HTTP call."""
    webpush(
        subscription_info={
            "endpoint": endpoint,
            "keys": {"p256dh": p256dh, "auth": auth},
        },
        data=payload_json,
        vapid_private_key=settings.VAPID_PRIVATE_KEY,
        vapid_claims={"sub": f"mailto:{settings.VAPID_MAILTO}"},
    )


def send_push_notification(subscription: PushSubscription, title: str, message: str, link: str | None = None):
    """
    Send a push notification to a single subscription (blocking).
    Raises WebPushException on delivery failure so caller can clean up stale subscriptions.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY or not settings.VAPID_MAILTO:
        logger.warning("VAPID keys not configured, push notification skipped")
        return

    payload = {"title": title, "body": message}
    if link:
        payload["data"] = {"url": link}

    try:
        _do_webpush(subscription.endpoint, subscription.p256dh, subscription.auth, json.dumps(payload))
    except WebPushException as ex:
        logger.error("WebPush error: %s", ex)
        raise


async def send_push_notification_async(
    subscription: PushSubscription, title: str, message: str, link: str | None = None
) -> None:
    """
    Non-blocking version of send_push_notification for use in async contexts.
    Runs the blocking webpush call in a thread-pool executor so the event loop
    is not stalled. Raises WebPushException on delivery failure.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY or not settings.VAPID_MAILTO:
        logger.warning("VAPID keys not configured, push notification skipped")
        return

    payload = {"title": title, "body": message}
    if link:
        payload["data"] = {"url": link}

    # Extract primitive values before entering thread pool (avoids ORM object thread-safety concerns)
    endpoint, p256dh, auth = subscription.endpoint, subscription.p256dh, subscription.auth
    payload_json = json.dumps(payload)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _do_webpush, endpoint, p256dh, auth, payload_json)