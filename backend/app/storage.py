import ipaddress
import logging
import uuid
from io import BytesIO
from urllib.parse import urlparse

import httpx
from minio import Minio

from app.core.config import settings

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = {"http", "https"}

# Magic-bytes → MIME type map for supported image formats
_MIME_TO_EXT: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}


def _detect_mime_type(data: bytes) -> str:
    """Detect image MIME type from magic bytes. Raises ValueError for unsupported types."""
    if data[:4] == b"\x89PNG":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise ValueError("Unsupported image format. Allowed types: PNG, JPEG, GIF, WebP")


_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),         # IPv6 ULA / loopback
]


def _validate_image_url(url: str) -> None:
    """Raise ValueError if the URL is unsafe for server-side fetching (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"Image URL must use http or https, got: {parsed.scheme!r}")
    hostname = parsed.hostname or ""
    if not hostname:
        raise ValueError("Image URL has no hostname")
    try:
        addr = ipaddress.ip_address(hostname)
        for net in _PRIVATE_NETS:
            if addr in net:
                raise ValueError(f"Image URL points to a private/internal address: {hostname}")
    except ValueError as exc:
        # Re-raise our own private-IP errors; ignore "not a valid IP" (hostname is a domain)
        if "private" in str(exc) or "internal" in str(exc):
            raise


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
    Validates file size and MIME type from magic bytes before uploading.
    """
    try:
        # Size guard
        if len(file_data) > settings.max_image_size_bytes:
            raise ValueError(f"Image exceeds maximum allowed size of {settings.MAX_IMAGE_SIZE_MB} MB")

        # MIME type detection from magic bytes (rejects non-image content regardless of extension)
        content_type = _detect_mime_type(file_data)
        ext = _MIME_TO_EXT[content_type]

        if not minio_client.bucket_exists(settings.MINIO_STORAGE_BUCKET):
            minio_client.make_bucket(settings.MINIO_STORAGE_BUCKET)

        unique_name = f"{uuid.uuid4()}.{ext}"
        file_path = f"{folder}/{unique_name}"
        data = BytesIO(file_data)

        minio_client.put_object(
            settings.MINIO_STORAGE_BUCKET,
            file_path,
            data,
            len(file_data),
            content_type=content_type,
        )

        return f"/api/v1/storage/image/{file_path}"
    except Exception as e:
        logger.error("Minio upload failed: %s", e)
        return None

async def upload_image_from_url(url: str, folder: str = "item-images") -> str | None:
    """
    Download an image from a URL and upload it to Minio.
    Validates the URL to prevent SSRF before making any network request.
    """
    try:
        _validate_image_url(url)
    except ValueError as e:
        logger.warning("Blocked unsafe image URL: %s — %s", url, e)
        return None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        async with httpx.AsyncClient(follow_redirects=False) as client:
            response = await client.get(url, headers=headers)
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
        _PREFIX = "/api/v1/storage/image/"
        parsed_path = urlparse(file_path).path
        if parsed_path.startswith(_PREFIX):
            file_path = parsed_path[len(_PREFIX):]

        minio_client.remove_object(settings.MINIO_STORAGE_BUCKET, file_path)
        return True
    except Exception as e:
        logger.error("Minio delete failed: %s", e)
        return False

def get_proxy_url(file_path: str) -> str:
    """
    Construct the proxy URL for a given file path.
    """
    return f"/api/v1/storage/image/{file_path}"
