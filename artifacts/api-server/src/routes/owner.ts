import { Router, type IRouter } from "express";
import { eq, like, or, desc, sql } from "drizzle-orm";
import { db, superAdminsTable, usersTable, proSubscriptionsTable, activationCodesTable } from "@workspace/db";
import { requireOwner, signOwnerToken, type OwnerPayload } from "../middlewares/owner";
import { findOwnerByUsername, findOwnerById, verifyPassword, hashPassword, updateOwnerPassword, updateOwnerEmail, isPasswordStrong } from "../lib/owner";
import { activateProForUser, deactivatePro, generateActivationCode } from "../lib/pro";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const router: IRouter = Router();

const RESET_TTL_MS = 10 * 60 * 1000;
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
  await db.update(superAdminsTable).set({ passwordResetCodeHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 }).where(eq(superAdminsTable.id, ownerId));
  return true;
}

/* ─── Auth ───────────────────────────────────────────────────────────────── */

router.post("/owner/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Username and password are required" }); return;
  }
  const owner = await findOwnerByUsername(username.trim());
  if (!owner || !(await verifyPassword(password, owner.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" }); return;
  }
  const token = signOwnerToken({ ownerId: owner.id, username: owner.username, purpose: "owner" });
  logger.info({ ownerId: owner.id }, "owner: logged in");
  res.json({ token, owner: { id: owner.id, username: owner.username, email: owner.email ?? null } });
});

router.get("/owner/me", requireOwner, async (req, res): Promise<void> => {
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner) { res.status(401).json({ error: "Owner not found" }); return; }
  res.json({ id: owner.id, username: owner.username, email: owner.email ?? null, emailVerified: owner.emailVerified });
});

router.post("/owner/change-password", requireOwner, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Current and new password are required" }); return;
  }
  if (!isPasswordStrong(newPassword)) {
    res.status(400).json({ error: "New password must be at least 16 characters and include uppercase, lowercase, number, and symbol" }); return;
  }
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner || !(await verifyPassword(currentPassword, owner.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" }); return;
  }
  await updateOwnerPassword(owner.id, newPassword);
  logger.info({ ownerId: owner.id }, "owner: changed password");
  res.json({ ok: true });
});

router.post("/owner/set-email", requireOwner, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email is required" }); return;
  }
  await updateOwnerEmail(req.owner!.ownerId, email.trim().toLowerCase());
  logger.info({ ownerId: req.owner!.ownerId, email }, "owner: set email");
  res.json({ ok: true });
});

router.post("/owner/reset-password-request", async (req, res): Promise<void> => {
  const { username } = req.body as { username?: string };
  if (!username || typeof username !== "string") { res.status(400).json({ error: "Username is required" }); return; }
  const owner = await findOwnerByUsername(username.trim());
  if (!owner || !owner.email) { res.json({ ok: true }); return; }
  const code = await issueOwnerResetCode(owner.id);
  await sendEmail({ to: owner.email, subject: "Owner panel password reset", text: `Your owner panel password reset code is: ${code}\n\nThis code expires in 10 minutes.` });
  res.json({ ok: true });
});

router.post("/owner/reset-password", async (req, res): Promise<void> => {
  const { username, code, newPassword } = req.body as { username?: string; code?: string; newPassword?: string };
  if (!username || !code || !newPassword || typeof username !== "string" || typeof code !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Username, code and new password are required" }); return;
  }
  if (!isPasswordStrong(newPassword)) {
    res.status(400).json({ error: "New password must be at least 16 characters and include uppercase, lowercase, number, and symbol" }); return;
  }
  const owner = await findOwnerByUsername(username.trim());
  if (!owner) { res.status(400).json({ error: "Invalid username or code" }); return; }
  if (!(await verifyOwnerResetCode(owner.id, code))) { res.status(400).json({ error: "Invalid or expired code" }); return; }
  await updateOwnerPassword(owner.id, newPassword);
  logger.info({ ownerId: owner.id }, "owner: reset password via email");
  res.json({ ok: true });
});

/* ─── Stats ──────────────────────────────────────────────────────────────── */

router.get("/owner/stats", requireOwner, async (_req, res): Promise<void> => {
  const [userStats] = await db
    .select({
      totalUsers: sql<number>`count(*)::int`,
      proUsers:   sql<number>`count(*) filter (where is_pro = true)::int`,
      adminUsers: sql<number>`count(*) filter (where is_admin = true)::int`,
    })
    .from(usersTable);

  const [codeStats] = await db
    .select({ activeCodes: sql<number>`count(*) filter (where status = 'active')::int` })
    .from(activationCodesTable);

  const [subStats] = await db
    .select({ totalSubs: sql<number>`count(*)::int` })
    .from(proSubscriptionsTable);

  res.json({
    totalUsers:        userStats?.totalUsers  ?? 0,
    proUsers:          userStats?.proUsers    ?? 0,
    adminUsers:        userStats?.adminUsers  ?? 0,
    activeCodes:       codeStats?.activeCodes ?? 0,
    totalSubscriptions: subStats?.totalSubs   ?? 0,
  });
});

/* ─── Users ──────────────────────────────────────────────────────────────── */

router.get("/owner/users", requireOwner, async (req, res): Promise<void> => {
  const q      = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const limit  = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const where = q
    ? or(like(usersTable.username, `%${q}%`), like(usersTable.displayName, `%${q}%`), like(usersTable.email, `%${q}%`))
    : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(where);

  const users = await db
    .select({
      id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
      email: usersTable.email, isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt,
      isAdmin: usersTable.isAdmin, status: usersTable.status, createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    total,
    items: users.map((u) => ({
      ...u,
      proExpiresAt: u.proExpiresAt?.toISOString() ?? null,
      createdAt:    u.createdAt.toISOString(),
    })),
  });
});

router.post("/owner/users/:id/pro", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const durationDays = Number(req.body?.durationDays) || 30;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await activateProForUser(userId, { provider: "owner", durationDays });
  logger.info({ userId, durationDays, by: req.owner!.ownerId }, "owner: activated pro");
  res.json({ ok: true });
});

router.delete("/owner/users/:id/pro", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  await deactivatePro(userId);
  logger.info({ userId, by: req.owner!.ownerId }, "owner: deactivated pro");
  res.json({ ok: true });
});

router.post("/owner/users/:id/admin", requireOwner, async (req, res): Promise<void> => {
  const userId  = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const isAdmin = req.body?.isAdmin === true;
  const [user]  = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set({ isAdmin }).where(eq(usersTable.id, userId));
  logger.info({ userId, isAdmin, by: req.owner!.ownerId }, "owner: toggled admin");
  res.json({ ok: true });
});

/* ─── Activation Codes ───────────────────────────────────────────────────── */

router.get("/owner/activation-codes", requireOwner, async (_req, res): Promise<void> => {
  const codes = await db.select().from(activationCodesTable).orderBy(desc(activationCodesTable.createdAt));
  res.json({
    items: codes.map((c) => ({
      id: c.id, code: c.code, status: c.status, durationDays: c.durationDays,
      maxUses: c.maxUses, usedCount: c.usedCount,
      expiresAt:  c.expiresAt?.toISOString()  ?? null,
      createdAt:  c.createdAt.toISOString(),
    })),
  });
});

router.post("/owner/activation-codes", requireOwner, async (req, res): Promise<void> => {
  const { code: rawCode, durationDays = 30, maxUses = 1, expiresAt } = (req.body ?? {}) as {
    code?: string; durationDays?: number; maxUses?: number; expiresAt?: string;
  };

  const finalCode = (rawCode || generateActivationCode()).toUpperCase().trim();
  const [existing] = await db.select().from(activationCodesTable).where(eq(activationCodesTable.code, finalCode)).limit(1);
  if (existing) { res.status(409).json({ error: "Code already exists" }); return; }

  const [row] = await db.insert(activationCodesTable).values({
    code: finalCode,
    durationDays: Number(durationDays),
    maxUses:      Number(maxUses),
    expiresAt:    expiresAt ? new Date(expiresAt) : null,
  }).returning();

  logger.info({ code: finalCode, by: req.owner!.ownerId }, "owner: created activation code");
  res.status(201).json({
    id: row.id, code: row.code, status: row.status, durationDays: row.durationDays,
    maxUses: row.maxUses, usedCount: row.usedCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/owner/activation-codes/:id", requireOwner, async (req, res): Promise<void> => {
  const codeId = Number(req.params.id);
  if (!codeId) { res.status(400).json({ error: "Invalid code id" }); return; }
  await db.update(activationCodesTable).set({ status: "inactive" }).where(eq(activationCodesTable.id, codeId));
  logger.info({ codeId, by: req.owner!.ownerId }, "owner: disabled activation code");
  res.json({ ok: true });
});

/* ─── Pro Subscriptions ──────────────────────────────────────────────────── */

router.get("/owner/pro-subscriptions", requireOwner, async (_req, res): Promise<void> => {
  const subs = await db
    .select({
      id: proSubscriptionsTable.id,
      userId: proSubscriptionsTable.userId,
      orderId: proSubscriptionsTable.orderId,
      provider: proSubscriptionsTable.provider,
      status: proSubscriptionsTable.status,
      amount: proSubscriptionsTable.amount,
      currency: proSubscriptionsTable.currency,
      startedAt: proSubscriptionsTable.startedAt,
      expiresAt: proSubscriptionsTable.expiresAt,
      createdAt: proSubscriptionsTable.createdAt,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(proSubscriptionsTable)
    .leftJoin(usersTable, eq(proSubscriptionsTable.userId, usersTable.id))
    .orderBy(desc(proSubscriptionsTable.createdAt))
    .limit(200);

  res.json({
    items: subs.map((s) => ({
      ...s,
      startedAt: s.startedAt?.toISOString() ?? null,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      createdAt: s.createdAt?.toISOString() ?? null,
    })),
  });
});

export default router;
