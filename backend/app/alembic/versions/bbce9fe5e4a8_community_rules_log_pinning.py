"""community_rules_log_pinning

Revision ID: bbce9fe5e4a8
Revises: b1c2d3e4f5a6
Create Date: 2026-02-23 06:06:17.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'bbce9fe5e4a8'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    # Add communitylog table
    op.create_table(
        'communitylog',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('community_id', sa.Uuid(), nullable=False),
        sa.Column('event_type', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
        sa.Column('actor_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('target_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('extra', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['community_id'], ['community.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_communitylog_community_id'), 'communitylog', ['community_id'], unique=False)

    # Add rules column to community
    op.add_column('community', sa.Column('rules', sqlmodel.sql.sqltypes.AutoString(length=5000), nullable=True))

    # Add is_pinned to communityannouncement
    op.add_column('communityannouncement', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default=sa.text('false')))

    # Add is_pinned to communitymessage
    op.add_column('communitymessage', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade():
    op.drop_column('communitymessage', 'is_pinned')
    op.drop_column('communityannouncement', 'is_pinned')
    op.drop_column('community', 'rules')
    op.drop_index(op.f('ix_communitylog_community_id'), table_name='communitylog')
    op.drop_table('communitylog')
