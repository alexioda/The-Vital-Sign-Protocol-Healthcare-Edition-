// api/vitals-export.js
// GET → every stored session as CSV.
// Auth: ADMIN_KEY, sent as the X-Admin-Key header or ?key=… (handy in a
// browser, but it lands in browser history — prefer the header).
// Optional ?date=YYYY-MM-DD returns one day only.

const { list, get } = require('@vercel/blob');
const { FIELDS, clientIp, safeEqual, makeLimiter } = require('./_lib/shared');

const failures = makeLimiter(10, 15 * 60 * 1000); // 10 wrong keys / 15 min / IP

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Stored values are enums/numbers/ids, but never let a cell start a formula.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function readBlob(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const ip = clientIp(req);
  if (failures.blocked(ip)) return res.status(429).send('Too many attempts');

  const expected = process.env.ADMIN_KEY;
  const url = new URL(req.url, 'http://localhost');
  const given = req.headers['x-admin-key'] || url.searchParams.get('key') || '';
  if (!expected || expected.length < 16 || !given || !safeEqual(given, expected)) {
    failures.hit(ip);
    return res.status(401).send('Unauthorized');
  }

  const date = url.searchParams.get('date');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send('date must be YYYY-MM-DD');
  const prefix = date ? `vitals/${date}/` : 'vitals/';

  try {
    const pathnames = [];
    let cursor;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      page.blobs.forEach(b => pathnames.push(b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const rows = [];
    for (let i = 0; i < pathnames.length; i += 20) {
      const batch = await Promise.all(pathnames.slice(i, i + 20).map(p => readBlob(p).catch(() => null)));
      batch.forEach(r => { if (r) rows.push(r); });
    }
    rows.sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)));

    const lines = [FIELDS.join(',')];
    rows.forEach(r => lines.push(FIELDS.map(f => csvCell(r[f])).join(',')));

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vitals-${date || 'all'}-${stamp}.csv"`);
    return res.status(200).send(lines.join('\r\n') + '\r\n');
  } catch (e) {
    console.error('[vitals-export] failed:', e && e.message);
    return res.status(500).send('Export failed');
  }
};
