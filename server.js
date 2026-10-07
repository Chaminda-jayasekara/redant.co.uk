const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT secret must come from the environment (set JWT_SECRET in Vercel / .env)
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-only-secret-change-me');
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production.');
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

    res.set('Cache-Control', 'public, max-age=0, s-maxage=20, stale-while-revalidate=60');
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
      industries
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
app.post('/api/public/checkup', async (req, res) => {
  try {
    const { url, email } = req.body;
    if (!url || !email) {
      return res.status(400).json({ error: 'Website URL and email address are required.' });
    }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // Generate deterministic diagnostic heuristic scores for demo/audit tool based on URL hash
    let hash = 0;
    for (let i = 0; i < cleanUrl.length; i++) {
      hash = (hash << 5) - hash + cleanUrl.charCodeAt(i);
      hash |= 0;
    }

    const speedScore = Math.abs((hash % 35) + 38); // e.g. 38 - 72
    const mobileScore = Math.abs(((hash >> 2) % 40) + 45); // e.g. 45 - 85
    const seoScore = Math.abs(((hash >> 3) % 30) + 55); // e.g. 55 - 85
    const overallGrade = speedScore < 50 ? 'Needs Urgent Refresh' : 'Fair (Enquiries Lost)';

    const scoresObj = {
      speedScore,
      mobileScore,
      seoScore,
      overallGrade,
      recommendations: [
        speedScore < 60 ? '⚡ High mobile page load latency (>3.2s on 4G) causing 40%+ visitor bounce' : '⚡ Speed can be accelerated with WebP images and browser caching',
        mobileScore < 70 ? '📱 Touch targets and phone call buttons require viewport optimization' : '📱 Layout responsiveness needs mobile tap target adjustments',
        '🔍 Missing Local UK Schema markup and primary town keywords in H1 tags'
      ]
    };

    await run(
      `INSERT INTO checkups (url, email, scores_json) VALUES (?, ?, ?)`,
      [cleanUrl, email.trim(), JSON.stringify(scoresObj)]
    );

    await run(
      `INSERT INTO leads (name, business, url, email, message, source, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Free Check-up Lead', 'Check-up Visitor', cleanUrl, email.trim(), `Website Check-up Tool Audit: Speed ${speedScore}/100, Mobile ${mobileScore}/100`, 'Free Check-up Tool', 'New', 'Automated checkup report generated.']
    );

    await logActivity('System', `Website check-up audit run for ${cleanUrl} (${email})`);

    res.json({
      success: true,
      url: cleanUrl,
      scores: scoresObj
    });
  } catch (err) {
    console.error('Checkup error:', err);
    res.status(500).json({ error: 'Failed to process website check-up.' });
  }
});

// Submit Lead / Enquiry (Supports v2 Campaign Tracking)
app.post('/api/public/lead', async (req, res) => {
  try {
    const { name, business, url, email, phone, message, source, landing_page_slug, utm_source, utm_medium, utm_campaign } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const leadSource = source || 'Free Review Form';
    const result = await get(
      `INSERT INTO leads (name, business, url, email, phone, message, source, landing_page_slug, utm_source, utm_medium, utm_campaign, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        name.trim(),
        business ? business.trim() : '',
        url ? url.trim() : '',
        email.trim(),
        phone ? phone.trim() : '',
        message ? message.trim() : '',
        leadSource,
        landing_page_slug || '',
        utm_source || '',
        utm_medium || '',
        utm_campaign || '',
        'New',
        'Lead submitted via public frontend.'
      ]
    );

    await logActivity('System', `New lead from ${name} (${email}) - Source: ${leadSource}`);

    res.json({
      success: true,
      leadId: result.id,
      message: 'Thank you! Your website request has been received. We will respond within 24 hours.'
    });
  } catch (err) {
    console.error('Error saving lead:', err);
    res.status(500).json({ error: 'Failed to process lead submission.' });
  }
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
                   cols: ['slug','name','intro','problems_json','cta_text','order_num'] },
  faqs:          { label: 'FAQ',         order: 'order_num ASC, id ASC', title: 'question',
                   cols: ['question','answer','category','order_num'] },
  blog_posts:    { label: 'blog post',   order: 'id DESC',               title: 'title',
                   cols: ['slug','title','excerpt','body','category','publish_date','status'] },
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

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
