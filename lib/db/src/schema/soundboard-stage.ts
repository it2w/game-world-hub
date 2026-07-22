import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Bytea column type — used for audio storage since object-storage sidecar is unavailable */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Pro-user personal soundboard clips (stored as BYTEA in the database) */
export const soundboardSoundsTable = pgTable("soundboard_sounds", {
  id: serial("id").primaryKey(),
  /** null = system sound (not currently used; system sounds are synthesized client-side) */
  ownerId: integer("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(),
  fileData: bytea("file_data").notNull(),
  mimeType: varchar("mime_type", { length: 50 }).notNull().default("audio/mpeg"),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Tracks each user's role inside a stage-mode voice room */
export const stageParticipantsTable = pgTable("stage_participants", {
  id: serial("id").primaryKey(),
  roomName: varchar("room_name", { length: 200 }).notNull(), // e.g. "proroom:42"
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("audience"), // "speaker" | "audience"
  handRaised: boolean("hand_raised").notNull().default(false),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SoundboardSound = typeof soundboardSoundsTable.$inferSelect;
export type StageParticipantRow = typeof stageParticipantsTable.$inferSelect;
