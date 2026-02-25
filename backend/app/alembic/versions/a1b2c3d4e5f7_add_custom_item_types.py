"""Add custom item types

Revision ID: a1b2c3d4e5f7
Revises: bbce9fe5e4a8
Create Date: 2026-02-25 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = 'bbce9fe5e4a8'
branch_labels = None
depends_on = None


def upgrade():
    # Add 17 new extended fields to the item table (all nullable)
    op.add_column('item', sa.Column('weight', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('dimensions', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('brand', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('condition_notes', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True))
    op.add_column('item', sa.Column('color', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('material', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('publisher', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('year', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('edition', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('language', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('age_group', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('player_count', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('platform', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('format', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('series', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('model_number', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('item', sa.Column('pieces_count', sa.Integer(), nullable=True))

    # Create the itemtypedefinition table
    op.create_table(
        'itemtypedefinition',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('slug', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('enabled_fields', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='[]'),
        sa.Column('label_field', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, server_default='title'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_itemtypedefinition_slug'), 'itemtypedefinition', ['slug'], unique=True)
    op.create_index(op.f('ix_itemtypedefinition_created_by'), 'itemtypedefinition', ['created_by'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_itemtypedefinition_created_by'), table_name='itemtypedefinition')
    op.drop_index(op.f('ix_itemtypedefinition_slug'), table_name='itemtypedefinition')
    op.drop_table('itemtypedefinition')

    op.drop_column('item', 'pieces_count')
    op.drop_column('item', 'model_number')
    op.drop_column('item', 'series')
    op.drop_column('item', 'format')
    op.drop_column('item', 'platform')
    op.drop_column('item', 'player_count')
    op.drop_column('item', 'age_group')
    op.drop_column('item', 'language')
    op.drop_column('item', 'edition')
    op.drop_column('item', 'year')
    op.drop_column('item', 'publisher')
    op.drop_column('item', 'material')
    op.drop_column('item', 'color')
    op.drop_column('item', 'condition_notes')
    op.drop_column('item', 'brand')
    op.drop_column('item', 'dimensions')
    op.drop_column('item', 'weight')
