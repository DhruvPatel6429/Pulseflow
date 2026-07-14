/**
 * requireActiveSubscription middleware
 *
 * Must run AFTER requireBusiness (needs req.businessId).
 *
 * Allows the request through when:
 *   - subscription status is "active"
 *   - subscription status is "trialing" AND currentPeriodEnd is in the future
 *
 * Blocks with 402 + { error: "trial_expired" | "subscription_inactive" } otherwise.
 * The frontend watches for 402s and redirects to /billing.
 */

import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

interface SubRow {
  status: string;
  current_period_end: Date | null;
}

export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const businessId = req.businessId;
  if (!businessId) {
    // requireBusiness should have caught this; fail safely
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let sub: SubRow | null = null;
  try {
    const result = await pool.query<SubRow>(
      `SELECT status, current_period_end
         FROM subscriptions
        WHERE business_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [businessId],
    );
    sub = result.rows[0] ?? null;
  } catch (err) {
    next(err);
    return;
  }

  if (!sub) {
    // No subscription row at all — treat as expired trial
    res.status(402).json({
      error: "trial_expired",
      message: "Your trial has ended. Please subscribe to continue.",
    });
    return;
  }

  if (sub.status === "active") {
    next();
    return;
  }

  if (sub.status === "trialing") {
    const expired =
      sub.current_period_end == null ||
      new Date() >= new Date(sub.current_period_end);
    if (!expired) {
      next();
      return;
    }
    res.status(402).json({
      error: "trial_expired",
      message: "Your 14-day trial has ended. Upgrade to keep using PulseFlow.",
    });
    return;
  }

  // past_due or cancelled
  res.status(402).json({
    error: "subscription_inactive",
    message: "Your subscription is inactive. Please update your billing details.",
  });
}
