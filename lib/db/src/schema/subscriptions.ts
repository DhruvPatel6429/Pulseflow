import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const PLANS = {
  trial:   { name: "Trial",   staffLimit: 1, priceMonthly: 0    },
  starter: { name: "Starter", staffLimit: 1, priceMonthly: 999  },
  pro:     { name: "Pro",     staffLimit: 5, priceMonthly: 2499 },
} as const;

export type PlanKey    = keyof typeof PLANS;
export type SubStatus  = "trialing" | "active" | "past_due" | "cancelled";

export const subscriptionsTable = pgTable("subscriptions", {
  id:                     serial("id").primaryKey(),
  businessId:             integer("business_id")
                            .notNull()
                            .references(() => businessesTable.id, { onDelete: "cascade" }),
  plan:                   text("plan").notNull().$type<PlanKey>().default("trial"),
  status:                 text("status").notNull().$type<SubStatus>().default("trialing"),
  /** null for trial; Razorpay subscription id once a paid plan is active */
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  /** Razorpay plan id (stored for reference / renewals) */
  razorpayPlanId:         text("razorpay_plan_id"),
  /** Max staff accounts allowed under this plan */
  staffLimit:             integer("staff_limit").notNull().default(1),
  /** Trial expiry (trialing) or next billing date (active) */
  currentPeriodEnd:       timestamp("current_period_end", { withTimezone: true }),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
                            .$onUpdate(() => new Date()),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription       = typeof subscriptionsTable.$inferSelect;
