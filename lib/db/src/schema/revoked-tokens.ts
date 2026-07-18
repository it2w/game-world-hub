import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Defense-in-depth token denylist.
 *
 * When a user's account is deleted, their user_id is inserted here so that
 * any still-valid JWT for that user_id is immediately rejected — even if the
 * primary DB existence check in requireAuth were somehow bypassed by a future
 * caching layer or middleware refactor.
 *
 * We deliberately do NOT reference usersTable with a FK + cascade because the
 * user row is deleted at the same time; the denylist entry must survive the
 * deletion to keep providing protection.
 */
export const revokedTokensTable = pgTable(
  "revoked_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().unique(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("revoked_tokens_user_id_idx").on(t.userId),
  }),
);

export type RevokedToken = typeof revokedTokensTable.$inferSelect;
