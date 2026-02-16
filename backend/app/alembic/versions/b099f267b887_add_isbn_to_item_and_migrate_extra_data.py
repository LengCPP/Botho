"""Add isbn to Item and migrate extra_data

Revision ID: b099f267b887
Revises: 7b0b7663d302
Create Date: 2026-02-16 10:43:25.759991

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
import json


# revision identifiers, used by Alembic.
revision = 'b099f267b887'
down_revision = '7b0b7663d302'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add isbn column
    op.add_column('item', sa.Column('isbn', sa.String(length=20), nullable=True))
    op.create_index(op.f('ix_item_isbn'), 'item', ['isbn'], unique=False)

    # 2. Migrate data from extra_data to top-level fields
    connection = op.get_bind()
    # Use sa.text for raw SQL
    results = connection.execute(sa.text("SELECT id, extra_data, category, genre, subject FROM item")).fetchall()
    
    for row in results:
        item_id, extra_data_raw, current_cat, current_gen, current_sub = row
        if not extra_data_raw:
            continue
            
        try:
            if isinstance(extra_data_raw, str):
                extra_data = json.loads(extra_data_raw)
            else:
                extra_data = extra_data_raw
        except:
            continue
        
        if not isinstance(extra_data, dict):
            continue

        updates = {}
        
        # Move ISBN
        isbn = extra_data.get('isbn')
        if isbn and not isinstance(isbn, (list, dict)):
            updates['isbn'] = str(isbn)[:20]
        
        # Move Category if top-level is empty
        category = extra_data.get('category')
        if category and not current_cat:
            updates['category'] = str(category)[:255]
            
        # Move Genre if top-level is empty
        genre = extra_data.get('genre')
        if genre and not current_gen:
            updates['genre'] = str(genre)[:255]
            
        # Move Subject if top-level is empty
        subject = extra_data.get('subject')
        if subject and not current_sub:
            updates['subject'] = str(subject)[:512]
            
        if updates:
            # Clean up extra_data to avoid duplication
            modified_extra = False
            for key in ['isbn', 'category', 'genre', 'subject']:
                if key in extra_data:
                    del extra_data[key]
                    modified_extra = True
            
            set_parts = []
            params = {"id": item_id}
            for k, v in updates.items():
                set_parts.append(f"{k} = :{k}")
                params[k] = v
            
            if modified_extra:
                set_parts.append(f"extra_data = CAST(:extra_data AS JSON)")
                params['extra_data'] = json.dumps(extra_data)
            
            set_clause = ", ".join(set_parts)
            connection.execute(
                sa.text(f"UPDATE item SET {set_clause} WHERE id = :id"),
                params
            )


def downgrade():
    op.drop_index(op.f('ix_item_isbn'), table_name='item')
    op.drop_column('item', 'isbn')
