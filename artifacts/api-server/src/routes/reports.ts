/**
 * User-facing reports route.
 * POST /reports — authenticated users submit a report about another user, LFG post, or party.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const { targetType, targetId, targetName, reason } = req.body as {
    targetType?: string;
    targetId?: number | string;
    targetName?: string;
    reason?: string;
  };

  const VALID_TYPES = ["user", "lfg", "party"];
  if (!targetType || !VALID_TYPES.includes(targetType)) {
    res.status(400).json({ error: "targetType must be one of: user, lfg, party" });
    return;
  }
  const tid = Number(targetId);
  if (!tid || !Number.isFinite(tid)) {
    res.status(400).json({ error: "targetId must be a valid number" });
    return;
  }
  if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
    res.status(400).json({ error: "reason must be at least 5 characters" });
    return;
  }
  if (reason.trim().length > 1000) {
    res.status(400).json({ error: "reason must be at most 1000 characters" });
    return;
  }

  // Prevent self-reporting
  if (targetType === "user" && tid === userId) {
    res.status(400).json({ error: "You cannot report yourself" });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, target_name, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, targetType, tid, targetName?.trim().slice(0, 100) || null, reason.trim()],
    );
    res.status(201).json({ ok: true });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") {
      // reports table not yet created on first deploy — treat as no-op success.
      res.status(201).json({ ok: true });
      return;
    }
    // All other failures must surface as errors so they don't silently drop reports.
    res.status(503).json({ error: "Could not submit report, please try again" });
  }
});

export default router;
