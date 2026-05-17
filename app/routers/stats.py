from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Agent, Invocation, User, get_db
from app.dependencies import require_admin
from app.models import AgentStats, ErrorResponse, GatewayStats

router = APIRouter(prefix="/v1/stats", tags=["stats"])


def _error_case():
    return case(
        (
            (Invocation.error.is_not(None)) | (Invocation.status_code >= 500),
            1,
        ),
        else_=0,
    )


async def _build_agent_stats(
    db: AsyncSession, agent_id: str | None = None, days: int = 7
) -> list[AgentStats]:
    cutoff = datetime.now(UTC) - timedelta(days=days)

    query = (
        select(
            Agent.id,
            Agent.name,
            Agent.status,
            func.count(Invocation.id).label("total"),
            func.sum(case((Invocation.error.is_(None) & (Invocation.status_code < 500), 1), else_=0)).label("success"),
            func.sum(_error_case()).label("errors"),
            func.avg(Invocation.duration_ms).label("avg_ms"),
            func.max(Invocation.created_at).label("last_inv"),
        )
        .outerjoin(Invocation, (Invocation.agent_id == Agent.id) & (Invocation.created_at >= cutoff))
        .group_by(Agent.id)
    )

    if agent_id:
        query = query.where(Agent.id == agent_id)
    else:
        query = query.order_by(func.count(Invocation.id).desc()).limit(10)

    rows = (await db.execute(query)).all()

    results = []
    for r in rows:
        p95 = None
        if r.total > 0:
            p95_query = (
                select(Invocation.duration_ms)
                .where(Invocation.agent_id == r.id, Invocation.created_at >= cutoff)
                .where(Invocation.duration_ms.is_not(None))
                .order_by(Invocation.duration_ms.asc())
            )
            durations = (await db.execute(p95_query)).scalars().all()
            if durations:
                idx = int(len(durations) * 0.95)
                idx = min(idx, len(durations) - 1)
                p95 = float(durations[idx])

        results.append(
            AgentStats(
                agent_id=r.id,
                agent_name=r.name,
                total_invocations=r.total,
                success_count=r.success,
                error_count=r.errors,
                avg_duration_ms=round(r.avg_ms, 2) if r.avg_ms else None,
                p95_duration_ms=p95,
                last_invocation=r.last_inv,
                status=r.status,
            )
        )
    return results


@router.get("/", response_model=GatewayStats)
async def get_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> GatewayStats:
    now = datetime.now(UTC)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_7d = now - timedelta(days=7)

    # Agent counts
    agents_result = await db.execute(
        select(
            func.count(Agent.id).label("total"),
            func.sum(case((Agent.status == "online", 1), else_=0)).label("online"),
            func.sum(case((Agent.status == "offline", 1), else_=0)).label("offline"),
            func.sum(case((Agent.status == "error", 1), else_=0)).label("error"),
        )
    )
    ag = agents_result.one()

    # User counts
    users_result = await db.execute(
        select(
            func.count(User.id).label("total"),
            func.sum(case((User.is_active.is_(True), 1), else_=0)).label("active"),
        )
    )
    us = users_result.one()

    # Invocation counts 24h
    inv_24h = await db.execute(
        select(
            func.count(Invocation.id).label("total"),
            func.sum(_error_case()).label("errors"),
            func.avg(Invocation.duration_ms).label("avg_ms"),
        ).where(Invocation.created_at >= cutoff_24h)
    )
    i24 = inv_24h.one()

    # Invocation count 7d
    inv_7d_result = await db.execute(
        select(func.count(Invocation.id)).where(Invocation.created_at >= cutoff_7d)
    )
    total_7d = inv_7d_result.scalar() or 0

    # Error rate
    error_rate = 0.0
    if i24.total and i24.total > 0:
        error_rate = round((i24.errors or 0) / i24.total * 100, 2)

    # Invocations per hour (last 24h)
    hourly_result = await db.execute(
        select(
            func.strftime("%Y-%m-%dT%H:00", Invocation.created_at).label("hour"),
            func.count(Invocation.id).label("count"),
        )
        .where(Invocation.created_at >= cutoff_24h)
        .group_by(func.strftime("%Y-%m-%dT%H:00", Invocation.created_at))
        .order_by("hour")
    )
    invocations_per_hour = [
        {"hour": row.hour, "count": row.count} for row in hourly_result.all()
    ]

    # Top agents
    top_agents = await _build_agent_stats(db)

    return GatewayStats(
        total_agents=ag.total or 0,
        online_agents=ag.online or 0,
        offline_agents=ag.offline or 0,
        error_agents=ag.error or 0,
        total_users=us.total or 0,
        active_users=us.active or 0,
        total_invocations_24h=i24.total or 0,
        total_invocations_7d=total_7d,
        error_rate_24h=error_rate,
        avg_duration_ms_24h=round(i24.avg_ms, 2) if i24.avg_ms else None,
        invocations_per_hour=invocations_per_hour,
        top_agents=top_agents,
    )


@router.get(
    "/agents/{agent_id}",
    response_model=AgentStats,
    responses={404: {"model": ErrorResponse}},
)
async def get_agent_stats(
    agent_id: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentStats:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    stats = await _build_agent_stats(db, agent_id=agent_id)
    return stats[0]
