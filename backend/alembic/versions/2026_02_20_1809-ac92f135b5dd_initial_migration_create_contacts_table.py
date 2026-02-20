"""Initial migration - create contacts table

Revision ID: ac92f135b5dd
Revises:
Create Date: 2026-02-20 18:09:03.000627

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql


# revision identifiers, used by Alembic.
revision: str = "ac92f135b5dd"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contacts",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone_number", sa.String(20), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("contacts")
