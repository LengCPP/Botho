import asyncio
import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.search import configure_search
from app.tasks import check_overdue_loans

logger = logging.getLogger(__name__)


def custom_generate_unique_id(route: APIRoute) -> str:
    tag = route.tags[0] if route.tags else route.name
    return f"{tag}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Search
    try:
        configure_search()
    except Exception as e:
        logger.error("Search configuration failed: %s", e)

    # Start background tasks
    task = asyncio.create_task(check_overdue_loans())
    yield
    # Cancel background task and wait for clean shutdown
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

# Set all CORS enabled origins
if settings.all_cors_origins:
    logger.debug("Allowed CORS origins: %s", settings.all_cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)
