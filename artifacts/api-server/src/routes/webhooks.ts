/**
 * Webhooks — Meta WhatsApp Cloud API + Sandbox Simulator + Razorpay
 *
 * Public routes — no Clerk auth required.
 * Business is identified by verifyToken (for webhook verification) or
 * DEFAULT_BUSINESS_ID (for the sandbox demo endpoint).
 */

import { Router } from "express";
import type { IRouter, Request } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { businessesTable, subscriptionsTable } from "@workspace/db";
import type { PlanKey, SubStatus } from "@workspace/db";
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

// ── Razorpay webhook ──────────────────────────────────────────────────────────
router.post("/webhooks/razorpay", async (req: Request & { rawBody?: string }, res): Promise<void> => {
  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!webhookSecret) {
    logger.warn("RAZORPAY_WEBHOOK_SECRET is not set — rejecting Razorpay webhook");
    res.status(403).json({ error: "Webhook secret not configured" });
    return;
  }

  // Verify signature
  const receivedSig = req.headers["x-razorpay-signature"] as string | undefined;
  const rawBody = req.rawBody ?? JSON.stringify(req.body);
  if (!receivedSig) {
    res.status(400).json({ error: "Missing x-razorpay-signature header" });
    return;
  }
  const expectedSig = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  const receivedBuf = Buffer.from(receivedSig, "hex");
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    logger.warn("Razorpay webhook signature mismatch");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as { event: string; payload?: Record<string, any> };
  const rzSubId: string | undefined =
    event.payload?.subscription?.entity?.id ??
    event.payload?.payment?.entity?.subscription_id;

  logger.info({ event: event.event, rzSubId }, "Razorpay webhook received");

  if (!rzSubId) {
    res.status(200).json({ ok: true });
    return;
  }

  // Look up the subscription row
  const result = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.razorpaySubscriptionId, rzSubId))
    .limit(1);
  const sub = result[0];

  if (!sub) {
    logger.warn({ rzSubId }, "No subscription row found for Razorpay subscription");
    res.status(200).json({ ok: true }); // ack anyway
    return;
  }

  // Determine new status + period end from event
  let newStatus: SubStatus | null = null;
  let newPeriodEnd: Date | null = null;

  const entity = event.payload?.subscription?.entity ?? event.payload?.payment?.entity;
  const chargeAt: number | undefined = entity?.charge_at;
  if (chargeAt) {
    newPeriodEnd = new Date(chargeAt * 1000);
  }

  switch (event.event) {
    case "subscription.activated":
    case "payment.captured":
      newStatus = "active";
      break;
    case "subscription.charged":
      newStatus = "active";
      break;
    case "subscription.halted":
    case "subscription.payment_failed":
      newStatus = "past_due";
      break;
    case "subscription.cancelled":
    case "subscription.completed":
      newStatus = "cancelled";
      break;
    default:
      logger.info({ event: event.event }, "Unhandled Razorpay event — ignoring");
  }

  if (newStatus) {
    // Determine plan from the Razorpay plan id
    const rzPlanId: string | undefined = entity?.plan_id;
    let planKey: PlanKey = sub.plan as PlanKey;
    if (rzPlanId) {
      if (rzPlanId === process.env["RAZORPAY_PRO_PLAN_ID"]) planKey = "pro";
      else if (rzPlanId === process.env["RAZORPAY_STARTER_PLAN_ID"]) planKey = "starter";
    }

    await db
      .update(subscriptionsTable)
      .set({
        status:          newStatus,
        plan:            planKey,
        ...(newPeriodEnd ? { currentPeriodEnd: newPeriodEnd } : {}),
        updatedAt:       new Date(),
      })
      .where(eq(subscriptionsTable.id, sub.id));

    logger.info({ subId: sub.id, newStatus, planKey }, "Subscription updated from Razorpay webhook");
  }

  res.status(200).json({ ok: true });
});

export default router;
