import { Router, type IRouter } from "express";
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

router.use(healthRouter);
router.use(businessRouter);
router.use(servicesRouter);
router.use(customersRouter);
router.use(bookingsRouter);
router.use(conversationsRouter);
router.use(aiRouter);
router.use(automationRouter);
router.use(jobsRouter);
router.use(dashboardRouter);
router.use(webhooksRouter);
router.use(cronRouter);
router.use(seedRouter);

export default router;
