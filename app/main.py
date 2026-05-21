import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routers import agents, proxy, sessions, stats, users
from app.services.health import health_poll_loop
from app.settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=logging.DEBUG if settings.DEBUG else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    await init_db()
    logger.info("Database initialised")

    health_task: asyncio.Task | None = None
    if settings.HEALTH_POLL_ENABLED:
        health_task = asyncio.create_task(health_poll_loop())
        logger.info("Health polling enabled (interval=%ds)", settings.HEALTH_POLL_INTERVAL_SECONDS)

    yield

    if health_task is not None:
        health_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await health_task


app = FastAPI(
    title="BOS Agent Gateway",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(users.router)
app.include_router(stats.router)
app.include_router(sessions.router)
app.include_router(proxy.router)


@app.get("/v1/settings/public")
async def get_public_settings() -> dict:
    return {
        "auto_refresh_interval_seconds": settings.AUTO_REFRESH_INTERVAL_SECONDS,
        "command_mode_enabled": bool(settings.DIFY_COMMAND_URL and settings.DIFY_COMMAND_KEY),
        "command_fetch_url": settings.COMMAND_FETCH_URL,
    }


_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
