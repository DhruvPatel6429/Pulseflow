import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";
import { bookingsTable } from "./bookings";
import { conversationsTable } from "./conversations";

export const aiActionLogsTable = pgTable("ai_action_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  actionType: text("action_type").notNull(),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  replyDraft: text("reply_draft"),
  confidenceScore: real("confidence_score"),
  status: text("status").notNull().default("pending"),
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiActionLogSchema = createInsertSchema(aiActionLogsTable).omit({ id: true, createdAt: true });
export type InsertAiActionLog = z.infer<typeof insertAiActionLogSchema>;
export type AiActionLog = typeof aiActionLogsTable.$inferSelect;
