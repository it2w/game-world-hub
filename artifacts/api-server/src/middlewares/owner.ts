import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

const _jwtSecretRaw = process.env.JWT_SECRET;
if (!_jwtSecretRaw) {
  throw new Error("JWT_SECRET environment variable is required but was not set.");
}
const JWT_SECRET: string = _jwtSecretRaw;

export interface OwnerPayload {
  ownerId: number;
  username: string;
  purpose: "owner";
}

/** Short-lived pre-auth token issued after password check when 2FA is enabled.
 *  Must be exchanged for a full owner token by verifying the TOTP code. */
export interface OwnerPreAuthPayload {
  ownerId: number;
  username: string;
  purpose: "owner_pre_auth";
}

/** Signed with the Epic link JWT pattern — embed redirectUri inside so Epic validates exact match. */
export interface EpicLinkPayload {
  userId: number;
  redirectUri: string;
  purpose: "epic_link";
}

declare global {
  namespace Express {
    interface Request {
      owner?: OwnerPayload;
    }
  }
}

export function signOwnerToken(payload: OwnerPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyOwnerToken(token: string): OwnerPayload {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<OwnerPayload> & { purpose?: unknown };
  if (
    payload.purpose !== "owner" ||
    typeof payload.ownerId !== "number" ||
    typeof payload.username !== "string"
  ) {
    throw new Error("Not an owner token");
  }
  return { ownerId: payload.ownerId, username: payload.username, purpose: "owner" };
}

/** Sign a short-lived (5 min) pre-auth token for the 2FA challenge step. */
export function signOwnerPreAuthToken(payload: OwnerPreAuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });
}

export function verifyOwnerPreAuthToken(token: string): OwnerPreAuthPayload {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<OwnerPreAuthPayload> & { purpose?: unknown };
  if (
    payload.purpose !== "owner_pre_auth" ||
    typeof payload.ownerId !== "number" ||
    typeof payload.username !== "string"
  ) {
    throw new Error("Not an owner pre-auth token");
  }
  return { ownerId: payload.ownerId, username: payload.username, purpose: "owner_pre_auth" };
}

export function signEpicLinkToken(userId: number, redirectUri: string): string {
  const payload: EpicLinkPayload = { userId, redirectUri, purpose: "epic_link" };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyEpicLinkToken(token: string): EpicLinkPayload {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<EpicLinkPayload> & { purpose?: unknown };
  if (
    payload.purpose !== "epic_link" ||
    typeof payload.userId !== "number" ||
    typeof payload.redirectUri !== "string"
  ) {
    throw new Error("Not an Epic link token");
  }
  return { userId: payload.userId, redirectUri: payload.redirectUri, purpose: "epic_link" };
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const token = header.slice(7);
  try {
    req.owner = verifyOwnerToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // IP Allowlist enforcement (async — must not block on failure)
  pool.query<{ cidr: string }>(
    `SELECT cidr FROM owner_ip_allowlist ORDER BY id`,
  ).then(({ rows }) => {
    if (rows.length === 0) { next(); return; } // empty list = all IPs allowed
    const requestIp = (req.ip ?? req.socket?.remoteAddress ?? "").replace(/^::ffff:/, "");
    const allowed = rows.some(({ cidr }) => ipMatchesCidr(requestIp, cidr));
    if (!allowed) {
      res.status(403).json({ error: "Access denied: your IP is not on the allowlist" });
    } else {
      next();
    }
  }).catch(() => next()); // fail open if DB is unreachable
}

/** Simple CIDR matcher supporting IPv4 single IPs and x.x.x.x/prefix notation. */
function ipMatchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [network, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix)) return false;
  try {
    const ipNum   = ipToNum(ip);
    const netNum  = ipToNum(network);
    const mask    = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) >>> 0 === (netNum & mask) >>> 0;
  } catch { return false; }
}

function ipToNum(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) throw new Error("invalid ip");
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
