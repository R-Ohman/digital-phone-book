from src.llm.schemas import UserPrompt
from src.contacts.service import ContactService
from openai import OpenAI
from src.config import settings


class LLMService:
    def __init__(self, contact_service: ContactService):
        self._contact_service = contact_service
        self._llm_client = OpenAI(
            base_url=settings.llm_url,
            api_key="api_key",
        )

    def process_user_prompt(self, user_prompt: UserPrompt):
        pass
