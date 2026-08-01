// api/content.js
// Vercel serverless function — returns the actual clinical protocol text.
// Previously this copy lived directly in index.html's contentMap render()
// functions, so viewing page source (or disabling JS) exposed every phase
// of the protocol regardless of the cipher — and the cipher itself was
// hardcoded in the same file. Now the copy only exists here and is served
// after verifying the signed session token issued by api/authenticate.js.
// The interactive shell (sliders, step navigation, audio toggle) stays in
// index.html; only the written protocol content is gated.
//
// SETUP: set SESSION_SECRET in this project's Vercel environment variables
// (same value doesn't need to match any other app's secret — each Vercel
// project is isolated). Until it's set, this endpoint returns a 500 and the
// protocol will not load, even with a correct cipher — DEVMODE continues to
// work in non-production deployments regardless, so local testing isn't
// blocked.
//
// Sessions are stored client-side in localStorage (not sessionStorage) so a
// buyer stays logged in on a given device across tabs/restarts for up to a
// year, whether they got in via the manual cipher or a Lemon Squeezy license
// key (see api/authenticate.js) — a new device still needs one of those
// entered once.

const crypto = require('crypto');

function isValidSessionToken(token) {
  // Non-production dev fallback — mirrors api/authenticate.js.
  if (token === 'dev' && process.env.VERCEL_ENV !== 'production') return true;

  const secret = process.env.SESSION_SECRET;
  if (!secret) return null; // "not configured" — distinct from "invalid"
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [issuedAt, signature] = parts;
  if (!/^\d+$/.test(issuedAt)) return false;

  const expected = crypto.createHmac('sha256', secret).update(issuedAt).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

  const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // sessions are remembered for a year
  const age = Date.now() - Number(issuedAt);
  return age >= 0 && age <= MAX_AGE_MS;
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers['x-session-token'];
  const valid = isValidSessionToken(token);

  if (valid === null) {
    return res.status(500).json({ error: 'Server configuration error: SESSION_SECRET is not set.' });
  }
  if (!valid) {
    return res.status(401).json({ error: 'Invalid or expired session. Please re-authenticate.' });
  }

  return res.status(200).json({ content: PROTOCOL_CONTENT });
};

const PROTOCOL_CONTENT = {
  intro: {
    badge: 'Clinical Edition',
    title: 'Vital Sign<br>Protocol.',
    body: 'Built for high-acuity medical and psychiatric teams. We maintain clinical safety without sacrificing empathy.'
  },
  assessment: {
    phase: 'Phase 01',
    title: 'The Triage',
    body: 'Quantify your friction and diagnose your current autonomic state before engaging with patients or colleagues.',
    sliderLabel: 'Friction Baseline',
    sliderSub: 'Quantify current somatic stress',
    sliderMinLabel: '1 (Regulated)',
    sliderMaxLabel: '10 (Overload)',
    statePrompt: 'Select Autonomic State (Required)',
    hyperarousalLabel: 'Hyperarousal (Sympathetic)',
    hyperarousalDesc: 'Racing heart, shallow breath, agitation, rushing. The "Fight or Flight" response.',
    hypoarousalLabel: 'Hypoarousal (Dorsal Vagal)',
    hypoarousalDesc: 'Numbness, fog, dissociation, exhaustion. The "Freeze or Fold" response.'
  },
  protocol: {
    phase: 'Phase 02',
    title: 'The Intervention',
    hyperarousal: {
      diagnosisTitle: 'Diagnosis: Sympathetic Overdrive',
      diagnosisBody: 'Your system is flooded with cortisol. You cannot out-think this state; you must manually apply the biological brakes before entering the clinical space.',
      step1Title: '1. The 90-Second Flush',
      step1Body: 'Do not speak. Take a sharp double-inhale through the nose, followed by a long, slow sigh through the mouth. Repeat for 90 seconds to metabolize the chemical dump.',
      step2Title: '2. Linear Override',
      step2Body: 'Panic operates in loops. Logic is a line. Name 3 physical objects in the room. State the exact time. Switch your brain from emotional computing to analytical computing.'
    },
    hypoarousal: {
      diagnosisTitle: 'Diagnosis: Dorsal Vagal Freeze',
      diagnosisBody: 'Your system has initiated a shutdown response to protect against perceived overwhelm. We need to gently up-regulate your nervous system back online.',
      step1Title: '1. The Somatic Anchor',
      step1Body: 'Change your physical temperature immediately. Splash cold water on your face or hold something freezing. This shocks the vagus nerve back into engagement.',
      step2Title: '2. Micro-Commitment',
      step2Body: 'Do not look at the entire shift. Focus only on the next 5 minutes. Execute one single, microscopic task to prove to your brain that you possess agency.'
    }
  },
  output: {
    phase: 'Phase 03',
    title: 'The Scrub-In',
    body: 'Surgeons wash their hands before touching a patient. You must wash your mind. Execute the scrub-in ritual and quantify your shift.',
    boundaryLabel: 'Psychological Boundary',
    acknowledgeLabel: 'I acknowledge my friction is currently:',
    actionLabel: 'But I am stepping into the clinical space. My sovereign action is to:',
    actionPlaceholder: 'maintain absolute presence...',
    auditLabel: 'Post-Protocol Audit',
    auditSub: 'Re-evaluate your somatic state',
    baselineLabel: 'Entry Baseline:'
  }
};
