"""add updated_at to community board models

Revision ID: a9f1b2c3d4e5
Revises: eec16c2279fb
Create Date: 2026-02-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9f1b2c3d4e5'
down_revision = 'eec16c2279fb'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'communityannouncement',
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )
    op.add_column(
        'communitymessage',
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column('communitymessage', 'updated_at')
    op.drop_column('communityannouncement', 'updated_at')