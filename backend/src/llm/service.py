from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.llm.schemas import UserPrompt, LLMResponse
from src.llm.agents.tool_call import ToolCallAgent


class LLMService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def process_user_prompt(self, user_prompt: UserPrompt) -> LLMResponse:
        agent = ToolCallAgent(session_factory=self._session_factory)
        text, a2ui_messages = await agent.execute(user_prompt.prompt)
        return LLMResponse(message=text, a2ui_messages=a2ui_messages)
