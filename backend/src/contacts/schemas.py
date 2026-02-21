from uuid import UUID
from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.schemas import CamelCaseModel


class ContactBase(CamelCaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Contact name")
    phone_number: str = Field(
        ..., min_length=1, max_length=20, description="Phone number"
    )


class ContactCreate(ContactBase):
    pass


class ContactUpdate(CamelCaseModel):
    name: str | None = Field(
        None, min_length=1, max_length=100, description="Contact name"
    )
    phone_number: str | None = Field(
        None, min_length=1, max_length=20, description="Phone number"
    )


class ContactResponse(ContactBase):
    id: UUID

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
