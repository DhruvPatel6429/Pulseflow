# PulseFlow — AI Front Desk for Beauty & Wellness Salons

PulseFlow is a full-stack SaaS application that gives Indian beauty and wellness salons an AI-powered WhatsApp front desk. It handles customer enquiries, booking requests, appointment reminders, and follow-ups automatically — with the salon owner staying in control via a clean dashboard.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features Implemented](#features-implemented)
- [Database Schema](#database-schema)
- [API Routes](#api-routes)
- [Frontend Pages](#frontend-pages)
- [AI Engine](#ai-engine)
- [WhatsApp Integration](#whatsapp-integration)
- [Automations & Reminders](#automations--reminders)
- [Auth Flow](#auth-flow)
- [Environment Variables](#environment-variables)
- [Replit Setup](#replit-setup)
- [Running Locally (non-Replit)](#running-locally-non-replit)
- [Production Deployment (Replit)](#production-deployment-replit)
- [Drizzle ORM & Database](#drizzle-orm--database)
- [Known Limitations](#known-limitations)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Wouter (routing), TanStack Query |
| **Backend** | Express 5, Node.js, TypeScript (ESM) |
| **Database** | PostgreSQL (Neon serverless), Drizzle ORM |
| **Auth** | Clerk (Replit-managed tenant; Clerk Frontend API proxied for `*.replit.app` compatibility) |
| **AI** | Rule-based intent engine (default) + OpenAI GPT-4o (optional, when `OPENAI_API_KEY` is set) |
| **WhatsApp** | Meta WhatsApp Cloud API (sandbox/log-only mode when credentials are absent) |
| **Monorepo** | pnpm workspaces |
| **Build (API)** | esbuild (via `build.mjs`) — output: `artifacts/api-server/dist/index.mjs` |
| **Build (Frontend)** | Vite — output: `artifacts/pulseflow/dist/public/` (static, served by Replit CDN in production) |

---

## Project Structure

```
/
├── artifacts/
│   ├── api-server/                 # Express backend
│   │   ├── build.mjs               # esbuild bundler script
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point: listen, diagnostics, graceful shutdown
│   │   │   ├── app.ts              # Express app: middleware stack, /api prefix
│   │   │   ├── routes/             # Route handlers (one file per domain)
│   │   │   │   ├── index.ts        # Router assembly (public vs. protected)
│   │   │   │   ├── health.ts       # GET /healthz, GET /ready
│   │   │   │   ├── business.ts     # GET/POST/PATCH /business
│   │   │   │   ├── services.ts     # CRUD /services
│   │   │   │   ├── customers.ts    # CRUD /customers
│   │   │   │   ├── bookings.ts     # Full booking lifecycle
│   │   │   │   ├── conversations.ts# WhatsApp inbox
│   │   │   │   ├── ai.ts           # AI inbox & action approval
│   │   │   │   ├── automation.ts   # Automation settings & templates
│   │   │   │   ├── dashboard.ts    # Stats, today, upcoming
│   │   │   │   ├── jobs.ts         # Reminder job queue (debug/admin)
│   │   │   │   ├── webhooks.ts     # Meta WhatsApp Cloud webhook
│   │   │   │   ├── cron.ts         # Cron trigger for automation processing
│   │   │   │   └── seed.ts         # Demo data seed/wipe
│   │   │   ├── middlewares/
│   │   │   │   ├── requireBusiness.ts  # Clerk auth → businessId resolution
│   │   │   │   ├── timeout.ts          # 15-second request timeout
│   │   │   │   └── errorMiddleware.ts  # Global error handler (JSON responses)
│   │   │   └── lib/
│   │   │       ├── ai/             # Intent classifier, entity extractor, responder
│   │   │       ├── ai-engine.ts    # Orchestrates AI pipeline per inbound message
│   │   │       ├── automation-service.ts  # Job scheduling helpers
│   │   │       ├── booking-engine.ts      # Slot availability & conflict checks
│   │   │       ├── channels/       # WhatsApp channel adapter
│   │   │       ├── logger.ts       # Pino logger instance
│   │   │       ├── templates/      # Message template strings
│   │   │       └── whatsapp.ts     # Meta WhatsApp Cloud API adapter
│   └── pulseflow/                  # React + Vite frontend
│       ├── vite.config.ts          # Vite config (dev proxy → localhost:3000)
│       └── src/
│           ├── pages/              # Full-page route components
│           ├── components/         # Shared UI (shadcn/ui + custom)
│           ├── hooks/              # useAuthGuard, useMobile
│           └── lib/                # apiFetch, formatters, utility helpers
├── lib/
│   ├── db/                         # @workspace/db — shared database package
│   │   ├── drizzle.config.ts       # Drizzle Kit config (reads DATABASE_URL)
│   │   └── src/
│   │       ├── schema/             # One schema file per table
│   │       └── index.ts            # Re-exports tables + pg pool instance
│   ├── api-zod/                    # @workspace/api-zod — shared Zod request schemas
│   ├── api-spec/                   # OpenAPI specification
│   └── api-client-react/           # Generated type-safe React API client
├── scripts/                        # Post-merge and utility scripts
├── .env.example                    # All environment variables documented
└── pnpm-workspace.yaml
```

---

## Features Implemented

### ✅ Multi-step Onboarding
- 4-step wizard: Business details → Contact & Location → Working Hours → AI Personality
- Sets business name, category, owner name, phone, WhatsApp number, city, address, Google Maps link, timezone, working hours (per-day open/close), cancellation policy, preferred AI tone, and Google review link
- On completion: creates business record + seeds 3 starter services (Haircut, Facial, Manicure)
- Fully idempotent — `POST /api/business` rejects duplicates (409) keyed on Clerk `userId`

### ✅ Dashboard
- Today's appointments at a glance
- Revenue metrics (daily / weekly / monthly)
- Upcoming bookings list
- Quick-action buttons

### ✅ Appointment Booking System
- Calendar view of all bookings with date/status filtering
- Create new booking form (`/bookings/new`) with real-time slot availability
- Full booking lifecycle: `pending → confirmed → completed / cancelled / no_show / rescheduled`
- AI-created bookings flagged separately (`created_by_ai`)
- Slot availability engine: 30-minute intervals, respects working hours and existing confirmed bookings

### ✅ Customer CRM
- Customer list with search
- Per-customer: visit count, WhatsApp number, notes, booking history
- Auto-created when a new WhatsApp contact messages the salon

### ✅ Service Menu Management
- Add / edit / delete services
- Fields: name, category, price (₹), duration (minutes), repeat reminder interval (days), consultation flag, token advance flag

### ✅ WhatsApp Inbox
- Unified conversation view for all WhatsApp threads
- AI reply status indicators: auto-replied, pending owner approval, escalated
- Manual reply from the dashboard
- Inbound webhook from Meta normalises messages into internal format

### ✅ AI Engine (Rule-based + optional OpenAI)
- **Intent classification**: `price_inquiry`, `availability_inquiry`, `booking_request`, `reschedule_request`, `cancel_request`, `location_inquiry`
- **Entity extraction**: service name, date phrases ("tomorrow", "next Monday"), time
- **Availability check**: live integration with the booking engine
- **Confidence scoring**: low-confidence or high-stakes intents (cancellation, reschedule) trigger `shouldEscalateToOwner = true`
- **Reply generation**: rule-based templates OR OpenAI GPT-4o when `OPENAI_API_KEY` is present
- **AI action approval flow**: owner approves / rejects AI-suggested booking actions before they execute

### ✅ Automation & Reminder System
- **Booking confirmation**: sent immediately on booking confirmation
- **24-hour reminder**: sent the day before the appointment
- **2-hour reminder**: sent 2 hours before
- **Review request**: sent after appointment completion (configurable delay, default 2 h)
- **Repeat reminder**: if a service has `repeat_reminder_days` set, reminds customer to rebook
- **Missed follow-up**: for no-show appointments, sent 2 h after scheduled time
- All jobs stored in `reminder_jobs` table with `scheduledFor` timestamp
- Idempotent job creation — duplicate triggers are safe
- Per-business toggles to enable/disable each automation type
- Customisable message templates with `{name}`, `{service}`, `{date}`, `{time}` placeholders

### ✅ Demo Seed Data
- `POST /api/seed/demo` — seeds "GlowNest Studio" with realistic customers, services, bookings, and conversations
- `DELETE /api/seed/demo` — wipes all data
- Re-entrant: running seed on an existing business wipes and re-seeds cleanly

### ✅ Authentication
- Clerk auth (email + password + Google OAuth)
- Clerk Frontend API proxied at `/api/__clerk` so auth works on `*.replit.app` subdomains without a custom domain
- `requireBusiness` middleware: resolves Clerk `userId` → `businessId` for every authenticated request; sets `businessId = 0` sentinel for pre-onboarding users instead of crashing
- `useAuthGuard` hook on the frontend redirects unauthenticated users to `/sign-in` and unboarded users to `/onboarding`

### ✅ Health & Observability
- `GET /api/healthz` — returns `{ status: "ok" }` (liveness probe used by Replit health checks)
- `GET /api/ready` — readiness check (DB ping + critical env vars)
- Structured JSON logging via `pino` + `pino-http`
- Request IDs on every request
- Global error handler — maps unhandled errors to clean JSON responses
- 15-second request timeout middleware
- Graceful shutdown on `SIGTERM` / `SIGINT` with 10-second hard timeout

---

## Database Schema

All tables live in the `public` schema on Neon PostgreSQL. Managed by Drizzle ORM (`lib/db`).

| Table | Purpose |
|---|---|
| `businesses` | Core business profile: name, owner, phone, WhatsApp number, working hours (JSONB), AI tone, policies, Clerk user ID |
| `services` | Service menu: name, category, price (numeric), duration (minutes), repeat reminder days, flags |
| `customers` | CRM: name, phone, visit count, notes, last visit date, source |
| `bookings` | Appointments: customer, service, date, start/end time, status, notes, AI-created flag |
| `conversations` | WhatsApp chat threads: one row per customer ↔ business thread; tracks channel, status, last message timestamp |
| `messages` | Individual messages within a conversation: direction (inbound/outbound), content, message type, provider message ID, AI-generated flag, approval-required flag |
| `ai_action_logs` | AI decisions pending owner approval: action type, input/output summary, reply draft, confidence score, status |
| `automation_settings` | Per-business automation toggles, confidence threshold, and custom message templates |
| `reminder_jobs` | Scheduled automation queue: type, `scheduledFor` timestamp, status (`pending`/`sent`/`failed`/`skipped`), JSONB payload |

Schema source: `lib/db/src/schema/` — one TypeScript file per table.

---

## API Routes

All routes are mounted under the `/api` prefix.

### Public (no auth required)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/healthz` | Liveness probe — returns `{ status: "ok" }` |
| `GET` | `/api/ready` | Readiness check (DB + env) |
| `GET` | `/api/webhooks/whatsapp` | Meta webhook verification challenge |
| `POST` | `/api/webhooks/whatsapp` | Receive inbound WhatsApp messages |
| `POST` | `/api/cron/process-automations` | Process due reminder jobs (called by external cron) |
| `POST` | `/api/seed/demo` | Seed GlowNest Studio demo data |
| `DELETE` | `/api/seed/demo` | Wipe all demo data |

### Business (Clerk auth required; `businessId` resolved from session)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/business` | Get own business profile |
| `POST` | `/api/business` | Create business (onboarding step 2) |
| `PATCH` | `/api/business` | Update business profile or AI settings |

### Services

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/services` | List all services |
| `POST` | `/api/services` | Create a service |
| `GET` | `/api/services/:id` | Get service by ID |
| `PATCH` | `/api/services/:id` | Update service |
| `DELETE` | `/api/services/:id` | Delete service |

### Customers

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/customers` | List customers (supports search query param) |
| `POST` | `/api/customers` | Create customer |
| `GET` | `/api/customers/:id` | Get customer with booking history |
| `PATCH` | `/api/customers/:id` | Update customer |

### Bookings

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bookings/available-slots` | Available 30-minute slots for a service+date |
| `GET` | `/api/bookings` | List bookings (filterable by date, status, serviceId, customerId, from, to) |
| `POST` | `/api/bookings` | Create booking (auto-creates customer if new phone number) |
| `GET` | `/api/bookings/:id` | Get booking with enriched service + customer |
| `PATCH` | `/api/bookings/:id` | Update booking fields |
| `POST` | `/api/bookings/:id/confirm` | Confirm → schedules 24h + 2h + confirmation automations |
| `POST` | `/api/bookings/:id/cancel` | Cancel → cancels pending reminder jobs |
| `POST` | `/api/bookings/:id/complete` | Complete → updates customer visit count, schedules review request |
| `POST` | `/api/bookings/:id/no-show` | Mark no-show → schedules missed follow-up |
| `POST` | `/api/bookings/:id/reschedule` | Reschedule (checks slot conflict, updates times) |

### Conversations & Inbox

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/conversations` | List all WhatsApp conversations |
| `GET` | `/api/conversations/:id` | Get conversation with messages |
| `POST` | `/api/conversations/:id/send` | Send a manual WhatsApp message |

### AI Actions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ai/inbox` | AI-flagged actions awaiting owner approval |
| `POST` | `/api/ai/process` | Manually trigger AI processing on a message |
| `POST` | `/api/ai/actions/:id/approve` | Approve AI-suggested booking action |
| `POST` | `/api/ai/actions/:id/reject` | Reject AI-suggested booking action |

### Automations

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/automation` | Get automation settings + templates for this business |
| `PATCH` | `/api/automation` | Update toggles, thresholds, or message templates |

### Dashboard

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Revenue and booking counts (daily/weekly/monthly) |
| `GET` | `/api/dashboard/today` | Today's appointments |
| `GET` | `/api/dashboard/upcoming` | Next upcoming bookings |

### Jobs (admin/debug)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/jobs` | View reminder job queue |
| `POST` | `/api/jobs/:id/trigger` | Manually trigger a specific reminder job |

---

## Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Metrics, today's agenda, quick actions |
| `/inbox` | Inbox | WhatsApp conversations with AI status badges |
| `/bookings` | Bookings | Filterable list of all appointments |
| `/bookings/new` | New Booking | Appointment creation form with live slot picker |
| `/customers` | Customers | CRM list with visit history |
| `/services` | Services | Service menu management |
| `/automations` | Automations | Toggle and customise reminder messages |
| `/settings` | Settings | Business profile + AI tone |
| `/onboarding` | Onboarding | 4-step first-time setup wizard |
| `/sign-in` | Sign In | Clerk sign-in (email + Google OAuth) |
| `/sign-up` | Sign Up | Clerk sign-up (email + Google OAuth) |

---

## AI Engine

Located in `artifacts/api-server/src/lib/ai/` and `src/lib/ai-engine.ts`.

**Flow for every inbound WhatsApp message:**
1. Message stored in `conversations` table
2. AI engine called via `processInbound()`
3. Intent classifier scores the message against known intents
4. Entity extractor pulls service name, date, time from message text
5. If `booking_request` or `availability_inquiry`: booking engine checks real-time slot availability
6. Responder generates a reply using templates or OpenAI GPT-4o
7. If confidence is low or intent is `cancel_request` / `reschedule_request`: `shouldEscalateToOwner = true` → creates an `ai_action_logs` entry visible in the AI Inbox
8. Otherwise: reply is sent automatically via the WhatsApp channel

**OpenAI mode** (requires `OPENAI_API_KEY`): passes business context (name, services, hours, tone) + conversation history to GPT-4o for natural language responses.

**Rule-based mode** (default): uses pre-written templates in `artifacts/api-server/src/lib/templates/`, substituting `{name}`, `{service}`, `{date}`, `{time}` placeholders.

---

## WhatsApp Integration

Located in `artifacts/api-server/src/lib/whatsapp.ts` and `src/lib/channels/`.

**Live mode** (requires `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`):
1. Sends messages via Meta WhatsApp Cloud API
2. Webhook at `GET /api/webhooks/whatsapp` handles Meta's hub verification challenge
3. Webhook at `POST /api/webhooks/whatsapp` receives inbound messages
4. Set `WHATSAPP_VERIFY_TOKEN` in business settings to match the token configured in the Meta App Dashboard

**Sandbox/mock mode** (default when credentials are absent):
- All outbound messages are logged to the server console only — no real messages sent
- Safe to develop and demo without a WhatsApp Business account

---

## Automations & Reminders

Located in `artifacts/api-server/src/lib/automation-service.ts`.

**Job types and when they're scheduled:**

| Automation | Trigger | Sends at |
|---|---|---|
| `confirmation` | Booking confirmed | Immediately |
| `reminder_24h` | Booking confirmed | 24 h before appointment start |
| `reminder_2h` | Booking confirmed | 2 h before appointment start |
| `review_request` | Booking completed | `reviewRequestDelayHours` after completion (default: 2 h) |
| `repeat_reminder` | Booking completed | `service.repeat_reminder_days` days after completion |
| `missed_followup` | Booking marked no-show | 2 h after scheduled appointment time |

Jobs are stored in `reminder_jobs` and processed by `POST /api/cron/process-automations`. This endpoint should be called by an external cron service (e.g. cron-job.org, GitHub Actions, or a serverless scheduler) every **5 minutes**. Each automation type can be toggled per-business from the Automations page.

---

## Auth Flow

1. User signs up / signs in via Clerk (`/sign-in`, `/sign-up`)
2. Clerk session cookie is attached to all `/api` requests
3. `clerkMiddleware` (from `@clerk/express`) validates the session on every request
4. `requireBusiness` middleware resolves `clerkUserId → businessId` using a raw pg pool query (Drizzle parameterised query compatibility with Neon):
   - If no business record found: sets `req.businessId = 0` (onboarding sentinel) — does **not** crash
   - If business found: sets `req.businessId = business.id`
5. Route handlers use `req.businessId` to scope all DB queries to the correct tenant
6. `useAuthGuard` hook on the frontend redirects unauthenticated users to `/sign-in` and unboarded users to `/onboarding`

---

## Environment Variables

### Required

| Variable | Where to set on Replit | Description |
|---|---|---|
| `DATABASE_URL` | Replit Secrets panel | PostgreSQL connection string — `postgresql://user:pass@host/db?sslmode=require` |
| `CLERK_SECRET_KEY` | Replit Secrets panel | Clerk backend secret key (`sk_test_...` or `sk_live_...`) |
| `CLERK_PUBLISHABLE_KEY` | `.replit` → `[userenv]` | Clerk publishable key (`pk_test_...`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | `.replit` → `[userenv]` | Same value as above — exposed to Vite frontend |

### Security secrets (required in production; optional in development)

| Variable | Description |
|---|---|
| `CRON_SECRET` | Bearer token that protects `POST /api/cron/process-automations`. **In production, the route returns 403 if this is unset.** In development, the route is open when the variable is absent. Pass as `Authorization: Bearer <value>`. Generate with `openssl rand -hex 32`. |
| `SEED_SECRET` | Bearer token that protects `POST /api/seed/demo` and `DELETE /api/seed/demo`. Same fail-closed production behaviour as `CRON_SECRET`. |

### Optional (app degrades gracefully without these)

| Variable | Default behaviour when absent |
|---|---|
| `OPENAI_API_KEY` | Falls back to rule-based AI replies — fully functional |
| `WHATSAPP_ACCESS_TOKEN` | Sandbox mode — messages logged to console, not sent |
| `WHATSAPP_PHONE_NUMBER_ID` | Sandbox mode |
| `WHATSAPP_VERIFY_TOKEN` | Webhook hub verification will reject Meta's challenge |
| `LOG_LEVEL` | Defaults to `info` (options: `trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `VITE_CLERK_PROXY_URL` | Needed only in Replit production deployment (set automatically) |
| `RATE_LIMIT_MAX` | Max requests per IP per minute across all `/api` routes. Defaults to `100`. Raise if Meta webhook deliveries are throttled. |

### Managed automatically (do not set manually)

| Variable | Set by |
|---|---|
| `PORT` | Replit artifact workflow (3000 in dev, 8080 in production) |
| `BASE_PATH` | Replit artifact workflow |
| `NODE_ENV` | Replit artifact workflow (`development` in dev, `production` in prod) |

---

## Replit Setup

This project is designed to run on Replit with managed artifact workflows.

### First-time setup

1. **Secrets** — in the Replit Secrets panel, add:
   - `DATABASE_URL` — your Neon connection string (e.g. `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)
   - `CLERK_SECRET_KEY` — from your Clerk dashboard → API Keys

2. **Push the database schema**:
   ```bash
   pnpm --filter @workspace/db run push
   ```
   This creates all tables on your Neon database. Safe to re-run.

3. **Start workflows** — the following managed workflows start automatically:
   - `artifacts/api-server: API Server` — runs `pnpm build && pnpm start` on port 3000
   - `artifacts/pulseflow: web` — runs Vite dev server on port 5173

4. **Seed demo data** (optional):
   ```bash
   curl -X POST http://localhost:3000/api/seed/demo
   ```

### Workflow display note

The **API Server** workflow shows `FINISHED` in the Replit workflow panel even while the server is live. This is a display artefact of the `build && start` chain script — the `node` process remains running and the `/api/healthz` endpoint confirms liveness. The workflow restarts cleanly when triggered.

---

## Running Locally (non-Replit)

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY

# Push DB schema to your Neon database
pnpm --filter @workspace/db run push

# TypeScript check (all packages)
pnpm run typecheck

# Start API server (port 3000)
pnpm --filter @workspace/api-server run dev

# Start frontend in a separate terminal (port 5173)
pnpm --filter @workspace/pulseflow run dev
```

The frontend Vite dev server proxies `/api/*` and `/api/__clerk/*` to `localhost:3000` automatically.

---

## Production Deployment (Replit)

Replit handles production deployment via the artifact configuration in `artifact.toml`.

**API server** (`artifacts/api-server`):
- Build step: `pnpm --filter @workspace/api-server run build` (esbuild → `dist/index.mjs`)
- Run: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- Port: **8080** (set via `PORT` env var)
- Health check: `GET /api/healthz`

**Frontend** (`artifacts/pulseflow`):
- Build step: `pnpm --filter @workspace/pulseflow run build` (Vite → `dist/public/`)
- Served as **static files** from `artifacts/pulseflow/dist/public/` via Replit's CDN
- SPA fallback: all `/*` requests rewrite to `/index.html`

**Pre-deployment checklist:**
1. Run `pnpm run typecheck` — must pass with zero errors
2. Run `pnpm --filter @workspace/api-server run build` — must succeed
3. Run `pnpm --filter @workspace/pulseflow run build` — must succeed
4. Confirm `GET /api/healthz` returns `{ status: "ok" }`
5. Set `VITE_CLERK_PROXY_URL` in production environment secrets (Replit injects this automatically for managed Clerk instances)
6. Set up an external cron trigger to `POST /api/cron/process-automations` every 5 minutes for automation delivery

---

## Billing (Razorpay Subscriptions)

Every new business gets a **14-day free trial** on signup. After the trial, salon owners must subscribe to continue using core features (bookings, AI inbox, automations).

**Plans:**
| Plan | Price | Staff logins |
|---|---|---|
| Starter | ₹999/month | 1 |
| Pro | ₹2499/month | Up to 5 |

**Setup:**
1. Create plans in the Razorpay Dashboard → Subscriptions → Plans
2. Set environment secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_STARTER_PLAN_ID`, `RAZORPAY_PRO_PLAN_ID`
3. Configure Razorpay webhook to `POST /api/webhooks/razorpay`

**Routes:** `GET /api/billing/subscription`, `POST /api/billing/checkout`, `POST /api/billing/cancel`, `POST /api/webhooks/razorpay`

---

## Staff & Team Access

Owners can invite staff members from **Settings → Team** or the `/billing` page. Staff can access bookings, AI inbox, and customers — but not billing or team management.

**Role model:**
- `owner` — full access including `/billing`, `/settings/team`, and destructive actions (delete service, remove staff)
- `staff` — access to bookings, inbox, customers, dashboard only

**Invitation flow:** Owner invites by email → Clerk sends invite → staff member signs up → their clerkUserId is auto-linked on first sign-in.

**Staff limit** is enforced per plan (1 for Starter, 5 for Pro).

**Routes:** `GET /api/team`, `GET /api/team/my-role`, `POST /api/team/invite`, `DELETE /api/team/:id`

---

## Drizzle ORM & Database

Schema lives in `lib/db/src/schema/`. The project now uses **drizzle-kit generate + migrate** for a safe, reviewable migration history. An initial migration (`lib/db/migrations/0000_*.sql`) captures the full schema as of the first production-ready release.

**Workflow for all schema changes once real customer data exists:**

```bash
# 1. Edit schema files in lib/db/src/schema/
# 2. Generate a migration file (review before applying!)
pnpm --filter @workspace/db run generate

# 3. Apply the migration to the database
pnpm --filter @workspace/db run migrate

# 4. TypeScript check libs after schema changes
pnpm run typecheck:libs
```

> ⚠️ **Never use `drizzle-kit push` once real customer data exists.** Push syncs directly without a migration log — destructive changes (dropping columns, renaming tables) happen immediately and cannot be rolled back automatically. Use `generate` + review + `migrate` instead.

> **Important:** After adding or modifying schema files, always run `pnpm run typecheck:libs` before running `pnpm -r run typecheck`. The lib typecheck must complete first for the API server's TypeScript build to resolve shared types correctly.

---

## Known Limitations

| Area | Limitation |
|---|---|
| **WhatsApp** | Requires a verified Meta Business account and an approved WhatsApp Business number. Sandbox mode works for development and demo but sends no real messages. |
| **OpenAI AI replies** | Without `OPENAI_API_KEY`, the AI falls back to rule-based keyword templates. These cover common intents but will not handle free-form or ambiguous messages gracefully. |
| **Bundle size** | The frontend JS bundle is ~568 kB minified / 168 kB gzip. Vite warns about this. Code-splitting (dynamic imports) would reduce initial load time. |
| **Timezone handling** | Working hours are stored as plain `HH:MM` strings interpreted in the business's configured timezone. The slot engine does not yet account for DST transitions. |
| **Cron auth** | `POST /api/cron/process-automations` requires `CRON_SECRET` Bearer token in all environments (fails 403 if unset). Set `CRON_SECRET` in secrets before enabling automation delivery. |
