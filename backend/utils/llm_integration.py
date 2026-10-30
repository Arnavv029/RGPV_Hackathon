"""
LLM Integration utilities for EV Station features.
Provides domain-specific LLM functionality for reviews, summaries, and descriptions.
"""

import logging
from typing import Optional, Dict, Any

from django.conf import settings
from utils.llm_client import get_deepseek_client

logger = logging.getLogger(__name__)


def is_llm_enabled() -> bool:
    """Check if LLM features are enabled."""
    return getattr(settings, 'LLM_ENABLED', False)


def generate_review_summary(reviews: list) -> Optional[str]:
    """
    Generate an AI summary of multiple station reviews.
    
    Args:
        reviews: List of review comment strings
    
    Returns:
        AI-generated summary or None if LLM is disabled/unavailable
    """
    if not is_llm_enabled() or not reviews:
        return None
    
    reviews_text = "\n".join([f"- {review}" for review in reviews if review])
    
    try:
        client = get_deepseek_client()
        prompt = f"""Summarize these EV charging station reviews in 2-3 sentences:
{reviews_text}

Focus on: charging speed, availability, cleanliness, and overall experience."""
        
        response = client.chat(prompt)
        # Extract the response text - adjust based on actual API response format
        return response.get('choices', [{}])[0].get('message', {}).get('content', '')
    except Exception as e:
        logger.error(f"Error generating review summary: {e}")
        return None


def generate_station_description(station_name: str, location: str) -> Optional[str]:
    """
    Generate an AI description for a station.
    
    Args:
        station_name: Name of the EV charging station
        location: Location/address of the station
    
    Returns:
        AI-generated description or None if LLM is disabled/unavailable
    """
    if not is_llm_enabled():
        return None
    
    try:
        client = get_deepseek_client()
        prompt = f"""Create a brief, professional marketing description (2-3 sentences) for an EV charging station:
Station Name: {station_name}
Location: {location}

The description should be welcoming, highlight EV charging benefits, and encourage bookings."""
        
        response = client.chat(prompt)
        return response.get('choices', [{}])[0].get('message', {}).get('content', '')
    except Exception as e:
        logger.error(f"Error generating station description: {e}")
        return None


def sentiment_analysis_review(comment: str) -> Optional[Dict[str, Any]]:
    """
    Analyze sentiment of a review comment.
    
    Args:
        comment: Review comment text
    
    Returns:
        Dict with sentiment analysis or None if unavailable
    """
    if not is_llm_enabled() or not comment:
        return None
    
    try:
        client = get_deepseek_client()
        prompt = f"""Analyze the sentiment of this EV station review. Respond in JSON format with 'sentiment' (positive/neutral/negative) and 'score' (1-10):
"{comment}"

Response format: {{"sentiment": "...", "score": ...}}"""
        
        response = client.chat(prompt)
        response_text = response.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        # Try to parse JSON from response
        import json
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"Error analyzing review sentiment: {e}")
        return None


def generate_slot_recommendations(user_history: str) -> Optional[str]:
    """
    Generate personalized slot recommendations based on user history.
    
    Args:
        user_history: Summary of user's booking history
    
    Returns:
        AI-generated recommendations or None if unavailable
    """
    if not is_llm_enabled():
        return None
    
    try:
        client = get_deepseek_client()
        prompt = f"""Based on this EV charging booking history, recommend ideal time slots for future bookings:
{user_history}

Consider: charging patterns, peak/off-peak times, and user convenience."""
        
        response = client.chat(prompt)
        return response.get('choices', [{}])[0].get('message', {}).get('content', '')
    except Exception as e:
        logger.error(f"Error generating slot recommendations: {e}")
        return None


def moderate_review_comment(comment: str) -> Dict[str, Any]:
    """
    Use LLM for content moderation of review comments.
    
    Args:
        comment: Review comment to moderate
    
    Returns:
        Dict with 'safe' (bool) and 'reason' (str) keys
    """
    if not is_llm_enabled():
        # Default to allowing if LLM is disabled
        return {"safe": True, "reason": "LLM moderation disabled"}
    
    try:
        client = get_deepseek_client()
        prompt = f"""Review this text for an EV charging station review. Flag if it contains: profanity, hate speech, spam, or off-topic content. 
Respond in JSON: {{"safe": true/false, "reason": "..."}}

Comment: "{comment}\""""
        
        response = client.chat(prompt)
        response_text = response.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        import json
        return json.loads(response_text)
    except Exception as e:
        logger.warning(f"LLM moderation failed, allowing comment: {e}")
        return {"safe": True, "reason": "Moderation service unavailable"}
