---
name: Post-migration DB sequence fix
description: After migrating/importing Postgres data with explicit IDs, serial sequences stay at 1 and new inserts fail with duplicate PK errors.
---

## The rule
After any data import (pg_restore, COPY, INSERT with explicit IDs), reset every serial sequence:

```sql
SELECT setval(pg_get_serial_sequence('users','id'), MAX(id)) FROM users;
-- repeat for every table with a serial PK
```

**Why:** pg_restore and direct INSERTs bypass the sequence, leaving it at its start value. The next auto-generated ID conflicts with an existing row.

**How to apply:** Run immediately after any DB migration/import, before starting the API server. Symptom is `duplicate key value violates unique constraint "<table>_pkey"` on new inserts (e.g. registration returning 500).
