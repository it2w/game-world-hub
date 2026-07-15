import { Router, type IRouter } from "express";
import { eq, and, gt, isNull, desc } from "drizzle-orm";
import { db, superAdminsTable } from "@workspace/db";
import { requireOwner, signOwnerToken, type OwnerPayload } from "../middlewares/owner";
import { findOwnerByUsername, findOwnerById, verifyPassword, hashPassword, updateOwnerPassword, updateOwnerEmail, isPasswordStrong } from "../lib/owner";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const router: IRouter = Router();

const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RESET_ATTEMPTS = 5;

function generateResetCode(): string {
  return String(randomInt(100000, 1000000));
}

async function issueOwnerResetCode(ownerId: number): Promise<string> {
  const code = generateResetCode();
  const codeHash = await bcrypt.hash(code, 10);
  await db
    .update(superAdminsTable)
    .set({ passwordResetCodeHash: codeHash, passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS), passwordResetAttempts: 0 })
    .where(eq(superAdminsTable.id, ownerId));
  return code;
}

async function verifyOwnerResetCode(ownerId: number, code: string): Promise<boolean> {
  const [owner] = await db.select().from(superAdminsTable).where(eq(superAdminsTable.id, ownerId)).limit(1);
  if (!owner || !owner.passwordResetCodeHash || !owner.passwordResetExpiresAt) return false;
  if (owner.passwordResetExpiresAt < new Date()) return false;
  if ((owner.passwordResetAttempts ?? 0) >= MAX_RESET_ATTEMPTS) return false;

  const ok = await bcrypt.compare(code, owner.passwordResetCodeHash);
  if (!ok) {
    await db.update(superAdminsTable).set({ passwordResetAttempts: (owner.passwordResetAttempts ?? 0) + 1 }).where(eq(superAdminsTable.id, ownerId));
    return false;
  }

  await db
    .update(superAdminsTable)
    .set({ passwordResetCodeHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 })
    .where(eq(superAdminsTable.id, ownerId));
  return true;
}

router.post("/owner/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const owner = await findOwnerByUsername(username.trim());
  if (!owner || !(await verifyPassword(password, owner.passwordHash))) {
    // Constant-time-ish response regardless of missing user or wrong password.
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signOwnerToken({ ownerId: owner.id, username: owner.username, purpose: "owner" });
  logger.info({ ownerId: owner.id }, "owner: logged in");
  res.json({ token, owner: { id: owner.id, username: owner.username, email: owner.email ?? null } });
});

router.get("/owner/me", requireOwner, async (req, res): Promise<void> => {
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner) {
    res.status(401).json({ error: "Owner not found" });
    return;
  }
  res.json({ id: owner.id, username: owner.username, email: owner.email ?? null, emailVerified: owner.emailVerified });
});

router.post("/owner/change-password", requireOwner, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }
  if (!isPasswordStrong(newPassword)) {
    res.status(400).json({ error: "New password must be at least 16 characters and include uppercase, lowercase, number, and symbol" });
    return;
  }
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner || !(await verifyPassword(currentPassword, owner.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  await updateOwnerPassword(owner.id, newPassword);
  logger.info({ ownerId: owner.id }, "owner: changed password");
  res.json({ ok: true });
});

router.post("/owner/set-email", requireOwner, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  await updateOwnerEmail(req.owner!.ownerId, email.trim().toLowerCase());
  logger.info({ ownerId: req.owner!.ownerId, email }, "owner: set email");
  res.json({ ok: true });
});

router.post("/owner/reset-password-request", async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  if (!username || typeof username !== "string") {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  const owner = await findOwnerByUsername(username.trim());
  // Always return the same response so usernames can't be enumerated.
  if (!owner || !owner.email) {
    res.json({ ok: true });
    return;
  }
  const code = await issueOwnerResetCode(owner.id);
  await sendEmail({
    to: owner.email,
    subject: "Owner panel password reset",
    text: `Your owner panel password reset code is: ${code}\n\nThis code expires in 10 minutes.`,
  });
  res.json({ ok: true });
});

router.post("/owner/reset-password", async (req, res): Promise<void> => {
  const { username, code, newPassword } = req.body as { username?: string; code?: string; newPassword?: string };
  if (!username || !code || !newPassword || typeof username !== "string" || typeof code !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Username, code and new password are required" });
    return;
  }
  if (!isPasswordStrong(newPassword)) {
    res.status(400).json({ error: "New password must be at least 16 characters and include uppercase, lowercase, number, and symbol" });
    return;
  }
  const owner = await findOwnerByUsername(username.trim());
  if (!owner) {
    res.status(400).json({ error: "Invalid username or code" });
    return;
  }
  if (!(await verifyOwnerResetCode(owner.id, code))) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }
  await updateOwnerPassword(owner.id, newPassword);
  logger.info({ ownerId: owner.id }, "owner: reset password via email");
  res.json({ ok: true });
});

export default router;
