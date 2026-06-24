import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { customersTable, bookingsTable, servicesTable } from "@workspace/db";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const DEFAULT_BUSINESS_ID = 1;

router.get("/customers", async (req, res): Promise<void> => {
  const search = req.query.search as string | undefined;
  const page = parseInt((req.query.page as string) ?? "1", 10);
  const limit = parseInt((req.query.limit as string) ?? "20", 10);
  const offset = (page - 1) * limit;

  let query = db.select().from(customersTable)
    .where(eq(customersTable.businessId, DEFAULT_BUSINESS_ID));

  let total = 0;
  let customers;

  if (search) {
    customers = await db.select().from(customersTable)
      .where(and(
        eq(customersTable.businessId, DEFAULT_BUSINESS_ID),
        ilike(customersTable.name, `%${search}%`)
      ))
      .orderBy(desc(customersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(customersTable)
      .where(and(
        eq(customersTable.businessId, DEFAULT_BUSINESS_ID),
        ilike(customersTable.name, `%${search}%`)
      ));
    total = Number(countRow?.count ?? 0);
  } else {
    customers = await db.select().from(customersTable)
      .where(eq(customersTable.businessId, DEFAULT_BUSINESS_ID))
      .orderBy(desc(customersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(customersTable)
      .where(eq(customersTable.businessId, DEFAULT_BUSINESS_ID));
    total = Number(countRow?.count ?? 0);
  }

  res.json({ customers, total });
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.insert(customersTable).values({
    ...parsed.data,
    businessId: DEFAULT_BUSINESS_ID,
  }).returning();
  res.status(201).json(customer);
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [customer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.businessId, DEFAULT_BUSINESS_ID)));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const bookings = await db.select({
    booking: bookingsTable,
    service: servicesTable,
  }).from(bookingsTable)
    .leftJoin(servicesTable, eq(bookingsTable.serviceId, servicesTable.id))
    .where(and(eq(bookingsTable.customerId, id), eq(bookingsTable.businessId, DEFAULT_BUSINESS_ID)))
    .orderBy(desc(bookingsTable.bookingDate));

  const mappedBookings = bookings.map(({ booking, service }) => ({
    ...booking,
    customer,
    service: service ? { ...service, price: Number(service.price) } : null,
  }));

  const upcomingBooking = mappedBookings.find(
    (b) => b.bookingDate >= new Date().toISOString().slice(0, 10) && b.status !== "cancelled" && b.status !== "no_show"
  );

  res.json({ ...customer, bookings: mappedBookings, upcomingBooking: upcomingBooking ?? null });
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.update(customersTable).set(parsed.data as Partial<typeof customersTable.$inferInsert>)
    .where(and(eq(customersTable.id, id), eq(customersTable.businessId, DEFAULT_BUSINESS_ID)))
    .returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(customer);
});

export default router;
