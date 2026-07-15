import { pgTable, serial, integer, text, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proSubscriptionStatusEnum = ["active", "expired", "cancelled", "refunded"] as const;

export const proSubscriptionsTable = pgTable("pro_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().unique(),
  provider: text("provider").notNull().default("salla"),
  status: text("status", { enum: proSubscriptionStatusEnum }).notNull().default("active"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  currency: text("currency"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProSubscriptionSchema = createInsertSchema(proSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProSubscription = z.infer<typeof insertProSubscriptionSchema>;
export type ProSubscription = typeof proSubscriptionsTable.$inferSelect;
