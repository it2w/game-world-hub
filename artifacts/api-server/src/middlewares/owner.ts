import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const token = header.slice(7);
  try {
    req.owner = verifyOwnerToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
