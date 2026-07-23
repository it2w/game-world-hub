import {
  pgTable,
  serial,
  bigserial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── Communities ──────────────────────────────────────────────────────────────

export const communitiesTable = pgTable("communities", {
  id:          serial("id").primaryKey(),
  ownerId:     integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name:        varchar("name",        { length: 100 }).notNull(),
  slug:        varchar("slug",        { length: 80  }).notNull().unique(),
  description: text("description"),
  iconKey:     varchar("icon_key",    { length: 500 }),
  bannerKey:   varchar("banner_key",  { length: 500 }),
  gameTag:     varchar("game_tag",    { length: 80  }),
  privacy:     varchar("privacy",     { length: 20  }).notNull().default("public"),
  boostLevel:  integer("boost_level").notNull().default(0),
  memberCount: integer("member_count").notNull().default(1),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Community = typeof communitiesTable.$inferSelect;

// ─── Channels ─────────────────────────────────────────────────────────────────

export const communityChannelsTable = pgTable("community_channels", {
  id:              serial("id").primaryKey(),
  communityId:     integer("community_id").notNull().references(() => communitiesTable.id, { onDelete: "cascade" }),
  name:            varchar("name",  { length: 100 }).notNull(),
  type:            varchar("type",  { length: 20  }).notNull().default("text"), // "text" | "voice" | "announcement" | "stage"
  position:        integer("position").notNull().default(0),
  slowmodeSeconds: integer("slowmode_seconds").notNull().default(0),
  isArchived:      boolean("is_archived").notNull().default(false),
  isPrivate:       boolean("is_private").notNull().default(false),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CommunityChannel = typeof communityChannelsTable.$inferSelect;

// ─── Members ──────────────────────────────────────────────────────────────────

export const communityMembersTable = pgTable("community_members", {
  id:          serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communitiesTable.id, { onDelete: "cascade" }),
  userId:      integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  joinedAt:    timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  isBanned:    boolean("is_banned").notNull().default(false),
}, (t) => ({
  uniq: uniqueIndex("community_members_community_user_uniq").on(t.communityId, t.userId),
}));

export type CommunityMember = typeof communityMembersTable.$inferSelect;

// ─── Roles ────────────────────────────────────────────────────────────────────

export const communityRolesTable = pgTable("community_roles", {
  id:          serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communitiesTable.id, { onDelete: "cascade" }),
  name:        varchar("name",  { length: 80  }).notNull(),
  color:       varchar("color", { length: 20  }).notNull().default("#6366f1"),
  iconKey:     varchar("icon_key", { length: 500 }),
  position:    integer("position").notNull().default(0),
  /**
   * Permission flags as JSONB:
   * is_admin, can_kick, can_ban, can_manage_channels, can_manage_roles,
   * can_invite, can_mute_voice, can_pin_messages, can_manage_polls,
   * can_change_banner, can_post, can_send_media, can_manage_events
   */
  permissions:       jsonb("permissions").notNull().default({}),
  /** Show this role as a separate section in the member list */
  displaySeparately: boolean("display_separately").notNull().default(false),
  /** Allow anyone to @mention this role */
  mentionable:       boolean("mentionable").notNull().default(false),
  /** True for the @everyone role (cannot be deleted) */
  isDefault:         boolean("is_default").notNull().default(false),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CommunityRole = typeof communityRolesTable.$inferSelect;

// ─── Member → Role assignments ────────────────────────────────────────────────

export const communityMemberRolesTable = pgTable("community_member_roles", {
  memberId: integer("member_id").notNull().references(() => communityMembersTable.id, { onDelete: "cascade" }),
  roleId:   integer("role_id").notNull().references(() => communityRolesTable.id,   { onDelete: "cascade" }),
}, (t) => ({
  uniq: uniqueIndex("community_member_roles_member_role_uniq").on(t.memberId, t.roleId),
}));

// ─── Text-channel messages ────────────────────────────────────────────────────

export const communityMessagesTable = pgTable("community_messages", {
  id:        bigserial("id", { mode: "number" }).primaryKey(),
  channelId: integer("channel_id").notNull().references(() => communityChannelsTable.id, { onDelete: "cascade" }),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content:   text("content").notNull(),
  isPinned:  boolean("is_pinned").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CommunityMessage = typeof communityMessagesTable.$inferSelect;

// ─── Boosts ───────────────────────────────────────────────────────────────────

export const communityBoostsTable = pgTable("community_boosts", {
  id:          serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communitiesTable.id, { onDelete: "cascade" }),
  userId:      integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  boostedAt:   timestamp("boosted_at", { withTimezone: true }).notNull().defaultNow(),
  pointsSpent: integer("points_spent").notNull().default(0),
});

// ─── Moderation log ───────────────────────────────────────────────────────────

export const communityModLogTable = pgTable("community_mod_log", {
  id:          serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communitiesTable.id, { onDelete: "cascade" }),
  actorId:     integer("actor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  targetId:    integer("target_id").references(() => usersTable.id, { onDelete: "set null" }),
  action:      varchar("action", { length: 50 }).notNull(),
  detail:      text("detail"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
