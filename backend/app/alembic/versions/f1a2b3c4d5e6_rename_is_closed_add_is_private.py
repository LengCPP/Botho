"""Rename is_closed to requires_approval and add is_private

Revision ID: f1a2b3c4d5e6
Revises: bc52ab10f0be
Create Date: 2026-01-29 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'bc52ab10f0be'
branch_labels = None
depends_on = None


def upgrade():
    # Rename is_closed to requires_approval
    op.alter_column('community', 'is_closed', new_column_name='requires_approval')
    
    # Add is_private
    op.add_column('community', sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.alter_column('community', 'is_private', server_default=None)


def downgrade():
    # Remove is_private
    op.drop_column('community', 'is_private')
    
    # Rename requires_approval back to is_closed
    op.alter_column('community', 'requires_approval', new_column_name='is_closed')
