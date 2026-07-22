/**
 * AutoMod engine for DM / party conversations.
 *
 * The global rule is cached in memory (60-second TTL) so that most message
 * sends are free of extra DB round-trips.  The slowmode tracker is purely
 * in-memory per process — sufficient for a single-server deployment.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

// ── Startup: ensure automod_rules table + partial unique indexes ───────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automod_rules (
      id               SERIAL PRIMARY KEY,
      conversation_id  INTEGER,
      slowmode_seconds INTEGER NOT NULL DEFAULT 0,
      max_length       INTEGER NOT NULL DEFAULT 2000,
      denylist         TEXT[]  NOT NULL DEFAULT '{}',
      enabled          BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Partial unique index for the global (conversation_id IS NULL) singleton row.
  // Required for ON CONFLICT ((conversation_id IS NULL)) WHERE conversation_id IS NULL.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS automod_global_idx
     ON automod_rules ((conversation_id IS NULL))
     WHERE conversation_id IS NULL`,
  );
  // Partial unique index for per-conversation rows (reserved for future use).
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS automod_conv_idx
     ON automod_rules (conversation_id)
     WHERE conversation_id IS NOT NULL`,
  );
  logger.info("automod: tables ensured");
}

ensureTables().catch((err) => logger.error({ err }, "automod: ensureTables failed"));

interface AutomodRule {
  slowmodeSeconds: number;
  maxLength: number;
  denylist: string[];
  enabled: boolean;
}

// ─── Global rule cache ────────────────────────────────────────────────────────

let _globalRule: AutomodRule | null = null;
let _globalRuleAt = 0;
const RULE_TTL_MS = 60_000;

export async function getGlobalAutomodRule(): Promise<AutomodRule> {
  const now = Date.now();
  if (_globalRule && now - _globalRuleAt < RULE_TTL_MS) return _globalRule;

  try {
    const { rows } = await pool.query<{
      slowmode_seconds: number;
      max_length: number;
      denylist: string[] | null;
      enabled: boolean;
    }>(
      `SELECT slowmode_seconds, max_length, denylist, enabled
       FROM automod_rules WHERE conversation_id IS NULL LIMIT 1`,
    );

    if (rows[0]) {
      _globalRule = {
        slowmodeSeconds: rows[0].slowmode_seconds,
        maxLength: rows[0].max_length,
        denylist: rows[0].denylist ?? [],
        enabled: rows[0].enabled,
      };
    } else {
      _globalRule = { slowmodeSeconds: 0, maxLength: 2000, denylist: [], enabled: false };
    }
  } catch {
    _globalRule = { slowmodeSeconds: 0, maxLength: 2000, denylist: [], enabled: false };
  }
  _globalRuleAt = Date.now();
  return _globalRule!;
}

/** Call after admin saves new settings to flush the cache immediately. */
export function invalidateAutomodCache(): void {
  _globalRule = null;
  _globalRuleAt = 0;
}

// ─── Per-user slowmode tracker ────────────────────────────────────────────────

/** key = `${userId}:${conversationId}` */
const _lastSent = new Map<string, number>();

// ─── Check ────────────────────────────────────────────────────────────────────

export interface AutomodResult {
  blocked: boolean;
  reason?: string;
}

export async function checkAutomod(
  userId: number,
  conversationId: number,
  content: string,
): Promise<AutomodResult> {
  const rule = await getGlobalAutomodRule();
  if (!rule.enabled) return { blocked: false };

  // 1. Max length
  if (rule.maxLength > 0 && content.length > rule.maxLength) {
    return { blocked: true, reason: `Message too long (max ${rule.maxLength} characters)` };
  }

  // 2. Denylist (case-insensitive word-boundary check)
  if (rule.denylist.length > 0) {
    const lower = content.toLowerCase();
    for (const word of rule.denylist) {
      if (word && lower.includes(word.toLowerCase())) {
        return { blocked: true, reason: "Your message was blocked by AutoMod" };
      }
    }
  }

  // 3. Slowmode
  if (rule.slowmodeSeconds > 0) {
    const key = `${userId}:${conversationId}`;
    const last = _lastSent.get(key) ?? 0;
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed < rule.slowmodeSeconds * 1_000) {
      const wait = Math.ceil((rule.slowmodeSeconds * 1_000 - elapsed) / 1_000);
      return { blocked: true, reason: `Slowmode active — wait ${wait}s before sending again` };
    }
    _lastSent.set(key, now);
  }

  return { blocked: false };
}
