import google.generativeai as genai
from typing import List, Optional, Tuple
from app.core.config import settings

# Configure Gemini
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

async def generate_honor_snapshot(reviews: List[str]) -> Tuple[Optional[str], List[str]]:
    """
    Use Gemini to synthesize a reputation summary and improvement tips from raw reviews.
    Reviews are anonymized (only the comment text is passed).
    """
    if not settings.GEMINI_API_KEY or not reviews:
        return None, []

    # Combine reviews into a single string for the prompt
    reviews_text = "\n".join([f"- {r}" for r in reviews])
    
    prompt = f"""
    You are an assistant for a community resource exchange platform. 
    Below is a list of anonymized user reviews for a community member. 
    Please provide:
    1. A concise (2-3 sentences) summary of the general sentiment and behavior of this user.
    2. A list of 2-3 actionable improvement tips if there are any negative patterns. 
       If the feedback is overwhelmingly positive, provide tips on how to remain a pillar of the community.

    Strictly follow this format:
    SUMMARY: [Your summary here]
    TIPS:
    - [Tip 1]
    - [Tip 2]

    REVIEWS:
    {reviews_text}
    """

    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        text = response.text

        summary = ""
        tips = []

        if "SUMMARY:" in text and "TIPS:" in text:
            parts = text.split("TIPS:")
            summary = parts[0].replace("SUMMARY:", "").strip()
            tips_raw = parts[1].strip().split("\n")
            tips = [t.strip("- ").strip() for t in tips_raw if t.strip()]
        
        return summary or None, tips
    except Exception as e:
        # Log error in production
        print(f"Error calling Gemini: {e}")
        return None, []