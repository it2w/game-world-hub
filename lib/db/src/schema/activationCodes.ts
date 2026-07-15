import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activationCodeStatusEnum = ["active", "inactive", "expired"] as const;

export const activationCodesTable = pgTable("activation_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status", { enum: activationCodeStatusEnum }).notNull().default("active"),
  durationDays: integer("duration_days").notNull().default(30),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertActivationCodeSchema = createInsertSchema(activationCodesTable).omit({
  id: true,
  usedCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertActivationCode = z.infer<typeof insertActivationCodeSchema>;
export type ActivationCode = typeof activationCodesTable.$inferSelect;
