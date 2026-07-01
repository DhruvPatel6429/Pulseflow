import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable, servicesTable, customersTable, reminderJobsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  CreateBookingBody,
  UpdateBookingBody,
  CancelBookingBody,
  RescheduleBookingBody,
} from "@workspace/api-zod";
import { checkConflict, getAvailableSlots } from "../lib/booking-engine";
import { scheduleBookingAutomations, scheduleCompletionAutomations } from "../lib/automation-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

async function enrichBooking(booking: typeof bookingsTable.$inferSelect) {
  const [service] = booking.serviceId
    ? await db.select().from(servicesTable).where(eq(servicesTable.id, booking.serviceId))
    : [null];
  const [customer] = booking.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, booking.customerId))
    : [null];
  return {
    ...booking,
    service: service ? { ...service, price: Number(service.price) } : null,
    customer: customer ?? null,
  };
}

// GET /bookings/available-slots — must be before /:id
router.get("/bookings/available-slots", async (req, res): Promise<void> => {
  const date = req.query.date as string;
  const serviceId = parseInt(req.query.serviceId as string, 10);
  if (!date || isNaN(serviceId)) {
    res.status(400).json({ error: "date and serviceId are required" });
    return;
  }
  const slots = await getAvailableSlots(req.businessId, serviceId, date);
  res.json({ date, serviceId, slots });
});

router.get("/bookings", async (req, res): Promise<void> => {
  const { date, status, serviceId, customerId, from, to } = req.query;
  let rows = await db.select().from(bookingsTable)
    .where(eq(bookingsTable.businessId, req.businessId))
    .orderBy(desc(bookingsTable.bookingDate));

  if (date) rows = rows.filter((b) => b.bookingDate === date);
  if (status) rows = rows.filter((b) => b.status === status);
  if (serviceId) rows = rows.filter((b) => b.serviceId === parseInt(serviceId as string, 10));
  if (customerId) rows = rows.filter((b) => b.customerId === parseInt(customerId as string, 10));
  if (from) rows = rows.filter((b) => b.bookingDate >= (from as string));
  if (to) rows = rows.filter((b) => b.bookingDate <= (to as string));

  const enriched = await Promise.all(rows.map(enrichBooking));
  res.json(enriched);
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  // Multi-tenant check for service
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, data.serviceId), eq(servicesTable.businessId, req.businessId)));
  if (!service) {
    res.status(400).json({ error: "Service not found" });
    return;
  }

  const endTime = addMinutes(data.startTime, service.durationMinutes);
  const conflict = await checkConflict(req.businessId, data.bookingDate, data.startTime, endTime);
  if (conflict) {
    res.status(409).json({ error: "Slot is already booked" });
    return;
  }

  // Wrap mutations in a transaction
  const booking = await db.transaction(async (tx) => {
    let customerId = data.customerId ?? null;
    if (!customerId && data.customerPhone) {
      const [existingCustomer] = await tx
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.businessId, req.businessId), eq(customersTable.phone, data.customerPhone)));
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const [newCustomer] = await tx
          .insert(customersTable)
          .values({
            businessId: req.businessId,
            name: data.customerName ?? "Guest",
            phone: data.customerPhone,
            source: "whatsapp",
          })
          .returning();
        customerId = newCustomer.id;
      }
    }

    const [newBooking] = await tx
      .insert(bookingsTable)
      .values({
        businessId: req.businessId,
        customerId,
        serviceId: data.serviceId,
        bookingDate: data.bookingDate,
        startTime: data.startTime,
        endTime,
        status: "pending",
        source: (data.source as "whatsapp" | "manual" | "dashboard") ?? "manual",
        notes: data.notes ?? null,
        createdByAI: false,
      })
      .returning();

    return newBooking;
  });

  // Schedule automation events (confirmation, 24h reminder, 2h reminder)
  await scheduleBookingAutomations(booking.id).catch((e) =>
    logger.error({ bookingId: booking.id, e }, "Failed to schedule automations")
  );

  const enriched = await enrichBooking(booking);
  res.status(201).json(enriched);
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [booking] = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(await enrichBooking(booking));
});

router.patch("/bookings/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [booking] = await db.update(bookingsTable).set(parsed.data as Partial<typeof bookingsTable.$inferInsert>)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)))
    .returning();
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(await enrichBooking(booking));
});

router.post("/bookings/:id/confirm", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [booking] = await db.update(bookingsTable).set({ status: "confirmed" })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)))
    .returning();
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(await enrichBooking(booking));
});

router.post("/bookings/:id/cancel", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [booking] = await db.update(bookingsTable).set({ status: "cancelled" })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)))
    .returning();
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  // Cancel pending jobs
  await db.update(reminderJobsTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(reminderJobsTable.bookingId, id),
        eq(reminderJobsTable.businessId, req.businessId),
        eq(reminderJobsTable.status, "pending")
      )
    );

  res.json(await enrichBooking(booking));
});

router.post("/bookings/:id/complete", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const updatedBooking = await db.transaction(async (tx) => {
    const [booking] = await tx
      .update(bookingsTable)
      .set({ status: "completed" })
      .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)))
      .returning();

    if (!booking) {
      return null;
    }

    // Update customer last visit and visit count
    if (booking.customerId) {
      const completedBookings = await tx
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.customerId, booking.customerId),
            eq(bookingsTable.businessId, req.businessId),
            eq(bookingsTable.status, "completed")
          )
        );

      await tx
        .update(customersTable)
        .set({
          lastVisitAt: new Date(),
          totalVisits: completedBookings.length,
        })
        .where(and(eq(customersTable.id, booking.customerId), eq(customersTable.businessId, req.businessId)));
    }

    return booking;
  });

  if (!updatedBooking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  // Schedule review request + repeat reminder
  await scheduleCompletionAutomations(updatedBooking.id).catch((e) =>
    logger.error({ bookingId: updatedBooking.id, e }, "Failed to schedule completion automations")
  );

  res.json(await enrichBooking(updatedBooking));
});

router.post("/bookings/:id/no-show", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [booking] = await db.update(bookingsTable).set({ status: "no_show" })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)))
    .returning();
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(await enrichBooking(booking));
});

router.post("/bookings/:id/reschedule", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = RescheduleBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { bookingDate, startTime, notes } = parsed.data;

  const [existing] = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  // Enforce businessId check on service lookup
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, existing.serviceId), eq(servicesTable.businessId, req.businessId)));

  const endTime = addMinutes(startTime, service?.durationMinutes ?? 30);

  const conflict = await checkConflict(req.businessId, bookingDate, startTime, endTime, id);
  if (conflict) {
    res.status(409).json({ error: "Slot is already booked" });
    return;
  }

  // Enforce businessId on the reschedule update
  const [booking] = await db.update(bookingsTable)
    .set({ bookingDate, startTime, endTime, status: "rescheduled", notes: notes ?? existing.notes })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.businessId, req.businessId)))
    .returning();

  res.json(await enrichBooking(booking));
});

export default router;
