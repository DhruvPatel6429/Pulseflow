import { Router, type IRouter } from "express";
import { requireBusiness, requireAuth } from "../middlewares/requireBusiness";
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

// ── Business onboarding ───────────────────────────────────────────────────────
// Uses requireAuth (lighter) instead of requireBusiness so the user can create
// their first business without having one yet.
router.use(requireAuth as never, businessRouter);

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
