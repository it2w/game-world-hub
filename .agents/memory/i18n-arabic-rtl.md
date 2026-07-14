---
name: Arabic i18n & RTL conventions
description: How Game World Hub's Arabic/English support is structured and the rules new UI code must follow.
---

# Arabic i18n & RTL (Game World Hub web app)

Setup: i18next with bundled per-namespace JSON (`src/i18n/locales/{en,ar}/<ns>.json`), one namespace per page area plus `common` for the shell/voice. Language detection order: `?lng=` query → localStorage `gwh_lang` → browser; fallback `en`. `LocaleShell` in App.tsx sets `<html lang/dir>` and wraps in Radix `DirectionProvider`; `html[lang='ar']` swaps the font stack to IBM Plex Sans Arabic in index.css. Vitest has a setup file importing `@/i18n` so components render real English in tests.

Rules for any new UI:
- **Use logical Tailwind classes only** (`ms-/me-/ps-/pe-`, `border-s/border-e`, `start-/end-`, `text-start/text-end`, `rtl:space-x-reverse`, `rtl:-scale-x-100` for directional icons). Physical `ml-/mr-/left-/right-/border-r` break RTL.
  **Why:** post-translation review found leftover `border-r` dividers rendering on the wrong edge in Arabic.
- **Server-sent fixed labels** (rank titles, achievement names — anything with a stable id) are translated client-side: `t('defs.' + id + '.name', { defaultValue: serverText })`. Never translate on the server; the fallback keeps unknown/new ids rendering.
- **User-generated content is never translated** (party names, LFG posts, usernames, game titles) — it stays exactly as the author wrote it.
- Keep Western digits (`0-9`) everywhere; Arabic uses the full 6-form plural keys (`_zero/_one/_two/_few/_many/_other`).
- Zod schemas needing translated messages live inside the component via `useMemo(() => schema, [t])`.

**How to apply:** any new page/component gets its strings in an existing or new namespace (register it in `src/i18n/index.ts`), en first (exact UI text), ar in MSA gamer tone per the glossary in existing files (Party=البارتي, LFG=البحث عن فريق, allies=الحلفاء).
