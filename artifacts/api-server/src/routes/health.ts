import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/ready", async (_req, res) => {
  try {
    // Ping DB to test connection health
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ready", database: "connected" });
  } catch (err) {
    logger.error({ err }, "Readiness check failed: Database connection down");
    res.status(503).json({ status: "error", message: "Database connection failed" });
  }
});

export default router;
