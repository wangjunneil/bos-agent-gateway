from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import Agent, AgentTag, User, UserAgentAccess, get_db
from app.dependencies import get_current_user, require_admin
from sqlalchemy import func

from app.models import (
    AgentCreate,
    AgentDetailResponse,
    AgentResponse,
    AgentUpdate,
    ErrorResponse,
    TagCount,
)
from app.services.agent_card import (
    AgentCardValidationError,
    fetch_agent_card,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/agents", tags=["agents"])


def _tags_list(agent: Agent) -> list[str]:
    return [t.tag for t in agent.tags] if agent.tags else []


def _agent_to_response(agent: Agent) -> AgentResponse:
    data = AgentResponse.model_validate(agent)
    data.tags = _tags_list(agent)
    return data


def _agent_to_detail(agent: Agent) -> AgentDetailResponse:
    card = json.loads(agent.agent_card) if agent.agent_card else None
    return AgentDetailResponse(
        id=agent.id,
        base_url=agent.base_url,
        name=agent.name,
        description=agent.description,
        status=agent.status,
        last_seen=agent.last_seen,
        is_public=agent.is_public,
        tags=_tags_list(agent),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        agent_card=card,
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
    try:
        card = await fetch_agent_card(payload.base_url)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch agent card: HTTP {exc.response.status_code}",
        ) from exc
    except (httpx.ConnectError, httpx.TimeoutException, httpx.UnsupportedProtocol) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent unreachable at {payload.base_url}: {exc}",
        ) from exc
    except AgentCardValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": exc.message, "validation_errors": exc.errors},
        ) from exc

    result = await db.execute(select(Agent).where(Agent.base_url == payload.base_url))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Agent with base_url '{payload.base_url}' is already registered",
        )

    now = datetime.now(UTC)
    agent_status = "unknown"

    try:
        card_url = f"{payload.base_url.rstrip('/')}/.well-known/agent-card.json"
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(card_url)
            if resp.status_code == 200:
                agent_status = "online"
    except (httpx.ConnectError, httpx.TimeoutException, httpx.UnsupportedProtocol):
        pass

    agent = Agent(
        id=str(uuid4()),
        base_url=payload.base_url,
        name=card.get("name"),
        description=card.get("description"),
        agent_card=json.dumps(card),
        status=agent_status,
        last_seen=now if agent_status == "online" else None,
        is_public=False,
        created_at=now,
        updated_at=now,
        tags=[AgentTag(agent_id="", tag=t) for t in payload.tags],
    )
    # Fix up tag agent_ids after agent.id is set
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
        try:
            card = await fetch_agent_card(payload.base_url)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch agent card: HTTP {exc.response.status_code}",
            ) from exc
        except (httpx.ConnectError, httpx.TimeoutException, httpx.UnsupportedProtocol) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Agent unreachable at {payload.base_url}: {exc}",
            ) from exc
        except AgentCardValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.message,
            ) from exc

        agent.base_url = payload.base_url
        agent.name = card.get("name")
        agent.description = card.get("description")
        agent.agent_card = json.dumps(card)

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
