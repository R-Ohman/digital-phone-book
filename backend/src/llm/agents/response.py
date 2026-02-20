from typing import Optional

from src.llm.agents.base import BaseAgent
from src.config import settings


class ResponseAgent(BaseAgent):
    def __init__(self, model: Optional[str] = None):
        if model is None:
            model = settings.response_model

        super().__init__(
            model=model,
            temperature=0.0,
            max_tokens=4096,
            base_llm_url=settings.response_llm_url,
        )

    async def execute(self):
        pass
