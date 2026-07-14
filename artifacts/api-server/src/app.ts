import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalErrorHandler } from "./middlewares/errorMiddleware";
import {
  requestIdMiddleware,
  securityHeadersMiddleware,
  timeoutMiddleware,
  publicRateLimitMiddleware,
} from "./middlewares/securityAndMonitoring";

const app: Express = express();

app.use(requestIdMiddleware);
app.use(securityHeadersMiddleware);
app.use(timeoutMiddleware(15)); // 15-second request timeout limit

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk proxy — must be before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// Capture raw body for Razorpay webhook signature verification
app.use(
  express.json({
    verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Resolve publishable key from the incoming host so the same server
// can serve multiple Clerk custom domains.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Rate limiting — applied to all /api routes.
// Limit is read from RATE_LIMIT_MAX (requests per minute per IP); defaults to 100.
// Invalid or non-positive values are clamped to 100 so a misconfigured env var
// cannot silently disable the control.
const _parsedRateLimit = parseInt(process.env["RATE_LIMIT_MAX"] ?? "", 10);
const rateLimitMax = Number.isFinite(_parsedRateLimit) && _parsedRateLimit > 0 ? _parsedRateLimit : 100;
app.use("/api", publicRateLimitMiddleware(rateLimitMax, 60_000), router);

// Global Error Handler
app.use(globalErrorHandler as express.ErrorRequestHandler);

export default app;
