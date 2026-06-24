import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, customersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { SendMessageBody } from "@workspace/api-zod";
import { sendWhatsappMessage } from "../lib/whatsapp";

const router: IRouter = Router();
const DEFAULT_BUSINESS_ID = 1;

router.get("/conversations", async (req, res): Promise<void> => {
  const { status, limit = "20" } = req.query;
  let rows = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.businessId, DEFAULT_BUSINESS_ID))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(parseInt(limit as string, 10));

  if (status) rows = rows.filter((c) => c.status === status);

  const enriched = await Promise.all(rows.map(async (conv) => {
    const [lastMessage] = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    const [customer] = conv.customerId
      ? await db.select().from(customersTable).where(eq(customersTable.id, conv.customerId))
      : [null];

    return { ...conv, lastMessage: lastMessage ?? null, customer: customer ?? null, pendingAiAction: false };
  }));

  res.json(enriched);
});

router.get("/conversations/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [conv] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.id, id), eq(conversationsTable.businessId, DEFAULT_BUSINESS_ID)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.createdAt);

  const [customer] = conv.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, conv.customerId))
    : [null];

  res.json({ ...conv, messages, customer: customer ?? null });
});

router.post("/conversations/:id/send", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.id, id), eq(conversationsTable.businessId, DEFAULT_BUSINESS_ID)));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [customer] = conv.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, conv.customerId))
    : [null];

  const [message] = await db.insert(messagesTable).values({
    conversationId: id,
    direction: "outbound",
    content: parsed.data.content,
    messageType: "text",
    aiGenerated: false,
    requiresApproval: false,
    sentAt: new Date(),
  }).returning();

  // Update conversation last message time
  await db.update(conversationsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, id));

  // Try to send via WhatsApp
  if (customer?.phone) {
    try {
      await sendWhatsappMessage({ to: customer.phone, text: parsed.data.content });
    } catch (e) {
      req.log.warn({ e }, "Failed to send WhatsApp message");
    }
  }

  res.status(201).json(message);
});

export default router;
