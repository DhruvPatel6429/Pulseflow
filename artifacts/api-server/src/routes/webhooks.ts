import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import {
  customersTable, conversationsTable, messagesTable,
  businessesTable, aiActionLogsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { parseWebhookPayload, sendWhatsappMessage } from "../lib/whatsapp";
import { processInboundMessage } from "../lib/ai-engine";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const DEFAULT_BUSINESS_ID = 1;

// Meta webhook verification
router.get("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const [business] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, DEFAULT_BUSINESS_ID));

  if (mode === "subscribe" && token === business?.whatsappVerifyToken) {
    req.log.info("WhatsApp webhook verified");
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

// Inbound WhatsApp messages
router.post("/webhooks/whatsapp", async (req, res): Promise<void> => {
  // Acknowledge immediately (Meta requires 200 within 5s)
  res.status(200).json({ status: "ok" });

  const normalized = parseWebhookPayload(req.body as Record<string, unknown>);
  if (!normalized) return;

  try {
    await handleInboundMessage(normalized.from, normalized.text, normalized.customerName);
  } catch (e) {
    logger.error({ e }, "Error processing inbound WhatsApp message");
  }
});

// Sandbox: simulate inbound WhatsApp message
router.post("/sandbox/send-message", async (req, res): Promise<void> => {
  const { message, customerPhone, customerName } = req.body as {
    message: string;
    customerPhone: string;
    customerName?: string;
  };

  if (!message || !customerPhone) {
    res.status(400).json({ error: "message and customerPhone are required" });
    return;
  }

  const result = await processInboundMessage(DEFAULT_BUSINESS_ID, message, customerPhone, customerName);

  // Store conversation and message
  await handleInboundMessage(customerPhone, message, customerName);

  res.json(result);
});

async function handleInboundMessage(phone: string, message: string, name?: string) {
  // Get or create customer
  let [customer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.businessId, DEFAULT_BUSINESS_ID), eq(customersTable.phone, phone)));

  if (!customer) {
    [customer] = await db.insert(customersTable).values({
      businessId: DEFAULT_BUSINESS_ID,
      name: name ?? "WhatsApp Customer",
      phone,
      source: "whatsapp",
    }).returning();
  }

  // Get or create conversation
  let [conversation] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.businessId, DEFAULT_BUSINESS_ID),
      eq(conversationsTable.customerId, customer.id)
    ));

  if (!conversation) {
    [conversation] = await db.insert(conversationsTable).values({
      businessId: DEFAULT_BUSINESS_ID,
      customerId: customer.id,
      channel: "whatsapp",
      status: "active",
    }).returning();
  }

  // Store inbound message
  await db.insert(messagesTable).values({
    conversationId: conversation.id,
    direction: "inbound",
    content: message,
    messageType: "text",
    aiGenerated: false,
    requiresApproval: false,
    sentAt: new Date(),
  });

  // Update conversation last message time
  await db.update(conversationsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  // Process with AI
  const aiResult = await processInboundMessage(DEFAULT_BUSINESS_ID, message, phone, name);

  // Log AI action
  const [actionLog] = await db.insert(aiActionLogsTable).values({
    businessId: DEFAULT_BUSINESS_ID,
    customerId: customer.id,
    conversationId: conversation.id,
    actionType: aiResult.intent,
    inputSummary: message,
    outputSummary: aiResult.replyDraft,
    replyDraft: aiResult.replyDraft,
    confidenceScore: aiResult.confidence,
    status: aiResult.confidence >= 0.8 ? "auto_sent" : "pending",
    requiresHumanReview: aiResult.confidence < 0.8,
  }).returning();

  // Auto-reply or queue for approval
  if (aiResult.confidence >= 0.8) {
    // Store outbound message
    await db.insert(messagesTable).values({
      conversationId: conversation.id,
      direction: "outbound",
      content: aiResult.replyDraft,
      messageType: "text",
      aiGenerated: true,
      requiresApproval: false,
      sentAt: new Date(),
    });

    try {
      await sendWhatsappMessage({ to: phone, text: aiResult.replyDraft });
    } catch (e) {
      logger.warn({ e }, "WhatsApp auto-reply failed");
    }
  } else {
    // Queue message for approval
    await db.insert(messagesTable).values({
      conversationId: conversation.id,
      direction: "outbound",
      content: aiResult.replyDraft,
      messageType: "text",
      aiGenerated: true,
      requiresApproval: true,
    });
  }
}

export default router;
