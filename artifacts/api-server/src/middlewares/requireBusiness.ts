/**
 * requireBusiness middleware
 *
 * Extracts the authenticated Clerk userId and resolves it to a businessId.
 * Attaches `req.businessId` for use in all subsequent route handlers.
 *
 * Public routes (webhooks, seed, cron, health) skip this middleware.
 */

import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";

// Extend Express Request type to carry businessId
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      businessId: number;
      clerkUserId: string;
    }
  }
}

export async function requireBusiness(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Use the raw pg pool directly to avoid Drizzle's queryWithCache layer,
  // which can swallow the original pg error and obscure connection issues.
  let businessId = 0; // sentinel: 0 = no business yet
  try {
    const result = await pool.query<{ id: number }>(
      "SELECT id FROM businesses WHERE clerk_user_id = $1 LIMIT 1",
      [userId],
    );
    if (result.rows.length > 0) {
      businessId = result.rows[0].id;
    }
  } catch (err) {
    // Real DB infrastructure error — propagate to the global error handler
    next(err);
    return;
  }

  req.clerkUserId = userId;
  req.businessId = businessId;
  // businessId === 0 → authenticated but no business yet; POST /business will create one
  next();
}

/** Lighter version — only sets clerkUserId, does NOT require a business to exist.
 *  Used for the business onboarding POST route. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.clerkUserId = userId;
  next();
}
