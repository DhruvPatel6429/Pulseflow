---
name: PulseFlow staff & multi-tenant access
description: How staff invitations, role resolution, and owner-only gating work
---

## Resolution order in requireBusiness

1. `businesses.clerk_user_id = userId` → owner role
2. `staff.clerk_user_id = userId AND status = 'active'` → staff role
3. `staff.invited_email = userEmail AND status = 'pending'` → auto-accept (UPDATE staff SET clerk_user_id, status=active), return staff role
4. Nothing found → businessId=0, role=owner (new user going through onboarding)

Step 3 calls `clerkClient.users.getUser(userId)` to fetch email — only on first sign-in for invited staff. Non-fatal if Clerk call fails.

## Role gating

- `requireOwner` middleware (artifacts/api-server/src/middlewares/requireOwner.ts) — returns 403 if `req.userRole !== 'owner'`
- Applied to: all billing routes (via billingOwnerRouter), `POST /team/invite`, `DELETE /team/:id`, `DELETE /services/:id`
- Staff can access: bookings, inbox, customers, dashboard, `GET /team`, `GET /team/my-role`

## Staff limit enforcement

`POST /team/invite` queries `subscriptions.staff_limit` for the business's plan and rejects if `count(staff) >= staffLimit`. Returns 402 with `error: "staff_limit_reached"`.

## Frontend

- Sidebar queries `GET /api/team/my-role` and hides the Billing nav item for staff
- `/settings/team` page accessible via Settings → Team Management card
- `/settings/team` route is in App.tsx; owner-only in practice (Billing nav hidden for staff)

**Why:** clerkClient.users.getUser is the only way to get email for pending-invite resolution without Clerk webhooks. Acceptable for the MVP single-call-on-first-login pattern.
