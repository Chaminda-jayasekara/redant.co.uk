const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'redant.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDB() {
  db.serialize();

  // 1. Users
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'Admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 2. Settings
  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // 3. Offers
  await run(`CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    offer_price INTEGER,
    regular_price INTEGER,
    active INTEGER DEFAULT 1,
    end_date TEXT
  )`);

  // 4. Services
  await run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    name TEXT,
    short_desc TEXT,
    long_desc TEXT,
    price_from INTEGER,
    features_json TEXT,
    not_included_json TEXT,
    process_json TEXT,
    icon TEXT,
    path_card_text TEXT,
    order_num INTEGER DEFAULT 0
  )`);

  // 5. Pricing Plans
  await run(`CREATE TABLE IF NOT EXISTS pricing_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price TEXT,
    billing_type TEXT,
    badge TEXT,
    features_json TEXT,
    order_num INTEGER DEFAULT 0
  )`);

  // 6. Projects
  await run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    name TEXT,
    url TEXT,
    industry TEXT,
    region TEXT,
    desc TEXT,
    initial TEXT,
    featured INTEGER DEFAULT 1,
    preview_allowed INTEGER DEFAULT 1,
    built_at_webpixel INTEGER DEFAULT 0,
    case_study_json TEXT,
    order_num INTEGER DEFAULT 0
  )`);

  // 7. Testimonials
  await run(`CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT,
    business TEXT,
    town TEXT,
    quote TEXT,
    rating INTEGER DEFAULT 5,
    featured INTEGER DEFAULT 1,
    order_num INTEGER DEFAULT 0
  )`);

  // 8. Industries
  await run(`CREATE TABLE IF NOT EXISTS industries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    name TEXT,
    intro TEXT,
    problems_json TEXT,
    cta_text TEXT,
    order_num INTEGER DEFAULT 0
  )`);

  // 9. Blog Posts
  await run(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    title TEXT,
    excerpt TEXT,
    body TEXT,
    category TEXT,
    publish_date TEXT,
    status TEXT DEFAULT 'published'
  )`);

  // 10. FAQs
  await run(`CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    answer TEXT,
    category TEXT,
    order_num INTEGER DEFAULT 0
  )`);

  // 11. Leads (Updated for v2 Campaign Tracking)
  await run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    business TEXT,
    url TEXT,
    email TEXT,
    phone TEXT,
    message TEXT,
    source TEXT,
    landing_page_slug TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    status TEXT DEFAULT 'New',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migrations for existing databases
  await run(`ALTER TABLE leads ADD COLUMN landing_page_slug TEXT`).catch(() => {});
  await run(`ALTER TABLE leads ADD COLUMN utm_source TEXT`).catch(() => {});
  await run(`ALTER TABLE leads ADD COLUMN utm_medium TEXT`).catch(() => {});
  await run(`ALTER TABLE leads ADD COLUMN utm_campaign TEXT`).catch(() => {});

  // 12. Landing Pages (New for v2)
  await run(`CREATE TABLE IF NOT EXISTS landing_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    title TEXT,
    headline TEXT,
    subtext TEXT,
    cta_text TEXT,
    price_from INTEGER,
    ad_version INTEGER DEFAULT 0,
    blocks_json TEXT,
    status TEXT DEFAULT 'published',
    meta_title TEXT,
    meta_desc TEXT
  )`);

  // 13. Free Website Checkups (New for v2)
  await run(`CREATE TABLE IF NOT EXISTS checkups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    email TEXT,
    scores_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 14. Activity Log
  await run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed default Admin User if not exists
  const existingUser = await get(`SELECT * FROM users WHERE email = ?`, ['admin@redant.co.uk']);
  if (!existingUser) {
    const hash = await bcrypt.hash('redantadmin123!', 10);
    await run(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`, [
      'admin@redant.co.uk',
      hash,
      'Admin'
    ]);
  }

  // Seed default Offer
  const existingOffer = await get(`SELECT * FROM offers LIMIT 1`);
  if (!existingOffer) {
    await run(`INSERT INTO offers (label, offer_price, regular_price, active) VALUES (?, ?, ?, ?)`, [
      'launch offer',
      199,
      349,
      1
    ]);
  }

  // Seed default Settings
  const settingsData = {
    business_name: 'RedAnt',
    tagline: 'Websites that win customers, built fast, priced fairly',
    email: 'hello@redant.co.uk',
    alt_email: 'redantdesigners@gmail.com',
    phone: '+44 20 7946 0912',
    whatsapp: '+94766441645',
    uk_hours: 'Mon - Fri: 8:00 AM - 6:00 PM GMT (Instant WhatsApp Response)',
    location_text: 'Serving UK Small Businesses & Sole Traders',
    vat_note: 'All prices in GBP (£). No hidden fees. 50% deposit to start.',
    hero_headline: 'Websites that win customers, built fast, priced fairly.',
    hero_lead: 'RedAnt builds high-converting, mobile-ready websites for UK small businesses. Delivered in 48 hours to 2 weeks with fixed upfront pricing.',
    about_story: 'RedAnt was founded to solve a massive problem facing UK small business owners: spending £3,000+ on slow 3-month agency website rebuilds, or struggling with buggy self-built DIY templates that lose leads. We created the 48-Hour Website Refresh — taking your existing business text and reputation and upgrading the design, mobile experience, speed, and lead flow in 48 hours for a fixed £199 launch fee.',
    about_credentials: '🎓 B.Sc. Information Technology Studies\n⚡ Lead Web Developer at WebPixel UK\n🇬🇧 13+ Live UK and International client builds',
    about_remote_note: 'While our engineering hub operates in Sri Lanka, we work strictly aligned with UK business operations: Mon-Fri 8:00 AM - 6:00 PM GMT with instant WhatsApp communication and 24-hour review guarantees.'
  };

  for (const [key, value] of Object.entries(settingsData)) {
    await run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  }

  // Seed default Services with v2 Path Card Text
  const existingServices = await get(`SELECT count(*) as count FROM services`);
  if (existingServices.count === 0) {
    const servicesList = [
      {
        slug: '48-hour-website-refresh',
        name: '48-Hour Website Refresh',
        short_desc: 'Turn your existing clunky website into a high-converting, mobile-friendly engine in 2 days.',
        long_desc: 'Designed for established UK small businesses whose site looks outdated or fails on mobile. We overhaul visual design, speed, mobile responsiveness, and call-to-actions without a lengthy 2-month rebuild.',
        price_from: 199,
        path_card_text: 'My website looks outdated or broken on mobile',
        features: JSON.stringify([
          'Homepage visual redesign & layout optimization',
          '100% Mobile & tablet responsive layout tuning',
          'Core Web Vitals & speed acceleration',
          'Conversion & lead form streamlining',
          'Basic UK On-Page SEO (Titles, Meta, H1 structure)',
          '48-Hour guaranteed turnaround'
        ]),
        not_included: JSON.stringify([
          'Full backend database migrations',
          'E-commerce store setup with >50 products',
          'Complete brand identity / logo overhaul from scratch'
        ]),
        process: JSON.stringify([
          '1. Send your URL & brief',
          '2. Receive free audit & plan',
          '3. Approve & lock in 48h build',
          '4. Go live & start getting enquiries'
        ]),
        icon: '⚡',
        order_num: 1
      },
      {
        slug: 'website-design',
        name: 'New Website Design',
        short_desc: 'Bespoke multi-page websites built for UK trades, clinics, and local services.',
        long_desc: 'Complete ground-up website build crafted specifically for UK small businesses needing multi-page authority. Built for speed, trust, and search visibility.',
        price_from: 499,
        path_card_text: 'I need a brand-new custom website built',
        features: JSON.stringify([
          '5 to 10 bespoke page layouts',
          'Custom graphics, icons & styling',
          'Contact & quote request forms with WhatsApp integration',
          'Google Maps & Google Reviews embed',
          'Speed optimized (<1.5s load target)',
          'Full ownership & training included'
        ]),
        not_included: JSON.stringify(['Domain registration fees (assistance provided)', 'Paid stock photo licenses']),
        process: JSON.stringify(['1. Content & structure workshop', '2. Visual design layout', '3. Development & testing', '4. Launch & handover']),
        icon: '🎨',
        order_num: 2
      },
      {
        slug: 'wordpress-development',
        name: 'WordPress & Custom Dev',
        short_desc: 'Elementor fixes, custom PHP/JS features, booking forms, and integration work.',
        long_desc: 'Got a broken WordPress theme, slow plugins, or need custom calculator/booking forms integrated? We fix code, optimize plugins, and build bespoke web apps.',
        price_from: 399,
        path_card_text: 'I need WordPress fixes, bookings, or custom code',
        features: JSON.stringify([
          'Elementor / Divi / Gutenberg cleanup',
          'Custom booking & quote calculation forms',
          'CRM & email marketing integration (Mailchimp, ActiveCampaign)',
          'Database optimization & malware cleanup',
          'Speed acceleration to 90+ PageSpeed score'
        ]),
        not_included: JSON.stringify(['Ongoing server hosting cost']),
        process: JSON.stringify(['1. Diagnostics & code audit', '2. Staging server fix', '3. Client QA review', '4. Live deployment']),
        icon: '⚙️',
        order_num: 3
      },
      {
        slug: 'local-seo',
        name: 'Local SEO & Google Business',
        short_desc: 'Get found on Google Maps and local UK searches in your town or area.',
        long_desc: 'Optimization targeted specifically at UK local searches ("physio near me", "electrician Leeds"). We optimize on-page schema, headers, and Google Business Profile.',
        price_from: 149,
        path_card_text: 'I want to rank higher on Google in my local town',
        features: JSON.stringify([
          'Google Business Profile setup & optimization',
          'Local schema markup injection (JSON-LD)',
          'Target keyword mapping for UK towns/cities',
          'Local citation check & metadata rewrite',
          'Fast indexation request in Google Search Console'
        ]),
        not_included: JSON.stringify(['Monthly link building packages']),
        process: JSON.stringify(['1. Local keyword research', '2. On-page & Schema optimization', '3. GBP sync', '4. Ranking tracking report']),
        icon: '🔍',
        order_num: 4
      },
      {
        slug: 'care-plans',
        name: 'Website Care Plans',
        short_desc: 'Hands-off UK website hosting, daily backups, security monitoring, and updates.',
        long_desc: 'Keep your website fast, secure, and up-to-date without touching technical settings. Includes monthly small edits and emergency priority fixes.',
        price_from: 29,
        path_card_text: 'I want my website managed, updated, and hosted',
        features: JSON.stringify([
          'UK Ultra-fast SSD hosting & SSL certificate',
          'Daily off-site backups',
          'Weekly plugin & security patches',
          'Up to 1 hour of content edits included monthly',
          'Uptime monitoring (99.9% guarantee)'
        ]),
        not_included: JSON.stringify(['Major layout redesigns']),
        process: JSON.stringify(['1. Instant migration to UK host', '2. Automated daily backup loop setup', '3. Monthly report sent']),
        icon: '🛡️',
        order_num: 5
      },
      {
        slug: 'brand-and-social-graphics',
        name: 'Brand & Social Ad Graphics',
        short_desc: 'High-converting social ad creatives, logo tidy-ups, and brand graphics.',
        long_desc: 'Professional visual assets for Facebook/Instagram ads, logo refinements, and social media headers designed to make your UK small business stand out.',
        price_from: 99,
        path_card_text: 'I need social ad graphics or brand logo updates',
        features: JSON.stringify([
          '5 to 10 high-converting social ad graphics',
          'Vector logo cleanup & typography kit',
          'Facebook, LinkedIn & Instagram banners',
          'PNG, SVG & WebP export files'
        ]),
        not_included: JSON.stringify(['3D video animation']),
        process: JSON.stringify(['1. Design brief', '2. Mockup creation', '3. Revision round', '4. File delivery']),
        icon: '🖼️',
        order_num: 6
      }
    ];

    for (const s of servicesList) {
      await run(
        `INSERT INTO services (slug, name, short_desc, long_desc, price_from, path_card_text, features_json, not_included_json, process_json, icon, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.slug, s.name, s.short_desc, s.long_desc, s.price_from, s.path_card_text, s.features, s.not_included, s.process, s.icon, s.order_num]
      );
    }
  }

  // Seed Landing Pages (v2 Architecture)
  const existingLanding = await get(`SELECT count(*) as count FROM landing_pages`);
  if (existingLanding.count === 0) {
    const landingPagesList = [
      {
        slug: '48-hour-website-refresh',
        title: '48-Hour Website Refresh',
        headline: 'Your website, refreshed in 48 hours.',
        subtext: 'Outdated website? Fixed in two days for a fixed GBP price, without a full rebuild.',
        cta_text: 'Claim my £199 launch offer',
        price_from: 199,
        meta_title: '48-Hour Website Refresh for UK Small Businesses | RedAnt',
        meta_desc: 'Turn your outdated website into a fast, colourful, mobile-friendly engine in 48 hours. Delivered from £199.'
      },
      {
        slug: 'website-design',
        title: 'New Website Design',
        headline: 'A website that makes your business look as good as it is.',
        subtext: 'Custom, premium website design built for UK small businesses to win enquiries.',
        cta_text: 'Book a free discovery call',
        price_from: 499,
        meta_title: 'Custom Website Design UK | RedAnt',
        meta_desc: 'Bespoke web design for UK small businesses. Delivered in 2-4 weeks with speed and mobile-first optimization.'
      },
      {
        slug: 'wordpress-development',
        title: 'WordPress & Custom Dev',
        headline: 'A website you can actually update yourself.',
        subtext: 'WordPress built fast, clean, secure, and hassle-free.',
        cta_text: 'Get a development quote',
        price_from: 399,
        meta_title: 'WordPress & Custom Web Development UK | RedAnt',
        meta_desc: 'Elementor fixes, booking forms, custom integrations, and speed optimization for UK businesses.'
      },
      {
        slug: 'local-seo',
        title: 'Local SEO & Google Maps',
        headline: 'Get found by customers in your town.',
        subtext: 'Rank higher on Google local search and Google Maps across your UK service area.',
        cta_text: 'Get a free local SEO check',
        price_from: 149,
        meta_title: 'Local SEO for UK Small Businesses | RedAnt',
        meta_desc: 'Google Business Profile setup, local schema markup, and on-page SEO tuned for UK local searches.'
      },
      {
        slug: 'care-plans',
        title: 'Website Care Plans',
        headline: 'Your website, looked after.',
        subtext: 'Never worry about updates, backups, security, or hosting again.',
        cta_text: 'Choose a care plan',
        price_from: 29,
        meta_title: 'Website Maintenance & Care Plans UK | RedAnt',
        meta_desc: 'Fast UK SSD hosting, daily backups, security monitoring, and content edits starting at £29/month.'
      },
      {
        slug: 'brand-and-social-graphics',
        title: 'Brand & Social Graphics',
        headline: 'High-converting ad graphics & visual assets.',
        subtext: 'Stand out on social media with custom ad templates, logo cleanups, and graphics.',
        cta_text: 'Order graphics package',
        price_from: 99,
        meta_title: 'Social Ad Graphics & Brand Design UK | RedAnt',
        meta_desc: 'Facebook/Instagram ad graphics and logo refinements for UK small businesses.'
      }
    ];

    for (const lp of landingPagesList) {
      await run(
        `INSERT INTO landing_pages (slug, title, headline, subtext, cta_text, price_from, meta_title, meta_desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [lp.slug, lp.title, lp.headline, lp.subtext, lp.cta_text, lp.price_from, lp.meta_title, lp.meta_desc]
      );
    }
  }

  // Seed default Pricing Plans
  const existingPricing = await get(`SELECT count(*) as count FROM pricing_plans`);
  if (existingPricing.count === 0) {
    const plans = [
      {
        name: '48-Hour Refresh',
        price: '£199',
        billing_type: 'one-off launch offer',
        badge: 'Most Popular',
        features: JSON.stringify([
          'Homepage visual redesign',
          '100% Mobile responsiveness',
          'Page speed & performance boost',
          'Lead form & CTA optimization',
          'Basic UK On-Page SEO',
          '48-Hour delivery guarantee',
          'No full site rebuild needed'
        ]),
        order_num: 1
      },
      {
        name: 'Full Website Build',
        price: '£499',
        billing_type: 'one-off payment',
        badge: 'Complete Package',
        features: JSON.stringify([
          'Up to 5 custom pages',
          'Bespoke visual styling & layout',
          'Contact & WhatsApp enquiry forms',
          'Google Maps & Reviews integration',
          'Local SEO & Schema markup',
          'Speed score 90+ guaranteed',
          '2 to 3 week turnaround'
        ]),
        order_num: 2
      },
      {
        name: 'Care & Maintenance',
        price: '£29',
        billing_type: 'per month',
        badge: 'Peace of Mind',
        features: JSON.stringify([
          'UK fast SSD hosting included',
          'Daily off-site backups',
          'Security monitoring & SSL',
          'Monthly plugin & core updates',
          '30 mins monthly content edits',
          'Priority WhatsApp tech support'
        ]),
        order_num: 3
      }
    ];

    for (const p of plans) {
      await run(
        `INSERT INTO pricing_plans (name, price, billing_type, badge, features_json, order_num) VALUES (?, ?, ?, ?, ?, ?)`,
        [p.name, p.price, p.billing_type, p.badge, p.features, p.order_num]
      );
    }
  }

  // Seed default Projects (Portfolio)
  const existingProjects = await get(`SELECT count(*) as count FROM projects`);
  if (existingProjects.count === 0) {
    const projectsList = [
      {
        slug: 'pyramid-sports-coaching',
        name: 'Pyramid Sports Coaching',
        url: 'https://pyramidsportscoaching.co.uk/',
        industry: 'Sports & Coaching',
        region: 'UK',
        desc: 'UK sports coaching academy site featuring clear session booking paths and energetic bold branding.',
        initial: 'P',
        featured: 1,
        preview_allowed: 1,
        built_at_webpixel: 1,
        case_study: JSON.stringify({
          problem: 'Old site had confused navigation and missed mobile leads for weekend coaching packages.',
          solution: 'Re-structured homepage around key age categories with direct WhatsApp booking triggers.',
          results: '+140% mobile enquiry conversion within 30 days. Page load dropped from 4.2s to 1.1s.',
          quote: 'The team at RedAnt turned our clunky site into our #1 lead generator!'
        }),
        order_num: 1
      },
      {
        slug: 'philip-astley-organisation',
        name: 'Philip Astley Organisation',
        url: 'https://philipastley.org.uk/',
        industry: 'Heritage & Community',
        region: 'UK',
        desc: 'UK non-profit heritage site showcasing the father of modern circus with event timelines.',
        initial: 'P',
        featured: 1,
        preview_allowed: 1,
        built_at_webpixel: 1,
        case_study: JSON.stringify({
          problem: 'Complex historical archives were impossible to browse on smartphone screens.',
          solution: 'Created a high-contrast mobile layout with easy timeline filter and event RSVP.',
          results: 'Mobile bounce rate fell by 48%. Over 5,000 UK festival visitors accessed the site seamlessly.',
          quote: 'Outstanding work. Fast, reliable, and extremely easy to work with.'
        }),
        order_num: 2
      },
      {
        slug: 'goadventures-uk',
        name: 'GoAdventures UK',
        url: 'https://www.goadventures.uk/',
        industry: 'Travel & Outdoor',
        region: 'UK',
        desc: 'Outdoor adventure provider site designed to convert thrill-seekers into group bookings.',
        initial: 'G',
        featured: 1,
        preview_allowed: 1,
        built_at_webpixel: 1,
        case_study: JSON.stringify({
          problem: 'Outdated layout failed to portray the excitement of outdoor expeditions.',
          solution: 'Used bold vibrant visual tiles, instant trip enquiry popups, and Trustpilot badges.',
          results: 'Group booking enquiries increased by 65% in the first quarter post-launch.',
          quote: 'The 48-hour delivery was real! The site looks magnificent.'
        }),
        order_num: 3
      },
      {
        slug: 'webpixel-uk',
        name: 'WebPixel UK',
        url: 'https://www.webpixel.uk/',
        industry: 'Agency',
        region: 'UK',
        desc: 'UK Digital Agency platform showcasing high-performance client projects.',
        initial: 'W',
        featured: 1,
        preview_allowed: 1,
        built_at_webpixel: 1,
        case_study: null,
        order_num: 4
      },
      {
        slug: 'pixelcoders',
        name: 'PixelCoders UK',
        url: 'https://pixelcoders.uk/',
        industry: 'Tech & Dev',
        region: 'UK',
        desc: 'UK software engineering hub for custom web apps and digital transformation.',
        initial: 'P',
        featured: 0,
        preview_allowed: 1,
        built_at_webpixel: 1,
        case_study: null,
        order_num: 5
      },
      {
        slug: 'hear-u-better',
        name: 'Hear U Better Clinic',
        url: 'https://www.hearubetter.com/',
        industry: 'Healthcare & Clinics',
        region: 'UK',
        desc: 'Liverpool ear care clinic website with instant consultation scheduling.',
        initial: 'H',
        featured: 1,
        preview_allowed: 1,
        built_at_webpixel: 0,
        case_study: JSON.stringify({
          problem: 'Patients struggled to locate clinic opening times and service pricing on mobile.',
          solution: 'Streamlined clinic booking header and added clear service price lists.',
          results: 'Appointments booked online doubled in Liverpool and surrounding regions.',
          quote: 'Professional, sharp, and our patients love how easy it is to book on their phones.'
        }),
        order_num: 6
      },
      {
        slug: 'la-casa-by-eldorado',
        name: 'La Casa by Eldorado',
        url: 'https://lacasabyeldorado.com/',
        industry: 'Hospitality',
        region: 'International',
        desc: 'Boutique villa resort website featuring luxury image showcases and booking inquiries.',
        initial: 'L',
        featured: 0,
        preview_allowed: 1,
        built_at_webpixel: 0,
        case_study: null,
        order_num: 7
      },
      {
        slug: 'peel-pool-and-spa',
        name: 'Peel Pool & Spa',
        url: 'https://www.peelpoolandspa.ca/',
        industry: 'Trades & Services',
        region: 'International',
        desc: 'Canadian pool installation and maintenance business website.',
        initial: 'P',
        featured: 0,
        preview_allowed: 1,
        built_at_webpixel: 0,
        case_study: null,
        order_num: 8
      }
    ];

    for (const p of projectsList) {
      await run(
        `INSERT INTO projects (slug, name, url, industry, region, desc, initial, featured, preview_allowed, built_at_webpixel, case_study_json, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.slug, p.name, p.url, p.industry, p.region, p.desc, p.initial, p.featured, p.preview_allowed, p.built_at_webpixel, p.case_study, p.order_num]
      );
    }
  }

  // Seed default Testimonials
  const existingTestimonials = await get(`SELECT count(*) as count FROM testimonials`);
  if (existingTestimonials.count === 0) {
    const tList = [
      {
        client_name: 'Dave Harrison',
        business: 'Harrison Plumbing & Heating',
        town: 'Leeds, UK',
        quote: 'My site was 8 years old and broken on phones. RedAnt refreshed it in 48 hours for £199. I got 4 new boiler enquiries in the first week!',
        rating: 5,
        order_num: 1
      },
      {
        client_name: 'Dr. Sarah Jenkins',
        business: 'Cheshire Wellness Clinic',
        town: 'Chester, UK',
        quote: 'Extremely fast and hassle-free. They kept our content but made it look ultra-modern and fast. Couldn’t recommend more.',
        rating: 5,
        order_num: 2
      },
      {
        client_name: 'Mark Connelly',
        business: 'Pyramid Coaching',
        town: 'Manchester, UK',
        quote: 'Clear pricing, direct communication on WhatsApp during UK hours, and zero jargon. The best web investment we made.',
        rating: 5,
        order_num: 3
      },
      {
        client_name: 'Claire Thompson',
        business: 'The Bliss Beauty Lounge',
        town: 'Bristol, UK',
        quote: 'The live preview feature gave me complete confidence. The final site launched right on schedule at 48 hours.',
        rating: 5,
        order_num: 4
      }
    ];

    for (const t of tList) {
      await run(`INSERT INTO testimonials (client_name, business, town, quote, rating, featured, order_num) VALUES (?, ?, ?, ?, ?, 1, ?)`, [
        t.client_name,
        t.business,
        t.town,
        t.quote,
        t.rating,
        t.order_num
      ]);
    }
  }

  // Seed default FAQs
  const existingFAQs = await get(`SELECT count(*) as count FROM faqs`);
  if (existingFAQs.count === 0) {
    const fList = [
      {
        question: 'How can you deliver a website refresh in just 48 hours?',
        answer: 'We focus strictly on high-impact improvements: visual styling, mobile layout tuning, speed acceleration, and lead form optimization on your existing domain and text content. We don’t waste weeks over-complicating what already works.',
        category: 'Process',
        order_num: 1
      },
      {
        question: 'Is the £199 price really a one-off fee?',
        answer: 'Yes! £199 is a total fixed price for our 48-Hour Website Refresh launch offer. There are no monthly lock-in contracts unless you choose to add our optional £29/mo Care Plan.',
        category: 'Pricing',
        order_num: 2
      },
      {
        question: 'Who owns the website and code after completion?',
        answer: 'You retain 100% full ownership of all code, content, domain, and graphics. We provide complete admin credentials and files upon handover.',
        category: 'Legal & Ownership',
        order_num: 3
      },
      {
        question: 'How do you work remotely with UK clients from Sri Lanka?',
        answer: 'We maintain dedicated UK business working hours (8:00 AM - 6:00 PM GMT) with instant UK WhatsApp support (+94 76 644 1645) and email response guarantees within 2 hours. Over 80% of our portfolio is for UK small businesses.',
        category: 'Remote Work',
        order_num: 4
      },
      {
        question: 'What do I need to provide to get started?',
        answer: 'Just your current website URL and any specific text or photos you’d like updated. If you don’t have new photos, we optimize your existing assets.',
        category: 'Process',
        order_num: 5
      },
      {
        question: 'What if I need revisions after the 48 hours?',
        answer: 'We include a 7-day post-launch revision period to tweak colors, text, or minor layout details until you are 100% delighted.',
        category: 'Support',
        order_num: 6
      }
    ];

    for (const f of fList) {
      await run(`INSERT INTO faqs (question, answer, category, order_num) VALUES (?, ?, ?, ?)`, [
        f.question,
        f.answer,
        f.category,
        f.order_num
      ]);
    }
  }

  // Seed default Blog Posts
  const existingBlog = await get(`SELECT count(*) as count FROM blog_posts`);
  if (existingBlog.count === 0) {
    const posts = [
      {
        slug: 'how-much-does-a-website-cost-uk-2026',
        title: 'How Much Does a Small Business Website Cost in the UK? (2026 Guide)',
        excerpt: 'Confused by quotes ranging from £200 to £5,000? We break down realistic UK web design pricing, hidden costs, and what you actually need.',
        body: `<p>If you run a small business in the UK, getting web design quotes can be baffling. One agency quotes £200, while another demands £4,000 for what looks like the exact same 5-page site.</p><h3>The 3 Common Price Tiers in the UK</h3><ul><li><strong>£150 – £350 (Website Refresh / Optimization):</strong> Ideal for existing businesses with a site that looks dated or runs slowly. Overhauls mobile usability and lead capture without starting from scratch.</li><li><strong>£500 – £1,500 (Bespoke 5-10 Page Site):</strong> Full ground-up build for local trades, clinics, and professional services needing SEO structure.</li><li><strong>£2,500+ (Complex E-Commerce & Custom Web Apps):</strong> Needed only if you sell hundreds of products online or require custom databases.</li></ul><p>At RedAnt, we keep pricing upfront with zero vague "contact us" games — our 48-Hour Refresh starts at £199.</p>`,
        category: 'Pricing Guide',
        publish_date: '2026-09-15'
      },
      {
        slug: 'is-your-website-mobile-friendly-checklist',
        title: 'Is Your Website Losing Mobile Customers? A 5-Minute UK Checklist',
        excerpt: 'Over 68% of UK local search traffic happens on smartphones. Here are 5 quick checks to see if your website is turning visitors away.',
        body: `<p>In 2026, over two-thirds of UK consumers search for local plumbers, clinics, and services directly on their mobile phones while on the go.</p><h3>5-Minute Quick Audit</h3><ol><li><strong>Touch Target Sizes:</strong> Can a customer easily tap your "Call Now" button with their thumb without zooming in?</li><li><strong>Load Time on 4G:</strong> Does your site take longer than 3 seconds to render on a standard mobile connection?</li><li><strong>Click-to-Call Phone Links:</strong> Tapping your phone number should immediately launch the phone dialer.</li><li><strong>No Pinch-Zoom Required:</strong> Text must be comfortably legible at 16px minimum font size.</li></ol>`,
        category: 'Mobile UX',
        publish_date: '2026-09-28'
      }
    ];

    for (const p of posts) {
      await run(`INSERT INTO blog_posts (slug, title, excerpt, body, category, publish_date) VALUES (?, ?, ?, ?, ?, ?)`, [
        p.slug,
        p.title,
        p.excerpt,
        p.body,
        p.category,
        p.publish_date
      ]);
    }
  }

  // Seed default Industries
  const existingInd = await get(`SELECT count(*) as count FROM industries`);
  if (existingInd.count === 0) {
    const indList = [
      {
        slug: 'clinics-healthcare',
        name: 'Clinics & Healthcare',
        intro: 'Build patient trust with fast, GDPR-compliant healthcare websites for UK clinics, physios, and ear care specialists.',
        problems: JSON.stringify([
          'Patients cannot find appointment booking links on mobile',
          'Cluttered medical jargon with no clear service price list',
          'Slow loading times causing anxious patients to bounce'
        ]),
        cta_text: 'Get a Free Audit for Your Clinic Website'
      },
      {
        slug: 'trades-construction',
        name: 'Trades & Construction',
        intro: 'Turn local UK homeowner searches into instant quote calls for plumbers, electricians, and builders.',
        problems: JSON.stringify([
          'No click-to-call phone button at top of mobile screen',
          'Missing local UK town keywords & Google Business link',
          'Dated design making a great trade business look unestablished'
        ]),
        cta_text: 'Boost Your Trade Business Leads'
      },
      {
        slug: 'coaching-wellbeing',
        name: 'Coaching & Sports Clubs',
        intro: 'Engaging, bold websites designed for sports academies, personal trainers, and UK coaching clubs.',
        problems: JSON.stringify([
          'Hard to navigate class schedules and age brackets',
          'Lack of social proof & Google review badges',
          'No instant WhatsApp inquiry integration'
        ]),
        cta_text: 'Refresh Your Sports / Coaching Site'
      }
    ];

    for (const i of indList) {
      await run(`INSERT INTO industries (slug, name, intro, problems_json, cta_text) VALUES (?, ?, ?, ?, ?)`, [
        i.slug,
        i.name,
        i.intro,
        i.problems,
        i.cta_text
      ]);
    }
  }

  console.log('Database initialized successfully with RedAnt v2 schema and seed data.');
}

module.exports = {
  db,
  run,
  get,
  all,
  initDB
};
