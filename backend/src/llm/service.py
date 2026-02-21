from typing import AsyncGenerator, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.llm.schemas import UserPrompt, LLMResponse
from src.llm.agents.tool_call import ToolCallAgent


class LLMService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def process_user_prompt(self, user_prompt: UserPrompt) -> LLMResponse:
        history = (
            [m.model_dump() for m in user_prompt.history]
            if user_prompt.history
            else None
        )
        agent = ToolCallAgent(session_factory=self._session_factory)
        text, a2ui_messages = await agent.execute(user_prompt.prompt, history=history)
        return LLMResponse(message=text, a2ui_messages=a2ui_messages)

    async def stream_user_prompt(
        self, user_prompt: UserPrompt
    ) -> AsyncGenerator[Dict[str, Any], None]:
        history = (
            [m.model_dump() for m in user_prompt.history]
            if user_prompt.history
            else None
        )
        agent = ToolCallAgent(session_factory=self._session_factory)
        async for chunk in agent.execute_stream(user_prompt.prompt, history=history):
            yield chunk
