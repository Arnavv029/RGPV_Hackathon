"""
Serializers — The Bridge Between Python & JSON
================================================
When the frontend (React) calls our API:
  → The API needs to RECEIVE JSON and convert it to Python objects (for saving)
  → The API needs to SEND Python objects and convert them to JSON (for response)

That conversion is done by SERIALIZERS.

Think of serializers as:
  ┌─────────────────────────────────────────────────────────────────┐
  │  Python Model Object  ←─── Serializer ───→  JSON for Frontend  │
  └─────────────────────────────────────────────────────────────────┘

Each serializer maps to one model.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Avg
from .models import Station, TimeSlot, Booking, Review, Mechanic
from .utils.booking_review import booking_can_receive_review

# Get our custom user model (defined in settings.py → AUTH_USER_MODEL)
User = get_user_model()


# ══════════════════════════════════════════════════════════════════════════════
# AUTH SERIALIZERS
# ══════════════════════════════════════════════════════════════════════════════

class RegisterSerializer(serializers.ModelSerializer):
    """
    Used for: POST /api/auth/register/

    Handles new user/owner registration.
    - 'password' is write_only → it will NEVER be sent back in any response
    - We override create() to use Django's set_password() which HASHES the password
      (never store plain text passwords!)
    """

    password = serializers.CharField(
        write_only=True,   # Accept in input but never include in output
        min_length=6,
        style={'input_type': 'password'}
    )

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'role', 'phone', 'first_name', 'last_name']
        extra_kwargs = {
            'email': {'required': True},
        }

    def create(self, validated_data):
        """
        Override default create to properly hash the password.
        If we used User.objects.create(**validated_data), the password
        would be stored as plain text — a serious security flaw.
        """
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],    # set_password() hashes this
            role=validated_data.get('role', 'user'),
            phone=validated_data.get('phone', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Used for: GET /api/auth/me/

    Returns basic logged-in user profile.
    Password is excluded completely.
    """

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'phone', 'first_name', 'last_name', 'date_joined']


# ══════════════════════════════════════════════════════════════════════════════
# STATION SERIALIZERS
# ══════════════════════════════════════════════════════════════════════════════

class StationSerializer(serializers.ModelSerializer):
    """
    Used for:
      GET  /api/stations/      → List all stations (with optional distance)
      POST /api/owner/stations/ → Owner creates a station
      GET  /api/stations/{id}/  → Station detail

    'owner_name' is a SerializerMethodField:
      → It's a read-only computed field (not a real database column)
      → We call get_owner_name() to compute its value
      → Shows the owner's username instead of just the owner's ID

    'distance' is also computed:
      → Only present when the user provides their GPS location
      → Used for "2.3 km away" display on station cards
    """

    # Read-only field showing owner's name instead of just their ID
    owner_name = serializers.SerializerMethodField()

    # Distance from the user (only present when lat/lon are sent in the request)
    distance = serializers.SerializerMethodField()

    # Get the full URL of the station image
    image_url = serializers.SerializerMethodField()

    # How many time-slots for today are not fully booked
    available_slots = serializers.SerializerMethodField()

    # From Review model (annotated in list/detail views when available)
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    # Priority station flag (True if station owner has active paid membership)
    is_priority = serializers.SerializerMethodField()

    class Meta:
        model = Station
        fields = [
            'id', 'name', 'description', 'location_text',
            'latitude', 'longitude', 'phone',
            'total_slots', 'available_slots', 'charger_type', 'power_kw', 'price_per_hour', 'is_active',
            'owner', 'owner_name', 'distance', 'image', 'image_url',
            'avg_rating', 'review_count', 'is_priority',
            'created_at'
        ]
        extra_kwargs = {
            'owner':     {'read_only': True},  # Owner is set automatically from the logged-in user
            'is_active': {'read_only': True},  # Always True on create; only admins toggle this
            'created_at':{'read_only': True},
        }

    def get_owner_name(self, obj):
        """Return the owner's full name or username"""
        return obj.owner.get_full_name() or obj.owner.username

    def get_distance(self, obj):
        """
        Returns distance if it was computed by the view (attached as .distance attribute).
        Returns None if no user location was provided.
        """
        return getattr(obj, 'distance', None)

    def get_image_url(self, obj):
        """Return absolute URL for station image"""
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
        return None

    def get_available_slots(self, obj):
        """
        Count how many of today's time-slots still have open spots.
        Returned as an integer so the frontend can filter/display availability.
        """
        from datetime import date
        today = date.today()
        return obj.time_slots.filter(
            date=today,
            is_available=True,
            booked_count__lt=models.F('capacity')
        ).count()

    def get_avg_rating(self, obj):
        v = getattr(obj, 'avg_rating', None)
        if v is not None:
            return round(float(v), 1)
        agg = obj.reviews.aggregate(a=Avg('rating'))['a']
        return round(float(agg or 0), 1)

    def get_review_count(self, obj):
        c = getattr(obj, 'review_count', None)
        if c is not None:
            return int(c)
        return obj.reviews.count()

    def get_is_priority(self, obj):
        p = getattr(obj, 'is_priority', None)
        if p is not None:
            return bool(p)
        try:
            return bool(obj.owner.membership.is_priority and obj.owner.membership.bookings_remaining > 0)
        except Exception:
            return False


# ══════════════════════════════════════════════════════════════════════════════
# TIME SLOT SERIALIZERS
# ══════════════════════════════════════════════════════════════════════════════

class TimeSlotSerializer(serializers.ModelSerializer):
    """
    Used for:
      GET  /api/stations/{id}/slots/?date=YYYY-MM-DD  → List slots for a station on a date
      POST /api/owner/slots/                           → Owner creates time slots

    'is_full' and 'available_spots' are computed from model @property methods.
    Frontend uses these to show GREEN or RED indicators.
    """

    # These call the @property methods defined in the TimeSlot model
    is_full = serializers.BooleanField(read_only=True)
    available_spots = serializers.IntegerField(read_only=True)
    dynamic_price = serializers.SerializerMethodField()

    class Meta:
        model = TimeSlot
        fields = [
            'id', 'station', 'date', 'start_time', 'end_time',
            'capacity', 'booked_count', 'is_available',
            'is_full', 'available_spots', 'dynamic_price'
        ]
        extra_kwargs = {
            'booked_count': {'read_only': True},  # Backend manages this, not user input
        }

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError('Capacity must be at least 1.')
        return value

    def validate(self, attrs):
        from django.utils import timezone
        start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        slot_date = attrs.get('date', getattr(self.instance, 'date', None))
        if start and end and end <= start:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})
        if self.instance is None and slot_date:
            now = timezone.localtime()
            if slot_date < now.date():
                raise serializers.ValidationError({'date': 'Cannot create slots for a past date.'})
            if slot_date == now.date() and start and start <= now.time():
                raise serializers.ValidationError({'start_time': f'{start.strftime("%H:%M")} has already passed today.'})
        if self.instance is not None and 'capacity' in attrs and attrs['capacity'] < self.instance.booked_count:
            raise serializers.ValidationError(
                {'capacity': f'{self.instance.booked_count} car(s) already booked; capacity cannot be lower.'}
            )
        return attrs

    def get_dynamic_price(self, obj):
        from utils.llm_enhanced_pricing import get_slot_dynamic_price
        pricing_info = get_slot_dynamic_price(obj)
        return {
            'hourly_rate': pricing_info['price'],
            'base_rate': pricing_info['base_price'],
            'currency': pricing_info['currency'],
            'explanation': pricing_info['explanation'],
        }



# ══════════════════════════════════════════════════════════════════════════════
# BOOKING SERIALIZERS
# ══════════════════════════════════════════════════════════════════════════════

class BookingCreateSerializer(serializers.ModelSerializer):
    """
    Used for: POST /api/bookings/

    Accepts personal details + vehicle details + payment details.
    Payment details (upi_id, card_*, bank_name) are write-only —
    they are used to process payment but never stored.
    """

    # ── Payment detail fields (write-only — not stored in DB) ────────────────
    upi_id      = serializers.CharField(required=False, allow_blank=True, write_only=True)
    utr_number  = serializers.CharField(required=False, allow_blank=True, write_only=True)  # UPI UTR
    card_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    card_expiry = serializers.CharField(required=False, allow_blank=True, write_only=True)
    card_cvv    = serializers.CharField(required=False, allow_blank=True, write_only=True)
    card_name   = serializers.CharField(required=False, allow_blank=True, write_only=True)
    bank_name   = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = Booking
        fields = [
            'slot', 'full_name', 'phone', 'email',
            'vehicle_number', 'vehicle_type',
            'payment_method', 'amount_paid',
            # write-only payment detail fields
            'upi_id', 'utr_number', 'card_number', 'card_expiry', 'card_cvv', 'card_name', 'bank_name',
        ]

    def validate_slot(self, slot):
        if slot.is_full:
            raise serializers.ValidationError(
                'This time slot is fully booked. Please select another slot.'
            )
        if not slot.is_available:
            raise serializers.ValidationError(
                'This slot is not available for booking.'
            )
        return slot

    def validate(self, data):
        method = data.get('payment_method', '')
        if method == 'upi':
            upi = data.get('upi_id', '')
            if not upi or '@' not in upi:
                raise serializers.ValidationError({'upi_id': 'Enter a valid UPI ID (e.g. name@upi)'})
        elif method == 'debit_card':
            num = data.get('card_number', '').replace(' ', '')
            if not num or len(num) != 16 or not num.isdigit():
                raise serializers.ValidationError({'card_number': 'Enter a valid 16-digit card number.'})
            if not data.get('card_expiry') or len(data.get('card_expiry', '')) != 5:
                raise serializers.ValidationError({'card_expiry': 'Enter expiry as MM/YY.'})
            cvv = data.get('card_cvv', '')
            if not cvv or len(cvv) != 3 or not cvv.isdigit():
                raise serializers.ValidationError({'card_cvv': 'Enter a valid 3-digit CVV.'})
        elif method == 'net_banking':
            if not data.get('bank_name'):
                raise serializers.ValidationError({'bank_name': 'Please select your bank.'})
        elif method == 'razorpay':
            pass   # Razorpay payments are validated by signature in payment_views
        else:
            raise serializers.ValidationError(
                {'payment_method': 'Select a valid payment method: upi, debit_card, net_banking, or razorpay.'}
            )
        return data


class BookingDetailSerializer(serializers.ModelSerializer):
    """
    Used for:
      GET /api/bookings/          → User's booking history
      GET /api/bookings/{id}/     → Single booking details (includes QR)
      GET /api/owner/bookings/    → Owner views all bookings for their station

    This is a 'rich' serializer — it includes nested station and slot info
    instead of just IDs, so the frontend gets everything it needs in one call.
    """

    # Nested serializers: instead of showing station=2, show full station object
    station = StationSerializer(read_only=True)
    slot = TimeSlotSerializer(read_only=True)

    # Shows booking_id as a string (UUIDs need to be converted to string)
    booking_id = serializers.UUIDField(read_only=True)

    has_review = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_id',
            'full_name', 'phone', 'email',
            'vehicle_number', 'vehicle_type',
            'payment_method', 'amount_paid',
            'payment_status', 'transaction_id',
            'refund_amount', 'refund_percentage',
            'cancelled_at',
            'commission_rate', 'commission_amount', 'owner_earnings',
            'station', 'slot',
            'status', 'qr_code',
            'has_review', 'can_review',
            'created_at', 'updated_at'
        ]

    def get_has_review(self, obj):
        ann = getattr(obj, 'has_review', None)
        if ann is not None:
            return bool(ann)
        return Review.objects.filter(booking_id=obj.pk).exists()

    def get_can_review(self, obj):
        return booking_can_receive_review(obj)


class ReviewListSerializer(serializers.ModelSerializer):
    """Public-ish list of reviews for a station (no private user fields)."""

    user_display = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'user_display', 'rating', 'comment', 'created_at']

    def get_user_display(self, obj):
        parts = (obj.user.first_name or '', obj.user.last_name or '')
        name = f'{parts[0]} {parts[1]}'.strip()
        return name or obj.user.username


class QRVerifySerializer(serializers.Serializer):
    """
    Used for: POST /api/owner/verify-qr/

    Owner's QR scanner sends the decoded QR text to the backend.
    We extract the booking_id and look up the booking.

    Input:
    {
        "booking_id": "550e8400-e29b-41d4-a716-446655440000"
    }
    """

    booking_id = serializers.UUIDField()


class BookingStatusUpdateSerializer(serializers.ModelSerializer):
    """
    Used for: PATCH /api/owner/bookings/{id}/status/

    Owner: pending → confirmed | rejected; confirmed → completed (session finished).
    """

    class Meta:
        model = Booking
        fields = ['status']

    def validate_status(self, value):
        allowed = ['confirmed', 'rejected', 'completed']
        if value not in allowed:
            raise serializers.ValidationError(
                f"Status must be one of: {allowed}"
            )
        return value

    def validate(self, attrs):
        booking = self.instance
        new_status = attrs.get('status')
        if not booking or not new_status:
            return attrs
        old = booking.status
        if new_status == 'completed':
            if old != 'confirmed':
                raise serializers.ValidationError({
                    'status': 'Only confirmed bookings can be marked completed after charging.'
                })
        elif new_status in ('confirmed', 'rejected'):
            if old != 'pending':
                raise serializers.ValidationError({
                    'status': 'You can only approve or reject bookings that are still pending.'
                })
        return attrs


# ══════════════════════════════════════════════════════════════════════════════
# MECHANIC SERIALIZER  (Emergency Section)
# ══════════════════════════════════════════════════════════════════════════════
class MechanicSerializer(serializers.ModelSerializer):
    """
    Used for: GET /api/emergency/mechanics/

    Returns mechanic info for the Emergency → Mechanics map section.
    'distance' is attached by the view (not a real DB field).
    'specialization_display' converts the code to human-readable text.
    """

    specialization_display = serializers.CharField(
        source='get_specialization_display', read_only=True
    )
    distance = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    topsis_score = serializers.SerializerMethodField()
    recommendation_reason = serializers.SerializerMethodField()

    class Meta:
        model = Mechanic
        fields = [
            'id', 'name', 'phone', 'specialization', 'specialization_display',
            'location_text', 'latitude', 'longitude',
            'experience_years', 'service_cost', 'is_available', 'rating', 'review_count',
            'distance', 'photo_url', 'topsis_score', 'recommendation_reason',
        ]

    def get_distance(self, obj):
        return getattr(obj, 'distance', None)

    def get_topsis_score(self, obj):
        return getattr(obj, 'topsis_score', None)

    def get_recommendation_reason(self, obj):
        return getattr(obj, 'recommendation_reason', None)

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
        return None


class MechanicProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mechanic
        fields = [
            'id', 'name', 'phone', 'specialization', 'location_text',
            'latitude', 'longitude', 'experience_years', 'service_cost', 'is_available', 'photo'
        ]


class EmergencyRequestSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    mechanic_name = serializers.CharField(source='mechanic.name', read_only=True)
    mechanic_phone = serializers.CharField(source='mechanic.phone', read_only=True)

    class Meta:
        model = None
        # set dynamically to avoid circular import; set in __init__ below

    def __init__(self, *args, **kwargs):
        from core.models import EmergencyRequest
        self.Meta.model = EmergencyRequest
        self.Meta.fields = [
            'id', 'user', 'user_name', 'mechanic', 'mechanic_name', 'mechanic_phone', 'phone', 'vehicle_number',
            'message', 'latitude', 'longitude', 'status', 'created_at'
        ]
        super().__init__(*args, **kwargs)


# ══════════════════════════════════════════════════════════════════════════════
# OWNER MEMBERSHIP SERIALIZERS
# ══════════════════════════════════════════════════════════════════════════════

class OwnerMembershipSerializer(serializers.ModelSerializer):
    plan_display = serializers.CharField(source='get_plan_display', read_only=True)
    autopay_plan_display = serializers.CharField(source='get_autopay_plan_display', read_only=True)
    effective_commission_rate = serializers.SerializerMethodField()

    class Meta:
        model = None

    def __init__(self, *args, **kwargs):
        from core.models import OwnerMembership
        self.Meta.model = OwnerMembership
        self.Meta.fields = [
            'id', 'plan', 'plan_display',
            'total_bookings_credited', 'bookings_remaining', 'bookings_used',
            'is_autopay_enabled', 'autopay_plan', 'autopay_plan_display',
            'is_priority', 'effective_commission_rate',
            'last_renewed_at', 'created_at', 'updated_at'
        ]
        super().__init__(*args, **kwargs)

    def get_effective_commission_rate(self, obj):
        # If bookings_remaining > 0: 0% commission. If 0: 5% commission.
        return 0.0 if obj.bookings_remaining > 0 else 5.0


class MembershipOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = None

    def __init__(self, *args, **kwargs):
        from core.models import MembershipOrder
        self.Meta.model = MembershipOrder
        self.Meta.fields = [
            'id', 'plan', 'plan_name', 'amount', 'bookings_credited',
            'razorpay_order_id', 'razorpay_payment_id', 'is_autopay',
            'status', 'created_at'
        ]
        super().__init__(*args, **kwargs)
