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

router.get("/admin/activation-codes", async (req, res): Promise<void> => {
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

router.get("/admin/pro-subscriptions", async (req, res): Promise<void> => {
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
