import logging
import uuid

from pywebpush import WebPushException
from sqlmodel import Session, select

from app import crud
from app.api.websocket_manager import notification_manager
from app.models import NotificationType, PushSubscription
from app.push import send_push_notification

logger = logging.getLogger(__name__)

async def notify_user(
    *,
    session: Session,
    recipient_id: uuid.UUID,
    title: str,
    message: str,
    type: NotificationType = NotificationType.INFO,
    link: str | None = None,
    ws_extra: dict | None = None,
):
    """
    1. Create DB notification.
    2. Send WebSocket message if user is connected.
    3. Send Push Notification if user has subscriptions.
    """
    # 1. Create DB notification
    crud.create_notification(
        session=session,
        recipient_id=recipient_id,
        title=title,
        message=message,
        type=type,
        link=link,
    )

    # 2. Send WebSocket message
    ws_message = {"type": "new_notification", "title": title, "message": message, "notification_type": type, "link": link}
    if ws_extra:
        ws_message.update(ws_extra)
    await notification_manager.send_personal_message(ws_message, recipient_id)

    # 3. Send Push Notifications
    subscriptions = session.exec(
        select(PushSubscription).where(PushSubscription.user_id == recipient_id)
    ).all()

    for sub in subscriptions:
        try:
            send_push_notification(sub, title, message, link)
        except WebPushException as ex:
            if ex.response and ex.response.status_code in [404, 410]:
                logger.info(f"Removing expired subscription: {sub.endpoint}")
                session.delete(sub)
                session.commit()
        except Exception as e:
            logger.error(f"Failed to send push notification: {e}")
