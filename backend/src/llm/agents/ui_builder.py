import json
from pathlib import Path
from typing import Any

_EXAMPLES_DIR = Path(__file__).parent / "examples"


def _load(filename: str) -> list:
    return json.loads((_EXAMPLES_DIR / filename).read_text())


def _substitute(value: Any, replacements: dict[str, str]) -> Any:
    """Recursively replace sentinel strings in a nested JSON structure."""
    if isinstance(value, str):
        for sentinel, replacement in replacements.items():
            value = value.replace(sentinel, replacement)
        return value
    if isinstance(value, dict):
        return {k: _substitute(v, replacements) for k, v in value.items()}
    if isinstance(value, list):
        return [_substitute(item, replacements) for item in value]
    return value


def build_contact_card(name: str, phone: str, contact_id: str) -> list:
    """Return A2UI messages that render a contact card surface."""
    surface_id = f"contact-card-{contact_id}"
    template = _load("contact_card.json")
    return _substitute(
        template,
        {
            "__SURFACE_ID__": surface_id,
            "__NAME__": name,
            "__PHONE__": phone,
            "__CONTACT_ID__": contact_id,
        },
    )


def build_delete_confirmation(name: str, phone: str, contact_id: str) -> list:
    """Return A2UI messages that render a delete-confirmation card surface."""
    surface_id = f"delete-confirm-{contact_id}"
    template = _load("delete_confirmation.json")
    return _substitute(
        template,
        {
            "__SURFACE_ID__": surface_id,
            "__NAME__": name,
            "__PHONE__": phone,
            "__CONTACT_ID__": contact_id,
        },
    )
