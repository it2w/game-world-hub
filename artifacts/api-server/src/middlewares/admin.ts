import { Request, Response, NextFunction } from "express";
import { db, usersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./auth";

// Read at call-time so tests can control the env var without re-importing.
function isEnvAdmin(username: string): boolean {
  return (process.env["ADMIN_USERNAMES"] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(username.toLowerCase());
}

// All valid permission flags in the admin_permissions table.
export type AdminPermissionFlag =
  | "can_manage_pro"
  | "can_suspend_users"
  | "can_delete_content"
  | "can_view_reports"
  | "can_manage_codes"
  | "can_broadcast"
  | "can_view_analytics"
  | "can_manage_admins";

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

    const isAdmin = user.isAdmin || isEnvAdmin(user.username);
    if (!isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.adminUser = user;
    next();
  });
}

/**
 * Returns Express middleware that checks a specific admin permission flag.
 * Must be used AFTER requireAdmin (relies on req.adminUser being set).
 *
 * Admins listed in the ADMIN_USERNAMES env var bypass the permission check
 * (they are platform-level trusted admins, not DB-managed admins).
 */
export function requireAdminPermission(flag: AdminPermissionFlag) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.adminUser) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    // Env-level admins (ADMIN_USERNAMES) bypass the DB permission check — fully trusted.
    if (isEnvAdmin(req.adminUser.username)) {
      next();
      return;
    }
    // DB-managed admins must have the specific flag set.
    // Fail-closed: ANY DB error (including missing table) must DENY — never allow through.
    try {
      const { rows } = await pool.query<Record<string, unknown>>(
        `SELECT ${flag} FROM admin_permissions WHERE user_id = $1`,
        [req.adminUser.id],
      );
      if (!rows[0] || !rows[0][flag]) {
        res.status(403).json({ error: "You do not have permission to perform this action" });
        return;
      }
      next();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "42P01") {
        // admin_permissions table not yet migrated — deny until migrations are complete.
        res.status(403).json({ error: "Permission check unavailable — migrations pending" });
        return;
      }
      // Any other DB error must also DENY — never allow through.
      res.status(503).json({ error: "Permission check temporarily unavailable" });
    }
  };
}
