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

const DEFAULT_BUSINESS_ID = 1;

router.get("/business", async (req, res): Promise<void> => {
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, DEFAULT_BUSINESS_ID));
  if (!biz) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(biz);
});

router.post("/business", async (req, res): Promise<void> => {
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [existing] = await db.select().from(businessesTable).where(eq(businessesTable.id, DEFAULT_BUSINESS_ID));
  if (existing) {
    res.status(409).json({ error: "Business already exists. Use PATCH to update." });
    return;
  }
  const [biz] = await db.insert(businessesTable).values({
    ...data,
    id: DEFAULT_BUSINESS_ID,
    isOnboarded: true,
  } as typeof businessesTable.$inferInsert).returning();

  // Create default automation settings
  await db.insert(automationSettingsTable).values({ businessId: DEFAULT_BUSINESS_ID }).onConflictDoNothing();

  res.status(201).json(biz);
});

router.patch("/business", async (req, res): Promise<void> => {
  const parsed = UpdateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [biz] = await db
    .update(businessesTable)
    .set(parsed.data as Partial<typeof businessesTable.$inferInsert>)
    .where(eq(businessesTable.id, DEFAULT_BUSINESS_ID))
    .returning();
  if (!biz) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(biz);
});

export default router;
