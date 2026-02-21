from pydantic import Field

from src.schemas import CamelCaseModel


class UserPrompt(CamelCaseModel):

    prompt: str = Field(max_length=1024)
