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
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<AuthPayload> & { purpose?: unknown };
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
  return { userId: payload.userId, username: payload.username };
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

  // Check suspension and existence via a lightweight primary-key lookup.
  // Fail CLOSED on any error: a suspended user must never slip through.
  try {
    const [user] = await db
      .select({ status: usersTable.status })
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
  } catch {
    // DB failure — fail closed so a transient error cannot bypass suspension.
    res.status(503).json({ error: "Service temporarily unavailable" });
    return;
  }
  req.auth = auth;
  next();
}
