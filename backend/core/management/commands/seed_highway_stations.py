"""
Seed Highway EV Charging Stations
=================================
Seeds realistic EV charging stations along the Bhopal-Indore Highway corridor (SH-18 / NH-46).
These are located directly on the highway (not city interiors) with high-capacity DC fast chargers
and hourly bookable slots for the week ahead.
"""

from datetime import date, time, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Station, TimeSlot

User = get_user_model()

HIGHWAY_STATIONS = [
    (
        'Sehore Bypass Expressway Plaza',
        'Bhopal-Indore Highway SH-18, Sehore Bypass',
        23.1950,
        77.0620,
        'DC CCS2',
        60,
        6,
        Decimal('30.00'),
        'High-speed charging plaza directly on Bhopal-Indore Highway SH-18 at Sehore bypass. 24x7 security, cafe, clean washrooms, and convenience store.'
    ),
    (
        'Kothri Highway Energy Stop',
        'Indore-Bhopal Highway SH-18, Kothri Food Court',
        23.0840,
        76.8520,
        'DC CCS2',
        120,
        4,
        Decimal('35.00'),
        'Ultra-fast 120kW dual-gun DC fast charger located at Kothri highway food court on SH-18. Ideal for quick 15-minute top-ups.'
    ),
    (
        'Ashta Midway Supercharger Hub',
        'Bhopal-Indore Highway SH-18, Ashta Midway Plaza',
        23.0180,
        76.5450,
        'DC CCS2',
        150,
        8,
        Decimal('38.00'),
        'Flagship highway EV charging hub at Ashta Midway. Fast food restaurants, resting lounge, shaded bays, and ultra-fast 150kW CCS2 dispensers.'
    ),
    (
        'Sonkatch Oasis EV Stop',
        'Indore-Bhopal Highway SH-18, Sonkatch Bypass',
        22.9780,
        76.3680,
        'DC CCS2',
        60,
        6,
        Decimal('30.00'),
        'Convenient highway pit stop with high-speed DC charging, tea/snack stalls, clean restrooms, and tire inflation service.'
    ),
    (
        'Dewas Bypass Highway Station',
        'Dewas Bypass Junction, SH-18 / NH-52',
        22.9550,
        76.0820,
        'DC CCS2',
        120,
        6,
        Decimal('35.00'),
        'Strategic highway junction station connecting Bhopal-Indore SH-18 with Agra-Bombay NH-52. Multi-connector ultra-fast charging.'
    ),
    (
        'Manglia Highway Gateway (Indore)',
        'AB Road Highway Bypass, Manglia, Indore Entry',
        22.8120,
        75.9180,
        'DC CCS2',
        60,
        4,
        Decimal('30.00'),
        'Welcome gateway charging station on the outer expressway bypass before entering Indore city.'
    ),
]

DAY_START, DAY_END = 7, 23


class Command(BaseCommand):
    help = 'Seed demo highway EV charging stations from Bhopal to Indore with bookable slots.'

    @transaction.atomic
    def handle(self, *args, **options):
        owner = (
            User.objects.filter(role='owner').order_by('id').first()
            or User.objects.filter(is_superuser=True).first()
        )
        if not owner:
            self.stderr.write(self.style.ERROR('No owner account found. Cannot seed stations.'))
            return

        today = date.today()
        created_count = 0
        slot_count = 0

        for name, area, lat, lng, connector, kw, total_slots, price_hr, desc in HIGHWAY_STATIONS:
            station, created = Station.objects.update_or_create(
                name=name,
                defaults={
                    'owner': owner,
                    'description': desc,
                    'location_text': area,
                    'latitude': lat,
                    'longitude': lng,
                    'phone': '+91 755 880 1234',
                    'total_slots': total_slots,
                    'charger_type': f'{connector} - {kw}kW Fast Charger',
                    'power_kw': kw,
                    'price_per_hour': price_hr,
                    'is_active': True,
                }
            )
            created_count += 1

            # Seed slots for next 14 days
            capacity = max(1, total_slots // 2)
            for day_offset in range(14):
                slot_date = today + timedelta(days=day_offset)
                for hour in range(DAY_START, DAY_END):
                    _, made = TimeSlot.objects.get_or_create(
                        station=station,
                        date=slot_date,
                        start_time=time(hour, 0),
                        defaults={
                            'end_time': time(hour + 1, 0),
                            'capacity': capacity,
                            'booked_count': 0,
                            'is_available': True,
                        }
                    )
                    slot_count += int(made)

        self.stdout.write(self.style.SUCCESS(
            f'Successfully seeded {created_count} highway stations on Bhopal-Indore SH-18 with {slot_count} bookable slots.'
        ))
