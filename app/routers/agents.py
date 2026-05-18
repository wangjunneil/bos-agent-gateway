from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import Agent, AgentTag, User, UserAgentAccess, UserSession, get_db
from app.dependencies import get_current_user, require_admin
from app.models import (
    AgentCreate,
    AgentDetailResponse,
    AgentResponse,
    AgentUpdate,
    ErrorResponse,
    TagCount,
)
from app.services.dify import DifyError, fetch_dify_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/agents", tags=["agents"])


def _normalize_base_url(url: str) -> str:
    """Normalize Dify base URL: strip trailing /v1 so proxy path won't duplicate it."""
    url = url.rstrip("/")
    if url.endswith("/v1"):
        url = url[:-3].rstrip("/")
    return url


def _tags_list(agent: Agent) -> list[str]:
    return [t.tag for t in agent.tags] if agent.tags else []


def _agent_to_response(agent: Agent) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        base_url=agent.base_url,
        name=agent.name,
        description=agent.description,
        status=agent.status,
        command_enabled=agent.command_enabled,
        last_seen=agent.last_seen,
        is_public=agent.is_public,
        tags=_tags_list(agent),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


def _agent_to_detail(agent: Agent) -> AgentDetailResponse:
    info = json.loads(agent.agent_info) if agent.agent_info else None
    return AgentDetailResponse(
        id=agent.id,
        base_url=agent.base_url,
        name=agent.name,
        description=agent.description,
        status=agent.status,
        command_enabled=agent.command_enabled,
        last_seen=agent.last_seen,
        is_public=agent.is_public,
        tags=_tags_list(agent),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        agent_info=info,
    )


@router.post(
    "/",
    response_model=AgentDetailResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def register_agent(
    payload: AgentCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentDetailResponse:
    api_key = payload.dify_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="dify_api_key is required",
        )

    base_url = _normalize_base_url(payload.base_url)

    try:
        info = await fetch_dify_info(base_url, api_key)
    except DifyError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.message,
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch Dify app info: HTTP {exc.response.status_code}",
        ) from exc
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Dify service unreachable at {base_url}: {exc}",
        ) from exc

    # Uniqueness: same base_url + same api_key = same app
    existing = await db.execute(
        select(Agent).where(
            Agent.base_url == base_url, Agent.dify_api_key == api_key
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dify app with this base_url and API key is already registered",
        )

    now = datetime.now(UTC)
    agent = Agent(
        id=str(uuid4()),
        base_url=_normalize_base_url(payload.base_url),
        name=info.get("name"),
        description=info.get("description"),
        agent_info=json.dumps(info, ensure_ascii=False),
        dify_api_key=api_key,
        status="online",
        last_seen=now,
        is_public=False,
        created_at=now,
        updated_at=now,
        tags=[AgentTag(agent_id="", tag=t) for t in payload.tags],
    )
    for tag in agent.tags:
        tag.agent_id = agent.id
    db.add(agent)
    await db.commit()

    result = await db.execute(
        select(Agent).where(Agent.id == agent.id).options(selectinload(Agent.tags))
    )
    agent = result.scalar_one()
    return _agent_to_detail(agent)


@router.get("/", response_model=list[AgentResponse])
async def list_agents(
    tag: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AgentResponse]:
    if user.role == "admin":
        query = select(Agent).options(selectinload(Agent.tags))
    else:
        query = (
            select(Agent)
            .outerjoin(
                UserAgentAccess,
                (UserAgentAccess.agent_id == Agent.id) & (UserAgentAccess.user_id == user.id),
            )
            .where((UserAgentAccess.user_id.is_not(None)) | (Agent.is_public.is_(True)))
            .distinct()
            .options(selectinload(Agent.tags))
        )

    if tag:
        tag_values = [t.strip().lower() for t in tag.split(",") if t.strip()]
        for tv in tag_values:
            query = query.where(
                Agent.id.in_(select(AgentTag.agent_id).where(AgentTag.tag == tv))
            )

    query = query.order_by(Agent.created_at.desc())
    result = await db.execute(query)
    agents = result.scalars().unique().all()
    return [_agent_to_response(a) for a in agents]


@router.get(
    "/{agent_id}",
    response_model=AgentDetailResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgentDetailResponse:
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.tags))
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if user.role != "admin":
        access = await db.execute(
            select(UserAgentAccess).where(
                UserAgentAccess.user_id == user.id,
                UserAgentAccess.agent_id == agent_id,
            )
        )
        if not access.scalar_one_or_none() and not agent.is_public:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    return _agent_to_detail(agent)


@router.patch(
    "/{agent_id}",
    response_model=AgentDetailResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentDetailResponse:
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.tags))
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if payload.is_public is not None:
        agent.is_public = payload.is_public

    if payload.tags is not None:
        agent.tags.clear()
        for t in payload.tags:
            agent.tags.append(AgentTag(agent_id=agent_id, tag=t))

    if payload.base_url is not None and payload.base_url != agent.base_url:
        api_key = payload.dify_api_key or agent.dify_api_key
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="dify_api_key is required to verify new base_url",
            )
        try:
            info = await fetch_dify_info(payload.base_url, api_key)
        except DifyError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=exc.message,
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch Dify app info: HTTP {exc.response.status_code}",
            ) from exc
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Dify service unreachable at {payload.base_url}: {exc}",
            ) from exc

        agent.base_url = _normalize_base_url(payload.base_url)
        agent.name = info.get("name")
        agent.description = info.get("description")
        agent.agent_info = json.dumps(info, ensure_ascii=False)

    if payload.dify_api_key is not None:
        agent.dify_api_key = payload.dify_api_key

    if payload.command_enabled is not None:
        agent.command_enabled = payload.command_enabled

    agent.updated_at = datetime.now(UTC)
    await db.commit()

    result = await db.execute(
        select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.tags))
    )
    agent = result.scalar_one()
    return _agent_to_detail(agent)


@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_agent(
    agent_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    await db.delete(agent)
    await db.commit()


@router.get("/{agent_id}/users")
async def list_agent_users(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(UserSession.dify_user)
        .where(UserSession.agent_id == agent_id)
        .distinct()
        .order_by(UserSession.dify_user)
    )
    return {"users": [row[0] for row in result.all()]}


@router.get("/{agent_id}/conversations")
async def get_agent_conversations(
    agent_id: str,
    user: str,
    last_id: str | None = None,
    limit: int = 20,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = agent_result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if not agent.dify_api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent has no API key")

    url = f"{agent.base_url.rstrip('/')}/v1/conversations"
    params: dict = {"user": user, "limit": str(limit)}
    if last_id:
        params["last_id"] = last_id
    headers = {"Authorization": f"Bearer {agent.dify_api_key}"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()


@router.get("/{agent_id}/messages")
async def get_agent_messages(
    agent_id: str,
    user: str,
    conversation_id: str,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = agent_result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if not agent.dify_api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent has no API key")

    url = f"{agent.base_url.rstrip('/')}/v1/messages"
    params = {"user": user, "conversation_id": conversation_id}
    headers = {"Authorization": f"Bearer {agent.dify_api_key}"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()


@router.delete("/{agent_id}/conversations/{conversation_id}")
async def delete_agent_conversation(
    agent_id: str,
    conversation_id: str,
    user: str,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = agent_result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if not agent.dify_api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent has no API key")

    url = f"{agent.base_url.rstrip('/')}/v1/conversations/{conversation_id}"
    headers = {"Authorization": f"Bearer {agent.dify_api_key}"}

    async with httpx.AsyncClient() as client:
        resp = await client.request("DELETE", url, json={"user": user}, headers=headers)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            return {"result": resp.text}


@router.post("/{agent_id}/conversations/{conversation_id}/name")
async def rename_agent_conversation(
    agent_id: str,
    conversation_id: str,
    user: str,
    request: Request,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    body = await request.json()
    name = body.get("name", "")
    agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = agent_result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if not agent.dify_api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent has no API key")

    url = f"{agent.base_url.rstrip('/')}/v1/conversations/{conversation_id}/name"
    headers = {"Authorization": f"Bearer {agent.dify_api_key}"}

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json={"name": name, "user": user}, headers=headers)
        resp.raise_for_status()
        return resp.json()


@router.get("/tags/all", response_model=list[TagCount])
async def list_tags(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TagCount]:
    result = await db.execute(
        select(AgentTag.tag, func.count(AgentTag.agent_id).label("count"))
        .group_by(AgentTag.tag)
        .order_by(func.count(AgentTag.agent_id).desc())
    )
    return [TagCount(tag=row.tag, count=row.count) for row in result.all()]
