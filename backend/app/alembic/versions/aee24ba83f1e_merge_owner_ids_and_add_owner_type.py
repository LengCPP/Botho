"""merge_owner_ids_and_add_owner_type

Revision ID: aee24ba83f1e
Revises: 7f5ddff28a35
Create Date: 2026-01-28 22:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'aee24ba83f1e'
down_revision = '7f5ddff28a35'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Remove foreign key constraints
    op.drop_constraint('item_owner_id_fkey', 'item', type_='foreignkey')
    op.drop_constraint('item_community_owner_id_fkey', 'item', type_='foreignkey')

    # 2. Add owner_type column
    op.add_column('item', sa.Column('owner_type', sa.String(length=20), nullable=False, server_default='user'))

    # 3. Migrate data: move community_owner_id to owner_id and set owner_type to 'community'
    op.execute("UPDATE item SET owner_id = community_owner_id, owner_type = 'community' WHERE community_owner_id IS NOT NULL")
    
    # Ensure all items have a type
    op.execute("UPDATE item SET owner_type = 'user' WHERE owner_type IS NULL")

    # 4. Drop the redundant column
    op.drop_column('item', 'community_owner_id')


def downgrade():
    op.add_column('item', sa.Column('community_owner_id', sa.UUID(), autoincrement=False, nullable=True))
    op.execute("UPDATE item SET community_owner_id = owner_id WHERE owner_type = 'community'")
    
    op.drop_column('item', 'owner_type')
    op.create_foreign_key('item_community_owner_id_fkey', 'item', 'community', ['community_owner_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('item_owner_id_fkey', 'item', 'user', ['owner_id'], ['id'], ondelete='CASCADE')
