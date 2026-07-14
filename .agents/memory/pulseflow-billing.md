---
name: PulseFlow billing (Razorpay)
description: How the Razorpay subscription billing system is wired — middleware, webhook, frontend redirect
---

## Subscription flow

1. New business created → `POST /business` auto-provisions a 14-day trial subscription row (plan=trial, status=trialing, currentPeriodEnd=now+14d)
2. Owner visits `/billing` → selects Starter (₹999/mo, 1 staff) or Pro (₹2499/mo, 5 staff)
3. `POST /api/billing/checkout` creates a Razorpay subscription, returns `{subscriptionId, keyId}`
4. Frontend loads Razorpay checkout.js dynamically and opens the modal
5. After payment, Razorpay sends `POST /api/webhooks/razorpay` — signature verified with HMAC-SHA256 using RAZORPAY_WEBHOOK_SECRET
6. Webhook updates `subscriptions` table (status=active, plan=starter/pro, currentPeriodEnd from charge_at)

## Middleware

`requireActiveSubscription` runs after `requireBusiness` on all core routes (services, customers, bookings, conversations, AI, automation, jobs, dashboard). Returns 402 with `{error: "trial_expired"|"subscription_inactive"}`.

Billing and team routes are NOT behind requireActiveSubscription (owners must reach /billing when expired).

## Frontend 402 redirect

`QueryClient` uses `QueryCache` with a global `onError` handler. When any query returns a 402 (`ApiFetchError.status === 402`), `_redirectToBilling()` fires (module-level ref set in AppGuard's useEffect). Retry is suppressed for 402 errors.

## Required env vars

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — Razorpay API keys
- `RAZORPAY_WEBHOOK_SECRET` — for signature verification
- `RAZORPAY_STARTER_PLAN_ID`, `RAZORPAY_PRO_PLAN_ID` — pre-created in Razorpay Dashboard

**Why:** rawBody is captured in app.ts via express.json `verify` callback so the webhook handler can verify the HMAC signature.
