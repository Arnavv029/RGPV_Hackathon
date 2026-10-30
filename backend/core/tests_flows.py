"""
End-to-end API tests for the main HapticEV flows:
sign-up with email OTP, login, stations & slots, Razorpay booking, ticket email,
cancellation / owner approval with refunds, and access control.
"""

import re
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Booking, PaymentAttempt, Station, TimeSlot

User = get_user_model()

TEST_SETTINGS = dict(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    BOOKING_EMAIL_ASYNC=False,
    DEFAULT_FROM_EMAIL='HapticEV <tickets@example.com>',
    FRONTEND_URL='https://app.example.com',
    RAZORPAY_WEBHOOK_SECRET='',
    ALLOW_SIMULATED_PAYMENTS=False,
    LLM_ENABLED=False,
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)


@override_settings(**TEST_SETTINGS)
class FlowTestCase(TestCase):
    def setUp(self):
        cache.clear()  # reset rate-limit counters
        self.owner = User.objects.create_user(username='owner', email='owner@example.com', password='pass12345', role='owner')
        self.other_owner = User.objects.create_user(username='owner2', email='o2@example.com', password='pass12345', role='owner')
        self.driver = User.objects.create_user(username='driver', email='Driver@Example.com', password='pass12345', role='user')
        self.station = Station.objects.create(
            owner=self.owner, name='Arera Fast Charge', location_text='Arera Colony, Bhopal',
            latitude=23.2156, longitude=77.4304, price_per_hour=Decimal('100.00'), is_active=True, phone='9876543210',
        )
        self.tomorrow = timezone.localdate() + timedelta(days=1)
        self.slot = TimeSlot.objects.create(
            station=self.station, date=self.tomorrow,
            start_time=timezone.datetime(2000, 1, 1, 10, 0).time(),
            end_time=timezone.datetime(2000, 1, 1, 11, 0).time(), capacity=2,
        )
        self.api = APIClient()
        self.driver_api = APIClient(); self.driver_api.force_authenticate(self.driver)
        self.owner_api = APIClient(); self.owner_api.force_authenticate(self.owner)
        self.other_owner_api = APIClient(); self.other_owner_api.force_authenticate(self.other_owner)

    contact = {'full_name': 'Asha Verma', 'phone': '9123456789', 'email': 'asha@example.com',
               'vehicle_number': 'MP04 AB 1234', 'vehicle_type': 'EV Sedan'}

    def book(self, slot=None, payment_id='pay_TEST123'):
        """Run create-order + verify with the gateway mocked; returns the verify response."""
        slot = slot or self.slot
        with mock.patch('core.views.payment_views.create_order', return_value={'id': f'order_{payment_id}'}):
            order = self.driver_api.post('/api/payments/razorpay/create-order/',
                                         {'slot': slot.id, 'amount_paid': 1, **self.contact}, format='json')
        self.assertEqual(order.status_code, 200, order.data)
        with mock.patch('core.views.payment_views.verify_payment_signature', return_value=True), \
                self.captureOnCommitCallbacks(execute=True):
            return self.driver_api.post('/api/payments/razorpay/verify/', {
                'razorpay_order_id': order.data['order_id'], 'razorpay_payment_id': payment_id,
                'razorpay_signature': 'sig', 'attempt_id': order.data['attempt_id'],
            }, format='json')


class AuthTests(FlowTestCase):
    def test_signup_requires_email_otp_and_code_is_emailed(self):
        r = self.api.post('/api/auth/register/', {'email': 'new@example.com', 'password': 'secret123'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'email_not_verified')

        r = self.api.post('/api/auth/otp/request/', {'email': 'New@Example.com'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(mail.outbox[-1].to, ['new@example.com'])
        code = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

        bad = '000000' if code != '000000' else '111111'
        self.assertEqual(self.api.post('/api/auth/otp/verify/', {'email': 'new@example.com', 'code': bad}, format='json').status_code, 400)
        r = self.api.post('/api/auth/otp/verify/', {'email': 'new@example.com', 'code': code}, format='json')
        self.assertEqual(r.status_code, 200)

        r = self.api.post('/api/auth/register/', {'email': 'new@example.com', 'password': 'secret123', 'full_name': 'New Person',
                                                 'verification_token': r.data['verification_token']}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIn('access', r.data['tokens'])

    def test_otp_send_failure_is_clean_and_retryable(self):
        with mock.patch('core.utils.email_otp.send_mail', side_effect=OSError('smtp down')):
            r = self.api.post('/api/auth/otp/request/', {'email': 'x@example.com'}, format='json')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(self.api.post('/api/auth/otp/request/', {'email': 'x@example.com'}, format='json').status_code, 200)

    def test_signup_rejects_unknown_role(self):
        r = self.api.post('/api/auth/register/', {'email': 'a@example.com', 'password': 'secret123', 'role': 'admin'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_login_with_email_is_case_insensitive(self):
        r = self.api.post('/api/auth/login/', {'email': 'driver@example.com', 'password': 'pass12345'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['user']['role'], 'user')
        r = self.api.post('/api/auth/login/', {'email': 'driver@example.com', 'password': 'wrong'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_login_is_rate_limited(self):
        from core.views.auth_views import AuthRateThrottle
        with mock.patch.object(AuthRateThrottle, 'THROTTLE_RATES', {'auth': '3/min'}):
            codes = [self.api.post('/api/auth/login/', {'email': 'x@example.com', 'password': 'n'}, format='json').status_code
                     for _ in range(4)]
        self.assertEqual(codes, [401, 401, 401, 429])


class StationAndSlotTests(FlowTestCase):
    def test_station_list_sorted_by_distance(self):
        Station.objects.create(owner=self.owner, name='Far', location_text='Far', latitude=23.40, longitude=77.60,
                               price_per_hour=50, is_active=True)
        r = self.driver_api.get('/api/stations/', {'lat': 23.2156, 'lng': 77.4304})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]['name'], 'Arera Fast Charge')
        self.assertLess(r.data[0]['distance'], r.data[1]['distance'])

    def test_slots_hide_closed_and_past(self):
        closed = TimeSlot.objects.create(station=self.station, date=self.tomorrow, capacity=1, is_available=False,
                                         start_time=self.slot.end_time, end_time=timezone.datetime(2000, 1, 1, 12, 0).time())
        r = self.driver_api.get(f'/api/stations/{self.station.id}/slots/', {'date': str(self.tomorrow)})
        ids = [s['id'] for s in r.data['slots']]
        self.assertIn(self.slot.id, ids)
        self.assertNotIn(closed.id, ids)
        self.assertEqual(r.data['slots'][0]['dynamic_price']['base_rate'], 100.0)

        r = self.driver_api.get(f'/api/stations/{self.station.id}/slots/', {'date': str(timezone.localdate() - timedelta(days=1))})
        self.assertEqual(r.data['slots'], [])

    def test_owner_slot_management_and_permissions(self):
        r = self.owner_api.post('/api/owner/slots/', {'station': self.station.id, 'date': str(self.tomorrow), 'capacity': 1,
                                                      'time_ranges': [{'start_time': '14:00', 'end_time': '15:00'},
                                                                      {'start_time': '16:00', 'end_time': '15:00'}]}, format='json')
        self.assertEqual(len(r.data['created']), 1)
        self.assertEqual(len(r.data['errors']), 1)
        new_id = r.data['created'][0]['id']

        self.assertEqual(self.other_owner_api.patch(f'/api/owner/slots/{new_id}/', {'is_available': False}, format='json').status_code, 404)
        self.assertEqual(self.driver_api.get('/api/owner/slots/', {'station': self.station.id}).status_code, 403)
        self.assertEqual(self.owner_api.patch(f'/api/owner/slots/{new_id}/', {'is_available': False}, format='json').status_code, 200)
        self.assertEqual(self.owner_api.delete(f'/api/owner/slots/{new_id}/').status_code, 204)


class BookingTests(FlowTestCase):
    def test_full_booking_flow_sends_ticket_email(self):
        r = self.book()
        self.assertEqual(r.status_code, 201, r.data)
        booking = Booking.objects.get(pk=r.data['booking']['id'])

        # price comes from the server, not the client's amount_paid=1
        self.assertGreaterEqual(booking.amount_paid, Decimal('100.00'))
        self.assertEqual(booking.status, 'pending')
        self.assertTrue(booking.qr_code)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.booked_count, 1)

        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ['asha@example.com'])
        self.assertIn('Booking confirmed', msg.subject)
        html = msg.alternatives[0][0]
        self.assertIn('https://www.google.com/maps/dir/?api=1&amp;destination=23.2156,77.4304', html)
        self.assertIn('cid:ticket-qr', html)
        self.assertIn(f'https://app.example.com/app/bookings/{booking.id}', html)
        names = [a.get_filename() if hasattr(a, 'get_filename') else a[0] for a in msg.attachments]
        self.assertTrue(any(n.endswith('.ics') for n in names), names)
        self.assertTrue(any(n.endswith('.png') for n in names), names)
        ics = next(a[1] for a in msg.attachments if isinstance(a, tuple) and a[0].endswith('.ics'))
        self.assertIn('GEO:23.2156;77.4304', ics)
        self.assertIn('LOCATION:Arera Colony\\, Bhopal', ics)

    def test_create_order_rejects_bad_contact_and_full_or_past_slots(self):
        with mock.patch('core.views.payment_views.create_order', return_value={'id': 'order_x'}):
            r = self.driver_api.post('/api/payments/razorpay/create-order/',
                                     {'slot': self.slot.id, **self.contact, 'email': 'not-an-email'}, format='json')
            self.assertEqual(r.status_code, 400)
            self.assertIn('email', r.data)

            self.slot.booked_count = 2; self.slot.save()
            r = self.driver_api.post('/api/payments/razorpay/create-order/', {'slot': self.slot.id, **self.contact}, format='json')
            self.assertEqual(r.status_code, 400)

            past = TimeSlot.objects.create(station=self.station, date=timezone.localdate() - timedelta(days=1), capacity=1,
                                           start_time=self.slot.start_time, end_time=self.slot.end_time)
            r = self.driver_api.post('/api/payments/razorpay/create-order/', {'slot': past.id, **self.contact}, format='json')
            self.assertEqual(r.status_code, 400)

    def test_duplicate_verify_is_rejected(self):
        r = self.book()
        attempt = PaymentAttempt.objects.get(booking_id=r.data['booking']['id'])
        with mock.patch('core.views.payment_views.verify_payment_signature', return_value=True):
            r2 = self.driver_api.post('/api/payments/razorpay/verify/', {
                'razorpay_order_id': attempt.razorpay_order_id, 'razorpay_payment_id': 'pay_TEST123',
                'razorpay_signature': 'sig'}, format='json')
        self.assertEqual(r2.status_code, 400)
        self.assertEqual(Booking.objects.count(), 1)

    def test_slot_taken_during_payment_is_auto_refunded(self):
        with mock.patch('core.views.payment_views.create_order', return_value={'id': 'order_race'}):
            order = self.driver_api.post('/api/payments/razorpay/create-order/', {'slot': self.slot.id, **self.contact}, format='json')
        TimeSlot.objects.filter(pk=self.slot.pk).update(booked_count=2)
        with mock.patch('core.views.payment_views.verify_payment_signature', return_value=True), \
                mock.patch('core.views.payment_views.refund_payment') as refund:
            r = self.driver_api.post('/api/payments/razorpay/verify/', {
                'razorpay_order_id': 'order_race', 'razorpay_payment_id': 'pay_race', 'razorpay_signature': 's'}, format='json')
        self.assertEqual(r.status_code, 409)
        refund.assert_called_once_with('pay_race', order.data['amount'])
        self.assertEqual(Booking.objects.count(), 0)

    def test_webhook_without_secret_cannot_create_bookings(self):
        r = self.client.post('/api/payments/razorpay/webhook/', data='{"event":"payment.captured"}', content_type='application/json')
        self.assertEqual(r.status_code, 503)

    @override_settings(RAZORPAY_WEBHOOK_SECRET='whsec')
    def test_webhook_rejects_bad_signature(self):
        r = self.client.post('/api/payments/razorpay/webhook/', data='{"event":"payment.captured"}',
                             content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE='nope')
        self.assertEqual(r.status_code, 400)

    def test_simulated_direct_booking_is_disabled(self):
        r = self.driver_api.post('/api/bookings/', {'slot': self.slot.id, **self.contact, 'payment_method': 'net_banking',
                                                    'bank_name': 'SBI', 'amount_paid': 1}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_cancel_refunds_frees_slot_and_emails(self):
        booking_id = self.book().data['booking']['id']
        mail.outbox = []
        with mock.patch('core.utils.razorpay_client.refund_payment') as refund, self.captureOnCommitCallbacks(execute=True):
            r = self.driver_api.post(f'/api/bookings/{booking_id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['refund_percentage'], 100)
        b = Booking.objects.get(pk=booking_id)
        refund.assert_called_once_with('pay_TEST123', int(b.amount_paid * 100))
        self.assertEqual(b.payment_status, 'refunded')
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.booked_count, 0)
        self.assertIn('cancelled', mail.outbox[0].subject.lower())
        with mock.patch('core.utils.razorpay_client.refund_payment') as refund2:
            self.assertEqual(self.driver_api.post(f'/api/bookings/{booking_id}/cancel/', {}, format='json').status_code, 400)
        refund2.assert_not_called()

    def test_owner_approve_and_reject(self):
        first = self.book(payment_id='pay_A').data['booking']['id']
        second = self.book(payment_id='pay_B').data['booking']['id']
        mail.outbox = []

        self.assertEqual(self.other_owner_api.patch(f'/api/owner/bookings/{first}/status/', {'status': 'confirmed'}, format='json').status_code, 404)

        with self.captureOnCommitCallbacks(execute=True):
            r = self.owner_api.patch(f'/api/owner/bookings/{first}/status/', {'status': 'confirmed'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('approved', mail.outbox[-1].subject.lower())

        with mock.patch('core.utils.razorpay_client.refund_payment') as refund, self.captureOnCommitCallbacks(execute=True):
            r = self.owner_api.patch(f'/api/owner/bookings/{second}/status/', {'status': 'rejected'}, format='json')
        self.assertEqual(r.status_code, 200)
        b = Booking.objects.get(pk=second)
        refund.assert_called_once_with('pay_B', int(b.amount_paid * 100))
        self.assertEqual((b.status, b.payment_status, b.refund_percentage), ('rejected', 'refunded', 100))
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.booked_count, 1)
        self.assertIn('declined', mail.outbox[-1].subject.lower())

    def test_bookings_are_private(self):
        booking_id = self.book().data['booking']['id']
        stranger = User.objects.create_user(username='stranger', password='pass12345')
        api = APIClient(); api.force_authenticate(stranger)
        self.assertEqual(api.get(f'/api/bookings/{booking_id}/').status_code, 404)
        self.assertEqual(api.post(f'/api/bookings/{booking_id}/cancel/', {}, format='json').status_code, 404)
        self.assertEqual(self.driver_api.get('/api/owner/bookings/').status_code, 403)
        self.assertEqual(len(self.driver_api.get('/api/bookings/history/').data), 1)


class EmergencySosTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        from core.models import Mechanic
        self.mech_user = User.objects.create_user(username='mech', password='pass12345', role='mechanic')
        self.mech = Mechanic.objects.create(user=self.mech_user, name='Volt Garage', phone='9000000001', specialization='battery',
                                            location_text='MP Nagar', latitude=23.23, longitude=77.43, is_available=True)
        self.other_mech_user = User.objects.create_user(username='mech2', password='pass12345', role='mechanic')
        Mechanic.objects.create(user=self.other_mech_user, name='Other', phone='9000000002', location_text='X', is_available=True)
        self.mech_api = APIClient(); self.mech_api.force_authenticate(self.mech_user)
        self.other_mech_api = APIClient(); self.other_mech_api.force_authenticate(self.other_mech_user)

    def test_driver_sos_reaches_only_that_mechanic_and_status_flows_back(self):
        r = self.driver_api.post('/api/emergency/requests/', {'mechanic': self.mech.id, 'phone': '91234 56789',
                                                              'message': 'Battery dead', 'latitude': 23.2, 'longitude': 77.4}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        req_id = r.data['id']

        self.assertEqual(self.driver_api.post('/api/emergency/requests/', {'mechanic': self.mech.id, 'phone': '9123456789'},
                                              format='json').status_code, 409)
        self.assertEqual([x['id'] for x in self.mech_api.get('/api/mechanic/requests/').data], [req_id])
        self.assertEqual(self.other_mech_api.get('/api/mechanic/requests/').data, [])
        self.assertEqual(self.other_mech_api.patch(f'/api/mechanic/requests/{req_id}/', {'action': 'accept'}, format='json').status_code, 404)

        r = self.mech_api.patch(f'/api/mechanic/requests/{req_id}/', {'action': 'accept'}, format='json')
        self.assertEqual(r.data['status'], 'accepted')
        self.assertEqual(self.mech_api.patch(f'/api/mechanic/requests/{req_id}/', {'action': 'reject'}, format='json').status_code, 409)

        mine = self.driver_api.get('/api/emergency/requests/').data
        self.assertEqual((mine[0]['status'], mine[0]['mechanic_phone']), ('accepted', '9000000001'))

        self.assertEqual(self.mech_api.patch(f'/api/mechanic/requests/{req_id}/', {'action': 'complete'}, format='json').data['status'], 'completed')

    def test_sos_validation(self):
        self.assertEqual(self.driver_api.post('/api/emergency/requests/', {'mechanic': self.mech.id, 'phone': '12'}, format='json').status_code, 400)
        self.mech.is_available = False; self.mech.save()
        self.assertEqual(self.driver_api.post('/api/emergency/requests/', {'mechanic': self.mech.id, 'phone': '9123456789'}, format='json').status_code, 409)

    def test_mechanic_profile_rejects_bad_numbers(self):
        r = self.mech_api.post('/api/mechanic/profile/', {'name': 'Volt', 'latitude': 'abc'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.mech_api.post('/api/mechanic/profile/', {'name': 'Volt', 'latitude': '23.2', 'longitude': '77.4', 'phone': '',
                                                          'experience_years': '5', 'service_cost': '400'}, format='json')
        self.assertEqual(r.status_code, 200)
