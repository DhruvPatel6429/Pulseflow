import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import {
  aiActionLogsTable, customersTable, conversationsTable,
  messagesTable, businessesTable, automationSettingsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { ProcessMessageBody, ApproveAiActionBody } from "@workspace/api-zod";
import { processInboundMessage } from "../lib/ai-engine";
import { sendWhatsappMessage } from "../lib/whatsapp";

const router: IRouter = Router();
const DEFAULT_BUSINESS_ID = 1;

async function enrichAction(action: typeof aiActionLogsTable.$inferSelect) {
  const [customer] = action.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, action.customerId))
    : [null];
  return { ...action, customer: customer ?? null };
}

router.get("/ai/inbox", async (_req, res): Promise<void> => {
  const actions = await db.select().from(aiActionLogsTable)
    .where(and(
      eq(aiActionLogsTable.businessId, DEFAULT_BUSINESS_ID),
      eq(aiActionLogsTable.status, "pending"),
    ))
    .orderBy(desc(aiActionLogsTable.createdAt));

  const enriched = await Promise.all(actions.map(enrichAction));
  res.json(enriched);
});

router.post("/ai/process", async (req, res): Promise<void> => {
  const parsed = ProcessMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, customerPhone, customerName, conversationId } = parsed.data;
  const result = await processInboundMessage(DEFAULT_BUSINESS_ID, message, customerPhone, customerName);

  // Get or create customer
  let customerId: number | null = null;
  const [existing] = await db.select().from(customersTable)
    .where(and(eq(customersTable.businessId, DEFAULT_BUSINESS_ID), eq(customersTable.phone, customerPhone)));

  if (existing) {
    customerId = existing.id;
  } else if (customerPhone) {
    const [newCustomer] = await db.insert(customersTable).values({
      businessId: DEFAULT_BUSINESS_ID,
      name: customerName ?? "WhatsApp Customer",
      phone: customerPhone,
      source: "whatsapp",
    }).returning();
    customerId = newCustomer.id;
  }

  // Check automation settings to decide auto-reply vs queue for approval
  const [automation] = await db.select().from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, DEFAULT_BUSINESS_ID));

  const threshold = automation?.aiConfidenceThreshold ?? 0.8;
  const autoReplyEnabled = automation?.aiAutoReplyEnabled ?? true;
  const requiresReview = !autoReplyEnabled || result.confidence < threshold;

  // Log the action
  const [actionLog] = await db.insert(aiActionLogsTable).values({
    businessId: DEFAULT_BUSINESS_ID,
    customerId,
    conversationId: conversationId ?? null,
    actionType: result.intent,
    inputSummary: message,
    outputSummary: result.replyDraft,
    replyDraft: result.replyDraft,
    confidenceScore: result.confidence,
    status: requiresReview ? "pending" : "auto_sent",
    requiresHumanReview: requiresReview,
  }).returning();

  // Auto-reply if confidence is high enough and AI auto-reply is enabled
  if (!requiresReview) {
    try {
      await sendWhatsappMessage({ to: customerPhone, text: result.replyDraft });
    } catch (e) {
      req.log.warn({ e }, "Auto-reply send failed");
    }
  }

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
    .where(and(eq(aiActionLogsTable.id, id), eq(aiActionLogsTable.businessId, DEFAULT_BUSINESS_ID)));
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  const replyToSend = parsed.data.editedReply ?? action.replyDraft;

  // Send the message
  const [customer] = action.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, action.customerId))
    : [null];

  if (customer?.phone && replyToSend) {
    try {
      await sendWhatsappMessage({ to: customer.phone, text: replyToSend });
    } catch (e) {
      req.log.warn({ e }, "Approved reply send failed");
    }
  }

  const [updated] = await db.update(aiActionLogsTable)
    .set({ status: "approved", replyDraft: replyToSend ?? action.replyDraft })
    .where(eq(aiActionLogsTable.id, id))
    .returning();

  res.json(await enrichAction(updated));
});

router.post("/ai/actions/:id/reject", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db.update(aiActionLogsTable)
    .set({ status: "rejected" })
    .where(and(eq(aiActionLogsTable.id, id), eq(aiActionLogsTable.businessId, DEFAULT_BUSINESS_ID)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  res.json(await enrichAction(updated));
});

export default router;
