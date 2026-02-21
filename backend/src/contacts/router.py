from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from src.contacts.service import ContactService
from src.contacts.deps import get_contact_service
from src.contacts.schemas import ContactCreate, ContactUpdate, ContactResponse


router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED, response_model_by_alias=True)
async def create_contact(
    contact: ContactCreate, service: ContactService = Depends(get_contact_service)
) -> ContactResponse:
    return await service.create(contact)


@router.get("", response_model=List[ContactResponse], response_model_by_alias=True)
async def list_contacts(
    service: ContactService = Depends(get_contact_service),
) -> List[ContactResponse]:
    return await service.get_all()


@router.get("/{contact_id}", response_model=ContactResponse, response_model_by_alias=True)
async def get_contact(
    contact_id: UUID, service: ContactService = Depends(get_contact_service)
) -> ContactResponse:
    contact = await service.get_by_id(contact_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contact with id {contact_id} not found",
        )
    return contact


@router.patch("/{contact_id}", response_model=ContactResponse, response_model_by_alias=True)
async def update_contact(
    contact_id: UUID,
    contact_update: ContactUpdate,
    service: ContactService = Depends(get_contact_service),
) -> ContactResponse:
    contact = await service.update(contact_id, contact_update)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contact with id {contact_id} not found",
        )
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: UUID, service: ContactService = Depends(get_contact_service)
) -> None:
    success = await service.delete(contact_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contact with id {contact_id} not found",
        )
