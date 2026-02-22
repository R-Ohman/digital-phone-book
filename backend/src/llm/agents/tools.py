"""LangChain tools for the phone-book agent."""

import json
from typing import List, Optional

from langchain_core.tools import StructuredTool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.contacts.repository import ContactRepository
from src.contacts.schemas import ContactCreate, ContactUpdate
from src.contacts.service import ContactService
from .schemas import (
    AddContactInput,
    DeleteContactInput,
    GetAllContactsInput,
    GetContactInput,
    UpdateContactInput,
)


def _make_service(session: AsyncSession) -> ContactService:
    return ContactService(ContactRepository(session))


def build_tools(
    session_factory: async_sessionmaker[AsyncSession],
) -> List[StructuredTool]:
    async def get_contact(name: str) -> str:
        async with session_factory() as session:
            contacts = await _make_service(session).get_by_name(name)
        if not contacts:
            return json.dumps({"success": False, "name": name})
        if len(contacts) > 1:
            return json.dumps(
                {
                    "success": True,
                    "multiple_found": True,
                    "contacts": [
                        {
                            "id": str(c.id),
                            "name": c.name,
                            "phone_number": c.phone_number,
                        }
                        for c in contacts
                    ],
                }
            )
        contact = contacts[0]
        return json.dumps(
            {
                "success": True,
                "id": str(contact.id),
                "name": contact.name,
                "phone_number": contact.phone_number,
            }
        )

    async def get_all_contacts() -> str:
        async with session_factory() as session:
            contacts = await _make_service(session).get_all()
        return json.dumps(
            [{"name": c.name, "phone_number": c.phone_number} for c in contacts]
        )

    async def add_contact(name: str, phone_number: str) -> str:
        try:
            async with session_factory() as session:
                contact = await _make_service(session).create(
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
        async with session_factory() as session:
            contacts = await _make_service(session).get_by_name(name)
        if not contacts:
            return json.dumps({"success": False, "name": name})
        if len(contacts) > 1:
            return json.dumps(
                {
                    "multiple_found": True,
                    "contacts": [
                        {
                            "id": str(c.id),
                            "name": c.name,
                            "phone_number": c.phone_number,
                        }
                        for c in contacts
                    ],
                }
            )
        contact = contacts[0]
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
        async with session_factory() as session:
            svc = _make_service(session)
            contacts = await svc.get_by_name(name)
            if not contacts:
                return json.dumps(
                    {"success": False, "error": f"Contact '{name}' not found"}
                )
            if len(contacts) > 1:
                return json.dumps(
                    {
                        "success": False,
                        "multiple_found": True,
                        "contacts": [
                            {
                                "id": str(c.id),
                                "name": c.name,
                                "phone_number": c.phone_number,
                            }
                            for c in contacts
                        ],
                        "error": f"Multiple contacts found for '{name}'. Ask the user to clarify which one to update.",
                    }
                )
            contact = await svc.update(
                contacts[0].id,
                ContactUpdate(name=new_name, phone_number=new_phone_number),
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
            description=(
                "Retrieve every contact in the phone book. "
                "Use ONLY when the user wants the full list or needs to filter without knowing exact names. "
            ),
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
            description=(
                "Propose deleting a contact. Verifies the contact exists by name first. "
                "If found, shows the user a confirmation card — does NOT delete immediately. "
                "If not found, returns not-found. "
                "Use this as the sole tool for any delete request; do not call get_contact beforehand."
            ),
            args_schema=DeleteContactInput,
        ),
        StructuredTool.from_function(
            coroutine=update_contact,
            name="update_contact",
            description="Update an existing contact's name and/or phone number.",
            args_schema=UpdateContactInput,
        ),
    ]
