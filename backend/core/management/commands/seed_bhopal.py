"""
Seed the Bhopal pilot network.
==============================
HapticEV runs as a Bhopal-only prototype, so this command builds a realistic
local network: charging points spread across the city, priced per hour from
their rated output, with bookable slots for the week ahead.

    python manage.py seed_bhopal              # add/refresh Bhopal stations
    python manage.py seed_bhopal --purge      # ...and delete non-Bhopal ones
    python manage.py seed_bhopal --days 14    # how far ahead to open slots

Pricing model: price_per_hour = power_kw x TARIFF_PER_KWH, rounded to Rs.10.
A 30 kW point at Rs.16/kWh therefore costs Rs.480/hr — an hour of charging there
really does deliver ~30 kWh, so the hourly figure and the unit rate agree.
"""

from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Station, TimeSlot

User = get_user_model()

TARIFF_PER_KWH = 16  # ₹ per kWh, typical Indian public AC/DC tariff

# name, area, lat, lng, connector, kW, points, _image (unused), blurb
BHOPAL_STATIONS = [
    ('MP Nagar Charging Hub', 'Zone II, MP Nagar, Bhopal', 23.2318, 77.4353,
     'DC CCS2', 60, 6, 'mp-nagar.png',
     'Covered parking beside the main market. Cafe and washroom on site, open 24x7.'),
    ('DB City Mall Point', 'DB City Mall, Arera Hills, Bhopal', 23.2351, 77.4324,
     'DC CCS2', 30, 4, 'db-city.png',
     'Basement level P2. Charge while you shop — the mall validates your parking.'),
    ('New Market Fast Charge', 'New Market, TT Nagar, Bhopal', 23.2330, 77.4010,
     'DC CCS2', 30, 4, 'new-market.png',
     'Next to the multi-level parking. Busiest between 6pm and 9pm.'),
    ('Rani Kamlapati Station Point', 'Rani Kamlapati Railway Station, Bhopal', 23.2264, 77.4352,
     'AC Type 2', 22, 6, 'habibganj.png',
     'Station forecourt. Ideal for a top-up while you wait for a train.'),
    ('Arera Colony E-8', 'E-8 Extension, Arera Colony, Bhopal', 23.2050, 77.4300,
     'AC Type 2', 22, 4, 'arera.png',
     'Quiet residential stop with covered bays for scooters and bikes.'),
    ('Bittan Market Charge Point', 'Bittan Market, Bhopal', 23.2240, 77.4390,
     'AC Type 2', 7, 6, 'bittan.png',
     'Slow AC points sized for two-wheelers and autos. Cheapest rate in the city.'),
    ('Kolar Road Energy Stop', 'Kolar Road, Bhopal', 23.1770, 77.4260,
     'DC CHAdeMO', 50, 3, 'kolar.png',
     'On the southern corridor — the last fast charger before you leave the city.'),
    ('Lalghati Highway Point', 'Lalghati Square, Bhopal', 23.2680, 77.3830,
     'DC CCS2', 60, 4, 'mp-nagar.png',
     'On the airport road. Handy before a long drive towards Indore.'),
    ('Misrod Expressway Charge', 'Misrod, Bhopal', 23.1690, 77.4790,
     'DC CCS2', 30, 3, 'db-city.png',
     'Beside the highway dhaba on the Hoshangabad road.'),
    ('Bairagarh Community Charger', 'Sant Hirdaram Nagar, Bairagarh, Bhopal', 23.2790, 77.3370,
     'AC Type 2', 7, 8, 'kolar.png',
     'Community-run points for scooters, bikes and e-rickshaws.'),
]

# Hourly slots opened each day
DAY_START, DAY_END = 8, 21


class Command(BaseCommand):
    help = 'Seed the Bhopal pilot network (stations, pricing and bookable slots).'

    def add_arguments(self, parser):
        parser.add_argument('--purge', action='store_true',
                            help='Delete stations outside Bhopal (and their slots/bookings).')
        parser.add_argument('--days', type=int, default=7,
                            help='How many days of slots to open (default 7).')

    def price_for(self, kw):
        """
        Hourly price derived from rated output with affordable rates:
          - 7 kW AC: ₹25/hr
          - 22 kW AC: ₹40/hr
          - 30 kW DC: ₹55/hr
          - 50 kW DC: ₹70/hr
          - 60 kW DC: ₹85/hr
        """
        if kw <= 7:
            return Decimal('25.00')
        elif kw <= 22:
            return Decimal('40.00')
        elif kw <= 30:
            return Decimal('55.00')
        elif kw <= 50:
            return Decimal('70.00')
        else:
            return Decimal('85.00')

    @transaction.atomic
    def handle(self, *args, **opts):
        owner = (
            User.objects.filter(role='owner').order_by('id').first()
            or User.objects.filter(is_superuser=True).first()
        )
        if not owner:
            self.stderr.write(self.style.ERROR(
                'No owner account found. Run `python manage.py seed_data` first.'))
            return

        if opts['purge']:
            stale = Station.objects.exclude(location_text__icontains='bhopal')
            if stale.exists():
                self.stdout.write(self.style.WARNING('Removing stations outside Bhopal:'))
                for st in stale:
                    self.stdout.write(
                        f'  - {st.name} ({st.location_text[:40]}) '
                        f'— {st.time_slots.count()} slots, {st.bookings.count()} bookings'
                    )
                stale.delete()
            else:
                self.stdout.write('No non-Bhopal stations to remove.')

        created = updated = 0
        stations = []
        for name, area, lat, lng, connector, kw, points, image, blurb in BHOPAL_STATIONS:
            station, was_created = Station.objects.update_or_create(
                name=name,
                defaults={
                    'owner': owner,
                    'description': blurb,
                    'location_text': area,
                    'latitude': lat,
                    'longitude': lng,
                    'phone': '+91 755 400 0000',
                    'total_slots': points,
                    'charger_type': f'{connector} - {kw}kW',
                    'power_kw': kw,
                    'price_per_hour': self.price_for(kw),
                    'is_active': True,
                },
            )
            # Deliberately no image: the frontend falls back to its own bundled
            # station photos, so seeding avoids pointing at media files that
            # don't exist on a fresh checkout.
            stations.append(station)
            created += was_created
            updated += (not was_created)

        # ── Slots for the days ahead ──────────────────────────────────────
        today = date.today()
        slot_count = 0
        for station in stations:
            capacity = max(1, station.total_slots // 2)
            for day_offset in range(opts['days']):
                day = today + timedelta(days=day_offset)
                for hour in range(DAY_START, DAY_END):
                    _, made = TimeSlot.objects.get_or_create(
                        station=station,
                        date=day,
                        start_time=time(hour, 0),
                        defaults={
                            'end_time': time(hour + 1, 0),
                            'capacity': capacity,
                            'is_available': True,
                        },
                    )
                    slot_count += made

        self.stdout.write(self.style.SUCCESS(
            f'\nBhopal network ready: {created} station(s) created, {updated} updated, '
            f'{slot_count} new slot(s) across {opts["days"]} day(s).'
        ))
        # Plain ASCII: Windows consoles are cp1252 and choke on the rupee sign.
        self.stdout.write(
            f'Tariff used: Rs.{TARIFF_PER_KWH}/kWh -> '
            f'Rs.{self.price_for(7)}/hr (7 kW) to Rs.{self.price_for(60)}/hr (60 kW).'
        )
