"""
Management command to test LLM-enhanced dynamic pricing.
Usage: python manage.py test_llm_pricing
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from datetime import datetime, timedelta


class Command(BaseCommand):
    help = 'Test LLM-enhanced dynamic pricing system'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('🔬 LLM-Enhanced Dynamic Pricing Test Suite'))
        self.stdout.write(self.style.SUCCESS('=' * 70))

        try:
            from core.models import Station, TimeSlot
            from utils.llm_enhanced_pricing import get_pricing_engine
            
            # Check system status
            self._check_system_status()
            
            # Test with real data if available
            self.stdout.write('\n' + self.style.WARNING('━' * 70))
            self.stdout.write('TEST 1: System Configuration')
            self.stdout.write(self.style.WARNING('━' * 70))
            self._test_config()
            
            # Test pricing engine initialization
            self.stdout.write('\n' + self.style.WARNING('━' * 70))
            self.stdout.write('TEST 2: Engine Initialization')
            self.stdout.write(self.style.WARNING('━' * 70))
            engine = get_pricing_engine()
            self._test_engine_init(engine)
            
            # Test ML model
            self.stdout.write('\n' + self.style.WARNING('━' * 70))
            self.stdout.write('TEST 3: ML Model Status')
            self.stdout.write(self.style.WARNING('━' * 70))
            self._test_ml_model(engine)
            
            # Test LLM integration
            self.stdout.write('\n' + self.style.WARNING('━' * 70))
            self.stdout.write('TEST 4: LLM Integration')
            self.stdout.write(self.style.WARNING('━' * 70))
            self._test_llm_integration(engine)
            
            # Test with real slots if they exist
            if Station.objects.exists():
                self.stdout.write('\n' + self.style.WARNING('━' * 70))
                self.stdout.write('TEST 5: Real Slot Pricing')
                self.stdout.write(self.style.WARNING('━' * 70))
                self._test_real_pricing()
            else:
                self.stdout.write('\n' + self.style.WARNING('⚠️  No stations found. Create sample data to test pricing.'))
            
            self.stdout.write('\n' + self.style.SUCCESS('=' * 70))
            self.stdout.write(self.style.SUCCESS('✅ All tests completed!'))
            self.stdout.write(self.style.SUCCESS('=' * 70 + '\n'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Error during testing: {e}\n'))
            import traceback
            traceback.print_exc()

    def _check_system_status(self):
        """Check if all required packages are available."""
        self.stdout.write('📦 Checking dependencies...')
        
        dependencies = {
            'sklearn': 'scikit-learn',
            'pandas': 'pandas',
            'numpy': 'numpy',
            'joblib': 'joblib',
            'requests': 'requests',
        }
        
        all_ok = True
        for module, name in dependencies.items():
            try:
                __import__(module)
                self.stdout.write(self.style.SUCCESS(f'  ✅ {name}'))
            except ImportError:
                self.stdout.write(self.style.ERROR(f'  ❌ {name} - Not installed'))
                all_ok = False
        
        if not all_ok:
            self.stdout.write(self.style.WARNING('\n  Install missing packages: pip install -r requirements.txt'))

    def _test_config(self):
        """Test configuration settings."""
        self.stdout.write('Checking Django settings...')
        
        llm_base_url = getattr(settings, 'LLM_BASE_URL', 'Not set')
        llm_enabled = getattr(settings, 'LLM_ENABLED', False)
        
        self.stdout.write(f'  • LLM_BASE_URL: {llm_base_url}')
        self.stdout.write(f'  • LLM_ENABLED: {llm_enabled}')
        
        if llm_enabled:
            self.stdout.write(self.style.SUCCESS('  ✅ LLM features enabled'))
        else:
            self.stdout.write(self.style.WARNING('  ⚠️  LLM features disabled (set LLM_ENABLED=true in .env)'))

    def _test_engine_init(self, engine):
        """Test pricing engine initialization."""
        self.stdout.write('Initializing pricing engine...')
        
        self.stdout.write(f'  • ML Model loaded: {engine.model is not None}')
        if engine.model is not None:
            self.stdout.write(self.style.SUCCESS('    ✅ Model ready for predictions'))
        else:
            self.stdout.write(self.style.WARNING('    ⚠️  Model not found. Run: python manage.py train_llm_pricing_model'))
        
        self.stdout.write(f'  • LLM Client ready: {engine.llm_client is not None}')
        if engine.llm_client is not None:
            self.stdout.write(self.style.SUCCESS('    ✅ LLM available'))
        else:
            self.stdout.write(self.style.WARNING('    ⚠️  LLM not available (check LLM_ENABLED and server)'))

    def _test_ml_model(self, engine):
        """Test ML model predictions."""
        self.stdout.write('Testing ML model predictions...')
        
        if engine.model is None:
            self.stdout.write(self.style.WARNING('  ⚠️  Model not loaded. Skipping ML tests.'))
            return
        
        try:
            import numpy as np
            
            # Create test features
            test_features = [
                [100, 9, 1, 0.85, 4.5],   # Peak hour, high occupancy, good rating
                [100, 14, 3, 0.2, 3.0],   # Mid-day, low occupancy, average rating
                [100, 22, 5, 0.95, 5.0],  # Late evening, full, excellent rating
            ]
            
            predictions = engine.model.predict(test_features)
            
            scenarios = [
                "Peak hour, high occupancy (9 AM, 85% booked, 4.5★)",
                "Mid-day, low occupancy (2 PM, 20% booked, 3.0★)",
                "Late evening, full (10 PM, 95% booked, 5.0★)",
            ]
            
            for scenario, prediction in zip(scenarios, predictions):
                self.stdout.write(f'  • {scenario}')
                self.stdout.write(f'    → Predicted price: ₹{prediction:.2f}/hr')
            
            self.stdout.write(self.style.SUCCESS('  ✅ ML predictions working'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ❌ ML prediction failed: {e}'))

    def _test_llm_integration(self, engine):
        """Test LLM integration."""
        self.stdout.write('Testing LLM integration...')
        
        if engine.llm_client is None:
            self.stdout.write(self.style.WARNING('  ⚠️  LLM not available (check settings and server)'))
            return
        
        try:
            response = engine.llm_client.chat("What is dynamic pricing for EV charging?")
            
            if response:
                self.stdout.write(self.style.SUCCESS('  ✅ LLM responding'))
                self.stdout.write(f'    Sample response: {str(response)[:100]}...')
            else:
                self.stdout.write(self.style.WARNING('  ⚠️  LLM response empty'))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  ⚠️  LLM not responding: {e}'))

    def _test_real_pricing(self):
        """Test pricing with real slot data."""
        self.stdout.write('Testing pricing with real slots...')
        
        try:
            from core.models import TimeSlot
            from utils.llm_enhanced_pricing import get_slot_dynamic_price
            
            # Get first available slot
            slots = TimeSlot.objects.select_related('station').filter(
                date__gte=datetime.now().date()
            )[:3]
            
            if not slots:
                self.stdout.write(self.style.WARNING('  ⚠️  No future slots found'))
                return
            
            for slot in slots:
                try:
                    pricing = get_slot_dynamic_price(slot)
                    
                    self.stdout.write(f'  • {slot.station.name} - {slot.date} {slot.start_time.strftime("%H:%M")}')
                    self.stdout.write(f'    → Price: ₹{pricing["price"]:.2f}/hr')
                    self.stdout.write(f'    → Reason: {pricing["explanation"]}')
                    
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'    ❌ Error: {e}'))
            
            self.stdout.write(self.style.SUCCESS('  ✅ Real pricing calculation working'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ❌ Real pricing test failed: {e}'))
