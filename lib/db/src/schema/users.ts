import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  bio: text("bio"),
  // Recovery email. Only a VERIFIED email may be used for password recovery
  // and email-based two-factor auth.
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  // Two-factor auth: none | email | totp (Google Authenticator etc.)
  twoFactorMethod: text("two_factor_method").notNull().default("none"),
  // TOTP secret (base32). Present while enrolling or when method === "totp".
  totpSecret: text("totp_secret"),
  // Whether other users may write on this user's profile wall.
  allowProfileComments: boolean("allow_profile_comments").notNull().default(true),
  status: text("status").notNull().default("offline"), // online | away | busy | offline
  // User's custom status message ("What's on your mind?"). Max 100 chars.
  statusText: text("status_text"),
  currentGame: text("current_game"),
  // User's self-reported competitive rank (e.g. "Gold", "Platinum III", etc.)
  rank: text("rank"),
  // Last time the user's open tab reported activity (heartbeat). Used to auto-clear
  // currentGame a few minutes after every tab is closed.
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  // Pro subscription status. Auto-computed from proSubscriptions; mirrored here for fast reads.
  isPro: boolean("is_pro").notNull().default(false),
  proActivatedAt: timestamp("pro_activated_at", { withTimezone: true }),
  proExpiresAt: timestamp("pro_expires_at", { withTimezone: true }),
  proOrderId: text("pro_order_id"),
  proProvider: text("pro_provider").notNull().default("salla"),
  // User's self-reported country / region (e.g. "SA", "US"). Optional, set at registration.
  region: text("region"),
  // Pro profile customization (Pro users only).
  profileFrameColor: text("profile_frame_color"), // e.g. "#ff00cc" or "gold"
  profileBgUrl: text("profile_bg_url"),           // animated GIF / video URL for profile background
  // Admin flag. Bootstrapped via ADMIN_USERNAMES env var; can also be promoted from the admin dashboard.
  isAdmin: boolean("is_admin").notNull().default(false),
  // Friend-online notification opt-in: comma-separated friend user IDs to watch, or "*" for all.
  friendOnlineWatchlist: text("friend_online_watchlist"),
  // Username change cooldown tracking. Null means the username has never been changed.
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
  // Force-logout: any JWT whose iat (Unix seconds) is before this timestamp is rejected.
  // Set by POST /owner/users/:id/force-logout to instantly invalidate all active sessions.
  sessionsInvalidatedBefore: timestamp("sessions_invalidated_before", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
