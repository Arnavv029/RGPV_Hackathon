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

# Always synchronize genuine EV network, SH-18 highway stations, and purge dummy test stations on deployment
echo "Synchronizing EV stations and highway corridor network..."
python manage.py seed_highway_stations || true

echo "Build completed successfully!"
