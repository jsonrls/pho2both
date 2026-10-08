# Pho2Booth — Polar-Only Pricing Plan

> Focus: Polar as Merchant of Record. USD + cards. No Stripe, no GCash/Maya in v1.
> Updated: 2026-10-07 (PH seller, payouts via Stripe Connect Express)

## 1. Current State (Free — $0 for everything)

No monetary pricing in the codebase today.

- No `stripe / checkout / subscription / billing / payment / premium / plan` logic.
- `stripe` hits = `candy-stripe / rainbow-stripe` borders. `checkout` = `neon checkout` CLI.
- No billing tables in `backend/src/db/schema.ts` — only `users, auth_sessions, booth_sessions, captured_photos, photo_strips, presets`.

Current gating is auth-based:

| | Guest ($0) | Member ($0, free email) |
|---|---|---|
| Export | Watermarked `PHO2BOOTH • GUEST PREVIEW • EXPIRES IN 24H` — `frontend/src/lib/watermark.ts:19,76` | Clean — `drawWatermark(..., !user)` returns early |
| Link | `expiresAt = now + 24h` — `strips.ts:32`, `resources.ts:47` → `410` after | `expiresAt = null` — permanent |
| Originals | No — `GET /api/photos/:sessionId` needs `requireUser + memberOwns` | Yes, owner-only via cookie |
| Gallery | No — `guestOwnerHash` 24h | Last 20 sessions / 50 strips |
| Session | N/A | 12h HttpOnly SameSite=Lax `__Host-` cookie |

Shared limits: `1-8 photos/session`, `10 strips/session` (`strips.ts:27`), `≤10MB photo / ≤20MB strip`, dev `1000 sessions / 128MB`.

Inventory: 6 formats (`strip, single, collage, gif, video, ai`), 23 layouts, ~40 filters + 17 adjustments, templates `wedding/birthday/corporate/graduation/christmas/minimal/retro/custom`.

## 2. Why Polar-Only Changes the Numbers

### Payouts to PH work
- Polar is MoR, charges customer (US), pays you via Stripe Connect Express. PH is supported.
- No Stripe Payments needed. Individual or business OK. Polar handles US/EU tax. You issue reverse invoice for BIR.
- Reality: 7-day delay (new orgs), manual withdrawal, $10 min, 4-7 days to PH bank.
- Payout fee: `$2/mo + 0.25% + $0.25 + up to 1% FX`. Polar adds $0.

### Fees — why $2.49 fails
- Starter: Free, **5% + $0.50**. Pro $20/mo 3.8% + $0.40 (breakeven ~$1,379/mo). Growth $100/mo 3.6% + $0.35. Scale $400/mo 3.4% + $0.30. +1.5% non-US cards. $15/dispute.

| Price | Fee | Keep |
|---|---|---|
| $2.49 | $0.62 | $1.87 (75%) — unviable |
| $5 | $0.75 | $4.25 — floor |
| $6 | $0.80 | $5.20 |
| $19 | $1.45 | $17.55 (92%) |
| $59 | $3.45 | $55.55 (94%) |

Rule: **min viable on Polar is $5-6**. $299/mo needs white-label/team/API you lack.

### Payment-method gap
- Polar Checkout = cards + Apple/Google Pay only. No GCash/Maya/QRPh.
- So price in USD for global card buyers. Add PayMongo GCash links later if needed.

## 3. Recommended Products (launch 3, build 2 later)
### Product 0 — Free — $0 — no Polar product

Acquisition. Browser booth, camera + upload, 4 layouts `strip-2/3/4, grid-2x2`, 10 core filters, stickers, local PNG always. Guest: watermarked + 24h, 3 sessions / 10 strips. Free member: clean preview, 7-day link, 10/session cap.

### Product 1 — Creator Monthly — $6/mo recurring
### Product 2 — Creator Yearly — $59/yr recurring (HERO)

Same benefits. `$59 = $4.92/mo, ~18% off`. Replaces $2.49/$24.99 (bumped for $0.50 fixed).

- Clean export, permanent links, all 23 layouts, all ~40 filters + 17 adjustments, all event templates, 100 strips, 30-day originals, QR gallery, `downloadCount`, 7-day trial. Push Yearly as hero (Polar auto-reminds on 6mo+ renewals).

### Product 3 — Event Pass — $19 one-time, 3-day access

Same as Creator + video/gif HD + custom header/footer + remove `PHO2BOOTH • 2026` + 1yr retention. Downgrade to Free after 3d, keep downloads. Expect 3:1 over monthly.

### Product 4/5 — Studio $29/mo + $290/yr — BUILD LATER

Only when white-label URLs, 5 active events, Event Codes, surveys/lead capture, seats exist. That justifies Snappic $189-279 / Simple Booth $149-249. Not today.

Launch: Free + $6/$59 + $19. Stay Starter until ~$1,379/mo, then Pro $20/mo. Rejected: $2.49 (keeps $1.87), $299 alone.

## 4. Polar Wiring

Model: `Product = thing sold, Subscription = relationship, Benefit = flag, Order = renewal`.

### Dashboard
1. Currency USD. Create `Creator Monthly ($6)`, `Creator Yearly ($59)`, `Event Pass ($19 one-time)`.
2. Benefits (auto-propagate): `clean_export, permanent_links, all_layouts, video_hd, custom_branding`.
3. Checkout Link with `[Monthly, Yearly]`, `?product_id=...`, `?customer_email=...`, `success_url=/account?checkout_id={CHECKOUT_ID}`, 7d trial override. Use Checkout API later for `metadata: { userId }`.

### Backend (Neon + Drizzle)
- New `subscriptions(userId, polarCustomerId, polarSubscriptionId, plan, status, currentPeriodEnd)` + `users.plan`. Plans: `free | creator_monthly | creator_yearly | event | studio_*`. Status: `active | trialing | past_due | canceled | unpaid`.
- `POST /api/billing/webhook` — Raw format, verify via Polar SDK (Standard Webhooks). Events: `order.created` (Event grant), `subscription.active/updated/canceled/revoked`, `subscription.past_due`.
- Paid = `active OR trialing`. Never trust client `userId` — use session cookie (`app.ts:26 identityMiddleware`) + `customer.externalId`.
- Portal handles cancel/plan/invoices. Don't build billing UI.

### Gate in 3 places
1. `watermark.ts:7` — `drawWatermark(ctx,w,h,scale, plan==='free')`.
2. `resources.ts:47 stripExpiry()` — free 24h/7d vs paid null (event +3d).
3. `strips.ts:27` + `StripCustomizer.tsx` — free 10/session, 4 layouts, 10 filters vs paid 100, all 23, all filters.

Neon guard: base64 `image_data TEXT` 10MB/photo, 20MB/strip. Cap Free (`3 sessions / 10 strips`, 7d) or storage eats the $5.20.

## 5. Next Steps

- [ ] 3 Polar products + 5 benefits + 1 Checkout Link (sandbox: `polar listen localhost:3000/api/billing/webhook` + `polar trigger`)
- [ ] Migration: `subscriptions` + `users.plan` indexed on `userId`
- [ ] Webhook + `getPlan(userId)` + `usePlan()` for `LAYOUTS/FILTERS/OutputFormat`
- [ ] Pricing page: Free vs $6/$59 hero Yearly vs $19, 7d trial, portal link
- [ ] Later: Studio $29/$290; optional PayMongo GCash links for PH volume

