import { Router, type IRouter } from "express";
import { eq, like, or, desc, sql } from "drizzle-orm";
import { db, pool, usersTable, proSubscriptionsTable, activationCodesTable } from "@workspace/db";
import { requireAdmin, requireAdminPermission } from "../middlewares/admin";
import { activateProForUser, deactivatePro, generateActivationCode } from "../lib/pro";
import { logger } from "../lib/logger";
import { getUserProgress } from "../lib/xp";
import { toPublicImageUrl } from "../lib/objectStorage";
import {
  ListAdminUsersQueryParams,
  AdminActivateProBody,
  CreateActivationCodeBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.use("/admin", requireAdmin);

router.get("/admin/users", async (req, res): Promise<void> => {
  const { q, limit, offset } = ListAdminUsersQueryParams.parse(req.query);

  const whereClause = q
    ? or(
        like(usersTable.username, `%${q}%`),
        like(usersTable.displayName, `%${q}%`),
        like(usersTable.email, `%${q}%`),
      )
    : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  const users = await db
    .select()
    .from(usersTable)
    .where(whereClause)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const now = new Date();
  const items = await Promise.all(
    users.map(async (u) => {
      const progress = await getUserProgress(u.id);
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
        email: u.email ?? null,
        isPro: u.isPro && (!u.proExpiresAt || u.proExpiresAt > now),
        proExpiresAt: u.proExpiresAt?.toISOString() || null,
        isAdmin: u.isAdmin,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        tier: progress?.tier ?? null,
        tierLevel: progress?.level ?? null,
        totalXp: progress?.totalXp ?? null,
      };
    }),
  );

  res.json({ total, limit, offset, items });
});

router.post("/admin/users/:userId/pro", requireAdminPermission("can_manage_pro"), async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  const { durationDays } = AdminActivateProBody.parse(req.body);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await activateProForUser(userId, { provider: "admin", durationDays });
  res.status(200).json({ ok: true });
});

router.delete("/admin/users/:userId/pro", requireAdminPermission("can_manage_pro"), async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  await deactivatePro(userId);
  res.status(200).json({ ok: true });
});

router.post("/admin/users/:userId/suspend", requireAdminPermission("can_suspend_users"), async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, userId));
  logger.info({ userId, by: req.adminUser?.id }, "admin: suspended user");
  res.status(200).json({ ok: true });
});

router.delete("/admin/users/:userId/suspend", requireAdminPermission("can_suspend_users"), async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await db.update(usersTable).set({ status: "offline" }).where(eq(usersTable.id, userId));
  logger.info({ userId, by: req.adminUser?.id }, "admin: unsuspended user");
  res.status(200).json({ ok: true });
});

router.post("/admin/users/:userId/admin", requireAdminPermission("can_manage_admins"), async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, userId));
  logger.info({ userId, promotedBy: req.adminUser?.id }, "admin: promoted user");
  res.status(200).json({ ok: true });
});

router.post("/admin/activation-codes", requireAdminPermission("can_manage_codes"), async (req, res): Promise<void> => {
  const body = CreateActivationCodeBody.parse(req.body);
  const code = (body.code || generateActivationCode()).toUpperCase().trim();
  const [existing] = await db.select().from(activationCodesTable).where(eq(activationCodesTable.code, code)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Code already exists" });
    return;
  }

  const [row] = await db
    .insert(activationCodesTable)
    .values({
      code,
      durationDays: body.durationDays,
      maxUses: body.maxUses,
      createdBy: req.adminUser!.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    })
    .returning();

  res.status(201).json({
    id: row.id,
    code: row.code,
    status: row.status,
    durationDays: row.durationDays,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/admin/activation-codes", requireAdminPermission("can_manage_codes"), async (req, res): Promise<void> => {
  const codes = await db.select().from(activationCodesTable).orderBy(desc(activationCodesTable.createdAt));
  res.json({
    items: codes.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
      durationDays: c.durationDays,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      expiresAt: c.expiresAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

router.delete("/admin/activation-codes/:codeId", requireAdminPermission("can_manage_codes"), async (req, res): Promise<void> => {
  const codeId = Number(req.params.codeId);
  await db.update(activationCodesTable).set({ status: "inactive" }).where(eq(activationCodesTable.id, codeId));
  res.status(200).json({ ok: true });
});

router.get("/admin/me", async (req, res): Promise<void> => {
  const adminUser = req.adminUser!;

  // Env-level admins (ADMIN_USERNAMES) are fully trusted — grant all permissions.
  const envAdminUsernames = (process.env["ADMIN_USERNAMES"] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isEnvAdmin = envAdminUsernames.includes(adminUser.username.toLowerCase());

  if (isEnvAdmin) {
    res.json({
      id: adminUser.id,
      username: adminUser.username,
      permissions: {
        can_manage_pro: true, can_suspend_users: true, can_delete_content: true,
        can_view_reports: true, can_manage_codes: true, can_broadcast: true,
        can_view_analytics: true, can_manage_admins: true,
      },
    });
    return;
  }

  try {
    const { rows } = await pool.query<{
      can_manage_pro: boolean; can_suspend_users: boolean; can_delete_content: boolean;
      can_view_reports: boolean; can_manage_codes: boolean; can_broadcast: boolean;
      can_view_analytics: boolean; can_manage_admins: boolean;
    }>(
      `SELECT can_manage_pro, can_suspend_users, can_delete_content,
              can_view_reports, can_manage_codes, can_broadcast,
              can_view_analytics, can_manage_admins
       FROM admin_permissions WHERE user_id = $1`,
      [adminUser.id],
    );
    const perms = rows[0] ?? {
      can_manage_pro: false, can_suspend_users: false, can_delete_content: false,
      can_view_reports: false, can_manage_codes: false, can_broadcast: false,
      can_view_analytics: false, can_manage_admins: false,
    };
    res.json({
      id: adminUser.id,
      username: adminUser.username,
      permissions: perms,
    });
  } catch {
    // admin_permissions table not yet migrated — return empty perms
    res.json({
      id: adminUser.id,
      username: adminUser.username,
      permissions: {
        can_manage_pro: false, can_suspend_users: false, can_delete_content: false,
        can_view_reports: false, can_manage_codes: false, can_broadcast: false,
        can_view_analytics: false, can_manage_admins: false,
      },
    });
  }
});

router.get("/admin/analytics", requireAdminPermission("can_view_analytics"), async (req, res): Promise<void> => {
  const range = Math.min(Math.max(Number(req.query.range) || 30, 7), 90);

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

  res.json({
    range,
    newUsers: nu.rows,
    dau: dau.rows,
    lfgPosts: lfg.rows,
    proActivations: pro.rows,
    summary: { peakDau, proConvRate },
  });
});

router.get("/admin/chat-deletions", requireAdminPermission("can_view_reports"), async (req, res): Promise<void> => {
  const limit     = Math.min(parseInt((req.query.limit as string) ?? "100", 10) || 100, 200);
  const offset    = parseInt((req.query.offset as string) ?? "0", 10) || 0;
  const deletedBy = req.query.deletedBy ? parseInt(req.query.deletedBy as string, 10) : null;
  const since     = req.query.since     ? new Date(req.query.since as string)     : null;
  const until     = req.query.until     ? new Date(req.query.until as string)     : null;

  // Build two param arrays:
  //   mainParams  = [limit, offset, ...filterValues]  ($1/$2 = pagination in main query)
  //   countParams = [...filterValues]                  ($1… = filter values in count query)
  const mainConds:  string[] = [];
  const countConds: string[] = [];
  const mainParams:  unknown[] = [limit, offset];
  const countParams: unknown[] = [];

  if (deletedBy !== null && !isNaN(deletedBy)) {
    mainParams.push(deletedBy);
    mainConds.push("d.deleted_by_user_id = $" + mainParams.length);
    countParams.push(deletedBy);
    countConds.push("d.deleted_by_user_id = $" + countParams.length);
  }
  if (since && !isNaN(since.getTime())) {
    mainParams.push(since.toISOString());
    mainConds.push("d.deleted_at >= $" + mainParams.length);
    countParams.push(since.toISOString());
    countConds.push("d.deleted_at >= $" + countParams.length);
  }
  if (until && !isNaN(until.getTime())) {
    const untilEnd = new Date(until);
    untilEnd.setHours(23, 59, 59, 999);
    mainParams.push(untilEnd.toISOString());
    mainConds.push("d.deleted_at <= $" + mainParams.length);
    countParams.push(untilEnd.toISOString());
    countConds.push("d.deleted_at <= $" + countParams.length);
  }

  const mainWhere  = mainConds.length  ? `WHERE ${mainConds.join(" AND ")}`  : "";
  const countWhere = countConds.length ? `WHERE ${countConds.join(" AND ")}` : "";

  const { rows } = await pool.query<{
    id: number;
    message_id: number;
    original_content: string;
    deleted_at: string;
    deleted_by_id: number;
    deleted_by_username: string;
    deleted_by_display_name: string;
    original_author_id: number;
    original_author_username: string | null;
    original_author_display_name: string | null;
  }>(`
    SELECT
      d.id,
      d.message_id,
      d.original_content,
      d.deleted_at,
      d.deleted_by_user_id    AS deleted_by_id,
      db.username             AS deleted_by_username,
      db.display_name         AS deleted_by_display_name,
      d.original_author_id,
      oa.username             AS original_author_username,
      oa.display_name         AS original_author_display_name
    FROM global_chat_deletions d
    JOIN users db ON db.id = d.deleted_by_user_id
    LEFT JOIN users oa ON oa.id = d.original_author_id
    ${mainWhere}
    ORDER BY d.deleted_at DESC
    LIMIT $1 OFFSET $2
  `, mainParams);

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM global_chat_deletions d ${countWhere}`,
    countParams,
  );

  res.json({
    total: parseInt(countRows[0]?.total ?? "0", 10),
    limit,
    offset,
    items: rows.map(r => ({
      id:                        r.id,
      messageId:                 r.message_id,
      originalContent:           r.original_content,
      deletedAt:                 r.deleted_at,
      deletedBy: {
        id:          r.deleted_by_id,
        username:    r.deleted_by_username,
        displayName: r.deleted_by_display_name,
      },
      originalAuthor: {
        id:          r.original_author_id,
        username:    r.original_author_username ?? null,
        displayName: r.original_author_display_name ?? null,
      },
    })),
  });
});

// ─── Vouches: list and remove ─────────────────────────────────────────────────

router.get("/admin/users/:userId/vouches", requireAdminPermission("can_delete_content"), async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const { rows } = await pool.query<{
    id: number;
    tag: string;
    created_at: string;
    giver_id: number;
    giver_username: string;
    giver_display_name: string;
  }>(
    `SELECT rv.id,
            rv.tag,
            rv.created_at::text,
            rv.giver_id,
            u.username  AS giver_username,
            u.display_name AS giver_display_name
     FROM reputation_vouches rv
     JOIN users u ON u.id = rv.giver_id
     WHERE rv.receiver_id = $1
     ORDER BY rv.created_at DESC`,
    [userId],
  );

  res.json({
    items: rows.map(r => ({
      id: r.id,
      tag: r.tag,
      createdAt: r.created_at,
      giver: {
        id: r.giver_id,
        username: r.giver_username,
        displayName: r.giver_display_name,
      },
    })),
  });
});

router.delete("/admin/users/:userId/vouches/:vouchId", requireAdminPermission("can_delete_content"), async (req, res): Promise<void> => {
  const userId  = Number(req.params.userId);
  const vouchId = Number(req.params.vouchId);
  if (isNaN(userId) || isNaN(vouchId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows } = await pool.query<{ id: number; tag: string; giver_id: number }>(
    `SELECT id, tag, giver_id FROM reputation_vouches WHERE id = $1 AND receiver_id = $2`,
    [vouchId, userId],
  );
  const vouch = rows[0];
  if (!vouch) { res.status(404).json({ error: "Vouch not found" }); return; }

  await pool.query(`DELETE FROM reputation_vouches WHERE id = $1`, [vouchId]);

  logger.info(
    { vouchId, userId, tag: vouch.tag, giverId: vouch.giver_id, removedBy: req.adminUser?.id },
    "admin: removed reputation vouch",
  );

  res.status(200).json({ ok: true });
});

router.get("/admin/pro-subscriptions", requireAdminPermission("can_manage_pro"), async (req, res): Promise<void> => {
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
      startedAt: s.startedAt?.toISOString() || null,
      expiresAt: s.expiresAt?.toISOString() || null,
      createdAt: s.createdAt?.toISOString() || null,
    })),
  });
});

export default router;
