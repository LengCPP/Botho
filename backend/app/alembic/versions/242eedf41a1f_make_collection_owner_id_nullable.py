from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '242eedf41a1f'
down_revision = '398449987d69'
branch_labels = None
depends_on = None

def upgrade():
    op.alter_column('collection', 'owner_id', nullable=True)

def downgrade():
    # Note: This might fail if there are collections with owner_id as NULL
    op.alter_column('collection', 'owner_id', nullable=False)
