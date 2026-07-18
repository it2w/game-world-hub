import { Router, type IRouter } from "express";
import { eq, like, or, desc, sql, inArray, ne, and, gte } from "drizzle-orm";
import os from "node:os";
import { getMetrics } from "../lib/metrics";
import { db, pool, superAdminsTable, usersTable, proSubscriptionsTable, activationCodesTable, lfgPostsTable, messagesTable, partiesTable, notificationsTable } from "@workspace/db";
import { requireOwner, signOwnerToken, verifyOwnerToken } from "../middlewares/owner";
import { findOwnerByUsername, findOwnerById, verifyPassword, updateOwnerPassword, updateOwnerEmail, isPasswordStrong } from "../lib/owner";
import { activateProForUser, deactivatePro, generateActivationCode } from "../lib/pro";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const router: IRouter = Router();

/* ─── Activity log table (created once on startup) ──────────────────────── */

pool.query(`
  CREATE TABLE IF NOT EXISTS owner_activity_log (
    id          SERIAL PRIMARY KEY,
    action      TEXT NOT NULL,
    target_id   INTEGER,
    target_name TEXT,
    detail      TEXT,
    owner_id    INTEGER NOT NULL,
    owner_name  TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )
`).catch((e) => logger.error(e, "owner_activity_log: migration failed"));

async function logOwnerAction(
  ownerId: number,
  ownerName: string,
  action: string,
  opts?: { targetId?: number; targetName?: string; detail?: string },
) {
  await pool.query(
    `INSERT INTO owner_activity_log (action, target_id, target_name, detail, owner_id, owner_name)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [action, opts?.targetId ?? null, opts?.targetName ?? null, opts?.detail ?? null, ownerId, ownerName],
  ).catch(() => {/* non-fatal */});
}

/* ─── Reset helpers ──────────────────────────────────────────────────────── */

const RESET_TTL_MS     = 10 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function generateResetCode(): string { return String(randomInt(100000, 1000000)); }

async function issueOwnerResetCode(ownerId: number): Promise<string> {
  const code = generateResetCode();
  const codeHash = await bcrypt.hash(code, 10);
  await db.update(superAdminsTable).set({
    passwordResetCodeHash: codeHash,
    passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
    passwordResetAttempts: 0,
  }).where(eq(superAdminsTable.id, ownerId));
  return code;
}

async function verifyOwnerResetCode(ownerId: number, code: string): Promise<boolean> {
  const [owner] = await db.select().from(superAdminsTable).where(eq(superAdminsTable.id, ownerId)).limit(1);
  if (!owner?.passwordResetCodeHash || !owner.passwordResetExpiresAt) return false;
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

/* ─── Login brute-force protection ──────────────────────────────────────── */

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

interface LoginBucket { count: number; windowStart: number }
const loginBuckets = new Map<string, LoginBucket>();

/** Exposed for tests to reset state between runs. */
export function _resetLoginBucket(key: string): void {
  loginBuckets.delete(key);
}

/**
 * Returns true if the request is allowed (under the limit).
 * Increments the failure counter — call only on failed attempts.
 */
function recordFailedLogin(key: string): { allowed: boolean } {
  const now = Date.now();
  const bucket = loginBuckets.get(key);
  if (!bucket || now - bucket.windowStart > LOGIN_WINDOW_MS) {
    loginBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= LOGIN_MAX_ATTEMPTS };
}

function isLoginBlocked(key: string): boolean {
  const now = Date.now();
  const bucket = loginBuckets.get(key);
  if (!bucket || now - bucket.windowStart > LOGIN_WINDOW_MS) return false;
  return bucket.count >= LOGIN_MAX_ATTEMPTS;
}

/* ─── Auth ───────────────────────────────────────────────────────────────── */

router.post("/owner/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Username and password are required" }); return;
  }

  const key = username.trim().toLowerCase();

  if (isLoginBlocked(key)) {
    res.status(429).json({ error: "Too many failed login attempts. Please try again later." }); return;
  }

  const owner = await findOwnerByUsername(username.trim());
  if (!owner || !(await verifyPassword(password, owner.passwordHash))) {
    const { allowed } = recordFailedLogin(key);
    if (!allowed) {
      res.status(429).json({ error: "Too many failed login attempts. Please try again later." }); return;
    }
    res.status(401).json({ error: "Invalid credentials" }); return;
  }

  // Successful login — clear the failure bucket.
  loginBuckets.delete(key);

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
  if (!owner) { res.json({ ok: true }); return; }

  // If a non-expired code already exists, do NOT issue a new one.
  // Issuing a new code would reset passwordResetAttempts to 0, allowing the
  // brute-force cap to be bypassed by repeatedly requesting fresh codes.
  const now = new Date();
  if (owner.passwordResetExpiresAt && owner.passwordResetExpiresAt > now) {
    // Return silently so the caller can't distinguish "code exists" from "code sent".
    res.json({ ok: true });
    return;
  }

  const isProd = process.env.NODE_ENV === "production";

  // No email configured — block in prod with a clear message; expose code in dev.
  if (!owner.email) {
    if (isProd) {
      res.status(400).json({ error: "No email address is configured for this owner account. Please set an email from the Account tab while logged in, or contact your system administrator." });
      return;
    }
    const code = await issueOwnerResetCode(owner.id);
    logger.warn({ ownerId: owner.id, code }, "[DEV] owner reset code (no email configured)");
    res.json({ ok: true, devCode: code, devNote: "No email configured — code shown in dev mode only" });
    return;
  }

  const code = await issueOwnerResetCode(owner.id);
  await sendEmail({
    to: owner.email,
    subject: "Owner panel password reset",
    text: `Your owner panel password reset code is: ${code}\n\nThis code expires in 10 minutes.`,
  });

  // In dev, also return the code so the owner doesn't need to read the mailbox file.
  if (!isProd) {
    logger.warn({ ownerId: owner.id, code }, "[DEV] owner reset code (also sent to dev mailbox)");
    res.json({ ok: true, devCode: code, devNote: "Dev mode — code shown on screen; email captured to /tmp/gwh-dev-emails.jsonl" });
    return;
  }

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
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const h24   = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const min5  = new Date(Date.now() - 5 * 60 * 1000);

  const [[userStats], [codeStats], [subStats], [lfgStats], [msgStats], [partyStats], recentSignups, topPlayers] = await Promise.all([
    db.select({
      totalUsers:  sql<number>`count(*)::int`,
      proUsers:    sql<number>`count(*) filter (where is_pro = true)::int`,
      adminUsers:  sql<number>`count(*) filter (where is_admin = true)::int`,
      newToday:    sql<number>`count(*) filter (where created_at >= ${today})::int`,
      newWeek:     sql<number>`count(*) filter (where created_at >= ${week7})::int`,
      activeToday: sql<number>`count(*) filter (where last_active_at >= ${h24})::int`,
      onlineNow:   sql<number>`count(*) filter (where last_active_at >= ${min5} and status != 'offline' and status != 'suspended')::int`,
      suspended:   sql<number>`count(*) filter (where status = 'suspended')::int`,
    }).from(usersTable),

    db.select({ activeCodes: sql<number>`count(*) filter (where status = 'active')::int` }).from(activationCodesTable),
    db.select({ totalSubs: sql<number>`count(*)::int` }).from(proSubscriptionsTable),
    db.select({
      openPosts:  sql<number>`count(*) filter (where status = 'open')::int`,
      totalPosts: sql<number>`count(*)::int`,
    }).from(lfgPostsTable),
    db.select({ totalMessages: sql<number>`count(*)::int` }).from(messagesTable),
    db.select({ activeParties: sql<number>`count(*)::int` }).from(partiesTable),

    db.select({
      id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
      isPro: usersTable.isPro, isAdmin: usersTable.isAdmin, createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt)).limit(6),

    db.select({
      id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
      isPro: usersTable.isPro, status: usersTable.status,
      lfgCount: sql<number>`(select count(*)::int from lfg_posts where author_id = ${usersTable.id})`,
    }).from(usersTable)
      .orderBy(sql`(select count(*) from lfg_posts where author_id = ${usersTable.id}) desc`)
      .limit(5),
  ]);

  res.json({
    totalUsers:         userStats?.totalUsers   ?? 0,
    proUsers:           userStats?.proUsers     ?? 0,
    adminUsers:         userStats?.adminUsers   ?? 0,
    newToday:           userStats?.newToday     ?? 0,
    newWeek:            userStats?.newWeek      ?? 0,
    activeToday:        userStats?.activeToday  ?? 0,
    onlineNow:          userStats?.onlineNow    ?? 0,
    suspended:          userStats?.suspended    ?? 0,
    activeCodes:        codeStats?.activeCodes  ?? 0,
    totalSubscriptions: subStats?.totalSubs     ?? 0,
    openLfgPosts:       lfgStats?.openPosts     ?? 0,
    totalLfgPosts:      lfgStats?.totalPosts    ?? 0,
    totalMessages:      msgStats?.totalMessages ?? 0,
    activeParties:      partyStats?.activeParties ?? 0,
    recentSignups: recentSignups.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    topPlayers,
  });
});

/* ─── Users ──────────────────────────────────────────────────────────────── */

router.get("/owner/users", requireOwner, async (req, res): Promise<void> => {
  const q        = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const filterBy = typeof req.query.filterBy === "string" ? req.query.filterBy : "all";
  const limit    = Math.min(Number(req.query.limit) || 20, 100);
  const offset   = Number(req.query.offset) || 0;
  const min5     = new Date(Date.now() - 5 * 60 * 1000);

  const searchCond = q
    ? or(like(usersTable.username, `%${q}%`), like(usersTable.displayName, `%${q}%`), like(usersTable.email, `%${q}%`))
    : undefined;

  const filterCond =
    filterBy === "pro"       ? eq(usersTable.isPro, true) :
    filterBy === "admin"     ? eq(usersTable.isAdmin, true) :
    filterBy === "suspended" ? eq(usersTable.status, "suspended") :
    filterBy === "online"    ? and(gte(usersTable.lastActiveAt, min5), ne(usersTable.status, "offline"), ne(usersTable.status, "suspended")) :
    undefined;

  // combine search + filter manually
  const where =
    searchCond && filterCond ? sql`(${searchCond}) AND (${filterCond})` :
    searchCond ? searchCond :
    filterCond ? filterCond :
    undefined;

  const [[{ total }], users] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(usersTable).where(where),
    db.select({
      id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
      email: usersTable.email, isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt,
      isAdmin: usersTable.isAdmin, status: usersTable.status, createdAt: usersTable.createdAt,
      lastActiveAt: usersTable.lastActiveAt,
    }).from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
  ]);

  res.json({
    total,
    items: users.map((u) => ({
      ...u,
      proExpiresAt: u.proExpiresAt?.toISOString() ?? null,
      createdAt:    u.createdAt.toISOString(),
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
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
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "activate_pro", { targetId: userId, targetName: user.username, detail: `${durationDays} days` });
  logger.info({ userId, durationDays, by: req.owner!.ownerId }, "owner: activated pro");
  res.json({ ok: true });
});

router.delete("/owner/users/:id/pro", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  await deactivatePro(userId);
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "deactivate_pro", { targetId: userId, targetName: user?.username });
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
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, isAdmin ? "grant_admin" : "revoke_admin", { targetId: userId, targetName: user.username });
  logger.info({ userId, isAdmin, by: req.owner!.ownerId }, "owner: toggled admin");
  res.json({ ok: true });
});

router.post("/owner/users/:id/suspend", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, userId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "suspend_user", { targetId: userId, targetName: user.username });
  logger.info({ userId, by: req.owner!.ownerId }, "owner: suspended user");
  res.json({ ok: true });
});

router.delete("/owner/users/:id/suspend", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set({ status: "offline" }).where(eq(usersTable.id, userId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "unsuspend_user", { targetId: userId, targetName: user.username });
  logger.info({ userId, by: req.owner!.ownerId }, "owner: unsuspended user");
  res.json({ ok: true });
});

/* ─── Admins ─────────────────────────────────────────────────────────────── */

router.get("/owner/admins", requireOwner, async (_req, res): Promise<void> => {
  const admins = await db
    .select({
      id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
      email: usersTable.email, status: usersTable.status, isPro: usersTable.isPro,
      createdAt: usersTable.createdAt, lastActiveAt: usersTable.lastActiveAt,
      lfgCount: sql<number>`(select count(*)::int from lfg_posts where author_id = ${usersTable.id})`,
    })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true))
    .orderBy(desc(usersTable.createdAt));

  res.json({
    items: admins.map((a) => ({
      ...a,
      createdAt:    a.createdAt.toISOString(),
      lastActiveAt: a.lastActiveAt?.toISOString() ?? null,
    })),
  });
});

/* ─── Activity Log ───────────────────────────────────────────────────────── */

router.get("/owner/activity-log", requireOwner, async (req, res): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const { rows } = await pool.query<{
    id: number; action: string; target_id: number | null; target_name: string | null;
    detail: string | null; owner_id: number; owner_name: string; created_at: string;
  }>(
    `SELECT id, action, target_id, target_name, detail, owner_id, owner_name, created_at
     FROM owner_activity_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const [{ total }] = (await pool.query<{ total: number }>("SELECT count(*)::int AS total FROM owner_activity_log")).rows;

  res.json({
    total,
    items: rows.map((r) => ({
      id: r.id,
      action:     r.action,
      targetId:   r.target_id,
      targetName: r.target_name,
      detail:     r.detail,
      ownerId:    r.owner_id,
      ownerName:  r.owner_name,
      createdAt:  r.created_at,
    })),
  });
});

/* ─── Broadcast ──────────────────────────────────────────────────────────── */

router.post("/owner/broadcast", requireOwner, async (req, res): Promise<void> => {
  const { title, body } = req.body as { title?: string; body?: string };
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Title is required" }); return;
  }

  // Fetch all non-suspended user IDs
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`${usersTable.status} != 'suspended'`);

  if (users.length === 0) { res.json({ ok: true, sent: 0 }); return; }

  // Batch insert notifications (chunks of 200 to avoid query limits)
  const CHUNK = 200;
  let sent = 0;
  for (let i = 0; i < users.length; i += CHUNK) {
    const chunk = users.slice(i, i + CHUNK);
    await db.insert(notificationsTable).values(
      chunk.map((u) => ({
        userId: u.id,
        type: "announcement",
        title: title.trim(),
        body: body?.trim() ?? null,
      })),
    );
    sent += chunk.length;
  }

  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "broadcast", {
    detail: `"${title.trim()}" → ${sent} users`,
  });
  logger.info({ sent, by: req.owner!.ownerId }, "owner: broadcast sent");
  res.json({ ok: true, sent });
});

/* ─── Activation Codes ───────────────────────────────────────────────────── */

router.get("/owner/activation-codes", requireOwner, async (_req, res): Promise<void> => {
  const codes = await db.select().from(activationCodesTable).orderBy(desc(activationCodesTable.createdAt));
  res.json({
    items: codes.map((c) => ({
      id: c.id, code: c.code, status: c.status, durationDays: c.durationDays,
      maxUses: c.maxUses, usedCount: c.usedCount,
      expiresAt: c.expiresAt?.toISOString()  ?? null,
      createdAt: c.createdAt.toISOString(),
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

  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "create_code", { detail: `${finalCode} (${durationDays}d × ${maxUses})` });
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
  const [code] = await db.select({ code: activationCodesTable.code }).from(activationCodesTable).where(eq(activationCodesTable.id, codeId)).limit(1);
  await db.update(activationCodesTable).set({ status: "inactive" }).where(eq(activationCodesTable.id, codeId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "disable_code", { detail: code?.code });
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

/* ─── DB migrations for new security tables (run once at startup) ────────── */

Promise.allSettled([
  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_invalidated_before TIMESTAMPTZ`),
  /* Fix author_id FK if it was previously created pointing at users instead of super_admins. */
  pool.query(`
    DO $mig$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid  = t.oid
        JOIN pg_class r ON c.confrelid = r.oid
        WHERE t.relname = 'admin_notes'
          AND c.conname = 'admin_notes_author_id_fkey'
          AND r.relname = 'users'
      ) THEN
        ALTER TABLE admin_notes DROP CONSTRAINT admin_notes_author_id_fkey;
        ALTER TABLE admin_notes
          ADD CONSTRAINT admin_notes_author_id_fkey
          FOREIGN KEY (author_id) REFERENCES super_admins(id) ON DELETE CASCADE;
      END IF;
    END $mig$
  `),
  pool.query(`
    CREATE TABLE IF NOT EXISTS admin_notes (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id  INTEGER NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`CREATE INDEX IF NOT EXISTS admin_notes_user_id_idx ON admin_notes(user_id)`),
  pool.query(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      can_manage_pro     BOOLEAN NOT NULL DEFAULT false,
      can_suspend_users  BOOLEAN NOT NULL DEFAULT false,
      can_delete_content BOOLEAN NOT NULL DEFAULT false,
      can_view_reports   BOOLEAN NOT NULL DEFAULT false,
      can_manage_codes   BOOLEAN NOT NULL DEFAULT false,
      can_broadcast      BOOLEAN NOT NULL DEFAULT false,
      can_view_analytics BOOLEAN NOT NULL DEFAULT false,
      can_manage_admins  BOOLEAN NOT NULL DEFAULT false,
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `),
  // Add can_manage_admins to tables that already existed before this column was introduced.
  pool.query(`ALTER TABLE admin_permissions ADD COLUMN IF NOT EXISTS can_manage_admins BOOLEAN NOT NULL DEFAULT false`).catch(() => {/* table may not exist yet */}),
  pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_by INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id          SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('user','lfg','party')),
      target_id   INTEGER NOT NULL,
      target_name TEXT,
      reason      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','actioned')),
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`
    CREATE TABLE IF NOT EXISTS denylist (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL CHECK (type IN ('email','domain','username')),
      value      TEXT NOT NULL,
      added_by   INTEGER,
      reason     TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      UNIQUE (type, value)
    )
  `),
]).then(async () => {
  await pool.query(`
    INSERT INTO platform_settings (key, value) VALUES
      ('registrations_enabled', 'true'),
      ('maintenance_mode',      'false'),
      ('maintenance_message',   'The platform is currently under maintenance. Please try again later.')
    ON CONFLICT (key) DO NOTHING
  `).catch(() => {/* non-fatal */});
}).catch((e) => logger.error(e, "owner: security tables migration failed"));

/* ─── Force Logout ───────────────────────────────────────────────────────── */

router.post("/owner/users/:id/force-logout", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set({ sessionsInvalidatedBefore: new Date() }).where(eq(usersTable.id, userId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "force_logout", { targetId: userId, targetName: user.username });
  logger.info({ userId, by: req.owner!.ownerId }, "owner: force logout");
  res.json({ ok: true });
});

/* ─── Admin Permissions ──────────────────────────────────────────────────── */

type AdminPermsRow = {
  user_id: number;
  can_manage_pro: boolean; can_suspend_users: boolean; can_delete_content: boolean;
  can_view_reports: boolean; can_manage_codes: boolean; can_broadcast: boolean;
  can_view_analytics: boolean; can_manage_admins: boolean;
};

const defaultPerms = (userId: number): AdminPermsRow => ({
  user_id: userId,
  can_manage_pro: false, can_suspend_users: false, can_delete_content: false,
  can_view_reports: false, can_manage_codes: false, can_broadcast: false,
  can_view_analytics: false, can_manage_admins: false,
});

router.get("/owner/admins/:id/permissions", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const { rows } = await pool.query<AdminPermsRow>(`SELECT * FROM admin_permissions WHERE user_id = $1`, [userId]);
  res.json(rows[0] ?? defaultPerms(userId));
});

router.put("/owner/admins/:id/permissions", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const body = req.body as Record<string, boolean | undefined>;
  const p = {
    canManagePro:     Boolean(body.canManagePro),
    canSuspendUsers:  Boolean(body.canSuspendUsers),
    canDeleteContent: Boolean(body.canDeleteContent),
    canViewReports:   Boolean(body.canViewReports),
    canManageCodes:   Boolean(body.canManageCodes),
    canBroadcast:     Boolean(body.canBroadcast),
    canViewAnalytics: Boolean(body.canViewAnalytics),
    canManageAdmins:  Boolean(body.canManageAdmins),
  };
  await pool.query(`
    INSERT INTO admin_permissions
      (user_id, can_manage_pro, can_suspend_users, can_delete_content,
       can_view_reports, can_manage_codes, can_broadcast, can_view_analytics,
       can_manage_admins, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      can_manage_pro=$2, can_suspend_users=$3, can_delete_content=$4,
      can_view_reports=$5, can_manage_codes=$6, can_broadcast=$7,
      can_view_analytics=$8, can_manage_admins=$9, updated_at=NOW()
  `, [userId, p.canManagePro, p.canSuspendUsers, p.canDeleteContent,
      p.canViewReports, p.canManageCodes, p.canBroadcast, p.canViewAnalytics, p.canManageAdmins]);
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "set_permissions", { targetId: userId });
  res.json({ ok: true });
});

/* ─── Reports (owner view) ───────────────────────────────────────────────── */

router.get("/owner/reports", requireOwner, async (req, res): Promise<void> => {
  const status  = typeof req.query.status === "string" ? req.query.status : "pending";
  const limit   = Math.min(Number(req.query.limit) || 50, 200);
  const offset  = Number(req.query.offset) || 0;
  const VALID   = new Set(["pending", "reviewed", "actioned", "all"]);
  if (!VALID.has(status)) { res.status(400).json({ error: "Invalid status filter" }); return; }

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<{
      id: number; reporter_id: number; reporter_username: string | null; reporter_name: string | null;
      target_type: string; target_id: number; target_name: string | null;
      reason: string; status: string; reviewed_by: number | null; reviewed_at: string | null; created_at: string;
    }>(`
      SELECT r.*, u.username AS reporter_username, u.display_name AS reporter_name
      FROM reports r
      LEFT JOIN users u ON u.id = r.reporter_id
      ${status !== "all" ? "WHERE r.status = $3" : ""}
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
    `, status !== "all" ? [limit, offset, status] : [limit, offset]),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM reports ${status !== "all" ? "WHERE status = $1" : ""}`,
      status !== "all" ? [status] : [],
    ),
  ]);

  res.json({ total: countRows[0]?.total ?? 0, items: rows });
});

router.put("/owner/reports/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid report id" }); return; }
  const { status = "reviewed" } = req.body as { status?: string };
  if (!["reviewed", "actioned"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const { rowCount } = await pool.query(
    `UPDATE reports SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3`,
    [status, req.owner!.ownerId, id],
  );
  if (!rowCount) { res.status(404).json({ error: "Report not found" }); return; }
  res.json({ ok: true });
});

/* ─── Denylist ───────────────────────────────────────────────────────────── */

router.get("/owner/denylist", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{
    id: number; type: string; value: string; reason: string | null; added_by: number | null; created_at: string;
  }>(`SELECT id, type, value, reason, added_by, created_at FROM denylist ORDER BY created_at DESC`);
  res.json({ items: rows });
});

router.post("/owner/denylist", requireOwner, async (req, res): Promise<void> => {
  const { type, value, reason } = req.body as { type?: string; value?: string; reason?: string };
  if (!type || !value || !["email", "domain", "username"].includes(type)) {
    res.status(400).json({ error: "type (email|domain|username) and value are required" }); return;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) { res.status(400).json({ error: "Value cannot be empty" }); return; }
  try {
    const { rows } = await pool.query<{ id: number; type: string; value: string }>(
      `INSERT INTO denylist (type, value, added_by, reason) VALUES ($1,$2,$3,$4) RETURNING id, type, value`,
      [type, normalized, req.owner!.ownerId, reason?.trim() || null],
    );
    await logOwnerAction(req.owner!.ownerId, req.owner!.username, "denylist_add", { detail: `${type}:${normalized}` });
    res.status(201).json(rows[0]);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") { res.status(409).json({ error: "Entry already exists" }); return; }
    throw e;
  }
});

router.delete("/owner/denylist/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rows } = await pool.query<{ type: string; value: string }>(
    `DELETE FROM denylist WHERE id=$1 RETURNING type, value`, [id],
  );
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "denylist_remove", { detail: `${rows[0].type}:${rows[0].value}` });
  res.json({ ok: true });
});

/* ─── Platform Settings ──────────────────────────────────────────────────── */

router.get("/owner/settings", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{ key: string; value: string }>(`SELECT key, value FROM platform_settings`);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

const ALLOWED_SETTINGS = new Set(["registrations_enabled", "maintenance_mode", "maintenance_message"]);

router.put("/owner/settings", requireOwner, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string | boolean>;
  const entries = Object.entries(updates)
    .filter(([k]) => ALLOWED_SETTINGS.has(k))
    .map(([k, v]) => [k, String(v)] as [string, string]);
  if (!entries.length) { res.status(400).json({ error: "No valid settings provided" }); return; }

  await Promise.all(entries.map(([key, value]) =>
    pool.query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()`,
      [key, value, req.owner!.ownerId],
    ),
  ));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "update_settings", {
    detail: entries.map(([k, v]) => `${k}=${v}`).join(", "),
  });
  res.json({ ok: true });
});

/* ─── Analytics (5-min in-process cache) ────────────────────────────────── */

let _analyticsCache: { range: number; data: unknown; ts: number } | null = null;
const ANALYTICS_TTL_MS = 5 * 60 * 1000;

router.get("/owner/analytics", requireOwner, async (req, res): Promise<void> => {
  const range = Math.min(Math.max(Number(req.query.range) || 30, 7), 90);
  if (_analyticsCache && _analyticsCache.range === range && Date.now() - _analyticsCache.ts < ANALYTICS_TTL_MS) {
    res.json(_analyticsCache.data); return;
  }

  const [nu, dau, lfg, pro] = await Promise.all([
    pool.query<{ date: string; count: number }>(`
      SELECT to_char(s, 'YYYY-MM-DD') AS date,
             coalesce((SELECT count(*)::int FROM users u WHERE date_trunc('day', u.created_at AT TIME ZONE 'UTC') = s), 0) AS count
      FROM generate_series(
        date_trunc('day', NOW() - ($1 || ' days')::interval),
        date_trunc('day', NOW()),
        '1 day'::interval
      ) AS s ORDER BY s
    `, [range]),
    pool.query<{ date: string; count: number }>(`
      SELECT to_char(s, 'YYYY-MM-DD') AS date,
             coalesce((SELECT count(*)::int FROM users u WHERE date_trunc('day', u.last_active_at AT TIME ZONE 'UTC') = s), 0) AS count
      FROM generate_series(
        date_trunc('day', NOW() - ($1 || ' days')::interval),
        date_trunc('day', NOW()),
        '1 day'::interval
      ) AS s ORDER BY s
    `, [range]),
    pool.query<{ date: string; count: number }>(`
      SELECT to_char(s, 'YYYY-MM-DD') AS date,
             coalesce((SELECT count(*)::int FROM lfg_posts p WHERE date_trunc('day', p.created_at AT TIME ZONE 'UTC') = s), 0) AS count
      FROM generate_series(
        date_trunc('day', NOW() - ($1 || ' days')::interval),
        date_trunc('day', NOW()),
        '1 day'::interval
      ) AS s ORDER BY s
    `, [range]),
    pool.query<{ date: string; count: number }>(`
      SELECT to_char(s, 'YYYY-MM-DD') AS date,
             coalesce((SELECT count(*)::int FROM pro_subscriptions ps WHERE date_trunc('day', ps.created_at AT TIME ZONE 'UTC') = s AND ps.provider != 'manual-expiry'), 0) AS count
      FROM generate_series(
        date_trunc('day', NOW() - ($1 || ' days')::interval),
        date_trunc('day', NOW()),
        '1 day'::interval
      ) AS s ORDER BY s
    `, [range]),
  ]);

  const peakDau = dau.rows.reduce((m, r) => Math.max(m, r.count), 0);
  const [proR, usrR] = await Promise.all([
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE is_pro = true`),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`),
  ]);
  const proConvRate = usrR.rows[0]?.n ? +((proR.rows[0]?.n ?? 0) / usrR.rows[0].n * 100).toFixed(1) : 0;

  const data = { range, newUsers: nu.rows, dau: dau.rows, lfgPosts: lfg.rows, proActivations: pro.rows, summary: { peakDau, proConvRate } };
  _analyticsCache = { range, data, ts: Date.now() };
  res.json(data);
});

/* ─── User Detail ─────────────────────────────────────────────────────────── */

router.get("/owner/users/:id/detail", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId || !Number.isInteger(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const { getUserProgress } = await import("../lib/xp");

  const [progress, proHistRes, notesRes, rptRes] = await Promise.all([
    getUserProgress(userId).catch(() => null),
    pool.query<{ id: number; provider: string; status: string; started_at: string | null; expires_at: string | null; amount: string | null; currency: string | null }>(
      `SELECT id, provider, status, started_at, expires_at, amount, currency
       FROM pro_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`,
      [userId],
    ).catch(() => ({ rows: [] as { id: number; provider: string; status: string; started_at: string | null; expires_at: string | null; amount: string | null; currency: string | null }[] })),
    pool.query<{ id: number; author_id: number; author_name: string | null; body: string; created_at: string }>(
      `SELECT n.id, n.author_id, sa.username AS author_name, n.body, n.created_at
       FROM admin_notes n LEFT JOIN super_admins sa ON sa.id = n.author_id
       WHERE n.user_id=$1 ORDER BY n.created_at DESC`,
      [userId],
    ).catch(() => ({ rows: [] as { id: number; author_id: number; author_name: string | null; body: string; created_at: string }[] })),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM reports WHERE target_type='user' AND target_id=$1`,
      [userId],
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ]);

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email ?? null,
    status: user.status,
    avatarUrl: user.avatarUrl ?? null,
    isPro: user.isPro,
    isAdmin: user.isAdmin,
    proExpiresAt: user.proExpiresAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    progress,
    proHistory: proHistRes.rows,
    notes: notesRes.rows,
    reportCount: rptRes.rows[0]?.total ?? 0,
  });
});

/* ─── Admin Notes ─────────────────────────────────────────────────────────── */

router.get("/owner/users/:id/notes", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const { rows } = await pool.query<{ id: number; author_id: number; author_name: string | null; body: string; created_at: string }>(
    `SELECT n.id, n.author_id, sa.username AS author_name, n.body, n.created_at
     FROM admin_notes n LEFT JOIN super_admins sa ON sa.id = n.author_id
     WHERE n.user_id=$1 ORDER BY n.created_at DESC`,
    [userId],
  ).catch(() => ({ rows: [] as { id: number; author_id: number; author_name: string | null; body: string; created_at: string }[] }));
  res.json({ items: rows });
});

router.post("/owner/users/:id/notes", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) { res.status(400).json({ error: "body is required" }); return; }
  if (body.length > 2000) { res.status(400).json({ error: "Note must be ≤2000 characters" }); return; }
  const { rows } = await pool.query<{ id: number; body: string; created_at: string }>(
    `INSERT INTO admin_notes (user_id, author_id, body) VALUES ($1,$2,$3) RETURNING id, body, created_at`,
    [userId, req.owner!.ownerId, body],
  );
  res.status(201).json({ ...rows[0], author_id: req.owner!.ownerId, author_name: req.owner!.username });
});

router.delete("/owner/notes/:noteId", requireOwner, async (req, res): Promise<void> => {
  const noteId = Number(req.params.noteId);
  if (!noteId) { res.status(400).json({ error: "Invalid note id" }); return; }
  const { rowCount } = await pool.query(`DELETE FROM admin_notes WHERE id=$1`, [noteId]);
  if (!rowCount) { res.status(404).json({ error: "Note not found" }); return; }
  res.json({ ok: true });
});

/* ─── Content Moderation ──────────────────────────────────────────────────── */

/* ─── System Health ───────────────────────────────────────────────────────── */

router.get("/owner/system", requireOwner, (_req, res): void => {
  const cpus   = os.cpus();
  const load   = os.loadavg();                    // [1m, 5m, 15m]
  const total  = os.totalmem();
  const free   = os.freemem();
  const used   = total - free;
  const heap   = process.memoryUsage();
  const { requestsPerMin, avgResponseMs } = getMetrics();

  const region =
    process.env["REPLIT_CLUSTER"] ??
    process.env["FLY_REGION"] ??
    process.env["RAILWAY_REGION"] ??
    "replit-us";

  res.json({
    cpu: {
      cores:   cpus.length,
      loadavg: load.map((v) => Math.round(v * 100) / 100),
      usedPct: Math.min(100, Math.round((load[0]! / cpus.length) * 100)),
    },
    ram: {
      totalMb: Math.round(total / 1024 / 1024),
      usedMb:  Math.round(used  / 1024 / 1024),
      freeMb:  Math.round(free  / 1024 / 1024),
      usedPct: Math.round((used / total) * 100),
    },
    heap: {
      usedMb:  Math.round(heap.heapUsed  / 1024 / 1024),
      totalMb: Math.round(heap.heapTotal / 1024 / 1024),
      rssMb:   Math.round(heap.rss       / 1024 / 1024),
    },
    uptime:         Math.round(process.uptime()),
    region,
    requestsPerMin,
    avgResponseMs,
  });
});

router.get("/owner/content", requireOwner, async (req, res): Promise<void> => {
  const type   = typeof req.query.type   === "string" ? req.query.type   : "lfg";
  const limit  = Math.min(Number(req.query.limit)  || 20, 100);
  const offset = Math.max(Number(req.query.offset) || 0,  0);

  if (type === "lfg") {
    const [items, total] = await Promise.all([
      pool.query<{ id: number; game: string; description: string; status: string; author_id: number; author_username: string | null; response_count: number; created_at: string }>(`
        SELECT p.id, p.game, p.description, p.status, p.author_id,
               u.username AS author_username,
               (SELECT count(*)::int FROM lfg_responses WHERE post_id=p.id) AS response_count,
               p.created_at
        FROM lfg_posts p LEFT JOIN users u ON u.id=p.author_id
        ORDER BY p.created_at DESC LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM lfg_posts`),
    ]);
    res.json({ total: total.rows[0]?.n ?? 0, items: items.rows });
  } else if (type === "party") {
    const [items, total] = await Promise.all([
      pool.query<{ id: number; name: string; game: string | null; leader_id: number; leader_username: string | null; member_count: number; max_size: number; created_at: string }>(`
        SELECT pa.id, pa.name, pa.game, pa.leader_id,
               u.username AS leader_username,
               (SELECT count(*)::int FROM party_members WHERE party_id=pa.id) AS member_count,
               pa.max_size, pa.created_at
        FROM parties pa LEFT JOIN users u ON u.id=pa.leader_id
        ORDER BY pa.created_at DESC LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM parties`),
    ]);
    res.json({ total: total.rows[0]?.n ?? 0, items: items.rows });
  } else {
    res.status(400).json({ error: "type must be lfg or party" });
  }
});

router.delete("/owner/content/lfg/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rowCount } = await pool.query(`DELETE FROM lfg_posts WHERE id=$1`, [id]);
  if (!rowCount) { res.status(404).json({ error: "LFG post not found" }); return; }
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "delete_content", { targetId: id, detail: `lfg_post #${id}` });
  res.json({ ok: true });
});

router.delete("/owner/content/party/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rowCount } = await pool.query(`DELETE FROM parties WHERE id=$1`, [id]);
  if (!rowCount) { res.status(404).json({ error: "Party not found" }); return; }
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "delete_content", { targetId: id, detail: `party #${id}` });
  res.json({ ok: true });
});

/* ─── Bulk Actions ────────────────────────────────────────────────────────── */

const BULK_ACTIONS = ["activate_pro", "deactivate_pro", "suspend", "unsuspend", "force_logout"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

router.post("/owner/users/bulk", requireOwner, async (req, res): Promise<void> => {
  const { userIds, action, durationDays } = req.body as { userIds?: unknown; action?: unknown; durationDays?: unknown };
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: "userIds must be a non-empty array" }); return;
  }
  if (userIds.length > 100) {
    res.status(400).json({ error: "Cannot bulk-action more than 100 users" }); return;
  }
  if (!BULK_ACTIONS.includes(action as BulkAction)) {
    res.status(400).json({ error: `action must be one of: ${BULK_ACTIONS.join(", ")}` }); return;
  }
  const days = Math.max(Number(durationDays) || 30, 1);
  const succeeded: number[] = [];
  const failed: number[] = [];

  for (const uid of (userIds as unknown[]).map(Number).filter((n) => n > 0 && Number.isInteger(n))) {
    try {
      switch (action as BulkAction) {
        case "activate_pro":   await activateProForUser(uid, { provider: "owner_bulk", durationDays: days }); break;
        case "deactivate_pro": await deactivatePro(uid); break;
        case "suspend":        await db.update(usersTable).set({ status: "suspended"                }).where(eq(usersTable.id, uid)); break;
        case "unsuspend":      await db.update(usersTable).set({ status: "offline"                  }).where(eq(usersTable.id, uid)); break;
        case "force_logout":   await db.update(usersTable).set({ sessionsInvalidatedBefore: new Date() }).where(eq(usersTable.id, uid)); break;
      }
      succeeded.push(uid);
    } catch { failed.push(uid); }
  }

  await logOwnerAction(req.owner!.ownerId, req.owner!.username, `bulk_${action as string}`, {
    detail: `${succeeded.length} ok, ${failed.length} failed`,
  });
  res.json({ succeeded, failed });
});

/* ─── Export (CSV, token also accepted via ?token= for window.open) ──────── */

router.get("/owner/export/users", async (req, res): Promise<void> => {
  const rawToken = typeof req.query.token === "string"
    ? req.query.token
    : (req.headers.authorization ?? "").replace("Bearer ", "");
  try { verifyOwnerToken(rawToken); } catch { res.status(401).json({ error: "Unauthorized" }); return; }

  const { rows } = await pool.query<{
    id: number; username: string; display_name: string | null; email: string | null;
    is_pro: boolean; is_admin: boolean; status: string; created_at: string; last_active_at: string | null;
  }>(`SELECT id, username, display_name, email, is_pro, is_admin, status, created_at, last_active_at FROM users ORDER BY id ASC`);

  const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["id,username,display_name,email,is_pro,is_admin,status,created_at,last_active_at",
    ...rows.map((r) => [r.id, r.username, esc(r.display_name), esc(r.email), r.is_pro, r.is_admin, r.status, r.created_at, r.last_active_at ?? ""].join(","))
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get("/owner/export/log", async (req, res): Promise<void> => {
  const rawToken = typeof req.query.token === "string"
    ? req.query.token
    : (req.headers.authorization ?? "").replace("Bearer ", "");
  try { verifyOwnerToken(rawToken); } catch { res.status(401).json({ error: "Unauthorized" }); return; }

  const { rows } = await pool.query<{
    id: number; action: string; target_id: number | null; target_name: string | null;
    detail: string | null; owner_name: string; created_at: string;
  }>(`
    SELECT al.id, al.action, al.target_id, u.username AS target_name, al.detail,
           sa.username AS owner_name, al.created_at
    FROM owner_activity_log al
    LEFT JOIN users u      ON u.id  = al.target_id
    LEFT JOIN super_admins sa ON sa.id = al.owner_id
    ORDER BY al.created_at DESC LIMIT 5000
  `);

  const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["id,action,target_id,target_name,detail,owner_name,created_at",
    ...rows.map((r) => [r.id, r.action, r.target_id ?? "", esc(r.target_name), esc(r.detail), r.owner_name, r.created_at].join(","))
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;

