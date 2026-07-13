import { pgTable, serial, integer, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// "Looking For Group" board — players post that they're looking for teammates
// for a given game, and others can respond to express interest.
export const lfgPostsTable = pgTable("lfg_posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  game: text("game").notNull(),
  platform: text("platform"),
  rank: text("rank"),
  description: text("description").notNull(),
  neededPlayers: integer("needed_players").notNull().default(1),
  micRequired: boolean("mic_required").notNull().default(false),
  status: text("status").notNull().default("open"), // open | closed
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lfgResponsesTable = pgTable(
  "lfg_responses",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull().references(() => lfgPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // A user can only respond to a given post once — enforced at the DB level so
  // duplicate/concurrent requests can't create double responses.
  (t) => ({
    uniqResponder: unique("lfg_responses_post_user_uq").on(t.postId, t.userId),
  }),
);

export type LfgPost = typeof lfgPostsTable.$inferSelect;
export type LfgResponse = typeof lfgResponsesTable.$inferSelect;
