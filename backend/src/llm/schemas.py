from typing import Any, List, Optional

from pydantic import Field

from src.schemas import CamelCaseModel


class UserPrompt(CamelCaseModel):

    prompt: str = Field(max_length=1024)


class LLMResponse(CamelCaseModel):
    message: str
    a2ui_messages: Optional[List[Any]] = None
