// api/verify-code.js
// POST { code } → { valid: true | false }
// Checks a unit code against VITALS_CODES (see api/_lib/shared.js) and its
// expiry date. Codes never ship to the browser.
//
// Only failed attempts count toward the rate limit, so a full room on one
// hospital IP can all load the page, while guessing codes gets cut off.

const { isActiveCode, clientIp, sameOrigin, readJson, makeLimiter } = require('./_lib/shared');

const failures = makeLimiter(15, 10 * 60 * 1000); // 15 wrong codes / 10 min / IP

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ valid: false });
  }
  if (!sameOrigin(req)) return res.status(403).json({ valid: false });

  const ip = clientIp(req);
  if (failures.blocked(ip)) return res.status(429).json({ valid: false });

  let body;
  try {
    body = await readJson(req, 1024);
  } catch (e) {
    return res.status(400).json({ valid: false });
  }

  const valid = isActiveCode(body && body.code);
  if (!valid) failures.hit(ip);
  return res.status(200).json({ valid });
};
