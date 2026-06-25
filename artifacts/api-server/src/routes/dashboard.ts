import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import {
  bookingsTable, customersTable, servicesTable,
  aiActionLogsTable, reminderJobsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

function today(): string { return new Date().toISOString().slice(0, 10); }
function weekStart(): string {
  const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10);
}
function weekEnd(): string {
  const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0, 10);
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

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const biz = req.businessId;
  const todayStr = today();
  const weekStartStr = weekStart();
  const weekEndStr = weekEnd();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  const allBookings = await db.select().from(bookingsTable)
    .where(eq(bookingsTable.businessId, biz));

  const todayBookings = allBookings.filter((b) => b.bookingDate === todayStr);
  const upcomingBookings = allBookings.filter(
    (b) => b.bookingDate > todayStr && b.bookingDate <= nextWeekStr && b.status !== "cancelled"
  );
  const weekBookings = allBookings.filter(
    (b) => b.bookingDate >= weekStartStr && b.bookingDate <= weekEndStr
  );
  const completedThisWeek = weekBookings.filter((b) => b.status === "completed");

  const [customerCount] = await db.select({ count: sql<number>`count(*)` })
    .from(customersTable).where(eq(customersTable.businessId, biz));

  const [pendingAiCount] = await db.select({ count: sql<number>`count(*)` })
    .from(aiActionLogsTable)
    .where(and(eq(aiActionLogsTable.businessId, biz), eq(aiActionLogsTable.status, "pending")));

  const [remindersDue] = await db.select({ count: sql<number>`count(*)` })
    .from(reminderJobsTable)
    .where(and(eq(reminderJobsTable.businessId, biz), eq(reminderJobsTable.status, "pending")));

  const total = allBookings.filter((b) => ["completed", "no_show"].includes(b.status)).length;
  const noShows = allBookings.filter((b) => b.status === "no_show").length;
  const noShowRate = total > 0 ? Math.round((noShows / total) * 100) : 0;

  const services = await db.select().from(servicesTable).where(eq(servicesTable.businessId, biz));
  const serviceMap = new Map(services.map((s) => [s.id, Number(s.price)]));
  const revenueThisWeek = completedThisWeek.reduce((sum, b) => sum + (serviceMap.get(b.serviceId) ?? 0), 0);

  const statusCounts: Record<string, number> = {};
  for (const b of allBookings) statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
  const bookingsByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const serviceCounts: Record<number, { name: string; count: number; revenue: number }> = {};
  for (const b of weekBookings.filter((b) => b.status !== "cancelled")) {
    const svc = services.find((s) => s.id === b.serviceId);
    if (!svc) continue;
    if (!serviceCounts[b.serviceId]) serviceCounts[b.serviceId] = { name: svc.name, count: 0, revenue: 0 };
    serviceCounts[b.serviceId].count++;
    if (b.status === "completed") serviceCounts[b.serviceId].revenue += Number(svc.price);
  }
  const topServices = Object.entries(serviceCounts)
    .map(([serviceId, data]) => ({ serviceId: parseInt(serviceId, 10), ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    todayCount: todayBookings.length,
    upcomingCount: upcomingBookings.length,
    pendingAiActions: Number(pendingAiCount?.count ?? 0),
    totalCustomers: Number(customerCount?.count ?? 0),
    completedThisWeek: completedThisWeek.length,
    revenueThisWeek,
    noShowRate,
    remindersDueToday: Number(remindersDue?.count ?? 0),
    reviewsSentThisWeek: 0,
    repeatRemindersScheduled: 0,
    bookingsByStatus,
    topServices,
  });
});

router.get("/dashboard/today", async (req, res): Promise<void> => {
  const bookings = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.businessId, req.businessId), eq(bookingsTable.bookingDate, today())))
    .orderBy(bookingsTable.startTime);
  const enriched = await Promise.all(bookings.map(enrichBooking));
  res.json(enriched);
});

router.get("/dashboard/upcoming", async (req, res): Promise<void> => {
  const todayStr = today();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  const bookings = await db.select().from(bookingsTable)
    .where(and(
      eq(bookingsTable.businessId, req.businessId),
      gte(bookingsTable.bookingDate, todayStr),
      lte(bookingsTable.bookingDate, nextWeekStr)
    ))
    .orderBy(bookingsTable.bookingDate, bookingsTable.startTime);

  const filtered = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const enriched = await Promise.all(filtered.map(enrichBooking));
  res.json(enriched);
});

export default router;
