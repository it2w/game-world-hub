import { Router, type IRouter } from "express";
import { eq, like, or, desc, sql, inArray, ne } from "drizzle-orm";
import { db, pool, superAdminsTable, usersTable, proSubscriptionsTable, activationCodesTable, lfgPostsTable, messagesTable, partiesTable, notificationsTable } from "@workspace/db";
import { requireOwner, signOwnerToken } from "../middlewares/owner";
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
  if (!owner) { res.json({ ok: true }); return; }

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
    filterBy === "online"    ? sql`${usersTable.lastActiveAt} >= ${min5} and ${usersTable.status} != 'offline'` :
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

export default router;

