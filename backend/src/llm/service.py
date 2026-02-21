from src.llm.schemas import UserPrompt
from src.contacts.service import ContactService
from src.llm.agents.tool_call import ToolCallAgent


class LLMService:
    def __init__(self, contact_service: ContactService):
        self._contact_service = contact_service

    async def process_user_prompt(self, user_prompt: UserPrompt) -> str:
        agent = ToolCallAgent(contact_service=self._contact_service)
        return await agent.execute(user_prompt.prompt)
