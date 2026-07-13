import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const blocksTable = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: integer("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: integer("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    blockerBlockedUq: unique("blocks_blocker_blocked_uq").on(t.blockerId, t.blockedId),
  }),
);

export type Block = typeof blocksTable.$inferSelect;
