"""community_governance_suspend_disband_demotion

Revision ID: b1c2d3e4f5a6
Revises: a9f1b2c3d4e5
Create Date: 2026-02-22 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5a6'
down_revision = 'a9f1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    # Add governance columns to communitymember
    op.add_column('communitymember', sa.Column('suspension_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('communitymember', sa.Column('action_reason', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True))
    op.add_column('communitymember', sa.Column('action_by_role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True))

    # Create communitydisbandvote table
    op.create_table(
        'communitydisbandvote',
        sa.Column('community_id', sa.Uuid(), nullable=False),
        sa.Column('voter_id', sa.Uuid(), nullable=False),
        sa.Column('voted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['community_id'], ['community.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['voter_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('community_id', 'voter_id'),
    )

    # Create communitydemotionvote table
    op.create_table(
        'communitydemotionvote',
        sa.Column('community_id', sa.Uuid(), nullable=False),
        sa.Column('target_user_id', sa.Uuid(), nullable=False),
        sa.Column('voter_id', sa.Uuid(), nullable=False),
        sa.Column('voted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['community_id'], ['community.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['voter_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('community_id', 'target_user_id', 'voter_id'),
    )


def downgrade():
    op.drop_table('communitydemotionvote')
    op.drop_table('communitydisbandvote')
    op.drop_column('communitymember', 'action_by_role')
    op.drop_column('communitymember', 'action_reason')
    op.drop_column('communitymember', 'suspension_until')
