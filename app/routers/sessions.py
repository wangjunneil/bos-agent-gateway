from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import User
from app.dependencies import get_current_user
from app.services.redis import redis_client

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@router.get("/task-id")
async def get_task_id(
    user: str = Query(..., description="Dify user identifier"),
    conversation_id: str = Query(..., description="Dify conversation ID"),
    _u: User = Depends(get_current_user),
) -> dict:
    task_id = await redis_client.get_task(user, conversation_id)
    if not task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found for this user and conversation",
        )
    return {
        "user_id": user,
        "conversation_id": conversation_id,
        "task_id": task_id,
    }
