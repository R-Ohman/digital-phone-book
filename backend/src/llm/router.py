from typing import Annotated

from fastapi import Depends

from src.contacts import router
from src.llm.deps import get_llm_service
from src.llm.service import LLMService
from src.llm.schemas import UserPrompt


@router.post("/prompt")
async def process_user_prompt(
    user_prompt: UserPrompt,
    llm_service: Annotated[LLMService, Depends(get_llm_service)],
):
    message = await llm_service.process_user_prompt(user_prompt)

    return {"message": message}
