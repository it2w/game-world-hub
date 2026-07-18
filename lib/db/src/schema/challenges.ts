import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Friend Challenges — weekly competitions between two friends.
 * Types:
 *   most_hours  — whoever logs more game hours this week wins
 *   first_rank  — whoever reaches a stated rank first wins
 */
export const challengesTable = pgTable("challenges", {
  id: serial("id").primaryKey(),
  challengerId: integer("challenger_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  challengedId: integer("challenged_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  /** most_hours | first_rank */
  type: text("type").notNull(),
  /** Optional extra detail, e.g. the target rank name */
  detail: text("detail"),
  /** pending | active | completed | declined */
  status: text("status").notNull().default("pending"),
  /** userId of the winner once status=completed; NULL while ongoing */
  winnerId: integer("winner_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Challenge = typeof challengesTable.$inferSelect;
