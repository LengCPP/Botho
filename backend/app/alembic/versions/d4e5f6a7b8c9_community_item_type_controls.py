"""Community item type controls: allowed_item_types + CommunityItemRequest table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    # Add allowed_item_types column to community table
    op.add_column(
        'community',
        sa.Column('allowed_item_types', JSONB, nullable=True)
    )

    # Create communityitemrequest table
    op.create_table(
        'communityitemrequest',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('community_id', sa.Uuid(), nullable=False),
        sa.Column('item_id', sa.Uuid(), nullable=False),
        sa.Column('requested_by', sa.Uuid(), nullable=False),
        sa.Column('item_type', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_by', sa.Uuid(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['community_id'], ['community.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requested_by'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resolved_by'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_communityitemrequest_community_id', 'communityitemrequest', ['community_id'])
    op.create_index('ix_communityitemrequest_community_status', 'communityitemrequest', ['community_id', 'status'])


def downgrade():
    op.drop_index('ix_communityitemrequest_community_status', table_name='communityitemrequest')
    op.drop_index('ix_communityitemrequest_community_id', table_name='communityitemrequest')
    op.drop_table('communityitemrequest')
    op.drop_column('community', 'allowed_item_types')
