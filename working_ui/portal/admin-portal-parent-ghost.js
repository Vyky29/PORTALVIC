/**
 * Admin Parents teleport — open a family portal in read-only ghost view.
 * Does not use their PIN and does not sign them out.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function (_msg, _type) {},
  };

  var state = {
    families: [],
    query: "",
    loading: false,
    viewerGen: 0,
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalParentGhostStatus");
    if (!el) return;
    el.className = "portal-forms-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  function familyKey(row) {
    return String((row && row.parent_person_id) || "").trim();
  }

  function groupFamilies(rows) {
    var map = Object.create(null);
    (rows || []).forEach(function (row) {
      var key = familyKey(row);
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          parentPersonId: key,
          parentName: String(row.parent_display || "").trim(),
          email: String(row.email || "").trim(),
          children: [],
          contactId: String(row.contact_id || "").trim(),
          active: false,
        };
      }
      var fam = map[key];
      if (!fam.parentName && row.parent_display) fam.parentName = String(row.parent_display).trim();
      if (!fam.email && row.email) fam.email = String(row.email).trim();
      var child = String(row.child_display || "").trim();
      if (child && fam.children.indexOf(child) < 0) fam.children.push(child);
      if (row.in_class === true) {
        fam.active = true;
        if (row.contact_id) fam.contactId = String(row.contact_id).trim();
      } else if (!fam.contactId && row.contact_id) {
        fam.contactId = String(row.contact_id).trim();
      }
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return String(a.parentName || a.email || a.parentPersonId).localeCompare(
          String(b.parentName || b.email || b.parentPersonId),
        );
      });
  }

  function filteredFamilies() {
    var q = String(state.query || "").trim().toLowerCase();
    if (!q) return state.families;
    return state.families.filter(function (fam) {
      var blob = [fam.parentName, fam.email, fam.children.join(" ")].join(" ").toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }

  function renderList() {
    var host = document.getElementById("portalParentGhostList");
    var count = document.getElementById("portalParentGhostCount");
    if (!host) return;
    var rows = filteredFamilies();
    var shown = rows.slice(0, 80);
    if (count) {
      count.textContent = rows.length
        ? shown.length + (rows.length > shown.length ? " of " + rows.length : "") + " families"
        : "No families found";
    }
    if (!shown.length) {
      host.innerHTML = '<p class="muted">No families match.</p>';
      return;
    }
    host.innerHTML =
      '<div class="portal-ghost-teleport-list">' +
      shown
        .map(function (fam) {
          var name = fam.parentName || fam.email || "Parent";
          var kids = fam.children.length ? fam.children.join(", ") : "No child name";
          var badge = fam.active ? "ACTIVE" : "Not on services";
          var badgeCls = fam.active ? "is-online" : "is-offline";
          return (
            '<div class="portal-ghost-teleport-row" data-parent-id="' +
            esc(fam.parentPersonId) +
            '">' +
            '<div class="portal-ghost-teleport-row__main">' +
            '<div class="portal-ghost-teleport-row__name">' +
            esc(name) +
            "</div>" +
            '<div class="portal-ghost-teleport-row__meta muted">' +
            esc(kids) +
            (fam.email ? " · " + esc(fam.email) : "") +
            "</div>" +
            '<span class="portal-ghost-teleport-row__badge ' +
            badgeCls +
            '">' +
            esc(badge) +
            "</span>" +
            "</div>" +
            '<div class="portal-ghost-teleport-row__actions">' +
            '<button type="button" class="btn btn--sec btn--sm" data-parent-ghost-open="' +
            esc(fam.parentPersonId) +
            '" data-parent-ghost-contact="' +
            esc(fam.contactId) +
            '">View portal</button>' +
            "</div></div>"
          );
        })
        .join("") +
      "</div>";

    host.querySelectorAll("[data-parent-ghost-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        void openGhostPortal(
          btn.getAttribute("data-parent-ghost-open"),
          btn.getAttribute("data-parent-ghost-contact") || "",
          btn,
        );
      });
    });
  }

  function setViewerReady(displayName) {
    var loading = document.getElementById("portalParentGhostViewerLoading");
    var title = document.getElementById("portalParentGhostViewerTitle");
    if (title) title.textContent = displayName || "Parent portal";
    if (loading) loading.hidden = true;
  }

  function closeGhostViewer() {
    state.viewerGen += 1;
    var shell = document.getElementById("portalParentGhostViewer");
    if (!shell) return;
    shell.hidden = true;
    shell.setAttribute("aria-hidden", "true");
    shell.classList.remove("is-open");
    try {
      document.documentElement.classList.remove("portal-ghost-teleport-viewer-open");
      document.body.classList.remove("portal-ghost-teleport-viewer-open");
    } catch (_e) {}
    var frame = document.getElementById("portalParentGhostViewerFrame");
    if (frame) {
      try {
        frame.onload = null;
        frame.src = "about:blank";
      } catch (_blank) {}
    }
  }

  function ensureViewerShell() {
    var existing = document.getElementById("portalParentGhostViewer");
    if (existing) return existing;
    var shell = document.createElement("div");
    shell.id = "portalParentGhostViewer";
    shell.className = "portal-ghost-teleport-viewer";
    shell.hidden = true;
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML =
      '<div class="portal-ghost-teleport-viewer__bar">' +
      '<div class="portal-ghost-teleport-viewer__title-wrap">' +
      '<p class="portal-ghost-teleport-viewer__eyebrow">Ghost view</p>' +
      '<p class="portal-ghost-teleport-viewer__title" id="portalParentGhostViewerTitle">Parent portal</p>' +
      "</div>" +
      '<button type="button" class="btn btn--sec btn--sm portal-ghost-teleport-viewer__close" id="portalParentGhostViewerClose">Close</button>' +
      "</div>" +
      '<div class="portal-ghost-teleport-viewer__stage">' +
      '<div class="portal-ghost-teleport-viewer__loading" id="portalParentGhostViewerLoading" role="status">Loading parent portal...</div>' +
      '<iframe class="portal-ghost-teleport-viewer__frame" id="portalParentGhostViewerFrame" title="Parent ghost portal"></iframe>' +
      "</div>";
    document.body.appendChild(shell);
    var closeBtn = document.getElementById("portalParentGhostViewerClose");
    if (closeBtn) closeBtn.addEventListener("click", closeGhostViewer);
    return shell;
  }

  function openGhostViewer(href, displayName) {
    var gen = ++state.viewerGen;
    var shell = ensureViewerShell();
    var frame = document.getElementById("portalParentGhostViewerFrame");
    var loading = document.getElementById("portalParentGhostViewerLoading");
    var title = document.getElementById("portalParentGhostViewerTitle");
    if (title) title.textContent = displayName || "Parent portal";
    if (loading) loading.hidden = false;
    shell.hidden = false;
    shell.setAttribute("aria-hidden", "false");
    shell.classList.add("is-open");
    try {
      document.documentElement.classList.add("portal-ghost-teleport-viewer-open");
      document.body.classList.add("portal-ghost-teleport-viewer-open");
    } catch (_e) {}
    if (!frame) return;
    try {
      frame.onload = null;
      frame.src = "about:blank";
    } catch (_blank) {}
    frame.onload = function () {
      if (gen !== state.viewerGen) return;
      var src = "";
      try {
        src = String(frame.getAttribute("src") || frame.src || "");
      } catch (_src) {}
      if (!src || src === "about:blank") return;
      setViewerReady(displayName);
    };
    global.setTimeout(function () {
      if (gen !== state.viewerGen) return;
      try {
        frame.src = href;
      } catch (_href) {}
    }, 0);
  }

  async function openGhostPortal(parentPersonId, contactId, btn) {
    var token = await authToken();
    if (!token) {
      cfg.toast("Sign in required.", "error");
      return;
    }
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(supabaseBase() + "/functions/v1/portal-admin-parent-ghost-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify({
          parentPersonId: parentPersonId,
          contactId: contactId || "",
        }),
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      if (!res.ok || !j || !j.ok || !j.ghostToken) {
        cfg.toast("Could not open the parent portal.", "error");
        return;
      }
      var href =
        "parent_portal.html?ghostToken=" +
        encodeURIComponent(j.ghostToken);
      var openContact = (j.target && j.target.contactId) || contactId || "";
      if (openContact) href += "&contact_id=" + encodeURIComponent(openContact);
      var displayName = (j.target && j.target.displayName) || "";
      openGhostViewer(href, displayName);
      cfg.toast("Parent portal opened.", "ok");
    } catch (err) {
      cfg.toast("Parent portal failed.", "error");
      console.warn("[parent-ghost]", err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function refresh() {
    var client = cfg.getClient();
    if (!client) {
      setStatus("<strong>Sign in required.</strong>", true);
      return;
    }
    setStatus("<strong>Loading…</strong>");
    state.loading = true;
    var q = await client
      .from("portal_parent_contacts")
      .select("contact_id, parent_person_id, parent_display, child_display, email, in_class")
      .not("parent_person_id", "is", null)
      .limit(3000);
    if (q.error) {
      state.loading = false;
      setStatus("<strong>Error</strong> " + esc(q.error.message || String(q.error)), true);
      state.families = [];
      renderList();
      return;
    }
    state.families = groupFamilies(q.data || []);
    state.loading = false;
    setStatus("");
    renderList();
  }

  function bindModule() {
    var root = document.getElementById("portalParentGhostRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    var btn = document.getElementById("portalParentGhostRefresh");
    if (btn) {
      btn.addEventListener("click", function () {
        void refresh();
      });
    }
    var search = document.getElementById("portalParentGhostSearch");
    if (search) {
      search.addEventListener("input", function () {
        state.query = search.value || "";
        renderList();
      });
    }
    void refresh();
  }

  function destroyModule() {
    closeGhostViewer();
  }

  function viewHtml() {
    return (
      '<div id="portalParentGhostRoot" class="portal-day-ops-embed">' +
      '<div class="portal-staff-map-header">' +
      '<div class="portal-staff-map-title-row">' +
      '<h1 class="page-title">Parents teleport</h1>' +
      '<div class="portal-staff-map-toolbar">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentGhostRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="nav_hub">Operations hub</button>' +
      "</div></div>" +
      '<p class="page-intro">Open a family portal in <strong>read-only ghost view</strong> on this same screen. You see their home, sessions and invoices without their PIN, and without signing them out. Use <strong>Close</strong> to return to the list.</p>' +
      "</div>" +
      '<div id="portalParentGhostStatus" class="portal-forms-status" role="status"></div>' +
      '<label class="muted" for="portalParentGhostSearch">Search parent, child or email</label>' +
      '<input id="portalParentGhostSearch" type="search" class="input" placeholder="Name or email" autocomplete="off" style="max-width:28rem;margin:6px 0 10px" />' +
      '<p class="muted" id="portalParentGhostCount">Loading…</p>' +
      '<div id="portalParentGhostList"></div>' +
      "</div>"
    );
  }

  global.PortalParentGhostTeleport = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    destroyModule: destroyModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
