import { Router, type IRouter } from "express";
import { eq, like, or, desc, sql, inArray, ne, and, gte } from "drizzle-orm";
import os from "node:os";
import crypto from "node:crypto";
import { getMetrics, getCpuPct } from "../lib/metrics";
import { db, pool, superAdminsTable, usersTable, proSubscriptionsTable, activationCodesTable, lfgPostsTable, messagesTable, partiesTable, notificationsTable } from "@workspace/db";
import { requireOwner, signOwnerToken, verifyOwnerToken, signOwnerPreAuthToken, verifyOwnerPreAuthToken } from "../middlewares/owner";
import { findOwnerByUsername, findOwnerById, verifyPassword, updateOwnerPassword, updateOwnerEmail, updateOwnerUsername, isPasswordStrong } from "../lib/owner";
import { activateProForUser, deactivatePro, generateActivationCode } from "../lib/pro";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { disconnectUser } from "../ws/signaling";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { generateSecret, generateURI, verify as totpVerify } from "otplib/functional";

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

/* ─── Reset endpoint rate limiting ──────────────────────────────────────── */

const RESET_RATE_MAX       = 5;
const RESET_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Persist rate-limit buckets in the DB so they survive server restarts.
pool.query(`
  CREATE TABLE IF NOT EXISTS owner_reset_rate_buckets (
    key          TEXT PRIMARY KEY,
    count        INTEGER NOT NULL DEFAULT 0,
    window_start BIGINT  NOT NULL
  )
`).then(() => purgeExpiredResetRateBuckets())
  .catch((e) => logger.error(e, "owner_reset_rate_buckets: migration failed"));

// Periodically remove expired buckets so the table doesn't grow without bound.
// Runs every full rate-limit window (15 minutes).
setInterval(() => {
  purgeExpiredResetRateBuckets().catch((e) => logger.error(e, "owner_reset_rate_buckets: periodic purge failed"));
}, RESET_RATE_WINDOW_MS).unref();

/**
 * Deletes rows whose rate-limit window has already expired.
 * Exposed for tests.
 */
export async function purgeExpiredResetRateBuckets(): Promise<number> {
  const cutoff = Date.now() - RESET_RATE_WINDOW_MS;
  const { rowCount } = await pool.query(
    `DELETE FROM owner_reset_rate_buckets WHERE window_start < $1`,
    [cutoff],
  );
  const deleted = rowCount ?? 0;
  if (deleted > 0) {
    logger.info({ deleted }, "owner_reset_rate_buckets: purged expired rows");
  }
  return deleted;
}

/** Exposed for tests to reset state between runs. */
export async function _resetResetRateBucket(key: string): Promise<void> {
  await pool.query(`DELETE FROM owner_reset_rate_buckets WHERE key = $1`, [key]);
}

/* ─── Probe alert email deduplication ───────────────────────────────────── */

/**
 * At most one probe-alert email is sent per owner per this window.
 * Prevents inbox flooding when an attacker rapidly repeats reset requests.
 */
const PROBE_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const probeAlertSentAt = new Map<number, number>(); // ownerId → timestamp

/** Exposed for tests to reset cooldown state between runs. */
export function _resetProbeAlertCooldown(ownerId: number): void {
  probeAlertSentAt.delete(ownerId);
}

/**
 * Returns true if a probe alert email may be sent for this owner right now,
 * and records the timestamp so subsequent calls within the cooldown return false.
 */
function claimProbeAlertSlot(ownerId: number): boolean {
  const now = Date.now();
  const last = probeAlertSentAt.get(ownerId);
  if (last !== undefined && now - last < PROBE_ALERT_COOLDOWN_MS) return false;
  probeAlertSentAt.set(ownerId, now);
  return true;
}

/** Remove stale entries from the in-memory login rate-limit map.
 *  Reset-code rate limits are DB-backed (purgeExpiredResetRateBuckets). */
export function sweepRateBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of loginBuckets) {
    if (now - bucket.windowStart > LOGIN_WINDOW_MS) loginBuckets.delete(key);
  }
}

/** Interval handle — exported so tests can cancel it and avoid timer leaks. */
export const rateBucketSweepInterval = setInterval(sweepRateBuckets, 5 * 60 * 1000);
// Allow Node.js to exit even if this interval is still running (e.g. in tests).
rateBucketSweepInterval.unref();

/**
 * Returns true if the request is within the allowed rate.
 * Always increments the counter — call on every request to these endpoints.
 * Buckets are persisted in the database so they survive server restarts.
 */
async function checkResetRate(key: string): Promise<{ allowed: boolean; retryAfterSecs: number }> {
  const now = Date.now();
  const windowCutoff = now - RESET_RATE_WINDOW_MS;

  // Atomically upsert: reset the window if it has expired, otherwise increment.
  const { rows } = await pool.query<{ count: number; window_start: string }>(`
    INSERT INTO owner_reset_rate_buckets (key, count, window_start)
    VALUES ($1, 1, $2)
    ON CONFLICT (key) DO UPDATE SET
      count        = CASE
                       WHEN owner_reset_rate_buckets.window_start < $3
                       THEN 1
                       ELSE owner_reset_rate_buckets.count + 1
                     END,
      window_start = CASE
                       WHEN owner_reset_rate_buckets.window_start < $3
                       THEN $2
                       ELSE owner_reset_rate_buckets.window_start
                     END
    RETURNING count, window_start
  `, [key, now, windowCutoff]);

  const row = rows[0];
  if (!row) return { allowed: true, retryAfterSecs: 0 };

  const count = row.count;
  const windowStart = Number(row.window_start);

  if (count > RESET_RATE_MAX) {
    const retryAfterSecs = Math.ceil((RESET_RATE_WINDOW_MS - (now - windowStart)) / 1000);
    return { allowed: false, retryAfterSecs };
  }
  return { allowed: true, retryAfterSecs: 0 };
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
    // Persist failed attempt to DB for monitoring
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    pool.query(`INSERT INTO owner_failed_logins (username, ip) VALUES ($1, $2)`,
      [username.trim().toLowerCase(), ip]).catch(() => {/* non-fatal */});
    if (!allowed) {
      res.status(429).json({ error: "Too many failed login attempts. Please try again later." }); return;
    }
    res.status(401).json({ error: "Invalid credentials" }); return;
  }

  // Successful login — clear the failure bucket.
  loginBuckets.delete(key);

  // Check panic lock
  const { rows: lockRows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key='owner_panel_locked' LIMIT 1`,
  );
  if (lockRows[0]?.value === "true") {
    logger.warn({ ownerId: owner.id }, "owner: login blocked — panic lock active");
    res.status(403).json({ error: "Owner panel is currently locked. Contact your system administrator." });
    return;
  }

  // Check if 2FA is enabled
  const { rows: totpRows } = await pool.query<{ secret: string; enabled: boolean }>(
    `SELECT secret, enabled FROM owner_totp WHERE owner_id = $1`, [owner.id],
  );
  const totp = totpRows[0];
  if (totp?.enabled) {
    // Issue short-lived pre-auth token; frontend must complete 2FA challenge
    const preToken = signOwnerPreAuthToken({ ownerId: owner.id, username: owner.username, purpose: "owner_pre_auth" });
    logger.info({ ownerId: owner.id }, "owner: login requires 2FA");
    res.json({ requires2fa: true, preToken });
    return;
  }

  const token = signOwnerToken({ ownerId: owner.id, username: owner.username, purpose: "owner" });
  // Track session
  const loginIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const ua = req.headers["user-agent"] ?? null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  pool.query(`INSERT INTO owner_sessions (owner_id, token_hash, ip, user_agent) VALUES ($1,$2,$3,$4)`,
    [owner.id, tokenHash, loginIp, ua]).catch(() => {/* non-fatal */});

  // Send login notification email
  if (owner.email) {
    sendEmail({
      to: owner.email,
      subject: "Owner panel login",
      text: `A new owner session was started.\n\nUsername: ${owner.username}\nIP: ${loginIp}\nTime: ${new Date().toUTCString()}\nUser-Agent: ${ua ?? "unknown"}\n\nIf this was not you, activate Panic Lock immediately from the Security tab.`,
    }).catch((e) => logger.error(e, "owner: failed to send login notification"));
  }
  // Webhook
  fireOwnerWebhook("owner_login", { username: owner.username, ip: loginIp, ua });

  logger.info({ ownerId: owner.id }, "owner: logged in");
  res.json({ token, owner: { id: owner.id, username: owner.username, email: owner.email ?? null } });
});

/* ─── Public gate check (no auth) ───────────────────────────────────────── */

router.get("/owner-gate/check", async (req, res): Promise<void> => {
  const k = (req.query.k as string | undefined) ?? "";
  if (!k) { res.status(400).json({ valid: false }); return; }
  const { rows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = 'owner_panel_access_key' LIMIT 1`,
  );
  const stored = rows[0]?.value ?? "";
  // Constant-time compare to prevent timing attacks
  const valid = stored.length > 0 && crypto.timingSafeEqual(
    Buffer.from(k.padEnd(64, "\0")), Buffer.from(stored.padEnd(64, "\0")),
  ) && k === stored;
  res.json({ valid });
});

/* ─── Owner me / profile ─────────────────────────────────────────────────── */

router.get("/owner/me", requireOwner, async (req, res): Promise<void> => {
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner) { res.status(401).json({ error: "Owner not found" }); return; }
  const { rows: skRows } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_settings WHERE key = 'owner_panel_access_key' LIMIT 1`,
  );
  res.json({ id: owner.id, username: owner.username, email: owner.email ?? null, emailVerified: owner.emailVerified, accessKey: skRows[0]?.value ?? null });
});

/* ─── Change username ────────────────────────────────────────────────────── */

router.post("/owner/account/change-username", requireOwner, async (req, res): Promise<void> => {
  const { newUsername, currentPassword } = req.body as { newUsername?: string; currentPassword?: string };
  if (!newUsername || !currentPassword || typeof newUsername !== "string" || typeof currentPassword !== "string") {
    res.status(400).json({ error: "New username and current password are required" }); return;
  }
  const trimmed = newUsername.trim();
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(trimmed)) {
    res.status(400).json({ error: "Username must be 3–32 characters (letters, numbers, underscores only)" }); return;
  }
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner || !(await verifyPassword(currentPassword, owner.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" }); return;
  }
  // Check uniqueness
  const existing = await findOwnerByUsername(trimmed);
  if (existing && existing.id !== owner.id) {
    res.status(409).json({ error: "Username is already taken" }); return;
  }
  await updateOwnerUsername(owner.id, trimmed);
  await logOwnerAction(owner.id, trimmed, "change_username", { detail: `${owner.username} → ${trimmed}` });
  logger.info({ ownerId: owner.id, from: owner.username, to: trimmed }, "owner: changed username");
  res.json({ ok: true, newUsername: trimmed });
});

/* ─── Regenerate panel access key ───────────────────────────────────────── */

router.post("/owner/account/regenerate-access-key", requireOwner, async (req, res): Promise<void> => {
  const { currentPassword } = req.body as { currentPassword?: string };
  if (!currentPassword || typeof currentPassword !== "string") {
    res.status(400).json({ error: "Current password is required to regenerate the access key" }); return;
  }
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner || !(await verifyPassword(currentPassword, owner.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" }); return;
  }
  const newKey = crypto.randomUUID();
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ('owner_panel_access_key',$1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$1, updated_by=$2, updated_at=NOW()`,
    [newKey, req.owner!.ownerId],
  );
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "regenerate_access_key", {});
  logger.info({ ownerId: req.owner!.ownerId }, "owner: access key regenerated");
  res.json({ ok: true, accessKey: newKey });
});

/* ─── Panic lock ─────────────────────────────────────────────────────────── */

router.post("/owner/account/panic-lock", requireOwner, async (req, res): Promise<void> => {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ('owner_panel_locked','true',$1,NOW())
     ON CONFLICT (key) DO UPDATE SET value='true', updated_by=$1, updated_at=NOW()`,
    [req.owner!.ownerId],
  );
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "panic_lock", {});
  logger.warn({ ownerId: req.owner!.ownerId }, "owner: PANIC LOCK ACTIVATED — all logins disabled");
  res.json({ ok: true, locked: true });
});

router.delete("/owner/account/panic-lock", requireOwner, async (req, res): Promise<void> => {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ('owner_panel_locked','false',$1,NOW())
     ON CONFLICT (key) DO UPDATE SET value='false', updated_by=$1, updated_at=NOW()`,
    [req.owner!.ownerId],
  );
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "panic_unlock", {});
  logger.info({ ownerId: req.owner!.ownerId }, "owner: panic lock lifted");
  res.json({ ok: true, locked: false });
});

/* ─── Change password ────────────────────────────────────────────────────── */

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
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown");
  const { allowed, retryAfterSecs } = await checkResetRate(`reset-req:${ip}`);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Too many reset requests. Please try again later." });
    return;
  }

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
    // But log the probe attempt so the owner has visibility into active attacks.
    const probeIp = req.ip ?? "unknown";
    const probeDetail = `username=${owner.username} ip=${probeIp}`;
    await logOwnerAction(owner.id, owner.username, "reset_bypass_attempt", { detail: probeDetail });
    logger.warn({ ownerId: owner.id, ip: probeIp }, "owner: reset bypass attempt detected");

    // Send an alert email if the owner has one configured.
    // Rate-limited to at most once per PROBE_ALERT_COOLDOWN_MS per owner to
    // prevent inbox flooding when an attacker rapidly repeats reset requests.
    if (owner.email && claimProbeAlertSlot(owner.id)) {
      sendEmail({
        to: owner.email,
        subject: "Security alert: owner password reset probed",
        text: `Someone requested a new owner password reset code while one was already active.\n\nDetails:\n  Username: ${owner.username}\n  IP address: ${probeIp}\n  Time: ${new Date().toUTCString()}\n  Existing code expires at: ${owner.passwordResetExpiresAt!.toUTCString()}\n\nIf this was not you, your owner panel may be under attack.`,
      }).catch((e) => logger.error(e, "owner: failed to send reset probe alert email"));
    }

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
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown");
  const { allowed, retryAfterSecs } = await checkResetRate(`reset:${ip}`);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Too many reset requests. Please try again later." });
    return;
  }

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

/* ─── Create user ────────────────────────────────────────────────────────── */

router.post("/owner/users", requireOwner, async (req, res): Promise<void> => {
  const { username, displayName, email, password } = req.body ?? {};
  if (!username || !displayName || !password) {
    res.status(400).json({ error: "username, displayName and password are required" }); return;
  }
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    res.status(400).json({ error: "Username must be 3-30 chars: letters, numbers, underscores only" }); return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" }); return;
  }
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.username, String(username).toLowerCase())).limit(1);
  if (existing) { res.status(409).json({ error: "Username already taken" }); return; }
  const passwordHash = await bcrypt.hash(String(password), 10);
  const [user] = await db.insert(usersTable).values({
    username: String(username).toLowerCase(),
    displayName: String(displayName).trim(),
    email: email ? String(email).trim().toLowerCase() : null,
    passwordHash,
  }).returning({ id: usersTable.id, username: usersTable.username });
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "create_user", { targetId: user.id, targetName: user.username });
  logger.info({ userId: user.id, by: req.owner!.ownerId }, "owner: created user");
  res.status(201).json({ ok: true, id: user.id, username: user.username });
});

/* ─── Edit user profile ──────────────────────────────────────────────────── */

router.patch("/owner/users/:id", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const { displayName, email, bio, region, username, newPassword } = req.body ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  if (displayName !== undefined) updates.displayName = String(displayName).trim();
  if (email !== undefined) updates.email = email ? String(email).trim().toLowerCase() : null;
  if (bio !== undefined) updates.bio = bio || null;
  if (region !== undefined) updates.region = region || null;
  if (username !== undefined) {
    const uname = String(username).toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(uname)) {
      res.status(400).json({ error: "Invalid username format" }); return;
    }
    const [taken] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.username, uname), ne(usersTable.id, userId))).limit(1);
    if (taken) { res.status(409).json({ error: "Username already taken" }); return; }
    updates.username = uname;
  }
  if (newPassword) {
    if (String(newPassword).length < 6) { res.status(400).json({ error: "Password too short (min 6)" }); return; }
    updates.passwordHash = await bcrypt.hash(String(newPassword), 10);
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "edit_user", { targetId: userId, targetName: user.username, detail: Object.keys(updates).join(", ") });
  logger.info({ userId, fields: Object.keys(updates), by: req.owner!.ownerId }, "owner: edited user");
  res.json({ ok: true });
});

/* ─── Extend / adjust Pro expiry ─────────────────────────────────────────── */

router.patch("/owner/users/:id/pro", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const { expiresAt, addDays } = req.body ?? {};
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  let newExpiry: Date;
  if (expiresAt) {
    newExpiry = new Date(expiresAt);
    if (isNaN(newExpiry.getTime())) { res.status(400).json({ error: "Invalid date format" }); return; }
  } else if (addDays !== undefined) {
    const base = user.proExpiresAt && user.proExpiresAt > new Date() ? user.proExpiresAt : new Date();
    newExpiry = new Date(base.getTime() + Number(addDays) * 86_400_000);
  } else {
    res.status(400).json({ error: "Provide expiresAt or addDays" }); return;
  }
  await db.update(usersTable).set({ isPro: true, proExpiresAt: newExpiry }).where(eq(usersTable.id, userId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "extend_pro", { targetId: userId, targetName: user.username, detail: newExpiry.toISOString() });
  logger.info({ userId, newExpiry, by: req.owner!.ownerId }, "owner: adjusted pro expiry");
  res.json({ ok: true, expiresAt: newExpiry.toISOString() });
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

/* ─── Activity Log (with filters) ───────────────────────────────────────── */

router.get("/owner/activity-log", requireOwner, async (req, res): Promise<void> => {
  const limit   = Math.min(Number(req.query.limit) || 50, 200);
  const offset  = Number(req.query.offset) || 0;
  const action  = typeof req.query.action === "string" && req.query.action ? req.query.action : null;
  const from    = typeof req.query.from   === "string" && req.query.from   ? req.query.from   : null;
  const to      = typeof req.query.to     === "string" && req.query.to     ? req.query.to     : null;
  const ownerId = typeof req.query.ownerId === "string" && req.query.ownerId ? Number(req.query.ownerId) : null;

  // Build parameterised WHERE clause
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (action)  { params.push(action);           conditions.push(`action = $${params.length}`); }
  if (from)    { params.push(new Date(from));   conditions.push(`created_at >= $${params.length}`); }
  if (to)      { params.push(new Date(to));     conditions.push(`created_at <= $${params.length}`); }
  if (ownerId) { params.push(ownerId);          conditions.push(`owner_id = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Paginated items
  const itemParams = [...params, limit, offset];
  const { rows } = await pool.query<{
    id: number; action: string; target_id: number | null; target_name: string | null;
    detail: string | null; owner_id: number; owner_name: string; created_at: string;
  }>(
    `SELECT id, action, target_id, target_name, detail, owner_id, owner_name, created_at
     FROM owner_activity_log ${where}
     ORDER BY created_at DESC
     LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
    itemParams,
  );

  // Total count with same filters
  const countParams = [...params];
  const [{ total }] = (await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM owner_activity_log ${where}`, countParams,
  )).rows;

  // Return distinct action names for the filter dropdown
  const { rows: actionRows } = await pool.query<{ action: string }>(
    `SELECT DISTINCT action FROM owner_activity_log ORDER BY action`,
  );

  res.json({
    total,
    actions: actionRows.map((r) => r.action),
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

/* ─── DB migrations for NEW security/feature tables (run once at startup) ─── */

/* Tables for 2FA, IP allowlist, owner sessions, IP ban, email blast log */
Promise.allSettled([
  pool.query(`
    CREATE TABLE IF NOT EXISTS owner_totp (
      owner_id   INTEGER PRIMARY KEY REFERENCES super_admins(id) ON DELETE CASCADE,
      secret     TEXT NOT NULL,
      enabled    BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`
    CREATE TABLE IF NOT EXISTS owner_ip_allowlist (
      id         SERIAL PRIMARY KEY,
      cidr       TEXT NOT NULL UNIQUE,
      label      TEXT,
      added_by   INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`
    CREATE TABLE IF NOT EXISTS owner_sessions (
      id           SERIAL PRIMARY KEY,
      owner_id     INTEGER NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,
      ip           TEXT,
      user_agent   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      last_used_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      revoked_at   TIMESTAMPTZ
    )
  `),
  pool.query(`CREATE INDEX IF NOT EXISTS owner_sessions_owner_id_idx ON owner_sessions(owner_id)`),
  pool.query(`
    CREATE TABLE IF NOT EXISTS ip_bans (
      id         SERIAL PRIMARY KEY,
      ip         TEXT NOT NULL UNIQUE,
      reason     TEXT,
      added_by   INTEGER,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`
    CREATE TABLE IF NOT EXISTS owner_failed_logins (
      id         SERIAL PRIMARY KEY,
      username   TEXT NOT NULL,
      ip         TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `),
  pool.query(`CREATE INDEX IF NOT EXISTS owner_failed_logins_ip_idx ON owner_failed_logins(ip)`),
  pool.query(`CREATE INDEX IF NOT EXISTS owner_failed_logins_ts_idx ON owner_failed_logins(created_at)`),
]).catch((e) => logger.error(e, "owner: new security tables migration failed"));

/* ─── Original security table migrations ────────────────────────────────── */

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
      ('registrations_enabled',  'true'),
      ('maintenance_mode',       'false'),
      ('maintenance_message',    'The platform is currently under maintenance. Please try again later.'),
      ('owner_panel_locked',     'false'),
      ('owner_panel_access_key', gen_random_uuid()::text)
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

const ALLOWED_SETTINGS = new Set([
  "registrations_enabled",
  "maintenance_mode",
  "maintenance_message",
  "username_min_length",
  "username_max_length",
  "display_name_min_length",
  "display_name_max_length",
  "bio_max_length",
  "lfg_cooldown_minutes",
  "max_party_size",
  "feature_clips",
  "feature_polls",
  "feature_shop",
  "feature_events",
  "feature_stages",
  "feature_leaderboards",
  // Security & notifications
  "owner_webhook_url",
  "pro_expiry_notify_days",
  // Media limits
  "max_upload_size_mb",
  "max_clip_size_mb",
  "max_avatar_size_mb",
]);

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
  const cpus  = os.cpus();
  const load  = os.loadavg();
  const heap  = process.memoryUsage();
  const { requestsPerMin, avgResponseMs, totalBytesIn, totalBytesOut } = getMetrics();

  // Process RSS is the real memory footprint of this Node.js process
  const rssMb        = Math.round(heap.rss        / 1024 / 1024);
  const heapUsedMb   = Math.round(heap.heapUsed   / 1024 / 1024);
  const heapTotalMb  = Math.round(heap.heapTotal  / 1024 / 1024);

  // Host RAM (the Replit container shares a large host; shown for context)
  const hostTotalMb  = Math.round(os.totalmem() / 1024 / 1024);
  const hostFreeMb   = Math.round(os.freemem()  / 1024 / 1024);

  const region =
    process.env["REPLIT_CLUSTER"] ??
    process.env["FLY_REGION"] ??
    process.env["RAILWAY_REGION"] ??
    os.hostname();

  res.json({
    cpu: {
      cores:    cpus.length,
      loadavg:  load.map((v) => Math.round(v * 100) / 100),
      usedPct:  getCpuPct(),   // real process CPU via process.cpuUsage() delta
    },
    ram: {
      rssMb,                   // real process footprint
      heapUsedMb,
      heapTotalMb,
      heapPct: heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0,
      hostTotalMb,
      hostFreeMb,
    },
    uptime:         Math.round(process.uptime()),
    region,
    requestsPerMin,
    avgResponseMs,
    totalBytesIn,
    totalBytesOut,
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

/* ════════════════════════════════════════════════════════════════════════════
   OWNER 2FA (TOTP)
   ════════════════════════════════════════════════════════════════════════════ */

/** Step 1: Generate secret + URI (call when owner wants to set up 2FA). */
router.post("/owner/2fa/setup", requireOwner, async (req, res): Promise<void> => {
  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner) { res.status(404).json({ error: "Owner not found" }); return; }

  // Generate a new secret even if one exists (allows re-keying)
  const secret = generateSecret();
  const uri    = generateURI({ type: "totp", label: owner.username, params: { secret, issuer: "Game World Hub" } });

  // Persist (upsert) secret but leave enabled=false until verified
  await pool.query(`
    INSERT INTO owner_totp (owner_id, secret, enabled) VALUES ($1,$2,false)
    ON CONFLICT (owner_id) DO UPDATE SET secret=$2, enabled=false
  `, [owner.id, secret]);

  res.json({ secret, uri });
});

/** Step 2: Verify TOTP code to activate 2FA. */
router.post("/owner/2fa/enable", requireOwner, async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") { res.status(400).json({ error: "TOTP code is required" }); return; }

  const { rows } = await pool.query<{ secret: string }>(
    `SELECT secret FROM owner_totp WHERE owner_id=$1`, [req.owner!.ownerId],
  );
  if (!rows[0]) { res.status(400).json({ error: "Call /2fa/setup first" }); return; }

  const valid = await totpVerify({ token: code.trim(), secret: rows[0].secret });
  if (!valid) { res.status(400).json({ error: "Invalid TOTP code" }); return; }

  await pool.query(`UPDATE owner_totp SET enabled=true WHERE owner_id=$1`, [req.owner!.ownerId]);
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "enable_2fa");
  logger.info({ ownerId: req.owner!.ownerId }, "owner: 2FA enabled");
  res.json({ ok: true });
});

/** Disable 2FA (requires current password for confirmation). */
router.delete("/owner/2fa", requireOwner, async (req, res): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (!password || typeof password !== "string") { res.status(400).json({ error: "Password is required to disable 2FA" }); return; }

  const owner = await findOwnerById(req.owner!.ownerId);
  if (!owner || !(await verifyPassword(password, owner.passwordHash))) {
    res.status(401).json({ error: "Incorrect password" }); return;
  }

  await pool.query(`DELETE FROM owner_totp WHERE owner_id=$1`, [req.owner!.ownerId]);
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "disable_2fa");
  logger.info({ ownerId: req.owner!.ownerId }, "owner: 2FA disabled");
  res.json({ ok: true });
});

/** Get 2FA status. */
router.get("/owner/2fa/status", requireOwner, async (req, res): Promise<void> => {
  const { rows } = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM owner_totp WHERE owner_id=$1`, [req.owner!.ownerId],
  );
  res.json({ enabled: rows[0]?.enabled ?? false });
});

/** Verify TOTP during login (exchanges pre-auth token for full owner token). */
router.post("/owner/2fa/verify", async (req, res): Promise<void> => {
  const { preToken, code } = req.body as { preToken?: string; code?: string };
  if (!preToken || !code || typeof preToken !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "preToken and code are required" }); return;
  }

  let payload;
  try { payload = verifyOwnerPreAuthToken(preToken); }
  catch { res.status(401).json({ error: "Invalid or expired pre-auth token" }); return; }

  const { rows } = await pool.query<{ secret: string; enabled: boolean }>(
    `SELECT secret, enabled FROM owner_totp WHERE owner_id=$1`, [payload.ownerId],
  );
  if (!rows[0]?.enabled) { res.status(400).json({ error: "2FA is not enabled for this account" }); return; }

  if (!(await totpVerify({ token: code.trim(), secret: rows[0].secret }))) {
    res.status(401).json({ error: "Invalid TOTP code" }); return;
  }

  const token = signOwnerToken({ ownerId: payload.ownerId, username: payload.username, purpose: "owner" });
  // Track session
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const ua = req.headers["user-agent"] ?? null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  pool.query(`INSERT INTO owner_sessions (owner_id, token_hash, ip, user_agent) VALUES ($1,$2,$3,$4)`,
    [payload.ownerId, tokenHash, ip, ua]).catch(() => {/* non-fatal */});

  // Send login notification email
  const owner2fa = await findOwnerById(payload.ownerId);
  if (owner2fa?.email) {
    sendEmail({
      to: owner2fa.email,
      subject: "Owner panel login (2FA verified)",
      text: `A new owner session was started (with 2FA).\n\nUsername: ${payload.username}\nIP: ${ip}\nTime: ${new Date().toUTCString()}\nUser-Agent: ${ua ?? "unknown"}\n\nIf this was not you, activate Panic Lock immediately from the Security tab.`,
    }).catch((e) => logger.error(e, "owner: failed to send 2FA login notification"));
  }

  logger.info({ ownerId: payload.ownerId }, "owner: 2FA verified, logged in");
  res.json({ token, owner: { id: payload.ownerId, username: payload.username, email: owner2fa?.email ?? null } });
});

/* ════════════════════════════════════════════════════════════════════════════
   OWNER SESSIONS
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/sessions", requireOwner, async (req, res): Promise<void> => {
  const { rows } = await pool.query<{
    id: number; ip: string | null; user_agent: string | null;
    created_at: string; last_used_at: string; is_current: boolean;
  }>(`
    SELECT id, ip, user_agent, created_at, last_used_at,
           token_hash = $1 AS is_current
    FROM owner_sessions
    WHERE owner_id=$2 AND revoked_at IS NULL
    ORDER BY last_used_at DESC
  `, [
    crypto.createHash("sha256").update(req.headers.authorization!.slice(7)).digest("hex"),
    req.owner!.ownerId,
  ]);
  res.json({ items: rows });
});

router.delete("/owner/sessions/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rowCount } = await pool.query(
    `UPDATE owner_sessions SET revoked_at=NOW() WHERE id=$1 AND owner_id=$2 AND revoked_at IS NULL`,
    [id, req.owner!.ownerId],
  );
  if (!rowCount) { res.status(404).json({ error: "Session not found" }); return; }
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "revoke_session", { detail: `session #${id}` });
  res.json({ ok: true });
});

/** Revoke all OTHER sessions (keep current). */
router.delete("/owner/sessions", requireOwner, async (req, res): Promise<void> => {
  const currentHash = crypto.createHash("sha256").update(req.headers.authorization!.slice(7)).digest("hex");
  const { rowCount } = await pool.query(
    `UPDATE owner_sessions SET revoked_at=NOW()
     WHERE owner_id=$1 AND revoked_at IS NULL AND token_hash != $2`,
    [req.owner!.ownerId, currentHash],
  );
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "revoke_all_sessions", { detail: `${rowCount ?? 0} sessions revoked` });
  res.json({ ok: true, revoked: rowCount ?? 0 });
});

/* ════════════════════════════════════════════════════════════════════════════
   IP ALLOWLIST
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/ip-allowlist", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{ id: number; cidr: string; label: string | null; added_by: number; created_at: string }>(
    `SELECT id, cidr, label, added_by, created_at FROM owner_ip_allowlist ORDER BY created_at DESC`,
  );
  res.json({ items: rows });
});

router.post("/owner/ip-allowlist", requireOwner, async (req, res): Promise<void> => {
  const { cidr, label } = req.body as { cidr?: string; label?: string };
  if (!cidr || typeof cidr !== "string") { res.status(400).json({ error: "cidr is required" }); return; }
  const normalized = cidr.trim();
  // Basic IP/CIDR validation
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(normalized) && !/^[0-9a-fA-F:]+$/.test(normalized)) {
    res.status(400).json({ error: "Invalid IP or CIDR" }); return;
  }
  try {
    const { rows } = await pool.query<{ id: number; cidr: string; created_at: string }>(
      `INSERT INTO owner_ip_allowlist (cidr, label, added_by) VALUES ($1,$2,$3) RETURNING id, cidr, created_at`,
      [normalized, label?.trim() || null, req.owner!.ownerId],
    );
    await logOwnerAction(req.owner!.ownerId, req.owner!.username, "ip_allowlist_add", { detail: normalized });
    res.status(201).json(rows[0]);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") { res.status(409).json({ error: "IP already in allowlist" }); return; }
    throw e;
  }
});

router.delete("/owner/ip-allowlist/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rows } = await pool.query<{ cidr: string }>(`DELETE FROM owner_ip_allowlist WHERE id=$1 RETURNING cidr`, [id]);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "ip_allowlist_remove", { detail: rows[0].cidr });
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   IP BAN
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/ip-bans", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{
    id: number; ip: string; reason: string | null; added_by: number | null; expires_at: string | null; created_at: string;
  }>(`SELECT id, ip, reason, added_by, expires_at, created_at FROM ip_bans ORDER BY created_at DESC`);
  res.json({ items: rows });
});

router.post("/owner/ip-bans", requireOwner, async (req, res): Promise<void> => {
  const { ip, reason, expiresAt } = req.body as { ip?: string; reason?: string; expiresAt?: string };
  if (!ip || typeof ip !== "string") { res.status(400).json({ error: "ip is required" }); return; }
  const normalized = ip.trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized) && !/^[0-9a-fA-F:]+$/.test(normalized)) {
    res.status(400).json({ error: "Invalid IP address" }); return;
  }
  try {
    const { rows } = await pool.query<{ id: number; ip: string; created_at: string }>(
      `INSERT INTO ip_bans (ip, reason, added_by, expires_at) VALUES ($1,$2,$3,$4) RETURNING id, ip, created_at`,
      [normalized, reason?.trim() || null, req.owner!.ownerId, expiresAt ? new Date(expiresAt) : null],
    );
    await logOwnerAction(req.owner!.ownerId, req.owner!.username, "ip_ban_add", { detail: normalized });
    res.status(201).json(rows[0]);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") { res.status(409).json({ error: "IP already banned" }); return; }
    throw e;
  }
});

router.delete("/owner/ip-bans/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rows } = await pool.query<{ ip: string }>(`DELETE FROM ip_bans WHERE id=$1 RETURNING ip`, [id]);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "ip_ban_remove", { detail: rows[0].ip });
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   USER DELETE / GDPR ANONYMIZE
   ════════════════════════════════════════════════════════════════════════════ */

router.post("/owner/users/:id/anonymize", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const anon = `deleted_${crypto.randomBytes(6).toString("hex")}`;
  await db.update(usersTable).set({
    username:    anon,
    displayName: "Deleted User",
    email:       null,
    bio:         null,
    avatarUrl:   null,
    bannerUrl:   null,
    status:      "suspended",
  } as Partial<typeof usersTable.$inferInsert>).where(eq(usersTable.id, userId));

  // Remove linked accounts, social links, etc.
  await Promise.allSettled([
    pool.query(`DELETE FROM steam_accounts WHERE user_id=$1`, [userId]),
    pool.query(`DELETE FROM epic_accounts  WHERE user_id=$1`, [userId]),
    pool.query(`DELETE FROM stored_images  WHERE user_id=$1`, [userId]),
    pool.query(`DELETE FROM social_links   WHERE user_id=$1`, [userId]),
  ]);

  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "anonymize_user", {
    targetId: userId, targetName: user.username,
    detail: `anonymized → ${anon}`,
  });
  logger.info({ userId, by: req.owner!.ownerId }, "owner: anonymized user (GDPR)");
  res.json({ ok: true, anonymizedUsername: anon });
});

router.delete("/owner/users/:id", requireOwner, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Hard delete — cascades via FK constraints
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "hard_delete_user", {
    targetId: userId, targetName: user.username,
  });
  logger.info({ userId, by: req.owner!.ownerId }, "owner: hard-deleted user");
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   EMAIL BLAST
   ════════════════════════════════════════════════════════════════════════════ */

router.post("/owner/email-blast", requireOwner, async (req, res): Promise<void> => {
  const { subject, body, filter } = req.body as {
    subject?: string; body?: string;
    filter?: "all" | "pro" | "non_pro";
  };
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    res.status(400).json({ error: "subject is required" }); return;
  }
  if (!body || typeof body !== "string" || !body.trim()) {
    res.status(400).json({ error: "body is required" }); return;
  }

  const where =
    filter === "pro"     ? sql`is_pro = true AND email IS NOT NULL AND status != 'suspended'` :
    filter === "non_pro" ? sql`is_pro = false AND email IS NOT NULL AND status != 'suspended'` :
    sql`email IS NOT NULL AND status != 'suspended'`;

  const { rows: recipients } = await pool.query<{ id: number; email: string; display_name: string | null }>(
    `SELECT id, email, display_name FROM users WHERE ${where.sql}`,
  );

  if (recipients.length === 0) { res.json({ ok: true, sent: 0 }); return; }

  let sent = 0;
  let failed = 0;

  // Send in batches of 10 concurrently (Resend rate limit safe)
  const BATCH = 10;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const chunk = recipients.slice(i, i + BATCH);
    await Promise.allSettled(chunk.map(async (u) => {
      try {
        await sendEmail({
          to: u.email,
          subject: subject.trim(),
          text: body.trim().replace(/\{name\}/g, u.display_name ?? u.email.split("@")[0]),
        });
        sent++;
      } catch { failed++; }
    }));
  }

  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "email_blast", {
    detail: `"${subject.trim()}" → ${sent} sent, ${failed} failed (filter: ${filter ?? "all"})`,
  });
  logger.info({ sent, failed, filter, by: req.owner!.ownerId }, "owner: email blast complete");
  res.json({ ok: true, sent, failed });
});

/* ════════════════════════════════════════════════════════════════════════════
   FAILED LOGIN MONITORING
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/security/failed-logins", requireOwner, async (req, res): Promise<void> => {
  const hours = Math.min(Number(req.query.hours) || 24, 168); // max 7 days

  const { rows: recent } = await pool.query<{
    ip: string; count: number; usernames: string; last_attempt: string;
  }>(`
    SELECT ip,
           count(*)::int               AS count,
           string_agg(DISTINCT username, ', ' ORDER BY username) AS usernames,
           max(created_at)             AS last_attempt
    FROM owner_failed_logins
    WHERE created_at > NOW() - ($1 || ' hours')::interval
    GROUP BY ip
    ORDER BY count DESC
    LIMIT 100
  `, [hours]);

  const { rows: timeline } = await pool.query<{ ts: string; count: number }>(`
    SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') AS ts,
           count(*)::int AS count
    FROM owner_failed_logins
    WHERE created_at > NOW() - ($1 || ' hours')::interval
    GROUP BY 1 ORDER BY 1
  `, [hours]);

  const { rows: [{ total }] } = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM owner_failed_logins WHERE created_at > NOW() - ($1 || ' hours')::interval`,
    [hours],
  );

  // In-memory buckets currently blocked
  const blocked: string[] = [];
  for (const [key, bucket] of loginBuckets) {
    if (bucket.count >= LOGIN_MAX_ATTEMPTS) blocked.push(key);
  }

  res.json({ total, hours, recent, timeline, currentlyBlocked: blocked });
});

/* ════════════════════════════════════════════════════════════════════════════
   ENHANCED ACTIVITY LOG (with filters)
   ════════════════════════════════════════════════════════════════════════════ */

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
        case "suspend":        await db.update(usersTable).set({ status: "suspended"                }).where(eq(usersTable.id, uid)); disconnectUser(uid); break;
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

/* ─── Export rate limiting ───────────────────────────────────────────────── */

/** Maximum export requests per owner per window before returning 429. */
const EXPORT_RATE_MAX       = 10;
const EXPORT_RATE_WINDOW_MS = 60 * 1000; // 1 minute

interface ExportBucket { count: number; windowStart: number }
const exportBuckets = new Map<string, ExportBucket>();

/** Exposed for tests to reset state between runs. */
export function _resetExportRateBucket(key: string): void {
  exportBuckets.delete(key);
}

/**
 * Returns whether the request is within the export rate limit.
 * Always increments the counter — call on every request.
 * Key should be unique per owner per endpoint, e.g. `"export-users:42"`.
 */
function checkExportRate(key: string): { allowed: boolean; retryAfterSecs: number } {
  const now = Date.now();
  const bucket = exportBuckets.get(key);
  if (!bucket || now - bucket.windowStart > EXPORT_RATE_WINDOW_MS) {
    exportBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSecs: 0 };
  }
  bucket.count += 1;
  if (bucket.count > EXPORT_RATE_MAX) {
    const retryAfterSecs = Math.ceil((EXPORT_RATE_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSecs };
  }
  return { allowed: true, retryAfterSecs: 0 };
}

/* ─── Export (CSV) ───────────────────────────────────────────────────────── */

router.get("/owner/export/users", async (req, res): Promise<void> => {
  // Token must be supplied via Authorization: Bearer header only.
  // Accepting tokens in ?token= query parameters exposes long-lived JWTs to
  // server/proxy access logs, browser history, and Referer headers.
  const rawToken = (req.headers.authorization ?? "").replace("Bearer ", "");
  let ownerPayload: { ownerId: number };
  try { ownerPayload = verifyOwnerToken(rawToken); } catch { res.status(401).json({ error: "Unauthorized" }); return; }

  const { allowed, retryAfterSecs } = checkExportRate(`export-users:${ownerPayload.ownerId}`);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Too many export requests. Please try again later." });
    return;
  }

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
  // Token must be supplied via Authorization: Bearer header only — no ?token=.
  const rawToken = (req.headers.authorization ?? "").replace("Bearer ", "");
  let ownerPayload: { ownerId: number };
  try { ownerPayload = verifyOwnerToken(rawToken); } catch { res.status(401).json({ error: "Unauthorized" }); return; }

  const { allowed, retryAfterSecs } = checkExportRate(`export-log:${ownerPayload.ownerId}`);
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Too many export requests. Please try again later." });
    return;
  }

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

/* ════════════════════════════════════════════════════════════════════════════
   WEBHOOK NOTIFICATIONS
   ════════════════════════════════════════════════════════════════════════════ */

async function fireOwnerWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { rows } = await pool.query(`SELECT value FROM platform_settings WHERE key='owner_webhook_url'`);
    const url = rows[0]?.value?.trim();
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

router.post("/owner/test-webhook", requireOwner, async (req, res): Promise<void> => {
  await fireOwnerWebhook("test", { message: "Webhook test from owner panel", triggeredBy: req.owner!.username });
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   ERROR LOG (in-memory ring buffer)
   ════════════════════════════════════════════════════════════════════════════ */

interface ErrorLogEntry {
  id: number; ts: string; method: string; url: string;
  status: number; message: string; stack?: string;
}
let _errorLogSeq = 0;
const _errorLog: ErrorLogEntry[] = [];
const ERROR_LOG_MAX = 200;

export function captureErrorLog(method: string, url: string, status: number, err: unknown): void {
  _errorLogSeq++;
  const entry: ErrorLogEntry = {
    id: _errorLogSeq, ts: new Date().toISOString(), method, url, status,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6).join("\n") : undefined,
  };
  _errorLog.unshift(entry);
  if (_errorLog.length > ERROR_LOG_MAX) _errorLog.length = ERROR_LOG_MAX;
}

router.get("/owner/error-log", requireOwner, async (_req, res): Promise<void> => {
  res.json({ items: _errorLog });
});

/* ════════════════════════════════════════════════════════════════════════════
   CSV EXPORT — USERS
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/users/csv", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{
    id: number; username: string; display_name: string | null; email: string | null;
    is_admin: boolean; is_pro: boolean; pro_expires_at: string | null;
    created_at: string; last_active_at: string | null; status: string | null;
  }>(`
    SELECT id, username, display_name, email, is_admin, is_pro,
           to_char(pro_expires_at,'YYYY-MM-DD') AS pro_expires_at,
           to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at,
           to_char(last_active_at,'YYYY-MM-DD HH24:MI:SS') AS last_active_at,
           status
    FROM users WHERE is_bot=false ORDER BY created_at DESC
  `);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "id,username,display_name,email,is_admin,is_pro,pro_expires_at,status,created_at,last_active_at";
  const csv = [header, ...rows.map((r) =>
    [r.id, esc(r.username), esc(r.display_name), esc(r.email), r.is_admin, r.is_pro,
     esc(r.pro_expires_at), esc(r.status), esc(r.created_at), esc(r.last_active_at)].join(","),
  )].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

/* ════════════════════════════════════════════════════════════════════════════
   IP SEARCH — find all accounts from same IP
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/users/ip-search", requireOwner, async (req, res): Promise<void> => {
  const ip = String(req.query.ip ?? "").trim();
  if (!ip) { res.status(400).json({ error: "ip required" }); return; }
  const { rows } = await pool.query<{
    user_id: number; username: string; display_name: string | null;
    is_admin: boolean; is_pro: boolean; first_seen: string; last_seen: string; session_count: number;
  }>(`
    SELECT s.user_id,
           u.username, u.display_name, u.is_admin, u.is_pro,
           to_char(MIN(s.created_at),'YYYY-MM-DD HH24:MI') AS first_seen,
           to_char(MAX(s.last_active_at),'YYYY-MM-DD HH24:MI') AS last_seen,
           count(*)::int AS session_count
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.ip_address = $1
    GROUP BY s.user_id, u.username, u.display_name, u.is_admin, u.is_pro
    ORDER BY last_seen DESC
    LIMIT 50
  `, [ip]);
  res.json({ ip, items: rows });
});

/* ════════════════════════════════════════════════════════════════════════════
   USERS AT RISK — accounts with recent failed login attempts
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/users/at-risk", requireOwner, async (_req, res): Promise<void> => {
  /* Uses owner_failed_logins username field to match users */
  const { rows } = await pool.query<{
    username: string; attempts: number; unique_ips: number; last_attempt: string;
    user_id: number | null; is_pro: boolean; is_admin: boolean;
  }>(`
    SELECT fl.username,
           count(*)::int AS attempts,
           count(DISTINCT fl.ip)::int AS unique_ips,
           to_char(MAX(fl.created_at),'YYYY-MM-DD HH24:MI') AS last_attempt,
           u.id AS user_id, COALESCE(u.is_pro, false) AS is_pro, COALESCE(u.is_admin, false) AS is_admin
    FROM owner_failed_logins fl
    LEFT JOIN users u ON lower(u.username) = lower(fl.username)
    WHERE fl.created_at > NOW() - INTERVAL '7 days'
    GROUP BY fl.username, u.id, u.is_pro, u.is_admin
    HAVING count(*) >= 3
    ORDER BY attempts DESC
    LIMIT 50
  `);
  res.json({ items: rows });
});

/* ════════════════════════════════════════════════════════════════════════════
   SQL EXPLORER (read-only)
   ════════════════════════════════════════════════════════════════════════════ */

router.post("/owner/sql-explorer", requireOwner, async (req, res): Promise<void> => {
  const { sql } = req.body as { sql?: string };
  if (!sql?.trim()) { res.status(400).json({ error: "sql required" }); return; }

  const trimmed = sql.trim().toUpperCase();
  const ALLOWED_PREFIXES = ["SELECT", "WITH", "EXPLAIN"];
  const BLOCKED_KEYWORDS = ["INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE", "COPY", "CALL", "DO "];
  if (!ALLOWED_PREFIXES.some((p) => trimmed.startsWith(p))) {
    res.status(400).json({ error: "Only SELECT / WITH / EXPLAIN queries are allowed" }); return;
  }
  if (BLOCKED_KEYWORDS.some((k) => trimmed.includes(k))) {
    res.status(400).json({ error: "Query contains a forbidden keyword" }); return;
  }

  try {
    const start = Date.now();
    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN READ ONLY");
      result = await client.query({ text: sql, rowMode: "array" });
      await client.query("COMMIT");
    } finally { client.release(); }

    const elapsed = Date.now() - start;
    await logOwnerAction(req.owner!.ownerId, req.owner!.username, "sql_explorer", { detail: sql.slice(0, 200) });
    res.json({
      fields: result.fields.map((f) => f.name),
      rows: result.rows.slice(0, 500),
      rowCount: result.rowCount,
      elapsed,
      truncated: (result.rowCount ?? 0) > 500,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Query failed" });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   MONTHLY GROWTH ANALYTICS
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/analytics/monthly", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{
    month: string; new_users: number; pro_activations: number; lfg_posts: number;
  }>(`
    SELECT to_char(date_trunc('month', m), 'YYYY-MM') AS month,
           coalesce((SELECT count(*)::int FROM users u WHERE date_trunc('month', u.created_at AT TIME ZONE 'UTC') = m), 0) AS new_users,
           coalesce((SELECT count(*)::int FROM pro_subscriptions ps WHERE date_trunc('month', ps.created_at AT TIME ZONE 'UTC') = m AND ps.provider != 'manual-expiry'), 0) AS pro_activations,
           coalesce((SELECT count(*)::int FROM lfg_posts lp WHERE date_trunc('month', lp.created_at AT TIME ZONE 'UTC') = m), 0) AS lfg_posts
    FROM generate_series(
      date_trunc('month', NOW() AT TIME ZONE 'UTC' - INTERVAL '11 months'),
      date_trunc('month', NOW() AT TIME ZONE 'UTC'),
      '1 month'::interval
    ) AS m
    ORDER BY m
  `);
  res.json({ items: rows });
});

/* ════════════════════════════════════════════════════════════════════════════
   REFUND LOG
   ════════════════════════════════════════════════════════════════════════════ */

pool.query(`
  CREATE TABLE IF NOT EXISTS owner_refund_notes (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id) ON DELETE SET NULL,
    username    TEXT NOT NULL,
    amount      TEXT,
    currency    TEXT,
    reason      TEXT,
    order_ref   TEXT,
    owner_id    INT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {/* non-fatal */});

router.get("/owner/refund-notes", requireOwner, async (req, res): Promise<void> => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const { rows } = await pool.query<{
    id: number; user_id: number | null; username: string; amount: string | null;
    currency: string | null; reason: string | null; order_ref: string | null;
    owner_name: string | null; created_at: string;
  }>(`
    SELECT rn.id, rn.user_id, rn.username, rn.amount, rn.currency, rn.reason, rn.order_ref,
           sa.username AS owner_name,
           to_char(rn.created_at,'YYYY-MM-DD HH24:MI') AS created_at
    FROM owner_refund_notes rn
    LEFT JOIN super_admins sa ON sa.id = rn.owner_id
    ${userId ? "WHERE rn.user_id = $1" : ""}
    ORDER BY rn.created_at DESC LIMIT 200
  `, userId ? [userId] : []);
  res.json({ items: rows });
});

router.post("/owner/refund-notes", requireOwner, async (req, res): Promise<void> => {
  const { userId, username, amount, currency, reason, orderRef } = req.body as {
    userId?: number; username: string; amount?: string; currency?: string; reason?: string; orderRef?: string;
  };
  if (!username?.trim()) { res.status(400).json({ error: "username required" }); return; }
  const { rows: [note] } = await pool.query<{ id: number }>(`
    INSERT INTO owner_refund_notes (user_id, username, amount, currency, reason, order_ref, owner_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
  `, [userId ?? null, username.trim(), amount ?? null, currency ?? null, reason ?? null, orderRef ?? null, req.owner!.ownerId]);
  await logOwnerAction(req.owner!.ownerId, req.owner!.username, "refund_note", {
    targetId: userId ?? null, detail: `${username} – ${amount ?? "?"} ${currency ?? ""} – ${reason ?? ""}`,
  });
  res.json({ ok: true, id: note.id });
});

router.delete("/owner/refund-notes/:id", requireOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await pool.query(`DELETE FROM owner_refund_notes WHERE id=$1`, [id]);
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   REPLY TEMPLATES
   ════════════════════════════════════════════════════════════════════════════ */

pool.query(`
  CREATE TABLE IF NOT EXISTS owner_reply_templates (
    id         SERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    category   TEXT DEFAULT 'general',
    owner_id   INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {/* non-fatal */});

router.get("/owner/reply-templates", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{
    id: number; title: string; body: string; category: string; created_at: string;
  }>(`SELECT id, title, body, category, to_char(created_at,'YYYY-MM-DD') AS created_at
      FROM owner_reply_templates ORDER BY category, title`);
  res.json({ items: rows });
});

router.post("/owner/reply-templates", requireOwner, async (req, res): Promise<void> => {
  const { title, body, category } = req.body as { title?: string; body?: string; category?: string };
  if (!title?.trim() || !body?.trim()) { res.status(400).json({ error: "title and body required" }); return; }
  const { rows: [t] } = await pool.query<{ id: number }>(`
    INSERT INTO owner_reply_templates (title, body, category, owner_id)
    VALUES ($1,$2,$3,$4) RETURNING id
  `, [title.trim(), body.trim(), category?.trim() || "general", req.owner!.ownerId]);
  res.json({ ok: true, id: t.id });
});

router.delete("/owner/reply-templates/:id", requireOwner, async (req, res): Promise<void> => {
  await pool.query(`DELETE FROM owner_reply_templates WHERE id=$1`, [Number(req.params.id)]);
  res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════════════════
   ADMIN USER SESSIONS
   ════════════════════════════════════════════════════════════════════════════ */

router.get("/owner/admin-sessions", requireOwner, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{
    user_id: number; username: string; display_name: string | null;
    last_active_at: string | null; session_count: number; ip_address: string | null;
  }>(`
    SELECT s.user_id,
           u.username, u.display_name,
           to_char(MAX(s.last_active_at),'YYYY-MM-DD HH24:MI') AS last_active_at,
           count(*)::int AS session_count,
           (SELECT ip_address FROM user_sessions ss WHERE ss.user_id=s.user_id
            ORDER BY last_active_at DESC LIMIT 1) AS ip_address
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE u.is_admin = true
      AND s.expires_at > NOW()
    GROUP BY s.user_id, u.username, u.display_name
    ORDER BY last_active_at DESC NULLS LAST
    LIMIT 50
  `);
  res.json({ items: rows });
});

/* ════════════════════════════════════════════════════════════════════════════
   PRO EXPIRY NOTIFICATION SCHEDULER
   ════════════════════════════════════════════════════════════════════════════ */

async function sweepProExpiryNotifications(): Promise<void> {
  try {
    const { rows: [cfg] } = await pool.query(
      `SELECT value FROM platform_settings WHERE key='pro_expiry_notify_days'`,
    );
    const days = Math.max(1, Math.min(30, Number(cfg?.value) || 3));
    const { rows } = await pool.query<{ user_id: number; email: string; username: string; expires_at: string }>(`
      SELECT u.id AS user_id, u.email, u.username,
             to_char(u.pro_expires_at,'YYYY-MM-DD') AS expires_at
      FROM users u
      WHERE u.is_pro = true
        AND u.email IS NOT NULL
        AND u.pro_expires_at IS NOT NULL
        AND u.pro_expires_at BETWEEN NOW() + INTERVAL '1 day' AND NOW() + ($1::int || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM platform_settings
          WHERE key = 'pro_notified_' || u.id::text
            AND updated_at > NOW() - INTERVAL '25 days'
        )
    `, [days]);

    for (const user of rows) {
      await sendEmail({
        to: user.email,
        subject: "Your Pro subscription is expiring soon",
        text: `Hi ${user.username},\n\nYour Pro subscription expires on ${user.expires_at}. Renew now to keep all your benefits.\n\nThank you for being a Pro member!`,
      }).catch(() => {/* non-fatal */});
      /* Mark as notified */
      await pool.query(
        `INSERT INTO platform_settings (key, value) VALUES ($1,'sent') ON CONFLICT (key) DO UPDATE SET value='sent', updated_at=NOW()`,
        [`pro_notified_${user.user_id}`],
      ).catch(() => {/* non-fatal */});
    }
    if (rows.length) logger.info({ count: rows.length }, "owner: pro-expiry notifications sent");
  } catch (e) { logger.error(e, "owner: pro-expiry sweep failed"); }
}

/* Run once at startup (in case of missed window) + every 6 hours */
sweepProExpiryNotifications();
setInterval(sweepProExpiryNotifications, 6 * 60 * 60 * 1000);

export default router;

