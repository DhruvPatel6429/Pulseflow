import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export type StaffRole   = "owner" | "staff";
export type StaffStatus = "pending" | "active";

export const staffTable = pgTable("staff", {
  id:                 serial("id").primaryKey(),
  businessId:         integer("business_id")
                        .notNull()
                        .references(() => businessesTable.id, { onDelete: "cascade" }),
  /** null until the invited user accepts and signs in for the first time */
  clerkUserId:        text("clerk_user_id"),
  role:               text("role").notNull().$type<StaffRole>().default("staff"),
  invitedEmail:       text("invited_email").notNull(),
  /** Clerk invitation id — stored so we can revoke uninvited invites */
  clerkInvitationId:  text("clerk_invitation_id"),
  status:             text("status").notNull().$type<StaffStatus>().default("pending"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
                        .$onUpdate(() => new Date()),
});

export const insertStaffSchema = createInsertSchema(staffTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff       = typeof staffTable.$inferSelect;
