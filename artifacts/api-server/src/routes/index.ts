import { Router, type IRouter } from "express";
import { requireBusiness } from "../middlewares/requireBusiness";
import { requireActiveSubscription } from "../middlewares/requireActiveSubscription";
import { requireOwner } from "../middlewares/requireOwner";
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
import billingRouter from "./billing";
import teamRouter from "./team";

const router: IRouter = Router();

// ── Public routes (no auth required) ─────────────────────────────────────────
router.use(healthRouter);
router.use(webhooksRouter);   // WhatsApp + Razorpay callbacks — must be public
router.use(cronRouter);       // Internal cron trigger — protected by cron secret
router.use(seedRouter);       // Demo seed — public in dev

// ── Business routes (all methods) ─────────────────────────────────────────────
// requireBusiness handles both cases:
//   • businessId === 0  → authenticated user with no business yet (onboarding)
//   • businessId  > 0  → authenticated user with an existing business
// POST /business checks businessId === 0 before creating; GET/PATCH check > 0.
router.use(requireBusiness as never, businessRouter);

// ── Billing — requires auth + business + owner role, no subscription check ────
// (Owners must reach /billing even when trial is expired to upgrade.)
const billingOwnerRouter: IRouter = Router();
billingOwnerRouter.use(requireBusiness as never);
billingOwnerRouter.use(requireOwner as never);
billingOwnerRouter.use(billingRouter);
router.use(billingOwnerRouter);

// ── Team routes — auth + business only; requireOwner is applied inline per-route
// /team/my-role and GET /team are accessible to all staff;
// POST /team/invite and DELETE /team/:id enforce requireOwner internally.
const teamBaseRouter: IRouter = Router();
teamBaseRouter.use(requireBusiness as never);
teamBaseRouter.use(teamRouter);
router.use(teamBaseRouter);

// ── Core routes — require auth + business + active subscription ───────────────
const protectedRouter: IRouter = Router();
protectedRouter.use(requireBusiness as never);
protectedRouter.use(requireActiveSubscription as never);
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
