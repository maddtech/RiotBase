"""add_event_flyer_columns

Revision ID: 9c4e7f2a1d8b
Revises: 55ff92af6ccb
Create Date: 2026-11-25 21:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c4e7f2a1d8b'
down_revision: Union[str, Sequence[str], None] = '55ff92af6ccb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add optional flyer attachment metadata columns to events."""
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('flyer_filename', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('flyer_content_type', sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Remove flyer attachment metadata columns from events."""
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_column('flyer_content_type')
        batch_op.drop_column('flyer_filename')
