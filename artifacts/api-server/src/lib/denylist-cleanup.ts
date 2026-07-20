import { lt, sql } from "drizzle-orm";
import { db, revokedTokensTable } from "@workspace/db";
import { logger } from "./logger";

// JWTs are signed with expiresIn: "30d", so any denylist entry older than 30
// days cannot possibly block a valid token — the JWT itself has already expired.
// Pruning these dead rows keeps the table (and the index scanned on every
// authenticated request) from growing forever.
const DENYLIST_TTL_DAYS = 30;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

async function pruneDenylist(): Promise<void> {
  try {
    const cutoff = sql`now() - interval '${sql.raw(String(DENYLIST_TTL_DAYS))} days'`;
    const deleted = await db
      .delete(revokedTokensTable)
      .where(lt(revokedTokensTable.revokedAt, cutoff))
      .returning({ id: revokedTokensTable.id });
    logger.info({ count: deleted.length }, "denylist cleanup: pruned expired rows");
  } catch (err) {
    logger.error({ err }, "denylist cleanup: failed to prune expired rows");
  }
}

export function startDenylistCleanup(): void {
  // Run once immediately on startup, then repeat every 24 hours.
  void pruneDenylist();
  setInterval(() => void pruneDenylist(), RUN_INTERVAL_MS);
}
