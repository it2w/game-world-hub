import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./auth";

const ADMIN_USERNAMES = new Set(
  (process.env["ADMIN_USERNAMES"] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

declare global {
  namespace Express {
    interface Request {
      adminUser?: typeof usersTable.$inferSelect;
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  requireAuth(req, res, async () => {
    if (!req.auth) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.auth.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const isAdmin = user.isAdmin || ADMIN_USERNAMES.has(user.username.toLowerCase());
    if (!isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.adminUser = user;
    next();
  });
}
