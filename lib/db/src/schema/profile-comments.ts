import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Comments written on a user's profile wall. Any authenticated user (not
// blocked either way) may post while the owner keeps the wall enabled; the
// profile owner may delete any comment, authors may delete their own.
export const profileCommentsTable = pgTable(
  "profile_comments",
  {
    id: serial("id").primaryKey(),
    profileUserId: integer("profile_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    authorId: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index("profile_comments_profile_idx").on(t.profileUserId, t.createdAt),
  }),
);

export type ProfileComment = typeof profileCommentsTable.$inferSelect;
