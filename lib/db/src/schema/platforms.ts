import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const platformLinksTable = pgTable("platform_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // steam | xbox | playstation | epic | battlenet | nintendo
  profileUrl: text("profile_url").notNull(),
  username: text("username"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformLink = typeof platformLinksTable.$inferSelect;
