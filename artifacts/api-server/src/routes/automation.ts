import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { automationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateAutomationBody } from "@workspace/api-zod";

const router: IRouter = Router();
const DEFAULT_BUSINESS_ID = 1;

router.get("/automation", async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, DEFAULT_BUSINESS_ID));

  if (!settings) {
    const [created] = await db.insert(automationSettingsTable)
      .values({ businessId: DEFAULT_BUSINESS_ID })
      .returning();
    settings = created;
  }

  res.json(settings);
});

router.patch("/automation", async (req, res): Promise<void> => {
  const parsed = UpdateAutomationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [settings] = await db.select().from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, DEFAULT_BUSINESS_ID));

  if (!settings) {
    const [created] = await db.insert(automationSettingsTable)
      .values({ businessId: DEFAULT_BUSINESS_ID })
      .returning();
    settings = created;
  }

  const [updated] = await db.update(automationSettingsTable)
    .set(parsed.data as Partial<typeof automationSettingsTable.$inferInsert>)
    .where(eq(automationSettingsTable.businessId, DEFAULT_BUSINESS_ID))
    .returning();

  res.json(updated);
});

export default router;
