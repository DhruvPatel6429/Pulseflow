import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export interface ApiError extends Error {
  statusCode?: number;
}

export function globalErrorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  const cause = (err as unknown as { cause?: unknown }).cause;

  logger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        // Surface the original pg error when Drizzle wraps it
        ...(cause
          ? {
              cause: {
                message: (cause as Error).message,
                code: (cause as { code?: string }).code,
                detail: (cause as { detail?: string }).detail,
              },
            }
          : {}),
      },
      req: {
        method: req.method,
        url: req.url,
      },
    },
    "Unhandled API error occurred"
  );

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
    },
  });
}
