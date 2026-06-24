import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { reminderJobsTable, customersTable, bookingsTable, servicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const DEFAULT_BUSINESS_ID = 1;

async function enrichJob(job: typeof reminderJobsTable.$inferSelect) {
  const [customer] = job.customerId
    ? await db.select().from(customersTable).where(eq(customersTable.id, job.customerId))
    : [null];
  const [booking] = job.bookingId
    ? await db.select().from(bookingsTable).where(eq(bookingsTable.id, job.bookingId))
    : [null];
  const [service] = booking?.serviceId
    ? await db.select().from(servicesTable).where(eq(servicesTable.id, booking.serviceId))
    : [null];
  return {
    ...job,
    customer: customer ?? null,
    booking: booking ? {
      ...booking,
      service: service ? { ...service, price: Number(service.price) } : null,
      customer: customer ?? null,
    } : null,
  };
}

router.get("/jobs", async (req, res): Promise<void> => {
  const { status, type } = req.query;
  let rows = await db.select().from(reminderJobsTable)
    .where(eq(reminderJobsTable.businessId, DEFAULT_BUSINESS_ID));

  if (status) rows = rows.filter((j) => j.status === status);
  if (type) rows = rows.filter((j) => j.type === type);

  const enriched = await Promise.all(rows.map(enrichJob));
  res.json(enriched);
});

router.post("/jobs/:id/trigger", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [job] = await db.select().from(reminderJobsTable)
    .where(and(eq(reminderJobsTable.id, id), eq(reminderJobsTable.businessId, DEFAULT_BUSINESS_ID)));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const [updated] = await db.update(reminderJobsTable)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(reminderJobsTable.id, id))
    .returning();
  res.json(await enrichJob(updated));
});

export default router;
