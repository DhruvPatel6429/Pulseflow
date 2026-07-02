/**
 * requireSecret — route-level secret guard.
 *
 * Behaviour:
 *   • Secret NOT set + NODE_ENV === "production"  → 403 Forbidden (fail-closed)
 *   • Secret NOT set + NODE_ENV !== "production"  → allow (dev convenience)
 *   • Secret set, header matches                  → allow
 *   • Secret set, header missing/wrong            → 401 Unauthorized
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

    // Fail-closed in production when the secret has not been configured.
    if (!secret) {
      if (process.env["NODE_ENV"] === "production") {
        res.status(403).json({
          error: {
            message: `Forbidden: ${envVar} is not configured on this server.`,
            statusCode: 403,
          },
        });
        return;
      }
      // Development / test: allow without a secret so local curl commands work.
      next();
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
