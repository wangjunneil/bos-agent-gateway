import httpx
from a2a.types import AgentCard
from pydantic import ValidationError

from app.settings import settings


class AgentCardValidationError(Exception):
    def __init__(self, message: str, errors: list[str] | None = None):
        self.message = message
        self.errors = errors or []
        super().__init__(message)


def validate_agent_card(card_data: dict) -> AgentCard:
    """Validate agent card JSON against the official A2A SDK schema.

    Returns the parsed AgentCard on success, raises AgentCardValidationError on failure.
    """
    try:
        return AgentCard.model_validate(card_data)
    except ValidationError as exc:
        errors = [f"{e['loc']}: {e['msg']}" for e in exc.errors()]
        raise AgentCardValidationError(
            f"Agent card validation failed with {len(errors)} error(s)",
            errors=errors,
        ) from exc


def get_proxy_target_url(card_data: dict) -> str:
    """Extract the proxy target URL from the agent card.

    Uses the main `url` field from the agent card.
    """
    return card_data["url"].rstrip("/")


async def fetch_agent_card(base_url: str) -> dict:
    """Fetch and validate agent card from base_url/.well-known/agent-card.json."""
    if not base_url.startswith(("http://", "https://")):
        raise AgentCardValidationError(
            f"Invalid base_url: '{base_url}' — must start with http:// or https://"
        )
    url = f"{base_url.rstrip('/')}/.well-known/agent-card.json"
    async with httpx.AsyncClient(timeout=settings.AGENT_CARD_FETCH_TIMEOUT_SECONDS) as client:
        response = await client.get(url)
        response.raise_for_status()
        card_data = response.json()
        validate_agent_card(card_data)
        return card_data
