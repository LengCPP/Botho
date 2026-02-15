"""add INVITED status to CommunityMemberStatus

Revision ID: a3e78069f020
Revises: 44e97b833830
Create Date: 2026-02-14 22:35:11.119461

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'a3e78069f020'
down_revision = '44e97b833830'
branch_labels = None
depends_on = None


def upgrade():
    # Use commit() to exit transaction for ALTER TYPE
    op.execute("COMMIT")
    op.execute("ALTER TYPE communitymemberstatus ADD VALUE 'INVITED'")


def downgrade():
    # PostgreSQL does not support removing values from an enum type easily.
    pass
