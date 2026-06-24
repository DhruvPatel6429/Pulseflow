import { db } from "@workspace/db";
import { bookingsTable, servicesTable, businessesTable, reminderJobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface WorkingHours {
  [day: string]: { open: string; close: string; isOpen: boolean };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getDayKey(dateStr: string): string {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const d = new Date(dateStr + "T00:00:00Z");
  return days[d.getUTCDay()];
}

export async function getAvailableSlots(
  businessId: number,
  serviceId: number,
  date: string
): Promise<TimeSlot[]> {
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!business) throw new Error("Business not found");

  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, businessId)));

  if (!service) throw new Error("Service not found");

  const workingHours = business.workingHours as WorkingHours | null;
  const dayKey = getDayKey(date);
  const dayHours = workingHours?.[dayKey];

  if (!dayHours || !dayHours.isOpen) {
    return [];
  }

  const openMin = timeToMinutes(dayHours.open);
  const closeMin = timeToMinutes(dayHours.close);
  const duration = service.durationMinutes;

  // Fetch existing bookings for the day
  const existingBookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.businessId, businessId),
        eq(bookingsTable.bookingDate, date),
        // Not cancelled or no-show
      )
    );

  const bookedSlots = existingBookings
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .map((b) => ({
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime),
    }));

  const slots: TimeSlot[] = [];
  let current = openMin;

  while (current + duration <= closeMin) {
    const slotEnd = current + duration;
    const startStr = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;
    const endStr = `${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}`;

    const hasConflict = bookedSlots.some(
      (b) => !(slotEnd <= b.start || current >= b.end)
    );

    slots.push({ startTime: startStr, endTime: endStr, available: !hasConflict });
    current += 30; // 30-min intervals
  }

  return slots;
}

export async function checkConflict(
  businessId: number,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: number
): Promise<boolean> {
  const existing = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.businessId, businessId),
        eq(bookingsTable.bookingDate, date)
      )
    );

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  return existing
    .filter(
      (b) =>
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        b.id !== excludeBookingId
    )
    .some((b) => {
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      return !(endMin <= bStart || startMin >= bEnd);
    });
}

export async function scheduleReminderJobs(
  bookingId: number,
  businessId: number,
  customerId: number | null,
  bookingDate: string,
  startTime: string
) {
  const bookingDateTime = new Date(`${bookingDate}T${startTime}:00+05:30`);

  const jobs = [
    {
      businessId,
      customerId,
      bookingId,
      type: "reminder_24h" as const,
      scheduledFor: new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000),
      status: "pending" as const,
      payload: { bookingId },
    },
    {
      businessId,
      customerId,
      bookingId,
      type: "reminder_2h" as const,
      scheduledFor: new Date(bookingDateTime.getTime() - 2 * 60 * 60 * 1000),
      status: "pending" as const,
      payload: { bookingId },
    },
    {
      businessId,
      customerId,
      bookingId,
      type: "review_request" as const,
      scheduledFor: new Date(bookingDateTime.getTime() + 2 * 60 * 60 * 1000),
      status: "pending" as const,
      payload: { bookingId },
    },
  ];

  for (const job of jobs) {
    if (job.scheduledFor > new Date()) {
      await db.insert(reminderJobsTable).values(job);
    }
  }

  logger.info({ bookingId }, "Scheduled reminder jobs");
}
