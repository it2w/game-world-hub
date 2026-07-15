import { pgTable, serial, varchar, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const superAdminsTable = pgTable("super_admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: varchar("email", { length: 255 }),
  emailVerified: boolean("email_verified").default(false).notNull(),
  passwordResetCodeHash: text("password_reset_code_hash"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
  passwordResetAttempts: integer("password_reset_attempts").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SuperAdmin = typeof superAdminsTable.$inferSelect;
export type InsertSuperAdmin = typeof superAdminsTable.$inferInsert;
