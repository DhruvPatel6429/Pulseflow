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
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.clerkUserId, userId))
    .limit(1);

  if (!business) {
    // User is authenticated but has no business yet — let onboarding create one
    req.clerkUserId = userId;
    req.businessId = 0; // sentinel — routes can check for this
    next();
    return;
  }

  req.clerkUserId = userId;
  req.businessId = business.id;
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
