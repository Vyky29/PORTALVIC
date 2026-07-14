/**
 * Admin Training Records (Phase 1) — H&R sibling of employment contracts.
 * Event + sessions + participants; signature request via announcement.
 */
(function (global) {
  "use strict";

  var TYPES = [
    { code: "emergency_evacuation", label: "Emergency evacuation" },
    { code: "venue_induction", label: "Venue induction" },
    { code: "internal_training", label: "Internal training" },
    { code: "external_training", label: "External training" },
    { code: "swimming_shadowing", label: "Swimming shadowing" },
    { code: "behaviour_communication", label: "Behaviour & communication" },
    { code: "practical_assessment", label: "Practical assessment" },
    { code: "policy_briefing", label: "Policy briefing" },
    { code: "other", label: "Other" },
  ];

  var cfg = { getClient: null, getProfile: null, toast: null, esc: null };

  function esc(s) {
    if (typeof cfg.esc === "function") return cfg.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, kind) {
    if (typeof cfg.toast === "function") cfg.toast(msg, kind);
    else try { console.log("[training-records]", kind || "info", msg); } catch (_) {}
  }

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function typeLabel(code) {
    var k = clean(code);
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].code === k) return TYPES[i].label;
    }
    return k || "—";
  }

  function statusPill(st) {
    var k = clean(st).toLowerCase() || "draft";
    var cls =
      k === "completed"
        ? "hr-pill hr-pill--ok"
        : k === "open"
          ? "hr-pill hr-pill--warn"
          : k === "cancelled"
            ? "hr-pill"
            : "hr-pill";
    return '<span class="' + cls + '">' + esc(k) + "</span>";
  }

  function configure(opts) {
    cfg = Object.assign({}, cfg, opts || {});
  }

  function client() {
    return typeof cfg.getClient === "function" ? cfg.getClient() : null;
  }

  function injectStylesOnce() {
    if (document.getElementById("adminTrainingRecordsStyle")) return;
    var css = [
      "#trModuleRoot{min-width:0}",
      ".tr-grid{display:grid;gap:12px;min-width:0}",
      ".tr-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;min-width:0}",
      ".tr-card h3{margin:0 0 10px;font-size:1rem;color:#0f2744}",
      ".tr-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}",
      ".tr-tbl-wrap{overflow:auto;min-width:0}",
      ".tr-tbl{width:100%;border-collapse:collapse;font-size:13px}",
      ".tr-tbl th,.tr-tbl td{padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:left;vertical-align:top;min-width:0;overflow-wrap:break-word}",
      ".tr-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}",
      ".tr-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:0}",
      "@media(max-width:720px){.tr-form-grid{grid-template-columns:1fr}}",
      ".tr-form-grid .full{grid-column:1/-1}",
      ".tr-form-grid label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#475569;min-width:0}",
      ".tr-form-grid input,.tr-form-grid select,.tr-form-grid textarea{font:inherit;font-weight:500;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;min-width:0}",
      ".tr-muted{color:#64748b;font-size:12px;margin:0 0 10px;overflow-wrap:break-word}",
      ".tr-staff-list{max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;padding:8px;min-width:0}",
      ".tr-staff-list label{display:flex;gap:8px;align-items:flex-start;font-weight:500;padding:4px 0;min-width:0}",
      ".tr-staff-list span{overflow-wrap:break-word;min-width:0}",
    ].join("");
    var el = document.createElement("style");
    el.id = "adminTrainingRecordsStyle";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function loadRecords(sb) {
    return sb
      .from("portal_training_records")
      .select("id, title, training_type, status, venue_label, total_hours, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  function loadStaff(sb) {
    return sb
      .from("staff_profiles")
      .select("id, full_name, username, app_role, staff_role")
      .in("app_role", ["staff", "lead"])
      .order("full_name", { ascending: true })
      .limit(400)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  function loadDetail(sb, recordId) {
    return Promise.all([
      sb.from("portal_training_records").select("*").eq("id", recordId).maybeSingle(),
      sb
        .from("portal_training_record_sessions")
        .select("*")
        .eq("record_id", recordId)
        .order("sort_index", { ascending: true })
        .order("session_date", { ascending: true }),
      sb
        .from("portal_training_record_participants")
        .select("*")
        .eq("record_id", recordId)
        .order("display_name", { ascending: true }),
    ]).then(function (parts) {
      if (parts[0].error) throw parts[0].error;
      if (parts[1].error) throw parts[1].error;
      if (parts[2].error) throw parts[2].error;
      return {
        record: parts[0].data,
        sessions: parts[1].data || [],
        participants: parts[2].data || [],
      };
    });
  }

  function renderList(root, records) {
    var rows = (records || [])
      .map(function (r) {
        return (
          "<tr><td><strong>" +
          esc(r.title) +
          "</strong><div class=\"tr-muted\">" +
          esc(typeLabel(r.training_type)) +
          "</div></td><td>" +
          statusPill(r.status) +
          "</td><td>" +
          esc(r.venue_label || "—") +
          "</td><td>" +
          esc(r.total_hours != null ? String(r.total_hours) : "—") +
          '</td><td><button type="button" class="btn btn--sm btn--ghost" data-tr-open="' +
          esc(r.id) +
          '">Open</button></td></tr>'
        );
      })
      .join("");
    root.innerHTML =
      '<div class="tr-grid"><div class="tr-card">' +
      "<h3>Training records</h3>" +
      '<p class="tr-muted">Real training events: evacuation, venue induction, shadowing, briefings. Separate from Induction / swim course progress and the HR matrix.</p>' +
      '<div class="tr-actions">' +
      '<button type="button" class="btn btn--pri" id="trNewBtn">+ New training record</button>' +
      '<button type="button" class="btn btn--ghost" id="trRefreshBtn">Refresh</button>' +
      "</div>" +
      '<div class="tr-tbl-wrap"><table class="tr-tbl"><thead><tr>' +
      "<th>Title</th><th>Status</th><th>Venue</th><th>Hours</th><th></th>" +
      "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="5" class="tr-muted">No training records yet.</td></tr>') +
      "</tbody></table></div></div></div>";
  }

  function typeOptions(selected) {
    return TYPES.map(function (t) {
      return (
        '<option value="' +
        esc(t.code) +
        '"' +
        (t.code === selected ? " selected" : "") +
        ">" +
        esc(t.label) +
        "</option>"
      );
    }).join("");
  }

  function renderEditor(root, detail, staff) {
    var r = detail.record || {};
    var sessions = detail.sessions || [];
    var participants = detail.participants || [];
    var assigned = {};
    participants.forEach(function (p) {
      assigned[p.user_id] = true;
    });
    var sessionRows =
      sessions
        .map(function (s, i) {
          return (
            '<tr data-tr-session-id="' +
            esc(s.id) +
            '"><td>' +
            esc(s.session_date) +
            "</td><td>" +
            esc((s.start_time || "").slice(0, 5) || "—") +
            "</td><td>" +
            esc((s.end_time || "").slice(0, 5) || "—") +
            "</td><td>" +
            esc(s.hours != null ? String(s.hours) : "—") +
            "</td><td>" +
            esc(s.location_label || "—") +
            "</td></tr>"
          );
        })
        .join("") || '<tr><td colspan="5" class="tr-muted">No sessions yet.</td></tr>';

    var partRows =
      participants
        .map(function (p) {
          var signed = p.signed_at ? "Signed" : clean(p.attendance_status);
          return (
            "<tr><td>" +
            esc(p.display_name || p.user_id) +
            "</td><td>" +
            esc(signed) +
            "</td><td>" +
            esc(p.outcome) +
            "</td><td>" +
            (p.signed_at
              ? "—"
              : '<button type="button" class="btn btn--sm btn--ghost" data-tr-remind="' +
                esc(p.id) +
                '">Request sign</button>') +
            "</td></tr>"
          );
        })
        .join("") || '<tr><td colspan="4" class="tr-muted">No staff assigned.</td></tr>';

    var staffChecks = (staff || [])
      .map(function (s) {
        var name = clean(s.full_name || s.username) || s.id;
        return (
          "<label><input type=\"checkbox\" data-tr-staff=\"" +
          esc(s.id) +
          '" data-tr-staff-name="' +
          esc(name) +
          '"' +
          (assigned[s.id] ? " checked" : "") +
          " /> <span>" +
          esc(name) +
          " <span class=\"tr-muted\">(" +
          esc(s.app_role || "") +
          ")</span></span></label>"
        );
      })
      .join("");

    root.innerHTML =
      '<div class="tr-grid">' +
      '<div class="tr-card">' +
      '<div class="tr-actions">' +
      '<button type="button" class="btn btn--ghost" id="trBackBtn">← Back to list</button>' +
      '<button type="button" class="btn btn--pri" id="trSaveBtn">Save</button>' +
      (r.id
        ? '<button type="button" class="btn btn--ghost" id="trRequestAllBtn">Request signatures</button>'
        : "") +
      "</div>" +
      "<h3>" +
      (r.id ? "Edit training record" : "New training record") +
      "</h3>" +
      '<div class="tr-form-grid">' +
      '<label class="full">Title<input id="trTitle" value="' +
      esc(r.title || "") +
      '" maxlength="200" required /></label>' +
      "<label>Type<select id=\"trType\">" +
      typeOptions(r.training_type || "emergency_evacuation") +
      "</select></label>" +
      "<label>Status<select id=\"trStatus\">" +
      ["draft", "open", "completed", "cancelled"]
        .map(function (s) {
          return (
            '<option value="' +
            s +
            '"' +
            ((r.status || "draft") === s ? " selected" : "") +
            ">" +
            s +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label>Venue<input id="trVenue" value="' +
      esc(r.venue_label || "") +
      '" maxlength="120" /></label>' +
      '<label>Total hours<input id="trHours" type="number" min="0" step="0.25" value="' +
      esc(r.total_hours != null ? String(r.total_hours) : "") +
      '" /></label>' +
      '<label class="full">Notes<textarea id="trNotes" rows="3" maxlength="2000">' +
      esc(r.notes || "") +
      "</textarea></label>" +
      "</div></div>" +
      '<div class="tr-card"><h3>Session</h3>' +
      '<p class="tr-muted">Phase 1: one session date is enough. Add more later if needed.</p>' +
      '<div class="tr-form-grid">' +
      '<label>Date<input id="trSessionDate" type="date" value="' +
      esc((sessions[0] && sessions[0].session_date) || "") +
      '" /></label>' +
      '<label>Start<input id="trSessionStart" type="time" value="' +
      esc((sessions[0] && (sessions[0].start_time || "").slice(0, 5)) || "") +
      '" /></label>' +
      '<label>End<input id="trSessionEnd" type="time" value="' +
      esc((sessions[0] && (sessions[0].end_time || "").slice(0, 5)) || "") +
      '" /></label>' +
      '<label>Location<input id="trSessionLoc" value="' +
      esc((sessions[0] && sessions[0].location_label) || "") +
      '" maxlength="120" /></label>' +
      "</div>" +
      '<div class="tr-tbl-wrap" style="margin-top:10px"><table class="tr-tbl"><thead><tr><th>Date</th><th>Start</th><th>End</th><th>Hours</th><th>Location</th></tr></thead><tbody>' +
      sessionRows +
      "</tbody></table></div></div>" +
      '<div class="tr-card"><h3>Participants</h3>' +
      '<p class="tr-muted">Tick staff to assign. Save before requesting signatures.</p>' +
      '<div class="tr-staff-list">' +
      (staffChecks || '<p class="tr-muted">No staff profiles found.</p>') +
      "</div>" +
      '<div class="tr-tbl-wrap" style="margin-top:12px"><table class="tr-tbl"><thead><tr><th>Staff</th><th>Attendance</th><th>Outcome</th><th></th></tr></thead><tbody>' +
      partRows +
      "</tbody></table></div></div></div>";
  }

  function collectEditorPayload(root) {
    var hoursRaw = clean(root.querySelector("#trHours") && root.querySelector("#trHours").value);
    var hours = hoursRaw === "" ? null : Number(hoursRaw);
    if (hours != null && !Number.isFinite(hours)) hours = null;
    var staff = [];
    root.querySelectorAll("[data-tr-staff]:checked").forEach(function (el) {
      staff.push({
        user_id: el.getAttribute("data-tr-staff"),
        display_name: el.getAttribute("data-tr-staff-name") || "",
      });
    });
    return {
      title: clean(root.querySelector("#trTitle") && root.querySelector("#trTitle").value),
      training_type: clean(root.querySelector("#trType") && root.querySelector("#trType").value) || "other",
      status: clean(root.querySelector("#trStatus") && root.querySelector("#trStatus").value) || "draft",
      venue_label: clean(root.querySelector("#trVenue") && root.querySelector("#trVenue").value) || null,
      total_hours: hours,
      notes: clean(root.querySelector("#trNotes") && root.querySelector("#trNotes").value) || null,
      session: {
        session_date: clean(root.querySelector("#trSessionDate") && root.querySelector("#trSessionDate").value) || null,
        start_time: clean(root.querySelector("#trSessionStart") && root.querySelector("#trSessionStart").value) || null,
        end_time: clean(root.querySelector("#trSessionEnd") && root.querySelector("#trSessionEnd").value) || null,
        location_label: clean(root.querySelector("#trSessionLoc") && root.querySelector("#trSessionLoc").value) || null,
      },
      staff: staff,
    };
  }

  async function saveRecord(root, recordId) {
    var sb = client();
    if (!sb) throw new Error("Not signed in");
    var payload = collectEditorPayload(root);
    if (!payload.title) throw new Error("Title is required");
    var profile = typeof cfg.getProfile === "function" ? cfg.getProfile() : null;
    var createdBy = profile && profile.id ? profile.id : null;

    var row = {
      title: payload.title,
      training_type: payload.training_type,
      status: payload.status,
      venue_label: payload.venue_label,
      total_hours: payload.total_hours,
      notes: payload.notes,
    };

    var id = recordId;
    if (!id) {
      row.created_by = createdBy;
      var ins = await sb.from("portal_training_records").insert(row).select("id").maybeSingle();
      if (ins.error) throw ins.error;
      id = ins.data && ins.data.id;
    } else {
      var upd = await sb.from("portal_training_records").update(row).eq("id", id);
      if (upd.error) throw upd.error;
    }
    if (!id) throw new Error("Could not save record");

    if (payload.session.session_date) {
      var existing = await sb
        .from("portal_training_record_sessions")
        .select("id")
        .eq("record_id", id)
        .order("sort_index", { ascending: true })
        .limit(1);
      if (existing.error) throw existing.error;
      var sess = {
        record_id: id,
        session_date: payload.session.session_date,
        start_time: payload.session.start_time || null,
        end_time: payload.session.end_time || null,
        location_label: payload.session.location_label,
        sort_index: 0,
        hours: payload.total_hours,
      };
      if (existing.data && existing.data[0]) {
        var su = await sb
          .from("portal_training_record_sessions")
          .update(sess)
          .eq("id", existing.data[0].id);
        if (su.error) throw su.error;
      } else {
        var si = await sb.from("portal_training_record_sessions").insert(sess);
        if (si.error) throw si.error;
      }
    }

    var wanted = {};
    payload.staff.forEach(function (s) {
      wanted[s.user_id] = s;
    });
    var cur = await sb
      .from("portal_training_record_participants")
      .select("id, user_id")
      .eq("record_id", id);
    if (cur.error) throw cur.error;
    var have = cur.data || [];
    var haveMap = {};
    for (var i = 0; i < have.length; i++) {
      haveMap[have[i].user_id] = have[i];
      if (!wanted[have[i].user_id]) {
        var del = await sb
          .from("portal_training_record_participants")
          .delete()
          .eq("id", have[i].id);
        if (del.error) throw del.error;
      }
    }
    var toInsert = [];
    Object.keys(wanted).forEach(function (uid) {
      if (!haveMap[uid]) {
        toInsert.push({
          record_id: id,
          user_id: uid,
          display_name: wanted[uid].display_name || "",
          attendance_status: "pending",
          outcome: "pending",
        });
      }
    });
    if (toInsert.length) {
      var pi = await sb.from("portal_training_record_participants").insert(toInsert);
      if (pi.error) throw pi.error;
    }
    return id;
  }

  async function requestSignature(sb, record, participant, authUserId) {
    var title = "Sign training attendance — " + clean(record.title || "Training");
    var body = JSON.stringify({
      record_id: record.id,
      participant_id: participant.id,
      training_type: record.training_type,
      title: record.title,
    });
    var createdBy = authUserId || null;
    if (!createdBy) {
      try {
        var au = await sb.auth.getUser();
        createdBy = au && au.data && au.data.user && au.data.user.id ? au.data.user.id : null;
      } catch (_) {}
    }
    if (!createdBy) throw new Error("Not signed in as admin.");
    var ann = await sb
      .from("portal_staff_announcements")
      .insert([
        {
          title: title.slice(0, 180),
          body: body,
          message_type: "training_attendance_sign",
          priority: "high",
          audience_scope: "all_staff",
          delivery_scope: "single_user",
          target_user_id: participant.user_id,
          created_by: createdBy,
        },
      ])
      .select("id")
      .maybeSingle();
    if (ann.error) throw ann.error;
    if (ann.data && ann.data.id) {
      await sb
        .from("portal_training_record_participants")
        .update({ announcement_id: ann.data.id })
        .eq("id", participant.id);
    }
  }

  async function requestAll(root, recordId) {
    var sb = client();
    if (!sb) throw new Error("Not signed in");
    var detail = await loadDetail(sb, recordId);
    if (!detail.record) throw new Error("Record not found");
    if (detail.record.status === "draft") {
      await sb.from("portal_training_records").update({ status: "open" }).eq("id", recordId);
      detail.record.status = "open";
    }
    var profile = typeof cfg.getProfile === "function" ? cfg.getProfile() : null;
    var authUserId = profile && profile.id ? profile.id : null;
    var pending = (detail.participants || []).filter(function (p) {
      return !p.signed_at;
    });
    for (var i = 0; i < pending.length; i++) {
      await requestSignature(sb, detail.record, pending[i], authUserId);
    }
    return pending.length;
  }

  function mount(root) {
    if (!root) return;
    injectStylesOnce();
    var state = { mode: "list", recordId: null, records: [], staff: [] };

    function showList() {
      state.mode = "list";
      state.recordId = null;
      var sb = client();
      if (!sb) {
        root.innerHTML = '<p class="tr-muted">Sign in as admin to manage training records.</p>';
        return;
      }
      root.innerHTML = '<p class="tr-muted">Loading…</p>';
      Promise.all([loadRecords(sb), loadStaff(sb)])
        .then(function (parts) {
          state.records = parts[0];
          state.staff = parts[1];
          renderList(root, state.records);
          bindList(root);
        })
        .catch(function (err) {
          root.innerHTML =
            '<p class="tr-muted">Could not load training records: ' +
            esc((err && err.message) || "error") +
            "</p>";
        });
    }

    function showEditor(recordId) {
      state.mode = "edit";
      state.recordId = recordId || null;
      var sb = client();
      root.innerHTML = '<p class="tr-muted">Loading…</p>';
      var detailP = recordId
        ? loadDetail(sb, recordId)
        : Promise.resolve({ record: null, sessions: [], participants: [] });
      var staffP = state.staff.length ? Promise.resolve(state.staff) : loadStaff(sb);
      Promise.all([detailP, staffP])
        .then(function (parts) {
          state.staff = parts[1];
          renderEditor(root, parts[0], state.staff);
          bindEditor(root);
        })
        .catch(function (err) {
          toast((err && err.message) || "Could not open record", "err");
          showList();
        });
    }

    function bindList(el) {
      var neu = el.querySelector("#trNewBtn");
      if (neu) neu.addEventListener("click", function () {
        showEditor(null);
      });
      var ref = el.querySelector("#trRefreshBtn");
      if (ref) ref.addEventListener("click", showList);
      el.querySelectorAll("[data-tr-open]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          showEditor(btn.getAttribute("data-tr-open"));
        });
      });
    }

    function bindEditor(el) {
      var back = el.querySelector("#trBackBtn");
      if (back) back.addEventListener("click", showList);
      var save = el.querySelector("#trSaveBtn");
      if (save) {
        save.addEventListener("click", function () {
          save.disabled = true;
          saveRecord(el, state.recordId)
            .then(function (id) {
              toast("Training record saved.", "ok");
              showEditor(id);
            })
            .catch(function (err) {
              save.disabled = false;
              toast((err && err.message) || "Save failed", "err");
            });
        });
      }
      var reqAll = el.querySelector("#trRequestAllBtn");
      if (reqAll) {
        reqAll.addEventListener("click", function () {
          reqAll.disabled = true;
          requestAll(el, state.recordId)
            .then(function (n) {
              toast("Signature requests sent: " + n, "ok");
              showEditor(state.recordId);
            })
            .catch(function (err) {
              reqAll.disabled = false;
              toast((err && err.message) || "Could not send requests", "err");
            });
        });
      }
      el.querySelectorAll("[data-tr-remind]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var pid = btn.getAttribute("data-tr-remind");
          var sb = client();
          btn.disabled = true;
          loadDetail(sb, state.recordId)
            .then(function (detail) {
              var p = (detail.participants || []).filter(function (x) {
                return x.id === pid;
              })[0];
              if (!p) throw new Error("Participant not found");
              var profile = typeof cfg.getProfile === "function" ? cfg.getProfile() : null;
              return requestSignature(sb, detail.record, p, profile && profile.id);
            })
            .then(function () {
              toast("Signature request sent.", "ok");
              showEditor(state.recordId);
            })
            .catch(function (err) {
              btn.disabled = false;
              toast((err && err.message) || "Request failed", "err");
            });
        });
      });
    }

    showList();
  }

  global.AdminTrainingRecords = {
    configure: configure,
    mount: mount,
    TYPES: TYPES,
    typeLabel: typeLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
