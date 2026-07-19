import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import friendsRouter from "./friends";
import conversationsRouter from "./conversations";
import partiesRouter from "./parties";
import lfgRouter from "./lfg";
import achievementsRouter from "./achievements";
import blocksRouter from "./blocks";
import contentRouter from "./content";
import libraryRouter from "./library";
import gamesRouter from "./games";
import platformsRouter from "./platforms";
import notificationsRouter from "./notifications";
import livekitRouter from "./livekit";
import storageRouter from "./storage";
import imagesRouter from "./images";
import proRouter from "./pro";
import challengesRouter from "./challenges";
import statsRouter from "./stats";
import lfgBotRouter from "./lfg-bot";
import proGiftsRouter from "./pro-gifts";
import adminRouter from "./admin";
import ownerRouter from "./owner";
import reportsRouter from "./reports";
import downloadRouter from "./download";
import roomsRouter from "./rooms";
import questsRouter from "./quests";

const router: IRouter = Router();

/* ─── Maintenance mode gate (30-second cache) ────────────────────────────── */
// Exempt: /owner/* (owner must always be able to log in) and /health.
let maintenanceCache: { active: boolean; message: string; ts: number } | null = null;

router.use(async (req, res, next) => {
  if (req.path.startsWith("/owner") || req.path === "/health") { next(); return; }
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.ts < 30_000) {
    if (maintenanceCache.active) {
      res.status(503).json({ error: maintenanceCache.message }); return;
    }
    next(); return;
  }
  try {
    const { rows } = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM platform_settings WHERE key IN ('maintenance_mode','maintenance_message')`,
    );
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    const active = s.maintenance_mode === "true";
    const message = s.maintenance_message || "Platform is currently under maintenance";
    maintenanceCache = { active, message, ts: now };
    if (active) { res.status(503).json({ error: message }); return; }
  } catch { /* table not yet created — skip */ }
  next();
});

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(friendsRouter);
router.use(conversationsRouter);
router.use(partiesRouter);
router.use(lfgRouter);
router.use(achievementsRouter);
router.use(blocksRouter);
router.use(contentRouter);
router.use(libraryRouter);
router.use(gamesRouter);
router.use(platformsRouter);
router.use(notificationsRouter);
router.use(livekitRouter);
router.use(storageRouter);
router.use(imagesRouter);
router.use(proRouter);
router.use(challengesRouter);
router.use(statsRouter);
router.use(lfgBotRouter);
router.use(proGiftsRouter);
router.use(adminRouter);
router.use(ownerRouter);
router.use(reportsRouter);
router.use(downloadRouter);
router.use(roomsRouter);
router.use(questsRouter);

export default router;
