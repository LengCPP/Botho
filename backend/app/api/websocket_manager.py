import asyncio
import json
import logging
import uuid

from fastapi import WebSocket
from pywebpush import WebPushException
from sqlmodel import Session, select

from app.models import PushSubscription
from app.push import send_push_notification_async

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # user_id -> list of websockets (a user can have multiple tabs open)
        self.active_connections: dict[uuid.UUID, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID):
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: uuid.UUID):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: uuid.UUID):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending websocket message: {e}")

    async def send_notification(
        self,
        session: Session,
        user_id: uuid.UUID,
        title: str,
        message: str,
        notification_type: str = "INFO",
        link: str | None = None
    ):
        """
        Send notification via WebSocket if connected, and always try Push Notification.
        """
        # 1. Send via WebSocket
        ws_message = {
            "title": title,
            "message": message,
            "type": notification_type,
            "link": link
        }
        await self.send_personal_message(ws_message, user_id)

        # 2. Send via Push Notifications concurrently (non-blocking)
        subscriptions = session.exec(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        ).all()

        async def _push_one(sub: PushSubscription) -> None:
            try:
                await send_push_notification_async(sub, title, message, link)
            except WebPushException as ex:
                if ex.response and ex.response.status_code in [404, 410]:
                    logger.info(f"Removing expired subscription: {sub.endpoint}")
                    session.delete(sub)
                    session.commit()
            except Exception as e:
                logger.error(f"Failed to send push notification: {e}")

        if subscriptions:
            await asyncio.gather(*[_push_one(sub) for sub in subscriptions])

    async def broadcast(self, message: dict):
        for user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error broadcasting websocket message: {e}")


notification_manager = ConnectionManager()
