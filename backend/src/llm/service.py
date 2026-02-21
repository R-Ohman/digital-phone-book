from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.llm.schemas import UserPrompt
from src.llm.agents.tool_call import ToolCallAgent


class LLMService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def process_user_prompt(self, user_prompt: UserPrompt) -> str:
        agent = ToolCallAgent(session_factory=self._session_factory)
        return await agent.execute(user_prompt.prompt)
