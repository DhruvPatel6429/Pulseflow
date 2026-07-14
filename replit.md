# PulseFlow

AI-powered WhatsApp front desk for solo beauty & wellness businesses in India — handles bookings, reminders, and customer conversations automatically.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 3000 in dev, 8080 in production)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — rebuild lib declarations (run after adding DB schema files)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` — for live WhatsApp (sandbox mode without these)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, base path `/api`)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Wouter + TanStack Query + shadcn/ui (rose gold theme)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Billing & staff (new)

- Razorpay Subscriptions: `artifacts/api-server/src/routes/billing.ts` + `artifacts/pulseflow/src/pages/billing.tsx`
- Razorpay webhook: `POST /api/webhooks/razorpay` in `artifacts/api-server/src/routes/webhooks.ts`
- requireActiveSubscription: `artifacts/api-server/src/middlewares/requireActiveSubscription.ts`
- Staff/team: `lib/db/src/schema/staff.ts`, `artifacts/api-server/src/routes/team.ts`, `artifacts/pulseflow/src/pages/settings-team.tsx`
- requireOwner: `artifacts/api-server/src/middlewares/requireOwner.ts`
- Required secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_STARTER_PLAN_ID`, `RAZORPAY_PRO_PLAN_ID`

## Where things live

- `lib/db/src/schema/` — DB schema: businesses, services, customers, bookings, conversations, messages, ai_action_logs, automation_settings, reminder_jobs
- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/api-client-react/src/generated/` — generated TanStack Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/api-server/src/lib/` — ai-engine.ts, booking-engine.ts, whatsapp.ts
- `artifacts/pulseflow/src/pages/` — all frontend pages
- `artifacts/pulseflow/src/index.css` — theme (rose gold palette)

## Architecture decisions

- **Single-tenant MVP**: DEFAULT_BUSINESS_ID = 1 hardcoded in all routes; multi-tenancy is a future concern
- **WhatsApp sandbox mode**: All WhatsApp sends are logged-only unless `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` env vars are set
- **AI engine is rule-based**: No OpenAI dependency; uses keyword classification with confidence scores; low-confidence messages queue for owner review
- **Booking slots**: 30-minute intervals; duration pulled from service record; conflict detection is in-memory per day
- **Currency**: ₹ (Indian Rupee); timezone: Asia/Kolkata; date format: dd MMM yyyy

## Product

- Onboarding wizard (4 steps: business info, contact/location, working hours, AI settings)
- Dashboard with today's schedule, revenue, and AI action count
- Bookings: create, confirm, complete, cancel, no-show, reschedule, available-slots picker
- Customers: search, visit history, upcoming booking, book-again shortcut
- Services: full CRUD with price/duration/repeat-reminder configuration
- AI Inbox: pending AI action review/approve/edit/reject + WhatsApp conversation view + sandbox simulator
- Automations: configure AI auto-reply threshold, 24h/2h reminders, review requests, repeat reminders
- Settings: business profile, working hours, AI tone, WhatsApp webhook config

## Gotchas

- After adding new schema files to `lib/db/src/schema/`, always run `pnpm run typecheck:libs` before checking api-server — stale declarations will cause false "module has no exported member" errors
- The dynamic import of `reminderJobsTable` was replaced with a static import to avoid TS2339 type errors
- `booking-engine.ts` uses `reminderJobsTable` statically imported from `@workspace/db`
- Frontend uses `apiFetch()` helper (not generated hooks) for simplicity; base URL from `import.meta.env.BASE_URL`
- `pnpm run build` requires `PORT` and `BASE_PATH` env vars (set by workflow); use `typecheck` instead for verification

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
