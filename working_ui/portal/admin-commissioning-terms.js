/**
 * Admin — Local Authority / Commissioning Terms (orgs, send accept link, placements, POs).
 * Isolated from family T&Cs / re-enrolment declarations.terms.
 */
(function (global) {
  "use strict";

  var FN = "commissioning-terms-admin";

  var deps = {
    getClient: null,
    getSupabaseUrl: null,
    getAnonKey: null,
    esc: null,
    toast: null,
  };

  var root = null;
  var state = {
    loading: false,
    error: "",
    flags: {},
    documents: [],
    orgs: [],
    sends: [],
    placements: [],
    lastAcceptPath: "",
  };

  function esc(s) {
    if (deps.esc) return deps.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function supabaseUrl() {
    var u = deps.getSupabaseUrl ? deps.getSupabaseUrl() : "";
    u = (typeof u === "string" ? u : "").trim();
    return (u || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(/\/$/, "");
  }

  function anonKey() {
    var k = deps.getAnonKey ? deps.getAnonKey() : "";
    return typeof k === "string" ? k : "";
  }

  function client() {
    return deps.getClient ? deps.getClient() : null;
  }

  function toast(msg) {
    if (deps.toast) deps.toast(msg);
    else try { alert(msg); } catch (_) {}
  }

  async function authToken() {
    var sb = client();
    if (!sb || !sb.auth || typeof sb.auth.getSession !== "function") return "";
    try {
      var res = await sb.auth.getSession();
      return (res && res.data && res.data.session && res.data.session.access_token) || "";
    } catch (e) {
      return "";
    }
  }

  async function call(action, extra) {
    var token = await authToken();
    if (!token) throw new Error("Sign in to admin again.");
    var res = await fetch(supabaseUrl() + "/functions/v1/" + FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: anonKey(),
      },
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
    });
    var body = {};
    try {
      body = await res.json();
    } catch (_) {}
    if (!res.ok || !body.ok) {
      var err = new Error((body && body.error) || "Request failed (HTTP " + res.status + ")");
      err.body = body;
      throw err;
    }
    return body;
  }

  function injectStyleOnce() {
    if (document.getElementById("adminCommissioningTermsStyle")) return;
    var css =
      ".ct-wrap{min-width:0}" +
      ".ct-wrap .ct-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}" +
      ".ct-wrap .ct-grid{display:grid;gap:12px;grid-template-columns:1fr;min-width:0}" +
      "@media(min-width:900px){.ct-wrap .ct-grid{grid-template-columns:1fr 1fr}}" +
      ".ct-wrap .ct-card{border:1px solid var(--line,#e2e8f0);border-radius:14px;background:#fff;padding:14px;min-width:0}" +
      ".ct-wrap .ct-card h3{margin:0 0 8px;font-size:15px}" +
      ".ct-wrap .ct-meta{font-size:12px;color:#64748b;margin:0 0 10px;line-height:1.45;overflow-wrap:break-word}" +
      ".ct-wrap label{display:block;font-size:12px;font-weight:700;margin:8px 0 4px}" +
      ".ct-wrap input,.ct-wrap select{width:100%;max-width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:10px;font:inherit;min-width:0}" +
      ".ct-wrap .ct-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
      ".ct-wrap table{width:100%;border-collapse:collapse;font-size:12px}" +
      ".ct-wrap th,.ct-wrap td{padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;overflow-wrap:break-word;min-width:0}" +
      ".ct-wrap th{font-weight:700;color:#0f2747;background:#f8fafc}" +
      ".ct-wrap .ct-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#eef2ff;color:#1e3a8a}" +
      ".ct-wrap .ct-chip--warn{background:#fef3c7;color:#92400e}" +
      ".ct-wrap .ct-chip--ok{background:#d1fae5;color:#065f46}" +
      ".ct-wrap .ct-accept{margin-top:8px;padding:8px 10px;border-radius:10px;background:#eaf5fb;font-size:12px;word-break:break-all}" +
      ".ct-wrap .ct-err{color:#b91c1c;font-size:13px;margin:0 0 10px}";
    var st = document.createElement("style");
    st.id = "adminCommissioningTermsStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function statusChip(st) {
    var s = String(st || "");
    var cls = "ct-chip";
    if (/accepted|active|approved/i.test(s)) cls += " ct-chip--ok";
    else if (/awaiting|reserved|missing|invalid/i.test(s)) cls += " ct-chip--warn";
    return '<span class="' + cls + '">' + esc(s || "—") + "</span>";
  }

  function render() {
    if (!root) return;
    if (state.loading) {
      root.innerHTML = '<div class="ct-wrap"><p class="ct-meta">Loading commissioning Terms…</p></div>';
      return;
    }
    if (state.error) {
      root.innerHTML =
        '<div class="ct-wrap"><p class="ct-err">' +
        esc(state.error) +
        '</p><div class="ct-toolbar"><button type="button" class="btn btn--sec btn--sm" data-ct-refresh>Retry</button></div></div>';
      bind();
      return;
    }

    var flags = state.flags || {};
    var docs = (state.documents || [])
      .filter(function (d) {
        return d.audience === "commissioning";
      })
      .map(function (d) {
        return (
          "<tr><td>" +
          esc(d.version) +
          "</td><td>" +
          esc(d.title) +
          "</td><td>" +
          statusChip(d.status) +
          '</td><td><a href="' +
          esc(d.public_path || "/commissioning/terms") +
          '" target="_blank" rel="noopener">Open</a></td></tr>'
        );
      })
      .join("");

    var orgOpts = (state.orgs || [])
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '">' +
          esc(o.name) +
          " (" +
          esc(o.org_type) +
          ")</option>"
        );
      })
      .join("");

    var orgRows = (state.orgs || [])
      .map(function (o) {
        return (
          "<tr><td><strong>" +
          esc(o.name) +
          "</strong></td><td>" +
          esc(o.org_type) +
          "</td><td>" +
          (o.active ? statusChip("active") : statusChip("inactive")) +
          "</td><td>" +
          esc(String(o.notice_period_days || 28)) +
          " days</td></tr>"
        );
      })
      .join("");

    var sendRows = (state.sends || [])
      .slice(0, 20)
      .map(function (s) {
        return (
          "<tr><td>" +
          esc((s.created_at || "").slice(0, 16).replace("T", " ")) +
          "</td><td>" +
          esc(s.recipient_name || "") +
          "<br><span class=\"muted\">" +
          esc(s.recipient_email || "") +
          "</span></td><td>" +
          statusChip(s.status) +
          "</td></tr>"
        );
      })
      .join("");

    var placeRows = (state.placements || [])
      .slice(0, 25)
      .map(function (p) {
        return (
          "<tr><td><strong>" +
          esc(p.participant_name || p.participant_contact_id || "—") +
          "</strong></td><td>" +
          esc(p.service_label || "") +
          "</td><td>" +
          statusChip(p.status) +
          '</td><td class="toolbar" style="white-space:nowrap">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-ct-status="' +
          esc(p.id) +
          '" data-ct-to="awaiting_terms_acceptance">Await terms</button> ' +
          '<button type="button" class="btn btn--sec btn--sm" data-ct-status="' +
          esc(p.id) +
          '" data-ct-to="approved_to_attend">Approve attend</button></td></tr>'
        );
      })
      .join("");

    var acceptBox = state.lastAcceptPath
      ? '<div class="ct-accept"><strong>Last accept link</strong> (copy into email/WhatsApp):<br>' +
        esc(state.lastAcceptPath) +
        "</div>"
      : "";

    root.innerHTML =
      '<div class="ct-wrap">' +
      '<div class="ct-toolbar">' +
      '<button type="button" class="btn btn--sec btn--sm" data-ct-refresh>Refresh</button>' +
      '<a class="btn btn--ghost btn--sm" href="/commissioning/terms" target="_blank" rel="noopener">Public T&amp;Cs</a>' +
      '<a class="btn btn--ghost btn--sm" href="/parent/terms" target="_blank" rel="noopener">Family T&amp;Cs (unchanged)</a>' +
      '<span class="ct-meta" style="margin:0">terms ' +
      (flags.commissioning_terms_enabled === false ? "off" : "on") +
      " · hard-block attendance " +
      (flags.commissioning_attendance_hard_block ? "on" : "off") +
      "</span></div>" +
      acceptBox +
      '<div class="ct-grid">' +
      '<div class="ct-card"><h3>Active document</h3><p class="ct-meta">Versioned commissioning Terms only — family re-enrolment declarations are separate.</p>' +
      '<div style="overflow:auto"><table><thead><tr><th>Ver</th><th>Title</th><th>Status</th><th></th></tr></thead><tbody>' +
      (docs || '<tr><td colspan="4" class="muted">No commissioning document seeded yet.</td></tr>') +
      "</tbody></table></div></div>" +
      '<div class="ct-card"><h3>Create organisation</h3>' +
      '<label>Name</label><input id="ctOrgName" autocomplete="organization" />' +
      '<label>Type</label><select id="ctOrgType"><option value="local_authority">Local authority</option><option value="nhs">NHS / health</option><option value="school">School</option><option value="other">Other commissioning</option></select>' +
      '<label>Main contact email</label><input id="ctOrgEmail" type="email" />' +
      '<div class="ct-row"><button type="button" class="btn btn--pri btn--sm" data-ct-create-org>Save org</button></div></div>' +
      '<div class="ct-card"><h3>Send acceptance link</h3>' +
      '<label>Organisation</label><select id="ctSendOrg">' +
      (orgOpts || '<option value="">— create an org first —</option>') +
      "</select>" +
      '<label>Recipient name</label><input id="ctSendName" />' +
      '<label>Recipient email</label><input id="ctSendEmail" type="email" />' +
      '<label>Role</label><input id="ctSendRole" placeholder="Commissioning manager" />' +
      '<div class="ct-row"><button type="button" class="btn btn--pri btn--sm" data-ct-send>Generate link</button></div></div>' +
      '<div class="ct-card"><h3>Create placement</h3>' +
      '<label>Organisation</label><select id="ctPlaceOrg">' +
      (orgOpts || '<option value="">—</option>') +
      "</select>" +
      '<label>Participant name</label><input id="ctPlaceName" />' +
      '<label>Service</label><input id="ctPlaceSvc" placeholder="Day Centre / Crash / Swim" />' +
      '<label>Academic year</label><input id="ctPlaceAy" placeholder="2026-27" />' +
      '<div class="ct-row"><button type="button" class="btn btn--pri btn--sm" data-ct-place>Create placement</button></div></div>' +
      '<div class="ct-card"><h3>Add purchase order</h3>' +
      '<label>Organisation</label><select id="ctPoOrg">' +
      (orgOpts || '<option value="">—</option>') +
      "</select>" +
      '<label>Placement id (optional)</label><input id="ctPoPlace" placeholder="uuid" />' +
      '<label>PO number</label><input id="ctPoNum" />' +
      '<label>Total value (£)</label><input id="ctPoVal" type="number" step="0.01" min="0" />' +
      '<div class="ct-row"><button type="button" class="btn btn--pri btn--sm" data-ct-po>Save PO</button></div></div>' +
      "</div>" +
      '<div class="ct-card" style="margin-top:12px"><h3>Organisations</h3><div style="overflow:auto"><table><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Notice</th></tr></thead><tbody>' +
      (orgRows || '<tr><td colspan="4" class="muted">None yet</td></tr>') +
      "</tbody></table></div></div>" +
      '<div class="ct-card" style="margin-top:12px"><h3>Recent sends</h3><div style="overflow:auto"><table><thead><tr><th>When</th><th>Recipient</th><th>Status</th></tr></thead><tbody>' +
      (sendRows || '<tr><td colspan="3" class="muted">None yet</td></tr>') +
      "</tbody></table></div></div>" +
      '<div class="ct-card" style="margin-top:12px"><h3>Placements</h3><p class="ct-meta">Approve attend requires an active PO or a director override (reason prompted).</p><div style="overflow:auto"><table><thead><tr><th>Participant</th><th>Service</th><th>Status</th><th></th></tr></thead><tbody>' +
      (placeRows || '<tr><td colspan="4" class="muted">None yet</td></tr>') +
      "</tbody></table></div></div>" +
      "</div>";

    bind();
  }

  function bind() {
    if (!root) return;
    var refresh = root.querySelector("[data-ct-refresh]");
    if (refresh) refresh.onclick = function () { load(); };

    var createOrg = root.querySelector("[data-ct-create-org]");
    if (createOrg) {
      createOrg.onclick = async function () {
        try {
          await call("create_org", {
            name: ($("ctOrgName") && $("ctOrgName").value) || "",
            org_type: ($("ctOrgType") && $("ctOrgType").value) || "local_authority",
            main_contact_email: ($("ctOrgEmail") && $("ctOrgEmail").value) || "",
          });
          toast("Organisation saved");
          await load();
        } catch (e) {
          toast(e.message || "Could not save org");
        }
      };
    }

    var sendBtn = root.querySelector("[data-ct-send]");
    if (sendBtn) {
      sendBtn.onclick = async function () {
        try {
          var out = await call("send_terms", {
            org_id: ($("ctSendOrg") && $("ctSendOrg").value) || "",
            recipient_name: ($("ctSendName") && $("ctSendName").value) || "",
            recipient_email: ($("ctSendEmail") && $("ctSendEmail").value) || "",
            recipient_role: ($("ctSendRole") && $("ctSendRole").value) || "",
          });
          var path = out.accept_path || "";
          if (path && path.charAt(0) === "/") {
            state.lastAcceptPath = location.origin + path;
          } else {
            state.lastAcceptPath = path;
          }
          toast("Accept link ready — copy from the blue box");
          render();
        } catch (e) {
          toast(e.message || "Could not send");
        }
      };
    }

    var placeBtn = root.querySelector("[data-ct-place]");
    if (placeBtn) {
      placeBtn.onclick = async function () {
        try {
          await call("create_placement", {
            org_id: ($("ctPlaceOrg") && $("ctPlaceOrg").value) || "",
            participant_name: ($("ctPlaceName") && $("ctPlaceName").value) || "",
            service_label: ($("ctPlaceSvc") && $("ctPlaceSvc").value) || "",
            academic_year: ($("ctPlaceAy") && $("ctPlaceAy").value) || "",
            status: "proposed",
          });
          toast("Placement created");
          await load();
        } catch (e) {
          toast(e.message || "Could not create placement");
        }
      };
    }

    var poBtn = root.querySelector("[data-ct-po]");
    if (poBtn) {
      poBtn.onclick = async function () {
        try {
          var pounds = Number(($("ctPoVal") && $("ctPoVal").value) || 0);
          await call("upsert_po", {
            org_id: ($("ctPoOrg") && $("ctPoOrg").value) || "",
            placement_id: ($("ctPoPlace") && $("ctPoPlace").value) || "",
            po_number: ($("ctPoNum") && $("ctPoNum").value) || "",
            total_value_pence: Math.round(pounds * 100),
            remaining_balance_pence: Math.round(pounds * 100),
            status: "active",
          });
          toast("PO saved");
          await load();
        } catch (e) {
          toast(e.message || "Could not save PO");
        }
      };
    }

    root.querySelectorAll("[data-ct-status]").forEach(function (btn) {
      btn.onclick = async function () {
        var id = btn.getAttribute("data-ct-status");
        var to = btn.getAttribute("data-ct-to");
        var payload = { placement_id: id, status: to };
        if (to === "approved_to_attend") {
          var needOverride = window.confirm(
            "Approve attendance?\n\nOK = try with PO on file.\nCancel = abort.\n\nIf no PO, you will be asked for a director override reason."
          );
          if (!needOverride) return;
        }
        try {
          await call("set_placement_status", payload);
          toast("Status updated");
          await load();
        } catch (e) {
          var body = e.body || {};
          if (body.error === "attendance_requires_po_or_director_override") {
            var reason = window.prompt("No active PO. Director override reason (required):");
            if (!reason) return;
            try {
              await call("set_placement_status", {
                placement_id: id,
                status: to,
                director_override: true,
                override_reason: reason,
              });
              toast("Approved with director override");
              await load();
            } catch (e2) {
              toast(e2.message || "Override failed");
            }
            return;
          }
          toast(e.message || "Status update failed");
        }
      };
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  async function load() {
    state.loading = true;
    state.error = "";
    render();
    try {
      var out = await call("overview");
      state.flags = out.flags || {};
      state.documents = out.documents || [];
      state.orgs = out.orgs || [];
      state.sends = out.recent_sends || [];
      state.placements = out.placements || [];
      state.loading = false;
      state.error = "";
      render();
    } catch (e) {
      state.loading = false;
      state.error = e.message || "Could not load commissioning module";
      render();
    }
  }

  function configure(opts) {
    opts = opts || {};
    if (opts.getClient) deps.getClient = opts.getClient;
    if (opts.getSupabaseUrl) deps.getSupabaseUrl = opts.getSupabaseUrl;
    if (opts.getAnonKey) deps.getAnonKey = opts.getAnonKey;
    if (opts.esc) deps.esc = opts.esc;
    if (opts.toast) deps.toast = opts.toast;
  }

  function mount(rootEl) {
    root = rootEl;
    if (!root) return;
    injectStyleOnce();
    load();
  }

  global.AdminCommissioningTerms = { configure: configure, mount: mount };
})(window);
