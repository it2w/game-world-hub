import { Router, type IRouter } from "express";
import { eq, like, or, desc, sql } from "drizzle-orm";
import { db, usersTable, proSubscriptionsTable, activationCodesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/admin";
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

router.use(requireAdmin);

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

router.post("/admin/users/:userId/pro", async (req, res): Promise<void> => {
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

router.delete("/admin/users/:userId/pro", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  await deactivatePro(userId);
  res.status(200).json({ ok: true });
});

router.post("/admin/users/:userId/admin", async (req, res): Promise<void> => {
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

router.post("/admin/activation-codes", async (req, res): Promise<void> => {
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

router.delete("/admin/activation-codes/:codeId", async (req, res): Promise<void> => {
  const codeId = Number(req.params.codeId);
  await db.update(activationCodesTable).set({ status: "inactive" }).where(eq(activationCodesTable.id, codeId));
  res.status(200).json({ ok: true });
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
