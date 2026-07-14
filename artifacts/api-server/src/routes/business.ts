import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { businessesTable, automationSettingsTable, subscriptionsTable, PLANS } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateBusinessBody,
  UpdateBusinessBody,
} from "@workspace/api-zod";

// Note: req.businessId is set by requireBusiness middleware (routes/index.ts).
// 0 = authenticated but no business yet; > 0 = has an existing business.

const router: IRouter = Router();

/** GET /business — returns the authenticated user's business (or 404 if not onboarded) */
router.get("/business", async (req, res): Promise<void> => {
  if (!req.businessId || req.businessId === 0) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, req.businessId));
  if (!biz) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(biz);
});

/** POST /business — create a new business for this Clerk user (onboarding) */
router.post("/business", async (req, res): Promise<void> => {
  // requireBusiness middleware already resolved the Clerk user → business mapping.
  // businessId > 0  means the user already completed onboarding — reject duplicates.
  // businessId === 0 means no business yet — safe to create.
  if (req.businessId > 0) {
    res.status(409).json({ error: "Business already exists. Use PATCH to update." });
    return;
  }

  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let biz: typeof businessesTable.$inferSelect;
  try {
    [biz] = await db.insert(businessesTable).values({
      ...parsed.data,
      clerkUserId: req.clerkUserId ?? null,
      isOnboarded: true,
    }).returning();
  } catch (err: unknown) {
    // Postgres unique_violation (23505) on clerk_user_id — race-safe duplicate guard
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      res.status(409).json({ error: "Business already exists. Use PATCH to update." });
      return;
    }
    throw err;
  }

  await db.insert(automationSettingsTable)
    .values({ businessId: biz.id })
    .onConflictDoNothing();

  // Provision a 14-day free trial subscription for every new business
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  await db
    .insert(subscriptionsTable)
    .values({
      businessId:       biz.id,
      plan:             "trial",
      status:           "trialing",
      staffLimit:       PLANS.trial.staffLimit,
      currentPeriodEnd: trialEndsAt,
    })
    .onConflictDoNothing();

  res.status(201).json(biz);
});

/** PATCH /business — update the authenticated user's business */
router.patch("/business", async (req, res): Promise<void> => {
  if (!req.businessId || req.businessId === 0) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const parsed = UpdateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [biz] = await db
    .update(businessesTable)
    .set(parsed.data as Partial<typeof businessesTable.$inferInsert>)
    .where(eq(businessesTable.id, req.businessId))
    .returning();
  if (!biz) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(biz);
});

export default router;
