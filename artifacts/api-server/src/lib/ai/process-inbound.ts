/**
 * AI Layer — Process Inbound Message
 *
 * Main entry point for inbound WhatsApp messages.
 * Orchestrates: customer lookup → context load → classify → reply →
 *   booking creation → automation scheduling → action logging.
 *
 * Used by:
 *   - POST /api/webhooks/whatsapp (live)
 *   - POST /api/sandbox/send-message (demo simulator)
 */

import { db } from "@workspace/db";
import {
  businessesTable, servicesTable, customersTable,
  conversationsTable, messagesTable, aiActionLogsTable,
  bookingsTable, automationSettingsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { classifyIntent } from "./classifier";
import { buildReply } from "./responder";
import type { AIIntentResult, BusinessContext, ServiceContext } from "./types";
import { scheduleBookingAutomations } from "../automation-service";
import { sendWhatsappMessage } from "../channels/whatsapp";
import { logger } from "../logger";

export interface InboundProcessResult {
  customer: { id: number; name: string; phone: string };
  intentResult: AIIntentResult;
  autoSent: boolean;
  bookingCreated?: number;
  actionLogId?: number;
}

export async function processInboundCustomerMessage(
  businessId: number,
  phone: string,
  messageText: string,
  customerName?: string
): Promise<InboundProcessResult> {
  // ── 1. Load business context ────────────────────────────────────────────
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));
  if (!business) throw new Error(`Business ${businessId} not found`);

  // ── 2. Load automation settings ─────────────────────────────────────────
  const [automation] = await db
    .select()
    .from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, businessId));

  const threshold = automation?.aiConfidenceThreshold ?? 0.8;
  const autoReplyEnabled = automation?.aiAutoReplyEnabled ?? true;

  // ── 3. Find or create customer ──────────────────────────────────────────
  let [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.businessId, businessId), eq(customersTable.phone, phone)));

  if (!customer) {
    [customer] = await db
      .insert(customersTable)
      .values({
        businessId,
        name: customerName ?? phone,
        phone,
        source: "whatsapp",
      })
      .returning();
  } else if (customerName && customer.name === phone) {
    // Update name if we now have one
    [customer] = await db
      .update(customersTable)
      .set({ name: customerName })
      .where(eq(customersTable.id, customer.id))
      .returning();
  }

  // ── 4. Find or create conversation ──────────────────────────────────────
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.businessId, businessId),
        eq(conversationsTable.customerId, customer.id),
        eq(conversationsTable.status, "active")
      )
    );

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ businessId, customerId: customer.id, channel: "whatsapp", status: "active", lastMessageAt: new Date() })
      .returning();
  }

  // ── 5. Store inbound message ─────────────────────────────────────────────
  await db.insert(messagesTable).values({
    conversationId: conversation.id,
    direction: "inbound",
    content: messageText,
    messageType: "text",
    aiGenerated: false,
    requiresApproval: false,
    sentAt: new Date(),
  });

  // Update conversation timestamp
  await db
    .update(conversationsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 6. Load active services ──────────────────────────────────────────────
  const rawServices = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.businessId, businessId), eq(servicesTable.isActive, true)));

  const services: ServiceContext[] = rawServices.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    durationMinutes: s.durationMinutes,
    description: s.description,
    requiresConsultation: s.requiresConsultation,
    requiresTokenAdvance: s.requiresTokenAdvance,
    repeatReminderDays: s.repeatReminderDays,
  }));

  const businessCtx: BusinessContext = {
    id: business.id,
    name: business.name,
    address: business.address,
    googleMapsLink: business.googleMapsLink,
    category: business.category,
    description: business.description,
    timezone: business.timezone,
    workingHours: business.workingHours,
    cancellationPolicy: business.cancellationPolicy,
    tokenPolicy: business.tokenPolicy,
    preferredTone: business.preferredTone,
    reviewLink: business.reviewLink,
  };

  // ── 7. Classify + build reply ────────────────────────────────────────────
  const classification = classifyIntent(messageText);
  const intentResult = await buildReply({ classification, message: messageText, business: businessCtx, services, threshold });

  logger.info(
    { businessId, customerId: customer.id, intent: intentResult.intent, confidence: intentResult.confidence },
    "AI intent classified"
  );

  // ── 8. Decide: auto-send or queue for approval ───────────────────────────
  const shouldAutoSend =
    autoReplyEnabled &&
    intentResult.confidence >= threshold &&
    !intentResult.actionSuggestion.shouldEscalateToOwner;

  // ── 9. Log AI action ─────────────────────────────────────────────────────
  const [actionLog] = await db
    .insert(aiActionLogsTable)
    .values({
      businessId,
      customerId: customer.id,
      actionType: intentResult.intent,
      inputSummary: messageText,
      outputSummary: `Intent: ${intentResult.intent}, confidence: ${intentResult.confidence.toFixed(2)}`,
      replyDraft: intentResult.replyDraft,
      confidenceScore: intentResult.confidence,
      status: shouldAutoSend ? "auto_sent" : "pending",
      requiresHumanReview: !shouldAutoSend,
    })
    .returning();

  // ── 10. Auto-send or store as pending ───────────────────────────────────
  let autoSent = false;
  if (shouldAutoSend) {
    await sendWhatsappMessage({ to: customer.phone, text: intentResult.replyDraft });

    // Store outbound message
    await db.insert(messagesTable).values({
      conversationId: conversation.id,
      direction: "outbound",
      content: intentResult.replyDraft,
      messageType: "text",
      aiGenerated: true,
      requiresApproval: false,
      sentAt: new Date(),
    });

    await db
      .update(conversationsTable)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conversation.id));

    autoSent = true;
    logger.info({ customerId: customer.id }, "AI reply auto-sent");
  } else {
    // Store as pending outbound (requires approval)
    await db.insert(messagesTable).values({
      conversationId: conversation.id,
      direction: "outbound",
      content: intentResult.replyDraft,
      messageType: "text",
      aiGenerated: true,
      requiresApproval: true,
      sentAt: null,
    });
    logger.info({ customerId: customer.id, actionLogId: actionLog.id }, "AI reply queued for review");
  }

  // ── 11. Create booking if AI extracted a booking request ─────────────────
  let bookingCreated: number | undefined;
  if (
    intentResult.actionSuggestion.shouldCreatePendingBooking &&
    intentResult.matchedService &&
    intentResult.extractedEntities.requestedDate
  ) {
    try {
      const svc = intentResult.matchedService;
      const startTime = intentResult.extractedEntities.requestedTime ?? "10:00";
      const [h, m] = startTime.split(":").map(Number);
      const totalMin = h * 60 + m + svc.durationMinutes;
      const endTime = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

      const [booking] = await db
        .insert(bookingsTable)
        .values({
          businessId,
          customerId: customer.id,
          serviceId: svc.id,
          bookingDate: intentResult.extractedEntities.requestedDate,
          startTime,
          endTime,
          status: "pending",
          source: "whatsapp",
          createdByAI: true,
        })
        .returning();

      bookingCreated = booking.id;
      await scheduleBookingAutomations(booking.id);
      logger.info({ bookingId: booking.id }, "AI created pending booking");
    } catch (e) {
      logger.error({ e }, "Failed to create AI booking");
    }
  }

  return {
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    intentResult,
    autoSent,
    bookingCreated,
    actionLogId: actionLog.id,
  };
}
