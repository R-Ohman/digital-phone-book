import copy
import json
from pathlib import Path

from src.contacts.schemas import ContactResponse

_EXAMPLES_DIR = Path(__file__).parent / "examples"
_SURFACE_KEYS = ("surfaceUpdate", "dataModelUpdate", "beginRendering", "deleteSurface")


def _load(filename: str) -> list:
    return json.loads((_EXAMPLES_DIR / filename).read_text())


def _apply(messages: list, surface_id: str, contents: list[dict]) -> list:
    """Return a copy of *messages* with surface IDs and data model contents filled in."""
    messages = copy.deepcopy(messages)
    for msg in messages:
        for key in _SURFACE_KEYS:
            if key in msg:
                msg[key]["surfaceId"] = surface_id
        if "dataModelUpdate" in msg:
            msg["dataModelUpdate"]["contents"] = contents
    return messages


def build_contact_card(contact: ContactResponse) -> list:
    """Return A2UI messages that render a contact card surface."""
    surface_id = f"contact-card-{contact.id}"
    return _apply(
        _load("contact_card.json"),
        surface_id,
        [
            {"key": "name", "valueString": contact.name},
            {"key": "phone", "valueString": contact.phone_number},
            {"key": "id", "valueString": str(contact.id)},
            {"key": "surfaceId", "valueString": surface_id},
        ],
    )


def build_delete_confirmation(contact: ContactResponse) -> list:
    """Return A2UI messages that render a delete-confirmation card surface."""
    surface_id = f"delete-confirm-{contact.id}"
    return _apply(
        _load("delete_confirmation.json"),
        surface_id,
        [
            {"key": "name", "valueString": contact.name},
            {"key": "phone", "valueString": contact.phone_number},
            {"key": "id", "valueString": str(contact.id)},
            {"key": "surfaceId", "valueString": surface_id},
        ],
    )
