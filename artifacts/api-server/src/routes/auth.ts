import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  UpdateMyStatusBody,
} from "@workspace/api-zod";
import { requireAuth, signToken } from "../middlewares/auth";

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? null,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, password, displayName } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    displayName,
    status: "online",
  }).returning();

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

  // Set user online
  await db.update(usersTable).set({ status: "online" }).where(eq(usersTable.id, user.id));

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ user: { ...safeUser(user), status: "online" }, token });
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
