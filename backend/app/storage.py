import logging
import uuid
from io import BytesIO

import httpx
from minio import Minio

from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Minio client
minio_client = Minio(
    f"{settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}",
    access_key=settings.MINIO_ROOT_USER,
    secret_key=settings.MINIO_ROOT_PASSWORD,
    secure=False
)

def upload_image(file_data: bytes, file_name: str, folder: str = "item-images") -> str | None:
    """
    Upload an image to Minio and return the INTERNAL proxy URL.
    """
    try:
        if not minio_client.bucket_exists(settings.MINIO_STORAGE_BUCKET):
            minio_client.make_bucket(settings.MINIO_STORAGE_BUCKET)

        # Generate a unique filename using UUID, preserving extension if possible
        ext = "png"
        if file_name and "." in file_name:
            ext = file_name.split(".")[-1].lower()
        
        unique_name = f"{uuid.uuid4()}.{ext}"
        file_path = f"{folder}/{unique_name}"
        data = BytesIO(file_data)

        minio_client.put_object(
            settings.MINIO_STORAGE_BUCKET,
            file_path,
            data,
            len(file_data),
            content_type="image/png"
        )

        return f"/api/v1/storage/image/{file_path}"
    except Exception as e:
        logger.error(f"Minio upload failed: {e}")
        return None

def upload_image_from_url(url: str, folder: str = "item-images") -> str | None:
    """
    Download an image from a URL and upload it to Minio.
    """
    try:
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()

            # Extract extension from URL or default to png
            ext = "png"
            if ".jpg" in url.lower() or ".jpeg" in url.lower():
                ext = "jpg"
            elif ".gif" in url.lower():
                ext = "gif"

            file_name = f"{uuid.uuid4()}.{ext}"
            return upload_image(response.content, file_name, folder=folder)
    except Exception as e:
        logger.error(f"Failed to download image from {url}: {e}")
        return None

def delete_image(file_path: str) -> bool:
    """
    Delete an image from Minio.
    """
    try:
        if "/api/v1/storage/image/" in file_path:
            file_path = file_path.split("/api/v1/storage/image/")[-1]

        minio_client.remove_object(settings.MINIO_STORAGE_BUCKET, file_path)
        return True
    except Exception as e:
        logger.error(f"Minio delete failed: {e}")
        return False

def get_proxy_url(file_path: str) -> str:
    """
    Construct the proxy URL for a given file path.
    """
    return f"/api/v1/storage/image/{file_path}"
