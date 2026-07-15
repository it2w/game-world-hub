import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { activateProForUser, computeProStatus, redeemActivationCode } from "../lib/pro";
import crypto from "node:crypto";
import { RedeemActivationCodeBody } from "@workspace/api-zod";

const router: IRouter = Router();

const SALLA_WEBHOOK_SECRET = process.env["SALLA_WEBHOOK_SECRET"] || "";
const SALLA_SIGNATURE_HEADER = process.env["SALLA_SIGNATURE_HEADER"] || "x-salla-signature";
const SALLA_USERNAME_OPTION_NAME = process.env["SALLA_USERNAME_OPTION_NAME"] || "Game World Hub Username";

function isValidOrderEvent(event: string): boolean {
  return event.startsWith("order.");
}

function isCompletedOrderStatus(order: any): boolean {
  const status = order?.status?.slug || order?.status?.name || order?.status || "";
  return ["completed", "confirmed", "paid", "delivered", "payment_completed"].includes(String(status).toLowerCase());
}

function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!SALLA_WEBHOOK_SECRET) {
    logger.warn("salla: SALLA_WEBHOOK_SECRET not configured; skipping signature verification in development");
    return process.env["NODE_ENV"] !== "production";
  }
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", SALLA_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function extractCustomUsername(order: any): string | null {
  const options = order?.options || order?.order_options || order?.cart?.options || [];
  for (const opt of options) {
    const name = String(opt?.name || opt?.label || "").toLowerCase();
    if (name.includes(SALLA_USERNAME_OPTION_NAME.toLowerCase()) || name.includes("username") || name.includes("اسم المستخدم")) {
      const value = String(opt?.value || opt?.answer || "").trim();
      if (value) return value;
    }
  }
  const notes = String(order?.notes || order?.customer_notes || "").trim();
  if (notes) return notes;
  return null;
}

async function findUserByUsernameOrEmail(username: string | null, email: string | null) {
  if (username) {
    const [byUsername] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (byUsername) return byUsername;
  }
  if (email) {
    const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (byEmail) return byEmail;
  }
  return null;
}

async function activateProFromOrder(order: any): Promise<{ activated: boolean; reason: string; userId?: number }> {
  const orderId = String(order?.id || "");
  if (!orderId) {
    return { activated: false, reason: "missing order id" };
  }
  if (!isCompletedOrderStatus(order)) {
    return { activated: false, reason: "order status not completed" };
  }

  const customerEmail = order?.customer?.email || order?.customer_email || order?.email || null;
  const customUsername = extractCustomUsername(order);
  const user = await findUserByUsernameOrEmail(customUsername, customerEmail);
  if (!user) {
    return { activated: false, reason: "no matching user" };
  }

  const periodDays = order?.period?.days || order?.subscription?.period_days || 30;
  const amount = order?.amount?.value || order?.total?.amount || order?.price || null;
  const currency = order?.amount?.currency || order?.total?.currency || "SAR";

  try {
    await activateProForUser(user.id, {
      orderId,
      provider: "salla",
      durationDays: periodDays,
      amount: amount ? String(amount) : undefined,
      currency,
      metadata: order,
    });
  } catch (err) {
    if ((err as Error).message?.includes("duplicate key")) {
      return { activated: false, reason: "order already processed", userId: user.id };
    }
    throw err;
  }

  return { activated: true, reason: "activated", userId: user.id };
}

// Public Salla webhook endpoint. Mounted in app.ts with express.raw() so the raw body is available for HMAC verification.
router.post("/webhooks/salla", async (req, res): Promise<void> => {
  const rawBody = req.body as Buffer;
  const signature = req.headers[SALLA_SIGNATURE_HEADER] || req.headers[SALLA_SIGNATURE_HEADER.toLowerCase()];
  if (!verifySignature(rawBody, signature as string | undefined)) {
    logger.warn({ ip: req.ip }, "salla: invalid webhook signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const event = payload?.event || "";
  const order = payload?.data || payload?.order || payload;

  if (!isValidOrderEvent(event)) {
    res.status(200).json({ ignored: true, reason: "unsupported event" });
    return;
  }

  const result = await activateProFromOrder(order);
  logger.info({ event, orderId: order?.id, ...result }, "salla: webhook processed");
  res.status(200).json({ ok: true, ...result });
});

// GET /me/pro — current Pro status for the authenticated user.
router.get("/me/pro", requireAuth, async (req, res): Promise<void> => {
  const status = await computeProStatus(req.auth!.userId);
  res.json(status);
});

// POST /me/redeem-code — redeem an activation code for Pro access.
router.post("/me/redeem-code", requireAuth, async (req, res): Promise<void> => {
  const { code } = RedeemActivationCodeBody.parse(req.body);
  const result = await redeemActivationCode(req.auth!.userId, code);
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }
  res.status(200).json({ ok: true, durationDays: result.durationDays });
});

export default router;
