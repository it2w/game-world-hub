import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

// ─── Message Threads ─────────────────────────────────────────────────────────

/** One thread per root message. Created lazily on first reply. */
export const messageThreadsTable = pgTable(
  "message_threads",
  {
    id: serial("id").primaryKey(),
    /** FK to messages.id — raw integer to avoid circular Drizzle schema reference */
    rootMessageId: integer("root_message_id").notNull(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    replyCount: integer("reply_count").notNull().default(0),
    lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Enforce one thread per root message — required for the conflict-safe upsert in POST thread messages */
    uniqueIndex("mt_root_unique_idx").on(t.rootMessageId),
    index("mt_conv_idx").on(t.conversationId),
  ],
);

/** Messages posted inside a thread (separate from the main conversation feed). */
export const threadMessagesTable = pgTable("thread_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .notNull()
    .references(() => messageThreadsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Polls ────────────────────────────────────────────────────────────────────

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  isClosed: boolean("is_closed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollOptionsTable = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => pollsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const pollVotesTable = pgTable(
  "poll_votes",
  {
    pollId: integer("poll_id")
      .notNull()
      .references(() => pollsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => pollOptionsTable.id, { onDelete: "cascade" }),
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId] })],
);

// ─── AutoMod Rules ────────────────────────────────────────────────────────────

/**
 * conversation_id NULL = global rule (applies to all DM/party conversations).
 *
 * Uniqueness is enforced by two partial indexes (applied in the initial DDL migration
 * and reflected here via `sql` expressions since Drizzle cannot express partial indexes
 * inline):
 *   CREATE UNIQUE INDEX automod_global_idx ON automod_rules ((conversation_id IS NULL)) WHERE conversation_id IS NULL;
 *   CREATE UNIQUE INDEX automod_conv_idx   ON automod_rules (conversation_id)           WHERE conversation_id IS NOT NULL;
 *
 * The PUT /admin/automod endpoint targets the global row using:
 *   ON CONFLICT ((conversation_id IS NULL)) WHERE conversation_id IS NULL DO UPDATE …
 */
export const automodRulesTable = pgTable(
  "automod_rules",
  {
    id: serial("id").primaryKey(),
    /** null = global scope */
    conversationId: integer("conversation_id"),
    /** 0 = disabled */
    slowmodeSeconds: integer("slowmode_seconds").notNull().default(0),
    maxLength: integer("max_length").notNull().default(2000),
    /** Array of blocked words/phrases */
    denylist: text("denylist").array().notNull().default([]),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Partial unique indexes are expressed as SQL comments here (Drizzle does not support
  // WHERE predicates on indexes); the actual constraints were created in the raw DDL migration.
  // See the comment block above.
  () => [],
);
