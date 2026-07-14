// Steam Web API helpers. Requires the project-level STEAM_API_KEY secret.
// One key for the whole app; individual users only link their public profile.

export class SteamConfigError extends Error {}
export class SteamResolveError extends Error {}

const STEAM_ID_RE = /^\d{17}$/;

export interface SteamOwnedGame {
  appId: string;
  name: string;
  coverUrl: string;
  playtimeMinutes: number;
}

function apiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    throw new SteamConfigError("Steam integration is not configured");
  }
  return key;
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
