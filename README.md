# HapticEV — EV Charging Slot Booking

A full-stack platform for EV drivers, station owners and mechanics: find chargers on a live map, book a
time slot at an AI-adjusted price, pay with Razorpay, check in with a QR code, and get roadside help.

**Scope:** a **Bhopal pilot**, built for **every kind of EV** — cars, autos, bikes and scooters. Stations
declare their connector and rated output, so slow AC points serve two-wheelers while DC points fast-charge
cars. Other cities come after the prototype proves out.

---

## Project Structure

```
EV-Mangment/
├── frontend/                  ← React 18 SPA (Vite + Tailwind v4)
│   ├── public/                ← Static images & hero video
│   └── src/
│       ├── main.jsx / App.jsx ← Entry point + route table
│       ├── lib/               ← api.js (every endpoint), format.js, razorpay.js
│       ├── context/           ← AuthContext (JWT session, role routing)
│       ├── hooks/             ← useAsync, useGeolocation
│       ├── components/
│       │   ├── ui/            ← Button, Card, Field, Modal, Badge, feedback states
│       │   ├── layout/        ← Navbar, Footer, AppShell, RequireAuth
│       │   ├── map/           ← LiveMap (react-leaflet + OpenStreetMap)
│       │   ├── three/         ← EnergyCore (react-three-fiber 3D hero)
│       │   ├── motion/        ← Framer Motion reveal / page transitions
│       │   └── station/       ← StationCard, cancel & review modals
│       └── pages/             ← Landing, Login, Home, StationDetails, Booking,
│                                 BookingDetail, History, Emergency,
│                                 MechanicDashboard, owner/*
└── backend/                   ← Django REST API
    ├── manage.py
    ├── requirements.txt
    ├── db.sqlite3              ← SQLite database (auto-created after migrate)
    ├── ev_backend/             ← Django project config
    │   ├── settings.py         ← App settings, JWT, CORS, database
    │   └── urls.py             ← Root URL router
    └── core/                  ← Main app
        ├── models.py           ← Database tables (User, Station, TimeSlot, Booking)
        ├── serializers.py      ← Python ↔ JSON conversion
        ├── urls.py             ← All API route definitions
        ├── admin.py            ← Django admin panel config
        ├── views/
        │   ├── auth_views.py   ← Register, Login, Profile
        │   ├── station_views.py← List stations, detail, slots by date
        │   ├── booking_views.py← Create booking (+ QR), history, detail
        │   └── owner_views.py  ← Station mgmt, QR verify, approve/reject
        ├── utils/
        │   ├── qr_generator.py ← Generates QR code as base64 PNG
        │   └── distance.py     ← Haversine formula for GPS distance
        └── management/commands/
            └── seed_data.py    ← Creates demo users, stations & slots
```

---

## Quick Start

### Backend

```bash
# 1. Go to backend folder
cd backend

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create database tables
python manage.py migrate

# 4. Load demo data
python manage.py seed_data

# 5. Build the Bhopal pilot network (stations, hourly pricing, a week of slots)
#    --purge also deletes any station outside Bhopal
python manage.py seed_bhopal --purge

# 5. Start the server
python manage.py runserver

# Server runs at: http://localhost:8000/
```

> **LLM pricing:** with `LLM_ENABLED=true` in `backend/.env`, every slot the API returns calls the local
> LLM at `LLM_BASE_URL` (30 s timeout). If that server isn't running, set `LLM_ENABLED=false`, otherwise
> slot, booking and owner pages will be very slow.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_BASE=http://localhost:8000/api
npm run dev                 # http://localhost:5173
npm run build               # production bundle in frontend/dist
```

| Route | Who | Page |
|-------|-----|------|
| `/` | Everyone | Landing page with the 3D hero |
| `/login` | Everyone | Sign in / register (driver, owner, mechanic) |
| `/app` | Driver | Station finder: map, list, filters |
| `/app/stations/:id` | Driver | Station details, slot picker, reviews |
| `/app/book` | Driver | Checkout via Razorpay |
| `/app/bookings`, `/app/bookings/:id` | Driver | History, QR ticket, cancel, review |
| `/app/emergency` | Driver | SOS: ranked mechanics + emergency charging |
| `/owner`, `/owner/requests`, `/owner/slots`, `/owner/scanner`, `/owner/stations/new` | Owner | Owner console |
| `/mechanic` | Mechanic | Workshop profile + SOS queue |

---

## Demo Accounts (after seed_data)

| Role | Username | Password |
|------|----------|----------|
| EV User | `user1` | `password123` |
| Station Owner | `owner1` | `password123` |

---

## Email verification (sign-up)

New accounts must prove they own their email address:

1. `POST /api/auth/otp/request/` → mails a 6-digit code (hashed at rest, 10-minute expiry,
   60-second resend cooldown, 5 sends/hour per address).
2. `POST /api/auth/otp/verify/` → returns a single-use `verification_token` valid for 30 minutes.
3. `POST /api/auth/register/` → refuses to create the account without that token.

In development `EMAIL_HOST` is blank, so Django prints the message — code included — straight to the
runserver console. Set the `EMAIL_*` variables in `backend/.env` to send real mail in production.

## Pricing model

Stations are booked and billed **per hour**. Each station stores its rated output (`power_kw`), and the
seed prices an hour at `power_kw x Rs.16/kWh`, rounded to Rs.10 — so a 30 kW point costs Rs.480/hr and an
hour there really does deliver about 30 kWh. The UI shows the hourly price with an approximate per-kWh
figure beside it.

## Complete API Reference

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register/` | Register new account | No |
| POST | `/api/auth/login/` | Login → get JWT tokens | No |
| GET | `/api/auth/me/` | Get current user profile | Yes |

### Stations (User)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/stations/` | List stations (optional: `?lat=&lng=` for distance sort) | Yes |
| GET | `/api/stations/{id}/` | Station detail | Yes |
| GET | `/api/stations/{id}/slots/` | Slots for a date (`?date=YYYY-MM-DD`) | Yes |

### Bookings (User)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/bookings/` | Create booking (auto-generates QR) | Yes |
| GET | `/api/bookings/history/` | My booking history | Yes |
| GET | `/api/bookings/{id}/` | Single booking + QR code | Yes |

### Owner Management
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET/POST | `/api/owner/stations/` | List / Add stations | Owner only |
| POST | `/api/owner/slots/` | Create time slots (single or bulk) | Owner only |
| GET | `/api/owner/bookings/` | All bookings for my stations | Owner only |
| GET | `/api/owner/bookings/{id}/` | Single booking detail | Owner only |
| PATCH | `/api/owner/bookings/{id}/status/` | Approve or reject booking | Owner only |
| POST | `/api/owner/verify-qr/` | Scan QR → return booking info | Owner only |

---

## How JWT Authentication Works

```
1. User logs in → backend returns:
   { "access": "eyJ...", "refresh": "eyJ..." }

2. Frontend stores tokens in localStorage

3. Every API call includes:
   Header: Authorization: Bearer eyJ...

4. Backend verifies token → identifies user → processes request
```

---

## How QR Code Works

```
1. User creates booking → backend generates UUID (booking_id)
2. Backend encodes booking details into JSON:
   {"booking_id": "abc...", "user_name": "Ramesh", "station": "Green Power Hub", ...}
3. JSON is converted to a QR code image
4. QR image is base64-encoded and stored with the booking
5. Frontend displays: <img src="data:image/png;base64,..." />
6. Owner scans QR → reads JSON → extracts booking_id
7. Owner sends booking_id to /api/owner/verify-qr/
8. Backend returns full booking details → owner approves/rejects
```

---

## Admin Panel

```bash
# Create superuser account
python manage.py createsuperuser

# Open in browser
http://localhost:8000/admin/
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (JSX), Vite, Tailwind CSS v4, React Router |
| Motion & 3D | Framer Motion, react-three-fiber + drei |
| Maps | react-leaflet + OpenStreetMap (bright/full-colour basemap) |
| Type | Archivo (display) + Inter (body), self-hosted via Fontsource |
| Framework | Django 6 + Django REST Framework |
| Authentication | JWT (djangorestframework-simplejwt) |
| Database | SQLite (built-in) |
| QR Generation | Python `qrcode` + `Pillow` |
| CORS | `django-cors-headers` |

---

## Frontend design system

Editorial layout with oversized uppercase display type, photography-led sections
and a single amber accent — in **two themes**.

### Theming

The app ships **light (default) and dark** themes. Both are driven by the same
token names, so switching is just a `data-theme` attribute on `<html>`:

- `src/context/ThemeProvider.jsx` owns the state and persists it to
  `localStorage` under `hev_theme`.
- An inline script in `index.html` applies the saved theme **before first paint**,
  so there is no flash of the wrong theme.
- The toggle lives in the navbar (`src/components/ui/ThemeToggle.jsx`); the mobile
  menu gets a labelled row.
- Every palette value is redefined under `:root[data-theme='light']` in
  `src/index.css`. Components never hard-code a colour, so nothing needs a
  `light:` variant.

| Token | Dark | Light | Used for |
|-------|------|-------|----------|
| `ink-950 … ink-500` | `#060607` → `#3a3a44` | `#f4f2ed` → `#bdb7aa` | Page, bands, cards, chrome |
| `bone` / `bone-dim` | `#f6f5f2` / `#a8a6a1` | `#14130f` / `#55524b` | Primary / secondary text |
| `neutral-200 … 700` | light greys | dark greys | Muted text, in descending prominence |
| `line` / `line-2` | white alpha | ink alpha | Hairlines and borders |
| `hover` / `hover-2` | white alpha | ink alpha | Subtle fills and hover states |
| `amber-400/500` | `#f5ad3f` | same | The accent — fills, never flips |
| `amber-300`, `mint-300`, `sky-300`, `rose-300` | pale | deepened | The **text** step for accent/status on a surface |
| `on-accent` | `#17130a` | same | Text placed on an amber fill |

Two rules keep contrast correct in both themes:

1. **Use the `-300` step for coloured text** on a surface (it deepens on paper);
   use `-400`/`-500` for fills.
2. **Media-backed panels stay dark in both themes** — the landing hero, the login
   poster and station headers. Put `.on-dark` on chrome that floats over them
   (the landing navbar does this) and it re-points the tokens for its subtree.

Shared helpers in `src/index.css`: `display-xl`, `eyebrow`, `text-outline`,
`glass` (card surface, gains a soft shadow in light mode), `bg-wash`,
`grid-fade`, `edge-fade`, `on-dark`.

Reusable animation primitives are in `src/components/motion/Reveal.jsx`:
`TextReveal` (word-by-word masked headlines), `Reveal`, `Stagger`, `Parallax`,
`ImageReveal`, `Magnetic`, `TiltCard`, `Counter`, `Marquee` and `ScrollProgress`.
All of them respect `prefers-reduced-motion`.

The map is deliberately **bright in both themes** — full-colour OpenStreetMap with
no dark filter, so streets and labels stay readable (`src/components/map/LiveMap.jsx`).

> **Landing-page content:** the page deliberately ships **no testimonials** — there are no
> real reviews yet, and invented ones don't belong on a live site. The section that would
> hold them is now "One network, three roles" (`#roles`). Add a testimonial block back only
> when you have genuine, attributed feedback, or wire it to the review API.

-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4, React Router |
| Motion & 3D | Framer Motion, react-three-fiber + drei |
| Maps | react-leaflet + OpenStreetMap tiles |
| Framework | Django 6 + Django REST Framework |
| Authentication | JWT (djangorestframework-simplejwt) |
| Database | SQLite (built-in) |
| QR Generation | Python `qrcode` + `Pillow` |
| CORS | `django-cors-headers` |

---

## Development Phases

- [x] **Phase 1** — Backend (Django REST API)
- [x] **Phase 2** — Frontend (React + Tailwind CSS)
- [x] **Phase 3** — Integration (all endpoints wired through `frontend/src/lib/api.js`)
