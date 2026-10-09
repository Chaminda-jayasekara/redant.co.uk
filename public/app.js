// RedAnt UK Public Application Frontend Logic (v2 Architecture)
(function () {
  let siteData = null;
  const WA_TEXT = "Hi RedAnt, I'd like a free website review";
  // UK numbers reserved for TV/drama never connect, so never show them
  const RESERVED_UK = [/^(44|0)2079460\d{3}$/, /^(44|0)1134960\d{3}$/, /^(44|0)1174960\d{3}$/, /^(44|0)1214960\d{3}$/, /^(44|0)1314960\d{3}$/,
    /^(44|0)1414960\d{3}$/, /^(44|0)1514960\d{3}$/, /^(44|0)1614960\d{3}$/, /^(44|0)1914980\d{3}$/, /^(44|0)1632960\d{3}$/, /^(44|0)7700900\d{3}$/];
  function isUsablePhone(v) {
    const d = String(v || "").replace(/[^\d]/g, "");
    return d.length >= 9 && !RESERVED_UK.some(r => r.test(d));
  }
  const cols = ["#ffd23f", "#22e3a0", "#ff7ac6", "#3ec6ff", "#ffffff", "#ff9b3b"];

  // Cache UTM params
  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get("utm_source") || sessionStorage.getItem("redant_utm_source") || "";
  const utmMedium = urlParams.get("utm_medium") || sessionStorage.getItem("redant_utm_medium") || "";
  const utmCampaign = urlParams.get("utm_campaign") || sessionStorage.getItem("redant_utm_campaign") || "";

  if (utmSource) sessionStorage.setItem("redant_utm_source", utmSource);
  if (utmMedium) sessionStorage.setItem("redant_utm_medium", utmMedium);
  if (utmCampaign) sessionStorage.setItem("redant_utm_campaign", utmCampaign);

  document.addEventListener("DOMContentLoaded", function () {
    setupRouting();
    fetchSiteData();
    setupMobileNav();
    setupCompareSlider();
    setupCheckupTool();
    setupForms();
    setupConsent();
    setupTracking();
    setupPopup();
  });

  // Fetch Public Content from Express API
  function fetchSiteData() {
    fetch("/api/public/content")
      .then(res => res.json())
      .then(data => {
        siteData = data;
        renderAllSections(data);
        window.__redantRoute && window.__redantRoute();
      })
      .catch(err => {
        console.error("Error loading site content:", err);
      });
  }

  // Render All Sections
  function renderAllSections(data) {
    // 0. Editable site text, contact details, logos, service page heroes (from admin)
    applySiteSettings(data.settings || {});
    applyLandingPages(data.landingPages || []);

    // 1. Launch Offer
    if (data.offer) {
      const priceText = "£" + data.offer.offer_price;
      document.querySelectorAll("#sticker-price, .js-offer-price").forEach(el => el.textContent = priceText);
      document.querySelectorAll("#sticker-label, .js-offer-label").forEach(el => {
        if (data.offer.label) el.textContent = data.offer.label;
      });
    }

    // 2. Marquee Ticker
    renderMarquee(data.projects || []);

    // 3. Path Cards ("What do you need?")
    renderPathCards(data.services || []);

    // 4. Portfolio Tiles
    renderPortfolio(data.projects || []);

    // 5. Testimonials
    renderTestimonials(data.testimonials || []);

    // 6. Services Hub
    renderServices(data.services || []);

    // 7. Pricing Cards
    renderPricing(data.pricingPlans || []);

    // 8. Industries
    renderIndustries(data.industries || []);

    // 9. Blog Posts
    renderBlog(data.blogPosts || []);

    // 10. FAQs Accordion
    renderFAQs(data.faqs || []);

    // 11. Hide sections that have nothing to show yet (empty sections hurt trust)
    hideIfEmpty(data);
    loadAnalytics();
  }


  // ---------- Admin-editable content ----------
  // Elements marked data-cms="key" are overridden by the matching value in the
  // settings table. If no value is saved, the text written in index.html is used.
  function setHeading(el, value) {
    // "Websites that *win customers,* built fast" -> highlighted span
    el.textContent = "";
    value.split(/(\*[^*]+\*)/).forEach(part => {
      if (!part) return;
      if (part.length > 2 && part[0] === "*" && part[part.length - 1] === "*") {
        const span = document.createElement("span");
        span.className = "hl";
        span.textContent = part.slice(1, -1);
        el.appendChild(span);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  function applySiteSettings(st) {
    document.querySelectorAll("[data-cms]").forEach(el => {
      const key = el.dataset.cms;
      const v = st[key];
      if (v === undefined || v === null || v === "") return;
      const attr = el.dataset.cmsAttr;
      const type = el.dataset.cmsType || "text";
      if (attr) el.setAttribute(attr, v);
      else if (type === "heading") setHeading(el, v);
      else if (type === "html") el.innerHTML = v;
      else el.textContent = v;
    });

    // Contact details used across the site
    const digits = s => String(s || "").replace(/[^\d]/g, "");
    const waDigits = digits(st.whatsapp) || "94766441645";
    document.querySelectorAll("a.js-wa").forEach(a => {
      a.href = "https://wa.me/" + waDigits + "?text=" + encodeURIComponent(WA_TEXT);
      if (a.classList.contains("js-wa-text") && st.whatsapp) a.textContent = st.whatsapp;
    });
    if (st.email) {
      document.querySelectorAll("a.js-email").forEach(a => {
        a.href = "mailto:" + st.email;
        if (a.classList.contains("js-email-text")) a.textContent = st.email;
      });
    }
    // Only show a call button for a real, working number
    const phoneOk = isUsablePhone(st.phone);
    document.querySelectorAll("a.js-phone").forEach(a => {
      if (phoneOk) {
        a.href = "tel:" + String(st.phone).replace(/[^\d+]/g, "");
        if (a.classList.contains("js-phone-text")) a.textContent = st.phone;
        a.hidden = false;
      } else { a.hidden = true; }
    });
    document.querySelectorAll(".js-phone-wrap").forEach(w => { w.hidden = !phoneOk; });

    // Trust block in the footer
    const trust = document.getElementById("footer-trust");
    if (trust) {
      const extra = [st["trust.company_details"], st["trust.ico"] ? "ICO registration: " + st["trust.ico"] : ""].filter(Boolean).join(" · ");
      if (extra) trust.textContent = trust.textContent.replace(/\s*\|.*$/, "") + " | " + extra;
    }
  }

  // Service landing page heroes come from the landing_pages table
  function applyLandingPages(pages) {
    pages.forEach(lp => {
      const view = document.getElementById("view-" + lp.slug);
      if (!view) return;
      const h = view.querySelector('[data-lp="headline"]');
      const sub = view.querySelector('[data-lp="subtext"]');
      const cta = view.querySelector('[data-lp="cta_text"]');
      if (h && lp.headline) setHeading(h, lp.headline);
      if (sub && lp.subtext) sub.textContent = lp.subtext;
      if (cta && lp.cta_text) cta.textContent = lp.cta_text;
    });
  }

  // Responsive Mobile Navigation Logic (<1024px)
  function setupMobileNav() {
    const btn = document.getElementById("hamburger-btn");
    const panel = document.getElementById("mobile-nav-panel");

    if (!btn || !panel) return;

    function toggleMenu() {
      const open = panel.classList.toggle("open");
      btn.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("menu-open", open);
    }

    function closeMenu() {
      panel.classList.remove("open");
      btn.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }

    btn.onclick = toggleMenu;

    // Accordion Sub-menu Toggles
    document.querySelectorAll(".acc-toggle").forEach(toggle => {
      toggle.onclick = function () {
        const subId = toggle.dataset.acc;
        const sub = document.getElementById(subId);
        if (sub) {
          const isSubOpen = sub.classList.toggle("open");
          toggle.querySelector("span").textContent = isSubOpen ? "[-]" : "[+]";
        }
      };
    });

    // Close on mobile link tap
    document.querySelectorAll(".m-link").forEach(link => {
      link.onclick = closeMenu;
    });

    // Close on Escape key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  // Path Cards ("What do you need?")
  function renderPathCards(services) {
    const grid = document.getElementById("path-cards-grid");
    if (!grid) return;
    grid.innerHTML = "";

    services.forEach(s => {
      const card = document.createElement("a");
      card.href = `/${s.slug}`;
      card.className = "path-card";
      card.innerHTML = `
        <div class="ico">${s.icon || '⚡'}</div>
        <h3 style="font-size:1.15rem; margin-bottom:6px;">${s.name}</h3>
        <p style="font-size:0.9rem; font-weight:600; margin:0 0 12px; color:var(--navy); opacity:0.9;">"${s.path_card_text || s.short_desc}"</p>
        <span class="btn sm yellow" style="align-self:flex-start;">Explore →</span>
      `;
      grid.appendChild(card);
    });
  }

  // Marquee Ticker
  function renderMarquee(projects) {
    const tr = document.getElementById("track");
    if (!tr) return;
    let s = "";
    for (let k = 0; k < 2; k++) {
      projects.forEach(p => {
        s += `<span>${p.name.replace(/&/g, "&amp;")} ✦</span>`;
      });
    }
    tr.innerHTML = s;
  }

  // Portfolio Tiles
  function renderPortfolio(projects) {
    const homeBox = document.getElementById("home-portfolio-tiles");
    const fullBox = document.getElementById("full-portfolio-tiles");

    if (homeBox) homeBox.innerHTML = "";
    if (fullBox) fullBox.innerHTML = "";

    projects.forEach((p, i) => {
      const tile = createTileElement(p, i);

      if (homeBox && i < 6) {
        homeBox.appendChild(tile.cloneNode(true));
      }

      if (fullBox) {
        fullBox.appendChild(tile);
      }
    });

    bindTileButtons();
  }

  function createTileElement(p, i) {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.region = p.region || "UK";
    el.style.background = cols[i % cols.length];

    const e = document.createElement("em");
    e.textContent = p.initial || p.name.charAt(0);

    const b = document.createElement("b");
    b.textContent = p.name;

    el.appendChild(e);
    el.appendChild(b);

    if (p.desc) {
      const d = document.createElement("small");
      d.textContent = p.desc;
      el.appendChild(d);
    }

    if (p.built_at_webpixel) {
      const w = document.createElement("small");
      w.className = "wp";
      w.textContent = "Built at WebPixel UK";
      el.appendChild(w);
    }

    const row = document.createElement("div");
    row.className = "row";

    const v = document.createElement("a");
    v.href = p.url;
    v.target = "_blank";
    v.rel = "noopener";
    v.textContent = "Visit site →";
    v.className = "visit-btn";
    row.appendChild(v);

    el.appendChild(row);
    return el;
  }

  function bindTileButtons() {
    // Portfolio Filters
    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.onclick = function () {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const filter = btn.dataset.filter;

        document.querySelectorAll("#full-portfolio-tiles .tile").forEach(tile => {
          if (filter === "all" || tile.dataset.region === filter) {
            tile.style.display = "flex";
          } else {
            tile.style.display = "none";
          }
        });
      };
    });
  }

  // ---------- helpers ----------
  const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function track(name, params) {
    try {
      if (window.gtag) window.gtag("event", name, params || {});
      if (window.fbq && name === "generate_lead") window.fbq("track", "Lead");
      if (window.fbq && (name === "whatsapp_click" || name === "phone_click" || name === "email_click")) window.fbq("track", "Contact");
    } catch (e) {}
  }

  function hideIfEmpty(data) {
    const t = document.getElementById("home-testimonials");
    if (t) {
      const empty = !(data.testimonials || []).length;
      t.style.display = empty ? "none" : "";
      const h = t.previousElementSibling;
      if (h && h.tagName === "H2") h.style.display = empty ? "none" : "";
      const card = t.nextElementSibling;
      if (card && empty) card.style.marginTop = "0";
    }
    const feat = document.getElementById("home-portfolio-tiles");
    if (feat) {
      const sec = feat.closest("section");
      if (sec) sec.style.display = (data.projects || []).length ? "" : "none";
    }
  }

  // ---------- Testimonials, services, pricing ----------
  function renderTestimonials(testimonials) {
    const container = document.getElementById("home-testimonials");
    if (!container) return;
    container.innerHTML = "";
    testimonials.forEach(t => {
      const card = document.createElement("div");
      card.className = "card testi-card";
      card.innerHTML = `
        <div class="stars">★★★★★</div>
        <p style="font-weight:600; font-size: 1.05rem;">"${esc(t.quote)}"</p>
        <div style="margin-top: 14px; font-weight: 800;">— ${esc(t.client_name)}</div>
        <small style="color: var(--navy); opacity: 0.8; font-weight: 600;">${esc(t.business)}${t.town ? ", " + esc(t.town) : ""}</small>`;
      container.appendChild(card);
    });
  }

  function renderServices(services) {
    const grid = document.getElementById("services-grid");
    if (!grid) return;
    grid.innerHTML = "";
    services.forEach(s => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "28px";
      card.innerHTML = `
        <div class="ico" style="background:var(--yellow);">${esc(s.icon || "⚡")}</div>
        <h3>${esc(s.name)}</h3>
        <p style="font-size:0.95rem;">${esc(s.short_desc)}</p>
        <div style="font-size:1.6rem; font-weight:800; color:var(--red); margin: 12px 0;">${s.price_from ? "From £" + esc(s.price_from) : "Free quote"}</div>
        <a href="/${esc(s.slug)}" class="btn sm" style="width:100%;">See details →</a>`;
      grid.appendChild(card);
    });
  }

  function renderPricing(plans) {
    const box = document.getElementById("pricing-cards");
    if (!box) return;
    box.innerHTML = "";
    plans.forEach((p, idx) => {
      let feats = [];
      try { feats = JSON.parse(p.features_json || "[]"); } catch (e) {}
      const card = document.createElement("div");
      card.className = "card price-card" + (idx === 0 ? " featured" : "");
      card.innerHTML = `
        <div>
          ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
          <h3>${esc(p.name)}</h3>
          <div class="num">${esc(p.price)}</div>
          <small style="font-weight:700; display:block; margin-bottom:14px;">Best for: ${esc(p.billing_type)}</small>
          <ul class="tick-list" style="font-size:0.95rem;">${feats.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>
        <a href="/free-review" class="btn ${idx === 0 ? "" : "alt"}" style="margin-top:24px; width:100%;">Get started</a>`;
      box.appendChild(card);
    });
  }

  // ---------- Industries (hub + individual pages) ----------
  function renderIndustries(industries) {
    const grid = document.getElementById("industries-grid");
    if (!grid) return;
    grid.innerHTML = "";
    industries.forEach(ind => {
      let probs = [];
      try { probs = JSON.parse(ind.problems_json || "[]"); } catch (e) {}
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "28px";
      card.innerHTML = `
        <h3 style="color:var(--violet); font-size:1.5rem;">${esc(ind.name)}</h3>
        <p style="font-weight:600; margin-top:8px;">${esc(ind.intro)}</p>
        <h4 style="margin-top:16px; font-size:1rem;">Typical website problems</h4>
        <ul class="tick-list x" style="margin:8px 0 20px; font-size:0.92rem;">${probs.map(pr => `<li>${esc(pr)}</li>`).join("")}</ul>
        <a href="/web-design-for-${esc(ind.slug)}" class="btn sm yellow">${esc(ind.cta_text || "See how we help")}</a>`;
      grid.appendChild(card);
    });
    // City links (internal linking for local search)
    let box = document.getElementById("city-links");
    if (!box) {
      box = document.createElement("div");
      box.id = "city-links";
      box.style.marginTop = "40px";
      grid.parentNode.appendChild(box);
    }
    const locs = (siteData && siteData.locations) || [];
    box.innerHTML = locs.length ? `<h3>Web design across the UK</h3><p style="font-weight:700; line-height:2;">${locs.map(l => `<a href="/${esc(l.slug)}" style="text-decoration:underline; margin-right:16px;">${esc(l.city)}</a>`).join("")}</p>` : "";
  }

  function faqItem(q, a) {
    const item = document.createElement("div");
    item.className = "faq-item";
    item.innerHTML = `<div class="faq-q">${esc(q)} <span>➕</span></div><div class="faq-a"><p style="margin:0;">${esc(a)}</p></div>`;
    item.querySelector(".faq-q").onclick = function () {
      item.classList.toggle("open");
      item.querySelector("span").textContent = item.classList.contains("open") ? "➖" : "➕";
    };
    return item;
  }

  function renderFAQs(faqs) {
    const c = document.getElementById("faq-accordion-container");
    if (!c) return;
    c.innerHTML = "";
    faqs.forEach(f => c.appendChild(faqItem(f.question, f.answer)));
  }

  // ---------- Guides ----------
  function renderBlog(posts) {
    const grid = document.getElementById("blog-grid");
    if (!grid) return;
    grid.innerHTML = "";
    posts.forEach(post => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "24px";
      card.innerHTML = `
        <span class="badge">${esc(post.category || "Guide")}</span>
        <h3 style="margin-top:8px;">${esc(post.title)}</h3>
        <p style="font-size:0.92rem; margin:10px 0 16px;">${esc(post.excerpt)}</p>
        <a class="btn sm alt" href="/guides/${esc(post.slug)}">Read guide →</a>`;
      grid.appendChild(card);
    });
    if (!posts.length) grid.innerHTML = '<p style="font-weight:700;">New guides are on the way. Meanwhile, <a href="/free-review" style="text-decoration:underline;">get your free website review</a>.</p>';
  }

  // ---------- Dynamic pages: industry, city, guide ----------
  const INDUSTRY_MATCH = { clinics: /health|clinic|care/i, trades: /trade|construct|plumb|build/i, coaches: /coach|sport|well|therap/i, pubs: /hospitality|pub|cafe|restaurant|food/i };
  function fillIndustry(ind) {
    document.getElementById("ind-h1").textContent = ind.h1 || ("Web design for " + ind.name);
    document.getElementById("ind-intro").textContent = ind.intro || "";
    let probs = [], faqs = [];
    try { probs = JSON.parse(ind.problems_json || "[]"); } catch (e) {}
    try { faqs = JSON.parse(ind.faqs_json || "[]"); } catch (e) {}
    document.getElementById("ind-problems").innerHTML = probs.map(x => `<li>${esc(x)}</li>`).join("");
    const re = INDUSTRY_MATCH[ind.slug];
    const matches = re ? ((siteData && siteData.projects) || []).filter(p => re.test(p.industry || "")) : [];
    const tiles = document.getElementById("ind-tiles");
    tiles.innerHTML = "";
    matches.forEach((p, i) => tiles.appendChild(createTileElement(p, i)));
    document.getElementById("ind-case-wrap").style.display = matches.length ? "" : "none";
    const fq = document.getElementById("ind-faqs");
    fq.innerHTML = "";
    faqs.forEach(f => fq.appendChild(faqItem(f.q, f.a)));
  }
  function fillLocation(loc) {
    document.getElementById("loc-h1").textContent = loc.h1 || ("Web designer in " + loc.city);
    document.getElementById("loc-intro").textContent = loc.intro || "";
    const wrap = document.getElementById("loc-example-wrap");
    wrap.style.display = loc.local_example ? "" : "none";
    document.getElementById("loc-example").textContent = loc.local_example || "";
  }
  function fillGuide(post) {
    document.getElementById("guide-h1").textContent = post.title;
    document.getElementById("guide-meta").textContent = (post.category || "Guide") + " · Published " + (post.publish_date || "");
    document.getElementById("guide-body").innerHTML = post.body || "<p>" + esc(post.excerpt) + "</p>";
  }

  // ---------- Checkup tool (real Google PageSpeed scores) ----------
  function setupCheckupTool() {
    const form = document.getElementById("checkup-form");
    const box = document.getElementById("checkup-results");
    if (!form) return;
    form.onsubmit = function (e) {
      e.preventDefault();
      const btn = form.querySelector("button");
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = "Scanning… up to 30 seconds";
      box.style.display = "block";
      const title = document.getElementById("checkup-grade-title");
      title.textContent = "Scanning your website…";
      ["gauge-speed", "gauge-mobile", "gauge-seo"].forEach(id => document.getElementById(id).textContent = "…");
      document.getElementById("checkup-recs").innerHTML = "";

      fetch("/api/public/checkup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: document.getElementById("checkup-url").value, email: document.getElementById("checkup-email").value })
      })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (ok && d.success) {
            title.textContent = `Results for ${d.url}: ${d.grade}`;
            document.getElementById("gauge-speed").textContent = d.scores.speed + "/100";
            document.getElementById("gauge-mobile").textContent = d.scores.accessibility + "/100";
            document.getElementById("gauge-seo").textContent = d.scores.seo + "/100";
            const ul = document.getElementById("checkup-recs");
            (d.fixes || []).forEach(f => { const li = document.createElement("li"); li.textContent = f.title + ". " + f.detail; ul.appendChild(li); });
            track("generate_lead", { source: "health_check" });
          } else {
            title.textContent = d.error || "We couldn't run the check. Please try again.";
            ["gauge-speed", "gauge-mobile", "gauge-seo"].forEach(id => document.getElementById(id).textContent = "–");
          }
          box.scrollIntoView({ behavior: "smooth", block: "nearest" });
        })
        .catch(() => { title.textContent = "We couldn't run the check. Please try again."; })
        .finally(() => { btn.disabled = false; btn.textContent = label; });
    };
  }

  // ---------- Routing with real URLs ----------
  const STATIC_VIEWS = { "/": "home", "/services": "services", "/pricing": "pricing", "/our-work": "work", "/who-we-help": "industries",
    "/free-review": "review", "/about": "about", "/guides": "blog", "/faq": "faq", "/contact": "contact", "/privacy": "privacy", "/cookies": "cookies", "/terms": "terms",
    "/website-refresh": "website-refresh", "/web-design": "web-design", "/wordpress-developer": "wordpress-developer", "/local-seo": "local-seo",
    "/website-care-plans": "website-care-plans", "/social-media-graphics": "social-media-graphics" };
  // Old #hash links (from before the site had real URLs) still work
  const LEGACY = { home: "/", services: "/services", pricing: "/pricing", work: "/our-work", industries: "/who-we-help", review: "/free-review", about: "/about",
    blog: "/guides", faq: "/faq", contact: "/contact", privacy: "/privacy", cookies: "/cookies", terms: "/terms",
    "48-hour-website-refresh": "/website-refresh", "website-design": "/web-design", "wordpress-development": "/wordpress-developer", "local-seo": "/local-seo",
    "care-plans": "/website-care-plans", "brand-and-social-graphics": "/social-media-graphics" };

  function currentPath() { return (window.location.pathname.replace(/\/+$/, "") || "/"); }

  function setupRouting() {
    let lastPath = null;

    function resolveView(p) {
      if (STATIC_VIEWS[p]) return { view: STATIC_VIEWS[p] };
      if (!siteData) return { view: null }; // wait for data before deciding
      let m;
      if ((m = p.match(/^\/web-design-for-(.+)$/))) {
        const ind = (siteData.industries || []).find(i => i.slug === m[1]);
        if (ind) return { view: "industry", fill: () => fillIndustry(ind) };
      } else if ((m = p.match(/^\/(web-design-[a-z-]+)$/))) {
        const loc = (siteData.locations || []).find(l => l.slug === m[1]);
        if (loc) return { view: "location", fill: () => fillLocation(loc) };
      } else if ((m = p.match(/^\/guides\/(.+)$/))) {
        const post = (siteData.blogPosts || []).find(x => x.slug === m[1]);
        if (post) return { view: "guide", fill: () => fillGuide(post) };
      }
      return { view: "404" };
    }

    function route(isNav) {
      if (window.location.hash && LEGACY[window.location.hash.slice(1)]) {
        history.replaceState(null, "", LEGACY[window.location.hash.slice(1)]);
      }
      const p = currentPath();
      const r = resolveView(p);
      if (!r.view) return; // dynamic page, data not loaded yet
      document.querySelectorAll(".page-view").forEach(el => el.classList.remove("active"));
      const v = document.getElementById("view-" + r.view);
      if (v) v.classList.add("active");
      if (r.fill) r.fill();
      document.body.classList.toggle("ad-mode", urlParams.get("ad") === "1");
      if (isNav && p !== lastPath) {
        window.scrollTo(0, 0);
        updateHead(p);
        track("page_view", { page_path: p });
      }
      lastPath = p;
    }

    function updateHead(p) {
      fetch("/api/public/meta?path=" + encodeURIComponent(p)).then(r => r.json()).then(m => {
        if (m.title) document.title = m.title;
        const md = document.querySelector('meta[name="description"]');
        if (md && m.description) md.setAttribute("content", m.description);
        let c = document.querySelector('link[rel="canonical"]');
        if (m.canonical) {
          if (!c) { c = document.createElement("link"); c.rel = "canonical"; document.head.appendChild(c); }
          c.href = m.canonical;
        }
      }).catch(() => {});
    }

    window.__redantRoute = () => route(false);
    window.addEventListener("popstate", () => route(true));
    window.addEventListener("hashchange", () => route(true));

    // Navigate between pages without a full reload
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href[0] !== "/" || href.startsWith("//") || href.startsWith("/admin") || href.startsWith("/api/")) return;
      if (/\.[a-z0-9]{2,5}($|\?)/i.test(href)) return;
      e.preventDefault();
      if (href !== window.location.pathname + window.location.search) history.pushState(null, "", href);
      route(true);
      const panel = document.getElementById("mobile-nav-panel");
      if (panel && panel.classList.contains("open")) { const b = document.getElementById("hamburger-btn"); b && b.click(); }
    });
    route(false);
  }

  // Compare Slider Logic
  function setupCompareSlider() {
    const c = document.getElementById("cmp");
    const r = document.getElementById("rng");
    if (!c || !r) return;

    function set() {
      c.style.setProperty("--p", r.value + "%");
    }
    r.addEventListener("input", set);
    set();
  }


  // ---------- Forms ----------
  function utm() { return { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign }; }

  function postLead(body) {
    return fetch("/api/public/lead", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ landing_page_slug: currentPath() }, utm(), body))
    }).then(r => r.json().then(d => ({ ok: r.ok, d })));
  }

  function thankYou(box, name) {
    const st = (siteData && siteData.settings) || {};
    const wa = "https://wa.me/" + (String(st.whatsapp || "94766441645").replace(/[^\d]/g, "")) + "?text=" + encodeURIComponent(WA_TEXT);
    box.innerHTML = "";
    box.style.display = "block";
    const a1 = document.createElement("a"); a1.href = wa; a1.target = "_blank"; a1.rel = "noopener"; a1.className = "js-wa"; a1.textContent = "chat to us on WhatsApp"; a1.style.textDecoration = "underline";
    const a2 = document.createElement("a"); a2.href = st["booking.url"] || "/contact"; a2.textContent = "book a 15-minute call"; a2.style.textDecoration = "underline";
    if (st["booking.url"]) { a2.target = "_blank"; a2.rel = "noopener"; }
    box.append("🎉 Thanks" + (name ? ", " + name : "") + ". Your review is on its way within 24 hours. In the meantime, ", a1, " or ", a2, ".");
  }

  function setupForms() {
    const revForm = document.getElementById("free-review-form");
    const revResp = document.getElementById("review-form-response");
    if (revForm) {
      revForm.onsubmit = function (e) {
        e.preventDefault();
        const btn = revForm.querySelector("button[type=submit]"); btn.disabled = true;
        const goal = document.getElementById("rev-goal").value;
        postLead({
          name: document.getElementById("rev-name").value, url: document.getElementById("rev-url").value,
          email: document.getElementById("rev-email").value, phone: document.getElementById("rev-phone").value,
          message: goal ? "What matters most: " + goal : "", source: "Free Review Page Form"
        }).then(({ ok, d }) => {
          if (ok && d.success) { revForm.reset(); thankYou(revResp, d.name); track("generate_lead", { source: "free_review" }); sessionStorage.setItem("redant_lead_sent", "1"); }
          else alert(d.error || "Sorry, that did not send. Please try again or message us on WhatsApp.");
        }).catch(() => alert("Sorry, that did not send. Please try again or message us on WhatsApp."))
          .finally(() => { btn.disabled = false; });
      };
    }

    const cForm = document.getElementById("contact-page-form");
    const cResp = document.getElementById("contact-form-response");
    if (cForm) {
      cForm.onsubmit = function (e) {
        e.preventDefault();
        const btn = cForm.querySelector("button[type=submit]"); btn.disabled = true;
        postLead({
          name: document.getElementById("c-name").value, email: document.getElementById("c-email").value,
          message: document.getElementById("c-msg").value, source: "Contact Page Form"
        }).then(({ ok, d }) => {
          if (ok && d.success) {
            cForm.reset(); cResp.style.display = "block";
            cResp.textContent = "✅ Message sent. We reply within one working hour in UK business hours (Mon to Fri, 8am to 6pm GMT).";
            track("generate_lead", { source: "contact" }); sessionStorage.setItem("redant_lead_sent", "1");
          } else alert(d.error || "Sorry, that did not send. Please try again.");
        }).catch(() => alert("Sorry, that did not send. Please try again."))
          .finally(() => { btn.disabled = false; });
      };
    }
  }

  // ---------- Cookie consent (PECR: a real Reject option) ----------
  function getConsent() { try { return JSON.parse(localStorage.getItem("redant_consent") || "null"); } catch (e) { return null; } }
  function setConsent(analytics) {
    localStorage.setItem("redant_consent", JSON.stringify({ analytics: !!analytics, at: Date.now() }));
    document.getElementById("cookie-banner").style.display = "none";
    if (analytics) loadAnalytics();
  }
  function setupConsent() {
    const banner = document.getElementById("cookie-banner");
    if (!banner) return;
    const panel = document.getElementById("cb-settings"), box = document.getElementById("cb-analytics");
    const settingsBtn = document.getElementById("settings-cookies");
    let open = false;
    banner.style.display = getConsent() ? "none" : "";
    document.getElementById("accept-cookies").onclick = () => setConsent(true);
    document.getElementById("reject-cookies").onclick = () => setConsent(false);
    settingsBtn.onclick = () => {
      if (!open) { open = true; panel.style.display = "block"; box.checked = !!(getConsent() || {}).analytics; settingsBtn.textContent = "Save choice"; }
      else { setConsent(box.checked); open = false; panel.style.display = "none"; settingsBtn.textContent = "Settings"; }
    };
    const link = document.getElementById("cookie-settings-link");
    if (link) link.onclick = e => { e.preventDefault(); banner.style.display = ""; open = false; settingsBtn.click(); };
  }

  // ---------- Analytics (only after consent) ----------
  let analyticsLoaded = false;
  function loadAnalytics() {
    const st = (siteData && siteData.settings) || {};
    const c = getConsent();
    if (analyticsLoaded || !c || !c.analytics) return;
    const ga = st["analytics.ga4_id"], px = st["analytics.meta_pixel_id"];
    if (/^G-[A-Z0-9]+$/i.test(ga || "")) {
      const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + ga; document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", ga, { anonymize_ip: true });
    }
    if (/^\d{6,20}$/.test(px || "")) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", px); window.fbq("track", "PageView");
    }
    analyticsLoaded = true;
  }
  function setupTracking() {
    document.addEventListener("click", function (e) {
      const a = e.target.closest("a.js-wa, a.js-phone, a.js-email");
      if (!a) return;
      track(a.classList.contains("js-wa") ? "whatsapp_click" : a.classList.contains("js-phone") ? "phone_click" : "email_click", { page_path: currentPath() });
    });
  }

  // ---------- Exit-intent / 40-second pop-up (one field first) ----------
  function setupPopup() {
    const dlg = document.getElementById("exit-popup");
    if (!dlg || typeof dlg.showModal !== "function") return;
    const msg = document.getElementById("popup-msg");
    const show = () => {
      if (sessionStorage.getItem("redant_popup_shown") || sessionStorage.getItem("redant_lead_sent")) return;
      if (["/free-review", "/contact", "/privacy", "/cookies", "/terms"].includes(currentPath())) return;
      if (document.querySelector("dialog[open]")) return;
      sessionStorage.setItem("redant_popup_shown", "1");
      dlg.showModal();
    };
    setTimeout(show, 40000);
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) {
      const armed = Date.now();
      document.addEventListener("mouseout", e => { if (!e.relatedTarget && e.clientY <= 0 && Date.now() - armed > 8000) show(); });
    }
    document.getElementById("popup-close").onclick = () => dlg.close();
    document.getElementById("popup-next").onclick = () => {
      const u = document.getElementById("popup-url");
      if (!u.value.trim()) { u.focus(); return; }
      document.getElementById("popup-step1").style.display = "none";
      document.getElementById("popup-step2").style.display = "block";
      document.getElementById("popup-email").focus();
    };
    document.getElementById("popup-form").onsubmit = e => {
      e.preventDefault();
      const email = document.getElementById("popup-email").value;
      postLead({ url: document.getElementById("popup-url").value, email, source: "Exit-intent popup" }).then(({ ok, d }) => {
        msg.style.display = "block";
        if (ok && d.success) {
          msg.textContent = "Thanks! Your review is on its way within 24 hours.";
          document.getElementById("popup-form").style.display = "none";
          track("generate_lead", { source: "popup" }); sessionStorage.setItem("redant_lead_sent", "1");
          setTimeout(() => dlg.close(), 3500);
        } else msg.textContent = d.error || "Sorry, that did not send.";
      }).catch(() => { msg.style.display = "block"; msg.textContent = "Sorry, that did not send."; });
    };
  }
})();
