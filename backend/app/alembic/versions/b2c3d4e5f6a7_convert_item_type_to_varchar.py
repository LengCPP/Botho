"""Convert item.item_type from PostgreSQL enum to VARCHAR

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
Create Date: 2026-02-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade():
    # Cast the existing itemtype enum column to text/varchar
    op.execute(
        "ALTER TABLE item ALTER COLUMN item_type TYPE VARCHAR(100) USING item_type::text"
    )
    op.execute(
        "ALTER TABLE item ALTER COLUMN item_type SET DEFAULT 'general'"
    )
    # Drop the now-unused PostgreSQL enum type
    op.execute("DROP TYPE IF EXISTS itemtype")


def downgrade():
    # Recreate the enum and cast back
    op.execute("CREATE TYPE itemtype AS ENUM ('general', 'book')")
    op.execute(
        "ALTER TABLE item ALTER COLUMN item_type TYPE itemtype USING item_type::itemtype"
    )
    op.execute("ALTER TABLE item ALTER COLUMN item_type SET DEFAULT 'general'::itemtype")
