---
name: User-supplied external links
description: Rule for any feature where users save a link/handle that is later rendered as an href to other users.
---

# Never store or render client-supplied URLs for user profile links

When a feature lets a user attach an external destination (content channels, social
links, portfolio, etc.) that other users will see as a clickable `href`, do NOT accept
a raw `url` from the client and render it.

**Rule:** store only a validated **handle** (allowlist charset, e.g. `^[A-Za-z0-9_.-]{1,100}$`,
strip a leading `@`) plus a platform enum, and **derive the URL server-side** from a
fixed per-platform template (e.g. `https://twitch.tv/{handle}`). `encodeURIComponent`
the handle when building the URL as defense-in-depth. Also derive on read, so any
previously-stored url is neutralized.

**Why:** an accepted `url` field is a stored client-side injection vector — an attacker
saves `javascript:...` or a phishing URL, and it gets delivered to every viewer of their
profile. Code review flagged exactly this on the Game World Hub content-channels feature.

**How to apply:** applies to profile links, content/creator channels, and any similar
"link your account" feature. If arbitrary URLs are ever truly required, enforce an
`https`-only scheme + per-platform hostname allowlist instead of free-form storage.
