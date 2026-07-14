---
name: game library integrations
description: What is/isn't possible when importing users' games from Steam/Epic/Battle.net/Xbox.
---

# Game platform library import — feasibility

- **Steam is the ONLY platform with a public owned-games API.** Use the Steam Web API
  (one project-level `STEAM_API_KEY` secret, shared by all users): `ISteamUser/
  ResolveVanityURL` to turn a vanity/profile URL into a SteamID64, then `IPlayerService/
  GetOwnedGames` (`include_appinfo=true`). Requires the user's profile "game details"
  to be public; a private profile returns an empty games list (not an error).
- **Epic, Battle.net, Xbox have NO public "owned games" API** — access is partner-only.
  Do not promise auto-import for them. Offer manual game entry + account-handle linking.
- **Launching an installed game = a protocol deep link** opened via `window.location`.
  Steam: `steam://rungameid/<appid>` (derived server-side from appId). Others are
  user-supplied (e.g. `battlenet://WoW`, `com.epicgames.launcher://apps/<name>?action=launch`).
  **Validate any user-supplied launch URI against a scheme allowlist** (steam:,
  com.epicgames.launcher:, battlenet:, uplay:, origin:, riot:, gog:, ...) to block
  `javascript:`/`data:` injection — same lesson as user-link-fields. Validate cover URLs as http(s).

**Why:** users frequently ask to "connect Steam/Epic/Xbox and show my games" expecting
all four to auto-import; only Steam can. Set that expectation up front instead of
building dead ends.

**How to apply:** cover art `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg`.
Steam import must be **reconciliatory** (full replace of source='steam' rows in a
transaction) so sync and relink don't leave stale games. Data lives in `game_accounts`
+ `linked_games`; the Library page is routed at `/games` (the sidebar "Library" link).
