import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, verificationCodesTable } from "@workspace/db";

export type OtpPurpose = "email_verify" | "password_reset" | "twofa_email";

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
 * Wrong attempts are counted; after MAX_ATTEMPTS the code is dead.
 */
export async function verifyAndConsumeCode(
  userId: number,
  purpose: OtpPurpose,
  code: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(verificationCodesTable)
    .where(
      and(
        eq(verificationCodesTable.userId, userId),
        eq(verificationCodesTable.purpose, purpose),
        isNull(verificationCodesTable.consumedAt),
        gt(verificationCodesTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(verificationCodesTable.createdAt))
    .limit(1);

  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  const ok = await bcrypt.compare(code, row.codeHash);
  if (!ok) {
    await db
      .update(verificationCodesTable)
      .set({ attempts: row.attempts + 1 })
      .where(eq(verificationCodesTable.id, row.id));
    return false;
  }

  await db
    .update(verificationCodesTable)
    .set({ consumedAt: new Date() })
    .where(eq(verificationCodesTable.id, row.id));
  return true;
}
