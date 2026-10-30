/**
 * HapticEV API client
 * ───────────────────
 * One place for every HTTP call to the Django backend. Handles JWT injection,
 * JSON parsing, error normalisation and the 401 -> logout hand-off.
 *
 * Every helper returns parsed JSON and THROWS an `ApiError` on non-2xx, so
 * callers can just `try { await api.get(...) } catch (e) { toast(e.message) }`.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

const STORAGE = {
  access: 'hev_access',
  refresh: 'hev_refresh',
  user: 'hev_user',
};

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/* ── Session storage ────────────────────────────────────────────────────── */
export const session = {
  getAccess: () => localStorage.getItem(STORAGE.access),
  getRefresh: () => localStorage.getItem(STORAGE.refresh),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.user) || 'null');
    } catch {
      return null;
    }
  },
  save: (tokens, user) => {
    if (tokens?.access) localStorage.setItem(STORAGE.access, tokens.access);
    if (tokens?.refresh) localStorage.setItem(STORAGE.refresh, tokens.refresh);
    if (user) localStorage.setItem(STORAGE.user, JSON.stringify(user));
  },
  saveUser: (user) => localStorage.setItem(STORAGE.user, JSON.stringify(user)),
  clear: () => Object.values(STORAGE).forEach((k) => localStorage.removeItem(k)),
};

/**
 * Subscribers notified when the backend rejects our token, so <AuthProvider>
 * can drop the user back to /login without every page having to check.
 */
const unauthorizedHandlers = new Set();
export function onUnauthorized(fn) {
  unauthorizedHandlers.add(fn);
  return () => unauthorizedHandlers.delete(fn);
}

/** Turn DRF's many error shapes into one readable sentence. */
function extractMessage(payload, status) {
  if (!payload) return `Request failed (${status})`;
  if (typeof payload === 'string') return payload;
  if (payload.detail) return payload.detail;
  if (payload.error) return payload.error;

  const firstKey = Object.keys(payload)[0];
  if (!firstKey) return `Request failed (${status})`;
  const value = payload[firstKey];
  const text = Array.isArray(value) ? value[0] : value;
  return firstKey === 'non_field_errors' ? String(text) : `${firstKey}: ${text}`;
}

async function request(
  endpoint,
  { method = 'GET', body, isFormData = false, signal, publicRoute = false } = {},
) {
  const headers = {};
  const token = session.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Is the Django backend running?', 0, null);
  }

  // A 401 from /auth/login/ means "wrong password", not "session expired" —
  // only public routes are exempt from the global sign-out.
  if (res.status === 401 && !publicRoute) {
    session.clear();
    unauthorizedHandlers.forEach((fn) => fn());
    throw new ApiError('Your session expired. Please sign in again.', 401, null);
  }

  if (res.status === 204) return null;

  const raw = await res.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (!res.ok) throw new ApiError(extractMessage(payload, res.status), res.status, payload);
  return payload;
}

export const api = {
  get: (endpoint, opts) => request(endpoint, { ...opts, method: 'GET' }),
  post: (endpoint, body, opts) => request(endpoint, { ...opts, method: 'POST', body }),
  patch: (endpoint, body, opts) => request(endpoint, { ...opts, method: 'PATCH', body }),
  put: (endpoint, body, opts) => request(endpoint, { ...opts, method: 'PUT', body }),
  postForm: (endpoint, formData) => request(endpoint, { method: 'POST', body: formData, isFormData: true }),
};

/* ── Endpoint map ───────────────────────────────────────────────────────────
   Mirrors backend/core/urls.py. Keeping the paths here means a backend route
   rename is a one-line change in the frontend.
   ────────────────────────────────────────────────────────────────────────── */
const qs = (params) => {
  const clean = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return clean.length ? `?${new URLSearchParams(clean)}` : '';
};

export const endpoints = {
  // Auth
  register: (data) => api.post('/auth/register/', data, { publicRoute: true }),
  login: (data) => api.post('/auth/login/', data, { publicRoute: true }),
  me: () => api.get('/auth/me/'),
  requestOtp: (email) => api.post('/auth/otp/request/', { email }, { publicRoute: true }),
  verifyOtp: (email, code) => api.post('/auth/otp/verify/', { email, code }, { publicRoute: true }),

  // Stations (user side)
  stations: (params) => api.get(`/stations/${qs(params)}`),
  station: (id) => api.get(`/stations/${id}/`),
  stationReviews: (id, params) => api.get(`/stations/${id}/reviews/${qs(params)}`),
  stationSlots: (id, date) => api.get(`/stations/${id}/slots/${qs({ date })}`),

  // Bookings (user side)
  createBooking: (data) => api.post('/bookings/', data),
  bookingHistory: () => api.get('/bookings/history/'),
  booking: (id) => api.get(`/bookings/${id}/`),
  refundPreview: (id) => api.get(`/bookings/${id}/refund-preview/`),
  cancelBooking: (id) => api.post(`/bookings/${id}/cancel/`, {}),
  reviewBooking: (id, data) => api.post(`/bookings/${id}/review/`, data),

  // Owner
  ownerStations: () => api.get('/owner/stations/'),
  createStation: (data, isForm) =>
    isForm ? api.postForm('/owner/stations/', data) : api.post('/owner/stations/', data),
  updateStation: (id, data) => api.patch(`/owner/stations/${id}/`, data),
  ownerSlots: (stationId, date) => api.get(`/owner/slots/${qs({ station: stationId, date })}`),
  createSlots: (data) => api.post('/owner/slots/', data),
  updateSlot: (id, data) => api.patch(`/owner/slots/${id}/`, data),
  deleteSlot: (id) => request(`/owner/slots/${id}/`, { method: 'DELETE' }),
  ownerBookings: () => api.get('/owner/bookings/'),
  ownerBooking: (id) => api.get(`/owner/bookings/${id}/`),
  updateBookingStatus: (id, status) => api.patch(`/owner/bookings/${id}/status/`, { status }),
  verifyQr: (bookingId) => api.post('/owner/verify-qr/', { booking_id: bookingId }),

  // Emergency
  emergencyMechanics: (params) => api.get(`/emergency/mechanics/${qs(params)}`),
  emergencyStations: (params) => api.get(`/emergency/stations/${qs(params)}`),
  emergencyRequests: () => api.get('/emergency/requests/'),
  sendSos: (data) => api.post('/emergency/requests/', data),

  // Mechanic
  mechanicProfile: () => api.get('/mechanic/profile/'),
  saveMechanicProfile: (data) => api.post('/mechanic/profile/', data),
  mechanicRequests: () => api.get('/mechanic/requests/'),
  mechanicRequestAction: (id, action) => api.patch(`/mechanic/requests/${id}/`, { action }),

  // Razorpay
  createRazorpayOrder: (data) => api.post('/payments/razorpay/create-order/', data),
  verifyRazorpay: (data) => api.post('/payments/razorpay/verify/', data),

  // Station Owner Membership & Autopay
  ownerMembership: () => api.get('/owner/membership/'),
  toggleAutopay: (data) => api.post('/owner/membership/autopay/', data),
  createMembershipOrder: (data) => api.post('/owner/membership/razorpay/create-order/', data),
  verifyMembershipOrder: (data) => api.post('/owner/membership/razorpay/verify/', data),
  simulateMembershipPurchase: (data) => api.post('/owner/membership/simulate-purchase/', data),
};

export { API_BASE };
