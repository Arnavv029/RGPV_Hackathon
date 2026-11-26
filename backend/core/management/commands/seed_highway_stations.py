"""
Seed EV Network: City and Highway Stations
==========================================
Synchronizes genuine city stations in Bhopal and the 5 highway stations
along SH-18 corridor (Bhopal -> Sehore -> Indore).
Purges outdated dummy stations with inflated prices from earlier seed tests.
"""

from datetime import date, time, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Station, TimeSlot

User = get_user_model()

# ── 1. Genuine Bhopal City Stations ──────────────────────────────────────────
BHOPAL_CITY_STATIONS = [
    (
        'MP Nagar Charging Hub',
        'Zone II, MP Nagar, Bhopal',
        23.2318,
        77.4353,
        'DC CCS2',
        60,
        6,
        Decimal('22.00'),
        'Covered parking beside the main market. Cafe and washroom on site, open 24x7.'
    ),
    (
        'DB City Mall Point',
        'DB City Mall, Arera Hills, Bhopal',
        23.2351,
        77.4324,
        'DC CCS2',
        30,
        4,
        Decimal('22.00'),
        'Basement level P2. Charge while you shop — the mall validates your parking.'
    ),
    (
        'New Market Fast Charge',
        'New Market, TT Nagar, Bhopal',
        23.2330,
        77.4010,
        'DC CCS2',
        30,
        4,
        Decimal('20.00'),
        'Next to the multi-level parking. Busiest between 6pm and 9pm.'
    ),
    (
        'Rani Kamlapati Station Point',
        'Rani Kamlapati Railway Station, Bhopal',
        23.2264,
        77.4352,
        'AC Type 2',
        22,
        6,
        Decimal('18.00'),
        'Station forecourt. Ideal for a top-up while you wait for a train.'
    ),
    (
        'Arera Colony E-8',
        'E-8 Extension, Arera Colony, Bhopal',
        23.2050,
        77.4300,
        'AC Type 2',
        22,
        4,
        Decimal('18.00'),
        'Quiet residential stop with covered bays for scooters and bikes.'
    ),
    (
        'Bittan Market Charge Point',
        'Bittan Market, Bhopal',
        23.2240,
        77.4390,
        'AC Type 2',
        7,
        6,
        Decimal('15.00'),
        'Slow AC points sized for two-wheelers and autos. Clean rates in the city.'
    ),
    (
        'Kolar Road Energy Stop',
        'Kolar Road, Bhopal',
        23.1770,
        77.4260,
        'DC CHAdeMO',
        50,
        4,
        Decimal('22.00'),
        'On the southern corridor — fast charger near Kolar circle.'
    ),
    (
        'Lalghati Highway Point',
        'Lalghati Square, Bhopal',
        23.2680,
        77.3830,
        'DC CCS2',
        60,
        4,
        Decimal('22.00'),
        'On the airport road. Handy before a long drive towards Indore.'
    ),
    (
        'Misrod Expressway Charge',
        'Misrod, Bhopal',
        23.1690,
        77.4790,
        'DC CCS2',
        30,
        4,
        Decimal('20.00'),
        'Beside the highway eatery on the Hoshangabad road.'
    ),
    (
        'Bairagarh Community Charger',
        'Sant Hirdaram Nagar, Bairagarh, Bhopal',
        23.2790,
        77.3370,
        'AC Type 2',
        7,
        6,
        Decimal('15.00'),
        'Community-run points for scooters, bikes and electric vehicles.'
    ),
]

# ── 2. Highway Corridor Stations (SH-18: Bhopal ↔ Sehore ↔ Indore) ───────────
HIGHWAY_STATIONS = [
    (
        'Khajuri Toll Plaza Fast Charger',
        'Bhopal-Sehore Highway SH-18, Khajuri Toll Plaza',
        23.2350,
        77.2400,
        'DC CCS2',
        60,
        4,
        Decimal('20.00'),
        'High-speed highway charging point directly at Khajuri Toll Plaza on SH-18. Open 24x7 with covered bays and refreshments.'
    ),
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
        'Bilkisganj Highway EV Stop',
        'Bhopal-Sehore Highway SH-18, Bilkisganj Cross',
        23.2100,
        77.1250,
        'DC CCS2',
        60,
        4,
        Decimal('20.00'),
        'Midway highway station between Phanda and Sehore on SH-18. Quick top-up chargers, cafe and clean restrooms.'
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

# ── 3. Exact Unwanted / Overpriced Dummy Stations to Purge ─────────────────────
PURGE_STATION_NAMES = [
    'Green Power Hub',
    'EV Charge Point - Arera',
    'HapticEV Fast Charge',
    'Kolar Road EV Hub',
    'Karond Green Charge',
    'TT Nagar Power Station',
    'Shivaji Nagar EV Point',
    'Govindpura Charge Hub',
    'Bairagarh Fast Charge',
    'Misrod Ultra EV',
    'Berasia Road EV Station',
    'Dewas Bypass Highway Station',
    'Manglia Highway Gateway (Indore)',
]

DAY_START, DAY_END = 7, 23


class Command(BaseCommand):
    help = 'Synchronize EV network: city and highway stations, while purging dummy high-priced entries.'

    @transaction.atomic
    def handle(self, *args, **options):
        # 0. Ensure demo accounts exist and have active credentials (password: password123)
        user1, _ = User.objects.get_or_create(
            username='user1',
            defaults={
                'email': 'user1@evapp.com',
                'role': 'user',
                'phone': '9876543210',
                'first_name': 'Ramesh',
                'last_name': 'Kumar',
            }
        )
        user1.set_password('password123')
        user1.is_active = True
        user1.role = 'user'
        user1.save()

        owner1, _ = User.objects.get_or_create(
            username='owner1',
            defaults={
                'email': 'owner1@evapp.com',
                'role': 'owner',
                'phone': '9123456789',
                'first_name': 'Suresh',
                'last_name': 'Sharma',
            }
        )
        owner1.set_password('password123')
        owner1.is_active = True
        owner1.role = 'owner'
        owner1.save()

        # 1. Purge unwanted dummy stations by exact name or matching dummy patterns
        deleted_count, _ = Station.objects.filter(name__in=PURGE_STATION_NAMES).delete()
        berasia_del, _ = Station.objects.filter(name__icontains='Berasia').delete()
        deleted_count += berasia_del
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

        # Combine Bhopal City and Highway stations
        all_stations = BHOPAL_CITY_STATIONS + HIGHWAY_STATIONS

        for name, area, lat, lng, connector, kw, total_slots, price_hr, desc in all_stations:
            station, _ = Station.objects.update_or_create(
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

        # Also ensure original Jaiswal stations have slots
        for j_station in Station.objects.filter(name__icontains='Jaiswal'):
            capacity = j_station.total_slots or 4
            for day_offset in range(8):
                slot_date = today + timedelta(days=day_offset)
                for hour in range(DAY_START, DAY_END):
                    TimeSlot.objects.get_or_create(
                        station=j_station,
                        date=slot_date,
                        start_time=time(hour, 0),
                        defaults={
                            'end_time': time(hour + 1, 0),
                            'capacity': capacity,
                            'booked_count': 0,
                            'is_available': True,
                        }
                    )

        self.stdout.write(self.style.SUCCESS(
            f'Successfully synchronized {created_count} EV stations (Bhopal City + SH-18 Highway) with {slot_count} bookable slots under {owner.username}.'
        ))
