"""
Management command to test LLM integration.
Usage: python manage.py test_llm
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from utils.llm_client import get_deepseek_client
from utils.llm_integration import (
    generate_review_summary,
    generate_station_description,
    is_llm_enabled
)


class Command(BaseCommand):
    help = 'Test LLM integration with Deepseek API'

    def add_arguments(self, parser):
        parser.add_argument(
            '--test-type',
            type=str,
            default='all',
            help='Type of test: chat, rhyme, summary, description, or all'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('LLM Integration Test Suite'))
        self.stdout.write(self.style.SUCCESS('=' * 60))

        # Check if LLM is enabled
        if not is_llm_enabled():
            self.stdout.write(self.style.WARNING(
                '\n⚠️  LLM_ENABLED is False in settings.\n'
                'Set LLM_ENABLED=true in your .env file to enable LLM features.'
            ))
        
        self.stdout.write(f'\nLLM Base URL: {settings.LLM_BASE_URL}')
        self.stdout.write(f'LLM Enabled: {is_llm_enabled()}')

        test_type = options.get('test_type', 'all')

        try:
            client = get_deepseek_client()
            
            if test_type in ['all', 'chat']:
                self._test_basic_chat(client)
            
            if test_type in ['all', 'rhyme']:
                self._test_rhyme_mode(client)
            
            if test_type in ['all', 'summary']:
                self._test_review_summary()
            
            if test_type in ['all', 'description']:
                self._test_station_description()
            
            self.stdout.write(self.style.SUCCESS('\n✅ All tests completed!\n'))
        
        except ConnectionError as e:
            raise CommandError(
                self.style.ERROR(
                    f'Cannot connect to LLM server at {settings.LLM_BASE_URL}\n'
                    f'Error: {e}\n\n'
                    f'Make sure your LLM server is running on port 1234.'
                )
            )
        except Exception as e:
            raise CommandError(self.style.ERROR(f'Test failed: {e}'))

    def _test_basic_chat(self, client):
        """Test basic chat functionality."""
        self.stdout.write('\n' + self.style.WARNING('━' * 60))
        self.stdout.write(self.style.WARNING('TEST 1: Basic Chat'))
        self.stdout.write(self.style.WARNING('━' * 60))
        
        self.stdout.write('📝 Sending: "What are the benefits of EV charging?"')
        
        response = client.chat("What are the benefits of EV charging?")
        
        self.stdout.write(self.style.SUCCESS('✅ Response received:'))
        self.stdout.write(f'{response}')

    def _test_rhyme_mode(self, client):
        """Test rhyme mode."""
        self.stdout.write('\n' + self.style.WARNING('━' * 60))
        self.stdout.write(self.style.WARNING('TEST 2: Rhyme Mode'))
        self.stdout.write(self.style.WARNING('━' * 60))
        
        self.stdout.write('📝 Sending: "What is your favorite color?" (rhyme mode)')
        
        response = client.chat_with_rhymes("What is your favorite color?")
        
        self.stdout.write(self.style.SUCCESS('✅ Rhymed response:'))
        self.stdout.write(f'{response}')

    def _test_review_summary(self):
        """Test review summary generation."""
        self.stdout.write('\n' + self.style.WARNING('━' * 60))
        self.stdout.write(self.style.WARNING('TEST 3: Review Summary'))
        self.stdout.write(self.style.WARNING('━' * 60))
        
        sample_reviews = [
            "Great charging speed and friendly staff!",
            "Fast service but parking was a bit tight",
            "Excellent facilities and very clean",
            "Good experience overall, would recommend",
        ]
        
        self.stdout.write(f'📝 Analyzing {len(sample_reviews)} reviews...')
        
        summary = generate_review_summary(sample_reviews)
        
        if summary:
            self.stdout.write(self.style.SUCCESS('✅ Generated Summary:'))
            self.stdout.write(f'{summary}')
        else:
            self.stdout.write(self.style.WARNING('⚠️  LLM features disabled or unavailable'))

    def _test_station_description(self):
        """Test station description generation."""
        self.stdout.write('\n' + self.style.WARNING('━' * 60))
        self.stdout.write(self.style.WARNING('TEST 4: Station Description'))
        self.stdout.write(self.style.WARNING('━' * 60))
        
        station_name = "FastCharge Hub"
        location = "Downtown Market, New Delhi"
        
        self.stdout.write(f'📝 Generating description for: {station_name}')
        self.stdout.write(f'   Location: {location}')
        
        description = generate_station_description(station_name, location)
        
        if description:
            self.stdout.write(self.style.SUCCESS('✅ Generated Description:'))
            self.stdout.write(f'{description}')
        else:
            self.stdout.write(self.style.WARNING('⚠️  LLM features disabled or unavailable'))
