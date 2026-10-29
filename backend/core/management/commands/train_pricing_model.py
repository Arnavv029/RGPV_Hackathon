import os
import random
from django.core.management.base import BaseCommand
from django.conf import settings

class Command(BaseCommand):
    help = 'Generates training data and trains a Random Forest model for EV slot dynamic pricing'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Checking ML dependencies..."))
        try:
            import numpy as np
            import pandas as pd
            from sklearn.ensemble import RandomForestRegressor
            from sklearn.model_selection import train_test_split
            from sklearn.metrics import mean_squared_error, r2_score
            import joblib
            HAS_DEPS = True
        except ImportError as e:
            self.stdout.write(self.style.ERROR(
                f"Missing ML dependencies: {str(e)}\n"
                "Please run: pip install scikit-learn pandas numpy joblib"
            ))
            return

        self.stdout.write(self.style.SUCCESS("ML dependencies verified. Generating synthetic training dataset..."))

        # Seed for reproducibility
        np.random.seed(42)
        random.seed(42)

        # Generate 5,000 historical samples
        # Features: base_price, hour, day_of_week, occupancy_rate, station_rating
        num_samples = 5000

        base_prices = np.random.uniform(50.0, 200.0, num_samples)
        hours = np.random.randint(0, 24, num_samples)
        days_of_week = np.random.randint(0, 7, num_samples)
        occupancy_rates = np.random.uniform(0.0, 1.0, num_samples)
        station_ratings = np.random.uniform(3.0, 5.0, num_samples)

        dynamic_prices = []

        for i in range(num_samples):
            bp = base_prices[i]
            hr = hours[i]
            dow = days_of_week[i]
            occ = occupancy_rates[i]
            rating = station_ratings[i]

            # Calculate base multiplier
            multiplier = 1.0

            # Peak hour surges:
            # 8 AM to 11 AM and 5 PM to 9 PM
            if (8 <= hr <= 11) or (17 <= hr <= 21):
                multiplier += 0.30

            # Weekend surges: Saturday (5) and Sunday (6)
            if dow >= 5:
                multiplier += 0.15

            # High occupancy surges (demand pricing)
            if occ > 0.7:
                multiplier += 0.40 * occ
            elif occ > 0.4:
                multiplier += 0.15 * occ

            # High rating surge (premium station quality)
            if rating >= 4.5:
                multiplier += 0.10
            elif rating < 3.5:
                multiplier -= 0.05  # slightly discounted for low ratings

            # Add random noise (representing other unmodeled fluctuations)
            noise = np.random.normal(0, 0.03)
            multiplier = max(0.8, multiplier + noise)

            # Compute final target dynamic price
            dynamic_prices.append(round(bp * multiplier, 2))

        # Build DataFrame
        df = pd.DataFrame({
            'base_price': base_prices,
            'hour': hours,
            'day_of_week': days_of_week,
            'occupancy_rate': occupancy_rates,
            'station_rating': station_ratings,
            'dynamic_price': dynamic_prices
        })

        # Split features and target
        X = df[['base_price', 'hour', 'day_of_week', 'occupancy_rate', 'station_rating']]
        y = df['dynamic_price']

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        self.stdout.write(f"Training Random Forest Regressor on {len(X_train)} samples...")
        
        # Train RandomForestRegressor
        model = RandomForestRegressor(
            n_estimators=100,
            max_depth=12,
            min_samples_split=5,
            random_state=42
        )
        model.fit(X_train, y_train)

        # Evaluate model
        y_pred = model.predict(X_test)
        mse = mean_squared_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        self.stdout.write(self.style.SUCCESS("Model training complete!"))
        self.stdout.write(f"Evaluation Metrics:")
        self.stdout.write(f" - Mean Squared Error (MSE): {mse:.4f}")
        self.stdout.write(f" - R-squared (R2) Score:     {r2:.4f}")

        # Ensure directory exists
        ml_dir = os.path.join(settings.BASE_DIR, 'core', 'ml')
        os.makedirs(ml_dir, exist_ok=True)
        model_path = os.path.join(ml_dir, 'pricing_model.joblib')

        self.stdout.write(f"Saving trained model to: {model_path}...")
        joblib.dump(model, model_path)

        self.stdout.write(self.style.SUCCESS("Model saved successfully and ready for production inference!"))
