/**
 * requireBusiness middleware
 *
 * Extracts the authenticated Clerk userId and resolves it to a businessId.
 * Resolution order:
 *   1. businesses.clerk_user_id = userId  → owner
 *   2. staff.clerk_user_id = userId        → staff member
 *   3. staff.invited_email = userEmail (pending invite) → auto-accept, link clerkUserId
 *   4. Not found → businessId = 0 (onboarding)
 *
 * Attaches req.businessId and req.userRole for downstream handlers.
 * Public routes (webhooks, seed, cron, health) skip this middleware.
 */

import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";

// Extend Express Request type to carry businessId + rawBody (captured in app.ts for webhook verification)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      businessId: number;
      clerkUserId: string;
      userRole: "owner" | "staff";
      rawBody?: string;
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

  try {
    // ── 1. Check if this Clerk user is a business owner ──────────────────────
    const ownerResult = await pool.query<{ id: number }>(
      "SELECT id FROM businesses WHERE clerk_user_id = $1 LIMIT 1",
      [userId],
    );
    if (ownerResult.rows.length > 0) {
      req.clerkUserId = userId;
      req.businessId  = ownerResult.rows[0].id;
      req.userRole    = "owner";
      next();
      return;
    }

    // ── 2. Check staff table by clerkUserId (active staff) ───────────────────
    const staffResult = await pool.query<{ business_id: number; role: string }>(
      "SELECT business_id, role FROM staff WHERE clerk_user_id = $1 AND status = 'active' LIMIT 1",
      [userId],
    );
    if (staffResult.rows.length > 0) {
      req.clerkUserId = userId;
      req.businessId  = staffResult.rows[0].business_id;
      req.userRole    = (staffResult.rows[0].role as "owner" | "staff") ?? "staff";
      next();
      return;
    }

    // ── 3. Check for a pending invite by email (first sign-in after invitation) ─
    let userEmail: string | null = null;
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const primary = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      );
      userEmail = primary?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      // Non-fatal — fall through to businessId = 0
    }

    if (userEmail) {
      const pendingResult = await pool.query<{ id: number; business_id: number; role: string }>(
        "SELECT id, business_id, role FROM staff WHERE invited_email = $1 AND status = 'pending' LIMIT 1",
        [userEmail.toLowerCase()],
      );
      if (pendingResult.rows.length > 0) {
        const { id, business_id, role } = pendingResult.rows[0];
        // Auto-accept: link clerkUserId and mark active
        await pool.query(
          "UPDATE staff SET clerk_user_id = $1, status = 'active', updated_at = NOW() WHERE id = $2",
          [userId, id],
        );
        req.clerkUserId = userId;
        req.businessId  = business_id;
        req.userRole    = (role as "owner" | "staff") ?? "staff";
        next();
        return;
      }
    }

    // ── 4. No business or staff record → onboarding sentinel ─────────────────
    req.clerkUserId = userId;
    req.businessId  = 0;
    req.userRole    = "owner"; // default to owner for new signups (they'll become the owner)
    next();
  } catch (err) {
    next(err);
  }
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
