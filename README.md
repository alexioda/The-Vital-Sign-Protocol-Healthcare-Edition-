# The-Vital-Sign-Protocol-Healthcare-Edition-
Digital PPE for Nurses and Clinicians. Protect your license and your sanity.

## Setup (Vercel project `the-vital-sign-protocol-healthcare-edition`)

Static `index.html` plus two Vercel functions in `api/`. No access code: the page opens directly.

| Env var | Value |
| --- | --- |
| `ADMIN_KEY` | Long random string (16+ chars) for `/api/vitals-export`. |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when a **private** Blob store is connected to the project. |

Never commit keys.

- `POST /api/vitals` (same-origin, rate-limited per IP) → stores one session (numeric/categorical fields only) at `vitals/{date}/{session_id}-{random}.json` in private Blob storage.
- `GET /api/vitals-export` with header `X-Admin-Key` (or `?key=`) → CSV of all sessions. `?date=YYYY-MM-DD` for one day.

Free-text fields (situation, lens rewrite, spark, boundary blanks) never leave the device. Presenter mode (`?mode=present`) never posts.
