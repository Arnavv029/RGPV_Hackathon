"""
Django settings for EV Station Slot Booking System
---------------------------------------------------
Key configurations:
- SQLite database (no PostgreSQL needed)
- JWT authentication (via djangorestframework-simplejwt)
- CORS enabled (so React frontend can talk to this backend)
- Custom User model with 'role' field (user / owner)
"""

import os
from pathlib import Path
from datetime import timedelta

# Load .env file if present (never commit real secrets)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
except ImportError:
    pass  # python-dotenv not required; set env vars manually in production


# ─── Base Directory ───────────────────────────────────────────────────────────
# This points to the 'backend/' folder.
BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Security ─────────────────────────────────────────────────────────────────
# Everything below is driven by environment variables. The defaults are for local
# development; production must set DJANGO_DEBUG=False and the values listed in
# backend/.env.example, otherwise startup fails loudly instead of running insecurely.
def _env_list(name, default=''):
    return [v.strip() for v in os.environ.get(name, default).split(',') if v.strip()]


DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() == 'true'

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError('DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=False.')
    SECRET_KEY = 'ev-booking-secret-key-change-this-in-production-abc123xyz'  # dev only

ALLOWED_HOSTS = _env_list('DJANGO_ALLOWED_HOSTS', '*' if DEBUG else '')
if not DEBUG and not ALLOWED_HOSTS:
    raise RuntimeError('DJANGO_ALLOWED_HOSTS must be set when DJANGO_DEBUG=False.')

# Public URL of the React app — used for links inside emails.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = os.environ.get('DJANGO_SSL_REDIRECT', 'True').lower() == 'true'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    CSRF_TRUSTED_ORIGINS = _env_list('DJANGO_CSRF_TRUSTED_ORIGINS', FRONTEND_URL)

# ─── Installed Apps ───────────────────────────────────────────────────────────
# We add:
#   rest_framework       → Django REST Framework (DRF) for building APIs
#   rest_framework_simplejwt → JWT token authentication
#   corsheaders          → Allow React frontend to call our APIs
#   core                 → Our main app (models, views, etc.)
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',

    # Our app
    'core',
]

# ─── Middleware ────────────────────────────────────────────────────────────────
# CorsMiddleware MUST be placed at the very top (before CommonMiddleware)
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',     # ← CORS must be first
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ev_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ev_backend.wsgi.application'

# ─── Database ─────────────────────────────────────────────────────────────────
# Using SQLite — Django's built-in database.
# The file 'db.sqlite3' will be created automatically in the backend/ folder.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ─── Custom User Model ────────────────────────────────────────────────────────
# We tell Django to use OUR custom user model (defined in core/models.py)
# instead of Django's default User. This is needed because we add a 'role' field.
AUTH_USER_MODEL = 'core.CustomUser'

# ─── Password Validation ──────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── Internationalization ─────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'  # Indian Standard Time (IST)
USE_I18N = True
USE_TZ = True

# ─── Static & Media Files ─────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'  # `manage.py collectstatic` target for deployment
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'  # Uploaded images saved here

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Django REST Framework Configuration ──────────────────────────────────────
# This tells DRF to use JWT for authentication by default.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',  # All endpoints require login by default
    ),
    # Brute-force protection for login / sign-up / OTP endpoints (ScopedRateThrottle).
    'DEFAULT_THROTTLE_RATES': {
        'auth': os.environ.get('AUTH_THROTTLE_RATE', '20/min'),
    },
}

# ─── JWT Configuration ────────────────────────────────────────────────────────
# ACCESS_TOKEN_LIFETIME  → How long the JWT token is valid (1 day for hackathon convenience)
# REFRESH_TOKEN_LIFETIME → How long before the user must log in again
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),  # Frontend sends: Authorization: Bearer <token>
}

# ─── CORS Configuration ───────────────────────────────────────────────────────
# CORS (Cross-Origin Resource Sharing) allows our React frontend (running on
# port 5173 or 3000) to make API requests to Django (running on port 8000).
# Without this, browsers block the requests for security reasons.
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',    # React (Create React App)
    'http://localhost:5173',    # React (Vite)
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
]
CORS_ALLOWED_ORIGINS += [o for o in _env_list('CORS_ALLOWED_ORIGINS') if o not in CORS_ALLOWED_ORIGINS]
# Any origin is fine on a dev laptop; in production only the origins listed above.
CORS_ALLOW_ALL_ORIGINS = DEBUG

# ─── Razorpay Payment Gateway ─────────────────────────────────────────────────
# Keys are loaded from backend/.env — never hardcode secrets here.
# Test keys from: https://dashboard.razorpay.com/app/keys
RAZORPAY_KEY_ID      = os.environ.get('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET  = os.environ.get('RAZORPAY_KEY_SECRET', '')
RAZORPAY_WEBHOOK_SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
if RAZORPAY_WEBHOOK_SECRET in ('REPLACE_ME', 'changeme'):
    RAZORPAY_WEBHOOK_SECRET = ''

# The legacy POST /api/bookings/ endpoint "charges" UPI / card / net-banking
# without a gateway. Never let it create paid bookings in production.
ALLOW_SIMULATED_PAYMENTS = os.environ.get('ALLOW_SIMULATED_PAYMENTS', 'False').lower() == 'true'

# Booking emails go out on a background thread so SMTP latency never blocks a payment.
BOOKING_EMAIL_ASYNC = os.environ.get('BOOKING_EMAIL_ASYNC', 'True').lower() == 'true'

# ─── LLM API Configuration ────────────────────────────────────────────────────
# Deepseek LLM local endpoint configuration
LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'http://localhost:1234')
LLM_ENABLED = os.environ.get('LLM_ENABLED', 'False').lower() == 'true'




# ─── EMAIL (sign-up verification codes) ───────────────────────────────────────
# In development, leave EMAIL_HOST unset: Django prints the message — including
# the OTP — straight to the runserver console, so you can test without SMTP.
# In production set EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD (an app
# password, never your real one) and the SMTP backend switches on automatically.
EMAIL_HOST          = os.environ.get('EMAIL_HOST', '').strip()
EMAIL_PORT          = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_HOST_USER     = os.environ.get('EMAIL_HOST_USER', '').strip()
# Gmail shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of it.
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '').replace(' ', '')
EMAIL_USE_TLS       = os.environ.get('EMAIL_USE_TLS', 'True').lower() == 'true'
EMAIL_USE_SSL       = os.environ.get('EMAIL_USE_SSL', 'False').lower() == 'true'
EMAIL_TIMEOUT       = 20
# Gmail and most providers reject or spam-folder mail whose From address isn't the
# authenticated account, so default the sender to it.
DEFAULT_FROM_EMAIL  = os.environ.get('DEFAULT_FROM_EMAIL', '').strip() or (
    f'HapticEV <{EMAIL_HOST_USER}>' if EMAIL_HOST_USER else 'HapticEV <no-reply@hapticev.in>'
)

EMAIL_SMTP_CONFIGURED = bool(EMAIL_HOST and EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
EMAIL_BACKEND = (
    'django.core.mail.backends.smtp.EmailBackend'
    if EMAIL_SMTP_CONFIGURED
    else 'django.core.mail.backends.console.EmailBackend'
)
