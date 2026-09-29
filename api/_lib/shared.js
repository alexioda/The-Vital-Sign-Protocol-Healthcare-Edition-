// api/_lib/shared.js
// Server-only helpers for the Vital Sign Protocol functions. The leading
// underscore keeps Vercel from deploying this folder as an endpoint.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   VITALS_CODES           JSON map of unit code → expiry date, e.g.
//                          {"RPC_STAFF":"2030-01-01","DEMO":"2026-12-31"}
//                          A code works until 00:00 UTC on its expiry date.
//   ADMIN_KEY              Long random string for /api/vitals-export.
//   BLOB_READ_WRITE_TOKEN  Added automatically when a Blob store is
//                          connected to the project.
// Never commit codes or keys to the repo.

const crypto = require('crypto');

/* ---------------- access codes ---------------- */

function loadCodes() {
  const raw = process.env.VITALS_CODES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string') out[k.trim().toUpperCase()] = v.trim();
    }
    return out;
  } catch (e) {
    console.error('[vitals] VITALS_CODES is not valid JSON');
    return {};
  }
}

function normalizeCode(code) {
  if (typeof code !== 'string') return '';
  const c = code.trim().toUpperCase();
  return c.length > 0 && c.length <= 64 ? c : '';
}

function isActiveCode(code) {
  const c = normalizeCode(code);
  if (!c) return false;
  const codes = loadCodes();
  if (!Object.prototype.hasOwnProperty.call(codes, c)) return false;
  const expires = new Date(codes[c]);
  if (isNaN(expires.getTime())) return false;
  return expires > new Date();
}

/* ---------------- request helpers ---------------- */

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}

// Browsers send Origin on POST. Refuse cross-site calls; allow same-host and
// non-browser clients (no Origin header).
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

async function readJson(req, maxBytes) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw && req.body === undefined) {
    raw = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
        if (data.length > maxBytes) reject(new Error('too large'));
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
  if (raw.length > maxBytes) throw new Error('too large');
  return raw ? JSON.parse(raw) : {};
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------------- rate limiting ----------------
   In-memory, per function instance. Best effort: it slows brute force and
   floods, it is not a hard guarantee across instances. A whole workshop room
   usually shares one hospital IP, so limits are sized for ~50 phones. */

function makeLimiter(limit, windowMs) {
  const hits = new Map();
  return {
    blocked(key) {
      const rec = hits.get(key);
      return !!rec && Date.now() < rec.reset && rec.n >= limit;
    },
    hit(key) {
      const now = Date.now();
      const rec = hits.get(key);
      if (!rec || now > rec.reset) {
        if (hits.size > 5000) hits.clear();
        hits.set(key, { n: 1, reset: now + windowMs });
        return 1 > limit;
      }
      rec.n += 1;
      return rec.n > limit;
    }
  };
}

/* ---------------- session records ----------------
   The only fields ever stored. No free text: every string is an enum or a
   fixed-format id/timestamp. */

const FIELDS = [
  'session_id', 'started_at', 'completed_at', 'pre_friction', 'post_friction',
  'delta', 'arousal_state', 'driver', 'lens', 'source'
];

module.exports = { FIELDS, isActiveCode, normalizeCode, clientIp, sameOrigin, readJson, safeEqual, makeLimiter };
