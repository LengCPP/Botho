import json

from google import genai

from app.constants import BOOK_CLASSIFICATION
from app.core.config import settings

# Initialize Gemini Client
client = None
if settings.GEMINI_API_KEY:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

async def generate_honor_snapshot(reviews: list[str]) -> tuple[str | None, list[str]]:
    """Use Gemini to synthesize a reputation summary and improvement tips."""
    if not client or not reviews:
        return None, []

    reviews_text = "\n".join([f"- {r}" for r in reviews])
    prompt = f"""
    Analyze these anonymized community platform reviews and provide:
    1. A concise (2-3 sentences) SUMMARY of behavior.
    2. A list of 2-3 actionable TIPS for improvement or maintaining excellence.

    Strictly follow this format:
    SUMMARY: [Text]
    TIPS:
    - [Tip 1]
    - [Tip 2]

    REVIEWS:
    {reviews_text}
    """
    try:
        response = client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
        text = response.text
        summary, tips = "", []
        if "SUMMARY:" in text and "TIPS:" in text:
            parts = text.split("TIPS:")
            summary = parts[0].replace("SUMMARY:", "").strip()
            tips = [t.strip("- ").strip() for t in parts[1].strip().split("\n") if t.strip()]
        return summary or None, tips
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        return None, []

async def classify_book(title: str, author: str, description: str | None = None) -> tuple[str | None, str | None, str | None]:
    """Use Gemini to determine a descriptive category, specific genre, and subjects for a single book."""
    results = await classify_books([{"title": title, "author": author, "description": description}])
    return results[0] if results else (None, None, None)

async def classify_books(books: list[dict]) -> list[tuple[str | None, str | None, str | None]]:
    """Use Gemini to classify multiple books in a single request for RPM efficiency."""
    if not client or not books:
        return []

    classification_guide = json.dumps(BOOK_CLASSIFICATION, indent=2)
    books_text = "\n".join([
        f"ID: {i} | TITLE: {b.get('title')} | AUTHOR: {b.get('author')} | DESC: {b.get('description', 'N/A')[:200]}"
        for i, b in enumerate(books)
    ])

    prompt = f"""
    You are a professional librarian. Classify these {len(books)} books based strictly on the provided hierarchy.
    
    GUIDE:
    {classification_guide}

    BOOKS TO CLASSIFY:
    {books_text}

    INSTRUCTIONS for each book:
    1. CATEGORY: Must be EXACTLY one of the top-level keys in the GUIDE.
    2. GENRE: Must be EXACTLY one of the values listed under your chosen CATEGORY in the GUIDE.
    3. SUBJECTS: A list of 3-5 descriptive words/phrases (NOT genres).

    Output EXACTLY in this format for each book (one per line, keeping the original ID):
    ID: [ID] | CATEGORY: [Category] | GENRE: [Genre] | SUBJECTS: [Subjects]
    """
    try:
        response = client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
        results = [None] * len(books)
        lines = response.text.strip().split("\n")

        for line in lines:
            if "|" in line and "CATEGORY:" in line:
                try:
                    parts = line.split("|")
                    idx_part = parts[0].replace("ID:", "").strip()
                    cat = parts[1].replace("CATEGORY:", "").strip()
                    gen = parts[2].replace("GENRE:", "").strip()
                    sub = parts[3].replace("SUBJECTS:", "").strip()
                    results[int(idx_part)] = (cat, gen, sub)
                except Exception:
                    continue
        return results
    except Exception as e:
        print(f"Error bulk classifying books: {e}")
        return [(None, None, None)] * len(books)
