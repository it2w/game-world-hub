---
name: otplib v13 API
description: otplib v13 breaking change — no authenticator export
---

otplib v13 removed the classic `authenticator` object export that most docs/tutorials show.

Use the functional API instead: `generateSecret()`, `generateURI({ issuer, label, secret })`, and `verify({ token, secret, epochTolerance })` (epochTolerance covers clock drift, replacing the old `window` option).

**Why:** imports of `{ authenticator }` compile-fail or are undefined at runtime; this cost several attempts before checking the installed package's actual exports.

**How to apply:** any TOTP work in this repo goes through the wrapper in the API server's auth lib; extend that rather than importing otplib directly elsewhere.
