"""Structured clinical intake on cases; physicians only

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-26
"""

import sqlalchemy as sa
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('cases') as batch:
        batch.add_column(sa.Column('clinical', sa.JSON(), nullable=True))
    # MedNexus is now a physician tool: former self-service accounts become doctors.
    op.execute("UPDATE users SET role = 'doctor' WHERE role = 'user'")


def downgrade() -> None:
    with op.batch_alter_table('cases') as batch:
        batch.drop_column('clinical')
