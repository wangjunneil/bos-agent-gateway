from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Agent, Invocation, User, UserAgentAccess, get_db
from app.dependencies import get_current_user
from app.models import ErrorResponse
from app.services.proxy import proxy_request
from app.services.rate_limiter import check_rate_limit_for_user, effective_rate_limit, limiter
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["a2a"])


async def _get_agent_or_404(agent_id: str, db: AsyncSession) -> Agent:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


async def _check_permission(user: User, agent: Agent, db: AsyncSession) -> None:
    if user.role == "admin":
        return
    if agent.is_public:
        return
    result = await db.execute(
        select(UserAgentAccess).where(
            UserAgentAccess.user_id == user.id,
            UserAgentAccess.agent_id == agent.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this agent",
        )


def _rate_limit_headers(user: User) -> dict[str, str]:
    if not settings.RATE_LIMIT_ENABLED:
        return {}

    limit = effective_rate_limit(user)
    if limit <= 0:
        return {}

    now = time.monotonic()
    cutoff = now - settings.RATE_LIMIT_WINDOW_SECONDS
    timestamps = limiter._windows.get(user.id, [])
    current_count = sum(1 for t in timestamps if t > cutoff)
    remaining = max(0, limit - current_count)

    if timestamps:
        oldest = min((t for t in timestamps if t > cutoff), default=now)
        reset = max(0, int(oldest - cutoff))
    else:
        reset = settings.RATE_LIMIT_WINDOW_SECONDS

    return {
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Reset": str(reset),
    }


async def _log_invocation(
    db: AsyncSession,
    user_id: str,
    agent_id: str,
    method: str,
    path: str,
    status_code: int | None,
    duration_ms: int,
    error: str | None = None,
) -> None:
    db.add(
        Invocation(
            id=str(uuid4()),
            user_id=user_id,
            agent_id=agent_id,
            method=method,
            path=path,
            status_code=status_code,
            duration_ms=duration_ms,
            error=error,
            created_at=datetime.now(UTC),
        )
    )
    await db.commit()


async def _handle_proxy(
    agent_id: str,
    request: Request,
    user: User,
    db: AsyncSession,
    stream: bool,
) -> Response:
    check_rate_limit_for_user(user)

    agent = await _get_agent_or_404(agent_id, db)
    await _check_permission(user, agent, db)

    if agent.status in ("offline", "error"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Agent is currently {agent.status}",
        )

    body = await request.body()
    card = json.loads(agent.agent_card)
    path = "message:stream" if stream else "message:send"
    forwarded_headers = dict(request.headers)

    start = time.monotonic()
    error_detail: str | None = None
    resp_status: int | None = None

    try:
        response = await proxy_request(
            agent_card=card,
            path=path,
            body=body,
            stream=stream,
            headers=forwarded_headers,
        )
        resp_status = response.status_code
    except HTTPException as exc:
        error_detail = exc.detail
        resp_status = exc.status_code
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_invocation(
            db, user.id, agent_id, "POST", path, resp_status, duration_ms, error_detail
        )
        raise
    except Exception as exc:
        error_detail = str(exc)
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_invocation(db, user.id, agent_id, "POST", path, 502, duration_ms, error_detail)
        raise

    duration_ms = int((time.monotonic() - start) * 1000)
    await _log_invocation(db, user.id, agent_id, "POST", path, resp_status, duration_ms)

    for k, v in _rate_limit_headers(user).items():
        response.headers[k] = v

    return response


@router.get(
    "/a2a/{agent_id}/.well-known/agent-card.json",
    responses={404: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
async def get_agent_card(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent = await _get_agent_or_404(agent_id, db)
    await _check_permission(user, agent, db)

    if not agent.agent_card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent card not available"
        )

    return json.loads(agent.agent_card)


@router.post(
    "/a2a/{agent_id}/message/send",
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def proxy_send(
    agent_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _handle_proxy(agent_id, request, user, db, stream=False)


@router.post(
    "/a2a/{agent_id}/message/stream",
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def proxy_stream(
    agent_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _handle_proxy(agent_id, request, user, db, stream=True)


@router.post(
    "/v1/a2a/{agent_id}/message/send",
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def proxy_send_v1(
    agent_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _handle_proxy(agent_id, request, user, db, stream=False)


@router.post(
    "/v1/a2a/{agent_id}/message/stream",
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def proxy_stream_v1(
    agent_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _handle_proxy(agent_id, request, user, db, stream=True)
