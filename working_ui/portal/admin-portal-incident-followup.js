/**
 * Admin — Incident follow-up (Phase A): triage → form → support plan update.
 * Mounts inside the existing incident report modal; does not replace notify/view.
 */
(function (global) {
  "use strict";

  var FN = "portal-admin-incident-followup";

  var cfg = {
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function () {},
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
  };

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
    if (options.esc) cfg.esc = options.esc;
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

  async function api(body) {
    var token = await authToken();
    if (!token) throw new Error("Sign in as admin to continue.");
    var res = await fetch(supabaseBase() + "/functions/v1/" + FN, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        apikey: String(cfg.getAnonKey() || ""),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      throw new Error((j && (j.error || j.message)) || "Request failed");
    }
    return j;
  }

  function statusLabel(s) {
    s = String(s || "new");
    var map = {
      new: "New incident",
      triaged: "Triaged",
      follow_up_in_progress: "Follow-up in progress",
      follow_up_complete: "Follow-up complete",
      awaiting_instructor: "Awaiting instructor",
      closed: "Closed",
      archived: "Archived",
    };
    return map[s] || s;
  }

  function riskSelect(val, idx) {
    var v = String(val || "medium").toLowerCase();
    return (
      '<select class="pfu-risk" data-pfu-risk data-i="' +
      idx +
      '">' +
      ["high", "medium", "low"]
        .map(function (opt) {
          return (
            '<option value="' +
            opt +
            '"' +
            (v === opt ? " selected" : "") +
            ">" +
            opt.charAt(0).toUpperCase() +
            opt.slice(1) +
            "</option>"
          );
        })
        .join("") +
      "</select>"
    );
  }

  function strategyRowHtml(row, idx) {
    row = row || {};
    return (
      '<tr class="pfu-strat-row" data-i="' +
      idx +
      '">' +
      '<td><input type="text" class="pfu-input" data-pfu-risk-beh placeholder="e.g. Leaving pool area" value="' +
      esc(row.risk_behaviour || "") +
      '"></td>' +
      '<td><textarea class="pfu-textarea pfu-textarea--sm" data-pfu-strat rows="2" placeholder="Strategy in place">' +
      esc(row.strategy_in_place || "") +
      "</textarea></td>" +
      "<td>" +
      riskSelect(row.risk_level, idx) +
      "</td>" +
      '<td><button type="button" class="pfu-btn pfu-btn--ghost" data-pfu-del-row aria-label="Remove">×</button></td>' +
      "</tr>"
    );
  }

  function readStrategies(host) {
    var rows = [];
    host.querySelectorAll(".pfu-strat-row").forEach(function (tr) {
      rows.push({
        risk_behaviour: (tr.querySelector("[data-pfu-risk-beh]") || {}).value || "",
        strategy_in_place: (tr.querySelector("[data-pfu-strat]") || {}).value || "",
        risk_level: (tr.querySelector("[data-pfu-risk]") || {}).value || "medium",
      });
    });
    return rows;
  }

  function readForm(host) {
    function val(sel) {
      var el = host.querySelector(sel);
      return el ? String(el.value || "") : "";
    }
    return {
      immediate_findings: val("[data-pfu-findings]"),
      root_cause: val("[data-pfu-root]"),
      parent_communication: val("[data-pfu-parent]"),
      staff_discussion: val("[data-pfu-staff]"),
      lessons_learned: val("[data-pfu-lessons]"),
      follow_up_summary: val("[data-pfu-summary]"),
      strategies: readStrategies(host),
    };
  }

  function previewHtml(update, incident) {
    var items = (update && update.payload_json) || [];
    if (!Array.isArray(items)) items = [];
    var rows = items
      .map(function (it) {
        return (
          "<tr><td>" +
          esc(it.risk_behaviour || "—") +
          "</td><td>" +
          esc(it.strategy_in_place || "—") +
          "</td><td>" +
          esc(String(it.risk_level || "").toUpperCase()) +
          "</td></tr>"
        );
      })
      .join("");
    return (
      '<div class="pfu-preview">' +
      "<h4>Support Plan Update</h4>" +
      '<p class="pfu-muted">Participant: <strong>' +
      esc((incident && incident.client_name) || (update && update.participant_name) || "—") +
      "</strong> · From incident · Last updated now</p>" +
      '<div class="pfu-table-wrap"><table class="pfu-table">' +
      "<thead><tr><th>Individual Risks</th><th>Strategies in Place</th><th>Risk</th></tr></thead>" +
      "<tbody>" +
      (rows || '<tr><td colspan="3" class="pfu-muted">No strategies yet.</td></tr>') +
      "</tbody></table></div>" +
      '<div class="pfu-preview-acts">' +
      '<button type="button" class="pfu-btn pfu-btn--ok" data-pfu-apply>✅ Update Profile</button>' +
      '<button type="button" class="pfu-btn" data-pfu-edit-again>✏ Edit</button>' +
      '<button type="button" class="pfu-btn pfu-btn--danger" data-pfu-cancel-update>❌ Cancel</button>' +
      "</div></div>"
    );
  }

  function formHtml(bundle) {
    var f = (bundle && bundle.followup) || {};
    var strategies = (bundle && bundle.strategies) || [];
    if (!strategies.length) {
      strategies = [
        { risk_behaviour: "", strategy_in_place: "", risk_level: "high" },
        { risk_behaviour: "", strategy_in_place: "", risk_level: "medium" },
        { risk_behaviour: "", strategy_in_place: "", risk_level: "low" },
      ];
    }
    return (
      '<div class="pfu-form">' +
      "<h4>Follow-up form</h4>" +
      '<p class="pfu-sec">Section 1</p>' +
      '<label class="pfu-label">Immediate Findings<textarea class="pfu-textarea" data-pfu-findings rows="3">' +
      esc(f.immediate_findings || "") +
      "</textarea></label>" +
      '<label class="pfu-label">Root Cause / Observations<textarea class="pfu-textarea" data-pfu-root rows="3">' +
      esc(f.root_cause || "") +
      "</textarea></label>" +
      '<label class="pfu-label">Parent Communication<textarea class="pfu-textarea" data-pfu-parent rows="2">' +
      esc(f.parent_communication || "") +
      "</textarea></label>" +
      '<label class="pfu-label">Staff Discussion<textarea class="pfu-textarea" data-pfu-staff rows="2">' +
      esc(f.staff_discussion || "") +
      "</textarea></label>" +
      '<label class="pfu-label">Lessons Learned<textarea class="pfu-textarea" data-pfu-lessons rows="2">' +
      esc(f.lessons_learned || "") +
      "</textarea></label>" +
      '<p class="pfu-sec">Section 2 — Strategies for future sessions</p>' +
      '<div class="pfu-table-wrap"><table class="pfu-table pfu-table--edit">' +
      "<thead><tr><th>Individual Risk / Behaviour</th><th>Strategy in Place</th><th>Risk Level</th><th></th></tr></thead>" +
      '<tbody data-pfu-strat-body>' +
      strategies.map(strategyRowHtml).join("") +
      "</tbody></table></div>" +
      '<button type="button" class="pfu-btn pfu-btn--ghost" data-pfu-add-row>+ Add another strategy</button>' +
      '<p class="pfu-sec">Section 3 — Follow-up summary</p>' +
      '<label class="pfu-label"><textarea class="pfu-textarea" data-pfu-summary rows="3" placeholder="Short summary of agreed strategies…">' +
      esc(f.follow_up_summary || "") +
      "</textarea></label>" +
      '<div class="pfu-form-acts">' +
      '<button type="button" class="pfu-btn" data-pfu-save>Save draft</button>' +
      '<button type="button" class="pfu-btn pfu-btn--pri" data-pfu-complete>Complete Follow-up</button>' +
      "</div></div>"
    );
  }

  function triageHtml() {
    return (
      '<div class="pfu-triage">' +
      "<h4>Triage</h4>" +
      '<p class="pfu-muted">Choose how to handle this incident before follow-up.</p>' +
      '<button type="button" class="pfu-btn pfu-btn--block" data-pfu-triage="no_follow_up">No follow-up required → Archive</button>' +
      '<button type="button" class="pfu-btn pfu-btn--block pfu-btn--pri" data-pfu-triage="manager_review_only">Admin review only → Follow-up form</button>' +
      '<button type="button" class="pfu-btn pfu-btn--block" data-pfu-triage="formal_meeting">Formal follow-up meeting (form now; scheduling Phase B)</button>' +
      "</div>"
    );
  }

  function shellHtml(incident) {
    var st = (incident && incident.workflow_status) || "new";
    return (
      '<section class="pfu-panel" data-pfu-root>' +
      '<div class="pfu-head">' +
      "<strong>Incident follow-up</strong>" +
      '<span class="pfu-chip">' +
      esc(statusLabel(st)) +
      "</span>" +
      "</div>" +
      '<div class="pfu-body" data-pfu-body><p class="pfu-muted">Loading…</p></div>' +
      '<p class="pfu-msg" data-pfu-msg hidden></p>' +
      "</section>"
    );
  }

  function ensureStyles() {
    if (document.getElementById("pfu-followup-css")) return;
    var style = document.createElement("style");
    style.id = "pfu-followup-css";
    style.textContent =
      ".pfu-panel{margin-top:16px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;min-width:0}" +
      ".pfu-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;min-width:0}" +
      ".pfu-chip{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:#e0e7ff;color:#3730a3;flex-shrink:0}" +
      ".pfu-muted{color:#64748b;font-size:13px;margin:0 0 10px}" +
      ".pfu-sec{font-weight:800;font-size:13px;margin:14px 0 8px;color:#0f172a}" +
      ".pfu-label{display:block;font-size:12px;font-weight:700;margin:0 0 10px;min-width:0}" +
      ".pfu-textarea,.pfu-input,.pfu-risk{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font:inherit;margin-top:4px;min-width:0}" +
      ".pfu-textarea--sm{min-height:52px}" +
      ".pfu-table-wrap{overflow:auto;min-width:0;margin:0 0 10px}" +
      ".pfu-table{width:100%;border-collapse:collapse;font-size:13px;background:#fff}" +
      ".pfu-table th,.pfu-table td{border:1px solid #cbd5e1;padding:8px;vertical-align:top;min-width:0;overflow-wrap:anywhere}" +
      ".pfu-table th{background:#f1f5f9;text-align:left}" +
      ".pfu-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;margin:4px 6px 4px 0}" +
      ".pfu-btn--pri{background:#1e3a5f;color:#fff;border-color:#1e3a5f}" +
      ".pfu-btn--ok{background:#15803d;color:#fff;border-color:#15803d}" +
      ".pfu-btn--danger{background:#fff;color:#b91c1c;border-color:#fecaca}" +
      ".pfu-btn--ghost{background:transparent}" +
      ".pfu-btn--block{display:flex;width:100%;justify-content:flex-start;margin:0 0 8px}" +
      ".pfu-form-acts,.pfu-preview-acts{display:flex;flex-wrap:wrap;gap:4px;margin-top:12px}" +
      ".pfu-msg{margin:8px 0 0;font-size:13px;color:#b91c1c}" +
      ".pfu-msg--ok{color:#15803d}";
    document.head.appendChild(style);
  }

  function setMsg(host, text, ok) {
    var el = host.querySelector("[data-pfu-msg]");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = "pfu-msg" + (ok ? " pfu-msg--ok" : "");
  }

  function renderBody(host, incident, bundle) {
    var body = host.querySelector("[data-pfu-body]");
    if (!body) return;
    var st = (incident && incident.workflow_status) || "new";
    var chip = host.querySelector(".pfu-chip");
    if (chip) chip.textContent = statusLabel(st);

    if (st === "new" || (!incident.triage && st !== "archived" && st !== "closed" && st !== "follow_up_complete" && st !== "follow_up_in_progress")) {
      if (st === "new" || !incident.triage) {
        body.innerHTML = triageHtml();
        return;
      }
    }
    if (st === "archived") {
      body.innerHTML = '<p class="pfu-muted">Archived — no follow-up required.</p>';
      return;
    }
    if (st === "closed") {
      body.innerHTML =
        '<p class="pfu-muted">Closed. Support plan was applied to the participant profile (Individual Support Plan).</p>';
      return;
    }
    if (st === "follow_up_complete" && bundle && bundle.update && bundle.update.status === "draft") {
      body.innerHTML = previewHtml(bundle.update, incident);
      return;
    }
    if (st === "follow_up_in_progress" || st === "follow_up_complete") {
      body.innerHTML = formHtml(bundle);
      return;
    }
    body.innerHTML = triageHtml();
  }

  async function refresh(host, incidentId) {
    var j = await api({ action: "get", incident_id: incidentId });
    host.__pfuIncident = j.incident;
    host.__pfuBundle = j;
    renderBody(host, j.incident, j);
  }

  async function mountIntoModal(modalRoot, incidentRow) {
    if (!modalRoot || !incidentRow || !incidentRow.id) return;
    ensureStyles();
    var body = modalRoot.querySelector(".pfrm-modal__body");
    if (!body) return;
    if (body.querySelector("[data-pfu-root]")) return;

    var wrap = document.createElement("div");
    wrap.innerHTML = shellHtml(incidentRow);
    var host = wrap.firstChild;
    body.appendChild(host);

    host.addEventListener("click", function (ev) {
      var t =
        ev.target && ev.target.closest
          ? ev.target.closest(
              "[data-pfu-triage],[data-pfu-add-row],[data-pfu-del-row],[data-pfu-save],[data-pfu-complete],[data-pfu-apply],[data-pfu-edit-again],[data-pfu-cancel-update]",
            )
          : null;
      if (!t || !host.contains(t)) return;
      ev.preventDefault();
      void handleAction(host, incidentRow.id, t);
    });

    try {
      await refresh(host, incidentRow.id);
    } catch (err) {
      setMsg(host, err && err.message ? err.message : "Could not load follow-up");
    }
  }

  async function handleAction(host, incidentId, t) {
    try {
      setMsg(host, "");
      if (t.hasAttribute("data-pfu-triage")) {
        var triage = t.getAttribute("data-pfu-triage");
        var tj = await api({ action: "triage", incident_id: incidentId, triage: triage });
        cfg.toast(tj.note || "Triage saved", "ok");
        await refresh(host, incidentId);
        return;
      }
      if (t.hasAttribute("data-pfu-add-row")) {
        var tb = host.querySelector("[data-pfu-strat-body]");
        if (tb) {
          var i = tb.querySelectorAll(".pfu-strat-row").length;
          tb.insertAdjacentHTML("beforeend", strategyRowHtml({}, i));
        }
        return;
      }
      if (t.hasAttribute("data-pfu-del-row")) {
        var tr = t.closest(".pfu-strat-row");
        if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
        return;
      }
      if (t.hasAttribute("data-pfu-save")) {
        await api(Object.assign({ action: "save_followup", incident_id: incidentId }, readForm(host)));
        setMsg(host, "Draft saved.", true);
        cfg.toast("Follow-up draft saved", "ok");
        return;
      }
      if (t.hasAttribute("data-pfu-complete")) {
        var cj = await api(
          Object.assign({ action: "complete_followup", incident_id: incidentId }, readForm(host)),
        );
        host.__pfuIncident = Object.assign({}, host.__pfuIncident || {}, {
          workflow_status: "follow_up_complete",
          client_name: (host.__pfuIncident && host.__pfuIncident.client_name) || "",
        });
        host.__pfuBundle = {
          followup: cj.followup,
          strategies: cj.strategies,
          update: cj.update,
        };
        renderBody(host, host.__pfuIncident, host.__pfuBundle);
        cfg.toast("Follow-up complete — review Support Plan Update", "ok");
        return;
      }
      if (t.hasAttribute("data-pfu-apply")) {
        await api({ action: "apply_support_plan", incident_id: incidentId });
        await refresh(host, incidentId);
        cfg.toast("Participant support plan updated", "ok");
        return;
      }
      if (t.hasAttribute("data-pfu-edit-again")) {
        await api({ action: "reopen_followup", incident_id: incidentId });
        await refresh(host, incidentId);
        return;
      }
      if (t.hasAttribute("data-pfu-cancel-update")) {
        await api({ action: "cancel_support_plan_update", incident_id: incidentId });
        await refresh(host, incidentId);
        cfg.toast("Support plan update cancelled", "ok");
      }
    } catch (err) {
      setMsg(host, err && err.message ? err.message : "Failed");
      cfg.toast(err && err.message ? err.message : "Failed", "err");
    }
  }

  global.PortalIncidentFollowup = {
    configure: configure,
    mountIntoModal: mountIntoModal,
  };

  if (typeof global.portalIncidentFollowupConfigureOnce === "function") {
    global.portalIncidentFollowupConfigureOnce();
  }
})(typeof window !== "undefined" ? window : globalThis);
