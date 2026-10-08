# 📸 Pho2Booth

A responsive retro and contemporary photo booth web application built with a **Next.js** frontend, native **Vercel Serverless Functions**, and **Neon Serverless Postgres** with **Drizzle ORM**.

Pho2Booth runs as a **single, unified serverless project on Vercel** by default, with an optional standalone Express backend for containerized or custom environments.

---

## 🏗️ Architecture Overview

Pho2Booth deploys as a single application where the Next.js frontend UI and all backend APIs execute together in-process:

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
                       │  │  Next.js 16 App │ │  Routes (/api/*)│  │
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

- **Frontend UI:** Next.js 16 (App Router), React 19, and Tailwind CSS v4 providing responsive capture studios, customization controls, and member library views.
- **Serverless API Routes:** In-process route handlers (`src/app/api/[...path]/route.ts`) executing auth verification, session management, photo persistence, and Polar billing webhooks without proxy hops.
- **Database & Storage:** Neon Serverless Postgres using the `@neondatabase/serverless` HTTP driver for instantaneous queries without persistent connection pool exhaustion.

---

## 🗂️ Project Structure

```
pho2booth/
├── frontend/                         # Next.js 16 (App Router) + React 19 + Tailwind CSS
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/[...path]/        # Catch-all serverless API route dispatcher
│   │   │   ├── auth/                 # Sign in, sign up, and account management
│   │   │   ├── download/[id]/        # Public keepsake viewing & download portal
│   │   │   ├── library/              # Member keepsake gallery and session inspector
│   │   │   ├── pricing/              # Polar.sh subscription and pass checkout
│   │   │   ├── layout.tsx            # Root application layout
│   │   │   ├── page.tsx              # Main photo booth experience & studio router
│   │   │   └── globals.css           # Tailwind CSS styles
│   │   ├── components/
│   │   │   ├── CameraView.tsx        # Camera stream, shutter countdown & flash effects
│   │   │   ├── FormatSelectionScreen.tsx # 5 studio format selection screen
│   │   │   ├── StripCustomizer.tsx   # Layouts, frame colors, stickers & export
│   │   │   ├── SinglePhotoStudio.tsx # High-resolution single portrait capture
│   │   │   ├── BoomerangStudio.tsx   # Burst motion loop capture with GIF export
│   │   │   ├── VideoReelStudio.tsx   # Short video recording with MP4 reel export
│   │   │   ├── AiEffectStudio.tsx    # MediaPipe selfie segmentation with custom backdrops
│   │   │   ├── ScanQrModal.tsx       # Live QR code modal for mobile download transfer
│   │   │   ├── AccountDropdown.tsx   # User profile menu and session controls
│   │   │   └── BackendStatus.tsx     # Real-time Neon database & health badge
│   │   ├── server/                   # In-process serverless backend engine
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # Drizzle schema (sessions, photos, strips, subscriptions)
│   │   │   │   └── index.ts          # Neon serverless HTTP client
│   │   │   ├── routes/               # API route handlers (auth, sessions, photos, strips, library, billing)
│   │   │   ├── security/             # Password hashing (scrypt), session tokens, origin checks
│   │   │   ├── services/             # Polar SDK service and webhook verification
│   │   │   └── handler.ts            # Serverless execution adapter
│   │   └── lib/
│   │       ├── api.ts                # Client API methods
│   │       ├── authContext.tsx       # Member session React context
│   │       ├── billingApi.ts         # Polar checkout & subscription helpers
│   │       ├── libraryApi.ts         # Paginated cursor library helpers
│   │       ├── watermark.ts          # Plan-based export watermarking
│   │       └── constants.ts          # Layouts, filters, stickers, frame colors
│   └── package.json
│
├── backend/                          # Standalone Node.js + Express backend (alternative mode)
│   ├── src/
│   │   ├── db/                       # Neon Postgres client & Drizzle schema
│   │   ├── routes/                   # Standalone Express routes
│   │   ├── security/                 # Auth and security middleware
│   │   └── index.ts                  # Dedicated Express HTTP server entry point
│   └── package.json
│
├── package.json                      # Root workspace scripts
└── README.md
```

---

## ✨ Features

### 1. Five Creative Capture Studios
- **Classic Photo Strip:** Capture multi-shot sequences (2 to 6 shots) formatted into vintage or modern photo strips.
- **Single Portrait Studio:** High-resolution single portrait captures with framing and filter controls.
- **Boomerang Studio:** Continuous burst captures exported as seamless looping animated GIFs.
- **Video Reel Studio:** Multi-second short video clips exported as silent MP4 video reels via browser MediaRecorder and WebCodecs.
- **AI Effect Studio:** Real-time background replacement using MediaPipe selfie segmentation with virtual backdrop presets.

### 2. 23+ Layout Presets Across 5 Categories
- **Classic Strips:** 4-Photo Bookmark Strip, 3-Photo Classic Strip, 2-Shot Minimal Duo, 5-Shot Story Strip, 6-Shot Ultra Strip, Twin Bookmark Strips.
- **Grids & Posters:** Classic 2x2 Grid Collage, Poster 6-Grid (3x2), Wide 6-Grid (2x3), Triple Landscape, Passport ID 4-Grid.
- **Instant & Polaroid:** Single Classic Polaroid, Twin Polaroids, Polaroid Scrapbook Trio, 4 Mini Polaroids.
- **Film & Cinema:** 35mm Film Roll Strip (with sprockets), Cinema Reel Horizontal, Cinema 16:9 Letterbox.
- **Creative & Editorial:** Hero + 3 Thumbnails, Magazine Editorial Sidebar, Concert Ticket Stub (with barcode & notch), 80s Arcade Pixel Strip, K-Booth Pastel Heart Badge.

### 3. Filters, Styling, and Stickers
- **Color & Vintage Filters:** Natural, B&W Film Noir, Vintage Sepia, Neon Cyberpunk, 90s Nostalgia, Golden Hour Warmth, Cool Frost.
- **Frame Customization:** Multiple frame finishes (Midnight, Polaroid White, Vintage Cream, Cyber Pink, Neon Violet, Mint Emerald).
- **Custom Captions:** Live header and footer text customization with timestamp formatting.
- **Interactive Stickers:** Movable, scaleable emoji stickers stamped directly onto strips.

### 4. Export & Sharing Options
- **High-Res Downloads:** Crisp PNG export optimized for devices and printing.
- **Motion Formats:** Infinite GIF loops and MP4 video reels.
- **QR Code Transfer:** Scan a real-time QR code to open and download the keepsake directly on mobile devices.
- **Cloud Keepsakes:** Save directly to Neon Postgres and share via 32-character secure share codes.

### 5. My Library (`/library`)
- Paginated keepsake browsing with opaque, tamper-proof cursor tokens.
- Separate binary media retrieval with owner verification and private headers (`Cache-Control: private, no-store`).
- Session grouping with full original photo downloads.

### 6. Polar.sh Monetization & Plans
- **Free Plan ($0):** Full access to camera, core layouts, and filters with a 24-hour preview watermark.
- **Creator Monthly ($6/mo):** Watermark removal, permanent cloud links, all 23 layouts, and 100 strips per session.
- **Creator Yearly ($59/yr):** All Creator benefits with annual savings (hero plan).
- **Event Pass ($19 one-time):** 3-day full access pass for weddings, parties, and corporate events with high-definition motion exports.
- **Webhook Integration:** Standard Webhooks signature verification via `@polar-sh/sdk` for automated subscription lifecycle updates.

---

## 🚀 Quickstart Guide

### 1. Install Dependencies

In the project root, install all dependencies across workspace packages:

```bash
cd pho2booth
npm install
```

### 2. Configure Neon Serverless Postgres

1. Sign up or log in at [Neon Console](https://console.neon.tech).
2. Create a new Postgres project.
3. Copy your **Pooled connection string**:
   ```text
   postgresql://neondb_owner:YOUR_PASSWORD@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Create a `.env.local` file in the project root (or inside `frontend/`):
   ```env
   DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   NODE_ENV=development
   ```
5. Push the database schema to Neon:
   ```bash
   npm run db:push
   ```

### 3. Run the Development Server

Start the application with a single command:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The frontend UI and serverless backend API will run together on port 3000.

---

## 🌐 Production Deployment (Vercel + Neon)

Pho2Booth deploys directly to **Vercel as a single project** with zero external backend containers.

### Architecture on Vercel
- The Next.js frontend builds via `npm run build --prefix frontend`.
- All API routes under `/api/*` run natively as Vercel Serverless Functions.
- The serverless handler interacts with Neon Postgres over HTTPS using the `@neondatabase/serverless` driver.

### Step-by-Step Deployment

1. **Push your repository** to GitHub, GitLab, or Bitbucket.
2. In the [Vercel Dashboard](https://vercel.com/new), click **Add New Project** and import your repository.
3. Configure project settings:
   - **Root Directory:** Click **Edit** and set to `frontend` (**Required** — Pho2Booth is a monorepo, and Next.js is located in `frontend/`)
   - **Framework Preset:** `Next.js` (automatically detected once Root Directory is set to `frontend`)
4. Add the following **Environment Variables** in Vercel:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection string (`?sslmode=require`) |
| `NODE_ENV` | Yes | Set to `production` (enables secure cookies and CSRF checks) |
| `FRONTEND_URL` | Optional | Custom domains separated by commas (e.g. `https://mybooth.com`) |
| `POLAR_SERVER` | Optional | `sandbox` for testing or `production` for live billing |
| `POLAR_ACCESS_TOKEN` | Optional | Polar personal access token |
| `POLAR_WEBHOOK_SECRET` | Optional | Polar webhook secret for signature verification |
| `POLAR_PRODUCT_CREATOR_MONTHLY` | Optional | Product ID for Creator Monthly |
| `POLAR_PRODUCT_CREATOR_YEARLY` | Optional | Product ID for Creator Yearly |
| `POLAR_PRODUCT_EVENT_PASS` | Optional | Product ID for Event Pass |

5. Click **Deploy**. Vercel will build the frontend and deploy the serverless functions in a single pass.

### Deployment Verification
- **API Health:** Visit `https://<your-project>.vercel.app/api/health` to confirm `{"status":"ok"}`.
- **Camera Access:** Vercel automatically provides HTTPS, allowing `navigator.mediaDevices.getUserMedia` to operate without browser security restrictions.
- **Database Writes:** Take test photos, customize a strip, and click **Save & Share** to verify database persistence.

### Production Troubleshooting
- **`503 SERVICE_UNAVAILABLE`:** `DATABASE_URL` is missing or the database connection failed. Verify the connection string in Vercel settings.
- **`403 ORIGIN_FORBIDDEN`:** The request came from an untrusted origin. Add your custom domain to `FRONTEND_URL`.
- **`413 FUNCTION_PAYLOAD_TOO_LARGE`:** The upload exceeded serverless body limits. The client automatically compresses high-res canvas exports to 1 to 2 MB.

---

## 📡 API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Service and database liveness check | Public |
| `POST` | `/api/sessions` | Create a new booth session | Public |
| `GET` | `/api/sessions` | List verified member's recent sessions | Member |
| `GET` | `/api/sessions/:id` | Session details (originals restricted to owner) | Owner |
| `POST` | `/api/photos` | Store captured raw photo | Session Owner |
| `GET` | `/api/photos/:sessionId` | Retrieve raw photos for session | Member Owner |
| `POST` | `/api/strips` | Persist completed photo strip keepsake | Session Owner |
| `GET` | `/api/strips/:shareCode` | Retrieve unexpired composite strip | Public |
| `POST` | `/api/strips/:shareCode/download` | Increment keepsake download count | Public |
| `GET` | `/api/strips/user/:userId` | Retrieve member gallery | Member Owner |
| `GET` | `/api/library/strips` | Paginated strip metadata | Member Owner |
| `GET` | `/api/library/sessions` | Paginated session metadata | Member Owner |
| `GET` | `/api/library/sessions/:id/photos` | Paginated photos for owned session | Member Owner |
| `GET` | `/api/library/sessions/:id/strips` | Paginated strips for owned session | Member Owner |
| `GET` | `/api/library/photos/:id/media` | Private binary photo stream | Member Owner |
| `GET` | `/api/library/strips/:id/media` | Private binary strip stream | Member Owner |
| `GET` | `/api/auth/session` | Inspect current session and user status | Public |
| `POST` | `/api/auth/signup` | Create member account | Public |
| `POST` | `/api/auth/signin` | Sign in member account | Public |
| `POST` | `/api/auth/logout` | Revoke session and clear cookies | Public |
| `GET` | `/api/billing/plans` | Public pricing plan catalog | Public |
| `GET` | `/api/billing/status` | Current subscription status and limits | Member |
| `POST` | `/api/billing/checkout` | Generate Polar checkout URL | Member |
| `POST` | `/api/billing/portal` | Access Polar customer billing portal | Member |
| `POST` | `/api/billing/webhook` | Process signed Polar billing webhooks | Polar Signature |

---

## 🔒 Security & Access Guardrails

- **Session Authentication:** Member accounts use scrypt password hashing and random session credentials stored as SHA-256 hashes in Postgres. Cookies use `HttpOnly`, `SameSite=Lax`, and `__Host-` prefixes in production.
- **Cross-User Isolation:** Every data access verifies ownership derived from the server session cookie. Tampering with user IDs in requests results in `403` or `404` fail-closed responses.
- **Guest Capabilities:** Guest sessions use temporary capability tokens with a 24-hour expiration window.
- **CSRF & Origin Verification:** State-changing requests (`POST`, `PUT`, `DELETE`) require an uncompressed JSON content type and a verified Origin matching trusted domains or active Vercel deployments.
- **Bounded Payloads:** Strict payload limits are enforced at the edge: 16 MB for photos, 28 MB for composite strips, 1 MB for webhooks, and 16 KB for standard JSON bodies.

---

## 🧪 Testing

Run all automated test suites across frontend and backend:

```bash
npm test
```

You can also run individual suites targeted at specific subsystems:

```bash
# In-process Next.js serverless route tests
npm run test:serverless

# Security guardrails & authentication isolation
npm run test:guardrails

# Library cursor pagination & media streaming
npm run test:library

# Cross-user authorization & tenant isolation
npm run test:isolation

# Polar billing catalog, checkout, & signed webhook processing
npm run test:billing

# GIF and MP4 motion export generation
npm run test:motion

# Frontend auth proxy & cookie security
npm run test:auth --prefix frontend

# Frontend client API error recovery & cancellation
npm run test:api --prefix frontend
```

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React, Canvas Confetti.
- **Vision & Media:** MediaPipe Tasks Vision (`@mediapipe/tasks-vision`), Mediabunny, Modern GIF, QRCode.
- **Backend & API:** Vercel Serverless Functions (`/api/[...path]`), Express 4, Zod, Standard Webhooks.
- **Database & ORM:** Neon Serverless Postgres (`@neondatabase/serverless`), Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Billing & Subscriptions:** Polar.sh SDK (`@polar-sh/sdk`).
