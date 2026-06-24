/**
 * Cron / automation processor routes.
 *
 * In production: trigger POST /api/cron/process-automations from a real cron job
 * (Replit scheduled deployments, GitHub Actions, pg-boss, BullMQ, etc.)
 *
 * In development: call manually from dashboard or test with curl:
 *   curl -X POST localhost:80/api/cron/process-automations
 */

import { Router } from "express";
import type { IRouter } from "express";
import { processDueAutomationEvents } from "../lib/automation-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/cron/process-automations", async (req, res): Promise<void> => {
  const businessId = req.query.businessId
    ? parseInt(req.query.businessId as string, 10)
    : undefined;

  logger.info({ businessId }, "Processing due automation events");

  const result = await processDueAutomationEvents(businessId);

  logger.info(result, "Automation processing complete");

  res.json({
    ok: true,
    ...result,
    processedAt: new Date().toISOString(),
  });
});

export default router;
