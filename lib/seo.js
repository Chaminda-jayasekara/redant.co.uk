// Per-URL title, description, canonical, robots and structured data (JSON-LD).
// The page content itself is drawn by public/app.js; this makes every URL
// carry its own search-engine metadata in the first HTML response.
const { SITE_URL, isUsablePhone } = require('./util');

const SERVICE_SLUGS = ['website-refresh', 'web-design', 'wordpress-developer', 'local-seo', 'website-care-plans', 'social-media-graphics'];
const SERVICE_DEFAULTS = {
  'website-refresh': ['48-Hour Website Refresh UK | £199 Fixed | RedAnt', 'Website refresh for UK small businesses. Modern, mobile-first and faster in 48 hours for a fixed £199.'],
  'web-design': ['Affordable Website Design UK | From £499 | RedAnt', 'Custom 5 or 10-page websites for UK small businesses from £499. Mobile-first, fast and fully owned by you.'],
  'wordpress-developer': ['WordPress Web Designer UK | Elementor Sites | RedAnt', 'WordPress and Elementor websites you can edit yourself, built fast and secure for UK small businesses.'],
  'local-seo': ['Local SEO UK | Google Maps Ranking | RedAnt', 'Local SEO for UK small businesses: Google Business Profile, local keywords and location pages.'],
  'website-care-plans': ['Website Maintenance Plans UK | £29/mo | RedAnt', 'Website care plans from £29 a month: hosting, daily backups, SSL, updates and security monitoring.'],
  'social-media-graphics': ['Facebook & Instagram Ad Graphics UK | RedAnt', 'Facebook and Instagram ad graphics, logo refinements and social templates for UK businesses from £99.']
};
const STATIC = {
  '/': ['home', 'Small Business Web Design UK | From £199 | RedAnt', 'Fast, mobile-friendly websites for UK small businesses. 48-hour refresh from £199 or a new site from £499. Free 24-hour website review.'],
  '/services': ['services', 'Web Design Services UK | Refresh, WordPress, SEO | RedAnt', 'Web design services for UK small businesses: 48-hour refresh, new websites, WordPress, local SEO, care plans and ad graphics.'],
  '/pricing': ['pricing', 'Web Design Prices UK 2026 | Fixed GBP | RedAnt', 'Clear, fixed web design prices in pounds: £199 refresh, £499 five-page site, £899 ten-page site and care plans from £29 a month.'],
  '/our-work': ['work', 'Our Work | UK Client Websites | RedAnt', 'Recent websites built and redesigned for small businesses, with links to the live sites.'],
  '/who-we-help': ['industries', 'Who We Help | Web Design for UK Small Business | RedAnt', 'Web design for UK clinics, tradespeople, coaches and pubs. Fast, mobile-friendly sites at fixed prices.'],
  '/free-review': ['review', 'Free Website Review in 24 Hours | RedAnt', 'Send your website address and get 3 specific, practical improvements to win more enquiries within 24 hours. Free, no obligation.'],
  '/about': ['about', 'About RedAnt | Web Design for UK Small Businesses', 'RedAnt is a remote web design studio working UK hours, building fast, fixed-price websites for small businesses.'],
  '/guides': ['blog', 'UK Web Design Guides | Costs, SEO & Mobile | RedAnt', 'Practical guides on website costs, mobile design and local SEO for UK small business owners.'],
  '/faq': ['faq', 'Web Design FAQs | Price, Ownership & Delivery | RedAnt', 'Answers on web design cost, 48-hour delivery, ownership, payments and how RedAnt works.'],
  '/contact': ['contact', 'Contact RedAnt | WhatsApp, Email & Form', 'Message RedAnt on WhatsApp, email or the contact form. We reply within one working hour in UK business hours.'],
  '/privacy': ['privacy', 'Privacy Policy | RedAnt', 'How RedAnt collects and uses your details under UK GDPR.'],
  '/cookies': ['cookies', 'Cookie Policy | RedAnt', 'How RedAnt uses essential and analytics cookies, and how to change your choice.'],
  '/terms': ['terms', 'Terms & Conditions | RedAnt', 'RedAnt payment terms, revisions and ownership of your website and code.']
};

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const jsonLd = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const trim = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

let cache = { at: 0, data: null };
async function loadData(db) {
  if (cache.data && Date.now() - cache.at < 30000) return cache.data;
  const [settingsRows, landing, industries, locations, posts, faqs] = await Promise.all([
    db.all(`SELECT key, value FROM settings`),
    db.all(`SELECT slug, meta_title, meta_desc FROM landing_pages WHERE status = 'published'`),
    db.all(`SELECT slug, name, h1, intro, meta_title, meta_desc FROM industries`),
    db.all(`SELECT slug, city, h1, intro, meta_title, meta_desc FROM locations`).catch(() => []),
    db.all(`SELECT slug, title, excerpt, category, publish_date FROM blog_posts WHERE status = 'published' ORDER BY id DESC`),
    db.all(`SELECT question, answer FROM faqs ORDER BY order_num ASC`)
  ]);
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });
  cache = { at: Date.now(), data: { settings, landing, industries, locations, posts, faqs } };
  return cache.data;
}

// Returns { status, view, title, description, ld: [] }
async function resolve(pathname, db) {
  const d = await loadData(db);
  const st = d.settings;
  let p = pathname.replace(/\/+$/, '') || '/';
  let hit = null;

  if (STATIC[p]) {
    const [view, title, desc] = STATIC[p];
    hit = { view, title, description: desc };
    if (p === '/') {
      if (st['seo.title']) hit.title = st['seo.title'];
      if (st['seo.description']) hit.description = st['seo.description'];
    }
  } else if (SERVICE_SLUGS.includes(p.slice(1))) {
    const slug = p.slice(1);
    const row = d.landing.find(l => l.slug === slug) || {};
    hit = { view: slug, title: row.meta_title || SERVICE_DEFAULTS[slug][0], description: row.meta_desc || SERVICE_DEFAULTS[slug][1] };
  } else if (p.startsWith('/web-design-for-')) {
    const slug = p.slice('/web-design-for-'.length);
    const row = d.industries.find(i => i.slug === slug);
    if (row) hit = { view: 'industry', title: row.meta_title || `Web Design for ${row.name} UK | RedAnt`, description: row.meta_desc || trim(row.intro, 155) };
  } else if (p.startsWith('/web-design-')) {
    const row = d.locations.find(l => l.slug === p.slice(1));
    if (row) hit = { view: 'location', title: row.meta_title || `Web Designer in ${row.city} | Fixed Prices | RedAnt`, description: row.meta_desc || trim(row.intro, 155) };
  } else if (p.startsWith('/guides/')) {
    const row = d.posts.find(x => x.slug === p.slice('/guides/'.length));
    if (row) hit = { view: 'guide', title: `${trim(row.title, 48)} | RedAnt`, description: trim(row.excerpt, 155), post: row };
  }

  if (!hit) return { status: 404, view: '404', title: 'Page not found | RedAnt', description: 'This page does not exist.', noindex: true, ld: [], canonical: null, settings: st, path: p };

  const url = SITE_URL + (p === '/' ? '/' : p);
  const ld = [];
  const org = {
    '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'RedAnt', url: SITE_URL + '/',
    logo: SITE_URL + '/assets/icon-512.png', image: SITE_URL + '/assets/og-image.png',
    description: 'Web design and development for UK small businesses: 48-hour website refreshes, new websites, WordPress, local SEO and care plans.',
    areaServed: { '@type': 'Country', name: 'United Kingdom' }, priceRange: '££',
    email: st.email || 'hello@redant.co.uk'
  };
  if (isUsablePhone(st.phone)) org.telephone = st.phone;
  ld.push(org);
  if (hit.view === 'faq' && d.faqs.length) {
    ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: d.faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) });
  }
  if (hit.post) {
    ld.push({ '@context': 'https://schema.org', '@type': 'Article', headline: hit.post.title, description: hit.post.excerpt,
      datePublished: hit.post.publish_date, author: { '@type': 'Organization', name: 'RedAnt' },
      publisher: { '@type': 'Organization', name: 'RedAnt', logo: { '@type': 'ImageObject', url: SITE_URL + '/assets/icon-512.png' } }, mainEntityOfPage: url });
  }
  if (p !== '/') {
    ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: hit.title.split('|')[0].trim(), item: url } ] });
  }
  return { status: 200, ...hit, canonical: url, ld, settings: st, path: p };
}

function render(template, r) {
  let html = template;
  const title = esc(r.title), desc = esc(r.description);
  html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${desc}">`);
  html = html.replace(/<meta\s+property="og:[^>]*>\s*/gi, '').replace(/<meta\s+name="twitter:[^>]*>\s*/gi, '');
  const extra = [];
  if (r.canonical) extra.push(`<link rel="canonical" href="${esc(r.canonical)}">`);
  if (r.noindex) extra.push('<meta name="robots" content="noindex, follow">');
  extra.push(
    '<meta property="og:type" content="website">', '<meta property="og:locale" content="en_GB">', '<meta property="og:site_name" content="RedAnt">',
    `<meta property="og:title" content="${title}">`, `<meta property="og:description" content="${desc}">`,
    r.canonical ? `<meta property="og:url" content="${esc(r.canonical)}">` : '',
    `<meta property="og:image" content="${SITE_URL}/assets/og-image.png">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">');
  const gsc = r.settings && r.settings['analytics.gsc_verification'];
  if (gsc) extra.push(`<meta name="google-site-verification" content="${esc(gsc)}">`);
  r.ld.forEach(o => extra.push(jsonLd(o)));
  return html.replace('</head>', '  ' + extra.filter(Boolean).join('\n  ') + '\n</head>');
}

async function sitemap(db) {
  const d = await loadData(db);
  const urls = Object.keys(STATIC).filter(k => !['/privacy', '/cookies', '/terms'].includes(k));
  SERVICE_SLUGS.forEach(s => urls.push('/' + s));
  d.industries.forEach(i => urls.push('/web-design-for-' + i.slug));
  d.locations.forEach(l => urls.push('/' + l.slug));
  d.posts.forEach(x => urls.push('/guides/' + x.slug));
  const body = urls.map(u => `  <url><loc>${esc(SITE_URL + (u === '/' ? '/' : u))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function clearCache() { cache = { at: 0, data: null }; }
module.exports = { resolve, render, sitemap, clearCache, SITE_URL };
