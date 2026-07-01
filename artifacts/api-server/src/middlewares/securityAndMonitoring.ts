import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

export function timeoutMiddleware(seconds = 15) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setTimeout(seconds * 1000, () => {
      res.status(408).json({
        error: {
          message: "Request timeout",
          statusCode: 408,
        },
      });
    });
    next();
  };
}

const rateLimitDb = new Map<string, Array<number>>();

export function publicRateLimitMiddleware(limit = 100, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "anonymous";
    const now = Date.now();
    const timestamps = rateLimitDb.get(ip) || [];

    // Filter out old timestamps
    const activeTimestamps = timestamps.filter((t) => now - t < windowMs);
    activeTimestamps.push(now);
    rateLimitDb.set(ip, activeTimestamps);

    if (activeTimestamps.length > limit) {
      res.status(429).json({
        error: {
          message: "Too many requests, please try again later",
          statusCode: 429,
        },
      });
      return;
    }

    next();
  };
}
