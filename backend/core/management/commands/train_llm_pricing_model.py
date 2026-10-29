"""
Management command to train LLM-enhanced dynamic pricing model.
Usage: python manage.py train_llm_pricing_model
"""

import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score
import joblib
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = 'Train LLM-enhanced dynamic pricing model using ML + AI'

    def add_arguments(self, parser):
        parser.add_argument(
            '--samples',
            type=int,
            default=5000,
            help='Number of training samples to generate'
        )
        parser.add_argument(
            '--test-size',
            type=float,
            default=0.2,
            help='Test set size ratio'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('🚀 LLM-Enhanced Dynamic Pricing Model Training'))
        self.stdout.write(self.style.SUCCESS('=' * 70))

        samples = options.get('samples', 5000)
        test_size = options.get('test_size', 0.2)

        try:
            # Generate synthetic training data
            self.stdout.write('\n📊 Generating synthetic training data...')
            X, y = self._generate_training_data(samples)
            
            self.stdout.write(self.style.SUCCESS(f'✅ Generated {len(X)} samples'))
            self.stdout.write(f'   Features: base_price, hour, day_of_week, occupancy_rate, station_rating')

            # Split data
            self.stdout.write('\n📂 Splitting data into train/test sets...')
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42
            )
            self.stdout.write(self.style.SUCCESS(
                f'✅ Train: {len(X_train)} samples, Test: {len(X_test)} samples'
            ))

            # Train model
            self.stdout.write('\n🤖 Training Random Forest Regressor...')
            self.stdout.write(f'   Parameters: n_estimators=100, max_depth=10, random_state=42')
            
            model = RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )
            model.fit(X_train, y_train)
            self.stdout.write(self.style.SUCCESS('✅ Model training complete!'))

            # Evaluate
            self.stdout.write('\n📈 Evaluating model performance...')
            y_pred = model.predict(X_test)
            mse = mean_squared_error(y_test, y_pred)
            r2 = r2_score(y_test, y_pred)
            rmse = np.sqrt(mse)
            
            self.stdout.write(self.style.SUCCESS('Evaluation Metrics:'))
            self.stdout.write(f'  • Mean Squared Error (MSE):  {mse:.4f}')
            self.stdout.write(f'  • Root Mean Squared Error:   ₹{rmse:.2f}')
            self.stdout.write(f'  • R² Score:                  {r2:.4f} (↑ closer to 1.0 is better)')

            if r2 < 0.8:
                self.stdout.write(self.style.WARNING('  ⚠️  R² < 0.8: Model may need more data or tuning'))
            else:
                self.stdout.write(self.style.SUCCESS('  ✅ Good model fit!'))

            # Feature importance
            self.stdout.write('\n🎯 Feature Importance:')
            feature_names = ['base_price', 'hour', 'day_of_week', 'occupancy_rate', 'station_rating']
            importances = model.feature_importances_
            for name, importance in sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True):
                bar = '█' * int(importance * 50)
                self.stdout.write(f'  {name:20} {importance:6.2%} {bar}')

            # Save model
            self.stdout.write('\n💾 Saving trained model...')
            model_dir = Path(settings.BASE_DIR) / 'core' / 'ml'
            model_dir.mkdir(parents=True, exist_ok=True)
            
            model_path = model_dir / 'pricing_model.joblib'
            joblib.dump(model, model_path)
            self.stdout.write(self.style.SUCCESS(f'✅ Model saved: {model_path}'))

            # Summary
            self.stdout.write('\n' + self.style.SUCCESS('=' * 70))
            self.stdout.write(self.style.SUCCESS('✨ Training Complete!'))
            self.stdout.write(self.style.SUCCESS('=' * 70))
            self.stdout.write('\n📌 Next Steps:')
            self.stdout.write('   1. Restart your Django server')
            self.stdout.write('   2. Set LLM_ENABLED=true in .env (optional, for enhanced pricing)')
            self.stdout.write('   3. Test dynamic pricing: GET /api/stations/{id}/slots/')
            self.stdout.write('   4. Check pricing_model.joblib is loading correctly\n')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error: {e}'))
            raise

    def _generate_training_data(self, num_samples: int):
        """
        Generate synthetic training data for the pricing model.
        
        Features:
          - base_price: ₹50-250 (typical hourly rates)
          - hour: 0-23 (time of day)
          - day_of_week: 0-6 (Monday-Sunday)
          - occupancy_rate: 0.0-1.0 (current slot occupancy)
          - station_rating: 1.0-5.0 (average station review rating)
        
        Target (dynamic_price): base_price * multiplier based on demand
        """
        np.random.seed(42)
        
        # Generate features
        base_prices = np.random.uniform(50, 250, num_samples)
        hours = np.random.randint(0, 24, num_samples)
        days = np.random.randint(0, 7, num_samples)
        occupancy = np.random.uniform(0, 1, num_samples)
        ratings = np.random.uniform(1, 5, num_samples)
        
        # Calculate dynamic prices with multipliers
        multiplier = np.ones(num_samples)
        
        # Peak hour surge: +30% (8-11 AM, 5-9 PM)
        peak_hours = (hours >= 8) & (hours <= 11) | (hours >= 17) & (hours <= 21)
        multiplier[peak_hours] *= 1.3
        
        # Weekend surge: +15% (Saturday=5, Sunday=6)
        weekend = (days >= 5)
        multiplier[weekend] *= 1.15
        
        # Occupancy surge: up to +40% based on occupancy rate
        multiplier *= (1 + occupancy * 0.4)
        
        # High rating bonus: +10% for rating >= 4.5
        high_rating = (ratings >= 4.5)
        multiplier[high_rating] *= 1.1
        
        # Add realistic noise (5-10% variance)
        noise = np.random.normal(1.0, 0.075, num_samples)
        multiplier *= noise
        
        # Calculate final prices
        dynamic_prices = base_prices * multiplier
        
        # Cap prices
        dynamic_prices = np.clip(dynamic_prices, base_prices, base_prices * 3)
        
        # Create feature matrix
        X = np.column_stack([base_prices, hours, days, occupancy, ratings])
        y = dynamic_prices
        
        return X, y
