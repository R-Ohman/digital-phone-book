from typing import Any, List, Literal, Optional

from pydantic import Field

from src.schemas import CamelCaseModel


class ChatHistoryMessage(CamelCaseModel):
    role: Literal["user", "assistant"]
    content: str


class UserPrompt(CamelCaseModel):

    prompt: str = Field(max_length=1024)
    history: Optional[List[ChatHistoryMessage]] = None
