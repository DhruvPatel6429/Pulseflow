import { Router, type IRouter } from "express";
import { requireBusiness } from "../middlewares/requireBusiness";
import healthRouter from "./health";
import businessRouter from "./business";
import servicesRouter from "./services";
import customersRouter from "./customers";
import bookingsRouter from "./bookings";
import conversationsRouter from "./conversations";
import aiRouter from "./ai";
import automationRouter from "./automation";
import jobsRouter from "./jobs";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import cronRouter from "./cron";
import seedRouter from "./seed";

const router: IRouter = Router();

// ── Public routes (no auth required) ─────────────────────────────────────────
router.use(healthRouter);
router.use(webhooksRouter);   // WhatsApp callbacks from Meta — must be public
router.use(cronRouter);       // Internal cron trigger — should be protected by cron secret in prod
router.use(seedRouter);       // Demo seed — public in dev

// ── Business routes (all methods) ─────────────────────────────────────────────
// requireBusiness handles both cases:
//   • businessId === 0  → authenticated user with no business yet (onboarding)
//   • businessId  > 0  → authenticated user with an existing business
// POST /business checks businessId === 0 before creating; GET/PATCH check > 0.
router.use(requireBusiness as never, businessRouter);

// ── Protected routes — require a linked business ──────────────────────────────
const protectedRouter: IRouter = Router();
protectedRouter.use(requireBusiness as never);
protectedRouter.use(servicesRouter);
protectedRouter.use(customersRouter);
protectedRouter.use(bookingsRouter);
protectedRouter.use(conversationsRouter);
protectedRouter.use(aiRouter);
protectedRouter.use(automationRouter);
protectedRouter.use(jobsRouter);
protectedRouter.use(dashboardRouter);
router.use(protectedRouter);

export default router;
