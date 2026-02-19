from uuid import UUID
from pydantic import BaseModel, Field


class ContactBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Contact name")
    phone_number: str = Field(
        ..., min_length=1, max_length=20, description="Phone number"
    )


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: str | None = Field(
        None, min_length=1, max_length=100, description="Contact name"
    )
    phone_number: str | None = Field(
        None, min_length=1, max_length=20, description="Phone number"
    )


class ContactResponse(ContactBase):
    id: UUID

    class Config:
        from_attributes = True
