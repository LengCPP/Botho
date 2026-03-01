"""Make item type slug unique per user instead of globally

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-01 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the old global unique index on slug
    op.drop_index('ix_itemtypedefinition_slug', table_name='itemtypedefinition')

    # Add a non-unique index on slug (for lookups) and the composite unique constraint
    op.create_index('ix_itemtypedefinition_slug', 'itemtypedefinition', ['slug'], unique=False)
    op.create_unique_constraint(
        'uq_itemtypedefinition_slug_user',
        'itemtypedefinition',
        ['slug', 'created_by'],
    )


def downgrade():
    op.drop_constraint('uq_itemtypedefinition_slug_user', 'itemtypedefinition', type_='unique')
    op.drop_index('ix_itemtypedefinition_slug', table_name='itemtypedefinition')
    op.create_index('ix_itemtypedefinition_slug', 'itemtypedefinition', ['slug'], unique=True)