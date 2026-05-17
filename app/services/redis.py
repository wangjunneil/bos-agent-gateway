import json

from app.settings import settings


class RedisClient:
    def __init__(self) -> None:
        self._client = None
        if settings.REDIS_ENABLED:
            import redis.asyncio as aioredis

            kwargs: dict = {
                "host": settings.REDIS_HOST,
                "port": settings.REDIS_PORT,
            }
            if settings.REDIS_USERNAME:
                kwargs["username"] = settings.REDIS_USERNAME
            if settings.REDIS_PASSWORD:
                kwargs["password"] = settings.REDIS_PASSWORD
            self._client = aioredis.Redis(**kwargs)

    async def set_task(self, dify_user: str, conversation_id: str, task_id: str) -> None:
        if not self._client:
            return
        key = f"GATEWAY:{dify_user}:{conversation_id}"
        value = json.dumps({
            "user_id": dify_user,
            "conversation_id": conversation_id,
            "task_id": task_id,
        }, ensure_ascii=False)
        await self._client.set(key, value)

    async def get_task(self, dify_user: str, conversation_id: str) -> str | None:
        if not self._client:
            return None
        key = f"GATEWAY:{dify_user}:{conversation_id}"
        data = await self._client.get(key)
        if data:
            return json.loads(data).get("task_id")
        return None


redis_client = RedisClient()
