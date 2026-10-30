/** Small pure formatters shared across pages. */

export const inr = (value, { decimals = 0 } = {}) => {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

/** "14:30:00" -> "2:30 PM" */
export const time12 = (value) => {
  if (!value) return '—';
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
};

/** "2026-03-14" -> "Sat, 14 Mar" */
export const dateShort = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const dateTimeLong = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** YYYY-MM-DD in local time (never UTC — that shifts the date in IST). */
export const toISODate = (date = new Date()) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const distanceLabel = (km) => {
  if (km === null || km === undefined) return null;
  const n = Number(km);
  if (Number.isNaN(n) || n >= 9000) return null;
  return n < 1 ? `${Math.round(n * 1000)} m away` : `${n.toFixed(1)} km away`;
};

/** Hours between "09:00:00" and "11:00:00", supports 0.5, 1.5, etc. */
export const slotHours = (start, end) => {
  if (!start || !end) return 1;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return 1;
  return Math.max(0.5, Math.round((mins / 60) * 10) / 10);
};

export const formatDuration = (hours) => {
  const h = Number(hours || 1);
  if (h === 0.5) return '30 mins';
  if (h === 1) return '1 hour';
  if (h === 1.5) return '1 hr 30 mins';
  if (h === 2) return '2 hours';
  if (h === 2.5) return '2 hrs 30 mins';
  if (h === 3) return '3 hours';
  const fullHours = Math.floor(h);
  const mins = Math.round((h - fullHours) * 60);
  if (mins === 0) return `${fullHours} hrs`;
  return `${fullHours} hr ${mins} mins`;
};

export const addHoursToTime = (timeStr, hours) => {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + (m || 0) + Math.round(Number(hours) * 60);
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`;
};

export const initials = (user) => {
  if (!user) return '?';
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || '';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || '?'
  );
};

export const fullName = (user) =>
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'there';

/** Status -> tailwind classes, used by every badge across the app. */
export const STATUS_TONE = {
  pending: 'text-amber-300 bg-amber-400/10 border-amber-400/30',
  confirmed: 'text-mint-300 bg-mint-500/10 border-mint-500/30',
  completed: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  rejected: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  cancelled: 'text-neutral-400 bg-hover border-line',
  accepted: 'text-mint-300 bg-mint-500/10 border-mint-500/30',
};
