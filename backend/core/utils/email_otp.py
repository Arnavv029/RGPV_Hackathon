"""
Email OTP helpers
=================
Issue, send and check the one-time codes used to prove somebody owns the email
address they are signing up with.

Codes are hashed before storage, expire quickly and are rate limited. Delivery
goes through Django's email framework, so it is the deployment's job (via
EMAIL_BACKEND / SMTP settings) to decide how mail actually leaves the server.
In development the console backend simply prints the message to the terminal.
"""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from core.models import EmailVerification

CODE_LENGTH = 6


def hash_code(code: str) -> str:
    """SHA-256 of the code, salted with the project's SECRET_KEY."""
    return hashlib.sha256(f'{settings.SECRET_KEY}:{code}'.encode()).hexdigest()


def generate_code() -> str:
    """A cryptographically random 6-digit code (leading zeros allowed)."""
    return f'{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}'


def normalize_email(email: str) -> str:
    return (email or '').strip().lower()


def send_code_email(email: str, code: str) -> None:
    """Deliver the code. Raises if the mail backend fails."""
    minutes = EmailVerification.OTP_TTL_MINUTES
    subject = f'{code} is your HapticEV verification code'
    body = (
        f'Your HapticEV verification code is {code}.\n\n'
        f'It expires in {minutes} minutes. If you did not request this, you can ignore this email.\n\n'
        "-- HapticEV"
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
        recipient_list=[email],
        fail_silently=False,
    )


def issue_code(email: str):
    """
    Create (or refresh) a verification for this email and send the code.

    Returns (verification, error). `error` is a user-safe string when the
    request should be refused — cooldown or hourly cap.
    """
    email = normalize_email(email)
    now = timezone.now()

    existing = (
        EmailVerification.objects.filter(email=email, is_consumed=False)
        .order_by('-created_at')
        .first()
    )

    if existing:
        # Don't let somebody hammer the send button (or our mail bill).
        since_last = (now - existing.last_sent_at).total_seconds()
        if since_last < EmailVerification.RESEND_COOLDOWN_SECONDS:
            wait = int(EmailVerification.RESEND_COOLDOWN_SECONDS - since_last)
            return None, f'Please wait {wait}s before asking for another code.'

        if existing.created_at > now - timedelta(hours=1) and existing.sends >= EmailVerification.MAX_SENDS_PER_HOUR:
            return None, 'Too many codes requested for this email. Try again in an hour.'

    code = generate_code()
    expires_at = now + timedelta(minutes=EmailVerification.OTP_TTL_MINUTES)

    # If delivery fails, roll back so the user isn't stuck behind the resend cooldown
    # for a code they never received.
    with transaction.atomic():
        verification = _store_code(email, code, existing, now, expires_at)
        send_code_email(email, code)
    return verification, None


def _store_code(email, code, existing, now, expires_at):
    if existing and existing.created_at > now - timedelta(hours=1):
        existing.code_hash = hash_code(code)
        existing.expires_at = expires_at
        existing.attempts = 0
        existing.is_verified = False
        existing.token = ''
        existing.verified_at = None
        existing.sends += 1
        existing.last_sent_at = now
        existing.save()
        return existing

    # Older rows for this email are dead weight once a new code is issued.
    EmailVerification.objects.filter(email=email, is_consumed=False).delete()
    return EmailVerification.objects.create(
        email=email,
        code_hash=hash_code(code),
        expires_at=expires_at,
    )


def verify_code(email: str, code: str):
    """
    Check a submitted code.

    Returns (token, error). On success the caller passes `token` to
    /api/auth/register/ to prove the address was verified.
    """
    email = normalize_email(email)
    code = (code or '').strip()

    verification = (
        EmailVerification.objects.filter(email=email, is_consumed=False)
        .order_by('-created_at')
        .first()
    )
    if not verification:
        return None, 'Request a verification code first.'
    if verification.is_expired:
        return None, 'That code has expired. Please request a new one.'
    if verification.attempts >= EmailVerification.MAX_ATTEMPTS:
        return None, 'Too many incorrect attempts. Please request a new code.'

    if not secrets.compare_digest(verification.code_hash, hash_code(code)):
        verification.attempts += 1
        verification.save(update_fields=['attempts'])
        left = EmailVerification.MAX_ATTEMPTS - verification.attempts
        if left <= 0:
            return None, 'Too many incorrect attempts. Please request a new code.'
        return None, f'That code is not right. {left} attempt{"s" if left != 1 else ""} left.'

    verification.is_verified = True
    verification.verified_at = timezone.now()
    verification.token = secrets.token_urlsafe(32)
    verification.attempts = 0
    verification.save()
    return verification.token, None


def consume_token(email: str, token: str) -> bool:
    """
    Validate the token handed out by verify_code() and burn it.
    Returns True when the email may be used to create an account.
    """
    email = normalize_email(email)
    if not token:
        return False

    verification = (
        EmailVerification.objects.filter(
            email=email, token=token, is_verified=True, is_consumed=False
        )
        .order_by('-created_at')
        .first()
    )
    if not verification or not verification.verified_at:
        return False

    fresh_until = verification.verified_at + timedelta(minutes=EmailVerification.TOKEN_TTL_MINUTES)
    if timezone.now() > fresh_until:
        return False

    verification.is_consumed = True
    verification.save(update_fields=['is_consumed'])
    return True
