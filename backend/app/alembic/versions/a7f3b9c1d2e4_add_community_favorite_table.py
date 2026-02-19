"""add community favorite table

Revision ID: a7f3b9c1d2e4
Revises: 2c071c44e61a
Create Date: 2026-02-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'a7f3b9c1d2e4'
down_revision = '2c071c44e61a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'communityfavorite',
        sa.Column('community_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['community_id'], ['community.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('community_id', 'user_id'),
    )


def downgrade():
    op.drop_table('communityfavorite')
