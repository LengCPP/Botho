import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from sqlmodel import select

from app.ai import classify_book
from app.core.db import engine
from app.models import Item, ItemType
from app.search import sync_item_to_search


async def bulk_classify():
    with Session(engine) as session:
        # Fetch all books
        statement = select(Item).where(Item.item_type == ItemType.book)
        books = session.exec(statement).all()

        print(f"Found {len(books)} books. Starting classification...")

        count = 0
        for book in books:
            # Re-classify if generic or missing
            is_generic = book.category in ["Fiction", "Non-Fiction", None] or book.genre is None

            if is_generic:
                print(f"Classifying: {book.title} by {book.author}...")
                cat, gen, sub = await classify_book(book.title, book.author or "", book.description)

                if cat or gen or sub:
                    if cat: book.category = cat
                    if gen: book.genre = gen
                    if sub: book.subject = sub
                    session.add(book)
                    session.flush()
                    sync_item_to_search(book)
                    count += 1
                    print(f"  -> {cat} | {gen} | {sub}")
                else:
                    print("  -> Skip (AI returned nothing)")

                # Small delay to avoid rate limiting
                await asyncio.sleep(1)

        session.commit()
        print(f"Finished. Updated {count} books.")

if __name__ == "__main__":
    asyncio.run(bulk_classify())
