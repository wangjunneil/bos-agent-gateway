import asyncio
import json
import logging
from datetime import UTC, datetime

import httpx
from sqlalchemy import select

from app.database import Agent, async_session
from app.services.agent_card import validate_agent_card
from app.settings import settings

logger = logging.getLogger(__name__)


async def health_poll_loop() -> None:
    if not settings.HEALTH_POLL_ENABLED:
        return

    while True:
        try:
            await _poll_all_agents()
        except Exception:
            logger.exception("Health poll cycle failed")
        await asyncio.sleep(settings.HEALTH_POLL_INTERVAL_SECONDS)


async def _poll_all_agents() -> None:
    async with async_session() as session:
        result = await session.execute(select(Agent))
        agents = result.scalars().all()

    if not agents:
        return

    await asyncio.gather(*[_check_agent(a.id, a.base_url) for a in agents])


async def _check_agent(agent_id: str, base_url: str) -> None:
    now = datetime.now(UTC)

    try:
        url = f"{base_url.rstrip('/')}/.well-known/agent-card.json"
        async with httpx.AsyncClient(timeout=settings.HEALTH_POLL_TIMEOUT_SECONDS) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            card = resp.json()

        validate_agent_card(card)

        async with async_session() as session:
            result = await session.execute(select(Agent).where(Agent.id == agent_id))
            agent = result.scalar_one_or_none()
            if agent:
                agent.status = "online"
                agent.status_message = None
                agent.last_seen = now
                agent.agent_card = json.dumps(card)
                agent.updated_at = now
                await session.commit()

    except httpx.HTTPStatusError as exc:
        await _set_agent_status(agent_id, "error", f"HTTP {exc.response.status_code}", now)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        await _set_agent_status(agent_id, "offline", str(exc), now)
    except Exception as exc:
        await _set_agent_status(agent_id, "error", str(exc), now)


async def _set_agent_status(agent_id: str, status: str, message: str, now: datetime) -> None:
    async with async_session() as session:
        result = await session.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.status = status
            agent.status_message = message
            agent.updated_at = now
            await session.commit()
