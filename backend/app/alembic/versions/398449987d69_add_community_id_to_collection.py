from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '398449987d69'
down_revision = '7b85b87802aa'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('collection', sa.Column('community_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('collection_community_id_fkey', 'collection', 'community', ['community_id'], ['id'], ondelete='CASCADE')

def downgrade():
    op.drop_constraint('collection_community_id_fkey', 'collection', type_='foreignkey')
    op.drop_column('collection', 'community_id')
