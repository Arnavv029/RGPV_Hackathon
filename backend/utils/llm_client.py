"""
LLM API Client for Deepseek integration.
Provides utilities for interacting with local LLM endpoints.
"""

import requests
import json
import logging
from typing import Optional, Dict, Any
from django.conf import settings

logger = logging.getLogger(__name__)


class DeepseekClient:
    """Client for interacting with Deepseek LLM API."""
    
    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize Deepseek client.
        
        Args:
            base_url: Base URL of the LLM API server (defaults to settings.LLM_BASE_URL)
        """
        if base_url is None:
            base_url = settings.LLM_BASE_URL
        self.base_url = base_url
        self.endpoint = f"{base_url}/api/v1/chat"
        self.model = "deepseek/deepseek-r1-0528-qwen3-8b"
    
    def chat(
        self, 
        input_text: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send a request to the Deepseek API.
        
        Args:
            input_text: The user input/question
            system_prompt: Optional system prompt to guide the model's behavior
            model: Optional model override (defaults to deepseek-r1)
            **kwargs: Additional parameters to pass to the API
        
        Returns:
            API response as dictionary
        
        Raises:
            requests.RequestException: If the API request fails
        """
        payload = {
            "model": model or self.model,
            "input": input_text,
        }
        
        if system_prompt:
            payload["system_prompt"] = system_prompt
        
        payload.update(kwargs)
        
        try:
            response = requests.post(
                self.endpoint,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Error calling Deepseek API: {e}")
            raise
    
    def chat_with_rhymes(self, input_text: str) -> Dict[str, Any]:
        """
        Get a response that answers only in rhymes.
        
        Args:
            input_text: The question to ask
        
        Returns:
            API response as dictionary
        """
        return self.chat(
            input_text=input_text,
            system_prompt="You answer only in rhymes."
        )


# Singleton instance
_client = None


def get_deepseek_client(base_url: Optional[str] = None) -> DeepseekClient:
    """
    Get or create a Deepseek client instance.
    
    Args:
        base_url: Base URL of the LLM API server (defaults to settings.LLM_BASE_URL)
    
    Returns:
        DeepseekClient instance
    """
    global _client
    if _client is None:
        _client = DeepseekClient(base_url=base_url)
    return _client
