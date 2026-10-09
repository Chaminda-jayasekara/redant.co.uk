// RedAnt Admin: content editors (page text, contact details, and every content table)
(function () {
  "use strict";

  const A = () => window.RedAntAdmin;

  function api(url, opts) {
    opts = opts || {};
    return fetch(url, Object.assign({}, opts, { headers: A().getHeaders() })).then(async res => {
      if (res.status === 401) { A().logout(); throw new Error("Session expired. Please log in again."); }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    });
  }

  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e[k] = v;
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(c => c && e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return e;
  }

  function flash(box, text, isErr) {
    box.style.display = "block";
    box.className = "msg" + (isErr ? " err" : "");
    box.textContent = (isErr ? "⚠️ " : "✅ ") + text;
    if (!isErr) setTimeout(() => { box.style.display = "none"; }, 6000);
  }

  document.addEventListener("admin-tab", e => {
    const id = e.detail;
    if (id === "tab-sitetext") loadSiteText();
    else if (id === "tab-contact") loadContact();
    else {
      const box = document.getElementById(id);
      if (box && box.dataset.table) loadTable(box);
    }
  });

  /* =====================================================================
     1. PAGE TEXT EDITOR  (reads the editable fields straight from index.html)
     ===================================================================== */
  let stFields = [];
  let stSaved = {};

  function defaultOf(el) {
    const type = el.dataset.cmsType || "text";
    const attr = el.dataset.cmsAttr;
    if (attr) return (el.getAttribute(attr) || "").trim();
    if (type === "heading") {
      let out = "";
      el.childNodes.forEach(n => {
        if (n.nodeType === 3) out += n.textContent;
        else if (n.nodeName === "SPAN") out += "*" + n.textContent + "*";
        else out += n.textContent;
      });
      return out.replace(/\s+/g, " ").trim();
    }
    if (type === "html") return el.innerHTML.trim();
    const pre = (el.getAttribute("style") || "").indexOf("pre-line") !== -1;
    const t = el.textContent;
    return pre ? t.split("\n").map(l => l.trim()).join("\n").trim() : t.replace(/\s+/g, " ").trim();
  }

  async function loadSiteText() {
    const wrap = document.getElementById("st-groups");
    wrap.innerHTML = '<p class="hint">Loading…</p>';
    try {
      const [html, saved] = await Promise.all([
        fetch("/index.html?t=" + Date.now()).then(r => r.text()),
        api("/api/admin/settings")
      ]);
      stSaved = saved.settings || {};
      const doc = new DOMParser().parseFromString(html, "text/html");
      stFields = Array.from(doc.querySelectorAll("[data-cms]")).map(el => ({
        key: el.dataset.cms,
        group: el.dataset.cmsGroup || "Other",
        label: el.dataset.cmsLabel || el.dataset.cms,
        type: el.dataset.cmsType || "text",
        def: defaultOf(el)
      }));
      renderSiteText();
    } catch (err) {
      wrap.innerHTML = "";
      wrap.appendChild(h("p", { class: "msg err", text: err.message }));
    }
  }

  function renderSiteText() {
    const wrap = document.getElementById("st-groups");
    wrap.innerHTML = "";
    const groups = new Map();
    stFields.forEach(f => { if (!groups.has(f.group)) groups.set(f.group, []); groups.get(f.group).push(f); });

    groups.forEach((fields, name) => {
      const pill = h("span", { class: "pill", text: fields.length + " fields" });
      const body = h("div", { class: "grp-body" });
      const det = h("details", { class: "grp" }, [h("summary", {}, [h("span", { text: name }), pill]), body]);

      fields.forEach(f => {
        const start = Object.prototype.hasOwnProperty.call(stSaved, f.key) ? stSaved[f.key] : f.def;
        const multiline = f.type === "textarea" || f.type === "html";
        const input = multiline
          ? h("textarea", { class: f.type === "html" ? "mono" : "", rows: f.type === "html" ? 4 : 3 })
          : h("input", { type: f.type === "url" ? "url" : "text" });
        input.value = start;
        const reset = h("button", { type: "button", class: "reset", text: "↺ reset to original" });
        const sub = f.type === "heading" ? h("div", { class: "sub", text: "Wrap words in *stars* to highlight them." })
                  : f.type === "html" ? h("div", { class: "sub", text: "Contains formatting. HTML tags are allowed here." }) : null;
        const field = h("div", { class: "cms-field" }, [h("label", {}, [h("span", { text: f.label }), reset]), input, sub]);
        f.input = input; f.field = field; f.pill = pill;

        const refresh = () => {
          field.classList.toggle("changed", input.value !== f.def);
          const n = fields.filter(x => x.input && x.input.value !== x.def).length;
          pill.textContent = fields.length + " fields" + (n ? " · " + n + " changed" : "");
          pill.classList.toggle("changed", n > 0);
        };
        f.refresh = refresh;
        input.addEventListener("input", refresh);
        reset.onclick = () => { input.value = f.def; refresh(); };
        body.appendChild(field);
        refresh();
      });
      wrap.appendChild(det);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const search = document.getElementById("st-search");
    if (search) search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll("#st-groups details.grp").forEach(det => {
        let any = false;
        det.querySelectorAll(".cms-field").forEach(fe => {
          const f = stFields.find(x => x.field === fe);
          const hit = !q || (f.label + " " + f.group + " " + f.input.value).toLowerCase().includes(q);
          fe.style.display = hit ? "" : "none";
          if (hit) any = true;
        });
        det.style.display = any ? "" : "none";
        det.open = !!q && any;
      });
    });

    const save = document.getElementById("st-save");
    if (save) save.onclick = async () => {
      const msg = document.getElementById("st-msg");
      const settings = {}, remove = [];
      stFields.forEach(f => {
        const v = f.input.value;
        if (v !== f.def && v.trim() !== "") settings[f.key] = v;
        else if (Object.prototype.hasOwnProperty.call(stSaved, f.key)) remove.push(f.key);
      });
      try {
        save.disabled = true;
        const res = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ settings, remove }) });
        Object.keys(settings).forEach(k => { stSaved[k] = settings[k]; });
        remove.forEach(k => { delete stSaved[k]; });
        flash(msg, res.message + " (Changes can take up to ~20 seconds to appear for visitors.)");
      } catch (err) { flash(msg, err.message, true); }
      finally { save.disabled = false; }
    };

    const cform = document.getElementById("contact-settings-form");
    if (cform) cform.onsubmit = async e => {
      e.preventDefault();
      const msg = document.getElementById("cs-msg");
      const map = { whatsapp: "cs-whatsapp", email: "cs-email", phone: "cs-phone", "booking.url": "cs-booking", "trust.company_details": "cs-company", "trust.ico": "cs-ico", "analytics.ga4_id": "cs-ga4", "analytics.meta_pixel_id": "cs-pixel", "analytics.gsc_verification": "cs-gsc" };
      const settings = {}, remove = [];
      Object.entries(map).forEach(([k, id]) => {
        const v = document.getElementById(id).value.trim();
        if (v) settings[k] = v; else remove.push(k);
      });
      try {
        const res = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ settings, remove }) });
        flash(msg, res.message);
      } catch (err) { flash(msg, err.message, true); }
    };
  });

  async function loadContact() {
    try {
      const { settings } = await api("/api/admin/settings");
      const m = { whatsapp: "cs-whatsapp", email: "cs-email", phone: "cs-phone", "booking.url": "cs-booking", "trust.company_details": "cs-company", "trust.ico": "cs-ico", "analytics.ga4_id": "cs-ga4", "analytics.meta_pixel_id": "cs-pixel", "analytics.gsc_verification": "cs-gsc" };
      Object.entries(m).forEach(([k, id]) => { document.getElementById(id).value = settings[k] || ""; });
    } catch (err) { flash(document.getElementById("cs-msg"), err.message, true); }
  }

  /* =====================================================================
     2. TABLE EDITORS (services, pricing, portfolio, testimonials, ...)
     ===================================================================== */
  const SCHEMAS = {
    landing_pages: {
      title: "Service Pages", help: "The top banner of each service page: headline, sub-text, button and Google title. Wrap headline words in *stars* to highlight them.",
      titleField: "title", subField: "headline", canAdd: false, canDelete: false,
      fields: [
        { k: "title", l: "Page name (internal)", t: "text" },
        { k: "slug", l: "Page address", t: "readonly" },
        { k: "headline", l: "Main headline", t: "text", wide: true, sub: "Example: Your website, *refreshed in 48 hours.*" },
        { k: "subtext", l: "Sub-text under the headline", t: "textarea", wide: true },
        { k: "cta_text", l: "Main button text", t: "text" },
        { k: "meta_title", l: "Google title (max 60 characters)", t: "text" },
        { k: "meta_desc", l: "Google description", t: "textarea", wide: true }
      ]
    },
    services: {
      title: "Services", help: "Service cards on the homepage ('What do you need') and the Services page. The six service pages are fixed, so services can be edited but not added or removed here.",
      titleField: "name", subField: "price_from", subPrefix: "from £", canAdd: false, canDelete: false,
      fields: [
        { k: "name", l: "Service name", t: "text" },
        { k: "slug", l: "Page address", t: "readonly" },
        { k: "icon", l: "Icon (an emoji)", t: "text" },
        { k: "price_from", l: "Starting price (£)", t: "number" },
        { k: "short_desc", l: "Short description (Services page)", t: "textarea", wide: true },
        { k: "path_card_text", l: "Quote on homepage card", t: "text", wide: true },
        { k: "order_num", l: "Order (1 = first)", t: "number" }
      ]
    },
    pricing_plans: {
      title: "Pricing Plans", help: "Cards on the Pricing page. The first plan is highlighted.",
      titleField: "name", subField: "price", canAdd: true, canDelete: true,
      fields: [
        { k: "name", l: "Plan name", t: "text" },
        { k: "price", l: "Price (as shown, e.g. £199 or £29/mo)", t: "text" },
        { k: "billing_type", l: "Billing note (e.g. one-off payment)", t: "text" },
        { k: "badge", l: "Badge (optional, e.g. Most popular)", t: "text" },
        { k: "features_json", l: "What's included (one per line)", t: "list", wide: true },
        { k: "order_num", l: "Order (1 = first)", t: "number" }
      ]
    },
    projects: {
      title: "Portfolio", help: "Client sites shown on the homepage and Work page. Visitors get a 'Visit site' button.",
      titleField: "name", subField: "industry", canAdd: true, canDelete: true,
      fields: [
        { k: "name", l: "Project name", t: "text" },
        { k: "url", l: "Website address (https://…)", t: "text" },
        { k: "industry", l: "Industry", t: "text" },
        { k: "region", l: "Region", t: "select", options: ["UK", "International"] },
        { k: "initial", l: "Tile letter", t: "text" },
        { k: "order_num", l: "Order (1 = first)", t: "number" },
        { k: "desc", l: "Short description", t: "textarea", wide: true },
        { k: "built_at_webpixel", l: "Show the “Built at WebPixel UK” tag", t: "check" }
      ]
    },
    testimonials: {
      title: "Testimonials", help: "Client quotes shown on the homepage.",
      titleField: "client_name", subField: "business", canAdd: true, canDelete: true,
      fields: [
        { k: "client_name", l: "Client name", t: "text" },
        { k: "business", l: "Business", t: "text" },
        { k: "town", l: "Town / city", t: "text" },
        { k: "order_num", l: "Order (1 = first)", t: "number" },
        { k: "quote", l: "Quote", t: "textarea", wide: true }
      ]
    },
    industries: {
      title: "Who We Help (industry pages)", help: "Each industry gets its own page at /web-design-for-<slug>. The heading and intro are what visitors and Google see first.",
      titleField: "name", subField: "slug", canAdd: true, canDelete: true,
      fields: [
        { k: "name", l: "Industry name", t: "text" },
        { k: "slug", l: "Page address ending (e.g. clinics)", t: "text", sub: "Page will be /web-design-for-<this>" },
        { k: "h1", l: "Page heading", t: "text", wide: true },
        { k: "intro", l: "Intro paragraph", t: "textarea", wide: true },
        { k: "problems_json", l: "Typical website problems (one per line)", t: "list", wide: true },
        { k: "faqs_json", l: "FAQs (one per line: Question | Answer)", t: "qa", wide: true },
        { k: "cta_text", l: "Button text on the hub page", t: "text" },
        { k: "meta_title", l: "Google title (max 60 characters)", t: "text" },
        { k: "meta_desc", l: "Google description (max 155 characters)", t: "textarea", wide: true },
        { k: "order_num", l: "Order (1 = first)", t: "number" }
      ]
    },
    locations: {
      title: "City Pages", help: "One page per city at /web-design-<city>. Give each a genuinely different intro. Add a real local example only if you have one; it stays hidden while empty.",
      titleField: "city", subField: "slug", canAdd: true, canDelete: true,
      fields: [
        { k: "city", l: "City", t: "text" },
        { k: "slug", l: "Page address (e.g. web-design-leeds)", t: "text" },
        { k: "h1", l: "Page heading", t: "text", wide: true },
        { k: "intro", l: "Intro paragraph (unique to this city)", t: "textarea", wide: true },
        { k: "local_example", l: "Local example (optional, only if true)", t: "textarea", wide: true },
        { k: "meta_title", l: "Google title (max 60 characters)", t: "text" },
        { k: "meta_desc", l: "Google description (max 155 characters)", t: "textarea", wide: true },
        { k: "order_num", l: "Order (1 = first)", t: "number" }
      ]
    },
    faqs: {
      title: "FAQs", help: "Questions and answers on the FAQ page.",
      titleField: "question", canAdd: true, canDelete: true,
      fields: [
        { k: "question", l: "Question", t: "text", wide: true },
        { k: "answer", l: "Answer", t: "textarea", wide: true },
        { k: "order_num", l: "Order (1 = first)", t: "number" }
      ]
    },
    blog_posts: {
      title: "Blog Posts", help: "Articles on the Resources page. The body can use HTML such as <p>, <h3>, <ul>.",
      titleField: "title", subField: "publish_date", canAdd: true, canDelete: true,
      fields: [
        { k: "title", l: "Title", t: "text", wide: true },
        { k: "category", l: "Category", t: "text" },
        { k: "publish_date", l: "Publish date (YYYY-MM-DD)", t: "text" },
        { k: "status", l: "Status", t: "select", options: ["published", "draft"] },
        { k: "excerpt", l: "Short excerpt (shown on the card)", t: "textarea", wide: true },
        { k: "body", l: "Article body (HTML allowed)", t: "html", wide: true }
      ]
    }
  };

  function buildField(f, value) {
    let get, node;
    const raw = value === null || value === undefined ? "" : value;
    if (f.t === "readonly") {
      node = h("span", { class: "cms-readonly", text: raw || "(auto)" });
      get = () => undefined;
    } else if (f.t === "textarea" || f.t === "html") {
      node = h("textarea", { class: f.t === "html" ? "mono" : "", rows: f.t === "html" ? 12 : 3 });
      node.value = raw; get = () => node.value;
    } else if (f.t === "list") {
      let lines = null;
      try { const arr = JSON.parse(raw || "[]"); if (Array.isArray(arr) && arr.every(x => typeof x === "string")) lines = arr; } catch (e) {}
      node = h("textarea", { rows: 5 });
      if (lines) { node.value = lines.join("\n"); get = () => JSON.stringify(node.value.split("\n").map(s => s.trim()).filter(Boolean)); }
      else { node.value = raw; get = () => node.value; }
    } else if (f.t === "qa") {
      let lines = null;
      try { const arr = JSON.parse(raw || "[]"); if (Array.isArray(arr) && arr.every(x => x && typeof x.q === "string")) lines = arr.map(x => x.q + " | " + x.a); } catch (e) {}
      node = h("textarea", { rows: 7 });
      node.value = lines ? lines.join("\n") : raw;
      get = () => JSON.stringify(node.value.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf("|"); return i < 0 ? { q: l, a: "" } : { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() }; }));
    } else if (f.t === "select") {
      node = h("select", {}, f.options.map(o => h("option", { value: o, text: o })));
      node.value = f.options.includes(raw) ? raw : f.options[0]; get = () => node.value;
    } else if (f.t === "check") {
      node = h("input", { type: "checkbox" }); node.checked = Number(raw) === 1; get = () => (node.checked ? 1 : 0);
      const field = h("div", { class: "cms-field check" + (f.wide ? " wide" : "") }, [h("label", { class: "inline" }, [node, h("span", { text: f.l })])]);
      return { field, get };
    } else {
      node = h("input", { type: f.t === "number" ? "number" : "text" });
      node.value = raw; get = () => node.value;
    }
    const field = h("div", { class: "cms-field" + (f.wide ? " wide" : "") }, [h("label", {}, [h("span", { text: f.l })]), node, f.sub ? h("div", { class: "sub", text: f.sub }) : null]);
    return { field, get };
  }

  function itemCard(table, schema, row, onChange) {
    const isNew = !row;
    const data = row || {};
    const titleOf = r => (r && r[schema.titleField]) || (isNew ? "New " + schema.title.toLowerCase().replace(/s$/, "") : "(untitled)");
    const sum = h("summary", {}, [
      h("span", {}, [h("span", { text: titleOf(data) }), h("span", { class: "item-sub", text: schema.subField && data[schema.subField] ? (schema.subPrefix || "") + data[schema.subField] : "" })]),
      h("span", { class: "pill", text: isNew ? "NEW" : "Edit" })
    ]);
    const grid = h("div", { class: "fields-grid" });
    const built = schema.fields.map(f => { const b = buildField(f, data[f.k]); grid.appendChild(b.field); return { f, b }; });
    const msg = h("div", { class: "msg", style: "display:none;" });
    const actions = h("div", { class: "item-actions" });
    const body = h("div", { class: "item-body" }, [grid, actions, msg]);
    const det = h("details", { class: "item" }, [sum, body]);
    if (isNew) det.open = true;

    const collect = () => { const o = {}; built.forEach(({ f, b }) => { const v = b.get(); if (v !== undefined) o[f.k] = v; }); return o; };

    actions.appendChild(h("button", {
      type: "button", class: "btn sm mint", text: isNew ? "➕ Add" : "💾 Save",
      onclick: async ev => {
        const btn = ev.currentTarget; btn.disabled = true;
        try {
          const payload = collect();
          if (isNew) { await api("/api/admin/content/" + table, { method: "POST", body: JSON.stringify(payload) }); onChange(); }
          else {
            const res = await api("/api/admin/content/" + table + "/" + row.id, { method: "PUT", body: JSON.stringify(payload) });
            sum.querySelector("span span").textContent = titleOf(res.row);
            flash(msg, "Saved. Visitors will see it within ~20 seconds.");
          }
        } catch (err) { flash(msg, err.message, true); }
        finally { btn.disabled = false; }
      }
    }));

    if (!isNew && schema.canDelete) {
      actions.appendChild(h("button", {
        type: "button", class: "btn sm danger", text: "🗑 Delete",
        onclick: async () => {
          if (!confirm("Delete “" + titleOf(data) + "”? This cannot be undone.")) return;
          try { await api("/api/admin/content/" + table + "/" + row.id, { method: "DELETE" }); onChange(); }
          catch (err) { flash(msg, err.message, true); }
        }
      }));
    }
    if (!isNew && table === "landing_pages" && row.slug) {
      actions.appendChild(h("a", { class: "btn sm yellow", href: "/#" + row.slug, target: "_blank", rel: "noopener", text: "View page ↗" }));
    }
    if (!isNew && table === "projects" && row.url) {
      actions.appendChild(h("a", { class: "btn sm yellow", href: row.url, target: "_blank", rel: "noopener", text: "Open site ↗" }));
    }
    return det;
  }

  async function loadTable(box) {
    const table = box.dataset.table;
    const schema = SCHEMAS[table];
    if (!schema) return;
    box.innerHTML = '<p class="hint">Loading…</p>';
    try {
      const rows = await api("/api/admin/content/" + table);
      box.innerHTML = "";
      const reload = () => loadTable(box);
      const head = h("div", { class: "card" }, [h("div", { class: "toolbar" }, [
        h("div", {}, [h("h3", { text: schema.title }), h("p", { class: "hint", text: schema.help })]),
        schema.canAdd ? h("button", { type: "button", class: "btn", text: "➕ Add new", onclick: () => {
          const existing = box.querySelector("details.item.is-new");
          if (existing) { existing.open = true; return; }
          const card = itemCard(table, schema, null, reload);
          card.classList.add("is-new");
          list.prepend(card);
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        } }) : null
      ])]);
      const list = h("div", {});
      rows.forEach(r => list.appendChild(itemCard(table, schema, r, reload)));
      if (!rows.length) list.appendChild(h("p", { class: "hint", text: "Nothing here yet." }));
      box.appendChild(head);
      box.appendChild(list);
    } catch (err) {
      box.innerHTML = "";
      box.appendChild(h("p", { class: "msg err", text: err.message }));
    }
  }
})();
