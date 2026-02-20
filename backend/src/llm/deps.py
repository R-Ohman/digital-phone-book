from typing import Annotated

from fastapi import Depends

from src.contacts.deps import get_contact_service
from src.contacts.service import ContactService
from src.llm.service import LLMService


def get_llm_service(
    contact_service: Annotated[ContactService, Depends(get_contact_service)],
) -> LLMService:
    return LLMService(contact_service)
