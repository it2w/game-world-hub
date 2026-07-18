import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * LFG Bot Settings (Pro only) — stores a user's auto-post template.
 * A background job picks up enabled rows and creates LFG posts on their behalf
 * according to intervalMinutes.
 */
export const lfgBotSettingsTable = pgTable("lfg_bot_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  game: text("game").notNull(),
  platform: text("platform"),
  rank: text("rank"),
  description: text("description").notNull(),
  neededPlayers: integer("needed_players").notNull().default(1),
  micRequired: boolean("mic_required").notNull().default(false),
  /** How often (minutes) to re-post. Min 30. */
  intervalMinutes: integer("interval_minutes").notNull().default(60),
  enabled: boolean("enabled").notNull().default(false),
  lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LfgBotSettings = typeof lfgBotSettingsTable.$inferSelect;
