import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, superAdminsTable } from "@workspace/db";
import { randomBytes } from "node:crypto";
import { logger } from "./logger";

const SALT_ROUNDS = 10;
const USERNAME_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRandomPassword(length = 16): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

export function generateRandomUsername(prefix = "owner", length = 6): string {
  let s = "";
  const buf = randomBytes(length);
  for (let i = 0; i < length; i++) {
    s += USERNAME_CHARS[buf[i] % USERNAME_CHARS.length];
  }
  return `${prefix}_${s}`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface OwnerCredentials {
  username: string;
  password: string;
}

export async function ensureInitialOwner(): Promise<OwnerCredentials | null> {
  const existing = await db.select().from(superAdminsTable).limit(1);
  if (existing.length > 0) return null;

  const username = generateRandomUsername();
  const password = generateRandomPassword();
  const passwordHash = await hashPassword(password);

  await db.insert(superAdminsTable).values({
    username,
    passwordHash,
  });

  logger.warn({ username }, "owner: created initial super admin; change password after first login");
  return { username, password };
}

export async function findOwnerByUsername(username: string) {
  const [owner] = await db.select().from(superAdminsTable).where(eq(superAdminsTable.username, username)).limit(1);
  return owner ?? null;
}

export async function findOwnerById(id: number) {
  const [owner] = await db.select().from(superAdminsTable).where(eq(superAdminsTable.id, id)).limit(1);
  return owner ?? null;
}

export async function updateOwnerPassword(id: number, password: string) {
  const passwordHash = await hashPassword(password);
  await db.update(superAdminsTable).set({ passwordHash, updatedAt: new Date() }).where(eq(superAdminsTable.id, id));
}

export async function updateOwnerEmail(id: number, email: string) {
  await db.update(superAdminsTable).set({ email, emailVerified: false, updatedAt: new Date() }).where(eq(superAdminsTable.id, id));
}

export async function markOwnerEmailVerified(id: number) {
  await db.update(superAdminsTable).set({ emailVerified: true, updatedAt: new Date() }).where(eq(superAdminsTable.id, id));
}

export function isPasswordStrong(password: string): boolean {
  return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&*)(_\-+=\\/؟!]).{16,}$/.test(password);
}
