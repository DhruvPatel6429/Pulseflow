import { Router } from "express";
import type { IRouter } from "express";
import { db } from "@workspace/db";
import { servicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateServiceBody,
  UpdateServiceBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/services", async (req, res): Promise<void> => {
  const services = await db.select().from(servicesTable)
    .where(eq(servicesTable.businessId, req.businessId));
  res.json(services.map(s => ({ ...s, price: Number(s.price) })));
});

router.post("/services", async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { price, ...rest } = parsed.data;
  const [svc] = await db.insert(servicesTable).values({
    ...rest,
    price: String(price ?? 0),
    businessId: req.businessId,
  }).returning();
  res.status(201).json({ ...svc, price: Number(svc.price) });
});

router.get("/services/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [svc] = await db.select().from(servicesTable)
    .where(and(eq(servicesTable.id, id), eq(servicesTable.businessId, req.businessId)));
  if (!svc) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.json({ ...svc, price: Number(svc.price) });
});

router.patch("/services/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { price, ...rest } = parsed.data;
  const updateData: Partial<typeof servicesTable.$inferInsert> = { ...rest };
  if (price !== undefined) updateData.price = String(price);
  const [svc] = await db.update(servicesTable).set(updateData)
    .where(and(eq(servicesTable.id, id), eq(servicesTable.businessId, req.businessId)))
    .returning();
  if (!svc) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.json({ ...svc, price: Number(svc.price) });
});

router.delete("/services/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(servicesTable)
    .where(and(eq(servicesTable.id, id), eq(servicesTable.businessId, req.businessId)));
  res.status(204).send();
});

export default router;
