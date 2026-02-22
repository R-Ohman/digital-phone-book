from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from src.contacts.models import Contact


class ContactRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, name: str, phone_number: str) -> Contact:
        db_contact = Contact(name=name, phone_number=phone_number)
        self.db.add(db_contact)
        await self.db.commit()
        await self.db.refresh(db_contact)
        return db_contact

    async def get_by_id(self, contact_id: UUID) -> Optional[Contact]:
        result = await self.db.execute(select(Contact).where(Contact.id == contact_id))
        return result.scalar_one_or_none()

    async def get_all(self) -> List[Contact]:
        result = await self.db.execute(select(Contact))
        return list(result.scalars().all())

    async def update(self, contact: Contact) -> Contact:
        await self.db.commit()
        await self.db.refresh(contact)
        return contact

    async def get_by_name(self, name: str) -> List[Contact]:
        result = await self.db.execute(
            select(Contact).where(Contact.name.ilike(f"%{name}%"))
        )
        return list(result.scalars().all())

    async def delete(self, contact: Contact) -> None:
        await self.db.delete(contact)
        await self.db.commit()
