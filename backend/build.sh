#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Collecting static files for WhiteNoise..."
python manage.py collectstatic --no-input

echo "Applying database migrations..."
python manage.py migrate --no-input

# Seed initial demo stations and mechanics if database is empty
python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ev_backend.settings')
django.setup()
from core.models import Station
if Station.objects.count() == 0:
    from django.core.management import call_command
    print('Fresh database detected. Seeding initial demo network...')
    try:
        call_command('seed_data')
        call_command('seed_bhopal')
        print('Initial seed completed successfully!')
    except Exception as e:
        print('Seed warning:', e)
" || true

echo "Build completed successfully!"
