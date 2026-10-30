from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Mechanic


class EmergencyMechanicRankingTest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='tester', password='pass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        Mechanic.objects.create(
            name='Top Mechanic', phone='+911234567890', specialization='general',
            location_text='Test Area', latitude=23.2620, longitude=77.4300,
            experience_years=10, service_cost=500, is_available=True, rating=4.9, review_count=25,
        )
        Mechanic.objects.create(
            name='Far Mechanic', phone='+919876543210', specialization='general',
            location_text='Far Area', latitude=23.3800, longitude=77.5000,
            experience_years=4, service_cost=750, is_available=True, rating=4.4, review_count=10,
        )

    def test_emergency_mechanics_return_recommended_top_result(self):
        response = self.client.get('/api/emergency/mechanics/?lat=23.2620&lng=77.4300')
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertGreaterEqual(len(data), 2)
        self.assertIn('topsis_score', data[0])
        self.assertIn('recommendation_reason', data[0])
        self.assertTrue(data[0]['recommendation_reason'])
        self.assertGreaterEqual(float(data[0]['topsis_score']), float(data[1]['topsis_score']))


class OwnerMembershipTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username='stationowner', password='password123', role='owner')
        self.driver = User.objects.create_user(username='evdriver', password='password123', role='user')

        self.owner_client = APIClient()
        self.owner_client.force_authenticate(user=self.owner)

        self.driver_client = APIClient()
        self.driver_client.force_authenticate(user=self.driver)

        # Create station
        from core.models import Station, TimeSlot, Booking
        import datetime
        self.station = Station.objects.create(
            owner=self.owner,
            name='Alpha Charge Hub',
            location_text='Indore MP',
            latitude=22.7196,
            longitude=75.8577,
            price_per_hour=100.0,
            is_active=True,
        )
        self.slot = TimeSlot.objects.create(
            station=self.station,
            date=datetime.date.today() + datetime.timedelta(days=1),
            start_time=datetime.time(10, 0),
            end_time=datetime.time(11, 0),
            capacity=5,
            booked_count=0,
            is_available=True,
        )

    def test_owner_gets_20_free_bookings(self):
        response = self.owner_client.get('/api/owner/membership/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['membership']['plan'], 'free')
        self.assertEqual(data['membership']['bookings_remaining'], 20)
        self.assertEqual(data['membership']['total_bookings_credited'], 20)
        self.assertFalse(data['membership']['is_priority'])

    def test_simulate_membership_purchase_starter(self):
        # Buy ₹999 plan (50 bookings)
        res = self.owner_client.post('/api/owner/membership/simulate-purchase/', {
            'plan': 'plan_999',
            'is_autopay': True,
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['membership']['plan'], 'plan_999')
        # 20 initial free + 50 = 70
        self.assertEqual(data['membership']['bookings_remaining'], 70)
        self.assertTrue(data['membership']['is_priority'])
        self.assertTrue(data['membership']['is_autopay_enabled'])

    def test_commission_calculation_when_quota_exhausted(self):
        from core.utils.membership_rules import get_or_create_owner_membership, apply_owner_membership_to_booking
        from core.models import Booking
        from decimal import Decimal

        mem = get_or_create_owner_membership(self.owner)
        mem.bookings_remaining = 0
        mem.is_autopay_enabled = False
        mem.plan = 'free'
        mem.save()

        # Create a booking
        booking = Booking.objects.create(
            user=self.driver,
            station=self.station,
            slot=self.slot,
            full_name='Test Driver',
            phone='9876543210',
            email='driver@example.com',
            payment_method='razorpay',
            amount_paid=Decimal('100.00'),
            payment_status='paid',
            status='pending',
        )

        apply_owner_membership_to_booking(booking)
        booking.refresh_from_db()

        # 5% of 100 is 5.00 INR
        self.assertEqual(booking.commission_rate, Decimal('5.00'))
        self.assertEqual(booking.commission_amount, Decimal('5.00'))
        self.assertEqual(booking.owner_earnings, Decimal('95.00'))

    def test_autopay_auto_renewal_when_quota_exhausted(self):
        from core.utils.membership_rules import get_or_create_owner_membership, apply_owner_membership_to_booking
        from core.models import Booking
        from decimal import Decimal

        mem = get_or_create_owner_membership(self.owner)
        mem.bookings_remaining = 1
        mem.is_autopay_enabled = True
        mem.autopay_plan = 'plan_999'
        mem.save()

        booking = Booking.objects.create(
            user=self.driver,
            station=self.station,
            slot=self.slot,
            full_name='Test Driver',
            phone='9876543210',
            email='driver@example.com',
            payment_method='razorpay',
            amount_paid=Decimal('100.00'),
            payment_status='paid',
            status='pending',
        )

        apply_owner_membership_to_booking(booking)
        mem.refresh_from_db()

        # 1 quota used -> hit 0 -> autopay renewed starter plan (+50 bookings)
        self.assertEqual(mem.bookings_remaining, 50)
        self.assertEqual(mem.plan, 'plan_999')
        self.assertTrue(mem.is_priority)


class DynamicSlotDurationLockTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username='stationowner2', password='password123', role='owner')
        from core.models import Station, TimeSlot
        import datetime
        self.station = Station.objects.create(
            owner=self.owner,
            name='Beta Station',
            location_text='Bhopal MP',
            latitude=23.25,
            longitude=77.41,
            price_per_hour=50.0,
            is_active=True,
        )
        self.slot_date = datetime.date.today() + datetime.timedelta(days=2)
        # Create 3 base 1-hour slots: 10-11, 11-12, 12-13
        self.slot1 = TimeSlot.objects.create(
            station=self.station, date=self.slot_date,
            start_time=datetime.time(10, 0), end_time=datetime.time(11, 0),
            capacity=1, booked_count=0, is_available=True
        )
        self.slot2 = TimeSlot.objects.create(
            station=self.station, date=self.slot_date,
            start_time=datetime.time(11, 0), end_time=datetime.time(12, 0),
            capacity=1, booked_count=0, is_available=True
        )
        self.slot3 = TimeSlot.objects.create(
            station=self.station, date=self.slot_date,
            start_time=datetime.time(12, 0), end_time=datetime.time(13, 0),
            capacity=1, booked_count=0, is_available=True
        )

    def test_duration_lock_and_interval_split_1_5_hours(self):
        """
        User books 1.5h starting at 10:00:
        - slot1 (10-11) is locked for 10:00 - 11:30 and marked booked.
        - slot2 (11-12) start_time is shifted to 11:30, remaining open until 12:00.
        - slot3 (12-13) remains untouched.
        """
        import datetime
        from core.utils.booking_rules import lock_or_split_slot, validate_slot_duration
        from core.models import TimeSlot

        valid, err = validate_slot_duration(self.slot1, 1.5)
        self.assertTrue(valid)
        self.assertIsNone(err)

        locked_slot = lock_or_split_slot(self.slot1, 1.5)
        self.assertEqual(locked_slot.start_time, datetime.time(10, 0))
        self.assertEqual(locked_slot.end_time, datetime.time(11, 30))
        self.assertEqual(locked_slot.booked_count, 1)

        # Check slot2: shifted to 11:30 - 12:00 and still available (booked_count = 0)
        self.slot2.refresh_from_db()
        self.assertEqual(self.slot2.start_time, datetime.time(11, 30))
        self.assertEqual(self.slot2.end_time, datetime.time(12, 0))
        self.assertEqual(self.slot2.booked_count, 0)
        self.assertTrue(self.slot2.is_available)

        # Check slot3: 12:00 - 13:00 untouched
        self.slot3.refresh_from_db()
        self.assertEqual(self.slot3.start_time, datetime.time(12, 0))
        self.assertEqual(self.slot3.end_time, datetime.time(13, 0))

    def test_duration_lock_shorter_duration_creates_remainder_slot(self):
        """
        User books 30 min (0.5h) on a 1-hour slot (12:00 - 13:00):
        - slot3 is locked for 12:00 - 12:30 and marked booked.
        - A new slot 12:30 - 13:00 is created with booked_count = 0.
        """
        import datetime
        from core.utils.booking_rules import lock_or_split_slot
        from core.models import TimeSlot

        locked_slot = lock_or_split_slot(self.slot3, 0.5)
        self.assertEqual(locked_slot.start_time, datetime.time(12, 0))
        self.assertEqual(locked_slot.end_time, datetime.time(12, 30))
        self.assertEqual(locked_slot.booked_count, 1)

        remainder_slot = TimeSlot.objects.filter(
            station=self.station, date=self.slot_date,
            start_time=datetime.time(12, 30), end_time=datetime.time(13, 0)
        ).first()
        self.assertIsNotNone(remainder_slot)
        self.assertEqual(remainder_slot.booked_count, 0)
        self.assertTrue(remainder_slot.is_available)
