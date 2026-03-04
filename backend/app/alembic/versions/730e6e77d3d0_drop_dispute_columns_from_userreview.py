"""drop_dispute_columns_from_userreview

Revision ID: 730e6e77d3d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-04 06:29:38.208231

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '730e6e77d3d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('userreview', 'is_disputed')
    op.drop_column('userreview', 'dispute_reason')


def downgrade():
    op.add_column('userreview', sa.Column('dispute_reason', sa.VARCHAR(), nullable=True))
    op.add_column('userreview', sa.Column('is_disputed', sa.Boolean(), nullable=False, server_default='false'))
