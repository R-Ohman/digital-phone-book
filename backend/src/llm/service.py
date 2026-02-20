from src.llm.schemas import UserPrompt
from src.contacts.service import ContactService
from src.llm.agents.parse import ParseAgent
from src.llm.agents.response import ResponseAgent

class LLMService:
    def __init__(self, contact_service: ContactService):
        self._parse_agent = ParseAgent()
        self._response_agent = ResponseAgent()
        self._contact_service = contact_service

    def process_user_prompt(self, user_prompt: UserPrompt):
        pass
