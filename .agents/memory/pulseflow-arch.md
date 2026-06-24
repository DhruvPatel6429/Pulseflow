---
name: PulseFlow Architecture
description: Key non-obvious decisions and gotchas for the PulseFlow AI WhatsApp front desk project
---

## DB lib stale declarations
After adding new schema files to `lib/db/src/schema/`, the `@workspace/db` package declarations go stale. The api-server typecheck will report "module has no exported member X" even though the schema file exists. Fix: run `pnpm run typecheck:libs` first to rebuild lib declarations, then `pnpm --filter @workspace/api-server run typecheck`.

**Why:** lib packages are composite and emit declarations. Leaf packages (api-server) read from `lib/db/dist/` — stale if not rebuilt.

**How to apply:** Whenever a "module has no exported member" error points at `@workspace/db`, run `typecheck:libs` first.

## Single-tenant MVP
All routes hardcode `DEFAULT_BUSINESS_ID = 1`. Multi-tenancy is not implemented.

**Why:** Solo beauty/wellness business product — one account per install for MVP.

## WhatsApp sandbox mode
The WhatsApp integration layer (`artifacts/api-server/src/lib/whatsapp.ts`) auto-detects sandbox mode: if `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` env vars are absent, all sends are logged only (no real API calls).

## AI engine is rule-based
`artifacts/api-server/src/lib/ai-engine.ts` uses keyword classification, not OpenAI. Confidence < threshold (default 0.8) queues messages for owner review in AI Inbox.

## Frontend apiFetch pattern
The frontend uses `apiFetch()` from `src/lib/api.ts` (not generated TanStack hooks) for simplicity. Base URL is `import.meta.env.BASE_URL` + `/api`.

## Onboarding guard
`App.tsx` fetches `/api/business` on load. If business is not found or `isOnboarded=false`, shows the Onboarding page. Onboarding creates the business and seeds 3 default services.

## Booking engine slots
30-minute intervals between slots; service duration pulled from DB. Conflict detection compares time ranges in memory per day (not indexed by DB).
