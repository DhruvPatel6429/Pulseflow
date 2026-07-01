import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { aiActionLogsTable, customersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { ApproveAiActionBody } from "@workspace/api-zod";
import { processInboundCustomerMessage } from "../lib/ai/process-inbound";
import { sendWhatsappMessage } from "../lib/channels/whatsapp";

const router: IRouter = Router();

async function enrichAction(action: typeof aiActionLogsTable.$inferSelect) {
  const [customer] = action.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, action.customerId))
    : [null];
  return { ...action, customer: customer ?? null };
}

router.get("/ai/inbox", async (req, res): Promise<void> => {
  const actions = await db.select().from(aiActionLogsTable)
    .where(and(
      eq(aiActionLogsTable.businessId, req.businessId),
      eq(aiActionLogsTable.status, "pending"),
    ))
    .orderBy(desc(aiActionLogsTable.createdAt));

  const enriched = await Promise.all(actions.map(enrichAction));
  res.json(enriched);
});

router.post("/ai/process", async (req, res): Promise<void> => {
  const { message, customerPhone, customerName } = req.body as {
    message: string;
    customerPhone: string;
    customerName?: string;
  };

  if (!message || !customerPhone) {
    res.status(400).json({ error: "message and customerPhone are required" });
    return;
  }

  const result = await processInboundCustomerMessage(
    req.businessId, customerPhone, message, customerName
  );
  res.json(result);
});

router.post("/ai/actions/:id/approve", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = ApproveAiActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db.select().from(aiActionLogsTable)
    .where(and(eq(aiActionLogsTable.id, id), eq(aiActionLogsTable.businessId, req.businessId)));
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  const replyToSend = parsed.data.editedReply ?? action.replyDraft;
  const [customer] = action.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, action.customerId))
    : [null];

  if (customer?.phone && replyToSend) {
    await sendWhatsappMessage({ to: customer.phone, text: replyToSend });
  }

  const [updated] = await db.update(aiActionLogsTable)
    .set({ status: "approved", replyDraft: replyToSend ?? action.replyDraft })
    .where(and(eq(aiActionLogsTable.id, id), eq(aiActionLogsTable.businessId, req.businessId)))
    .returning();

  res.json(await enrichAction(updated));
});

router.post("/ai/actions/:id/reject", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db.update(aiActionLogsTable)
    .set({ status: "rejected" })
    .where(and(eq(aiActionLogsTable.id, id), eq(aiActionLogsTable.businessId, req.businessId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  res.json(await enrichAction(updated));
});

export default router;
