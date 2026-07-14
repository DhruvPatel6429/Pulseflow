/**
 * requireSecret — route-level secret guard.
 *
 * Behaviour (all environments, including development):
 *   • Secret NOT set  → 403 Forbidden (fail-closed everywhere, log a warning)
 *   • Secret set, header matches  → allow
 *   • Secret set, header missing/wrong  → 401 Unauthorized
 *
 * Callers supply a header of the form:
 *   Authorization: Bearer <secret>
 *
 * Comparison is constant-time (SHA-256 digest) to prevent timing attacks.
 *
 * Usage:
 *   router.post("/cron/process-automations", requireSecret("CRON_SECRET"), handler);
 */

import type { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { logger } from "../lib/logger";

function constantTimeEqual(a: string, b: string): boolean {
  // Hash both strings so timingSafeEqual always receives equal-length buffers,
  // which eliminates length-based timing oracle.
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function requireSecret(envVar: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env[envVar];

    // Fail-closed in ALL environments — missing secret is a misconfiguration, not a dev shortcut.
    if (!secret) {
      logger.warn(
        { envVar, path: req.path },
        `SECURITY: ${envVar} is not set — request blocked with 403. ` +
        `Set ${envVar} in your environment secrets to enable this route.`,
      );
      res.status(403).json({
        error: {
          message: `Forbidden: ${envVar} is not configured on this server.`,
          statusCode: 403,
        },
      });
      return;
    }

    // Extract the bearer token from the Authorization header.
    const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!constantTimeEqual(provided, secret)) {
      res.status(401).json({
        error: {
          message: "Unauthorized: invalid or missing secret.",
          statusCode: 401,
        },
      });
      return;
    }

    next();
  };
}
