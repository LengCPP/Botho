"""update_loan_and_add_contribution

Revision ID: a1b2c3d4e5f6
Revises: 8861708ad747
Create Date: 2026-02-07 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '8861708ad747'
branch_labels = None
depends_on = None


def upgrade():
    # Add DEFAULTED to loanstatus enum
    op.execute("COMMIT")
    op.execute("ALTER TYPE loanstatus ADD VALUE 'DEFAULTED'")
    
    # Add columns to loan table
    op.add_column('loan', sa.Column('returned_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('loan', sa.Column('is_forgiven', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    
    # Create contribution table
    op.create_table('contribution',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('item_id', sa.UUID(), nullable=True),
        sa.Column('work_author', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('work_title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('contribution')
    op.drop_column('loan', 'is_forgiven')
    op.drop_column('loan', 'returned_at')
    # Removing enum value is not supported easily
