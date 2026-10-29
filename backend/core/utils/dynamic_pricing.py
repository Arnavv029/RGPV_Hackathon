import os
import logging
from django.conf import settings
from django.db.models import Avg

logger = logging.getLogger(__name__)

# Try to import ML libraries safely to support systems that haven't installed dependencies yet
try:
    import joblib
    HAS_ML_LIBRARIES = True
except ImportError:
    HAS_ML_LIBRARIES = False

class DynamicPricingEngine:
    _instance = None
    _model = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(DynamicPricingEngine, cls).__new__(cls, *args, **kwargs)
        return cls._instance

    def get_model(self):
        """Loads and returns the Random Forest model (cached in memory)."""
        if not HAS_ML_LIBRARIES:
            return None

        if self._model is not None:
            return self._model

        model_path = os.path.join(settings.BASE_DIR, 'core', 'ml', 'pricing_model.joblib')
        if os.path.exists(model_path):
            try:
                self._model = joblib.load(model_path)
                logger.info("Random Forest dynamic pricing model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Random Forest model from {model_path}: {e}")
                self._model = None
        else:
            logger.warning(f"Random Forest model file not found at {model_path}. Fallback pricing will be used.")
            self._model = None

        return self._model

    def calculate_fallback_price(self, base_price, hour, day_of_week, occupancy_rate, station_rating):
        """Deterministic rule-based dynamic pricing algorithm (fallback if ML model is unavailable)."""
        multiplier = 1.0

        # Peak hours (+30%): 8 AM - 11 AM and 5 PM - 9 PM
        if (8 <= hour <= 11) or (17 <= hour <= 21):
            multiplier += 0.30

        # Weekends (+15%): Sat (5) and Sun (6)
        if day_of_week >= 5:
            multiplier += 0.15

        # Occupancy rate surge (Demand pricing)
        if occupancy_rate > 0.7:
            multiplier += 0.40 * occupancy_rate
        elif occupancy_rate > 0.4:
            multiplier += 0.15 * occupancy_rate

        # Station rating premium
        if station_rating >= 4.5:
            multiplier += 0.10
        elif station_rating < 3.5:
            multiplier -= 0.05

        # Cap the multiplier safely between 0.8 (discount) and 2.2 (max surge)
        multiplier = max(0.8, min(2.2, multiplier))

        return round(base_price * multiplier, 2)

    def get_slot_dynamic_price(self, slot):
        """Calculates dynamic price for a specific slot using Random Forest or fallback rules."""
        # 1. Extract features
        base_price = float(slot.station.price_per_hour or 80.0)
        hour = slot.start_time.hour
        day_of_week = slot.date.weekday()
        
        capacity = max(1, slot.capacity)
        occupancy_rate = float(slot.booked_count) / float(capacity)
        occupancy_rate = min(1.0, max(0.0, occupancy_rate))

        # Station rating calculation
        if hasattr(slot.station, 'avg_rating'):
            station_rating = float(slot.station.avg_rating or 4.0)
        else:
            agg = slot.station.reviews.aggregate(a=Avg('rating'))['a']
            station_rating = float(agg or 4.0)

        # 2. Try Random Forest Inference
        model = self.get_model()
        if model is not None:
            try:
                # Prepare features as a 2D array: [[base_price, hour, day_of_week, occupancy_rate, station_rating]]
                features = [[base_price, hour, day_of_week, occupancy_rate, station_rating]]
                predicted_price = model.predict(features)[0]
                # Ensure the predicted price is reasonable (never drop below 80% of base price)
                min_price = base_price * 0.8
                max_price = base_price * 2.5
                final_price = max(min_price, min(max_price, predicted_price))
                return round(final_price, 2)
            except Exception as e:
                logger.error(f"ML Inference failed, using fallback pricing: {e}")

        # 3. Fallback Pricing
        return self.calculate_fallback_price(base_price, hour, day_of_week, occupancy_rate, station_rating)

# Instantiate the singleton engine
pricing_engine = DynamicPricingEngine()

def calculate_slot_price(slot):
    """Utility function to get dynamic price of a slot."""
    return pricing_engine.get_slot_dynamic_price(slot)
