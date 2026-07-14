/**
 * Team management routes (staff invitations, listing, removal)
 *
 * GET    /team           — list all staff members (owner + staff)
 * GET    /team/my-role   — return current user's role
 * POST   /team/invite    — invite a staff member by email (owner only)
 * DELETE /team/:id       — remove a staff member (owner only)
 */

import { Router } from "express";
import type { IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { staffTable, subscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireOwner } from "../middlewares/requireOwner";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** GET /team/my-role — lightweight role lookup for the frontend */
router.get("/team/my-role", (req, res): void => {
  res.json({ role: req.userRole ?? "owner" });
});

/** GET /team — all staff for this business */
router.get("/team", async (req, res): Promise<void> => {
  const members = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.businessId, req.businessId));
  res.json(members);
});

/** POST /team/invite — send a Clerk invitation and create a pending staff record (owner only) */
router.post("/team/invite", requireOwner as never, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  // Enforce plan's staff limit: count active + pending staff already in DB
  const subResult = await pool.query<{ staff_limit: number }>(
    "SELECT staff_limit FROM subscriptions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1",
    [req.businessId],
  );
  const staffLimit = subResult.rows[0]?.staff_limit ?? 1;

  const currentCount = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.businessId, req.businessId));

  if (currentCount.length >= staffLimit) {
    res.status(402).json({
      error: "staff_limit_reached",
      message: `Your plan allows up to ${staffLimit} staff member(s). Upgrade to Pro to invite more.`,
    });
    return;
  }

  // Check for duplicate invite
  const existing = currentCount.find(
    (m) => m.invitedEmail.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    res.status(409).json({ error: "This email address already has a pending or active invite." });
    return;
  }

  // Send Clerk invitation
  let clerkInvitationId: string | null = null;
  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
    });
    clerkInvitationId = invitation.id;
  } catch (err) {
    logger.error({ err, email }, "Failed to send Clerk invitation");
    res.status(502).json({ error: "Failed to send invitation email. Please try again." });
    return;
  }

  // Create pending staff record
  const [member] = await db.insert(staffTable).values({
    businessId:        req.businessId,
    clerkUserId:       null,
    role:              "staff",
    invitedEmail:      email.toLowerCase(),
    clerkInvitationId,
    status:            "pending",
  }).returning();

  logger.info({ businessId: req.businessId, email, memberId: member.id }, "Staff invited");
  res.status(201).json(member);
});

/** DELETE /team/:id — remove a staff member (owner only) */
router.delete("/team/:id", requireOwner as never, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);

  const [member] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, id), eq(staffTable.businessId, req.businessId)));

  if (!member) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }

  // Revoke Clerk invitation if still pending
  if (member.status === "pending" && member.clerkInvitationId) {
    try {
      await clerkClient.invitations.revokeInvitation(member.clerkInvitationId);
    } catch (err) {
      // Non-fatal — invitation may have already been used or expired
      logger.warn({ err, invitationId: member.clerkInvitationId }, "Could not revoke Clerk invitation");
    }
  }

  await db
    .delete(staffTable)
    .where(and(eq(staffTable.id, id), eq(staffTable.businessId, req.businessId)));

  logger.info({ businessId: req.businessId, memberId: id }, "Staff member removed");
  res.status(204).send();
});

export default router;
