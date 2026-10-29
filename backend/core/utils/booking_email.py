"""
Booking emails
==============
Ticket / status emails sent to the address the driver typed on the booking form.

Every email carries:
  • the ticket details (reference, station, date, time, vehicle, amount)
  • the QR ticket as an inline image and as a PNG attachment (when still valid)
  • a Google Maps directions link to the station
  • a calendar invite (.ics) whose LOCATION / GEO point at the station

Mail goes out after the database commit, on a background thread, so a slow
SMTP server never delays the payment response. Failures are logged, never raised.
"""

import base64
import logging
import threading
from datetime import datetime, timedelta, timezone as dt_timezone
from email.mime.image import MIMEImage
from urllib.parse import quote

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape

logger = logging.getLogger(__name__)

KINDS = {
    'created': {
        'subject': 'Booking confirmed',
        'headline': 'Your charging slot is booked',
        'lead': 'Payment received and your slot is reserved. The station will approve it shortly; '
                'show the QR ticket below when you arrive.',
        'ticket': True,
    },
    'confirmed': {
        'subject': 'Booking approved',
        'headline': 'The station approved your booking',
        'lead': 'You are all set. Show the QR ticket below at the station to start charging.',
        'ticket': True,
    },
    'rejected': {
        'subject': 'Booking declined',
        'headline': 'The station declined your booking',
        'lead': 'Sorry, the station could not take this booking. A full refund has been started.',
        'ticket': False,
    },
    'cancelled': {
        'subject': 'Booking cancelled',
        'headline': 'Your booking was cancelled',
        'lead': 'This booking has been cancelled as requested.',
        'ticket': False,
    },
}


def directions_url(station) -> str:
    if station.latitude is not None and station.longitude is not None:
        return f'https://www.google.com/maps/dir/?api=1&destination={station.latitude},{station.longitude}'
    return f'https://www.google.com/maps/search/?api=1&query={quote(station.location_text or station.name)}'


def _short_ref(booking) -> str:
    return str(booking.booking_id)[:8].upper()


def _slot_window(booking):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(booking.slot.date, booking.slot.start_time), tz)
    end = timezone.make_aware(datetime.combine(booking.slot.date, booking.slot.end_time), tz)
    if end <= start:
        end = start + timedelta(hours=1)
    return start, end


def _ics_escape(text: str) -> str:
    return (text or '').replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def build_ics(booking) -> str:
    """A single-event calendar invite pinned to the station's location."""
    start, end = _slot_window(booking)
    fmt = '%Y%m%dT%H%M%SZ'
    station = booking.station
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HapticEV//Booking//EN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        f'UID:{booking.booking_id}@hapticev',
        f'DTSTAMP:{timezone.now().astimezone(dt_timezone.utc).strftime(fmt)}',
        f'DTSTART:{start.astimezone(dt_timezone.utc).strftime(fmt)}',
        f'DTEND:{end.astimezone(dt_timezone.utc).strftime(fmt)}',
        f'SUMMARY:{_ics_escape("EV charging at " + station.name)}',
        f'LOCATION:{_ics_escape(station.location_text or station.name)}',
        f'DESCRIPTION:{_ics_escape(f"Booking {_short_ref(booking)}. Directions: {directions_url(station)}")}',
        f'URL:{directions_url(station)}',
    ]
    if station.latitude is not None and station.longitude is not None:
        lines.append(f'GEO:{station.latitude};{station.longitude}')
    lines += [
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        'DESCRIPTION:EV charging slot in 30 minutes',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ]
    return '\r\n'.join(lines) + '\r\n'


def _details(booking):
    slot = booking.slot
    rows = [
        ('Booking ref', _short_ref(booking)),
        ('Station', booking.station.name),
        ('Address', booking.station.location_text or '—'),
        ('Date', slot.date.strftime('%a, %d %b %Y')),
        ('Time', f"{slot.start_time.strftime('%I:%M %p').lstrip('0')} – {slot.end_time.strftime('%I:%M %p').lstrip('0')}"),
        ('Vehicle', booking.vehicle_number or booking.vehicle_type or '—'),
        ('Amount paid', f'₹{booking.amount_paid:.2f}' if booking.amount_paid is not None else '—'),
    ]
    if booking.refund_amount:
        rows.append(('Refund', f'₹{booking.refund_amount:.2f} ({booking.refund_percentage or 0}%)'))
    if booking.station.phone:
        rows.append(('Station phone', booking.station.phone))
    return rows


def build_message(booking, kind: str) -> EmailMultiAlternatives:
    copy = KINDS[kind]
    station = booking.station
    rows = _details(booking)
    maps = directions_url(station)
    ticket_url = f"{settings.FRONTEND_URL.rstrip('/')}/app/bookings/{booking.id}"
    with_qr = copy['ticket'] and bool(booking.qr_code)
    first_name = (booking.full_name or '').split(' ')[0] or 'there'

    subject = f"{copy['subject']} · {station.name} · {booking.slot.date.strftime('%d %b')} {booking.slot.start_time.strftime('%I:%M %p').lstrip('0')}"

    text = '\n'.join(
        [f'Hi {first_name},', '', copy['lead'], '']
        + [f'{k}: {v}' for k, v in rows]
        + ['', f'Directions: {maps}', f'View your ticket: {ticket_url}', '', '— HapticEV']
    )

    row_html = ''.join(
        f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px">{escape(k)}</td>'
        f'<td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">{escape(v)}</td></tr>'
        for k, v in rows
    )
    qr_html = (
        '<div style="text-align:center;margin:24px 0 8px">'
        '<img src="cid:ticket-qr" alt="Booking QR code" width="200" height="200" '
        'style="border:8px solid #fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.12)">'
        '<p style="margin:8px 0 0;color:#6b7280;font-size:12px">Show this QR code at the station to check in</p></div>'
        if with_qr else ''
    )
    html = f"""<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#111827;padding:20px 28px;color:#fbbf24;font-weight:800;letter-spacing:2px;font-size:14px">HAPTICEV</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 8px;font-size:22px;color:#111827">{escape(copy['headline'])}</h1>
<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.5">Hi {escape(first_name)}, {escape(copy['lead'])}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #d1d5db;border-bottom:1px dashed #d1d5db;padding:8px 0">{row_html}</table>
{qr_html}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0"><tr>
<td style="padding:0 6px"><a href="{escape(maps)}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">Get directions</a></td>
<td style="padding:0 6px"><a href="{escape(ticket_url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">View ticket</a></td>
</tr></table>
<p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center">The attached calendar invite includes the station location.</p>
</td></tr></table></td></tr></table></body></html>"""

    msg = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL, to=[booking.email])
    msg.attach_alternative(html, 'text/html')

    if with_qr:
        png = base64.b64decode(booking.qr_code)
        img = MIMEImage(png, 'png')
        img.add_header('Content-ID', '<ticket-qr>')
        img.add_header('Content-Disposition', 'inline', filename=f'hapticev-ticket-{_short_ref(booking)}.png')
        msg.attach(img)

    if kind in ('created', 'confirmed'):
        msg.attach(f'hapticev-{_short_ref(booking)}.ics', build_ics(booking), 'text/calendar')
    return msg


def send_booking_email(booking_pk: int, kind: str) -> bool:
    from core.models import Booking
    try:
        booking = Booking.objects.select_related('station', 'slot').get(pk=booking_pk)
        if not booking.email:
            return False
        build_message(booking, kind).send(fail_silently=False)
        return True
    except Exception:
        logger.exception('Booking email (%s) for booking %s failed', kind, booking_pk)
        return False


def queue_booking_email(booking, kind: str) -> None:
    """Send after the surrounding transaction commits; in the background unless disabled."""
    pk = booking.pk

    def _go():
        if getattr(settings, 'BOOKING_EMAIL_ASYNC', True):
            threading.Thread(target=send_booking_email, args=(pk, kind), daemon=True).start()
        else:
            send_booking_email(pk, kind)

    transaction.on_commit(_go)
