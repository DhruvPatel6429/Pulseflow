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

  logger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
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
