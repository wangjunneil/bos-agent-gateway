import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, field_validator

# Sentinel to distinguish "field not sent" from "field sent as null"
_UNSET = object()


TAG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,19}$")


def validate_tags(tags: list[str]) -> list[str]:
    if len(tags) > 10:
        raise ValueError("Maximum 10 tags per agent")
    cleaned = []
    for tag in tags:
        t = tag.lower().strip()
        if not TAG_PATTERN.match(t):
            raise ValueError(
                f"Invalid tag '{t}': only lowercase alphanumeric and hyphens, max 20 chars"
            )
        cleaned.append(t)
    return list(dict.fromkeys(cleaned))  # deduplicate preserving order


class AgentCreate(BaseModel):
    base_url: str
    tags: list[str] = []

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v: list[str]) -> list[str]:
        return validate_tags(v)


class AgentUpdate(BaseModel):
    is_public: bool | None = None
    base_url: str | None = None
    tags: list[str] | None = None

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return validate_tags(v)


class AgentResponse(BaseModel):
    id: str
    base_url: str
    name: str | None = None
    description: str | None = None
    status: str
    last_seen: datetime | None = None
    is_public: bool
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentDetailResponse(AgentResponse):
    agent_card: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    username: str


class UserUpdate(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    username: str | None = None
    is_active: bool | None = None
    role: str | None = None
    rate_limit: int | None | object = _UNSET


class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    is_active: bool
    rate_limit: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserCreateResponse(UserResponse):
    api_key: str

    model_config = ConfigDict(from_attributes=True)


class UserDetailResponse(UserResponse):
    agents: list[AgentResponse] = []

    model_config = ConfigDict(from_attributes=True)


class AgentAssign(BaseModel):
    agent_ids: list[str]


class ApiKeyResponse(BaseModel):
    api_key: str


class ErrorResponse(BaseModel):
    detail: str
    error_code: str | None = None
    timestamp: str | None = None
    validation_errors: list | None = None
    retry_after: int | None = None
    agent_id: str | None = None


# --- Stats models ---

class AgentStats(BaseModel):
    agent_id: str
    agent_name: str | None
    total_invocations: int
    success_count: int
    error_count: int
    avg_duration_ms: float | None
    p95_duration_ms: float | None
    last_invocation: datetime | None
    status: str


class GatewayStats(BaseModel):
    total_agents: int
    online_agents: int
    offline_agents: int
    error_agents: int
    total_users: int
    active_users: int
    total_invocations_24h: int
    total_invocations_7d: int
    error_rate_24h: float
    avg_duration_ms_24h: float | None
    invocations_per_hour: list[dict]
    top_agents: list[AgentStats]


class TagCount(BaseModel):
    tag: str
    count: int
