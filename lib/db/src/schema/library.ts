import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A linked gaming account (Steam, Epic, Battle.net, Xbox, ...).
export const gameAccountsTable = pgTable(
  "game_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // steam | epic | battlenet | xbox | playstation | nintendo | riot | ea | gog | other
    externalId: text("external_id"), // e.g. SteamID64 for steam
    handle: text("handle"), // display handle / username
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPlatformUq: unique("game_accounts_user_platform_uq").on(t.userId, t.platform),
  }),
);

// A game in a user's library, either imported (steam) or added manually.
export const linkedGamesTable = pgTable(
  "linked_games",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    name: text("name").notNull(),
    coverUrl: text("cover_url"),
    appId: text("app_id"), // steam appid or platform-specific id
    launchUri: text("launch_uri"), // protocol URL for manually-added games
    source: text("source").notNull().default("manual"), // steam | manual
    playtimeMinutes: integer("playtime_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPlatformNameUq: unique("linked_games_user_platform_name_uq").on(t.userId, t.platform, t.name),
  }),
);

export type GameAccount = typeof gameAccountsTable.$inferSelect;
export type LinkedGame = typeof linkedGamesTable.$inferSelect;
