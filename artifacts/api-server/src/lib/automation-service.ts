/**
 * Automation Service
 *
 * Clean abstraction for scheduling and processing automation events.
 * All functions are idempotent — safe to call multiple times.
 *
 * Production upgrade path:
 *   Replace processDueAutomationEvents() scheduler call with BullMQ/pg-boss worker.
 *   Replace sendReminderMessage() with actual WhatsApp Cloud API send.
 */

import { db } from "@workspace/db";
import {
  reminderJobsTable,
  bookingsTable,
  servicesTable,
  customersTable,
  businessesTable,
  automationSettingsTable,
} from "@workspace/db";
import { eq, and, lte, ne } from "drizzle-orm";
import { logger } from "./logger";
import { sendWhatsappMessage } from "./whatsapp";

export type JobType =
  | "confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "review_request"
  | "repeat_reminder"
  | "missed_followup";

/**
 * Create a scheduled automation event for a booking.
 * Idempotent: skips if a job of the same type+bookingId already exists
 * in pending/sent state.
 */
export async function createAutomationEvent(
  businessId: number,
  customerId: number | null,
  bookingId: number,
  type: JobType,
  scheduledFor: Date,
  payload?: Record<string, unknown>
): Promise<void> {
  // Idempotency: don't duplicate
  const existing = await db
    .select({ id: reminderJobsTable.id })
    .from(reminderJobsTable)
    .where(
      and(
        eq(reminderJobsTable.bookingId, bookingId),
        eq(reminderJobsTable.type, type),
        ne(reminderJobsTable.status, "cancelled")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    logger.info({ bookingId, type }, "Automation event already exists, skipping");
    return;
  }

  // Only schedule future jobs (or immediate ones within 5 min past)
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  if (scheduledFor < cutoff) {
    logger.info({ bookingId, type, scheduledFor }, "Automation event in the past, skipping");
    return;
  }

  await db.insert(reminderJobsTable).values({
    businessId,
    customerId,
    bookingId,
    type,
    scheduledFor,
    status: "pending",
    payload: payload ?? {},
  });

  logger.info({ bookingId, type, scheduledFor }, "Automation event created");
}

/**
 * Schedule all automation events for a newly confirmed booking.
 */
export async function scheduleBookingAutomations(bookingId: number): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return;

  const [automation] = await db
    .select()
    .from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, booking.businessId));

  const bookingDT = new Date(`${booking.bookingDate}T${booking.startTime}:00+05:30`);
  const now = new Date();

  // Immediate confirmation
  await createAutomationEvent(
    booking.businessId,
    booking.customerId,
    bookingId,
    "confirmation",
    now,
    {}
  );

  // 24h reminder
  if (automation?.reminder24hEnabled !== false) {
    await createAutomationEvent(
      booking.businessId,
      booking.customerId,
      bookingId,
      "reminder_24h",
      new Date(bookingDT.getTime() - 24 * 60 * 60 * 1000),
      {}
    );
  }

  // 2h reminder
  if (automation?.reminder2hEnabled !== false) {
    await createAutomationEvent(
      booking.businessId,
      booking.customerId,
      bookingId,
      "reminder_2h",
      new Date(bookingDT.getTime() - 2 * 60 * 60 * 1000),
      {}
    );
  }
}

/**
 * Schedule post-completion automation events (review request + repeat reminder).
 */
export async function scheduleCompletionAutomations(bookingId: number): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) return;

  const [service] = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.id, booking.serviceId));

  const [automation] = await db
    .select()
    .from(automationSettingsTable)
    .where(eq(automationSettingsTable.businessId, booking.businessId));

  const now = new Date();

  // Review request (X hours after completion)
  if (automation?.reviewRequestEnabled !== false) {
    const delayHours = automation?.reviewRequestDelayHours ?? 2;
    await createAutomationEvent(
      booking.businessId,
      booking.customerId,
      bookingId,
      "review_request",
      new Date(now.getTime() + delayHours * 60 * 60 * 1000),
      { reviewLink: undefined }
    );
  }

  // Repeat reminder (based on service config)
  if (automation?.repeatReminderEnabled !== false && service?.repeatReminderDays) {
    await createAutomationEvent(
      booking.businessId,
      booking.customerId,
      bookingId,
      "repeat_reminder",
      new Date(now.getTime() + service.repeatReminderDays * 24 * 60 * 60 * 1000),
      { serviceName: service.name, repeatReminderDays: service.repeatReminderDays }
    );
  }
}

/**
 * Process all due automation events.
 * Called by the cron route or manually from the dashboard.
 * Returns a summary of results.
 */
export async function processDueAutomationEvents(businessId?: number): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const now = new Date();
  const query = db
    .select()
    .from(reminderJobsTable)
    .where(
      and(
        eq(reminderJobsTable.status, "pending"),
        lte(reminderJobsTable.scheduledFor, now)
      )
    );

  const dueJobs = await query;
  const jobs = businessId
    ? dueJobs.filter((j) => j.businessId === businessId)
    : dueJobs;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const result = await processJob(job);
      if (result === "sent") sent++;
      else if (result === "skipped") skipped++;
    } catch (e) {
      failed++;
      logger.error({ jobId: job.id, type: job.type, e }, "Automation job failed");
      await db
        .update(reminderJobsTable)
        .set({ status: "failed" })
        .where(eq(reminderJobsTable.id, job.id));
    }
  }

  return { processed: jobs.length, sent, failed, skipped };
}

async function processJob(
  job: typeof reminderJobsTable.$inferSelect
): Promise<"sent" | "skipped"> {
  // Load related entities
  const [booking] = job.bookingId
    ? await db.select().from(bookingsTable).where(eq(bookingsTable.id, job.bookingId))
    : [null];

  // Skip cancelled bookings
  if (booking && ["cancelled", "no_show"].includes(booking.status)) {
    await db
      .update(reminderJobsTable)
      .set({ status: "cancelled" })
      .where(eq(reminderJobsTable.id, job.id));
    return "skipped";
  }

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

  if (!customer || !business) {
    await db
      .update(reminderJobsTable)
      .set({ status: "skipped" })
      .where(eq(reminderJobsTable.id, job.id));
    return "skipped";
  }

  const message = buildMessage(job.type as JobType, {
    customerName: customer.name.split(" ")[0],
    serviceName: service?.name ?? "your appointment",
    businessName: business.name,
    bookingDate: booking?.bookingDate ?? "",
    startTime: booking?.startTime ?? "",
    reviewLink: business.reviewLink ?? "",
    reminderTemplate: automation?.reminderTemplate ?? "",
    reviewTemplate: automation?.reviewTemplate ?? "",
    repeatReminderDays: service?.repeatReminderDays ?? null,
  });

  if (!message) {
    await db
      .update(reminderJobsTable)
      .set({ status: "skipped" })
      .where(eq(reminderJobsTable.id, job.id));
    return "skipped";
  }

  await sendWhatsappMessage({ to: customer.phone, text: message });

  await db
    .update(reminderJobsTable)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(reminderJobsTable.id, job.id));

  // Update booking reminder flags
  if (booking) {
    if (job.type === "reminder_24h") {
      await db
        .update(bookingsTable)
        .set({ reminder24hSent: true })
        .where(eq(bookingsTable.id, booking.id));
    } else if (job.type === "reminder_2h") {
      await db
        .update(bookingsTable)
        .set({ reminder2hSent: true })
        .where(eq(bookingsTable.id, booking.id));
    } else if (job.type === "review_request") {
      await db
        .update(bookingsTable)
        .set({ reviewRequestSent: true })
        .where(eq(bookingsTable.id, booking.id));
    }
  }

  logger.info({ jobId: job.id, type: job.type, customerId: customer.id }, "Automation job sent");
  return "sent";
}

function formatDateLabel(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function formatTimeLabel(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function buildMessage(
  type: JobType,
  ctx: {
    customerName: string;
    serviceName: string;
    businessName: string;
    bookingDate: string;
    startTime: string;
    reviewLink: string;
    reminderTemplate: string;
    reviewTemplate: string;
    repeatReminderDays: number | null;
  }
): string | null {
  const dateLabel = formatDateLabel(ctx.bookingDate);
  const timeLabel = formatTimeLabel(ctx.startTime);

  switch (type) {
    case "confirmation":
      return `Hi ${ctx.customerName}! ✅ Your ${ctx.serviceName} at ${ctx.businessName} is confirmed for ${dateLabel} at ${timeLabel}. See you then! 💅`;

    case "reminder_24h": {
      if (ctx.reminderTemplate) {
        return ctx.reminderTemplate
          .replace("{name}", ctx.customerName)
          .replace("{service}", ctx.serviceName)
          .replace("{time}", timeLabel)
          .replace("{date}", dateLabel)
          .replace("{business}", ctx.businessName);
      }
      return `Hi ${ctx.customerName}! 💫 Just a reminder that your ${ctx.serviceName} is scheduled for tomorrow, ${dateLabel} at ${timeLabel} at ${ctx.businessName}. Can't wait to see you! 🌸`;
    }

    case "reminder_2h": {
      if (ctx.reminderTemplate) {
        return ctx.reminderTemplate
          .replace("{name}", ctx.customerName)
          .replace("{service}", ctx.serviceName)
          .replace("{time}", timeLabel)
          .replace("{date}", dateLabel)
          .replace("{business}", ctx.businessName);
      }
      return `Hi ${ctx.customerName}! ⏰ Your ${ctx.serviceName} is in 2 hours at ${timeLabel}. We're excited to see you at ${ctx.businessName}! 🌟`;
    }

    case "review_request": {
      if (!ctx.reviewLink) return null;
      if (ctx.reviewTemplate) {
        return ctx.reviewTemplate
          .replace("{name}", ctx.customerName)
          .replace("{service}", ctx.serviceName)
          .replace("{business}", ctx.businessName)
          .replace("{review_link}", ctx.reviewLink);
      }
      return `Hi ${ctx.customerName}! 🌸 Hope you loved your ${ctx.serviceName} at ${ctx.businessName}! If you have a minute, we'd love a Google review — it helps us so much 🙏\n${ctx.reviewLink}`;
    }

    case "repeat_reminder": {
      const days = ctx.repeatReminderDays;
      return `Hi ${ctx.customerName}! 💆 It's been a while since your last ${ctx.serviceName}. Would you like to book your next session at ${ctx.businessName}? Reply with your preferred date and time!`;
    }

    case "missed_followup":
      return `Hi ${ctx.customerName}, we noticed you missed your ${ctx.serviceName} today. We'd love to reschedule at your convenience — just reply with a time that works! 😊`;

    default:
      return null;
  }
}
