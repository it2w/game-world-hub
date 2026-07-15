---
name: Pro subscription via Salla
description: How Pro subscription status is stored, activated, and surfaced across the app.
---

## Subscription storage

- Pro status is stored in two places:
  - `pro_subscriptions` table: one row per payment/order, with `userId`, `orderId`, `provider`, `status`, `amount`, `currency`, `startedAt`, `expiresAt`, and `metadata`.
  - `users` table: mirrors `isPro`, `proActivatedAt`, `proExpiresAt`, `proOrderId`, and `proProvider` for fast reads and cheap serialization.

- `isPro` is computed at serialization time by checking `isPro=true` and that `proExpiresAt` is either null or in the future. This prevents stale rows from advertising Pro after expiry.

- **Why:** Friends, LFG cards, and the sidebar render a Pro badge from `safeUser` output, so Pro status must travel in the user payload without extra joins. Keeping the row-of-record in `pro_subscriptions` lets us support historical invoices, refunds, and renewals without changing the denormalized user flags.

## Salla webhook activation

- `POST /api/webhooks/salla` is mounted in `app.ts` **before** `express.json()` so it receives the raw request body for HMAC verification.
- The endpoint is public. In production it requires `SALLA_WEBHOOK_SECRET` and verifies the signature sent in the header configured by `SALLA_SIGNATURE_HEADER` (default `x-salla-signature`).
- It matches the order to a user in this order:
  1. Custom checkout option whose name contains the configured `SALLA_USERNAME_OPTION_NAME` (default `Game World Hub Username`).
  2. Customer email from the order payload.
- It only activates Pro when the order status looks completed (`completed`, `confirmed`, `paid`, `delivered`, or `payment_completed`).
- Each order is processed idempotently: duplicate order IDs are ignored.

- **Why:** Salla's webhook payload structure varies by merchant configuration, so the handler reads the username field from the most common locations (order options, cart options, and notes). The dev endpoint accepts unsigned webhooks with a warning so the integration can be tested before the secret is added; in production unsigned requests are rejected.

## How to apply

- Add the new columns and table via raw SQL, keeping it in sync with `lib/db/src/schema/`. (Do not use `drizzle-kit push` in this project; it hangs on interactive prompts.)
- Set `SALLA_WEBHOOK_SECRET` from the Salla app dashboard before production use.
- Configure the Salla checkout product with a custom field named `Game World Hub Username` so the webhook can match the buyer to the correct user account.
