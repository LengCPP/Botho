import json
import logging
import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.constants import BOOK_CLASSIFICATION
from app.core.config import settings

logger = logging.getLogger(__name__)

# Providers — configured via settings
OLLAMA_CHAT_URL = f"{settings.OLLAMA_BASE_URL}/api/chat"
LOCAL_MODEL = settings.OLLAMA_MODEL


def _sanitize_for_prompt(text: str | None, max_len: int = 200) -> str:
    """Strip control characters and truncate before embedding in an LLM prompt."""
    if not text:
        return "N/A"
    # Remove ASCII control characters (keep printable + tab)
    sanitized = "".join(c for c in text if c >= " " or c == "\t")
    # Collapse runs of whitespace to single space
    sanitized = " ".join(sanitized.split())
    return sanitized[:max_len]

def is_retryable_error(exception):
    """Check if the error is a temporary connection or timeout error."""
    return isinstance(exception, (httpx.ConnectError, httpx.TimeoutException))

async def generate_honor_snapshot(reviews: list[str]) -> tuple[str | None, list[str]]:
    """Use Local LLM to synthesize a reputation summary and improvement tips."""
    if not reviews:
        return None, []

    reviews_text = "\n".join([f"- {r}" for r in reviews])
    prompt = f"""
    Analyze these community platform reviews and provide:
    1. A concise (2-3 sentences) SUMMARY of behavior.
    2. A list of 2-3 actionable TIPS for improvement.

    Format:
    SUMMARY: [Text]
    TIPS:
    - [Tip 1]
    - [Tip 2]

    REVIEWS:
    {reviews_text}
    """
    try:
        @retry(
            wait=wait_exponential(multiplier=1, min=2, max=10),
            stop=stop_after_attempt(3),
            retry=retry_if_exception(is_retryable_error),
            reraise=True
        )
        async def _call_local_llm():
            async with httpx.AsyncClient(timeout=60.0) as client:
                payload = {
                    "model": LOCAL_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"temperature": 0.1, "num_thread": 6}
                }
                resp = await client.post(OLLAMA_CHAT_URL, json=payload)
                resp.raise_for_status()
                return resp.json()["message"]["content"]

        text = await _call_local_llm()
        summary, tips = "", []
        if "SUMMARY:" in text and "TIPS:" in text:
            parts = text.split("TIPS:")
            summary = parts[0].replace("SUMMARY:", "").strip()
            tips = [t.strip("- ").strip() for t in parts[1].strip().split("\n") if t.strip()]
        return summary or None, tips
    except Exception as e:
        logger.error(f"Error calling local LLM for honor snapshot: {e}")
        return None, []

async def classify_book(title: str, author: str, description: str | None = None) -> tuple[str | None, str | None, str | None]:
    """Use Local LLM to determine a descriptive category, specific genre, and subjects for a single book."""
    results = await classify_books([{"title": title, "author": author, "description": description}])
    return results[0] if results else (None, None, None)

async def classify_books(books: list[dict]) -> list[tuple[str | None, str | None, str | None]]:
    """Use Local LLM to classify multiple books in a single request for efficiency."""
    if not books:
        return []

    classification_guide = json.dumps(BOOK_CLASSIFICATION, indent=2)
    books_text = "\n".join([
        f"ID: {i} | TITLE: {_sanitize_for_prompt(b.get('title'), 150)} | AUTHOR: {_sanitize_for_prompt(b.get('author'), 100)} | DESC: {_sanitize_for_prompt(b.get('description'), 200)}"
        for i, b in enumerate(books)
    ])

    prompt = f"""
    Classify these {len(books)} books strictly using the provided GUIDE.
    
    GUIDE:
    {classification_guide}

    INSTRUCTIONS:
    1. Pick EXACTLY ONE 'category' from the GUIDE keys.
    2. Pick EXACTLY ONE 'genre' from the list associated with that category in the GUIDE.
    3. Provide 2-3 specific 'subjects' as a comma-separated string.
    4. Respond ONLY with a JSON list of objects.

    BOOKS:
    {books_text}

    Format:
    [
      {{"id": 0, "category": "Category Name", "genre": "Genre Name", "subjects": "subject1, subject2"}}
    ]
    """
    try:
        @retry(
            wait=wait_exponential(multiplier=2, min=4, max=20),
            stop=stop_after_attempt(3),
            retry=retry_if_exception(is_retryable_error),
            before_sleep=lambda retry_state: logger.warning(f"Retrying classification (attempt {retry_state.attempt_number})..."),
            reraise=True
        )
        async def _call_local_llm():
            async with httpx.AsyncClient(timeout=600.0) as client:
                payload = {
                    "model": LOCAL_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a professional librarian. Respond ONLY with a valid JSON list of objects matching the guide exactly. For 'subjects', provide 2-3 descriptive keywords about the themes or topics, NEVER the book title."},
                        {"role": "user", "content": prompt}
                    ],
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.0, "num_thread": 6}
                }
                resp = await client.post(OLLAMA_CHAT_URL, json=payload)
                resp.raise_for_status()
                return resp.json()["message"]["content"]

        text = await _call_local_llm()
        logger.info(f"Local LLM Response: {text}")
        
        results = [(None, None, None)] * len(books)
        try:
            # Clean text: strip code blocks and whitespace
            clean_text = text.strip()
            if clean_text.startswith("```"):
                clean_text = clean_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                if clean_text.startswith("json"):
                    clean_text = clean_text.replace("json", "", 1).strip()
            
            data = json.loads(clean_text)
            
            def extract_item_data(obj):
                """Helper to extract classification from varied object shapes."""
                lowered = {k.lower(): v for k, v in obj.items() if isinstance(k, str)}
                cat = lowered.get("category")
                gen = lowered.get("genre")
                sub = lowered.get("subjects") or lowered.get("subject")
                if isinstance(sub, list):
                    sub = ", ".join(map(str, sub))
                return cat, gen, sub

            if isinstance(data, list):
                for item in data:
                    if not isinstance(item, dict): continue
                    idx = item.get("id") or item.get("ID")
                    if idx is not None:
                        idx_int = int(idx)
                        if 0 <= idx_int < len(books):
                            results[idx_int] = extract_item_data(item)
            elif isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, dict) and k.isdigit():
                        idx_int = int(k)
                        if 0 <= idx_int < len(books):
                            results[idx_int] = extract_item_data(v)
                    elif k.lower() in ["id", "category", "genre"]:
                        idx = data.get("id") or data.get("ID") or 0
                        idx_int = int(idx)
                        if 0 <= idx_int < len(books):
                            results[idx_int] = extract_item_data(data)
                        break
        except Exception as e:
            logger.error(f"Failed to parse LLM JSON: {e}. Raw response: {text[:200]}")
            for line in text.split("\n"):
                if "CATEGORY:" in line and "|" in line:
                    try:
                        parts = line.split("|")
                        i_val = int(parts[0].lower().replace("id:", "").strip())
                        if 0 <= i_val < len(books):
                            results[i_val] = (
                                parts[1].replace("CATEGORY:", "").strip(),
                                parts[2].replace("GENRE:", "").strip(),
                                parts[3].replace("SUBJECTS:", "").strip()
                            )
                    except Exception: continue
                
        return results
    except Exception as e:
        logger.error(f"Error bulk classifying books: {type(e).__name__}: {e}")
        return [(None, None, None)] * len(books)
