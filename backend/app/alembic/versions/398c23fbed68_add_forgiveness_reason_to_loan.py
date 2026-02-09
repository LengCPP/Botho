from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '398c23fbed68'
down_revision = '5541f5cadf7c'
branch_labels = None
depends_on = None

def upgrade():
    sa.Enum('GOOD_REASON', 'FOUND_AND_RETURNED', 'REPLACED_ITEM', 'OTHER', name='forgivenessreason').create(op.get_bind())
    op.add_column('loan', sa.Column('forgiveness_reason', sa.Enum('GOOD_REASON', 'FOUND_AND_RETURNED', 'REPLACED_ITEM', 'OTHER', name='forgivenessreason'), nullable=True))

def downgrade():
    op.drop_column('loan', 'forgiveness_reason')
    sa.Enum('GOOD_REASON', 'FOUND_AND_RETURNED', 'REPLACED_ITEM', 'OTHER', name='forgivenessreason').drop(op.get_bind())
