// api/vitals.js
// POST one completed session → private Vercel Blob at
//   vitals/{YYYY-MM-DD}/{session_id}-{random}.json
//
// Requires an active unit code in the X-License-Code header.
// Accepts ONLY the fields in FIELDS; anything else in the body is dropped.
// Every value is type- and range-checked, and strings must match a fixed
// enum or format, so free text can never be written even if a client sends it.

const { put } = require('@vercel/blob');
const { FIELDS, isActiveCode, clientIp, sameOrigin, readJson, makeLimiter } = require('./_lib/shared');

const posts = makeLimiter(120, 10 * 60 * 1000); // 120 sessions / 10 min / IP
const badCodes = makeLimiter(15, 10 * 60 * 1000);

const STATES = ['', 'Hyperarousal', 'Hypoarousal'];
const DRIVERS = ['', 'Perfectionist', 'Over-Committer', 'Imposter'];
const LENSES = ['', 'Threat', 'Observer', 'Architect'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function friction(v) {
  return Number.isInteger(v) && v >= 1 && v <= 10;
}

function isoTime(v) {
  return typeof v === 'string' && ISO_RE.test(v) && !isNaN(Date.parse(v));
}

// Returns a clean record, or null if anything is off.
function sanitize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const r = {};
  for (const f of FIELDS) r[f] = body[f];

  if (typeof r.session_id !== 'string' || !/^[A-Z0-9]{1,16}$/.test(r.session_id)) return null;
  if (!isoTime(r.started_at) || !isoTime(r.completed_at)) return null;
  if (Date.parse(r.completed_at) < Date.parse(r.started_at)) return null;
  if (!friction(r.pre_friction) || !friction(r.post_friction)) return null;
  if (!Number.isInteger(r.delta) || r.delta !== r.pre_friction - r.post_friction) return null;
  if (!STATES.includes(r.arousal_state)) return null;
  if (!DRIVERS.includes(r.driver)) return null;
  if (!LENSES.includes(r.lens)) return null;
  if (typeof r.source !== 'string' || !/^[a-z0-9-]{1,40}$/.test(r.source)) return null;
  return r;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }
  if (!sameOrigin(req)) return res.status(403).json({ ok: false });

  const ip = clientIp(req);
  if (badCodes.blocked(ip)) return res.status(429).json({ ok: false });
  if (!isActiveCode(req.headers['x-license-code'])) {
    badCodes.hit(ip);
    return res.status(401).json({ ok: false });
  }
  if (posts.hit(ip)) return res.status(429).json({ ok: false });

  let body;
  try {
    body = await readJson(req, 2048);
  } catch (e) {
    return res.status(400).json({ ok: false });
  }

  const record = sanitize(body);
  if (!record) return res.status(400).json({ ok: false });

  const day = new Date().toISOString().slice(0, 10);
  try {
    await put(`vitals/${day}/${record.session_id}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'application/json'
    });
  } catch (e) {
    console.error('[vitals] blob write failed:', e && e.message);
    return res.status(500).json({ ok: false });
  }
  return res.status(201).json({ ok: true });
};
