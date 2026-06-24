import { pgTable, text, serial, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  name: text("name").notNull(),
  category: text("category"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  description: text("description"),
  requiresConsultation: boolean("requires_consultation").notNull().default(false),
  requiresTokenAdvance: boolean("requires_token_advance").notNull().default(false),
  repeatReminderDays: integer("repeat_reminder_days"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
