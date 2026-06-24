import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";
import { bookingsTable } from "./bookings";

export const reminderJobsTable = pgTable("reminder_jobs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  type: text("type").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReminderJobSchema = createInsertSchema(reminderJobsTable).omit({ id: true, createdAt: true });
export type InsertReminderJob = z.infer<typeof insertReminderJobSchema>;
export type ReminderJob = typeof reminderJobsTable.$inferSelect;
