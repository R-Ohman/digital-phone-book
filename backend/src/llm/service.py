from typing import AsyncGenerator, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.llm.schemas import UserPrompt
from src.llm.agents.agent import ToolCallAgent


class LLMService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def stream_user_prompt(
        self, user_prompt: UserPrompt
    ) -> AsyncGenerator[Dict[str, Any], None]:
        agent = ToolCallAgent(session_factory=self._session_factory)
        async for chunk in agent.execute_stream(user_prompt.prompt):
            yield chunk
