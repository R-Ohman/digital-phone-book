from pydantic import BaseModel, Field


class UserPrompt(BaseModel):

    prompt: str = Field(max_length=1024)
