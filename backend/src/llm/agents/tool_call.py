import json
from typing import AsyncGenerator, Dict, Any, Optional, List, Tuple

from langchain_classic.agents import (
    AgentExecutor,
    create_tool_calling_agent,
)
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import StructuredTool
from langchain_ollama import ChatOllama
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contacts.service import ContactService
from src.contacts.repository import ContactRepository
from src.contacts.schemas import ContactCreate, ContactUpdate
from src.config import settings
from .schemas import (
    GetContactInput,
    GetAllContactsInput,
    AddContactInput,
    DeleteContactInput,
    UpdateContactInput,
)


def _build_contact_card_a2ui(name: str, phone: str, contact_id: str) -> List:
    """Return the three A2UI v0.8 messages that render a contact card surface."""
    surface_id = f"contact-card-{contact_id}"
    return [
        {
            "surfaceUpdate": {
                "surfaceId": surface_id,
                "components": [
                    {"id": "root", "component": {"Card": {"child": "main-column"}}},
                    {
                        "id": "main-column",
                        "component": {
                            "Column": {
                                "children": {
                                    "explicitList": [
                                        "header-row",
                                        "divider",
                                        "phone-row",
                                        "actions",
                                    ]
                                }
                            }
                        },
                    },
                    {
                        "id": "header-row",
                        "component": {
                            "Row": {
                                "distribution": "spaceBetween",
                                "alignment": "center",
                                "children": {
                                    "explicitList": ["name-text", "close-btn"]
                                },
                            }
                        },
                    },
                    {
                        "id": "name-text",
                        "component": {
                            "Text": {
                                "text": {"literalString": name},
                                "usageHint": "h2",
                            }
                        },
                    },
                    {
                        "id": "close-btn-icon",
                        "component": {"Icon": {"name": {"literalString": "close"}}},
                    },
                    {
                        "id": "close-btn",
                        "component": {
                            "Button": {
                                "child": "close-btn-icon",
                                "action": {
                                    "name": "close",
                                    "context": [
                                        {
                                            "key": "surfaceId",
                                            "value": {"literalString": surface_id},
                                        }
                                    ],
                                },
                            }
                        },
                    },
                    {"id": "divider", "component": {"Divider": {}}},
                    {
                        "id": "phone-row",
                        "component": {
                            "Row": {
                                "children": {
                                    "explicitList": ["phone-icon", "phone-text"]
                                }
                            }
                        },
                    },
                    {
                        "id": "phone-icon",
                        "component": {"Icon": {"name": {"literalString": "phone"}}},
                    },
                    {
                        "id": "phone-text",
                        "component": {"Text": {"text": {"literalString": phone}}},
                    },
                    {
                        "id": "actions",
                        "component": {
                            "List": {
                                "children": {"explicitList": ["call-btn", "delete-btn"]}
                            }
                        },
                    },
                    {
                        "id": "call-btn-label",
                        "component": {"Text": {"text": {"literalString": "Call"}}},
                    },
                    {
                        "id": "call-btn",
                        "component": {
                            "Button": {
                                "child": "call-btn-label",
                                "action": {
                                    "name": "call",
                                    "context": [
                                        {
                                            "key": "phone",
                                            "value": {"literalString": phone},
                                        }
                                    ],
                                },
                            }
                        },
                    },
                    {
                        "id": "delete-btn-label",
                        "component": {"Text": {"text": {"literalString": "Delete"}}},
                    },
                    {
                        "id": "delete-btn",
                        "component": {
                            "Button": {
                                "child": "delete-btn-label",
                                "action": {
                                    "name": "delete",
                                    "context": [
                                        {
                                            "key": "id",
                                            "value": {"literalString": contact_id},
                                        },
                                        {
                                            "key": "name",
                                            "value": {"literalString": name},
                                        },
                                    ],
                                },
                            }
                        },
                    },
                ],
            }
        },
        {
            "dataModelUpdate": {
                "surfaceId": surface_id,
                "contents": [
                    {"key": "name", "valueString": name},
                    {"key": "phone", "valueString": phone},
                ],
            }
        },
        {
            "beginRendering": {
                "surfaceId": surface_id,
                "root": "root",
            }
        },
    ]


def _build_delete_confirmation_a2ui(name: str, phone: str, contact_id: str) -> List:
    """Return A2UI messages that render a delete confirmation card."""
    surface_id = f"delete-confirm-{contact_id}"
    return [
        {
            "surfaceUpdate": {
                "surfaceId": surface_id,
                "components": [
                    {"id": "root", "component": {"Card": {"child": "contentColumn"}}},
                    {
                        "id": "contentColumn",
                        "component": {
                            "Column": {
                                "children": {
                                    "explicitList": [
                                        "confirmationText",
                                        "contactInfo",
                                        "actionRow",
                                    ]
                                },
                                "alignment": "center",
                                "distribution": "spaceAround",
                            }
                        },
                    },
                    {
                        "id": "confirmationText",
                        "component": {
                            "Text": {
                                "text": {
                                    "literalString": "Are you sure you want to delete this contact?"
                                },
                                "usageHint": "h3",
                            }
                        },
                    },
                    {
                        "id": "contactInfo",
                        "component": {
                            "Column": {
                                "children": {
                                    "explicitList": ["contactName", "contactPhone"]
                                },
                                "alignment": "center",
                            }
                        },
                    },
                    {
                        "id": "contactName",
                        "component": {
                            "Text": {
                                "text": {"path": "/contact/name"},
                                "usageHint": "h4",
                            }
                        },
                    },
                    {
                        "id": "contactPhone",
                        "component": {
                            "Text": {
                                "text": {"path": "/contact/phone_number"},
                                "usageHint": "body",
                            }
                        },
                    },
                    {
                        "id": "actionRow",
                        "component": {
                            "Row": {
                                "children": {
                                    "explicitList": [
                                        "confirmDeleteButton",
                                        "cancelDeleteButton",
                                    ]
                                },
                                "distribution": "spaceEvenly",
                                "alignment": "center",
                            }
                        },
                    },
                    {
                        "id": "confirmDeleteText",
                        "component": {"Text": {"text": {"literalString": "Confirm"}}},
                    },
                    {
                        "id": "confirmDeleteButton",
                        "component": {
                            "Button": {
                                "child": "confirmDeleteText",
                                "action": {
                                    "name": "confirm-delete",
                                    "context": [
                                        {
                                            "key": "id",
                                            "value": {"literalString": contact_id},
                                        },
                                        {
                                            "key": "contactName",
                                            "value": {"path": "/contact/name"},
                                        },
                                        {
                                            "key": "surfaceId",
                                            "value": {"literalString": surface_id},
                                        },
                                    ],
                                },
                            }
                        },
                    },
                    {
                        "id": "cancelDeleteText",
                        "component": {"Text": {"text": {"literalString": "Cancel"}}},
                    },
                    {
                        "id": "cancelDeleteButton",
                        "component": {
                            "Button": {
                                "child": "cancelDeleteText",
                                "action": {
                                    "name": "cancel-delete",
                                    "context": [
                                        {
                                            "key": "surfaceId",
                                            "value": {"literalString": surface_id},
                                        }
                                    ],
                                },
                            }
                        },
                    },
                ],
            }
        },
        {
            "dataModelUpdate": {
                "surfaceId": surface_id,
                "contents": [
                    {
                        "key": "contact",
                        "valueMap": [
                            {"key": "name", "valueString": name},
                            {"key": "phone_number", "valueString": phone},
                        ],
                    }
                ],
            }
        },
        {
            "beginRendering": {
                "surfaceId": surface_id,
                "root": "root",
            }
        },
    ]


_BASE_SYSTEM_PROMPT = """You are a phone book assistant with access to tools for managing contacts.

Think step by step:
- Use tools to look up information before making conditional decisions.
- For requests like "if John exists update him, otherwise create him", first call get_contact to check, then decide.
- For queries like "how many contacts have a prefix [prefix]", call get_all_contacts then reason over the results.
- For swap requests like "swap phone numbers of A and B", first call get_contact for both A and B to retrieve their current numbers, then call update_contact on A with B's number, then call update_contact on B with A's original number.
- Execute every requested operation before writing your final answer.
- IMPORTANT: To add a contact you need BOTH a name AND a phone number. If the user asks to create or add a contact but does not provide a phone number, do NOT call add_contact. Instead, ask the user to provide the phone number first, then add the contact once you have it.
- If you require any other additional data to perform an action, ask the user to provide it before proceeding.
- IMPORTANT: For delete requests, ONLY call propose_delete_contact. Do NOT call get_contact first. propose_delete_contact verifies the contact exists internally and shows the user a confirmation card if found. If the contact does not exist it returns not-found and you should tell the user. Never call get_contact before propose_delete_contact for a delete operation.
- Be concise and conversational in your final response.
"""

SYSTEM_PROMPT = _BASE_SYSTEM_PROMPT

PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ]
)


class ToolCallAgent:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        model: Optional[str] = None,
    ):
        self._session_factory = session_factory
        model = model or settings.llm_model
        self._llm = ChatOllama(
            model=model,
            temperature=0.0,
            num_predict=4096,
            base_url=settings.llm_url,
        )
        self._tools = self._build_tools()
        agent = create_tool_calling_agent(self._llm, self._tools, PROMPT)
        self._executor = AgentExecutor(
            agent=agent,
            tools=self._tools,
            handle_parsing_errors=True,
            return_intermediate_steps=True,
        )

    @staticmethod
    def _build_chat_history(history: Optional[List[Dict[str, str]]]) -> List:
        messages = []
        for msg in history or []:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        return messages

    @staticmethod
    def _build_a2ui_from_steps(steps: List) -> Optional[List]:
        """Convert intermediate agent steps into A2UI messages.

        Uses a two-pass approach: first collect IDs that will have a
        confirmation card, then skip regular contact cards for those IDs.
        """
        # Pass 1: collect IDs that get a delete confirmation card.
        confirm_ids: set = set()
        for action, observation in steps:
            if getattr(action, "tool", None) == "propose_delete_contact":
                try:
                    data = json.loads(observation)
                    if data.get("proposed"):
                        confirm_ids.add(data["id"])
                except (json.JSONDecodeError, KeyError):
                    pass

        # Pass 2: build messages, skipping regular cards for confirmed-delete IDs.
        a2ui_messages: List = []
        seen_ids: set = set()
        seen_confirm_ids: set = set()
        for action, observation in steps:
            tool = getattr(action, "tool", None)
            if tool == "get_contact":
                try:
                    data = json.loads(observation)
                    if (
                        data.get("found")
                        and data["id"] not in seen_ids
                        and data["id"] not in confirm_ids
                    ):
                        seen_ids.add(data["id"])
                        a2ui_messages.extend(
                            _build_contact_card_a2ui(
                                data["name"], data["phone_number"], data["id"]
                            )
                        )
                except (json.JSONDecodeError, KeyError):
                    pass
            elif tool in ("add_contact", "update_contact"):
                try:
                    data = json.loads(observation)
                    if data.get("success") and data["id"] not in seen_ids:
                        seen_ids.add(data["id"])
                        a2ui_messages.extend(
                            _build_contact_card_a2ui(
                                data["name"], data["phone_number"], data["id"]
                            )
                        )
                except (json.JSONDecodeError, KeyError):
                    pass
            elif tool == "propose_delete_contact":
                try:
                    data = json.loads(observation)
                    if data.get("proposed") and data["id"] not in seen_confirm_ids:
                        seen_confirm_ids.add(data["id"])
                        a2ui_messages.extend(
                            _build_delete_confirmation_a2ui(
                                data["name"], data["phone_number"], data["id"]
                            )
                        )
                except (json.JSONDecodeError, KeyError):
                    pass

        return a2ui_messages if a2ui_messages else None

    async def execute(
        self, user_prompt: str, history: Optional[List[Dict[str, str]]] = None
    ) -> Tuple[str, Optional[List]]:
        result = await self._executor.ainvoke(
            {"input": user_prompt, "chat_history": self._build_chat_history(history)}
        )
        raw_output: str = result.get("output", "") or ""
        a2ui_messages = self._build_a2ui_from_steps(
            result.get("intermediate_steps", [])
        )
        return raw_output.strip(), a2ui_messages

    async def execute_stream(
        self, user_prompt: str, history: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream the agent response token-by-token, then emit A2UI messages."""
        # Collect tool results for post-processing (same two-pass logic as execute).
        tool_results: List[Tuple[str, str]] = []
        # run_ids where the LLM issued tool calls (tokens from these runs are suppressed)
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

        # Build a2ui using the same two-pass logic as execute.
        # Wrap results in fake action objects compatible with _build_a2ui_from_steps.
        class _FakeAction:
            def __init__(self, tool: str):
                self.tool = tool

        steps = [(_FakeAction(name), obs) for name, obs in tool_results]
        a2ui_messages = self._build_a2ui_from_steps(steps)
        if a2ui_messages:
            yield {"type": "a2ui", "messages": a2ui_messages}
        yield {"type": "done"}

    def _make_service(self, session: AsyncSession) -> ContactService:
        return ContactService(ContactRepository(session))

    def _build_tools(self) -> List[StructuredTool]:
        async def get_contact(name: str) -> str:
            async with self._session_factory() as session:
                svc = self._make_service(session)
                contact = await svc.get_by_name(name)
            if contact:
                return json.dumps(
                    {
                        "found": True,
                        "id": str(contact.id),
                        "name": contact.name,
                        "phone_number": contact.phone_number,
                    }
                )
            return json.dumps({"found": False, "name": name})

        async def get_all_contacts() -> str:
            async with self._session_factory() as session:
                svc = self._make_service(session)
                contacts = await svc.get_all()
            return json.dumps(
                [{"name": c.name, "phone_number": c.phone_number} for c in contacts]
            )

        async def add_contact(name: str, phone_number: str) -> str:
            try:
                async with self._session_factory() as session:
                    svc = self._make_service(session)
                    contact = await svc.create(
                        ContactCreate(name=name, phone_number=phone_number)
                    )
                return json.dumps(
                    {
                        "success": True,
                        "id": str(contact.id),
                        "name": contact.name,
                        "phone_number": contact.phone_number,
                    }
                )
            except Exception as exc:
                return json.dumps({"success": False, "error": str(exc)})

        async def propose_delete_contact(name: str) -> str:
            async with self._session_factory() as session:
                svc = self._make_service(session)
                contact = await svc.get_by_name(name)
            if not contact:
                return json.dumps({"found": False, "name": name})
            return json.dumps(
                {
                    "proposed": True,
                    "id": str(contact.id),
                    "name": contact.name,
                    "phone_number": contact.phone_number,
                }
            )

        async def update_contact(
            name: Optional[str] = None,
            new_name: Optional[str] = None,
            new_phone_number: Optional[str] = None,
        ) -> str:
            if not name:
                return json.dumps(
                    {
                        "success": False,
                        "error": "Missing required field: 'name' (the current name of the contact to update)",
                    }
                )
            async with self._session_factory() as session:
                svc = self._make_service(session)
                contact = await svc.update_by_name(
                    name, ContactUpdate(name=new_name, phone_number=new_phone_number)
                )
            if not contact:
                return json.dumps(
                    {"success": False, "error": f"Contact '{name}' not found"}
                )
            return json.dumps(
                {
                    "success": True,
                    "id": str(contact.id),
                    "name": contact.name,
                    "phone_number": contact.phone_number,
                }
            )

        return [
            StructuredTool.from_function(
                coroutine=get_contact,
                name="get_contact",
                description="Look up a contact by name. Returns name and phone number, or indicates not found.",
                args_schema=GetContactInput,
            ),
            StructuredTool.from_function(
                coroutine=get_all_contacts,
                name="get_all_contacts",
                description="Retrieve all contacts in the phone book.",
                args_schema=GetAllContactsInput,
            ),
            StructuredTool.from_function(
                coroutine=add_contact,
                name="add_contact",
                description="Add a new contact to the phone book.",
                args_schema=AddContactInput,
            ),
            StructuredTool.from_function(
                coroutine=propose_delete_contact,
                name="propose_delete_contact",
                description="Propose deleting a contact. Verifies the contact exists by name first. If found, shows the user a confirmation card — does NOT delete immediately. If not found, returns not-found. Use this as the sole tool for any delete request; do not call get_contact beforehand.",
                args_schema=DeleteContactInput,
            ),
            StructuredTool.from_function(
                coroutine=update_contact,
                name="update_contact",
                description="Update an existing contact's name and/or phone number.",
                args_schema=UpdateContactInput,
            ),
        ]
