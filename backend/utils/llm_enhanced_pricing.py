"""
LLM-Enhanced Dynamic Pricing Service for EV Charging Stations.
Integrates AI model predictions with LLM-based demand analysis and pricing optimization.
"""

import logging
import joblib
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from django.conf import settings
from django.db import models

from utils.llm_client import get_deepseek_client

logger = logging.getLogger(__name__)


class LLMEnhancedPricingEngine:
    """
    Combines ML-based dynamic pricing with LLM-powered demand analysis and pricing optimization.
    """
    
    def __init__(self):
        """Initialize the pricing engine with ML model and LLM client."""
        self.model = None
        self.llm_client = None
        self._load_model()
        self._init_llm()
    
    def _load_model(self):
        """Load the pre-trained Random Forest model."""
        try:
            model_path = Path(settings.BASE_DIR) / 'core' / 'ml' / 'pricing_model.joblib'
            if model_path.exists():
                self.model = joblib.load(model_path)
                logger.info(f"✅ Pricing model loaded: {model_path}")
            else:
                logger.warning(f"⚠️  Pricing model not found at {model_path}. Using fallback pricing.")
        except Exception as e:
            logger.warning(f"⚠️  Error loading pricing model: {e}. Using fallback pricing.")
    
    def _init_llm(self):
        """Initialize LLM client if enabled."""
        try:
            if getattr(settings, 'LLM_ENABLED', False):
                self.llm_client = get_deepseek_client()
                logger.info("✅ LLM client initialized for pricing enhancements")
        except Exception as e:
            logger.warning(f"⚠️  LLM initialization failed: {e}. LLM features disabled.")
    
    def get_dynamic_price(self, slot, use_llm: bool = False) -> Dict[str, Any]:
        """
        Calculate dynamic price for a time slot using ML (+ optional LLM insights).

        use_llm is off by default: an LLM round-trip per slot makes slot
        listings take minutes, so only call it for a single slot.
        """
        try:
            ml_price = self._predict_ml_price(slot)

            llm_insights = self._get_llm_insights(slot) if (use_llm and self.llm_client) else None

            final_price = self._apply_llm_adjustments(ml_price, llm_insights)

            return {
                'price': round(float(final_price), 2),
                'base_price': round(float(slot.station.price_per_hour or ml_price), 2),
                'currency': 'INR',
                'explanation': self._generate_price_explanation(slot, llm_insights),
                'llm_factors': llm_insights,
                'timestamp': datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"Error calculating dynamic price: {e}")
            return self._fallback_pricing(slot)
    
    def _predict_ml_price(self, slot) -> float:
        """
        Predict hourly price using Random Forest model.
        Falls back to rule-based pricing if model unavailable.
        """
        if self.model is None:
            return self._fallback_ml_price(slot)
        
        try:
            # Extract features from the slot
            features = self._extract_features(slot)
            prediction = self.model.predict([features])[0]
            
            # Ensure price is reasonable (bounded)
            min_price = float(slot.station.price_per_hour or 50)
            max_price = min_price * 3  # Max 3x the base price
            
            return np.clip(prediction, min_price, max_price)
        except Exception as e:
            logger.warning(f"ML prediction failed: {e}. Using fallback.")
            return self._fallback_ml_price(slot)
    
    def _extract_features(self, slot) -> list:
        """
        Extract features from slot for ML model prediction.
        Features: [base_price, hour, day_of_week, occupancy_rate, station_rating]
        """
        base_price = float(slot.station.price_per_hour or 100)
        hour = slot.start_time.hour
        day_of_week = slot.date.weekday()
        
        # Calculate occupancy rate
        occupancy_rate = self._calculate_occupancy(slot)
        
        # Get station rating from reviews
        station_rating = self._get_station_rating(slot.station)
        
        return [base_price, hour, day_of_week, occupancy_rate, station_rating]
    
    def _calculate_occupancy(self, slot) -> float:
        """Occupancy rate for the slot (0.0 to 1.0), from the same counter that drives availability."""
        if not slot.capacity:
            return 0.0
        return min(slot.booked_count / slot.capacity, 1.0)

    def _get_station_rating(self, station) -> float:
        """Average review rating (1.0 to 5.0); cached on the station object for the request."""
        cached = getattr(station, '_pricing_rating', None)
        if cached is not None:
            return cached
        try:
            avg_rating = station.reviews.aggregate(a=models.Avg('rating'))['a']
            rating = float(avg_rating or 3.0)
        except Exception as e:
            logger.warning(f"Error getting station rating: {e}")
            rating = 3.0
        station._pricing_rating = rating
        return rating
    
    def _get_llm_insights(self, slot) -> Optional[Dict[str, Any]]:
        """
        Use LLM to analyze demand patterns and provide pricing insights.
        """
        if not self.llm_client:
            return None
        
        try:
            # Gather data for LLM analysis
            occupancy = self._calculate_occupancy(slot)
            hour = slot.start_time.hour
            day_name = slot.date.strftime('%A')
            station_rating = self._get_station_rating(slot.station)
            
            # Generate LLM analysis prompt
            prompt = f"""Analyze EV charging demand and pricing for this scenario:
Station: {slot.station.name}
Time: {slot.start_time.strftime('%H:%M')} on {day_name}
Current Occupancy: {occupancy*100:.0f}%
Station Rating: {station_rating}/5.0

Based on these factors, provide in JSON format:
{{
  "demand_level": "low|medium|high",
  "price_adjustment": -0.2 to 0.3 (multiplier adjustment),
  "reason": "explanation"
}}"""
            
            response = self.llm_client.chat(prompt)
            
            # Parse response (adjust based on actual API response format)
            import json
            response_text = response.get('choices', [{}])[0].get('message', {}).get('content', '{}')
            insights = json.loads(response_text)
            
            return insights
        except Exception as e:
            logger.warning(f"LLM insights generation failed: {e}")
            return None
    
    def _apply_llm_adjustments(self, base_price: float, llm_insights: Optional[Dict]) -> float:
        """Apply LLM-recommended price adjustments."""
        if not llm_insights:
            return base_price
        
        try:
            adjustment = float(llm_insights.get('price_adjustment', 0))
            # Cap adjustment between -20% and +30%
            adjustment = np.clip(adjustment, -0.2, 0.3)
            return base_price * (1 + adjustment)
        except Exception as e:
            logger.warning(f"Error applying LLM adjustments: {e}")
            return base_price
    
    def _generate_price_explanation(self, slot, llm_insights: Optional[Dict]) -> str:
        """Generate human-readable explanation for the price."""
        base_explanation = f"₹{slot.station.price_per_hour}/hr base rate"
        
        if llm_insights and self.llm_client:
            reason = llm_insights.get('reason', '')
            if reason:
                return f"{base_explanation}. {reason}"
        
        # Fallback explanation
        occupancy = self._calculate_occupancy(slot)
        hour = slot.start_time.hour
        
        if occupancy > 0.8:
            return f"{base_explanation}. High demand (+pricing)"
        elif hour in [8, 9, 10, 17, 18, 19, 20]:  # Peak hours
            return f"{base_explanation}. Peak hours (+pricing)"
        elif slot.date.weekday() >= 5:  # Weekend
            return f"{base_explanation}. Weekend pricing"
        else:
            return f"{base_explanation}. Off-peak rate"
    
    def _fallback_ml_price(self, slot) -> float:
        """Rule-based fallback pricing when ML model unavailable."""
        base_price = float(slot.station.price_per_hour or 100)
        hour = slot.start_time.hour
        occupancy = self._calculate_occupancy(slot)
        rating = self._get_station_rating(slot.station)
        
        # Apply multipliers
        multiplier = 1.0
        
        # Peak hours: 8-11 AM, 5-9 PM
        if hour in range(8, 12) or hour in range(17, 22):
            multiplier *= 1.3
        
        # Weekend: Saturday=5, Sunday=6
        if slot.date.weekday() >= 5:
            multiplier *= 1.15
        
        # Occupancy surge: up to +40%
        multiplier *= (1 + occupancy * 0.4)
        
        # High rating bonus: +10% for >= 4.5
        if rating >= 4.5:
            multiplier *= 1.1
        
        final_price = base_price * multiplier
        return np.clip(final_price, base_price, base_price * 3)
    
    def _fallback_pricing(self, slot) -> Dict[str, Any]:
        """Complete fallback when everything fails."""
        base_price = float(slot.station.price_per_hour or 100)
        
        return {
            'price': base_price,
            'base_price': base_price,
            'currency': 'INR',
            'explanation': 'Standard pricing rate',
            'llm_factors': None,
            'timestamp': datetime.now().isoformat(),
        }


# Singleton instance
_pricing_engine = None


def get_pricing_engine() -> LLMEnhancedPricingEngine:
    """Get or create the pricing engine instance."""
    global _pricing_engine
    if _pricing_engine is None:
        _pricing_engine = LLMEnhancedPricingEngine()
    return _pricing_engine


def get_slot_dynamic_price(slot, use_llm: bool = False) -> Dict[str, Any]:
    """Public API to get dynamic price for a slot."""
    return get_pricing_engine().get_dynamic_price(slot, use_llm=use_llm)
