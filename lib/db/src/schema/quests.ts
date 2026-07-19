import { pgTable, text, serial, integer, timestamp, date, unique } from "drizzle-orm/pg-core";

/**
 * Daily quest progress per user per day.
 * The quest definitions themselves are hardcoded in the API (no DB seed needed).
 */
export const userDailyProgressTable = pgTable(
  "user_daily_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    questKey: text("quest_key").notNull(),
    date: date("date").notNull(),
    progress: integer("progress").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [unique("udp_user_quest_date").on(t.userId, t.questKey, t.date)],
);

/**
 * Per-user streak & quest XP tracking.
 * bonusXp is accumulated from quest completions and included in the XP total.
 */
export const userStreaksTable = pgTable("user_streaks", {
  userId: integer("user_id").primaryKey(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  shieldCount: integer("shield_count").notNull().default(0),
  bonusXp: integer("bonus_xp").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
