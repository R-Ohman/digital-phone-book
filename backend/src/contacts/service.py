from uuid import UUID
from typing import Optional, List

from src.contacts.models import Contact
from src.contacts.schemas import ContactCreate, ContactUpdate
from src.contacts.repository import ContactRepository


class ContactService:
    def __init__(self, repository: ContactRepository):
        self.repository = repository

    async def create(self, contact: ContactCreate) -> Contact:
        return await self.repository.create(
            name=contact.name, phone_number=contact.phone_number
        )

    async def get_by_id(self, contact_id: UUID) -> Optional[Contact]:
        return await self.repository.get_by_id(contact_id)

    async def get_all(self) -> List[Contact]:
        return await self.repository.get_all()

    async def update(
        self, contact_id: UUID, contact_update: ContactUpdate
    ) -> Optional[Contact]:
        db_contact = await self.repository.get_by_id(contact_id)
        if not db_contact:
            return None

        update_data = contact_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_contact, field, value)

        return await self.repository.update(db_contact)

    async def delete(self, contact_id: UUID) -> bool:
        db_contact = await self.repository.get_by_id(contact_id)
        if not db_contact:
            return False

        await self.repository.delete(db_contact)
        return True
