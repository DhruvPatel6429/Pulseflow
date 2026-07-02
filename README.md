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
- [Running Locally](#running-locally)
- [Drizzle ORM & Database](#drizzle-orm--database)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Wouter (routing), TanStack Query |
| **Backend** | Express 5, Node.js, TypeScript (ESM) |
| **Database** | PostgreSQL (Neon serverless), Drizzle ORM |
| **Auth** | Clerk (external instance, Clerk Frontend API proxied for `.replit.app` compatibility) |
| **AI** | Rule-based intent engine (default) + OpenAI GPT-4o (optional, when `OPENAI_API_KEY` is set) |
| **WhatsApp** | Meta WhatsApp Cloud API (sandbox/log-only mode when credentials are absent) |
| **Monorepo** | pnpm workspaces |

---

## Project Structure

```
/
├── artifacts/
│   ├── api-server/          # Express backend (port 3000 dev, 8080 prod)
│   │   └── src/
│   │       ├── routes/      # All API route handlers
│   │       ├── middlewares/ # Clerk auth, business context, error handling
│   │       └── lib/         # AI engine, booking engine, WhatsApp, automations
│   └── pulseflow/           # React + Vite frontend
│       └── src/
│           ├── pages/       # Full-page views
│           ├── components/  # Shared UI (shadcn/ui + custom)
│           ├── hooks/       # useAuthGuard, useMobile
│           └── lib/         # apiFetch, formatters, utilities
├── lib/
│   ├── db/                  # Drizzle schema, drizzle.config.ts, pg Pool
│   ├── api-zod/             # Shared Zod request/response schemas
│   ├── api-spec/            # OpenAPI spec
│   └── api-client-react/    # Generated type-safe API client
└── .env.example             # All environment variables documented
```

---

## Features Implemented

### ✅ Multi-step Onboarding
- 4-step wizard: Business details → Contact & Location → Working Hours → AI Personality
- Sets business name, category, owner name, phone, WhatsApp number, city, address, Google Maps link, timezone, working hours (per-day open/close), cancellation policy, preferred AI tone, and Google review link
- On completion: creates business record + seeds 3 starter services (Haircut, Facial, Manicure)
- Fully idempotent — `POST /api/business` rejects duplicates (409) using the Clerk session, not a hardcoded ID

### ✅ Dashboard
- Today's appointments at a glance
- Revenue metrics (daily / weekly / monthly)
- Upcoming bookings list
- Quick-action buttons

### ✅ Appointment Booking System
- Calendar view of all bookings
- Create new booking form (`/bookings/new`)
- Full booking lifecycle: `pending → confirmed → completed / cancelled / no_show / rescheduled`
- AI-created bookings flagged separately (`created_by_ai`)
- Slot availability engine: 30-minute intervals, respects working hours and existing confirmed bookings

### ✅ Customer CRM
- Customer list with search
- Per-customer: visit count, WhatsApp number, notes
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
- **24-hour reminder**: sent the day before the appointment
- **2-hour reminder**: sent 2 hours before
- **Booking confirmation**: sent immediately on booking confirmation
- **Review request**: sent after appointment completion
- **Repeat reminder**: if a service has `repeat_reminder_days` set, reminds customer to rebook
- **Missed follow-up**: for no-show appointments
- All jobs stored in `reminder_jobs` table with `scheduledFor` timestamp
- Idempotent job creation — duplicate triggers are safe
- Business-level toggles to enable/disable each automation type
- Customisable message templates with `{name}`, `{service}`, `{date}`, `{time}` placeholders

### ✅ Demo Seed Data
- `POST /api/seed/demo` — seeds "GlowNest Studio" with realistic customers, services, bookings, and conversations
- `DELETE /api/seed/demo` — wipes all data
- Re-entrant: running seed on an existing business wipes and re-seeds cleanly

### ✅ Authentication
- Clerk auth (email + password + Google OAuth)
- Clerk Frontend API proxied at `/api/__clerk` so auth works on `*.replit.app` subdomains without a custom domain
- `requireBusiness` middleware: resolves Clerk `userId` → `businessId` for every authenticated request; sets `businessId = 0` sentinel for pre-onboarding users instead of crashing
- `requireAuth` utility available for routes that only need the Clerk user identity

### ✅ Health & Observability
- `GET /api/healthz` — returns `{ status: "ok" }` (used by production health checks)
- `GET /api/ready` — full readiness check (DB ping + critical env vars)
- Structured JSON logging via `pino` + `pino-http`
- Request IDs on every request
- Global error handler — maps unhandled errors to clean JSON responses
- 15-second request timeout middleware

---

## Database Schema

All tables live in the `public` schema on Neon PostgreSQL. Managed by Drizzle ORM (`lib/db`).

| Table | Purpose |
|---|---|
| `businesses` | Core business profile: name, owner, phone, WhatsApp number, working hours (JSONB), AI tone, policies, Clerk user ID |
| `services` | Service menu: name, category, price (numeric), duration, repeat reminder days, flags |
| `customers` | CRM: name, phone, WhatsApp number, visit count, notes, last visit date |
| `bookings` | Appointments: customer, service, date, time, status, notes, AI-created flag |
| `conversations` | WhatsApp chat threads: customer ↔ business, AI status, last message preview |
| `messages` | Individual messages: direction (inbound/outbound), content, AI-generated flag, timestamp |
| `ai_action_logs` | AI decisions pending owner approval: suggested action, confidence, status (pending/approved/rejected) |
| `automation_settings` | Per-business automation toggles and custom message templates |
| `reminder_jobs` | Scheduled automation queue: type, scheduledFor, status (pending/sent/failed/skipped), bookingId |

---

## API Routes

### Public (no auth)
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/healthz` | Liveness check |
| `GET` | `/api/ready` | Readiness check (DB + env) |
| `GET/POST` | `/api/webhooks/whatsapp` | Meta WhatsApp Cloud API webhook |
| `POST` | `/api/cron/process-automations` | Trigger due reminder jobs (called by cron) |
| `POST` | `/api/seed/demo` | Seed GlowNest Studio demo data |
| `DELETE` | `/api/seed/demo` | Wipe all demo data |

### Business (Clerk auth required; `businessId` resolved from session)
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/business` | Get own business profile |
| `POST` | `/api/business` | Create business (onboarding step) |
| `PATCH` | `/api/business` | Update business profile |

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
| `GET` | `/api/customers` | List customers |
| `POST` | `/api/customers` | Create customer |
| `GET` | `/api/customers/:id` | Get customer |
| `PATCH` | `/api/customers/:id` | Update customer |

### Bookings
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bookings` | List bookings (filterable by date/status) |
| `POST` | `/api/bookings` | Create booking |
| `GET` | `/api/bookings/:id` | Get booking |
| `PATCH` | `/api/bookings/:id` | Update booking |
| `POST` | `/api/bookings/:id/confirm` | Confirm → schedules reminder chain |
| `POST` | `/api/bookings/:id/cancel` | Cancel booking |
| `POST` | `/api/bookings/:id/complete` | Complete → schedules review request |
| `POST` | `/api/bookings/:id/no-show` | Mark no-show → schedules follow-up |
| `POST` | `/api/bookings/:id/reschedule` | Reschedule booking |

### Conversations & Inbox
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/conversations` | List conversations |
| `GET` | `/api/conversations/:id` | Get conversation + messages |
| `POST` | `/api/conversations/:id/send` | Send manual WhatsApp message |

### AI Actions
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ai/inbox` | AI-flagged actions awaiting approval |
| `POST` | `/api/ai/process` | Manually trigger AI on a message |
| `POST` | `/api/ai/actions/:id/approve` | Approve AI booking action |
| `POST` | `/api/ai/actions/:id/reject` | Reject AI booking action |

### Automations
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/automation` | Get automation settings + templates |
| `PATCH` | `/api/automation` | Update toggles / templates |

### Dashboard
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Revenue + booking counts |
| `GET` | `/api/dashboard/today` | Today's appointments |
| `GET` | `/api/dashboard/upcoming` | Upcoming bookings |

### Jobs (debug/admin)
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/jobs` | View job queue |
| `POST` | `/api/jobs/:id/trigger` | Manually trigger a specific job |

---

## Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Metrics, today's agenda, quick actions |
| `/inbox` | Inbox | WhatsApp conversations with AI status badges |
| `/bookings` | Bookings | Calendar view of all appointments |
| `/bookings/new` | New Booking | Appointment creation form |
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
1. Message stored in `messages` table
2. AI engine called via `processInbound()`
3. Intent classifier (`classifier.ts`) scores the message against known intents
4. Entity extractor pulls service name, date, time from message text
5. If `booking_request` or `availability_inquiry`: booking engine checks real-time slot availability
6. Responder generates a reply using templates or OpenAI GPT-4o
7. If confidence is low or intent is `cancel_request` / `reschedule_request`: `shouldEscalateToOwner = true` → creates an `ai_action_logs` entry and notifies the dashboard
8. Otherwise: reply is sent automatically via WhatsApp channel

**OpenAI mode** (requires `OPENAI_API_KEY`): passes business context (name, services, hours, tone) + conversation history to GPT-4o for natural language responses.

**Rule-based mode** (default): uses pre-written templates in `message-templates.ts`, substituting `{name}`, `{service}`, `{date}`, `{time}` placeholders.

---

## WhatsApp Integration

Located in `artifacts/api-server/src/lib/whatsapp.ts` and `src/lib/channels/`.

**Real mode** (requires `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`):
- Sends messages via Meta WhatsApp Cloud API
- Webhook at `GET /api/webhooks/whatsapp` handles Meta's verification challenge
- Webhook at `POST /api/webhooks/whatsapp` receives inbound messages

**Sandbox/mock mode** (default when credentials absent):
- All outbound messages are logged to the console only — no real messages sent
- Inbound messages can be simulated via `POST /api/sandbox/send-message`
- Safe to develop and demo without a WhatsApp Business account

---

## Automations & Reminders

Located in `artifacts/api-server/src/lib/automation-service.ts` and `src/lib/automations/`.

**Job types and when they're scheduled:**

| Automation | Trigger | Sends after |
|---|---|---|
| `confirmation` | Booking confirmed | Immediately |
| `reminder_24h` | Booking confirmed | 24 h before appointment |
| `reminder_2h` | Booking confirmed | 2 h before appointment |
| `review_request` | Booking completed | 1 h after completion |
| `repeat_reminder` | Booking completed | `service.repeat_reminder_days` days later |
| `missed_followup` | Booking marked no-show | 2 h after scheduled time |

Jobs are stored in `reminder_jobs` and processed by `POST /api/cron/process-automations` (meant to be called by an external cron trigger every 5 minutes). Each automation type can be toggled per-business in the Automations page.

---

## Auth Flow

1. User signs up / signs in via Clerk (`/sign-in`, `/sign-up`)
2. Clerk session cookie is attached to all `/api` requests
3. `clerkMiddleware` (from `@clerk/express`) validates the session on every request
4. `requireBusiness` middleware resolves `clerkUserId → businessId`:
   - If no business record found: sets `req.businessId = 0` (onboarding sentinel) — **does not crash**
   - If business found: sets `req.businessId = business.id`
5. Route handlers use `req.businessId` to scope all DB queries to the correct tenant
6. `useAuthGuard` hook on the frontend redirects unauthenticated users to `/sign-in` and unboarded users to `/onboarding`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string — `postgresql://user:pass@host/db?sslmode=require` |
| `CLERK_SECRET_KEY` | Clerk backend secret key (`sk_test_...` or `sk_live_...`) |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...` or `pk_live_...`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same value as above — exposed to the Vite frontend |

### Optional (app degrades gracefully without these)

| Variable | Default behaviour when absent |
|---|---|
| `OPENAI_API_KEY` | Falls back to rule-based AI replies |
| `WHATSAPP_ACCESS_TOKEN` | Sandbox mode — messages logged only, not sent |
| `WHATSAPP_PHONE_NUMBER_ID` | Sandbox mode |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification disabled |
| `LOG_LEVEL` | Defaults to `info` |
| `VITE_CLERK_PROXY_URL` | Required only in Replit production deployment |

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Copy and fill in env vars
cp .env.example .env

# Push DB schema to your Neon database
pnpm --filter @workspace/db run push

# Start API server (port 3000)
pnpm --filter @workspace/api-server run dev

# Start frontend (separate terminal)
pnpm --filter @workspace/pulseflow run dev
```

The frontend Vite dev server proxies `/api/*` requests to `localhost:3000`.

---

## Drizzle ORM & Database

Schema lives in `lib/db/src/schema/`. To make schema changes:

```bash
# Edit the schema files in lib/db/src/schema/

# Preview what will change
pnpm --filter @workspace/db run push --dry-run

# Apply changes to the database
pnpm --filter @workspace/db run push

# Force push (skips safety prompts — use with care)
pnpm --filter @workspace/db run push-force
```

> **Note:** This project uses `drizzle-kit push` (direct schema push), not migration files. This is appropriate for early-stage development. For production, consider switching to `drizzle-kit generate` + `drizzle-kit migrate` for a proper migration history.

---

## Single-Tenant Architecture (Current)

The current implementation is **single-tenant per Clerk user**: each authenticated user maps to exactly one `businesses` row. The `DEFAULT_BUSINESS_ID` constant (value: `1`) exists only in the demo seed route and should not be used in production business logic — all route handlers resolve `businessId` from the authenticated Clerk session.
