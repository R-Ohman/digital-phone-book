from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from src.llm.deps import get_llm_service
from src.llm.service import LLMService
from src.llm.schemas import UserPrompt


router = APIRouter(prefix="/llm", tags=["llm"])


@router.post("/prompt")
async def process_user_prompt(
    user_prompt: UserPrompt,
    llm_service: Annotated[LLMService, Depends(get_llm_service)],
):
    try:
        message = await llm_service.process_user_prompt(user_prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"message": message}
