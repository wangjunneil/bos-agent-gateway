import time
from collections import defaultdict

from fastapi import HTTPException

from app.settings import settings


class RateLimiter:
    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        if limit <= 0:
            return

        now = time.monotonic()
        cutoff = now - window_seconds
        self._windows[key] = [t for t in self._windows[key] if t > cutoff]

        if len(self._windows[key]) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: {limit} requests per {window_seconds}s",
            )

        self._windows[key].append(now)


limiter = RateLimiter()


def effective_rate_limit(user) -> int:
    """Determine the effective rate limit for a user."""
    if user.role == "admin":
        return settings.RATE_LIMIT_ADMIN_RPM  # 0 = unlimited
    return user.rate_limit or settings.RATE_LIMIT_DEFAULT_RPM


def check_rate_limit_for_user(user) -> None:
    """Check rate limit using the user's effective limit, keyed by user.id."""
    if not settings.RATE_LIMIT_ENABLED:
        return

    limit = effective_rate_limit(user)
    limiter.check(
        key=user.id,
        limit=limit,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )
