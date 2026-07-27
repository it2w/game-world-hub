import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable, revokedTokensTable } from "@workspace/db";

const _jwtSecretRaw = process.env.JWT_SECRET;
if (!_jwtSecretRaw) {
  throw new Error("JWT_SECRET environment variable is required but was not set.");
}
const JWT_SECRET: string = _jwtSecretRaw;

export interface AuthPayload {
  userId: number;
  username: string;
  /** JWT issued-at (Unix seconds). Present after verifyToken; used for force-logout check. */
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: { userId: number; username: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<AuthPayload> & { purpose?: unknown; iat?: number };
  // Session tokens only: reject special-purpose tokens (e.g. 2FA login
  // challenges) and anything without the exact session shape. Without this
  // check a 2FA challenge token could be used as a full session token.
  if (
    payload.purpose !== undefined ||
    typeof payload.userId !== "number" ||
    typeof payload.username !== "string"
  ) {
    throw new Error("Not a session token");
  }
  return { userId: payload.userId, username: payload.username, iat: payload.iat };
}

// ── Steam OpenID link tokens ──────────────────────────────────────────────────
// Short-lived tokens encoding a userId so the Steam OpenID callback can
// identify which GWH account to link without an open session cookie.

export function signSteamLinkToken(userId: number): string {
  return jwt.sign({ userId, purpose: "steam-link" }, JWT_SECRET, { expiresIn: "10m" });
}

export function verifySteamLinkToken(token: string): number {
  const payload = jwt.verify(token, JWT_SECRET) as { userId?: unknown; purpose?: unknown };
  if (payload.purpose !== "steam-link" || typeof payload.userId !== "number") {
    throw new Error("Invalid steam-link token");
  }
  return payload.userId;
}

// ── Epic OAuth link tokens ────────────────────────────────────────────────────
// Short-lived tokens encoding userId + redirectUri so the Epic callback can
// identify the GWH account AND replay the exact redirect_uri to Epic's
// token endpoint (which requires an exact match to the value sent during auth).

export function signEpicLinkToken(userId: number, redirectUri: string): string {
  return jwt.sign({ userId, purpose: "epic-link", redirectUri }, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyEpicLinkToken(token: string): { userId: number; redirectUri: string } {
  const payload = jwt.verify(token, JWT_SECRET) as { userId?: unknown; purpose?: unknown; redirectUri?: unknown };
  if (
    payload.purpose !== "epic-link" ||
    typeof payload.userId !== "number" ||
    typeof payload.redirectUri !== "string"
  ) {
    throw new Error("Invalid epic-link token");
  }
  return { userId: payload.userId, redirectUri: payload.redirectUri };
}

// ── Two-factor login challenge tokens ────────────────────────────────────────
// Short-lived tokens issued after a correct password when 2FA is enabled.
// They are NOT session tokens: requireAuth rejects them (different shape/purpose).

export interface TwoFactorChallengePayload {
  userId: number;
  purpose: "2fa";
  jti: string;
}

export function signChallengeToken(userId: number): string {
  return jwt.sign(
    { userId, purpose: "2fa", jti: randomUUID() } satisfies TwoFactorChallengePayload,
    JWT_SECRET,
    { expiresIn: "5m" },
  );
}

export function verifyChallengeToken(token: string): TwoFactorChallengePayload {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<TwoFactorChallengePayload>;
  if (
    payload?.purpose !== "2fa" ||
    typeof payload?.userId !== "number" ||
    typeof payload?.jti !== "string"
  ) {
    throw new Error("Invalid challenge token");
  }
  return { userId: payload.userId, purpose: "2fa", jti: payload.jti };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const token = header.slice(7);
  let auth: AuthPayload;
  try {
    auth = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  // Defense-in-depth: check the token denylist before the main existence/suspension check.
  // Tokens for deleted users are inserted here at deletion time. This ensures that even
  // if the DB existence check below were ever bypassed (e.g. a caching layer), a deleted
  // user's long-lived JWT is still rejected at the denylist.
  try {
    const [denied] = await db
      .select({ userId: revokedTokensTable.userId })
      .from(revokedTokensTable)
      .where(eq(revokedTokensTable.userId, auth.userId))
      .limit(1);
    if (denied) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
  } catch {
    // DB failure — fail closed.
    res.status(503).json({ error: "Service temporarily unavailable" });
    return;
  }

  // Check suspension, existence, and force-logout via a lightweight primary-key lookup.
  // Fail CLOSED on any error: a suspended user must never slip through.
  try {
    const [user] = await db
      .select({ status: usersTable.status, sessionsInvalidatedBefore: usersTable.sessionsInvalidatedBefore })
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId))
      .limit(1);
    if (!user) {
      // Token is for a user that no longer exists in the database.
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (user.status === "suspended") {
      res.status(403).json({ error: "suspended" });
      return;
    }
    // Force-logout check: reject JWTs issued before the invalidation timestamp.
    if (user.sessionsInvalidatedBefore && auth.iat !== undefined) {
      const invalidatedMs = user.sessionsInvalidatedBefore.getTime();
      const issuedMs = auth.iat * 1000;
      if (issuedMs < invalidatedMs) {
        res.status(401).json({ error: "Session invalidated — please sign in again" });
        return;
      }
    }
  } catch {
    // DB failure — fail closed so a transient error cannot bypass suspension.
    res.status(503).json({ error: "Service temporarily unavailable" });
    return;
  }
  req.auth = auth;
  next();
}

// ── Token freshness check ─────────────────────────────────────────────────────
// Sensitive account-management operations (email change, 2FA setup) must be
// performed with a recently-issued token. A 30-day session JWT that was stolen
// or left on a shared device would otherwise grant full account control for the
// entire JWT lifetime. "Recent" is defined as issued within the last hour.
//
// This middleware must be chained AFTER requireAuth so req.auth is populated.

const FRESHNESS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function requireRecentAuth(req: Request, res: Response, next: NextFunction): void {
  const iat = req.auth?.iat;
  if (iat === undefined) {
    // requireAuth should have set this; fail closed if somehow missing.
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const issuedMs = iat * 1000;
  if (Date.now() - issuedMs > FRESHNESS_WINDOW_MS) {
    res.status(401).json({
      error: "Please sign in again to perform this action",
      code: "TOKEN_TOO_OLD",
    });
    return;
  }
  next();
}
