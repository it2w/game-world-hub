---
name: GCS sidecar broken — DB image storage workaround
description: Object storage sidecar returns fake/empty JWT credential; all GCS SDK ops fail. Images stored in PostgreSQL instead.
---

## Rule
Do NOT use GCS object storage for user image uploads in this project. The sidecar at port 1106 returns an unsigned JWT with an empty payload (`alg:none, payload:{}`), causing `StsCredentials.exchangeToken` to fail with "no allowed resources" for all read and write operations.

## Why
The Replit object storage sidecar `/credential` and `/token` endpoints both return `eyJhbGciOiJub25lIiwidHlwIjoiSldUIN0.e30.` — an empty unsigned JWT. GCP STS rejects this. The sidecar's `/object-storage/signed-object-url` endpoint also returns 401 regardless of auth header.

## How to apply
- User images (avatar, banner, profile photos) are stored as BYTEA in the `stored_images` table.
- Upload endpoint: `POST /api/images` (multipart/form-data, auth required) → returns `{ objectPath: "/images/<uuid>" }`.
- Serve endpoint: `GET /api/images/:id` (public, no auth needed) → serves from DB.
- `toPublicImageUrl("/images/<id>")` → `/api/images/<id>` (one-liner in objectStorage.ts).
- `normalizeStoredImagePath` passes `/images/` paths through without ACL processing.
- Frontend hook: `use-image-upload.ts` POSTs to `/api/images` instead of presigned URL flow.
- The `stored_images` table schema is in `lib/db/src/schema/stored-images.ts`.
- For future large binary uploads (video, files), consider a different approach since BYTEA in PG scales poorly beyond ~5MB.
