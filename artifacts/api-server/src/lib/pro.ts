import { db, usersTable, proSubscriptionsTable, activationCodesTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { logger } from "./logger";

export interface ActivateProOptions {
  orderId?: string;
  provider?: string;
  durationDays?: number;
  expiresAt?: Date;
  amount?: string;
  currency?: string;
  metadata?: unknown;
}

export async function activateProForUser(userId: number, options: ActivateProOptions): Promise<void> {
  const now = new Date();
  const durationDays = options.durationDays ?? 30;
  const expiresAt = options.expiresAt ?? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const orderId = options.orderId ?? `manual-${now.getTime()}`;

  await db.insert(proSubscriptionsTable).values({
    userId,
    orderId,
    provider: options.provider || "admin",
    status: "active",
    amount: options.amount ?? null,
    currency: options.currency ?? null,
    startedAt: now,
    expiresAt,
    metadata: options.metadata ?? null,
  }).onConflictDoNothing({ target: proSubscriptionsTable.orderId });

  await db.update(usersTable).set({
    isPro: true,
    proActivatedAt: now,
    proExpiresAt: expiresAt,
    proOrderId: orderId,
    proProvider: options.provider || "admin",
  }).where(eq(usersTable.id, userId));

  logger.info({ userId, orderId, provider: options.provider || "admin" }, "pro: activated");
}

export async function deactivatePro(userId: number): Promise<void> {
  await db.update(usersTable).set({
    isPro: false,
    proExpiresAt: null,
  }).where(eq(usersTable.id, userId));
  logger.info({ userId }, "pro: deactivated");
}

export async function redeemActivationCode(userId: number, rawCode: string): Promise<{ ok: true; durationDays: number } | { ok: false; reason: string }> {
  const code = rawCode.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(activationCodesTable)
    .where(eq(activationCodesTable.code, code))
    .limit(1);

  if (!row) {
    return { ok: false, reason: "code_not_found" };
  }

  const now = new Date();
  if (row.status !== "active") {
    return { ok: false, reason: "code_inactive" };
  }
  if (row.expiresAt && row.expiresAt < now) {
    return { ok: false, reason: "code_expired" };
  }
  if (row.usedCount >= row.maxUses) {
    return { ok: false, reason: "code_max_uses" };
  }

  await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select()
      .from(activationCodesTable)
      .where(eq(activationCodesTable.id, row.id))
      .for("update")
      .limit(1);

    if (!fresh || fresh.status !== "active" || (fresh.expiresAt && fresh.expiresAt < now) || fresh.usedCount >= fresh.maxUses) {
      throw new Error("code no longer redeemable");
    }

    await tx
      .update(activationCodesTable)
      .set({ usedCount: fresh.usedCount + 1, status: fresh.usedCount + 1 >= fresh.maxUses ? "inactive" : fresh.status })
      .where(eq(activationCodesTable.id, fresh.id));

    await tx.insert(proSubscriptionsTable).values({
      userId,
      orderId: `code-${fresh.code}-${now.getTime()}`,
      provider: "activation_code",
      status: "active",
      startedAt: now,
      expiresAt: new Date(now.getTime() + fresh.durationDays * 24 * 60 * 60 * 1000),
      metadata: { codeId: fresh.id, code: fresh.code },
    });

    await tx.update(usersTable).set({
      isPro: true,
      proActivatedAt: now,
      proExpiresAt: new Date(now.getTime() + fresh.durationDays * 24 * 60 * 60 * 1000),
      proOrderId: `code-${fresh.code}-${now.getTime()}`,
      proProvider: "activation_code",
    }).where(eq(usersTable.id, userId));
  });

  logger.info({ userId, codeId: row.id }, "pro: redeemed activation code");
  return { ok: true, durationDays: row.durationDays };
}

export async function computeProStatus(userId: number) {
  const [user] = await db
    .select({
      isPro: usersTable.isPro,
      proActivatedAt: usersTable.proActivatedAt,
      proExpiresAt: usersTable.proExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const now = new Date();
  const active = !!user?.isPro && (!user.proExpiresAt || user.proExpiresAt > now);
  return {
    isPro: active,
    activatedAt: user?.proActivatedAt?.toISOString() || null,
    expiresAt: user?.proExpiresAt?.toISOString() || null,
  };
}

export async function refreshProStatus(userId: number): Promise<void> {
  const status = await computeProStatus(userId);
  if (!status.isPro) {
    await db.update(usersTable).set({ isPro: false }).where(eq(usersTable.id, userId));
  }
}

export function generateActivationCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
