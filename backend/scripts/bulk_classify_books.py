import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from sqlmodel import select
from app.core.db import engine
from app.models import Item, ItemType
from app.ai import classify_book
from app.search import sync_item_to_search
from sqlalchemy.orm import Session

async def bulk_classify():
    with Session(engine) as session:
        # Fetch all books
        statement = select(Item).where(Item.item_type == ItemType.book)
        books = session.exec(statement).all()
        
        print(f"Found {len(books)} books. Starting classification...")
        
        count = 0
        for book in books:
            extra = book.extra_data or {}
            # Even if it has data, user wants to "expand" where necessary, 
            # so we'll re-classify if it looks too generic or is missing.
            is_generic = extra.get("category") in ["Fiction", "Non-Fiction", None] or extra.get("genre") is None
            
            if is_generic:
                print(f"Classifying: {book.title} by {book.author}...")
                cat, gen = await classify_book(book.title, book.author or "", book.description)
                
                if cat or gen:
                    if cat: extra["category"] = cat
                    if gen: extra["genre"] = gen
                    book.extra_data = extra
                    session.add(book)
                    session.flush()
                    sync_item_to_search(book)
                    count += 1
                    print(f"  -> {cat} | {gen}")
                else:
                    print(f"  -> Skip (AI returned nothing)")
                
                # Small delay to avoid rate limiting
                await asyncio.sleep(1)
        
        session.commit()
        print(f"Finished. Updated {count} books.")

if __name__ == "__main__":
    asyncio.run(bulk_classify())
