import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.config import settings
from src.contacts.schemas import ContactResponse
from .tools import build_tools
from .ui_builder import build_contact_card, build_delete_confirmation

logger = logging.getLogger(__name__)

# Tools whose output requires LLM reasoning instead of a hardcoded reply
_REASONING_TOOLS = {"get_all_contacts"}
_REASONING_SYSTEM = "Answer the user's question concisely and directly based only on the provided contact data."

SYSTEM_PROMPT = """You are a phone-book assistant. Use tools to manage contacts.

Rules:
- When looking up one or more specific named contacts, call get_contact once per name. Never use get_all_contacts for named lookups.
- Only use get_all_contacts when the user asks for the full list, all contacts, or wants to filter/search without specifying exact names.
- Adding a contact requires BOTH a name AND a phone number. If the phone number is missing, ask for it first — do NOT call add_contact.
- For update requests (changing name or phone number), call update_contact directly with the current name and new values. Do NOT call get_contact before it.
- For delete requests, call propose_delete_contact directly. Never call get_contact before it.
- For conditional requests (e.g. "if X exists update them"), call get_contact first, then decide.
- Complete all requested operations before replying.
- Be concise.
"""


class ToolCallAgent:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        model: Optional[str] = None,
    ):
        self._llm = ChatOllama(
            model=model or settings.llm_model,
            temperature=0.0,
            num_predict=256,
            base_url=settings.llm_url,
        )
        self._tools = build_tools(session_factory)
        self._tool_map = {t.name: t for t in self._tools}
        self._llm_with_tools = self._llm.bind_tools(self._tools)

    async def execute_stream(
        self, user_prompt: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        messages = self._build_messages(user_prompt)
        logger.info("> Processing | prompt: %s", user_prompt)

        accumulated: Optional[Any] = None
        is_tool_calling = False
        streamed_text = False

        async for chunk in self._llm_with_tools.astream(messages):
            if getattr(chunk, "tool_call_chunks", None):
                is_tool_calling = True

            content = getattr(chunk, "content", "")
            if not is_tool_calling and isinstance(content, str) and content:
                streamed_text = True
                yield {"type": "token", "text": content}

            accumulated = chunk if accumulated is None else accumulated + chunk

        try:
            usage = accumulated.usage_metadata or {}
            logger.info(
                "LLM usage | in=%s out=%s total=%s tokens",
                usage.get("input_tokens", "?"),
                usage.get("output_tokens", "?"),
                usage.get("total_tokens", "?"),
            )
        except Exception:
            pass

        tool_calls = getattr(accumulated, "tool_calls", []) or []

        if tool_calls:
            tool_results = await self._run_tools(tool_calls)
            needs_reasoning = any(name in _REASONING_TOOLS for name, _ in tool_results)

            if needs_reasoning:
                async for event in self._stream_reasoning_response(
                    user_prompt, tool_results
                ):
                    yield event
            else:
                response_text = self._build_response_text(tool_results)
                if response_text:
                    yield {"type": "token", "text": response_text}

            a2ui = self._build_a2ui_from_steps(tool_results)
            if a2ui:
                yield {"type": "a2ui", "messages": a2ui}

        elif not streamed_text:
            fallback = getattr(accumulated, "content", "") or ""
            if fallback:
                yield {"type": "token", "text": fallback}

        yield {"type": "done"}

    async def _run_tools(self, tool_calls: list) -> List[Tuple[str, str]]:
        """Invoke each requested tool and return (tool_name, json_output) pairs."""
        results: List[Tuple[str, str]] = []

        for tool_call in tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_fn = self._tool_map.get(tool_name)

            if tool_fn is None:
                logger.warning("[TOOL] unknown tool: %s", tool_name)
                continue

            logger.info("[TOOL] %s | args: %s", tool_name, tool_args)
            output = await tool_fn.ainvoke(tool_args)

            if not isinstance(output, str):
                output = json.dumps(output)

            logger.info("[TOOL] %s | result: %s", tool_name, output)
            results.append((tool_name, output))

        return results

    async def _stream_reasoning_response(
        self, user_prompt: str, tool_results: List[Tuple[str, str]]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        data_payload = json.dumps(
            {name: json.loads(output) for name, output in tool_results},
            ensure_ascii=False,
        )
        messages = [
            SystemMessage(content=_REASONING_SYSTEM),
            HumanMessage(
                content=f"Question: {user_prompt}\n\nContact data: {data_payload}"
            ),
        ]
        async for chunk in self._llm.astream(messages):
            content = getattr(chunk, "content", "")
            if isinstance(content, str) and content:
                yield {"type": "token", "text": content}

    @staticmethod
    def _build_messages(user_prompt: str) -> list:
        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]

    @staticmethod
    def _build_response_text(tool_results: List[Tuple[str, str]]) -> str:
        parts: List[str] = []

        for tool_name, output in tool_results:
            try:
                data = json.loads(output)
            except (json.JSONDecodeError, TypeError):
                continue

            if tool_name == "get_contact":
                if data.get("multiple_found"):
                    lines = ["Multiple contacts found:"]
                    for c in data["contacts"]:
                        lines.append(f"- **{c['name']}**: {c['phone_number']}")
                    parts.append("\n".join(lines))
                elif data.get("success"):
                    parts.append(f"Found **{data['name']}**: {data['phone_number']}")
                else:
                    parts.append(f"No contact named **{data['name']}** was found.")

            elif tool_name == "add_contact":
                if data.get("success"):
                    parts.append(
                        f"Added **{data['name']}** ({data['phone_number']}) to your contacts."
                    )
                else:
                    parts.append(
                        f"Failed to add contact: {data.get('error', 'unknown error')}"
                    )

            elif tool_name == "update_contact":
                if data.get("multiple_found"):
                    lines = ["Multiple contacts with that name were found:"]
                    for c in data["contacts"]:
                        lines.append(f"- **{c['name']}**: {c['phone_number']}")
                    lines.append(
                        "\nYou can change the contact manually using a card below."
                    )
                    parts.append("\n".join(lines))
                elif data.get("success"):
                    parts.append(
                        f"Updated contact: **{data['name']}** - {data['phone_number']}."
                    )
                else:
                    parts.append(
                        f"Could not update contact: {data.get('error', 'unknown error')}"
                    )

            elif tool_name == "propose_delete_contact":
                if data.get("multiple_found"):
                    lines = ["Multiple contacts with that name were found:"]
                    for c in data["contacts"]:
                        lines.append(f"- **{c['name']}**: {c['phone_number']}")
                    lines.append(
                        "\nYou can delete the contact manually using a card below."
                    )
                    parts.append("\n".join(lines))
                elif data.get("proposed"):
                    parts.append(
                        f"Found **{data['name']}**. Please confirm the deletion using the card below."
                    )
                else:
                    parts.append(f"No contact named **{data['name']}** was found.")

        return "\n\n".join(parts)

    @staticmethod
    def _build_a2ui_from_steps(tool_results: List[Tuple[str, str]]) -> Optional[List]:
        a2ui_messages: List = []
        contact_card_ids: set = set()
        delete_confirmation_ids: set = set()

        for tool_name, output in tool_results:
            try:
                data = json.loads(output)
            except (json.JSONDecodeError, TypeError):
                continue

            if not isinstance(data, dict):
                continue

            contact_id = data.get("id")

            if tool_name in ("get_contact", "add_contact", "update_contact"):
                if data.get("multiple_found") and tool_name in (
                    "get_contact",
                    "update_contact",
                ):
                    for c in data["contacts"]:
                        if c["id"] not in contact_card_ids:
                            contact_card_ids.add(c["id"])
                            a2ui_messages.extend(
                                build_contact_card(ContactResponse.model_validate(c))
                            )
                elif (
                    data.get("success")
                    and not data.get("multiple_found")
                    and contact_id not in contact_card_ids
                ):
                    contact_card_ids.add(contact_id)
                    a2ui_messages.extend(
                        build_contact_card(ContactResponse.model_validate(data))
                    )

            elif tool_name == "propose_delete_contact":
                if data.get("multiple_found"):
                    for c in data["contacts"]:
                        if c["id"] not in contact_card_ids:
                            contact_card_ids.add(c["id"])
                            a2ui_messages.extend(
                                build_contact_card(ContactResponse.model_validate(c))
                            )
                elif data.get("proposed") and contact_id not in delete_confirmation_ids:
                    delete_confirmation_ids.add(contact_id)
                    a2ui_messages.extend(
                        build_delete_confirmation(ContactResponse.model_validate(data))
                    )

        return a2ui_messages or None
