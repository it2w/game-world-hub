# Game World Hub Pro Subscription Design

Date: 2026-07-15
Status: Approved for implementation

## 1. Product Vision

Game World Hub Pro is a single premium subscription that transforms the platform from a "find players" tool into a **gaming command center**. One Pro tier unlocks all premium features across three pillars:

- **Squad Leader** — advanced party and voice tools
- **Elite Identity** — standout profile and presence
- **Content Creator** — community-building and tournament tools

## 2. Subscription Model

- **Single Pro tier** — simple for users, no confusing tiers.
- **Payment via Salla** — external checkout link: `https://sashoop.com/pro-subscription-game-world-hub/p55420885`
- **Activation** — fully automated via Salla webhook.
- **Billing period** — monthly or annual product variants on the Salla store (annual includes a discount).
- **Free trial** — not required at launch; can be added later as a Salla coupon/campaign.

## 3. Payment Flow

1. Authenticated user clicks **"Upgrade to Pro"** in the app.
2. App opens the Salla product link in a new tab.
3. The Salla checkout is configured with a **custom field** that collects the user's Game World Hub username (or email).
4. User completes payment on Salla.
5. Salla emits an `order.created` / `order.status.updated` webhook to the API.
6. The webhook handler:
   - Verifies the webhook signature.
   - Extracts the custom-field username/email.
   - Matches the order to a Game World Hub user.
   - Activates Pro for that user.
   - Sends a notification / email confirmation.

## 4. Data Model

### `users` table additions
- `isPro` boolean, default `false`
- `proActivatedAt` timestamp (nullable)
- `proExpiresAt` timestamp (nullable)
- `proOrderId` string (nullable)
- `proProvider` string, default `'salla'`

### `proSubscriptions` table (new)
- `id` serial primary key
- `userId` integer → users (FK, on delete cascade)
- `orderId` string unique
- `provider` string (e.g., `'salla'`)
- `status` enum: `active`, `expired`, `cancelled`, `refunded`
- `amount` decimal/nullable
- `currency` string/nullable
- `startedAt` timestamp
- `expiresAt` timestamp/nullable
- `metadata` jsonb/nullable

### Matching fallback strategy
- **Primary:** Salla custom checkout field containing the Game World Hub username.
- **Fallback:** match by customer email if the user used the same email in Game World Hub and Salla.
- **Last resort:** store a pending activation token in the app and ask the user to paste it in the order notes if custom fields are unavailable.

## 5. API Endpoints

- `POST /api/webhooks/salla` — public webhook receiver. Verifies Salla signature, idempotent, activates Pro.
- `GET /api/me/pro` — returns current Pro status (`isPro`, `expiresAt`, `features`).
- `GET /api/admin/pro-subscriptions` (admin) — list Pro subscriptions with filters.
- `POST /api/admin/pro-subscriptions/:id/activate` (admin) — manual activation fallback.

## 6. Feature Gating

Backend:
- `requirePro()` middleware / helper returns `403` if the user is not an active Pro.
- Helper `isProActive(user)` checks `isPro === true` and `proExpiresAt` is in the future.

Frontend:
- Global hook `useProStatus()` reads `/api/me/pro`.
- `ProBadge` component shown on profile, friends list, LFG cards, and party list.
- `ProGate` component shows a blurred/locked preview with an upgrade CTA.
- Existing free features stay unchanged; new features are Pro-only.

## 7. Pro Features (v1)

### Squad Leader
- **Pro voice rooms** — up to 20 participants, HQ audio, screen-share priority.
- **Party roles** — Leader, Co-Leader, Officer, Member with role-based permissions.
- **Scheduled LFG** — recurring LFG posts, auto-bump before session time.
- **Auto-match** — recommend teammates by game, rank, region, and play time.

### Elite Identity
- **Animated Pro badge** — next to username across the app.
- **Animated profile banner** — custom banner + profile colors.
- **Game Timeline** — visual history of played games and milestones.
- **Verified accounts** — verify Steam/Epic/Riot links and display real rank.

### Content Creator
- **Teams/Clans** — create a team page, invite members, set roles, tag team in LFG.
- **Tournaments** — create brackets, track results, invite teams.
- **Highlights** — upload short game clips to the profile.
- **Boosted LFG** — Pro posts appear at the top of LFG listings.

## 8. UI Surfaces

- Landing page pricing section — "Free" vs "Pro" cards with a CTA button that opens Salla.
- Settings / Billing page — shows Pro status, expiry, and order history.
- Profile page — Pro badge and Pro-only customization controls.
- LFG page — boosted posts and Pro-only filters.
- Parties page — voice room and role controls for Pro users.

## 9. Security

- Verify Salla webhook signature using a configured secret.
- Idempotency: record every `orderId`; do not activate twice for the same order.
- Validate custom-field username/email before updating user status.
- Admin endpoints require `admin` role or `isAdmin` flag.
- Log every webhook request and activation for audit.

## 10. Rollout Plan

Phase 1 — Infrastructure
- Schema migrations for Pro fields and `proSubscriptions` table.
- Salla webhook endpoint and signature verification.
- `GET /api/me/pro` and `requirePro()` helper.

Phase 2 — UI & Activation
- Upgrade button and Pro badge.
- Landing page pricing update.
- Activation confirmation email/notification.

Phase 3 — Pro Features (by pillar)
- Squad Leader: voice rooms, party roles, scheduled LFG, auto-match.
- Elite Identity: animated badge/banner, game timeline, verified accounts.
- Content Creator: teams, tournaments, highlights, boosted LFG.

Phase 4 — Admin & Analytics
- Admin subscription list and manual activation.
- Basic revenue/retention metrics.

## 11. Open Questions Resolved

- **Payment provider:** Salla via external product link (user-provided).
- **User matching:** Salla custom checkout field with Game World Hub username; email fallback.
- **Tier count:** Single Pro tier.
- **Activation:** Automated via Salla webhook.
