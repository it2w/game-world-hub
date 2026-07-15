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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
