"""add_bucket_to_collection_type

Revision ID: bc52ab10f0be
Revises: aee24ba83f1e
Create Date: 2026-01-28 23:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'bc52ab10f0be'
down_revision = 'aee24ba83f1e'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add BUCKET to collectiontype enum
    # Use commit() to exit transaction for ALTER TYPE
    op.execute("COMMIT")
    op.execute("ALTER TYPE collectiontype ADD VALUE 'BUCKET'")


def downgrade():
    pass
