// Small shared helpers: site URL, phone validation, rate limiting, email.

const SITE_URL = (process.env.SITE_URL ||
  (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : 'https://redant.co.uk')).replace(/\/+$/, '');

// UK numbers reserved by Ofcom for TV/drama use. They never connect, so we never show them.
const RESERVED_UK = [/^(44|0)2079460\d{3}$/, /^(44|0)1134960\d{3}$/, /^(44|0)1174960\d{3}$/, /^(44|0)1214960\d{3}$/,
  /^(44|0)1314960\d{3}$/, /^(44|0)1414960\d{3}$/, /^(44|0)1514960\d{3}$/, /^(44|0)1614960\d{3}$/, /^(44|0)1914980\d{3}$/,
  /^(44|0)1632960\d{3}$/, /^(44|0)7700900\d{3}$/, /^(44|0)3069990\d{3}$/, /^(44|0)8081570\d{3}$/, /^(44|0)9098790\d{3}$/];
function isUsablePhone(value) {
  const d = String(value || '').replace(/[^\d]/g, '');
  if (d.length < 9) return false;
  return !RESERVED_UK.some(r => r.test(d));
}

// Very small in-memory rate limiter (per server instance). Good enough to stop casual abuse.
const buckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const ip = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString();
    const key = name + ':' + ip;
    const now = Date.now();
    const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' });
    list.push(now); buckets.set(key, list);
    if (buckets.size > 5000) buckets.clear();
    next();
  };
}

// Email via Resend (https://resend.com). Does nothing, and never throws, if it is not configured.
async function sendMail({ to, subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from || !to) return { skipped: true };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, reply_to: replyTo || undefined }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) console.error('Mail send failed:', res.status, await res.text().catch(() => ''));
    return { ok: res.ok };
  } catch (e) {
    console.error('Mail error:', e.message);
    return { ok: false };
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Accept "example.co.uk", "http://example.co.uk/page" and return a safe https URL or null
function normaliseUrl(input) {
  let s = clip(input, 300);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.endsWith('.local') || h.endsWith('.internal')) return null;
    return u.toString();
  } catch (e) { return null; }
}

module.exports = { SITE_URL, isUsablePhone, rateLimit, sendMail, EMAIL_RE, clip, normaliseUrl };
