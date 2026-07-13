import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * A subset of the browser `RTCIceServer` shape. Defined locally because the
 * API server runs under Node (no DOM lib) but the payload is consumed directly
 * as `RTCIceServer[]` by the client.
 */
interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Public STUN servers. Free and always available; they let peers discover their
 * own reflexive candidates but cannot relay media, so they are insufficient on
 * their own for symmetric-NAT / restrictive-firewall networks. Kept in sync
 * with the client fallback in `voice/webrtc.ts`.
 */
const STUN_SERVERS: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24h

/**
 * Builds the TURN portion of the ICE server list from environment configuration.
 *
 * Two credential modes are supported, in priority order:
 *
 *  1. Ephemeral (recommended). Set `TURN_URLS` + `TURN_STATIC_AUTH_SECRET`.
 *     Credentials are minted per request using the coturn "use-auth-secret" /
 *     TURN REST API scheme: username is `<expiry-unix-ts>:<userId>` and the
 *     credential is base64(HMAC-SHA1(secret, username)). This means no
 *     long-lived password is ever shipped to the browser and access expires
 *     automatically (`TURN_CREDENTIAL_TTL`, default 24h).
 *
 *  2. Static. Set `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` for a fixed
 *     long-term credential (simpler, but the password is exposed to clients).
 *
 * If `TURN_URLS` is unset, no TURN server is returned and calls fall back to
 * STUN-only (fine for permissive networks, will fail on strict ones).
 */
function buildTurnServers(userId: number): IceServer[] {
  const rawUrls = process.env.TURN_URLS?.trim();
  if (!rawUrls) return [];

  const urls = rawUrls
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length === 0) return [];

  const secret = process.env.TURN_STATIC_AUTH_SECRET?.trim();
  if (secret) {
    const ttl = Number(process.env.TURN_CREDENTIAL_TTL) || DEFAULT_TTL_SECONDS;
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const username = `${expiry}:${userId}`;
    const credential = crypto
      .createHmac("sha1", secret)
      .update(username)
      .digest("base64");
    return [{ urls, username, credential }];
  }

  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  if (username && credential) {
    return [{ urls, username, credential }];
  }

  logger.warn(
    "TURN_URLS is set but no credentials found (need TURN_STATIC_AUTH_SECRET, or TURN_USERNAME + TURN_CREDENTIAL). Skipping TURN.",
  );
  return [];
}

/**
 * GET /ice-servers
 *
 * Returns the ICE server list the client should feed into its
 * RTCPeerConnection. Always includes STUN; includes TURN with fresh
 * (possibly time-limited) credentials when configured via env. Requires auth so
 * TURN relay capacity is only handed to signed-in users.
 */
router.get("/ice-servers", requireAuth, (req, res): void => {
  const iceServers: IceServer[] = [...STUN_SERVERS, ...buildTurnServers(req.auth!.userId)];
  res.json({ iceServers });
});

export default router;
