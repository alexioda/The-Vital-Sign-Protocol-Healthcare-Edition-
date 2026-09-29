# The-Vital-Sign-Protocol-Healthcare-Edition-
Digital PPE for Nurses and Clinicians. Protect your license and your sanity.

## Setup (Vercel project `the-vital-sign-protocol-healthcare-edition`)

Static `index.html` plus three Vercel functions in `api/`.

| Env var | Value |
| --- | --- |
| `VITALS_CODES` | JSON map of unit code → expiry date, e.g. `{"RPC_STAFF":"2030-01-01"}`. A code works until 00:00 UTC on that date. Case-insensitive. |
| `ADMIN_KEY` | Long random string (16+ chars) for `/api/vitals-export`. |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when a **private** Blob store is connected to the project. |

Never commit codes or keys.

- `POST /api/verify-code` `{ code }` → `{ valid }`
- `POST /api/vitals` with header `X-License-Code` → stores one session (numeric/categorical fields only) at `vitals/{date}/{session_id}-{random}.json` in private Blob storage.
- `GET /api/vitals-export` with header `X-Admin-Key` (or `?key=`) → CSV of all sessions. `?date=YYYY-MM-DD` for one day.

Free-text fields (situation, lens rewrite, spark, boundary blanks) never leave the device. Presenter mode (`?mode=present`) never posts.
