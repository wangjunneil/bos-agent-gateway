from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Agent, Invocation, User, UserAgentAccess, UserSession, get_db
from app.dependencies import get_current_user
from app.models import ErrorResponse
from app.services.rate_limiter import check_rate_limit_for_user, effective_rate_limit, limiter
from app.services.redis import redis_client
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dify"])

FORWARD_FILTER = {"x-api-key", "host", "x-forwarded-for", "x-real-ip"}
EXPOSE_HEADERS = {"content-type", "authorization", "content-length"}


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
    task_id: str | None,
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
            task_id=task_id,
            status_code=status_code,
            duration_ms=duration_ms,
            error=error,
            created_at=datetime.now(UTC),
        )
    )
    await db.commit()


async def _upsert_session(
    db: AsyncSession,
    agent_id: str,
    dify_user: str,
    conversation_id: str,
    task_id: str | None,
) -> None:
    now = datetime.now(UTC)
    result = await db.execute(
        select(UserSession).where(
            UserSession.agent_id == agent_id,
            UserSession.dify_user == dify_user,
        )
    )
    session = result.scalar_one_or_none()
    if session:
        session.conversation_id = conversation_id
        if task_id:
            session.latest_task_id = task_id
        session.updated_at = now
    else:
        db.add(
            UserSession(
                id=str(uuid4()),
                agent_id=agent_id,
                dify_user=dify_user,
                conversation_id=conversation_id,
                latest_task_id=task_id,
                created_at=now,
                updated_at=now,
            )
        )
    await db.commit()


async def _stream_proxy(
    target_url: str,
    body: bytes,
    headers: dict[str, str],
) -> tuple[AsyncGenerator[bytes, None], str | None, str | None]:
    """Stream proxy: yields bytes, captures task_id and conversation_id from first SSE event."""
    captured_task_id: list[str | None] = [None]
    captured_conversation_id: list[str | None] = [None]

    async def _generator():
        try:
            async with (
                httpx.AsyncClient(
                    timeout=httpx.Timeout(settings.PROXY_SSE_TIMEOUT_SECONDS)
                ) as client,
                client.stream("POST", target_url, content=body, headers=headers) as response,
            ):
                extracting = True
                async for chunk in response.aiter_bytes():
                    if extracting:
                        text = chunk.decode("utf-8", errors="ignore")
                        for line in text.split("\n"):
                            stripped = line.strip()
                            if stripped.startswith("data:"):
                                data_str = stripped.removeprefix("data:").strip()
                                try:
                                    data = json.loads(data_str)
                                    if captured_task_id[0] is None:
                                        captured_task_id[0] = data.get("task_id")
                                    if captured_conversation_id[0] is None:
                                        captured_conversation_id[0] = data.get("conversation_id")
                                except (json.JSONDecodeError, TypeError):
                                    pass
                        if captured_task_id[0] and captured_conversation_id[0]:
                            extracting = False
                    yield chunk
        except (httpx.ConnectError, httpx.TimeoutException):
            return

    gen = _generator()

    # Read chunks until task_id is captured (SSE starts with ping, then data)
    first_bytes_list: list[bytes] = []
    try:
        while captured_task_id[0] is None:
            chunk = await gen.__anext__()
            first_bytes_list.append(chunk)
    except StopAsyncIteration:
        pass

    logger.info(
        "SSE first chunk extracted: task_id=%s conversation_id=%s",
        captured_task_id[0], captured_conversation_id[0],
    )

    async def _wrapper():
        for b in first_bytes_list:
            yield b
        async for chunk in gen:
            yield chunk

    return _wrapper(), captured_task_id[0], captured_conversation_id[0]


async def _handle_proxy(
    agent_id: str,
    request: Request,
    user: User,
    db: AsyncSession,
) -> Response:
    check_rate_limit_for_user(user)

    agent = await _get_agent_or_404(agent_id, db)
    await _check_permission(user, agent, db)

    if agent.status in ("offline", "error"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Agent is currently {agent.status}",
        )

    # Extract the forwarding path: /dify/{id}/v1/chat-messages → v1/chat-messages
    path = request.url.path
    dify_prefix = f"/agent/{agent_id}"
    if path.startswith(dify_prefix):
        proxy_path = path[len(dify_prefix):].lstrip("/")
    else:
        proxy_path = path.lstrip("/")

    if not proxy_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Dify API path")

    body = await request.body()
    method = request.method
    target_url = f"{agent.base_url.rstrip('/')}/{proxy_path}"

    # Extract dify_user from request body
    dify_user: str | None = None
    req_data: dict = {}
    try:
        req_data = json.loads(body)
        dify_user = req_data.get("user")
    except Exception:
        pass

    # Build forward headers: pass through user headers, inject Dify API Key
    forward_headers = {}
    for k, v in request.headers.items():
        lower = k.lower()
        if lower in FORWARD_FILTER:
            continue
        forward_headers[k] = v

    if agent.dify_api_key:
        forward_headers["Authorization"] = f"Bearer {agent.dify_api_key}"
        forward_headers.pop("authorization", None)

    start = time.monotonic()

    # Command mode: if enabled and this is a chat-messages request, check command service first
    if (
        agent.command_enabled
        and settings.DIFY_COMMAND_URL
        and settings.DIFY_COMMAND_KEY
        and proxy_path.endswith("chat-messages")
    ):
        try:
            orig_body = json.loads(body)
            orig_query = orig_body.get("query", "")
            orig_user = orig_body.get("user", "")
            orig_conv_id = orig_body.get("conversation_id", "")

            # Try to get cached task_id from Redis
            cached_task_id = ""
            if orig_user and orig_conv_id:
                try:
                    tid = await redis_client.get_task(orig_user, orig_conv_id)
                    if tid:
                        cached_task_id = tid
                except Exception:
                    pass

            cmd_body = {
                "inputs": {
                    "conversation_id": orig_conv_id,
                    "user_id": orig_user,
                    "task_id": cached_task_id,
                    "api_key": agent.dify_api_key or "",
                },
                "query": orig_query,
                "response_mode": "blocking",
                "conversation_id": "",
                "user": orig_user,
            }
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as cmd_client:
                cmd_resp = await cmd_client.post(
                    f"{settings.DIFY_COMMAND_URL.rstrip('/')}/chat-messages",
                    json=cmd_body,
                    headers={"Authorization": f"Bearer {settings.DIFY_COMMAND_KEY}"},
                )
                try:
                    cmd_data = cmd_resp.json()
                    cmd_answer = cmd_data.get("answer", "")
                except Exception:
                    cmd_answer = cmd_resp.text.strip()
                if cmd_answer != "PASS":
                    duration_ms = int((time.monotonic() - start) * 1000)
                    await _log_invocation(
                        db, user.id, agent_id, "POST", proxy_path, None,
                        cmd_resp.status_code, duration_ms, "blocked by command",
                    )
                    # Replace command service's temporary conversation_id with the original one
                    cmd_content = cmd_resp.content
                    try:
                        cmd_data = json.loads(cmd_resp.content)
                        if "conversation_id" in cmd_data:
                            cmd_data["conversation_id"] = orig_conv_id
                        if "metadata" in cmd_data and isinstance(cmd_data["metadata"], dict):
                            cmd_data["metadata"]["conversation_id"] = orig_conv_id
                        cmd_content = json.dumps(cmd_data, ensure_ascii=False).encode()
                    except Exception:
                        pass
                    resp = Response(
                        content=cmd_content,
                        status_code=cmd_resp.status_code,
                        media_type=cmd_resp.headers.get("content-type", "text/plain"),
                    )
                    for k, v in _rate_limit_headers(user).items():
                        resp.headers[k] = v
                    return resp
                # Command returned PASS — continue with normal proxy
        except (httpx.ConnectError, httpx.TimeoutException, json.JSONDecodeError):
            # Command service unreachable or body parse error — fall through to normal proxy
            pass

    is_sse = "text/event-stream" in (request.headers.get("accept", "") or "")
    if not is_sse and dify_user:
        is_sse = req_data.get("response_mode") == "streaming"

    task_id: str | None = None
    error_detail: str | None = None
    resp_status: int | None = None

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.PROXY_REQUEST_TIMEOUT_SECONDS)
        ) as client:
            if method == "GET":
                upstream = await client.get(target_url, headers=forward_headers)
            elif method == "PUT":
                upstream = await client.put(target_url, content=body, headers=forward_headers)
            elif method == "DELETE":
                upstream = await client.delete(target_url, headers=forward_headers)
            elif method == "PATCH":
                upstream = await client.patch(target_url, content=body, headers=forward_headers)
            else:
                # POST or other methods — check if SSE streaming is requested
                if is_sse:
                    sse_gen, tid, cid = await _stream_proxy(target_url, body, forward_headers)
                    task_id = tid
                    logger.info(
                        "SSE proxy: dify_user=%s task_id=%s conversation_id=%s",
                        dify_user, task_id, cid,
                    )
                    resp_status = 200
                    duration_ms = int((time.monotonic() - start) * 1000)
                    await _log_invocation(
                        db, user.id, agent_id, method, proxy_path, task_id,
                        resp_status, duration_ms,
                    )
                    if dify_user and cid:
                        await _upsert_session(db, agent_id, dify_user, cid, task_id)
                        if settings.REDIS_ENABLED and task_id:
                            await redis_client.set_task(dify_user, cid, task_id)
                    response = StreamingResponse(
                        content=sse_gen,
                        media_type="text/event-stream",
                        headers={
                            "Cache-Control": "no-cache",
                            "Connection": "keep-alive",
                            "X-Accel-Buffering": "no",
                        },
                    )
                    if task_id:
                        response.headers["X-Dify-Task-ID"] = task_id
                    for k, v in _rate_limit_headers(user).items():
                        response.headers[k] = v
                    return response
                upstream = await client.post(target_url, content=body, headers=forward_headers)

        resp_status = upstream.status_code

        # Extract task_id and conversation_id from non-streaming response
        conversation_id: str | None = None
        try:
            resp_json = upstream.json()
            task_id = resp_json.get("task_id")
            conversation_id = resp_json.get("conversation_id")
        except Exception:
            pass

        response = Response(
            content=upstream.content,
            status_code=resp_status,
            media_type=upstream.headers.get("content-type", "application/json"),
        )

    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        error_detail = f"Dify returned HTTP {exc.response.status_code}"
        resp_status = exc.response.status_code
        try:
            error_body = exc.response.json()
            error_detail = error_body.get("message", error_detail)
        except Exception:
            pass
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_invocation(
            db, user.id, agent_id, method, proxy_path, task_id,
            resp_status, duration_ms, error_detail,
        )
        raise HTTPException(status_code=502, detail=error_detail) from exc
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        error_detail = f"Dify service unreachable: {exc}"
        resp_status = 502
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_invocation(
            db, user.id, agent_id, method, proxy_path, task_id,
            resp_status, duration_ms, error_detail,
        )
        raise HTTPException(status_code=502, detail=error_detail) from exc
    except Exception as exc:
        error_detail = str(exc)
        resp_status = 502
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_invocation(
            db, user.id, agent_id, method, proxy_path, task_id,
            502, duration_ms, error_detail,
        )
        raise

    duration_ms = int((time.monotonic() - start) * 1000)
    await _log_invocation(
        db, user.id, agent_id, method, proxy_path, task_id, resp_status, duration_ms,
    )

    # Write session data (non-SSE path)
    if dify_user and conversation_id:
        await _upsert_session(db, agent_id, dify_user, conversation_id, task_id)
        if settings.REDIS_ENABLED and task_id:
            await redis_client.set_task(dify_user, conversation_id, task_id)

    if task_id:
        response.headers["X-Dify-Task-ID"] = task_id
    for k, v in _rate_limit_headers(user).items():
        response.headers[k] = v

    return response


@router.api_route(
    "/agent/{agent_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def proxy_dify(
    agent_id: str,
    path: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _handle_proxy(agent_id, request, user, db)
