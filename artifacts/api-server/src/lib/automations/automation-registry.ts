/**
 * Automation Registry
 *
 * Maps automation event types to their handler functions.
 * Avoids giant if/else chains — add a new automation type by:
 *   1. Adding to AutomationEventType in automation-types.ts
 *   2. Registering a handler here
 *   3. Done — the job runner picks it up automatically.
 */

import type { AutomationEventType, ProcessResult } from "./automation-types";
import { db } from "@workspace/db";
import {
  bookingsTable, customersTable, servicesTable,
  businessesTable, automationSettingsTable, reminderJobsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendWhatsappMessage } from "../channels/whatsapp";
import {
  buildAutomationMessage, formatDateLabel, formatTimeLabel,
  type TemplateKey,
} from "../templates/message-templates";
import { logger } from "../logger";

type ReminderJob = typeof reminderJobsTable.$inferSelect;

type HandlerFn = (job: ReminderJob) => Promise<ProcessResult>;

// ─── Handler implementations ──────────────────────────────────────────────────

async function loadJobContext(job: ReminderJob) {
  const [booking] = job.bookingId
    ? await db.select().from(bookingsTable).where(eq(bookingsTable.id, job.bookingId))
    : [null];
  const [customer] = job.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, job.customerId))
    : [null];
  const [service] = booking
    ? await db.select().from(servicesTable).where(eq(servicesTable.id, booking.serviceId))
    : [null];
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, job.businessId));
  const [automation] = await db
    .select()
    .from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, job.businessId));

  return { booking, customer, service, business, automation };
}

async function sendAndMark(
  job: ReminderJob,
  templateKey: TemplateKey,
  customTemplate?: string | null
): Promise<ProcessResult> {
  const { booking, customer, service, business, automation } = await loadJobContext(job);

  // Skip if booking was cancelled/no-show
  if (booking && ["cancelled", "no_show"].includes(booking.status)) {
    return { ok: true, status: "skipped", message: "Booking cancelled/no-show" };
  }
  if (!customer || !business) {
    return { ok: false, status: "skipped", message: "Missing customer or business" };
  }

  const vars = {
    name: customer.name.split(" ")[0],
    service: service?.name ?? "your appointment",
    date: booking ? formatDateLabel(booking.bookingDate) : "",
    time: booking ? formatTimeLabel(booking.startTime) : "",
    business: business.name,
    review_link: business.reviewLink ?? "",
  };

  const message = buildAutomationMessage(templateKey, vars, customTemplate);
  if (!message) {
    return { ok: true, status: "skipped", message: "No message to send (missing review link?)" };
  }

  const result = await sendWhatsappMessage({ to: customer.phone, text: message });
  if (!result.ok) {
    return { ok: false, status: "failed", error: result.error };
  }

  // Update booking flags
  if (booking) {
    if (templateKey === "reminder_24h") {
      await db.update(bookingsTable).set({ reminder24hSent: true }).where(eq(bookingsTable.id, booking.id));
    } else if (templateKey === "reminder_2h") {
      await db.update(bookingsTable).set({ reminder2hSent: true }).where(eq(bookingsTable.id, booking.id));
    } else if (templateKey === "review_request") {
      await db.update(bookingsTable).set({ reviewRequestSent: true }).where(eq(bookingsTable.id, booking.id));
    }
  }

  logger.info({ jobId: job.id, type: job.type, to: customer.phone }, "Automation message sent");
  return { ok: true, status: "sent" };
}

// ─── Individual handlers ──────────────────────────────────────────────────────

async function handleConfirmation(job: ReminderJob): Promise<ProcessResult> {
  const { automation } = await loadJobContext(job);
  return sendAndMark(job, "booking_confirmation", automation?.reminderTemplate);
}

async function handle24hReminder(job: ReminderJob): Promise<ProcessResult> {
  const { automation } = await loadJobContext(job);
  return sendAndMark(job, "reminder_24h", automation?.reminderTemplate);
}

async function handle2hReminder(job: ReminderJob): Promise<ProcessResult> {
  const { automation } = await loadJobContext(job);
  return sendAndMark(job, "reminder_2h", automation?.reminderTemplate);
}

async function handleReviewRequest(job: ReminderJob): Promise<ProcessResult> {
  const { automation } = await loadJobContext(job);
  return sendAndMark(job, "review_request", automation?.reviewTemplate);
}

async function handleRepeatReminder(job: ReminderJob): Promise<ProcessResult> {
  return sendAndMark(job, "repeat_reminder");
}

async function handleMissedFollowup(job: ReminderJob): Promise<ProcessResult> {
  return sendAndMark(job, "missed_followup");
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const HANDLERS: Partial<Record<AutomationEventType, HandlerFn>> = {
  confirmation:    handleConfirmation,
  reminder_24h:    handle24hReminder,
  reminder_2h:     handle2hReminder,
  review_request:  handleReviewRequest,
  repeat_reminder: handleRepeatReminder,
  missed_followup: handleMissedFollowup,
};

export async function dispatchAutomationEvent(job: ReminderJob): Promise<ProcessResult> {
  const handler = HANDLERS[job.type as AutomationEventType];
  if (!handler) {
    logger.warn({ jobId: job.id, type: job.type }, "No handler registered for automation type");
    return { ok: false, status: "skipped", message: `No handler for ${job.type}` };
  }
  return handler(job);
}
