// RedAnt UK Admin Dashboard JavaScript Logic (v2 Architecture)
(function () {
  let authToken = localStorage.getItem("redant_admin_token") || null;
  let activeLeadId = null;

  document.addEventListener("DOMContentLoaded", function () {
    if (authToken) {
      showAdminMain();
    } else {
      showLoginOverlay();
    }

    setupLogin();
    setupTabNavigation();
    setupOfferForm();
    setupProjectsForm();
    setupBlogForm();
    setupSettingsForm();
    setupLeadModal();
  });

  function getHeaders() {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + authToken
    };
  }

  function showLoginOverlay() {
    document.getElementById("login-overlay").style.display = "grid";
    document.getElementById("admin-main").style.display = "none";
  }

  function showAdminMain() {
    document.getElementById("login-overlay").style.display = "none";
    document.getElementById("admin-main").style.display = "flex";
    loadDashboardData();
  }

  function setupLogin() {
    const loginForm = document.getElementById("admin-login-form");
    const errBox = document.getElementById("login-error");

    loginForm.onsubmit = function (e) {
      e.preventDefault();
      const email = document.getElementById("admin-email").value;
      const password = document.getElementById("admin-pass").value;

      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
        .then(res => res.json())
        .then(data => {
          if (data.token) {
            authToken = data.token;
            localStorage.setItem("redant_admin_token", authToken);
            document.getElementById("admin-user-email").textContent = data.user.email;
            showAdminMain();
          } else {
            errBox.style.display = "block";
            errBox.textContent = data.error || "Login failed.";
          }
        })
        .catch(() => {
          errBox.style.display = "block";
          errBox.textContent = "Server error during login.";
        });
    };

    document.getElementById("admin-logout").onclick = function () {
      authToken = null;
      localStorage.removeItem("redant_admin_token");
      showLoginOverlay();
    };
  }

  function setupTabNavigation() {
    const buttons = document.querySelectorAll("#admin-nav button");
    buttons.forEach(btn => {
      btn.onclick = function () {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const targetTab = btn.dataset.tab;
        document.querySelectorAll(".tab-view").forEach(tab => tab.style.display = "none");
        const activeTabEl = document.getElementById(targetTab);
        if (activeTabEl) activeTabEl.style.display = "block";

        document.getElementById("current-tab-title").textContent = btn.textContent.replace(/^[^\s]+\s/, "");

        if (targetTab === "tab-dashboard") loadDashboardData();
        if (targetTab === "tab-leads") loadLeadsData();
        if (targetTab === "tab-landing") loadLandingPagesData();
        if (targetTab === "tab-campaigns") loadCampaignsData();
        if (targetTab === "tab-offer") loadOfferData();
        if (targetTab === "tab-projects") loadProjectsData();
      };
    });
  }

  function loadDashboardData() {
    fetch("/api/admin/dashboard", { headers: getHeaders() })
      .then(res => {
        if (res.status === 401) { logout(); return; }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        document.getElementById("dash-total-leads").textContent = data.stats.total;
        document.getElementById("dash-new-leads").textContent = data.stats.new;
        document.getElementById("dash-checkups").textContent = data.stats.checkups || 0;

        if (data.offer) {
          document.getElementById("dash-offer-price").textContent = "£" + data.offer.offer_price;
        }

        const recentTable = document.getElementById("dash-recent-table");
        recentTable.innerHTML = "";
        data.recentLeads.forEach(l => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${l.created_at ? l.created_at.split('T')[0] : 'Today'}</td>
            <td><strong>${l.name}</strong></td>
            <td>${l.business || l.url || '-'}</td>
            <td>${l.email}</td>
            <td><small>${l.source}</small></td>
            <td><span class="status-pill status-${l.status}">${l.status}</span></td>
          `;
          recentTable.appendChild(tr);
        });
      });
  }

  function loadLeadsData() {
    const filter = document.getElementById("leads-filter-select").value;
    fetch(`/api/admin/leads?status=${filter}`, { headers: getHeaders() })
      .then(res => res.json())
      .then(leads => {
        const tbody = document.getElementById("leads-full-table");
        tbody.innerHTML = "";

        leads.forEach(l => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>#${l.id}</td>
            <td>${l.created_at ? l.created_at.split('T')[0] : '-'}</td>
            <td><strong>${l.name}</strong><br><small>${l.business || ''}</small></td>
            <td><a href="${l.url}" target="_blank">${l.url || l.phone || l.email}</a></td>
            <td><small>${l.source}</small></td>
            <td><small>${l.utm_source ? l.utm_source + ' / ' + l.utm_campaign : 'Direct'}</small></td>
            <td><span class="status-pill status-${l.status}">${l.status}</span></td>
            <td><button class="btn sm alt view-lead-btn" data-id="${l.id}">View / Edit</button></td>
          `;
          tbody.appendChild(tr);
        });

        document.querySelectorAll(".view-lead-btn").forEach(btn => {
          btn.onclick = function () {
            const leadId = btn.dataset.id;
            const lead = leads.find(item => item.id == leadId);
            if (lead) openLeadModal(lead);
          };
        });
      });
  }

  document.getElementById("leads-filter-select").onchange = loadLeadsData;

  function openLeadModal(lead) {
    activeLeadId = lead.id;
    const dlg = document.getElementById("lead-modal");
    document.getElementById("lead-modal-title").textContent = `Lead #${lead.id} - ${lead.name}`;
    document.getElementById("lead-modal-body").innerHTML = `
      <strong>Business:</strong> ${lead.business || 'N/A'}<br>
      <strong>Website URL:</strong> <a href="${lead.url}" target="_blank">${lead.url || 'N/A'}</a><br>
      <strong>Email:</strong> ${lead.email}<br>
      <strong>Phone / WhatsApp:</strong> ${lead.phone || 'N/A'}<br>
      <strong>Source Page:</strong> ${lead.source}<br>
      <strong>UTM Source:</strong> ${lead.utm_source || 'Direct'}<br>
      <strong>UTM Campaign:</strong> ${lead.utm_campaign || 'N/A'}<br>
      <strong>Submitted Message / Audit Notes:</strong><br>
      <div style="background:#f4f3f8; padding:10px; border-radius:8px; margin-top:6px;">${lead.message || 'No specific notes.'}</div>
    `;

    document.getElementById("lead-modal-status").value = lead.status;
    document.getElementById("lead-modal-notes").value = lead.notes || "";
    dlg.showModal();
  }

  function setupLeadModal() {
    const dlg = document.getElementById("lead-modal");
    document.getElementById("close-lead-modal").onclick = function () { dlg.close(); };

    document.getElementById("save-lead-modal").onclick = function () {
      const status = document.getElementById("lead-modal-status").value;
      const notes = document.getElementById("lead-modal-notes").value;

      fetch(`/api/admin/leads/${activeLeadId}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ status, notes })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            dlg.close();
            loadLeadsData();
          }
        });
    };

    document.getElementById("delete-lead-modal").onclick = function () {
      if (confirm("Are you sure you want to permanently delete this lead data? (GDPR Action)")) {
        fetch(`/api/admin/leads/${activeLeadId}`, {
          method: "DELETE",
          headers: getHeaders()
        })
          .then(res => res.json())
          .then(() => {
            dlg.close();
            loadLeadsData();
          });
      }
    };
  }

  // Load & Manage Landing Pages
  function loadLandingPagesData() {
    fetch("/api/admin/landing-pages", { headers: getHeaders() })
      .then(res => res.json())
      .then(pages => {
        const tbody = document.getElementById("landing-pages-table");
        tbody.innerHTML = "";

        pages.forEach(p => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><code>/${p.slug}</code></td>
            <td><strong>${p.title}</strong></td>
            <td>${p.headline}</td>
            <td>£${p.price_from}</td>
            <td>
              <label style="cursor:pointer; font-weight:800;">
                <input type="checkbox" class="ad-toggle" data-slug="${p.slug}" ${p.ad_version ? 'checked' : ''}>
                Ad Version (No Nav)
              </label>
            </td>
            <td><a href="/#${p.slug}" target="_blank" class="btn sm yellow">Preview Page</a></td>
          `;
          tbody.appendChild(tr);
        });

        document.querySelectorAll(".ad-toggle").forEach(chk => {
          chk.onchange = function () {
            const slug = chk.dataset.slug;
            const page = pages.find(item => item.slug === slug);
            if (page) {
              fetch(`/api/admin/landing/${slug}`, {
                method: "PUT",
                headers: getHeaders(),
                body: JSON.stringify({
                  headline: page.headline,
                  subtext: page.subtext,
                  cta_text: page.cta_text,
                  price_from: page.price_from,
                  ad_version: chk.checked
                })
              });
            }
          };
        });
      });
  }

  // Load Campaign Analytics
  function loadCampaignsData() {
    fetch("/api/admin/campaigns", { headers: getHeaders() })
      .then(res => res.json())
      .then(data => {
        const tbody = document.getElementById("campaigns-source-table");
        tbody.innerHTML = "";

        data.pageBreakdown.forEach(row => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${row.source}</strong></td>
            <td><span class="status-pill status-Won">${row.lead_count} lead(s)</span></td>
          `;
          tbody.appendChild(tr);
        });
      });
  }

  function loadOfferData() {
    fetch("/api/admin/offer", { headers: getHeaders() })
      .then(res => res.json())
      .then(offer => {
        if (!offer) return;
        document.getElementById("off-label").value = offer.label || "launch offer";
        document.getElementById("off-price").value = offer.offer_price || 199;
        document.getElementById("off-regular").value = offer.regular_price || 349;
        document.getElementById("off-active").checked = offer.active === 1;
      });
  }

  function setupOfferForm() {
    const form = document.getElementById("offer-edit-form");
    const resp = document.getElementById("offer-resp");

    form.onsubmit = function (e) {
      e.preventDefault();
      const body = {
        label: document.getElementById("off-label").value,
        offer_price: parseInt(document.getElementById("off-price").value),
        regular_price: parseInt(document.getElementById("off-regular").value),
        active: document.getElementById("off-active").checked
      };

      fetch("/api/admin/offer", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(body)
      })
        .then(res => res.json())
        .then(data => {
          resp.style.display = "block";
          resp.textContent = "✅ " + data.message;
        });
    };
  }

  function loadProjectsData() {
    fetch("/api/public/content")
      .then(res => res.json())
      .then(data => {
        const tbody = document.getElementById("projects-table");
        tbody.innerHTML = "";

        data.projects.forEach(p => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${p.name}</strong></td>
            <td>${p.region || 'UK'}</td>
            <td>${p.industry || 'General'}</td>
            <td><a href="${p.url}" target="_blank">${p.url}</a></td>
            <td><button class="btn sm del-proj-btn" data-id="${p.id}" style="background:var(--pink);">Delete</button></td>
          `;
          tbody.appendChild(tr);
        });

        document.querySelectorAll(".del-proj-btn").forEach(btn => {
          btn.onclick = function () {
            if (confirm("Delete project?")) {
              fetch(`/api/admin/projects/${btn.dataset.id}`, {
                method: "DELETE",
                headers: getHeaders()
              }).then(() => loadProjectsData());
            }
          };
        });
      });
  }

  function setupProjectsForm() {
    const form = document.getElementById("add-project-form");
    form.onsubmit = function (e) {
      e.preventDefault();
      const body = {
        name: document.getElementById("proj-name").value,
        url: document.getElementById("proj-url").value,
        industry: document.getElementById("proj-ind").value,
        region: document.getElementById("proj-region").value,
        desc: document.getElementById("proj-desc").value
      };

      fetch("/api/admin/projects", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body)
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            form.reset();
            loadProjectsData();
          }
        });
    };
  }

  function setupBlogForm() {
    const form = document.getElementById("add-blog-form");
    form.onsubmit = function (e) {
      e.preventDefault();
      const body = {
        title: document.getElementById("blog-title").value,
        category: document.getElementById("blog-cat").value,
        excerpt: document.getElementById("blog-excerpt").value,
        body: document.getElementById("blog-body").value
      };

      fetch("/api/admin/blog", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body)
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert("Blog article published!");
            form.reset();
          }
        });
    };
  }

  function setupSettingsForm() {
    const form = document.getElementById("settings-form");
    const resp = document.getElementById("set-resp");

    form.onsubmit = function (e) {
      e.preventDefault();
      const body = {
        hero_headline: document.getElementById("set-hero-headline").value,
        hero_lead: document.getElementById("set-hero-lead").value,
        uk_hours: document.getElementById("set-uk-hours").value
      };

      fetch("/api/admin/settings", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(body)
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            resp.style.display = "block";
            resp.textContent = "✅ Settings saved successfully!";
          }
        });
    };
  }

  function logout() {
    authToken = null;
    localStorage.removeItem("redant_admin_token");
    showLoginOverlay();
  }
})();
