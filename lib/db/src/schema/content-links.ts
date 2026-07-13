import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const contentLinksTable = pgTable(
  "content_links",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // twitch | youtube | tiktok | kick
    handle: text("handle").notNull(),
    url: text("url"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // one link per platform per user
    userPlatformUq: unique("content_links_user_platform_uq").on(t.userId, t.platform),
  }),
);

export type ContentLink = typeof contentLinksTable.$inferSelect;
