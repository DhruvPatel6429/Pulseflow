import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  whatsappNumber: text("whatsapp_number"),
  city: text("city"),
  address: text("address"),
  googleMapsLink: text("google_maps_link"),
  category: text("category").notNull().default("salon"),
  description: text("description"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  workingHours: jsonb("working_hours"),
  cancellationPolicy: text("cancellation_policy"),
  tokenPolicy: text("token_policy"),
  preferredTone: text("preferred_tone").notNull().default("friendly"),
  reviewLink: text("review_link"),
  whatsappVerifyToken: text("whatsapp_verify_token"),
  isOnboarded: boolean("is_onboarded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
