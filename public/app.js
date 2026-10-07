// RedAnt UK Public Application Frontend Logic (v2 Architecture)
(function () {
  let siteData = null;
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
    fetchSiteData();
    setupRouting();
    setupMobileNav();
    setupCompareSlider();
    setupCheckupTool();
    setupForms();
    setupCookieBanner();
  });

  // Fetch Public Content from Express API
  function fetchSiteData() {
    fetch("/api/public/content")
      .then(res => res.json())
      .then(data => {
        siteData = data;
        renderAllSections(data);
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
    if (st.whatsapp) {
      document.querySelectorAll("a.js-wa").forEach(a => {
        a.href = "https://wa.me/" + digits(st.whatsapp);
        if (a.classList.contains("js-wa-text")) a.textContent = st.whatsapp;
      });
    }
    if (st.email) {
      document.querySelectorAll("a.js-email").forEach(a => {
        a.href = "mailto:" + st.email;
        if (a.classList.contains("js-email-text")) a.textContent = st.email;
      });
    }
    if (st.phone) {
      document.querySelectorAll("a.js-phone").forEach(a => {
        a.href = "tel:" + String(st.phone).replace(/[^\d+]/g, "");
      });
    }
    if (st["seo.title"]) document.title = st["seo.title"];
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
      card.href = `#${s.slug}`;
      card.className = "path-card";
      card.innerHTML = `
        <div class="ico">${s.icon || '⚡'}</div>
        <h3 style="font-size:1.15rem; margin-bottom:6px;">${s.name}</h3>
        <p style="font-size:0.9rem; font-weight:600; margin:0 0 12px; color:var(--navy); opacity:0.9;">"${s.path_card_text || s.short_desc}"</p>
        <span class="btn sm yellow" style="align-self:flex-start;">Explore ${s.name} →</span>
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

  // Render Testimonials
  function renderTestimonials(testimonials) {
    const container = document.getElementById("home-testimonials");
    if (!container) return;
    container.innerHTML = "";

    testimonials.forEach(t => {
      const card = document.createElement("div");
      card.className = "card testi-card";
      card.innerHTML = `
        <div class="stars">★★★★★</div>
        <p style="font-weight:600; font-size: 1.05rem;">"${t.quote}"</p>
        <div style="margin-top: 14px; font-weight: 800;">— ${t.client_name}</div>
        <small style="color: var(--navy); opacity: 0.8; font-weight: 600;">${t.business}, ${t.town}</small>
      `;
      container.appendChild(card);
    });
  }

  // Render Services
  function renderServices(services) {
    const grid = document.getElementById("services-grid");
    if (!grid) return;
    grid.innerHTML = "";

    services.forEach(s => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "28px";
      card.innerHTML = `
        <div class="ico" style="background:var(--yellow);">${s.icon || '⚡'}</div>
        <h3>${s.name}</h3>
        <p style="font-size:0.95rem;">${s.short_desc}</p>
        <div style="font-size:1.6rem; font-weight:800; color:var(--red); margin: 12px 0;">From £${s.price_from}</div>
        <a href="#${s.slug}" class="btn sm" style="width:100%;">View Service Landing Page →</a>
      `;
      grid.appendChild(card);
    });
  }

  // Render Pricing Cards
  function renderPricing(plans) {
    const box = document.getElementById("pricing-cards");
    if (!box) return;
    box.innerHTML = "";

    plans.forEach((p, idx) => {
      let feats = [];
      try { feats = JSON.parse(p.features_json || "[]"); } catch (e) {}

      const card = document.createElement("div");
      card.className = `card price-card ${idx === 0 ? 'featured' : ''}`;
      card.innerHTML = `
        <div>
          ${p.badge ? `<span class="badge">${p.badge}</span>` : ''}
          <h3>${p.name}</h3>
          <div class="num">${p.price}</div>
          <small style="font-weight:700; display:block; margin-bottom:14px;">${p.billing_type}</small>
          <ul style="line-height:1.7; font-weight:600; font-size:0.95rem; margin-left:18px;">
            ${feats.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
        <a href="#review" class="btn ${idx === 0 ? '' : 'alt'}" style="margin-top:24px; width:100%;">Get Started</a>
      `;
      box.appendChild(card);
    });
  }

  // Render Industries
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
        <h3 style="color:var(--violet); font-size:1.5rem;">${ind.name}</h3>
        <p style="font-weight:600; margin-top:8px;">${ind.intro}</p>
        <h4 style="margin-top:16px; font-size:1rem;">Typical Website Problems:</h4>
        <ul style="margin: 8px 0 20px 20px; line-height: 1.6; font-size: 0.92rem;">
          ${probs.map(pr => `<li>❌ ${pr}</li>`).join('')}
        </ul>
        <a href="#review" class="btn sm yellow">${ind.cta_text || 'Get a Free Audit'}</a>
      `;
      grid.appendChild(card);
    });
  }

  // Render Blog
  function renderBlog(posts) {
    const grid = document.getElementById("blog-grid");
    if (!grid) return;
    grid.innerHTML = "";

    posts.forEach(post => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "24px";
      card.innerHTML = `
        <span class="badge">${post.category || 'Guide'}</span>
        <h3 style="margin-top:8px;">${post.title}</h3>
        <p style="font-size:0.92rem; margin:10px 0 16px;">${post.excerpt}</p>
        <button class="btn sm alt read-blog-btn" data-slug="${post.slug}">Read Article →</button>
      `;
      grid.appendChild(card);
    });

    document.querySelectorAll(".read-blog-btn").forEach(btn => {
      btn.onclick = function () {
        const slug = btn.dataset.slug;
        const post = posts.find(p => p.slug === slug);
        if (post) openBlogModal(post);
      };
    });
  }

  function openBlogModal(post) {
    const dlg = document.getElementById("blog-modal");
    document.getElementById("blog-modal-title").textContent = post.title;
    document.getElementById("blog-modal-body").innerHTML = `
      <small style="color:var(--violet); font-weight:800;">${post.category} · Published ${post.publish_date}</small>
      <div style="margin-top:20px; line-height:1.7;">${post.body}</div>
    `;
    dlg.showModal();
  }

  document.getElementById("blog-modal-close").onclick = function () {
    document.getElementById("blog-modal").close();
  };

  // Render FAQs Accordion
  function renderFAQs(faqs) {
    const container = document.getElementById("faq-accordion-container");
    if (!container) return;
    container.innerHTML = "";

    faqs.forEach(f => {
      const item = document.createElement("div");
      item.className = "faq-item";
      item.innerHTML = `
        <div class="faq-q">${f.question} <span>➕</span></div>
        <div class="faq-a"><p style="margin:0;">${f.answer}</p></div>
      `;

      item.querySelector(".faq-q").onclick = function () {
        item.classList.toggle("open");
        item.querySelector("span").textContent = item.classList.contains("open") ? "➖" : "➕";
      };

      container.appendChild(item);
    });
  }

  // Interactive Free Website Check-up Tool Logic
  function setupCheckupTool() {
    const form = document.getElementById("checkup-form");
    const resultsBox = document.getElementById("checkup-results");

    if (!form) return;

    form.onsubmit = function (e) {
      e.preventDefault();
      const url = document.getElementById("checkup-url").value;
      const email = document.getElementById("checkup-email").value;

      fetch("/api/public/checkup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, email })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.scores) {
            resultsBox.style.display = "block";
            document.getElementById("checkup-grade-title").textContent = `Audit Results for ${data.url} (${data.scores.overallGrade})`;
            document.getElementById("gauge-speed").textContent = data.scores.speedScore + "/100";
            document.getElementById("gauge-mobile").textContent = data.scores.mobileScore + "/100";
            document.getElementById("gauge-seo").textContent = data.scores.seoScore + "/100";

            const recsList = document.getElementById("checkup-recs");
            recsList.innerHTML = "";
            data.scores.recommendations.forEach(r => {
              const li = document.createElement("li");
              li.textContent = r;
              recsList.appendChild(li);
            });

            resultsBox.scrollIntoView({ behavior: "smooth" });
          }
        })
        .catch(() => alert("Check-up failed."));
    };
  }

  // Routing System (Supports Home + 6 Service Landing Pages)
  function setupRouting() {
    function route() {
      const hash = window.location.hash.replace("#", "") || "home";
      const validViews = [
        "home", "services", "pricing", "work", "industries", "review", "about", "blog", "faq", "contact",
        "48-hour-website-refresh", "website-design", "wordpress-development", "local-seo", "care-plans", "brand-and-social-graphics",
        "privacy", "cookies", "terms"
      ];
      const target = validViews.includes(hash) ? hash : "home";

      document.querySelectorAll(".page-view").forEach(el => el.classList.remove("active"));
      const targetView = document.getElementById("view-" + target);
      if (targetView) targetView.classList.add("active");

      // Check if Ad Version mode requested in query string (?ad=1)
      if (urlParams.get("ad") === "1") {
        document.body.classList.add("ad-mode");
      } else {
        document.body.classList.remove("ad-mode");
      }

      if (siteData && siteData.landingPages) {
        const lp = siteData.landingPages.find(x => x.slug === target);
        if (lp && lp.meta_title) document.title = lp.meta_title;
        else if (siteData.settings && siteData.settings["seo.title"]) document.title = siteData.settings["seo.title"];
        const md = document.querySelector('meta[name="description"]');
        if (md) {
          if (lp && lp.meta_desc) md.setAttribute("content", lp.meta_desc);
          else if (siteData.settings && siteData.settings["seo.description"]) md.setAttribute("content", siteData.settings["seo.description"]);
        }
      }

      window.scrollTo(0, 0);
    }

    window.addEventListener("hashchange", route);
    route();
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

  // Form Submissions (Free Review & Contact) with UTM parameters
  function setupForms() {
    const currentSlug = window.location.hash.replace("#", "") || "home";

    // Free Review Form
    const revForm = document.getElementById("free-review-form");
    const revResp = document.getElementById("review-form-response");

    if (revForm) {
      revForm.onsubmit = function (e) {
        e.preventDefault();
        const body = {
          name: document.getElementById("rev-name").value,
          url: document.getElementById("rev-url").value,
          email: document.getElementById("rev-email").value,
          source: "Free Review Page Form",
          landing_page_slug: currentSlug,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign
        };

        fetch("/api/public/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              revForm.reset();
              revResp.style.display = "block";
              revResp.textContent = "🎉 " + data.message;
            } else {
              alert(data.error || "Failed to submit.");
            }
          })
          .catch(() => alert("Submission failed."));
      };
    }

    // Contact Form
    const cForm = document.getElementById("contact-page-form");
    const cResp = document.getElementById("contact-form-response");

    if (cForm) {
      cForm.onsubmit = function (e) {
        e.preventDefault();
        const body = {
          name: document.getElementById("c-name").value,
          email: document.getElementById("c-email").value,
          message: document.getElementById("c-msg").value,
          source: "Contact Page Form",
          landing_page_slug: currentSlug,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign
        };

        fetch("/api/public/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              cForm.reset();
              cResp.style.display = "block";
              cResp.textContent = "✅ Message sent! We will reply within 2 hours during UK working hours.";
            } else {
              alert(data.error || "Failed to send.");
            }
          })
          .catch(() => alert("Submission failed."));
      };
    }
  }

  // Cookie Banner Logic
  function setupCookieBanner() {
    const banner = document.getElementById("cookie-banner");
    const acceptBtn = document.getElementById("accept-cookies");

    if (!banner || !acceptBtn) return;

    if (localStorage.getItem("redant_cookies_accepted")) {
      banner.style.display = "none";
    }

    acceptBtn.onclick = function () {
      localStorage.setItem("redant_cookies_accepted", "true");
      banner.style.display = "none";
    };
  }
})();
