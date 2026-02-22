from typing import Optional

from pydantic import BaseModel, Field


class GetContactInput(BaseModel):
    name: str = Field(description="The name of the contact to look up")


class GetAllContactsInput(BaseModel):
    pass


class AddContactInput(BaseModel):
    name: str = Field(description="Contact name")
    phone_number: str = Field(description="Phone number as plain digits, no formatting")


class DeleteContactInput(BaseModel):
    name: str = Field(description="Name of the contact to delete")


class UpdateContactInput(BaseModel):
    name: str = Field(description="Current name of the contact to update")
    new_name: Optional[str] = Field(
        None, description="New name for the contact (leave None to keep unchanged)"
    )
    new_phone_number: Optional[str] = Field(
        None,
        description="New phone number for the contact (leave None to keep unchanged)",
    )
