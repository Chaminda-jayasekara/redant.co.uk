const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('./db');
const seo = require('./lib/seo');
const { SITE_URL, isUsablePhone, rateLimit, sendMail, EMAIL_RE, clip, normaliseUrl } = require('./lib/util');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT secret must come from the environment (set JWT_SECRET in Vercel / .env)
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-only-secret-change-me');
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production.');
}

app.set('trust proxy', true);

// One domain only: set CANONICAL_HOST (e.g. redant.co.uk) and every other host is 301-redirected to it.
app.use((req, res, next) => {
  const want = process.env.CANONICAL_HOST;
  const host = (req.headers.host || '').split(':')[0];
  if (want && host && host !== want && host !== 'localhost' && !host.endsWith('.vercel.app')) {
    return res.redirect(301, `https://${want}${req.originalUrl}`);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Keep the raw template, admin and API out of search results
app.use((req, res, next) => {
  if (req.path === '/index.html' || req.path.startsWith('/admin') || req.path.startsWith('/api/')) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/api/public/meta', async (req, res) => {
  try {
    const r = await seo.resolve(String(req.query.path || '/').split('?')[0], { all });
    res.set('Cache-Control', 'public, max-age=0, s-maxage=20');
    res.json({ title: r.title, description: r.description, canonical: r.canonical, status: r.status });
  } catch (e) { res.status(500).json({}); }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});
app.get('/sitemap.xml', async (req, res) => {
  try { res.type('application/xml').send(await seo.sitemap({ all })); }
  catch (e) { console.error(e); res.status(500).send('Sitemap unavailable'); }
});

// JWT Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token missing.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Logging helper
async function logActivity(user, action) {
  try {
    await run(`INSERT INTO activity_log ("user", action) VALUES (?, ?)`, [user, action]);
  } catch (e) {
    console.error('Failed to log activity', e);
  }
}

/* ==========================================================================
   PUBLIC API ENDPOINTS (v2 Architecture)
   ========================================================================== */

// Get combined site content
app.get('/api/public/content', async (req, res) => {
  try {
    const settingsRows = await all(`SELECT key, value FROM settings`);
    const settings = {};
    settingsRows.forEach(row => { settings[row.key] = row.value; });

    const activeOffer = await get(`SELECT * FROM offers WHERE active = 1 ORDER BY id DESC LIMIT 1`);
    const services = await all(`SELECT * FROM services ORDER BY order_num ASC`);
    const landingPages = await all(`SELECT * FROM landing_pages WHERE status = 'published'`);
    const pricingPlans = await all(`SELECT * FROM pricing_plans ORDER BY order_num ASC`);
    const projects = await all(`SELECT * FROM projects ORDER BY order_num ASC`);
    const testimonials = await all(`SELECT * FROM testimonials ORDER BY order_num ASC`);
    const faqs = await all(`SELECT * FROM faqs ORDER BY order_num ASC`);
    const blogPosts = await all(`SELECT * FROM blog_posts WHERE status = 'published' ORDER BY id DESC`);
    const industries = await all(`SELECT * FROM industries ORDER BY order_num ASC`);
    const locations = await all(`SELECT * FROM locations ORDER BY order_num ASC`).catch(() => []);

    res.set('Cache-Control', 'public, max-age=0, s-maxage=20, stale-while-revalidate=60');
    // A real phone number only: never expose a reserved/non-working one
    if (settings.phone && !isUsablePhone(settings.phone)) delete settings.phone;
    res.json({
      settings,
      offer: activeOffer || { label: 'launch offer', offer_price: 199, regular_price: 349, active: 1 },
      services,
      landingPages,
      pricingPlans,
      projects,
      testimonials,
      faqs,
      blogPosts,
      industries,
      locations
    });
  } catch (err) {
    console.error('Error fetching public content:', err);
    res.status(500).json({ error: 'Failed to load content' });
  }
});

// Get Individual Service Landing Page Data
app.get('/api/public/landing/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = await get(`SELECT * FROM landing_pages WHERE slug = ?`, [slug]);
    const service = await get(`SELECT * FROM services WHERE slug = ?`, [slug]);
    const activeOffer = await get(`SELECT * FROM offers WHERE active = 1 ORDER BY id DESC LIMIT 1`);

    if (!page) {
      return res.status(404).json({ error: 'Landing page not found' });
    }

    res.json({
      page,
      service,
      offer: activeOffer
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landing page' });
  }
});

// Interactive Website Check-up Tool Engine
// ---------- shared: save a lead, notify you, auto-reply to the lead ----------
async function saveLead({ name, business, url, email, phone, message, source, slug, utm }) {
  const row = await get(
    `INSERT INTO leads (name, business, url, email, phone, message, source, landing_page_slug, utm_source, utm_medium, utm_campaign, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [name, business || '', url || '', email, phone || '', message || '', source, slug || '', utm.source || '', utm.medium || '', utm.campaign || '', 'New', 'Lead submitted via public website.']
  );
  await logActivity('System', `New lead from ${name} (${email}) - Source: ${source}`);
  return row.id;
}

async function notifyLead(lead) {
  try {
    const st = await all(`SELECT key, value FROM settings WHERE key IN ('email')`);
    const to = process.env.NOTIFY_EMAIL || (st[0] && st[0].value) || 'hello@redant.co.uk';
    await sendMail({
      to, replyTo: lead.email,
      subject: `New lead: ${lead.name} (${lead.source})`,
      text: `Name: ${lead.name}\nEmail: ${lead.email}\nPhone: ${lead.phone || '-'}\nWebsite: ${lead.url || '-'}\nSource: ${lead.source}\nMessage: ${lead.message || '-'}\n`
    });
  } catch (e) { console.error('notify error', e.message); }
}

async function autoReply(lead) {
  const first = lead.name && lead.name !== 'Website visitor' ? lead.name.split(' ')[0] : 'there';
  const site = lead.url ? ` ${lead.url}` : ' your website';
  const text = lead.source === 'Contact Page Form'
    ? `Hi ${first},\n\nThanks for your message. I'll reply within one working hour during UK business hours (Mon to Fri, 8am to 6pm GMT).\n\nChaminda\nRedAnt`
    : `Hi ${first},\n\nThanks for sending${site}. Your free review is being prepared and will reach you within 24 hours. Want it sooner? Reply to this email or message me on WhatsApp.\n\nChaminda\nRedAnt`;
  await sendMail({ to: lead.email, subject: 'Your free website review from RedAnt', text, replyTo: process.env.NOTIFY_EMAIL || undefined });
}

app.post('/api/public/lead', rateLimit('lead', 8, 10 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    const email = clip(b.email, 200);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    const url = b.url ? (normaliseUrl(b.url) || clip(b.url, 300)) : '';
    const name = clip(b.name, 120) || 'Website visitor';
    if (name === 'Website visitor' && !url) return res.status(400).json({ error: 'Please tell us your name or your website address.' });

    const lead = {
      name, business: clip(b.business, 160), url, email, phone: clip(b.phone, 40), message: clip(b.message, 2000),
      source: clip(b.source, 80) || 'Free Review Form', slug: clip(b.landing_page_slug, 80),
      utm: { source: clip(b.utm_source, 80), medium: clip(b.utm_medium, 80), campaign: clip(b.utm_campaign, 80) }
    };
    const leadId = await saveLead(lead);
    // Fire and forget: do not make the visitor wait for email delivery
    Promise.all([notifyLead(lead), autoReply(lead)]).catch(() => {});

    res.json({ success: true, leadId, name: name === 'Website visitor' ? '' : name.split(' ')[0],
      message: 'Thanks! Your review is on its way within 24 hours.' });
  } catch (err) {
    console.error('Error saving lead:', err);
    res.status(500).json({ error: 'Failed to process lead submission.' });
  }
});

// ---------- Free website health check: REAL scores from Google PageSpeed Insights ----------
const stripMd = s => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
function pickFixes(lh) {
  const audits = lh.audits || {};
  const weights = {};
  Object.values(lh.categories || {}).forEach(cat => (cat.auditRefs || []).forEach(r => { weights[r.id] = Math.max(weights[r.id] || 0, r.weight || 0); }));
  const list = Object.values(audits)
    .filter(a => a && typeof a.score === 'number' && a.score < 0.9 && !['notApplicable', 'informative', 'manual'].includes(a.scoreDisplayMode))
    .map(a => ({ a, rank: (1 - a.score) * (weights[a.id] || 0.5) }))
    .sort((x, y) => y.rank - x.rank).slice(0, 3);
  return list.map(({ a }) => ({ title: a.title, detail: a.displayValue ? `${a.displayValue}. ${stripMd(a.description).split('. ')[0]}.` : stripMd(a.description).split('. ')[0] + '.' }));
}

app.post('/api/public/checkup', rateLimit('checkup', 5, 10 * 60 * 1000), async (req, res) => {
  const email = clip((req.body || {}).email, 200);
  const url = normaliseUrl((req.body || {}).url);
  if (!url) return res.status(400).json({ error: 'Please enter a valid website address, for example yourbusiness.co.uk.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter your email address to receive the full report.' });

  const lead = { name: 'Website visitor', business: '', url, email, phone: '', message: '', source: 'Free Check-up Tool', slug: 'home', utm: {} };
  let scores = null, fixes = [];
  try {
    const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    api.searchParams.set('url', url); api.searchParams.set('strategy', 'mobile');
    ['performance', 'accessibility', 'seo', 'best-practices'].forEach(c => api.searchParams.append('category', c));
    if (process.env.PAGESPEED_API_KEY) api.searchParams.set('key', process.env.PAGESPEED_API_KEY);
    const r = await fetch(api, { signal: AbortSignal.timeout(55000) });
    if (!r.ok) throw new Error('PageSpeed responded ' + r.status);
    const lh = (await r.json()).lighthouseResult;
    if (!lh || !lh.categories) throw new Error('No Lighthouse data');
    const pct = c => (lh.categories[c] && typeof lh.categories[c].score === 'number') ? Math.round(lh.categories[c].score * 100) : null;
    scores = { speed: pct('performance'), accessibility: pct('accessibility'), seo: pct('seo'), bestPractices: pct('best-practices') };
    fixes = pickFixes(lh);
  } catch (err) {
    console.error('Checkup scan failed:', err.message);
  }

  try {
    lead.message = scores ? `Health check: speed ${scores.speed}, accessibility ${scores.accessibility}, SEO ${scores.seo}` : 'Health check requested but the scan failed. Send the review manually.';
    await saveLead(lead);
    if (scores) await run(`INSERT INTO checkups (url, email, scores_json) VALUES (?, ?, ?)`, [url, email, JSON.stringify({ scores, fixes })]);
    notifyLead(lead).catch(() => {});
  } catch (e) { console.error('Checkup save error', e.message); }

  if (!scores) {
    return res.status(502).json({ error: "We couldn't scan that website just now. We've saved your details and will send your free review within 24 hours." });
  }
  const grade = scores.speed < 50 ? 'Needs attention' : scores.speed < 90 ? 'Room to improve' : 'Good';
  sendMail({
    to: email, subject: `Your RedAnt website health check for ${url}`,
    text: `Hi,\n\nHere are the results for ${url} (mobile):\n\nSpeed: ${scores.speed}/100\nAccessibility: ${scores.accessibility}/100\nSEO basics: ${scores.seo}/100\n\nThe 3 fixes that matter most:\n${fixes.map((f, i) => `${i + 1}. ${f.title}. ${f.detail}`).join('\n')}\n\nWant these fixed? Reply to this email or message me on WhatsApp for a free 24-hour review.\n\nChaminda\nRedAnt`
  }).catch(() => {});
  res.json({ success: true, url, grade, scores, fixes });
});

/* ==========================================================================
   ADMIN ENDPOINTS
   ========================================================================== */

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await logActivity(user.email, 'Admin login successful');

    res.json({ token, user: { email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error during authentication' });
  }
});

// Admin Dashboard Summary
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  try {
    const totalLeads = await get(`SELECT count(*) as count FROM leads`);
    const newLeads = await get(`SELECT count(*) as count FROM leads WHERE status = 'New'`);
    const reviewedLeads = await get(`SELECT count(*) as count FROM leads WHERE status = 'Reviewed'`);
    const wonLeads = await get(`SELECT count(*) as count FROM leads WHERE status = 'Won'`);
    const lostLeads = await get(`SELECT count(*) as count FROM leads WHERE status = 'Lost'`);
    const totalCheckups = await get(`SELECT count(*) as count FROM checkups`);

    const recentLeads = await all(`SELECT * FROM leads ORDER BY id DESC LIMIT 5`);
    const logs = await all(`SELECT * FROM activity_log ORDER BY id DESC LIMIT 10`);
    const activeOffer = await get(`SELECT * FROM offers WHERE active = 1 ORDER BY id DESC LIMIT 1`);

    res.json({
      stats: {
        total: totalLeads.count,
        new: newLeads.count,
        reviewed: reviewedLeads.count,
        won: wonLeads.count,
        lost: lostLeads.count,
        checkups: totalCheckups.count
      },
      recentLeads,
      logs,
      offer: activeOffer
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Admin Landing Pages Manager & Ad Version Toggle
app.get('/api/admin/landing-pages', authMiddleware, async (req, res) => {
  try {
    const pages = await all(`SELECT * FROM landing_pages ORDER BY id ASC`);
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landing pages' });
  }
});

app.put('/api/admin/landing/:slug', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.params;
    const { headline, subtext, cta_text, price_from, ad_version } = req.body;

    await run(
      `UPDATE landing_pages SET headline = ?, subtext = ?, cta_text = ?, price_from = ?, ad_version = ? WHERE slug = ?`,
      [headline, subtext, cta_text, price_from, ad_version ? 1 : 0, slug]
    );

    await logActivity(req.user.email, `Updated Landing Page: ${slug} (Ad Version: ${ad_version})`);
    res.json({ success: true, message: `Landing page /${slug} updated!` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update landing page' });
  }
});

// Admin Campaign Tracking Breakdown
app.get('/api/admin/campaigns', authMiddleware, async (req, res) => {
  try {
    const utmBreakdown = await all(
      `SELECT utm_source, utm_medium, utm_campaign, count(*) as lead_count FROM leads WHERE utm_source != '' GROUP BY utm_source, utm_medium, utm_campaign`
    );
    const pageBreakdown = await all(
      `SELECT source, count(*) as lead_count FROM leads GROUP BY source`
    );
    res.json({ utmBreakdown, pageBreakdown });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load campaigns' });
  }
});

// Admin Leads & CSV Export
app.get('/api/admin/leads', authMiddleware, async (req, res) => {
  try {
    const statusFilter = req.query.status;
    let sql = `SELECT * FROM leads ORDER BY id DESC`;
    let params = [];

    if (statusFilter && statusFilter !== 'All') {
      sql = `SELECT * FROM leads WHERE status = ? ORDER BY id DESC`;
      params = [statusFilter];
    }

    const leads = await all(sql, params);
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

app.put('/api/admin/leads/:id', authMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;

    await run(`UPDATE leads SET status = ?, notes = ? WHERE id = ?`, [status, notes, id]);
    await logActivity(req.user.email, `Updated lead ID #${id} to status: ${status}`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

app.delete('/api/admin/leads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await run(`DELETE FROM leads WHERE id = ?`, [id]);
    await logActivity(req.user.email, `Deleted lead ID #${id} (GDPR deletion)`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

app.get('/api/admin/leads/export', authMiddleware, async (req, res) => {
  try {
    const leads = await all(`SELECT * FROM leads ORDER BY id DESC`);
    let csv = 'ID,Name,Business,URL,Email,Phone,Source,UTM Source,UTM Medium,UTM Campaign,Status,Created At,Notes\n';
    leads.forEach(l => {
      const cleanNotes = (l.notes || '').replace(/"/g, '""');
      csv += `"${l.id ?? ''}","${l.name ?? ''}","${l.business ?? ''}","${l.url ?? ''}","${l.email ?? ''}","${l.phone ?? ''}","${l.source ?? ''}","${l.utm_source ?? ''}","${l.utm_medium ?? ''}","${l.utm_campaign ?? ''}","${l.status ?? ''}","${l.created_at ? new Date(l.created_at).toISOString() : ''}","${cleanNotes}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=RedAnt_Leads.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Launch Offer Controller
app.get('/api/admin/offer', authMiddleware, async (req, res) => {
  try {
    const offer = await get(`SELECT * FROM offers ORDER BY id DESC LIMIT 1`);
    res.json(offer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
});

app.put('/api/admin/offer', authMiddleware, async (req, res) => {
  try {
    const { label, offer_price, regular_price, active } = req.body;
    const existing = await get(`SELECT id FROM offers ORDER BY id DESC LIMIT 1`);

    if (existing) {
      await run(
        `UPDATE offers SET label = ?, offer_price = ?, regular_price = ?, active = ? WHERE id = ?`,
        [label, offer_price, regular_price, active ? 1 : 0, existing.id]
      );
    } else {
      await run(
        `INSERT INTO offers (label, offer_price, regular_price, active) VALUES (?, ?, ?, ?)`,
        [label, offer_price, regular_price, active ? 1 : 0]
      );
    }

    await logActivity(req.user.email, `Updated Launch Offer to £${offer_price} (Active: ${active})`);
    res.json({ success: true, message: 'Launch offer updated across website!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

/* ==========================================================================
   CONTENT MANAGEMENT (admin): site text/settings + every content table
   ========================================================================== */

// --- Site text & contact settings (key/value) ---
app.get('/api/admin/settings', authMiddleware, async (req, res) => {
  try {
    const rows = await all(`SELECT key, value FROM settings`);
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Body: { settings: { key: "value", ... }, remove: ["key", ...] }
// "remove" resets a field back to the default text written in index.html.
app.put('/api/admin/settings', authMiddleware, async (req, res) => {
  try {
    const incoming = req.body.settings || {};
    const remove = Array.isArray(req.body.remove) ? req.body.remove : [];
    const keys = Object.keys(incoming);
    if (keys.length > 500 || remove.length > 500) return res.status(400).json({ error: 'Too many fields' });

    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 120) continue;
      const value = incoming[key] === null ? '' : String(incoming[key]);
      if (value.length > 50000) return res.status(400).json({ error: `Value for "${key}" is too long` });
      await run(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }
    for (const key of remove) {
      await run(`DELETE FROM settings WHERE key = ?`, [String(key)]);
    }
    seo.clearCache();
    await logActivity(req.user.email, `Updated site content (${keys.length} saved, ${remove.length} reset)`);
    res.json({ success: true, message: 'Site content saved. It is live on the website now.' });
  } catch (err) {
    console.error('Settings save error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// --- Generic editor for each content table (whitelisted tables and columns only) ---
const CONTENT_TABLES = {
  services:      { label: 'service',     order: 'order_num ASC, id ASC', title: 'name',
                   cols: ['slug','name','short_desc','long_desc','price_from','features_json','not_included_json','process_json','icon','path_card_text','order_num'] },
  pricing_plans: { label: 'pricing plan', order: 'order_num ASC, id ASC', title: 'name',
                   cols: ['name','price','billing_type','badge','features_json','order_num'] },
  projects:      { label: 'project',     order: 'order_num ASC, id ASC', title: 'name',
                   cols: ['slug','name','url','industry','region','desc','initial','featured','built_at_webpixel','case_study_json','order_num'] },
  testimonials:  { label: 'testimonial', order: 'order_num ASC, id ASC', title: 'client_name',
                   cols: ['client_name','business','town','quote','rating','featured','order_num'] },
  industries:    { label: 'industry',    order: 'order_num ASC, id ASC', title: 'name',
                   cols: ['slug','name','h1','intro','problems_json','faqs_json','cta_text','meta_title','meta_desc','order_num'] },
  faqs:          { label: 'FAQ',         order: 'order_num ASC, id ASC', title: 'question',
                   cols: ['question','answer','category','order_num'] },
  blog_posts:    { label: 'blog post',   order: 'id DESC',               title: 'title',
                   cols: ['slug','title','excerpt','body','category','publish_date','status'] },
  locations:     { label: 'city page',   order: 'order_num ASC, id ASC', title: 'city',
                   cols: ['slug','city','h1','intro','local_example','meta_title','meta_desc','order_num'] },
  landing_pages: { label: 'service page', order: 'id ASC',               title: 'title',
                   cols: ['slug','title','headline','subtext','cta_text','price_from','ad_version','meta_title','meta_desc','status'] }
};
const INT_COLS = new Set(['price_from','order_num','rating','featured','built_at_webpixel','ad_version']);

function contentTable(req, res, next) {
  const cfg = Object.prototype.hasOwnProperty.call(CONTENT_TABLES, req.params.table) ? CONTENT_TABLES[req.params.table] : null;
  if (!cfg) return res.status(404).json({ error: 'Unknown content type' });
  req.cfg = cfg;
  req.table = req.params.table;
  next();
}

function cleanValue(col, v) {
  if (INT_COLS.has(col)) {
    if (v === true) return 1;
    if (v === false) return 0;
    if (v === '' || v === null || v === undefined) return col === 'price_from' ? null : 0;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  if (v === null || v === undefined) return '';
  const str = String(v);
  if (str.length > 100000) throw new Error(`Value for "${col}" is too long`);
  return str;
}

function slugify(text) {
  return String(text || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

function pickCols(cfg, body) {
  const out = {};
  cfg.cols.forEach(col => {
    if (Object.prototype.hasOwnProperty.call(body, col)) out[col] = cleanValue(col, body[col]);
  });
  return out;
}

const q = col => `"${col}"`; // quote identifiers ("desc" is reserved in Postgres)

app.get('/api/admin/content/:table', authMiddleware, contentTable, async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM ${req.table} ORDER BY ${req.cfg.order}`);
    res.json(rows);
  } catch (err) {
    console.error('Content list error:', err);
    res.status(500).json({ error: 'Failed to load content' });
  }
});

app.post('/api/admin/content/:table', authMiddleware, contentTable, async (req, res) => {
  try {
    const data = pickCols(req.cfg, req.body || {});
    const hasSlug = req.cfg.cols.includes('slug');
    const titleVal = data[req.cfg.title];
    if (!titleVal) return res.status(400).json({ error: `Please fill in "${req.cfg.title}"` });

    if (req.cfg.cols.includes('order_num') && data.order_num === undefined) {
      const max = await get(`SELECT COALESCE(MAX(order_num), 0) AS m FROM ${req.table}`);
      data.order_num = (max ? max.m : 0) + 1;
    }
    if (req.table === 'blog_posts' && !data.publish_date) data.publish_date = new Date().toISOString().slice(0, 10);
    if (req.table === 'blog_posts' && !data.status) data.status = 'published';
    if (req.table === 'projects' && !data.initial) data.initial = String(titleVal).charAt(0).toUpperCase();

    const baseSlug = hasSlug ? slugify(data.slug || titleVal) : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (hasSlug) data.slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const cols = Object.keys(data);
      try {
        const row = await get(
          `INSERT INTO ${req.table} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING *`,
          cols.map(c => data[c])
        );
        seo.clearCache();
        await logActivity(req.user.email, `Added ${req.cfg.label}: ${titleVal}`);
        return res.json({ success: true, row });
      } catch (err) {
        if (err.code === '23505' && hasSlug) continue; // slug already used, retry with a suffix
        throw err;
      }
    }
    res.status(409).json({ error: 'Could not create a unique slug' });
  } catch (err) {
    console.error('Content create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create item' });
  }
});

app.put('/api/admin/content/:table/:id', authMiddleware, contentTable, async (req, res) => {
  try {
    const data = pickCols(req.cfg, req.body || {});
    const cols = Object.keys(data);
    if (!cols.length) return res.status(400).json({ error: 'Nothing to update' });
    const row = await get(
      `UPDATE ${req.table} SET ${cols.map(c => `${q(c)} = ?`).join(', ')} WHERE id = ? RETURNING *`,
      [...cols.map(c => data[c]), parseInt(req.params.id, 10)]
    );
    if (!row) return res.status(404).json({ error: 'Item not found' });
    seo.clearCache();
    await logActivity(req.user.email, `Edited ${req.cfg.label}: ${row[req.cfg.title] || '#' + req.params.id}`);
    res.json({ success: true, row });
  } catch (err) {
    console.error('Content update error:', err);
    res.status(500).json({ error: err.code === '23505' ? 'That slug is already used by another item' : (err.message || 'Failed to save') });
  }
});

app.delete('/api/admin/content/:table/:id', authMiddleware, contentTable, async (req, res) => {
  try {
    await run(`DELETE FROM ${req.table} WHERE id = ?`, [parseInt(req.params.id, 10)]);
    seo.clearCache();
    await logActivity(req.user.email, `Deleted ${req.cfg.label} #${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Content delete error:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Catch-all route to serve public frontend or admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Every public page: same app shell, but each URL gets its own title, description, canonical and schema.
const TEMPLATE = path.join(__dirname, 'public', 'index.html');
let templateCache = null;
app.use(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) return res.status(404).type('text/plain').send('Not found');
  try {
    if (req.path.length > 1 && req.path.endsWith('/')) return res.redirect(301, req.path.replace(/\/+$/, '') + (req.url.slice(req.path.length) || ''));
    if (!templateCache || process.env.NODE_ENV !== 'production') templateCache = fs.readFileSync(TEMPLATE, 'utf8');
    const r = await seo.resolve(req.path, { all });
    res.status(r.status).set('Content-Type', 'text/html; charset=utf-8').send(seo.render(templateCache, r));
  } catch (err) {
    console.error('Page render error:', err);
    res.status(200).sendFile(TEMPLATE);
  }
});

// Export the app for Vercel (see api/index.js).
module.exports = app;

// Run a normal server only when started directly: node server.js
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('==================================================');
    console.log('RedAnt UK Full Web Application & Backend Active');
    console.log(`Public Website: http://localhost:${PORT}`);
    console.log(`Admin Panel:    http://localhost:${PORT}/admin`);
    console.log('==================================================');
  });
}
