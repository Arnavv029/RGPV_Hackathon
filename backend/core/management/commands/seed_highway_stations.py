"""
Seed Highway EV Charging Stations
=================================
Seeds realistic EV charging stations along the Bhopal-Indore Highway corridor (SH-18).
Located outside Bhopal city on the highway corridor between Bhopal and Sehore / Indore.
All highway stations are assigned to owner1 and configured with bookable slots.
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
        'Phanda Highway Charger Hub',
        'Bhopal-Sehore Highway SH-18, Phanda Toll Plaza',
        23.2380,
        77.1950,
        'DC CCS2',
        60,
        4,
        Decimal('20.00'),
        'Highway charging hub at Phanda Toll Plaza between Bhopal and Sehore on SH-18. Shaded bays, tea stall, and 24x7 security.'
    ),
    (
        'Sehore Bypass Expressway Plaza',
        'Bhopal-Indore Highway SH-18, Sehore Bypass',
        23.1950,
        77.0620,
        'DC CCS2',
        60,
        6,
        Decimal('20.00'),
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
        Decimal('22.00'),
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
        Decimal('25.00'),
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
        Decimal('20.00'),
        'Convenient highway pit stop with high-speed DC charging, tea/snack stalls, clean restrooms, and tire inflation service.'
    ),
]

# Stations that must be purged (unwanted dummy / high-priced stations)
PURGE_STATION_NAMES = [
    'Bairagarh Community Charger',
    'Misrod Expressway Charge',
    'Lalghati Highway Point',
    'Kolar Road Energy Stop',
    'Bittan Market Charge Point',
    'Arera Colony E-8',
    'Rani Kamlapati Station Point',
    'New Market Fast Charge',
    'DB City Mall Point',
    'MP Nagar Charging Hub',
    'Dewas Bypass Highway Station',
    'Manglia Highway Gateway (Indore)',
    'Green Power Hub',
    'EV Charge Point - Arera',
    'HapticEV Fast Charge',
    'Kolar Road EV Hub',
    'Karond Green Charge',
    'TT Nagar Power Station',
    'Shivaji Nagar EV Point',
    'Govindpura Charge Hub',
    'Berasia Road EV Station',
]

DAY_START, DAY_END = 7, 23


class Command(BaseCommand):
    help = 'Seed demo highway EV charging stations from Bhopal to Indore with bookable slots.'

    @transaction.atomic
    def handle(self, *args, **options):
        # 1. Clean up unwanted demo stations
        deleted_count, _ = Station.objects.filter(name__in=PURGE_STATION_NAMES).delete()
        if deleted_count:
            self.stdout.write(self.style.WARNING(f'Purged {deleted_count} unwanted dummy stations.'))

        # 2. Fix original stations coordinates and pricing
        Station.objects.filter(name__icontains='Jaiswal Power Hub').exclude(name__icontains='Green').update(
            latitude=23.2318,
            longitude=77.4353,
            location_text='MP Nagar, Bhopal',
            price_per_hour=Decimal('20.00'),
            tariff_per_kwh=Decimal('20.00'),
        )
        Station.objects.filter(name__icontains='Jaiswal Green Power Hub').update(
            price_per_hour=Decimal('20.00'),
            tariff_per_kwh=Decimal('20.00'),
        )

        owner = (
            User.objects.filter(username='owner1').first()
            or User.objects.filter(role='owner').order_by('id').first()
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
                    'tariff_per_kwh': price_hr,
                    'is_active': True,
                }
            )
            created_count += 1

            # Seed slots for today and next 7 days
            capacity = total_slots
            for day_offset in range(8):
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
            f'Successfully seeded {created_count} highway stations on Bhopal-Indore SH-18 with {slot_count} bookable slots under {owner.username}.'
        ))
