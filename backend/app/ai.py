from google import genai
from typing import List, Optional, Tuple
from app.core.config import settings

# Initialize Gemini Client
client = None
if settings.GEMINI_API_KEY:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

async def generate_honor_snapshot(reviews: List[str]) -> Tuple[Optional[str], List[str]]:
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

async def classify_book(title: str, author: str, description: Optional[str] = None) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Use Gemini to determine a descriptive category, specific genre, and subjects for a book."""
    if not client:
        return None, None, None

    prompt = f"""
    You are a professional librarian and literary critic. Classify this book:
    TITLE: {title}
    AUTHOR: {author}
    DESCRIPTION: {description or "No description provided."}

    Provide:
    1. CATEGORY: One of the following broad classifications: 'Fiction', 'Non-Fiction', 'Children & Young Adult', 'Academic & Professional'.
    2. GENRE: A more specific description of the style and type of literature.
        - For 'Academic & Professional', choose from: 'Textbooks', 'Reference', 'Research', 'Journal'.
        - For others, choose standard genres (e.g., 'Fantasy', 'Mystery', 'Biography', 'History').
        - Do NOT use subjects (like 'Law', 'Engineering', 'Math') as Genres. Put them in SUBJECTS instead.
    3. SUBJECTS: A list of single words or short phrases separated by commas that describe what the book is about (e.g., 'Artificial Intelligence, Ethics, Future of Humanity', 'Calculus', 'Civil Law').

    Strictly follow this format:
    CATEGORY: [Broad category]
    GENRE: [Specific genre/style]
    SUBJECTS: [Comma-separated words/phrases]
    """
    try:
        response = client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
        text = response.text
        cat, gen, sub = None, None, None
        
        lines = text.split("\n")
        for line in lines:
            if line.startswith("CATEGORY:"):
                cat = line.replace("CATEGORY:", "").strip()
            elif line.startswith("GENRE:"):
                gen = line.replace("GENRE:", "").strip()
            elif line.startswith("SUBJECTS:"):
                sub = line.replace("SUBJECTS:", "").strip()
                
        return cat, gen, sub
    except Exception as e:
        print(f"Error classifying book: {e}")
        return None, None, None