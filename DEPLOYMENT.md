# 🚀 Deployment Guide: HapticEV on Render & Vercel

This guide walks you through deploying **HapticEV** in under 10 minutes:
- **Backend (Django REST Framework)** on **Render** (Free Web Service)
- **Frontend (React + Vite)** on **Vercel** (Global Fast Edge CDN)

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Step 1: Push Code to GitHub](#step-1-push-code-to-github)
3. [Step 2: Deploy Backend on Render](#step-2-deploy-backend-on-render)
4. [Step 3: Deploy Frontend on Vercel](#step-3-deploy-frontend-on-vercel)
5. [Step 4: Connect Backend & Frontend](#step-4-connect-backend--frontend)
6. [Step 5: Verification & Testing](#step-5-verification--testing)
7. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## 1. Prerequisites
- A [GitHub](https://github.com/) account.
- A free [Render](https://render.com/) account.
- A free [Vercel](https://vercel.com/) account.
- (Optional) Razorpay test keys from [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys).

---

## Step 1: Push Code to GitHub

Open your terminal or command prompt in `c:\RGPV_Hackthon` and run:

```bash
git add .
git commit -m "feat: complete dynamic slot booking, affordable tariffs, and production deployment config"
git push origin main
```

*(If you haven't connected your remote repository yet, run `git remote add origin <your-github-repo-url>` followed by `git push -u origin main`)*

---

## Step 2: Deploy Backend on Render

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repo.
4. Configure the Web Service settings:
   - **Name**: `hapticev-backend` *(or any preferred name)*
   - **Region**: `Singapore (Southeast Asia)` or `Frankfurt` *(closest to India for low latency)*
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `bash build.sh`
   - **Start Command**: `gunicorn ev_backend.wsgi:application --bind 0.0.0.0:$PORT`
   - **Instance Type**: `Free`

5. **Environment Variables**:
   Click **Advanced** → **Add Environment Variable** and add the following:

   | Key | Value | Description |
   |---|---|---|
   | `PYTHON_VERSION` | `3.12.3` | Matches current stable runtime |
   | `DJANGO_DEBUG` | `False` | Enables production security & SSL |
   | `DJANGO_SECRET_KEY` | *(Click "Generate" or paste random 50+ chars)* | Required for session & crypto |
   | `DJANGO_ALLOWED_HOSTS` | `.onrender.com,localhost,127.0.0.1` | Allows Render domain |
   | `ALLOW_SIMULATED_PAYMENTS` | `True` | Allows demo test bookings |
   | `FRONTEND_URL` | `https://your-app.vercel.app` *(update after Step 3)* | Frontend link in emails |
   | `CORS_ALLOWED_ORIGINS` | `https://your-app.vercel.app` *(update after Step 3)* | Allows Vercel API calls |
   | `RAZORPAY_KEY_ID` | `rzp_test_...` *(optional)* | Your Razorpay Key ID |
   | `RAZORPAY_KEY_SECRET` | `...` *(optional)* | Your Razorpay Key Secret |

6. Click **Create Web Service**.
7. Render will build and deploy your backend. Once it displays **Live**, note your backend URL:
   `https://hapticev-backend-xxxx.onrender.com`

> **Note**: Test the health check endpoint in your browser:
> `https://hapticev-backend-xxxx.onrender.com/api/health/`
> You should see: `{"status": "healthy", "database": "connected", "service": "HapticEV Backend"}`

---

## Step 3: Deploy Frontend on Vercel

1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New…** → **Project**.
3. Import your GitHub repository (`RGPV_Hackathon`).
4. In the **Configure Project** screen:
   - **Framework Preset**: `Vite` *(auto-detected)*
   - **Root Directory**: Click **Edit** and select `frontend`
   - **Build Command**: `npm run build` *(default)*
   - **Output Directory**: `dist` *(default)*

5. Expand **Environment Variables** and add:
   - **Key**: `VITE_API_BASE`
   - **Value**: `https://hapticev-backend-xxxx.onrender.com/api` *(Your Render backend URL with `/api` at the end)*

6. Click **Deploy**.
7. Vercel will build and deploy the React app in ~30 seconds and provide your live URL:
   `https://hapticev-xxxx.vercel.app`

---

## Step 4: Connect Backend & Frontend

Now that you have your live Vercel URL (e.g. `https://hapticev-app.vercel.app`), update your Render backend so CORS allows requests from it:

1. In [Render Dashboard](https://dashboard.render.com/), open `hapticev-backend` → **Environment**.
2. Update/Add these two variables:
   - `FRONTEND_URL` = `https://hapticev-app.vercel.app`
   - `CORS_ALLOWED_ORIGINS` = `https://hapticev-app.vercel.app`
3. Click **Save Changes**. Render will automatically redeploy with the new settings in a few seconds.

---

## Step 5: Verification & Testing

Visit your Vercel URL in the browser:
1. **User Sign Up / Login**: Register a test account or log in.
2. **Station Search & Live Rates**: View Bhopal stations with the updated affordable tariffs (₹25–₹85/hr).
3. **Pick a Slot & Custom Duration**:
   - Pick a slot (e.g. 10:00 AM – 11:00 AM).
   - Select **1.5 hrs** duration.
   - Confirm it locks `10:00 AM – 11:30 AM` and automatically splits the next interval (`11:30 AM – 12:00 PM`) for other drivers.
4. **Owner Dashboard & Scanner**:
   - Log in as owner.
   - Check the **Membership & Autopay** tab.
   - Use the camera or file upload QR scanner to verify tickets.

---

## 🛠️ Summary of Pre-configured Files in Repo

| File | Purpose |
|---|---|
| `backend/Procfile` | WSGI startup command for Render / Railway / Heroku |
| `backend/build.sh` | Installs deps, runs collectstatic, applies migrations & seeds demo stations |
| `frontend/vercel.json` | Prevents 404s on browser refresh for React Router |
| `frontend/public/_redirects` | Fallback SPA routing rule for Netlify / Render static sites |
| `render.yaml` | 1-Click Blueprint for Render if you prefer deploying both together |
| `docker-compose.yml` | Containerized setup for local or self-hosted cloud Docker |
