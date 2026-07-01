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
app.use(express.json());
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

app.use("/api", router);

// Global Error Handler
app.use(globalErrorHandler as express.ErrorRequestHandler);

export default app;
