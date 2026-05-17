from __future__ import annotations

import secrets
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import Agent, User, UserAgentAccess, get_db
from app.dependencies import require_admin
from app.models import (
    AgentAssign,
    AgentResponse,
    ApiKeyResponse,
    ErrorResponse,
    UserCreate,
    UserCreateResponse,
    UserDetailResponse,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/v1/users", tags=["users"])


@router.post(
    "/",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}},
)
async def create_user(
    payload: UserCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserCreateResponse:
    result = await db.execute(select(User).where(User.username == payload.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{payload.username}' is already taken",
        )

    now = datetime.now(UTC)
    api_key = f"sk-{secrets.token_hex(32)}"
    user = User(
        id=str(uuid4()),
        username=payload.username,
        api_key=api_key,
        role="user",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserCreateResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        rate_limit=user.rate_limit,
        created_at=user.created_at,
        updated_at=user.updated_at,
        api_key=api_key,
    )


@router.get("/", response_model=list[UserResponse])
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.get(
    "/{user_id}",
    response_model=UserDetailResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    agent_result = await db.execute(
        select(Agent)
        .join(UserAgentAccess, UserAgentAccess.agent_id == Agent.id)
        .where(UserAgentAccess.user_id == user_id)
        .options(selectinload(Agent.tags))
        .order_by(Agent.created_at.desc())
    )
    agents = [AgentResponse.model_validate(a) for a in agent_result.scalars().all()]

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        rate_limit=user.rate_limit,
        created_at=user.created_at,
        updated_at=user.updated_at,
        agents=agents,
    )


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.username is not None:
        dup = await db.execute(
            select(User).where(User.username == payload.username, User.id != user_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{payload.username}' is already taken",
            )
        user.username = payload.username

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role
    from app.models import _UNSET
    if payload.rate_limit is not _UNSET:
        user.rate_limit = payload.rate_limit

    user.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
async def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    if admin.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own admin account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    await db.commit()


@router.post(
    "/{user_id}/agents",
    response_model=list[AgentResponse],
    responses={404: {"model": ErrorResponse}},
)
async def assign_agents(
    user_id: str,
    payload: AgentAssign,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AgentResponse]:
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = datetime.now(UTC)
    for agent_id in payload.agent_ids:
        agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
        if not agent_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Agent '{agent_id}' not found"
            )

        existing = await db.execute(
            select(UserAgentAccess).where(
                UserAgentAccess.user_id == user_id,
                UserAgentAccess.agent_id == agent_id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(
                UserAgentAccess(
                    user_id=user_id,
                    agent_id=agent_id,
                    granted_at=now,
                    granted_by=admin.id,
                )
            )

    await db.commit()

    agent_result = await db.execute(
        select(Agent)
        .join(UserAgentAccess, UserAgentAccess.agent_id == Agent.id)
        .where(UserAgentAccess.user_id == user_id)
        .options(selectinload(Agent.tags))
        .order_by(Agent.created_at.desc())
    )
    return [AgentResponse.model_validate(a) for a in agent_result.scalars().all()]


@router.delete(
    "/{user_id}/agents/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def remove_agent_access(
    user_id: str,
    agent_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(UserAgentAccess).where(
            UserAgentAccess.user_id == user_id,
            UserAgentAccess.agent_id == agent_id,
        )
    )
    access = result.scalar_one_or_none()
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access entry not found")

    await db.delete(access)
    await db.commit()


@router.post(
    "/{user_id}/regenerate-api-key",
    response_model=ApiKeyResponse,
    responses={404: {"model": ErrorResponse}},
)
async def regenerate_api_key(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    new_key = f"sk-{secrets.token_hex(32)}"
    user.api_key = new_key
    user.updated_at = datetime.now(UTC)
    await db.commit()

    return ApiKeyResponse(api_key=new_key)
