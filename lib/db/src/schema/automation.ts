import { pgTable, serial, timestamp, integer, boolean, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const automationSettingsTable = pgTable("automation_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id).unique(),
  reminder24hEnabled: boolean("reminder_24h_enabled").notNull().default(true),
  reminder2hEnabled: boolean("reminder_2h_enabled").notNull().default(true),
  reviewRequestEnabled: boolean("review_request_enabled").notNull().default(true),
  reviewRequestDelayHours: integer("review_request_delay_hours").notNull().default(2),
  repeatReminderEnabled: boolean("repeat_reminder_enabled").notNull().default(true),
  aiAutoReplyEnabled: boolean("ai_auto_reply_enabled").notNull().default(true),
  aiConfidenceThreshold: real("ai_confidence_threshold").notNull().default(0.8),
  reviewTemplate: text("review_template"),
  reminderTemplate: text("reminder_template"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAutomationSettingsSchema = createInsertSchema(automationSettingsTable).omit({ id: true, updatedAt: true });
export type InsertAutomationSettings = z.infer<typeof insertAutomationSettingsSchema>;
export type AutomationSettings = typeof automationSettingsTable.$inferSelect;
