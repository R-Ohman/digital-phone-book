import json as _json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from src.llm.deps import get_llm_service
from src.llm.service import LLMService
from src.llm.schemas import UserPrompt, LLMResponse


router = APIRouter(prefix="/llm", tags=["llm"])


@router.post("/prompt", response_model=LLMResponse)
async def process_user_prompt(
    user_prompt: UserPrompt,
    llm_service: Annotated[LLMService, Depends(get_llm_service)],
) -> LLMResponse:
    try:
        return await llm_service.process_user_prompt(user_prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/prompt/stream")
async def stream_user_prompt(
    user_prompt: UserPrompt,
    llm_service: Annotated[LLMService, Depends(get_llm_service)],
) -> StreamingResponse:
    async def generate():
        try:
            async for chunk in llm_service.stream_user_prompt(user_prompt):
                yield _json.dumps(chunk) + "\n"
        except Exception as exc:
            yield _json.dumps({"type": "error", "detail": str(exc)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
