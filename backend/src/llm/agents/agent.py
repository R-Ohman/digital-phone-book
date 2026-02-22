import json
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_ollama import ChatOllama
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.config import settings
from .prompt_builder import PROMPT
from .tools import build_tools
from .ui_builder import build_contact_card, build_delete_confirmation


class ToolCallAgent:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        model: Optional[str] = None,
    ):
        self._llm = ChatOllama(
            model=model or settings.llm_model,
            temperature=0.0,
            num_predict=4096,
            base_url=settings.llm_url,
        )
        tools = build_tools(session_factory)
        agent = create_tool_calling_agent(self._llm, tools, PROMPT)
        self._executor = AgentExecutor(
            agent=agent,
            tools=tools,
            handle_parsing_errors=True,
            return_intermediate_steps=True,
        )

    async def execute_stream(
        self, user_prompt: str, history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream tokens, then emit A2UI surface messages and a done signal."""
        tool_results: List[Tuple[str, str]] = []
        tool_calling_runs: set = set()

        async for event in self._executor.astream_events(
            {"input": user_prompt, "chat_history": self._build_chat_history(history)},
            version="v2",
        ):
            event_name = event.get("event")
            run_id = event.get("run_id")

            if event_name == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk is not None:
                    if getattr(chunk, "tool_call_chunks", None):
                        tool_calling_runs.add(run_id)
                    content = getattr(chunk, "content", "")
                    if (
                        isinstance(content, str)
                        and content
                        and run_id not in tool_calling_runs
                    ):
                        yield {"type": "token", "text": content}

            elif event_name == "on_tool_end":
                tool_name = event.get("name", "")
                output = event.get("data", {}).get("output", "")
                if isinstance(output, str) and tool_name:
                    tool_results.append((tool_name, output))

        a2ui = self._build_a2ui_from_steps(self._wrap_steps(tool_results))
        if a2ui:
            yield {"type": "a2ui", "messages": a2ui}
        yield {"type": "done"}

    @staticmethod
    def _build_chat_history(history: Optional[List[Dict[str, str]]]) -> list:
        mapping = {"user": HumanMessage, "assistant": AIMessage}
        return [
            mapping[msg["role"]](content=msg.get("content", ""))
            for msg in (history or [])
            if msg.get("role") in mapping
        ]

    @staticmethod
    def _wrap_steps(tool_results: List[Tuple[str, str]]) -> List:
        """Wrap (tool_name, output) pairs into objects compatible with _build_a2ui_from_steps."""

        class _Step:
            def __init__(self, tool: str):
                self.tool = tool

        return [(_Step(name), obs) for name, obs in tool_results]

    @staticmethod
    def _build_a2ui_from_steps(steps: List) -> Optional[List]:
        """Convert intermediate agent steps into A2UI surface messages.

        Two-pass approach:
          1. Collect contact IDs that will receive a delete-confirmation card.
          2. Build UI messages, skipping regular contact cards for those IDs.
        """
        confirm_ids: set = set()
        for action, observation in steps:
            if getattr(action, "tool", None) == "propose_delete_contact":
                try:
                    data = json.loads(observation)
                    if data.get("proposed"):
                        confirm_ids.add(data["id"])
                except (json.JSONDecodeError, KeyError):
                    pass

        a2ui_messages: List = []
        seen_ids: set = set()
        seen_confirm_ids: set = set()

        for action, observation in steps:
            tool = getattr(action, "tool", None)
            try:
                data = json.loads(observation)
            except (json.JSONDecodeError, TypeError):
                continue

            if tool == "get_contact":
                cid = data.get("id")
                if data.get("found") and cid not in seen_ids and cid not in confirm_ids:
                    seen_ids.add(cid)
                    a2ui_messages.extend(
                        build_contact_card(data["name"], data["phone_number"], cid)
                    )

            elif tool in ("add_contact", "update_contact"):
                cid = data.get("id")
                if data.get("success") and cid not in seen_ids:
                    seen_ids.add(cid)
                    a2ui_messages.extend(
                        build_contact_card(data["name"], data["phone_number"], cid)
                    )

            elif tool == "propose_delete_contact":
                cid = data.get("id")
                if data.get("proposed") and cid not in seen_confirm_ids:
                    seen_confirm_ids.add(cid)
                    a2ui_messages.extend(
                        build_delete_confirmation(
                            data["name"], data["phone_number"], cid
                        )
                    )

        return a2ui_messages or None
