"""User and doctor roles; symptoms on cases

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-26
"""

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('cases') as batch:
        batch.add_column(sa.Column('symptoms', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True))
        batch.add_column(sa.Column('patient_age', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('patient_sex', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=True))
    # Every former staff role becomes a doctor.
    op.execute("UPDATE users SET role = 'doctor' WHERE role IN ('radiologist', 'resident', 'admin')")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'radiologist' WHERE role = 'doctor'")
    with op.batch_alter_table('cases') as batch:
        batch.drop_column('patient_sex')
        batch.drop_column('patient_age')
        batch.drop_column('symptoms')
