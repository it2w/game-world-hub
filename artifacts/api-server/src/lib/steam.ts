// Steam Web API helpers. Requires the project-level STEAM_API_KEY secret.
// One key for the whole app; individual users only link their public profile.

export class SteamConfigError extends Error {}
export class SteamResolveError extends Error {}

// ─── Steam OpenID 2.0 ─────────────────────────────────────────────────────────
// Proves the linking user actually owns the Steam account (instead of any user
// being able to paste any arbitrary Steam ID).

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_CLAIMED_ID_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/**
 * Build the URL to send the browser to for Steam OpenID login.
 * @param returnTo  Full callback URL (including signed state token).
 */
export function buildSteamOpenIdUrl(returnTo: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": new URL(returnTo).origin + "/",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

/**
 * Verify a Steam OpenID callback via back-channel check.
 * Returns the verified SteamID64 on success; throws SteamResolveError otherwise.
 * @param query  All query params from the callback URL (including our `state` param).
 */
export async function verifySteamOpenId(query: Record<string, string>): Promise<string> {
  // Re-send all openid.* params back to Steam with mode=check_authentication.
  // Strip our own state param — Steam never sent it, so it mustn't appear.
  const verifyParams = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k === "state") continue;
    verifyParams.append(k, v);
  }
  verifyParams.set("openid.mode", "check_authentication");

  const resp = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });
  if (!resp.ok) throw new SteamResolveError("Could not reach Steam for verification");

  const text = await resp.text();
  if (!text.includes("is_valid:true")) {
    throw new SteamResolveError("Steam login verification failed — please try again");
  }

  const claimedId = query["openid.claimed_id"] ?? "";
  const m = claimedId.match(STEAM_CLAIMED_ID_RE);
  if (!m) throw new SteamResolveError("Unexpected Steam identity format");
  return m[1]; // verified SteamID64
}

const STEAM_ID_RE = /^\d{17}$/;

export interface SteamOwnedGame {
  appId: string;
  name: string;
  coverUrl: string;
  playtimeMinutes: number;
}

function apiKey(): string {
  const raw = process.env.STEAM_API_KEY;
  if (!raw || !raw.trim()) {
    throw new SteamConfigError("Steam integration is not configured");
  }
  // Steam Web API keys are exactly 32 hex characters. Tolerate accidental
  // surrounding whitespace or characters from copy-paste by extracting the run.
  const match = raw.match(/[0-9A-Fa-f]{32}/);
  if (!match) {
    throw new SteamConfigError(
      "STEAM_API_KEY is not a valid Steam Web API key (expected 32 hex characters)",
    );
  }
  return match[0];
}

/** Parse whatever the user pasted (SteamID64, vanity name, or profile URL). */
export function parseSteamInput(input: string): { kind: "id" | "vanity"; value: string } {
  const s = input.trim();
  const profiles = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profiles) return { kind: "id", value: profiles[1] };
  const vanity = s.match(/steamcommunity\.com\/id\/([^/\s?#]+)/i);
  if (vanity) return { kind: "vanity", value: decodeURIComponent(vanity[1]) };
  if (STEAM_ID_RE.test(s)) return { kind: "id", value: s };
  return { kind: "vanity", value: s.replace(/^@/, "") };
}

/** Resolve any accepted input to a SteamID64. Throws SteamResolveError if not found. */
export async function resolveSteamId(input: string): Promise<string> {
  const parsed = parseSteamInput(input);
  if (parsed.kind === "id") return parsed.value;

  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey()}&vanityurl=${encodeURIComponent(parsed.value)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new SteamResolveError("Could not reach Steam");
  const data = (await resp.json()) as { response?: { success?: number; steamid?: string } };
  if (data.response?.success === 1 && data.response.steamid) {
    return data.response.steamid;
  }
  throw new SteamResolveError("Steam account not found — check the profile URL or ID");
}

/** Fetch the public owned-games list for a SteamID64. Empty array if the profile is private. */
export async function fetchOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey()}` +
    `&steamid=${encodeURIComponent(steamId)}&include_appinfo=true&include_played_free_games=true&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new SteamResolveError("Could not fetch the Steam library");
  const data = (await resp.json()) as {
    response?: { game_count?: number; games?: Array<{ appid: number; name?: string; playtime_forever?: number }> };
  };
  const games = data.response?.games ?? [];
  return games
    .filter((g) => g.name && g.name.trim().length > 0)
    .map((g) => ({
      appId: String(g.appid),
      name: g.name!.trim(),
      coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
      playtimeMinutes: g.playtime_forever ?? 0,
    }));
}

/** The deep link that launches an owned Steam game if the Steam client is installed. */
export function steamLaunchUri(appId: string): string {
  return `steam://rungameid/${appId}`;
}
