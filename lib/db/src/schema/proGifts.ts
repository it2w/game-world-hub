import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Pro Gift log — tracks when a Pro user gifts a month to a friend.
 * Each Pro user may gift once every 90 days.
 */
export const proGiftsTable = pgTable("pro_gifts", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  toUserId: integer("to_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProGift = typeof proGiftsTable.$inferSelect;
