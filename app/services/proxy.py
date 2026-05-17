from collections.abc import AsyncGenerator

import httpx
from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse

from app.services.agent_card import get_proxy_target_url
from app.settings import settings

FORWARD_HEADERS = {"content-type", "authorization", "a2a-version", "a2a-extensions"}


async def proxy_request(
    agent_card: dict,
    path: str,
    body: bytes,
    stream: bool = False,
    headers: dict[str, str] | None = None,
) -> Response | StreamingResponse:
    target_base = get_proxy_target_url(agent_card)
    target_url = f"{target_base}/{path.lstrip('/')}"

    forward = {}
    if headers:
        forward = {k: v for k, v in headers.items() if k.lower() in FORWARD_HEADERS}

    if stream:
        return StreamingResponse(
            content=_stream_from_agent(target_url, body, forward),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.PROXY_REQUEST_TIMEOUT_SECONDS)
        ) as client:
            resp = await client.post(target_url, content=body, headers=forward)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "application/json"),
            )
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise HTTPException(status_code=502, detail=f"Agent unreachable: {exc}") from exc


async def _stream_from_agent(
    target_url: str, body: bytes, headers: dict[str, str]
) -> AsyncGenerator[bytes, None]:
    try:
        async with (
            httpx.AsyncClient(timeout=httpx.Timeout(settings.PROXY_SSE_TIMEOUT_SECONDS)) as client,
            client.stream("POST", target_url, content=body, headers=headers) as response,
        ):
            async for chunk in response.aiter_bytes():
                yield chunk
    except (httpx.ConnectError, httpx.TimeoutException):
        return
