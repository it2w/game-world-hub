import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { seed } from "./lib/seed";
import { attachSignaling } from "./ws/signaling";

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
});
