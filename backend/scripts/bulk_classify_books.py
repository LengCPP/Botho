import asyncio
import sys
import uuid
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from app.ai import classify_books
from app.api.utils import map_book_classification, ensure_work_metadata
from app.core.db import engine
from app.models import Item, ItemType
from app.search import sync_item_to_search


async def bulk_classify(target_ids: list[uuid.UUID] = None):
    print("Starting targeted book classification with Qwen3...")

    with Session(engine) as session:
        # Fetch only selected books if IDs are provided
        if target_ids:
            statement = select(Item).where(Item.id.in_(target_ids))
        else:
            print("No IDs provided. Fetching generic books...")
            statement = select(Item).where(Item.item_type == ItemType.book)
            
        books = session.exec(statement).all()

        books_to_classify = []
        books_objects = []

        for book in books:
            # If target_ids is provided, we process all matching books.
            # Otherwise, we use the is_generic criteria.
            is_generic = book.category in ["Fiction", "Non-Fiction", None] or book.genre is None
            
            if target_ids or is_generic:
                books_to_classify.append({
                    "id": str(book.id),
                    "title": book.title,
                    "author": book.author or "",
                    "description": book.description,
                    "isbn": book.isbn
                })
                books_objects.append(book)

        if not books_to_classify:
            print("No books found for classification.")
            return

        print(f"Found {len(books_to_classify)} books to classify.")

        classified_count = 0
        CHUNK_SIZE = 1 # Small local models work best with chunk size 1

        for i in range(0, len(books_to_classify), CHUNK_SIZE):
            book_info = books_to_classify[i]
            book_obj = books_objects[i]

            print(f"[{i+1}/{len(books_to_classify)}] Classifying: {book_info['title']} by {book_info['author']}...")

            try:
                # Prepare payload for AI
                ai_payload = [{
                    "title": book_info["title"],
                    "author": book_info["author"],
                    "description": book_info["description"]
                }]
                
                # Execute AI classification (No Internet enrichment)
                results = await classify_books(ai_payload)

                if results and results[0]:
                    cat_raw, gen_raw, sub_raw = results[0]

                    # Map raw AI strings to canonical constants
                    cat, gen, _ = map_book_classification([cat_raw, gen_raw])

                    if cat: book_obj.category = cat
                    if gen: book_obj.genre = gen
                    if sub_raw: book_obj.subject = sub_raw
                    
                    session.add(book_obj)
                    session.flush()
                    sync_item_to_search(book_obj)

                    # Update WorkMetadata archive
                    tags = [s.strip() for s in sub_raw.split(",")] if sub_raw else []
                    ensure_work_metadata(session, book_obj.author, book_obj.title, category=cat, genre=gen, tags=tags)
                    
                    classified_count += 1
                    session.commit()
                    print(f"  -> SUCCESS: {cat} | {gen} | {sub_raw[:50]}...")
                else:
                    print("  -> SKIP: AI returned no usable result")

            except Exception as e:
                print(f"  -> ERROR processing book {book_info['title']}: {e}")
                session.rollback()

            await asyncio.sleep(0.5)

        print(f"Classification complete: Processed {classified_count} books.")

if __name__ == "__main__":
    # Allow passing book IDs as CLI arguments
    target_ids = []
    for arg in sys.argv[1:]:
        try:
            target_ids.append(uuid.UUID(arg))
        except ValueError:
            print(f"Skipping invalid UUID: {arg}")
            
    asyncio.run(bulk_classify(target_ids))
