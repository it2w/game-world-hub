import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, pool, verificationCodesTable } from "@workspace/db";

export type OtpPurpose = "email_verify" | "password_reset" | "twofa_email" | "totp_challenge";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/** Generates a cryptographically random 6-digit code. */
export function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Issues a fresh one-time code for the user+purpose, invalidating any codes
 * previously issued for the same purpose. Returns the PLAINTEXT code so the
 * caller can email it — only the bcrypt hash is stored.
 */
export async function issueCode(userId: number, purpose: OtpPurpose): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await db
    .update(verificationCodesTable)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(verificationCodesTable.userId, userId),
        eq(verificationCodesTable.purpose, purpose),
        isNull(verificationCodesTable.consumedAt),
      ),
    );
  await db.insert(verificationCodesTable).values({
    userId,
    purpose,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

/**
 * Verifies a code for user+purpose and consumes it on success.
 * The attempt counter is incremented atomically so concurrent requests cannot
 * bypass the MAX_ATTEMPTS guard by racing between the SELECT and UPDATE.
 */
export async function verifyAndConsumeCode(
  userId: number,
  purpose: OtpPurpose,
  code: string,
): Promise<boolean> {
  // Atomically increment the attempt counter *only if* the code still has
  // attempts left. Postgres serialises concurrent UPDATEs on the same row, so
  // a second concurrent request that races through will see the incremented
  // value and be rejected when attempts reaches MAX_ATTEMPTS.
  const { rows } = await pool.query<{ id: number; code_hash: string }>(
    `UPDATE verification_codes
     SET attempts = attempts + 1
     WHERE id = (
       SELECT id FROM verification_codes
       WHERE user_id = $1
         AND purpose  = $2
         AND consumed_at IS NULL
         AND expires_at  > NOW()
       ORDER BY created_at DESC
       LIMIT 1
     )
     AND attempts < $3
     RETURNING id, code_hash`,
    [userId, purpose, MAX_ATTEMPTS],
  );

  if (rows.length === 0) return false;

  const row = rows[0];
  const ok = await bcrypt.compare(code, row.code_hash);
  if (!ok) return false;

  await db
    .update(verificationCodesTable)
    .set({ consumedAt: new Date() })
    .where(eq(verificationCodesTable.id, row.id));
  return true;
}

// ── TOTP challenge JTI persistence ───────────────────────────────────────────
// TOTP challenge tokens are tracked in-memory (challengeAttempts Map in the
// login route), but that state is lost on a server restart. If the server
// restarts within the 5-minute challenge window, the same challenge token +
// still-valid TOTP code could be replayed to obtain a second session.
//
// We persist a record of every consumed TOTP JTI in the verification_codes
// table so that restart-replay is rejected even after a process restart.

const TOTP_CHALLENGE_TTL_MS = 6 * 60 * 1000; // 5-min JWT + slack

/**
 * Returns true if the given TOTP challenge JTI has already been consumed
 * (persisted in the DB), meaning it must not be accepted again.
 */
export async function isTotpChallengeConsumed(jti: string): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM verification_codes
     WHERE purpose = 'totp_challenge'
       AND code_hash = $1
     LIMIT 1`,
    [jti],
  );
  return rows.length > 0;
}

/**
 * Persists a consumed TOTP challenge JTI so it cannot be replayed after a
 * server restart. The row is immediately marked consumed (consumedAt = NOW()).
 * userId is required for the NOT NULL foreign-key constraint.
 */
export async function consumeTotpChallenge(userId: number, jti: string): Promise<void> {
  await db.insert(verificationCodesTable).values({
    userId,
    purpose: "totp_challenge",
    // Store the JTI itself as the "code hash". There is nothing secret about a
    // UUID JTI; we store it here purely for de-duplication, not for secrecy.
    codeHash: jti,
    expiresAt: new Date(Date.now() + TOTP_CHALLENGE_TTL_MS),
    consumedAt: new Date(),
  });
}
