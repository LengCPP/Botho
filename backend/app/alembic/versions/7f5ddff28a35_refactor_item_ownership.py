"""refactor item ownership

Revision ID: 7f5ddff28a35
Revises: 242eedf41a1f
Create Date: 2026-01-28 20:54:28.252651

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '7f5ddff28a35'
down_revision = '242eedf41a1f'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add owner_id as nullable first
    op.add_column('item', sa.Column('owner_id', sa.Uuid(), nullable=True))
    
    # 2. Populate owner_id from useritem table (picking one owner per item)
    # We use a subquery to get one user per item
    op.execute(
        "UPDATE item SET owner_id = (SELECT user_id FROM useritem WHERE useritem.item_id = item.id LIMIT 1)"
    )
    
    # 3. For any items that might not have an owner (orphans), we might need a fallback or delete them.
    # Since owner_id is required now, let's delete items without owners.
    op.execute("DELETE FROM item WHERE owner_id IS NULL")
    
    # 4. Now make it non-nullable
    op.alter_column('item', 'owner_id', nullable=False)
    
    # 5. Create index and foreign key
    op.create_index(op.f('ix_item_owner_id'), 'item', ['owner_id'], unique=False)
    op.create_foreign_key(None, 'item', 'user', ['owner_id'], ['id'], ondelete='CASCADE')
    
    # 6. Drop the old table
    op.drop_table('useritem')


def downgrade():
    op.create_table('useritem',
    sa.Column('user_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('item_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['item_id'], ['item.id'], name='useritem_item_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='useritem_user_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'item_id', name='useritem_pkey')
    )
    
    # Populate useritem from item.owner_id
    op.execute("INSERT INTO useritem (user_id, item_id) SELECT owner_id, id FROM item")
    
    op.drop_constraint(None, 'item', type_='foreignkey')
    op.drop_index(op.f('ix_item_owner_id'), table_name='item')
    op.drop_column('item', 'owner_id')