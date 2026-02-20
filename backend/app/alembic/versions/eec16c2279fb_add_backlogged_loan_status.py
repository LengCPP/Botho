"""add backlogged loan status

Revision ID: eec16c2279fb
Revises: 5b5ac3332229
Create Date: 2026-02-20 04:34:22.879181

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'eec16c2279fb'
down_revision = '5b5ac3332229'
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE loanstatus ADD VALUE 'BACKLOGGED'")


def downgrade():
    # Removing a value from a PostgreSQL enum is not straightforward
    pass
