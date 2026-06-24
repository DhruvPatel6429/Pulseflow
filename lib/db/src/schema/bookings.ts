import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";
import { servicesTable } from "./services";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdByAI: boolean("created_by_ai").notNull().default(false),
  reminder24hSent: boolean("reminder_24h_sent").notNull().default(false),
  reminder2hSent: boolean("reminder_2h_sent").notNull().default(false),
  reviewRequestSent: boolean("review_request_sent").notNull().default(false),
  repeatReminderScheduledAt: timestamp("repeat_reminder_scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
