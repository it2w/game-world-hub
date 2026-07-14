import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One-time codes for email verification, password reset and email 2FA.
// Codes are stored HASHED (bcrypt) — never in plaintext.
export const verificationCodesTable = pgTable(
  "verification_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // email_verify | password_reset | twofa_email
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    // Number of failed verification attempts (basic brute-force guard).
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPurposeIdx: index("verification_codes_user_purpose_idx").on(t.userId, t.purpose),
  }),
);

export type VerificationCode = typeof verificationCodesTable.$inferSelect;
