# 🚀 Deploying Pho2Booth on Vercel (100% Serverless, Single Project)

This guide walks you through deploying **Pho2Booth** on **Vercel** as a **single unified serverless project**, backed by **Neon Serverless Postgres**.

Zero external container servers, zero secondary projects, and zero proxy hops — the frontend UI and the entire backend API run together as **Vercel Serverless Functions**.

---

## 🏗️ Architecture Overview

Pho2Booth runs as a **single, unified project** in your Vercel account:

```
                       ┌─────────────────────────┐
                       │      Browser / User     │
                       └────────────┬────────────┘
                                    │ HTTPS (Webcam access enabled)
                                    ▼
                       ┌───────────────────────────────────────────┐
                       │           Single Vercel Project           │
                       │           pho2booth.vercel.app            │
                       │                                           │
                       │  ┌─────────────────┐ ┌─────────────────┐  │
                       │  │   Frontend UI   │ │  Serverless API │  │
                       │  │  Next.js App    │ │  Routes (/api/*)│  │
                       │  │  React 19 / RSC │ │  In-Process Fns │  │
                       │  └─────────────────┘ └────────┬────────┘  │
                       └───────────────────────────────┼───────────┘
                                                       │ Neon HTTP Driver
                                                       ▼
                                          ┌─────────────────────────┐
                                          │ Neon Serverless Postgres│
                                          │ (ep-*.aws.neon.tech)    │
                                          └─────────────────────────┘
```

| Component | Technology | Role |
|---|---|---|
| **Frontend UI** | Next.js 16 (App Router), React 19, Tailwind CSS v4 | Live camera feed, photobooth countdown, strip customization, edge delivery |
| **Backend API** | Vercel Serverless Functions (`src/app/api/[...path]/route.ts`) | Auth verification, session cookies, database queries via Neon HTTP driver |
| **Database** | Neon Serverless Postgres (`@neondatabase/serverless`) | Serverless relational storage for sessions, photos, users, and strips |

---

## ⚙️ How the Entire App Runs as Vercel Serverless Functions

1. **Native Serverless API Route (`frontend/src/app/api/[...path]/route.ts`)**:
   Next.js App Router API routes deploy directly to Vercel as **Serverless Functions** (Node.js runtime).
   Incoming requests to `/api/health`, `/api/sessions`, `/api/photos`, `/api/strips`, `/api/auth`, and `/api/library` execute directly in-process via `src/server/handler.ts` within the same Vercel execution environment.

2. **Direct Neon HTTP Driver (`@neondatabase/serverless` & Drizzle ORM)**:
   The backend uses Neon’s HTTP driver rather than long-lived TCP connection pools. Each serverless function invocation executes instantaneous SQL over HTTPS directly against your Neon database branch without connection limits or zombie pool exhaustion.

3. **No Proxy or Secondary URL Needed**:
   You do not need to configure `BACKEND_INTERNAL_URL` on Vercel. Browser and server calls both hit the same domain (`/api/*`), completely avoiding cross-origin CORS mismatches, double network latency, and inter-service timeouts.

---

## 📋 Prerequisites

1. A [Vercel](https://vercel.com) account.
2. A [Neon](https://console.neon.tech) account with a database project.
3. Your codebase in a Git repository (GitHub, GitLab, or Bitbucket).

---

## Step 1: Set Up Neon Postgres

1. In the [Neon Console](https://console.neon.tech), create a new project.
2. Copy your **Pooled connection string**:
   ```text
   postgresql://neondb_owner:PASSWORD@ep-sample-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Push your database schema to Neon:
   ```bash
   DATABASE_URL="<YOUR_POOLED_CONNECTION_STRING>" npm run db:push
   ```

---

## Step 2: Deploy to Vercel (1-Click Single Project)

1. Open your [Vercel Dashboard](https://vercel.com/new).
2. Select your `pho2booth` Git repository and click **Import**.
3. Configure the project:
   - **Root Directory**: Click **Edit** and set to `frontend` (**Required** — Pho2Booth is a monorepo, and Next.js resides in `frontend/`)
   - **Framework Preset**: **Next.js** (automatically detected once Root Directory is set to `frontend`)
   - **Build Command and Output Directory**: Leave overrides disabled so Next.js uses its defaults relative to `frontend`.
   - **Install Command**: `frontend/vercel.json` sets `npm ci --prefix . --workspaces=false --include=optional`. This uses the frontend lockfile, including native packages for Vercel's Linux builds, instead of the workspace root lockfile.
4. Expand **Environment Variables** and add:

   | Variable | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | `postgresql://neondb_owner:...` | Neon pooled connection string (`?sslmode=require`) |
   | `NODE_ENV` | `production` | Enables production security and secure `__Host-` cookies |

5. Click **Deploy**.
6. That's it! Vercel builds the Next.js frontend and compiles the backend APIs as Vercel Serverless Functions in a single deployment.

---

## Step 3: Verification & Health Check

Once deployment is complete, test the deployed endpoints:

1. **Health Check**:
   ```bash
   curl https://<your-vercel-domain>.vercel.app/api/health
   ```
   Expected response:
   ```json
   {"status":"ok"}
   ```

2. **Webcam & Camera Access**:
   - Vercel automatically provides HTTPS, allowing `navigator.mediaDevices.getUserMedia` to operate without browser security warnings.
   - Open your app in your browser, allow camera permissions, and take a 3 or 4 shot photo series.

3. **Save & Share**:
   - Customize your strip with frames, filters, and stickers.
   - Click **Save & Share** to verify end-to-end saving into Neon Postgres and retrieval via 32-character share code.

4. **Member Authentication**:
   - Visit `/auth`, create an account or sign in, and confirm session cookies (`__Host-p2b_session`) are securely issued.

---

## 🛠️ Troubleshooting

### 1. `503 SERVICE_UNAVAILABLE: Storage capacity reached or configuration missing`
- **Cause**: `DATABASE_URL` is missing or invalid in your Vercel project's Environment Variables.
- **Fix**: Open Vercel Project Settings → **Environment Variables**, verify `DATABASE_URL` has the pooled Neon connection string, and trigger a Redeploy.

### 2. `403 ORIGIN_FORBIDDEN: Trusted origin required`
- **Cause**: Browser requests with a cross-origin header or custom domain not recognized by the CSRF guardrail.
- **Fix**: If you use a custom domain (e.g. `https://mybooth.com`), add it to the `FRONTEND_URL` environment variable:
  ```env
  FRONTEND_URL=https://mybooth.com
  ```
  Vercel domains (`*.vercel.app` and `VERCEL_URL`) are automatically trusted by default.

### 3. `413 FUNCTION_PAYLOAD_TOO_LARGE`
- **Cause**: A raw photo or composite strip upload exceeded Vercel's 4.5 MB serverless body size threshold.
- **Fix**: The frontend automatically downscales high-res canvas exports to ~1–2 MB. Ensure you are using the default canvas export presets.
