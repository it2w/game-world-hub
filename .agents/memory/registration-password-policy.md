---
name: Registration password policy
description: Password complexity requirements for new user registration.
---

New registrations require a **16-character password** containing at least one uppercase letter, one lowercase letter, one digit, and one symbol from `@#$%^&*)(_-+=\/؟!`.

**Why:** The user explicitly requested strong passwords for new accounts to reduce credential-stuffing and weak-password risks.

**How to apply:**
- Frontend validation lives in `register.tsx` (zod schema + i18n strings under `auth.register.validation`).
- API validation lives in `auth.ts` (`PASSWORD_COMPLEXITY_RE`) and is enforced after the generated `RegisterBody` schema checks `minLength: 16`.
- If you change the policy, keep frontend and backend regexes in sync and update the OpenAPI `RegisterInput.password` description.
