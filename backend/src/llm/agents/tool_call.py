import json
from typing import Optional, List

from langchain_classic.agents import (
    AgentExecutor,
    create_tool_calling_agent,
)
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


SYSTEM_PROMPT = """You are a phone book assistant with access to tools for managing contacts.

Think step by step:
- Use tools to look up information before making conditional decisions.
- For requests like "if John exists update him, otherwise create him", first call get_contact to check, then decide.
- For queries like "how many contacts have a 123 prefix", call get_all_contacts then reason over the results.
- For swap requests like "swap phone numbers of A and B", first call get_contact for both A and B to retrieve their current numbers, then call update_contact on A with B's number, then call update_contact on B with A's original number.
- Execute every requested operation before writing your final answer.
- Be concise and conversational in your final response.
"""

PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ]
)


class ToolCallAgent:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], model: Optional[str] = None):
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
        )

    async def execute(self, user_prompt: str) -> str:
        result = await self._executor.ainvoke({"input": user_prompt})
        return result["output"]

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
                        "name": contact.name,
                        "phone_number": contact.phone_number,
                    }
                )
            except Exception as exc:
                return json.dumps({"success": False, "error": str(exc)})

        async def delete_contact(name: str) -> str:
            async with self._session_factory() as session:
                svc = self._make_service(session)
                deleted = await svc.delete_by_name(name)
            return json.dumps({"success": deleted, "name": name})

        async def update_contact(
            name: str,
            new_name: Optional[str] = None,
            new_phone_number: Optional[str] = None,
        ) -> str:
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
                coroutine=delete_contact,
                name="delete_contact",
                description="Delete a contact from the phone book by name.",
                args_schema=DeleteContactInput,
            ),
            StructuredTool.from_function(
                coroutine=update_contact,
                name="update_contact",
                description="Update an existing contact's name and/or phone number.",
                args_schema=UpdateContactInput,
            ),
        ]
