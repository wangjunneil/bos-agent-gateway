import httpx

from app.settings import settings


class DifyError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


async def fetch_dify_info(base_url: str, api_key: str) -> dict:
    """Fetch Dify app info from {base_url}/info (base_url already includes /v1)."""
    if not base_url.startswith(("http://", "https://")):
        raise DifyError(f"Invalid base_url: '{base_url}'")

    url = f"{base_url.rstrip('/')}/v1/info"
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=settings.AGENT_CARD_FETCH_TIMEOUT_SECONDS) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if status_code in (401, 403):
                raise DifyError("Dify API Key is invalid or unauthorized") from exc
            raise DifyError(f"Dify /v1/info returned HTTP {status_code}") from exc
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            raise DifyError(f"Dify service unreachable at {base_url}: {exc}") from exc
