---
name: Dev email mailbox
description: Where emails go in development and how tests read OTP codes
---

There is no real email provider wired up. In development, `sendEmail` appends each message as a JSONL line to `/tmp/gwh-dev-emails.jsonl` (`{ to, subject, text, ... }`) instead of sending.

**How to apply:** integration tests and manual verification read 6-digit codes with a regex over the last line matching the recipient. Never log raw OTP codes anywhere else. `/tmp` is wiped on restarts — don't rely on old entries.

**Why:** lets email-verification, password-reset, and email-2FA flows be fully testable offline without burning sender reputation on fake addresses.

Production sends through the Resend connector (`@replit/connectors-sdk` proxy to POST /emails; returns a fetch-style Response). The managed key is send-only — GET endpoints like /domains return 401 restricted; that 401 means auth WORKS. Sandbox sender `onboarding@resend.dev` only delivers to the Resend account owner's inbox — verify a domain and set `EMAIL_FROM` to reach real users. `EMAIL_DELIVERY=resend` forces real sends from dev; `delivered@resend.dev` is Resend's safe test recipient.
