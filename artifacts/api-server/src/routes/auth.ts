import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import { toPublicImageUrl } from "../lib/objectStorage";
import { db, usersTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  UpdateMyStatusBody,
  VerifyTwoFactorLoginBody,
  RequestPasswordResetBody,
  ConfirmPasswordResetBody,
  SetMyEmailBody,
  VerifyMyEmailBody,
  SetupTwoFactorBody,
  EnableTwoFactorBody,
  DisableTwoFactorBody,
} from "@workspace/api-zod";
import {
  requireAuth,
  signToken,
  signChallengeToken,
  verifyChallengeToken,
} from "../middlewares/auth";
import { sendEmail } from "../lib/email";
import { issueCode, verifyAndConsumeCode } from "../lib/otp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTP_ISSUER = "Game World Hub";
// Tolerate one 30s time-step of clock drift when verifying TOTP codes.
const TOTP_EPOCH_TOLERANCE = 30;
const PASSWORD_COMPLEXITY_RE = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&*)(_\-+=\\/؟!]).{12,}$/;

async function isTotpCodeValid(code: string, secret: string): Promise<boolean> {
  try {
    const result = await verifyTotp({
      token: code,
      secret,
      epochTolerance: TOTP_EPOCH_TOLERANCE,
    });
    return result.valid;
  } catch {
    return false;
  }
}

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
    bannerUrl: toPublicImageUrl(u.bannerUrl ?? null),
    bio: u.bio ?? null,
    email: u.email ?? null,
    emailVerified: u.emailVerified,
    twoFactorMethod: u.twoFactorMethod,
    allowProfileComments: u.allowProfileComments,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Looks a user up by email (if the identifier contains "@") or username. */
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      trimmed.includes("@")
        ? eq(usersTable.email, trimmed.toLowerCase())
        : eq(usersTable.username, trimmed),
    );
  return user;
}

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, password, displayName } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }
  if (!PASSWORD_COMPLEXITY_RE.test(password)) {
    res.status(400).json({
      error:
        "Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol (e.g. @#$%^&*)(_-+=\\/؟!).",
    });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }
  const [emailTaken] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (emailTaken) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    displayName,
    status: "online",
    email,
  }).returning();

  // Best-effort: registration must not fail if the email cannot be sent.
  try {
    const code = await issueCode(user.id, "email_verify");
    await sendEmail({
      to: email,
      subject: "Game World Hub — verify your email",
      text: `Your verification code is: ${code}\nIt expires in 10 minutes.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send verification email after register");
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.status(201).json({ user: safeUser(user), token });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Two-factor enabled → return a short-lived challenge instead of a session.
  if (user.twoFactorMethod !== "none") {
    if (user.twoFactorMethod === "email" && user.email) {
      try {
        const code = await issueCode(user.id, "twofa_email");
        await sendEmail({
          to: user.email,
          subject: "Game World Hub — your login code",
          text: `Your login code is: ${code}\nIt expires in 10 minutes.`,
        });
      } catch (err) {
        logger.error({ err }, "Failed to send 2FA login code");
        res.status(500).json({ error: "Could not send your login code email — please try again shortly" });
        return;
      }
    }
    res.json({
      requiresTwoFactor: true,
      twoFactorMethod: user.twoFactorMethod,
      challengeToken: signChallengeToken(user.id),
    });
    return;
  }

  // Set user online
  await db.update(usersTable).set({ status: "online" }).where(eq(usersTable.id, user.id));

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ user: { ...safeUser(user), status: "online" }, token });
});

// In-memory single-use tracking for 2FA login challenges. Email codes are
// already consumed in the DB; this additionally caps attempts per challenge
// token and blocks reuse after a successful login (relevant for TOTP).
const CHALLENGE_TTL_MS = 6 * 60_000; // token lifetime (5m) + slack
const CHALLENGE_MAX_ATTEMPTS = 5;
const challengeAttempts = new Map<string, { attempts: number; consumed: boolean; expiresAt: number }>();
function pruneChallengeAttempts(): void {
  const now = Date.now();
  for (const [jti, entry] of challengeAttempts) {
    if (entry.expiresAt < now) challengeAttempts.delete(jti);
  }
}

// POST /auth/login/2fa — complete a two-factor login challenge
router.post("/auth/login/2fa", async (req, res): Promise<void> => {
  const parsed = VerifyTwoFactorLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let challenge: { userId: number; jti: string };
  try {
    const payload = verifyChallengeToken(parsed.data.challengeToken);
    challenge = { userId: payload.userId, jti: payload.jti };
  } catch {
    res.status(401).json({ error: "Challenge expired — sign in again" });
    return;
  }
  pruneChallengeAttempts();
  const attempt = challengeAttempts.get(challenge.jti) ?? {
    attempts: 0,
    consumed: false,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  if (attempt.consumed || attempt.attempts >= CHALLENGE_MAX_ATTEMPTS) {
    res.status(401).json({ error: "Challenge expired — sign in again" });
    return;
  }
  attempt.attempts += 1;
  challengeAttempts.set(challenge.jti, attempt);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, challenge.userId));
  if (!user || user.twoFactorMethod === "none") {
    res.status(401).json({ error: "Challenge expired — sign in again" });
    return;
  }

  let valid = false;
  if (user.twoFactorMethod === "totp") {
    valid = !!user.totpSecret && (await isTotpCodeValid(parsed.data.code, user.totpSecret));
  } else if (user.twoFactorMethod === "email") {
    valid = await verifyAndConsumeCode(user.id, "twofa_email", parsed.data.code);
  }
  if (!valid) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }
  attempt.consumed = true; // challenge token is single-use

  await db.update(usersTable).set({ status: "online" }).where(eq(usersTable.id, user.id));
  const token = signToken({ userId: user.id, username: user.username });
  res.json({ user: { ...safeUser(user), status: "online" }, token });
});

// POST /auth/password-reset/request
router.post("/auth/password-reset/request", async (req, res): Promise<void> => {
  const parsed = RequestPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = await findUserByIdentifier(parsed.data.identifier);
  if (user?.email && user.emailVerified) {
    try {
      const code = await issueCode(user.id, "password_reset");
      await sendEmail({
        to: user.email,
        subject: "Game World Hub — password reset code",
        text: `Your password reset code is: ${code}\nIt expires in 10 minutes.\nIf you didn't request this, you can ignore this email.`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send password reset email");
    }
  }
  // Always OK — never reveal whether the account or email exists.
  res.json({ success: true });
});

// POST /auth/password-reset/confirm
router.post("/auth/password-reset/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = await findUserByIdentifier(parsed.data.identifier);
  const ok = user
    ? await verifyAndConsumeCode(user.id, "password_reset", parsed.data.code)
    : false;
  if (!user || !ok) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
  res.json({ success: true });
});

// POST /auth/me/email — set or change recovery email (sends verification code)
router.post("/auth/me/email", requireAuth, async (req, res): Promise<void> => {
  const parsed = SetMyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const changingAddress = me.email !== email;
  if (changingAddress && me.twoFactorMethod === "email") {
    res.status(400).json({ error: "Disable email two-factor auth before changing your email" });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing && existing.id !== me.id) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ email, emailVerified: changingAddress ? false : me.emailVerified })
    .where(eq(usersTable.id, me.id))
    .returning();

  if (!user.emailVerified) {
    try {
      const code = await issueCode(user.id, "email_verify");
      await sendEmail({
        to: email,
        subject: "Game World Hub — verify your email",
        text: `Your verification code is: ${code}\nIt expires in 10 minutes.`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send verification email");
      res.status(500).json({ error: "Your email was saved, but the verification code could not be sent — try resending it shortly" });
      return;
    }
  }
  res.json(safeUser(user));
});

// POST /auth/me/email/verify — confirm the emailed verification code
router.post("/auth/me/email/verify", requireAuth, async (req, res): Promise<void> => {
  const parsed = VerifyMyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (!me.email) {
    res.status(400).json({ error: "No email on this account" });
    return;
  }
  if (me.emailVerified) {
    res.json(safeUser(me));
    return;
  }
  const ok = await verifyAndConsumeCode(me.id, "email_verify", parsed.data.code);
  if (!ok) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.id, me.id))
    .returning();
  res.json(safeUser(user));
});

// POST /auth/me/2fa/setup — begin enabling 2FA
router.post("/auth/me/2fa/setup", requireAuth, async (req, res): Promise<void> => {
  const parsed = SetupTwoFactorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (me.twoFactorMethod !== "none") {
    res.status(400).json({ error: "Two-factor auth is already enabled — disable it first" });
    return;
  }

  if (parsed.data.method === "email") {
    if (!me.email || !me.emailVerified) {
      res.status(400).json({ error: "Add and verify an email address first" });
      return;
    }
    try {
      const code = await issueCode(me.id, "twofa_email");
      await sendEmail({
        to: me.email,
        subject: "Game World Hub — your 2FA setup code",
        text: `Your two-factor setup code is: ${code}\nIt expires in 10 minutes.`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send 2FA setup code");
      res.status(500).json({ error: "Failed to send code — try again" });
      return;
    }
    res.json({ method: "email" });
    return;
  }

  // TOTP (Google Authenticator & co.)
  const secret = generateSecret();
  await db.update(usersTable).set({ totpSecret: secret }).where(eq(usersTable.id, me.id));
  const otpauthUrl = generateURI({ issuer: TOTP_ISSUER, label: me.username, secret });
  res.json({ method: "totp", secret, otpauthUrl });
});

// POST /auth/me/2fa/enable — confirm the code and switch 2FA on
router.post("/auth/me/2fa/enable", requireAuth, async (req, res): Promise<void> => {
  const parsed = EnableTwoFactorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (me.twoFactorMethod !== "none") {
    res.status(400).json({ error: "Two-factor auth is already enabled" });
    return;
  }

  if (parsed.data.method === "totp") {
    if (!me.totpSecret) {
      res.status(400).json({ error: "Run two-factor setup first" });
      return;
    }
    if (!(await isTotpCodeValid(parsed.data.code, me.totpSecret))) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }
    const [user] = await db
      .update(usersTable)
      .set({ twoFactorMethod: "totp" })
      .where(eq(usersTable.id, me.id))
      .returning();
    res.json(safeUser(user));
    return;
  }

  // email method
  if (!me.email || !me.emailVerified) {
    res.status(400).json({ error: "Add and verify an email address first" });
    return;
  }
  const ok = await verifyAndConsumeCode(me.id, "twofa_email", parsed.data.code);
  if (!ok) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ twoFactorMethod: "email", totpSecret: null })
    .where(eq(usersTable.id, me.id))
    .returning();
  res.json(safeUser(user));
});

// POST /auth/me/2fa/disable — requires the current password
router.post("/auth/me/2fa/disable", requireAuth, async (req, res): Promise<void> => {
  const parsed = DisableTwoFactorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!me) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const valid = await bcrypt.compare(parsed.data.password, me.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ twoFactorMethod: "none", totpSecret: null })
    .where(eq(usersTable.id, me.id))
    .returning();
  res.json(safeUser(user));
});

// POST /auth/logout
router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  await db.update(usersTable).set({ status: "offline" }).where(eq(usersTable.id, req.auth!.userId));
  res.json({ success: true });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(safeUser(user));
});

// PATCH /auth/me/status
router.patch("/auth/me/status", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMyStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data: { status?: string; currentGame?: string | null; lastActiveAt?: Date } = {
    ...parsed.data,
  };
  // Going offline automatically clears your active game.
  if (data.status === "offline") data.currentGame = null;
  // Enforce the invariant even when the request only sets a game and leaves
  // status untouched: a user who is already offline must never show a game.
  if (data.currentGame && data.status === undefined) {
    const [existing] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId));
    if (existing?.status === "offline") data.currentGame = null;
  }
  // Stamp activity whenever a game is (re)set, so the presence sweep only keeps
  // it alive while an open tab keeps sending heartbeats.
  if (data.currentGame) data.lastActiveAt = new Date();

  const [user] = await db.update(usersTable)
    .set(data)
    .where(eq(usersTable.id, req.auth!.userId))
    .returning();
  res.json(safeUser(user));
});

// POST /auth/me/heartbeat — an open tab pings this while a game is active so the
// server knows the user is still around. When the pings stop (tab closed), the
// background sweep clears currentGame after a few minutes.
router.post("/auth/me/heartbeat", requireAuth, async (req, res): Promise<void> => {
  await db.update(usersTable)
    .set({ lastActiveAt: new Date() })
    .where(eq(usersTable.id, req.auth!.userId));
  res.status(204).end();
});

export default router;
