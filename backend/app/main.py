import logging
from contextlib import asynccontextmanager

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.routing import APIRoute
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
from starlette.middleware.cors import CORSMiddleware
from starlette_context.middleware import RawContextMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.limiter import limiter
from app.logging_config import configure_logging
from app.push import check_vapid_config
from app.search import configure_search
from app.tasks import check_expired_board_content, check_expired_suspensions, check_overdue_loans, classify_pending_books

configure_logging(settings.ENVIRONMENT)

logger = logging.getLogger(__name__)


def custom_generate_unique_id(route: APIRoute) -> str:
    tag = route.tags[0] if route.tags else route.name
    return f"{tag}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

scheduler = AsyncIOScheduler(timezone="UTC")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Search
    try:
        configure_search()
    except Exception as e:
        logger.error("Search configuration failed: %s", e)

    # Warn once at startup if push notifications are not configured
    check_vapid_config()

    # Schedule background tasks via APScheduler
    scheduler.add_job(check_overdue_loans, "interval", hours=1)
    scheduler.add_job(check_expired_suspensions, "interval", minutes=5)
    scheduler.add_job(check_expired_board_content, "interval", hours=24)
    scheduler.add_job(classify_pending_books, "interval", seconds=30, max_instances=1)
    scheduler.start()
    logger.info("APScheduler started with %d job(s)", len(scheduler.get_jobs()))

    yield

    scheduler.shutdown(wait=False)
    logger.info("APScheduler shut down")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RawContextMiddleware)

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
