/**
 * requireOwner — blocks non-owner staff from destructive / billing actions.
 *
 * Must run AFTER requireBusiness (needs req.userRole).
 *
 * Returns 403 when the authenticated user is a staff member, not the owner.
 */

import type { Request, Response, NextFunction } from "express";

export function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.userRole !== "owner") {
    res.status(403).json({
      error: "Forbidden",
      message: "Only the business owner can perform this action.",
    });
    return;
  }
  next();
}
