/**
 * Webhooks — Meta WhatsApp Cloud API + Sandbox Simulator
 *
 * Public routes — no Clerk auth required.
 * Business is identified by verifyToken (for webhook verification) or
 * DEFAULT_BUSINESS_ID (for the sandbox demo endpoint).
 */

import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseWebhookPayload } from "../lib/whatsapp";
import { processInboundCustomerMessage } from "../lib/ai/process-inbound";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Meta webhook verification — GET
router.get("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Find business by verifyToken (supports multi-tenant)
  const businesses = await db.select().from(businessesTable);
  const business = businesses.find((b) => b.whatsappVerifyToken && b.whatsappVerifyToken === token);

  if (mode === "subscribe" && business) {
    req.log.info({ businessId: business.id }, "WhatsApp webhook verified");
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

// Inbound WhatsApp messages & status callbacks — POST
router.post("/webhooks/whatsapp", async (req, res): Promise<void> => {
  // Acknowledge immediately (Meta requires 200 within 5s)
  res.status(200).json({ status: "ok" });

  const body = req.body as Record<string, any>;
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  // Process message delivery status updates
  if (value?.statuses) {
    for (const status of value.statuses) {
      const messageId = status.id;
      const statusType = status.status; // delivered, read, failed, sent
      logger.info({ messageId, statusType }, "WhatsApp delivery status callback received");
      if (statusType === "failed" && status.errors) {
        logger.error({ messageId, errors: status.errors }, "WhatsApp message delivery failed");
      }
    }
    return;
  }

  const normalized = parseWebhookPayload(body);
  if (!normalized) return;

  // Look up business by phone number id from webhook payload
  // For now, fall back to first onboarded business
  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.isOnboarded, true))
    .limit(1);

  if (!business) {
    logger.warn("No onboarded business found for webhook");
    return;
  }

  try {
    await processInboundCustomerMessage(
      business.id, normalized.from, normalized.text, normalized.customerName
    );
  } catch (e) {
    logger.error({ e }, "Error processing inbound WhatsApp message");
  }
});

// Sandbox: simulate inbound WhatsApp message (protected by requireBusiness later if needed)
router.post("/sandbox/send-message", async (req, res): Promise<void> => {
  const { message, customerPhone, customerName, businessId } = req.body as {
    message: string;
    customerPhone: string;
    customerName?: string;
    businessId?: number;
  };

  if (!message || !customerPhone) {
    res.status(400).json({ error: "message and customerPhone are required" });
    return;
  }

  // Default to first onboarded business for sandbox demo
  let targetBusinessId = businessId;
  if (!targetBusinessId) {
    const [biz] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.isOnboarded, true))
      .limit(1);
    targetBusinessId = biz?.id ?? 1;
  }

  const result = await processInboundCustomerMessage(targetBusinessId, customerPhone, message, customerName);
  res.json(result);
});

export default router;
