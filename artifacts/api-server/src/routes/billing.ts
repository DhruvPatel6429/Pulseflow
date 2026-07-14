/**
 * Billing routes — Razorpay Subscriptions
 *
 * GET  /api/billing/subscription  — current subscription for the authenticated business
 * POST /api/billing/checkout      — create / return a Razorpay subscription to open checkout
 * POST /api/billing/cancel        — cancel the active Razorpay subscription
 */

import { Router } from "express";
import type { IRouter } from "express";
import Razorpay from "razorpay";
import { db, pool } from "@workspace/db";
import { subscriptionsTable, PLANS } from "@workspace/db";
import type { PlanKey } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getRazorpay(): Razorpay {
  const keyId     = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set to use billing.");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/** GET /billing/subscription */
router.get("/billing/subscription", async (req, res): Promise<void> => {
  const result = await pool.query(
    `SELECT id, business_id, plan, status, razorpay_subscription_id,
            staff_limit, current_period_end, created_at, updated_at
       FROM subscriptions
      WHERE business_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [req.businessId],
  );
  const sub = result.rows[0] ?? null;
  res.json({ subscription: sub, plans: PLANS });
});

/** POST /billing/checkout — create a Razorpay subscription and return {subscriptionId, keyId} */
router.post("/billing/checkout", async (req, res): Promise<void> => {
  const { plan } = req.body as { plan?: string };
  if (plan !== "starter" && plan !== "pro") {
    res.status(400).json({ error: "plan must be 'starter' or 'pro'" });
    return;
  }

  const planKey = plan as PlanKey;
  const planEnvKey =
    planKey === "starter" ? "RAZORPAY_STARTER_PLAN_ID" : "RAZORPAY_PRO_PLAN_ID";
  const razorpayPlanId = process.env[planEnvKey];

  if (!razorpayPlanId) {
    res.status(503).json({
      error: "billing_not_configured",
      message: `Razorpay plan not configured. Set ${planEnvKey} in environment secrets.`,
    });
    return;
  }

  const keyId = process.env["RAZORPAY_KEY_ID"];
  if (!keyId) {
    res.status(503).json({
      error: "billing_not_configured",
      message: "RAZORPAY_KEY_ID is not set.",
    });
    return;
  }

  // Look up existing subscription
  const existing = await pool.query(
    "SELECT id, razorpay_subscription_id, status FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1",
    [req.businessId],
  );
  const existingSub = existing.rows[0];

  // If already active, don't create a duplicate
  if (existingSub?.status === "active") {
    res.status(409).json({ error: "already_subscribed", message: "You already have an active subscription." });
    return;
  }

  let rz: Razorpay;
  try {
    rz = getRazorpay();
  } catch (err) {
    res.status(503).json({ error: "billing_not_configured", message: (err as Error).message });
    return;
  }

  try {
    // Create a Razorpay subscription
    const rzSub = await rz.subscriptions.create({
      plan_id:          razorpayPlanId,
      total_count:      120,       // ~10 years max; Razorpay requires a finite count
      quantity:         1,
      customer_notify:  1,
    });

    // Upsert subscription row
    if (existingSub) {
      await db
        .update(subscriptionsTable)
        .set({
          plan:                   planKey,
          status:                 "trialing",          // will be set to "active" by webhook
          razorpaySubscriptionId: rzSub.id,
          razorpayPlanId,
          staffLimit:             PLANS[planKey].staffLimit,
          updatedAt:              new Date(),
        })
        .where(eq(subscriptionsTable.businessId, req.businessId));
    } else {
      await db.insert(subscriptionsTable).values({
        businessId:             req.businessId,
        plan:                   planKey,
        status:                 "trialing",
        razorpaySubscriptionId: rzSub.id,
        razorpayPlanId,
        staffLimit:             PLANS[planKey].staffLimit,
        currentPeriodEnd:       null,
      });
    }

    logger.info({ businessId: req.businessId, plan: planKey, rzSubId: rzSub.id }, "Razorpay subscription created");

    res.json({ subscriptionId: rzSub.id, keyId });
  } catch (err) {
    logger.error({ err }, "Failed to create Razorpay subscription");
    res.status(502).json({ error: "razorpay_error", message: "Failed to create subscription. Please try again." });
  }
});

/** POST /billing/cancel — cancel the current subscription */
router.post("/billing/cancel", async (req, res): Promise<void> => {
  const existing = await pool.query(
    "SELECT id, razorpay_subscription_id, status FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1",
    [req.businessId],
  );
  const sub = existing.rows[0];

  if (!sub || !sub.razorpay_subscription_id) {
    res.status(404).json({ error: "No active subscription found." });
    return;
  }

  if (sub.status === "cancelled") {
    res.status(409).json({ error: "Already cancelled." });
    return;
  }

  let rz: Razorpay;
  try {
    rz = getRazorpay();
  } catch (err) {
    res.status(503).json({ error: "billing_not_configured", message: (err as Error).message });
    return;
  }

  try {
    await rz.subscriptions.cancel(sub.razorpay_subscription_id, false); // false = cancel at period end
    await db
      .update(subscriptionsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptionsTable.businessId, req.businessId),
          eq(subscriptionsTable.id, sub.id),
        ),
      );
    logger.info({ businessId: req.businessId }, "Subscription cancelled");
    res.json({ ok: true, message: "Subscription cancelled." });
  } catch (err) {
    logger.error({ err }, "Failed to cancel Razorpay subscription");
    res.status(502).json({ error: "razorpay_error", message: "Failed to cancel. Please try again." });
  }
});

export default router;
