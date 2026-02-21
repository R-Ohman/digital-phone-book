from src.database import AsyncSessionLocal
from src.llm.service import LLMService


def get_llm_service() -> LLMService:
    return LLMService(AsyncSessionLocal)
