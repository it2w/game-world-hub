import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const partiesTable = pgTable("parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  game: text("game"),
  platform: text("platform"),
  description: text("description"),
  leaderId: integer("leader_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  maxSize: integer("max_size").notNull().default(5),
  isPublic: boolean("is_public").notNull().default(true),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partyMembersTable = pgTable("party_members", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id").notNull().references(() => partiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partyInvitesTable = pgTable("party_invites", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id").notNull().references(() => partiesTable.id, { onDelete: "cascade" }),
  invitedUserId: integer("invited_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invitedByUserId: integer("invited_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | accepted | declined
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partyActivityTable = pgTable("party_activity", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id").notNull().references(() => partiesTable.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // created | joined | left | invited
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Party = typeof partiesTable.$inferSelect;
export type PartyMember = typeof partyMembersTable.$inferSelect;
export type PartyInvite = typeof partyInvitesTable.$inferSelect;
