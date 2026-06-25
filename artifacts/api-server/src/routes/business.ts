import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { businessesTable, automationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateBusinessBody,
  UpdateBusinessBody,
} from "@workspace/api-zod";

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
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkUserId = req.clerkUserId;

  // Check if this user already has a business
  if (clerkUserId) {
    const existing = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.clerkUserId, clerkUserId))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Business already exists. Use PATCH to update." });
      return;
    }
  }

  const [biz] = await db.insert(businessesTable).values({
    ...parsed.data,
    clerkUserId: clerkUserId ?? null,
    isOnboarded: true,
  }).returning();

  await db.insert(automationSettingsTable)
    .values({ businessId: biz.id })
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
