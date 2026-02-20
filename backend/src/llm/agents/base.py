from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from src.config import settings


class BaseAgent(ABC):
    def __init__(
        self,
        model: str,
        base_llm_url: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ):
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.provider = settings.llm_provider
        self.llm = ChatOllama(
            model=model,
            temperature=temperature,
            num_predict=max_tokens,
            base_url=base_llm_url,
        )

    @abstractmethod
    async def execute(self, **kwargs) -> Dict[str, Any]:
        pass

    def _create_prompt(self, template: str) -> ChatPromptTemplate:
        return ChatPromptTemplate.from_template(template)

    async def _invoke_llm(self, prompt: ChatPromptTemplate, **kwargs) -> str:
        chain = prompt | self.llm
        response = await chain.ainvoke(kwargs)
        return response.content


class AgentResult:
    def __init__(
        self,
        success: bool,
        data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.success = success
        self.data = data or {}
        self.error = error
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "metadata": self.metadata,
        }
