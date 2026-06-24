# PulseFlow — Documentation

AI-powered WhatsApp front desk for solo beauty & wellness businesses in India. Handles bookings, reminders, review requests, and customer conversations automatically.

---

## Table of Contents

1. [What PulseFlow Does](#what-pulseflow-does)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [AI Engine](#ai-engine)
7. [Automation Engine](#automation-engine)
8. [WhatsApp Integration](#whatsapp-integration)
9. [Environment Variables](#environment-variables)
10. [Running Locally](#running-locally)
11. [Demo Mode](#demo-mode)
12. [Frontend Pages](#frontend-pages)
13. [Going to Production](#going-to-production)
14. [Connecting WhatsApp Cloud API](#connecting-whatsapp-cloud-api)
15. [Swapping Mock Automation for Real Job Infrastructure](#swapping-mock-automation-for-real-job-infrastructure)
16. [Architecture Decisions & Tradeoffs](#architecture-decisions--tradeoffs)

---

## What PulseFlow Does

A beauty salon owner in India gets dozens of WhatsApp messages daily asking:
- "How much is a haircut?"
- "Can I book tomorrow at 11am?"
- "Please reschedule my facial"

PulseFlow connects to their WhatsApp Business number and:

1. **Classifies intent** — price query, booking request, reschedule, location, etc.
2. **Replies automatically** when confidence is high — or queues for owner approval when uncertain
3. **Creates bookings** in the calendar and checks for slot conflicts
4. **Schedules reminders** — confirmation now, 24h before, 2h before
5. **Sends review requests** after service completion
6. **Sends repeat-visit nudges** based on each service's rebooking interval (e.g. "It's been 30 days since your facial — want to book again?")

The owner sees everything in a clean dashboard: today's schedule, revenue, pending AI actions, and customer history.

---

## Architecture Overview

```
Customer WhatsApp message
        │
        ▼
WhatsApp Cloud API webhook
        │
        ▼
POST /api/webhooks/whatsapp
        │
        ▼
processInboundCustomerMessage()
  ├── find or create Customer
  ├── load Business context
  ├── AI intent classifier (keyword + pattern matching)
  │     ├── confidence ≥ threshold → auto-reply + log
  │     └── confidence < threshold → queue for owner review
  ├── if booking_request → check availability → create Booking
  ├── if booking created → scheduleBookingAutomations()
  └── log AiActionLog entry
        │
        ▼
Owner Dashboard (React SPA)
  ├── AI Inbox: pending action review, approve/edit/reject
  ├── Dashboard: today's schedule, revenue, stats
  ├── Bookings: full CRUD with status transitions
  ├── Customers: history, visit count, book-again
  ├── Services: CRUD with repeat reminder config
  ├── Automations: toggle reminders, AI threshold, job runner
  └── Settings: business profile, working hours, WhatsApp config
        │
        ▼
Automation Job Runner (POST /api/cron/process-automations)
  ├── confirmation — sent immediately on booking
  ├── reminder_24h — 24h before appointment
  ├── reminder_2h — 2h before appointment
  ├── review_request — X hours after completion
  └── repeat_reminder — N days after completion (per service)
```

**Single-tenant MVP**: one installation = one business. `DEFAULT_BUSINESS_ID = 1` is hardcoded in all routes. Multi-tenancy is a planned future upgrade.

**WhatsApp sandbox mode**: if `WHATSAPP_ACCESS_TOKEN` is not set, all outbound messages are logged only — no real API calls. The app is fully functional for demo and development without WhatsApp credentials.

---

## Project Structure

```
/
├── artifacts/
│   ├── api-server/              # Express 5 API (port 8080, base path /api)
│   │   └── src/
│   │       ├── index.ts         # Server entry point, pino-http middleware
│   │       ├── routes/
│   │       │   ├── index.ts     # All routers registered here
│   │       │   ├── health.ts    # GET /api/healthz
│   │       │   ├── business.ts  # Business profile CRUD
│   │       │   ├── services.ts  # Services CRUD
│   │       │   ├── customers.ts # Customers CRUD + history
│   │       │   ├── bookings.ts  # Bookings CRUD + status transitions + slots
│   │       │   ├── conversations.ts  # Conversations + message threads
│   │       │   ├── ai.ts        # AI inbox, approve/reject, sandbox simulate
│   │       │   ├── automation.ts  # Automation settings GET/PUT
│   │       │   ├── jobs.ts      # Reminder jobs list
│   │       │   ├── dashboard.ts # Stats, today's schedule, upcoming
│   │       │   ├── webhooks.ts  # WhatsApp Cloud API webhook handler
│   │       │   ├── cron.ts      # POST /api/cron/process-automations
│   │       │   └── seed.ts      # POST/DELETE /api/seed/demo
│   │       └── lib/
│   │           ├── ai-engine.ts         # Intent classifier + reply drafter
│   │           ├── automation-service.ts # Job scheduling + processing
│   │           ├── booking-engine.ts    # Slot generation + conflict detection
│   │           ├── whatsapp.ts          # WhatsApp Cloud API client (sandbox-aware)
│   │           └── logger.ts            # Pino logger singleton
│   │
│   └── pulseflow/               # React + Vite frontend
│       └── src/
│           ├── App.tsx          # Routing + onboarding guard
│           ├── lib/api.ts       # apiFetch() helper + formatters
│           ├── types.ts         # Shared TypeScript interfaces
│           └── pages/
│               ├── onboarding.tsx   # 4-step onboarding wizard
│               ├── dashboard.tsx    # Main dashboard
│               ├── bookings.tsx     # Bookings list + new booking
│               ├── booking-new.tsx  # Slot picker + booking form
│               ├── customers.tsx    # Customer list + history
│               ├── services.tsx     # Services CRUD
│               ├── inbox.tsx        # AI inbox + conversations + sandbox
│               ├── automations.tsx  # Automation settings + job runner
│               └── settings.tsx     # Business + WhatsApp settings
│
├── lib/
│   ├── db/                      # Drizzle ORM + PostgreSQL schema (composite lib)
│   │   └── src/schema/
│   │       ├── businesses.ts
│   │       ├── services.ts
│   │       ├── customers.ts
│   │       ├── bookings.ts
│   │       ├── conversations.ts
│   │       ├── ai_actions.ts
│   │       ├── automation.ts
│   │       └── jobs.ts
│   ├── api-spec/                # OpenAPI 3.0 contract (source of truth)
│   │   └── openapi.yaml
│   ├── api-client-react/        # Generated TanStack Query hooks (from Orval)
│   └── api-zod/                 # Generated Zod validation schemas (from Orval)
│
└── scripts/
    └── src/                     # Utility scripts (tsx)
```

---

## Database Schema

All tables use PostgreSQL via Drizzle ORM. Migrations are applied with `pnpm --filter @workspace/db run push`.

### `businesses`
Core business profile.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | Always 1 in single-tenant MVP |
| `name` | text | e.g. "GlowNest Studio" |
| `owner_name` | text | |
| `phone` | text | |
| `whatsapp_number` | text | Business WhatsApp number |
| `city` | text | |
| `address` | text | |
| `google_maps_link` | text | |
| `category` | text | salon / spa / beauty_parlour / nail_studio / etc. |
| `description` | text | |
| `timezone` | text | Default: Asia/Kolkata |
| `working_hours` | jsonb | `{ mon: { open, close, isOpen }, … }` |
| `cancellation_policy` | text | |
| `token_policy` | text | Advance payment policy |
| `preferred_tone` | text | friendly / professional / warm |
| `review_link` | text | Google review URL (used in review requests) |
| `is_onboarded` | boolean | Onboarding guard |

### `services`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK | |
| `name` | text | |
| `category` | text | hair / skin / nails / bridal / etc. |
| `price` | numeric | INR |
| `duration_minutes` | int | Used for slot calculation |
| `description` | text | |
| `repeat_reminder_days` | int | Days after completion to send repeat nudge |
| `requires_consultation` | boolean | Flags AI to escalate |
| `requires_token_advance` | boolean | Flags AI to mention advance |
| `is_active` | boolean | |

### `customers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK | |
| `name` | text | |
| `phone` | text | WhatsApp phone number |
| `source` | text | whatsapp / manual / referral |
| `notes` | text | Owner notes |
| `total_visits` | int | Incremented on booking completion |
| `last_visit_at` | timestamp | |

### `bookings`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK | |
| `customer_id` | int FK | |
| `service_id` | int FK | |
| `booking_date` | text | YYYY-MM-DD |
| `start_time` | text | HH:MM (24h) |
| `end_time` | text | Calculated from service duration |
| `status` | text | pending / confirmed / completed / cancelled / no_show / rescheduled |
| `source` | text | whatsapp / manual / dashboard |
| `created_by_ai` | boolean | |
| `notes` | text | |
| `reminder_24h_sent` | boolean | |
| `reminder_2h_sent` | boolean | |
| `review_request_sent` | boolean | |

### `conversations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK | |
| `customer_id` | int FK | |
| `channel` | text | whatsapp |
| `status` | text | active / resolved / archived |
| `last_message_at` | timestamp | |

### `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `conversation_id` | int FK | |
| `direction` | text | inbound / outbound |
| `content` | text | |
| `message_type` | text | text / image / audio |
| `ai_generated` | boolean | |
| `requires_approval` | boolean | |
| `sent_at` | timestamp | |

### `ai_action_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK | |
| `customer_id` | int FK | |
| `action_type` | text | booking_request / price_inquiry / cancel_request / etc. |
| `input_summary` | text | Original customer message |
| `output_summary` | text | What the AI decided |
| `reply_draft` | text | AI-drafted reply |
| `confidence_score` | real | 0.0–1.0 |
| `status` | text | pending / approved / rejected / auto_sent |
| `requires_human_review` | boolean | |

### `automation_settings`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK unique | |
| `reminder_24h_enabled` | boolean | |
| `reminder_2h_enabled` | boolean | |
| `review_request_enabled` | boolean | |
| `review_request_delay_hours` | int | Default: 2 |
| `repeat_reminder_enabled` | boolean | |
| `ai_auto_reply_enabled` | boolean | |
| `ai_confidence_threshold` | real | Default: 0.8 |
| `reminder_template` | text | Template with `{name}`, `{service}`, `{date}`, `{time}`, `{business}` |
| `review_template` | text | Template with `{name}`, `{service}`, `{business}`, `{review_link}` |

### `reminder_jobs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `business_id` | int FK | |
| `customer_id` | int FK | |
| `booking_id` | int FK | |
| `type` | text | confirmation / reminder_24h / reminder_2h / review_request / repeat_reminder / missed_followup |
| `scheduled_for` | timestamp | When to process |
| `status` | text | pending / sent / failed / cancelled / skipped |
| `payload` | jsonb | Extra data for the job |
| `sent_at` | timestamp | |

---

## API Reference

All routes are prefixed with `/api`.

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Server health check |

### Business
| Method | Path | Description |
|--------|------|-------------|
| GET | `/business` | Get business profile |
| POST | `/business` | Create business (onboarding) |
| PUT | `/business` | Update business profile |

### Services
| Method | Path | Description |
|--------|------|-------------|
| GET | `/services` | List services |
| POST | `/services` | Create service |
| PUT | `/services/:id` | Update service |
| DELETE | `/services/:id` | Delete service |

### Customers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/customers` | List customers (supports `?search=`) |
| POST | `/customers` | Create customer |
| GET | `/customers/:id` | Get customer + booking history |

### Bookings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/bookings` | List bookings (`?date=`, `?status=`, `?from=`, `?to=`) |
| POST | `/bookings` | Create booking (auto-schedules automations) |
| GET | `/bookings/:id` | Get booking |
| PATCH | `/bookings/:id` | Update booking |
| POST | `/bookings/:id/confirm` | Mark confirmed |
| POST | `/bookings/:id/complete` | Mark completed (triggers review + repeat reminder) |
| POST | `/bookings/:id/cancel` | Mark cancelled (cancels pending jobs) |
| POST | `/bookings/:id/no-show` | Mark no-show |
| POST | `/bookings/:id/reschedule` | Reschedule with new date + time |
| GET | `/bookings/available-slots` | `?date=YYYY-MM-DD&serviceId=N` — returns free 30-min slots |

### Conversations & AI Inbox
| Method | Path | Description |
|--------|------|-------------|
| GET | `/conversations` | List conversations |
| GET | `/conversations/:id` | Get conversation + messages |
| GET | `/ai/inbox` | Pending AI actions for review |
| POST | `/ai/actions/:id/approve` | Approve + send AI reply (body: `{ editedReply? }`) |
| POST | `/ai/actions/:id/reject` | Dismiss action |
| POST | `/sandbox/send-message` | Simulate inbound WhatsApp message (body: `{ message, customerPhone, customerName }`) |

### Automation
| Method | Path | Description |
|--------|------|-------------|
| GET | `/automation` | Get automation settings |
| PUT | `/automation` | Update automation settings |
| GET | `/jobs` | List reminder jobs (`?limit=`, `?status=`) |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/stats` | Aggregate stats (today's count, revenue, AI actions, etc.) |
| GET | `/dashboard/today` | Today's bookings enriched with customer + service |
| GET | `/dashboard/upcoming` | Next 7 days bookings |

### Cron & Seed
| Method | Path | Description |
|--------|------|-------------|
| POST | `/cron/process-automations` | Process all due reminder jobs (`?businessId=N` to scope) |
| POST | `/seed/demo` | Seed GlowNest Studio demo data (re-entrant — safe to run repeatedly) |
| DELETE | `/seed/demo` | Clear all demo data |

### WhatsApp Webhook
| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhooks/whatsapp` | Webhook verification (WhatsApp Cloud API handshake) |
| POST | `/webhooks/whatsapp` | Receive inbound messages from WhatsApp |

---

## AI Engine

**File**: `artifacts/api-server/src/lib/ai-engine.ts`

The AI engine is rule-based — no OpenAI dependency, no external API calls, no cost per message. It uses keyword and pattern matching with confidence scoring.

### Intent Classification

Intents detected:

| Intent | Example messages |
|--------|-----------------|
| `booking_request` | "book", "appointment", "schedule", "can I come" |
| `price_inquiry` | "price", "cost", "how much", "charges", "rate" |
| `availability_inquiry` | "available", "free slot", "open", "when can I" |
| `cancel_request` | "cancel", "won't be able to come", "not coming" |
| `reschedule_request` | "reschedule", "change", "move my appointment" |
| `location_inquiry` | "where", "address", "location", "maps" |
| `faq` | "open", "hours", "working", "policy" |
| `unknown` | Anything that doesn't match above |

### Confidence Scoring

- High-confidence single-intent messages (e.g. simple price query) → score ≥ 0.85
- Messages with date/time context (booking requests) → score boosted
- Services that `requiresConsultation` or `requiresTokenAdvance` → score capped at 0.65 to force owner review
- Unknown intent → score 0.3

### Routing Decision

```
if (aiAutoReplyEnabled && confidence >= threshold && !requiresConsultation) {
  → auto-send reply
} else {
  → queue for owner approval in AI Inbox
}
```

### Reply Drafting

Replies are drafted using business context:
- Business name, address, working hours
- Matching service name and price
- Available slots for the requested date
- Booking confirmation with date + time

### `processInboundCustomerMessage()`

The main entry point used by the webhook handler:

```ts
processInboundCustomerMessage(businessId, phone, messageText)
```

1. Finds or creates the Customer by phone
2. Loads Business + AutomationSettings
3. Loads active Services
4. Classifies intent + drafts reply
5. If booking_request: checks availability, creates Booking
6. If booking created: schedules automation events
7. Logs AiActionLog
8. If auto-send: calls `sendWhatsappMessage()`
9. If review needed: saves pending AiActionLog for owner review

---

## Automation Engine

**File**: `artifacts/api-server/src/lib/automation-service.ts`

### Functions

#### `createAutomationEvent(businessId, customerId, bookingId, type, scheduledFor)`

Creates a `reminder_jobs` row. **Idempotent** — if a job of the same `bookingId + type` already exists in `pending` or `sent` state, it skips the insert. Jobs scheduled more than 5 minutes in the past are also skipped automatically.

#### `scheduleBookingAutomations(bookingId)`

Called when a booking is created or confirmed. Schedules:
- `confirmation` — immediately (now)
- `reminder_24h` — 24 hours before `bookingDate + startTime`
- `reminder_2h` — 2 hours before `bookingDate + startTime`

Respects `reminder24hEnabled` / `reminder2hEnabled` from AutomationSettings.

#### `scheduleCompletionAutomations(bookingId)`

Called when a booking is marked `completed`. Schedules:
- `review_request` — `reviewRequestDelayHours` hours after now (if `reviewRequestEnabled` and business has a `reviewLink`)
- `repeat_reminder` — `service.repeatReminderDays` days after now (if `repeatReminderEnabled` and service has a value)

#### `processDueAutomationEvents(businessId?)`

Fetches all `reminder_jobs` with `status = 'pending'` and `scheduled_for <= now`. For each:
1. Skips if booking was cancelled or no-show
2. Builds the message from the job type + context
3. Sends via `sendWhatsappMessage()`
4. Updates job to `sent` + sets `sent_at`
5. Updates booking reminder flags (e.g. `reminder24hSent = true`)

Returns `{ processed, sent, failed, skipped }`.

### Triggering the Job Runner

**Development / demo**: Call `POST /api/cron/process-automations` from the dashboard ("Run Automations" button) or the Automations page sidebar.

**Production**: Set up a scheduled trigger (see [Swapping Mock Automation for Real Job Infrastructure](#swapping-mock-automation-for-real-job-infrastructure)).

---

## WhatsApp Integration

**File**: `artifacts/api-server/src/lib/whatsapp.ts`

### Sandbox Mode (default)

If `WHATSAPP_ACCESS_TOKEN` is not set, `sendWhatsappMessage()` logs the message and returns `{ sandbox: true }`. No real API call is made. The app is fully functional for demo purposes.

### Live Mode

Set both `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`. The client switches to real WhatsApp Cloud API calls automatically.

### Webhook Setup (Live)

WhatsApp Cloud API sends a `GET` verification request when you register the webhook URL. The handler at `GET /api/webhooks/whatsapp` responds to the hub challenge using `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

Inbound messages arrive as `POST /api/webhooks/whatsapp` and are routed to `processInboundCustomerMessage()`.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Express session secret |
| `WHATSAPP_ACCESS_TOKEN` | No | — | WhatsApp Cloud API access token. Without this, sandbox mode is used. |
| `WHATSAPP_PHONE_NUMBER_ID` | No | — | WhatsApp Business phone number ID |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | No | `pulseflow-dev` | Token for webhook verification handshake |
| `PORT` | Injected | 8080 | Set by the workflow runner |
| `NODE_ENV` | Injected | development | Set by the workflow |
| `LOG_LEVEL` | No | `info` | Pino log level |

---

## Running Locally

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database (or Replit's built-in DB)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Set environment variables
# Create a .env file or set them in your shell:
export DATABASE_URL="postgresql://user:pass@localhost:5432/pulseflow"
export SESSION_SECRET="your-secret-here"

# 3. Push the database schema
pnpm --filter @workspace/db run push

# 4. Rebuild lib type declarations
pnpm run typecheck:libs
```

### Start Development Servers

```bash
# API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (Vite dev server)
pnpm --filter @workspace/pulseflow run dev
```

Both are started automatically by the Replit workflow runner.

### Seed Demo Data

```bash
curl -X POST localhost:8080/api/seed/demo
```

This creates **GlowNest Studio** with 8 services, 7 customers, 12 bookings, 5 WhatsApp conversation threads, and 2 pending AI actions. Safe to run repeatedly — it wipes and re-seeds cleanly.

### Typecheck

```bash
# Full typecheck (libs + all packages)
pnpm run typecheck

# Rebuild lib declarations only (run this after adding new schema files)
pnpm run typecheck:libs

# API server only
pnpm --filter @workspace/api-server run typecheck
```

### Regenerate API Code

After changing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Demo Mode

PulseFlow is demoable immediately without WhatsApp credentials.

### Load Demo Data

1. Open the app and complete the onboarding wizard (or skip it — if the business isn't created yet, the dashboard shows a "Load Demo" banner).
2. Click **Load Demo** on the dashboard, or call `POST /api/seed/demo`.
3. GlowNest Studio is loaded: 12 bookings, 7 customers, 5 conversations, 2 pending AI reviews.

### AI Sandbox Simulator

In the AI Inbox page, the right panel has an **AI Sandbox**:

1. Enter a phone number (e.g. `+91 99999 00001`)
2. Type a customer message (e.g. `"How much is a facial? Can I come Saturday at 2pm?"`)
3. Click **Simulate Message**

The AI engine classifies the intent, drafts a reply, and — if confidence is below the threshold — queues it as a pending action in the inbox. This works without any WhatsApp connection.

### Run Automations Manually

Click **Run Automations** in the Dashboard header or the **Process Due Jobs** button in the Automations page. This processes all pending reminder jobs immediately, simulating what a real cron would do.

---

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Stats, today's schedule, top services, pending AI quick-review |
| `/bookings` | Bookings | List with date/status filters, status transitions |
| `/bookings/new` | New Booking | Service picker → slot picker → customer → confirm |
| `/customers` | Customers | Search, visit history, upcoming booking, book-again |
| `/services` | Services | Full CRUD — price, duration, repeat reminder interval |
| `/inbox` | AI Inbox | Pending action review, conversation viewer, sandbox simulator |
| `/automations` | Automations | Toggle reminders, AI threshold, job runner panel |
| `/settings` | Settings | Business profile, working hours, WhatsApp webhook config |
| `/onboarding` | Onboarding | 4-step wizard shown on first launch |

---

## Going to Production

### 1. Deploy the API Server

The API server (`artifacts/api-server`) bundles to a single `dist/index.mjs` with esbuild. Use Replit Deployments or any Node.js host.

Required for production:
- `DATABASE_URL` — production PostgreSQL connection string
- `SESSION_SECRET` — a long random string
- `NODE_ENV=production`

### 2. Push Schema to Production DB

```bash
DATABASE_URL="your-production-url" pnpm --filter @workspace/db run push
```

### 3. Deploy the Frontend

The frontend (`artifacts/pulseflow`) is a Vite SPA — build with `pnpm --filter @workspace/pulseflow run build` and serve the `dist/` folder as static files, or use Replit Deployments.

---

## Connecting WhatsApp Cloud API

### Prerequisites

- Meta Business Account
- WhatsApp Business App on Meta Developer Portal
- A verified phone number

### Steps

1. In Meta Developer Portal, go to your app → **WhatsApp → API Setup**
2. Note your **Phone Number ID** and generate a **Temporary Access Token** (or use a System User token for production)
3. Set environment variables:
   ```
   WHATSAPP_ACCESS_TOKEN=your_token
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=any-secret-string-you-choose
   ```
4. In Meta Developer Portal → **WhatsApp → Configuration → Webhook**:
   - Webhook URL: `https://your-domain.com/api/webhooks/whatsapp`
   - Verify token: same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to: **messages**
5. Restart the API server — it will automatically switch from sandbox to live mode when `WHATSAPP_ACCESS_TOKEN` is present.

### Template Messages

WhatsApp requires pre-approved message templates for outbound messages sent more than 24 hours after the last customer message (session window). For reminder jobs, you may need to:
1. Create message templates in Meta Business Manager
2. Update `sendWhatsappMessage()` in `artifacts/api-server/src/lib/whatsapp.ts` to use template API calls for out-of-session messages

Within the 24-hour session window, plain text messages work without templates.

---

## Swapping Mock Automation for Real Job Infrastructure

The current job runner (`POST /api/cron/process-automations`) is a simple Express route. In production you want it called automatically.

### Option A — Replit Scheduled Deployments

If using Replit Deployments, add a scheduled task to call:
```
POST https://your-app.replit.app/api/cron/process-automations
```
every 1–5 minutes.

### Option B — GitHub Actions Cron

```yaml
# .github/workflows/process-automations.yml
on:
  schedule:
    - cron: '*/2 * * * *'  # every 2 minutes
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST https://your-domain.com/api/cron/process-automations
```

### Option C — pg-boss (PostgreSQL-native queue)

Replace the `reminder_jobs` table with [pg-boss](https://github.com/timgit/pg-boss), which handles scheduling, retries, and concurrency natively in PostgreSQL:

```ts
// In scheduleBookingAutomations():
await boss.sendAfter('send-reminder', { jobId }, {}, delaySeconds);

// Worker:
boss.work('send-reminder', async ({ data }) => {
  await processJob(data.jobId);
});
```

### Option D — BullMQ + Redis

For high-volume deployments, use [BullMQ](https://docs.bullmq.io/) with Redis for distributed job queues. Replace `processDueAutomationEvents()` with BullMQ workers.

---

## Architecture Decisions & Tradeoffs

### Single-tenant MVP

All routes hardcode `DEFAULT_BUSINESS_ID = 1`. This was a deliberate choice to ship fast and keep the codebase simple. Multi-tenancy requires:
- Auth middleware (Clerk or Replit Auth recommended)
- `businessId` extracted from JWT/session in every route
- Row-level security or explicit `WHERE business_id = ?` on every query (already present — just needs to be parameterised from auth context)

### Rule-based AI (no LLM)

The classifier uses keyword matching, not GPT. This means:
- Zero per-message cost
- Instant responses
- Fully offline / no API dependency
- Limited to the intents and phrasings explicitly coded

To upgrade to an LLM: replace `classifyIntent()` in `ai-engine.ts` with an OpenAI / Anthropic / Gemini call. The rest of the pipeline (approval routing, booking creation, automation scheduling) is unchanged. Replit AI integrations provide hosted API access without needing your own keys.

### Booking Slot Calculation

Slots are computed in memory (not from DB indexes). For each 30-minute interval in the business's working hours, the engine checks existing confirmed/pending bookings for that day and filters out conflicts. This is O(n) per day — fine for a solo business with < 20 bookings/day.

### Currency & Localisation

All prices are stored as `numeric` in INR (₹). Dates are YYYY-MM-DD strings (timezone-agnostic). Times are HH:MM 24-hour strings. Timezone is Asia/Kolkata for display formatting.

### No Authentication (MVP)

The app currently has no login. It's designed for a single owner who accesses their own deployment. Adding authentication:
1. Read the `clerk-auth` or `replit-auth` skill
2. Wrap all routes in an auth middleware
3. Extract `businessId` from the authenticated user's profile
