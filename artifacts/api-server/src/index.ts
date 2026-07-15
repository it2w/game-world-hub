import { createServer } from "node:http";
import { and, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { seed } from "./lib/seed";
import { attachSignaling } from "./ws/signaling";
import { ensureInitialOwner } from "./lib/owner";

// How long after the last heartbeat we treat a game as no longer running.
const PRESENCE_STALE = "4 minutes";

// Periodically clear currentGame for users whose open tabs stopped sending
// heartbeats (i.e. they closed the site), so "Active Process" doesn't stick.
function startPresenceSweep(): void {
  setInterval(() => {
    void db
      .update(usersTable)
      .set({ currentGame: null })
      .where(
        and(
          isNotNull(usersTable.currentGame),
          // Clear when the last heartbeat is stale OR was never recorded
          // (e.g. legacy rows written before heartbeats existed).
          or(
            isNull(usersTable.lastActiveAt),
            lt(usersTable.lastActiveAt, sql`now() - interval '${sql.raw(PRESENCE_STALE)}'`),
          ),
        ),
      )
      .catch((err) => logger.error({ err }, "presence sweep failed"));
  }, 60_000);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachSignaling(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening");

  try {
    await seed();
    logger.info("Seed complete");
  } catch (e) {
    logger.error({ err: e }, "Seed failed");
  }

  try {
    const ownerCreds = await ensureInitialOwner();
    if (ownerCreds) {
      logger.warn({ ownerUsername: ownerCreds.username, ownerPassword: ownerCreds.password }, "OWNER CREATED — save these credentials; this is the only time the password is shown");
    }
  } catch (e) {
    logger.error({ err: e }, "Owner initialization failed");
  }

  startPresenceSweep();
});
