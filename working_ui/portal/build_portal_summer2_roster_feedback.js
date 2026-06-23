#!/usr/bin/env node
/**
 * Builds runtime roster + feedback status from roster_term_master_seed.json (MADRE).
 * Run: node working_ui/portal/build_portal_summer2_roster_feedback.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SEED = path.join(__dirname, "roster_term_master_seed.json");
const ROWS_OUT = path.join(__dirname, "roster_master_dashboard_rows.js");
const STATUS_OUT = path.join(__dirname, "session_feedback_status_portal_data.js");
const STATUS_SHARED = path.join(ROOT, "portal-shared-js/session_feedback_status_portal_data.js");
const TERM = path.join(__dirname, "term_from_timetable.js");
const TERM_SHARED = path.join(ROOT, "portal-shared-js/term_from_timetable.js");

const ASSUME_COMPLETE_THRU = "2026-06-22";
const CATCHUP_STAFF = ["youssef", "dan", "roberto", "javier"];
const JUN10_PENDING_STAFF = ["youssef", "dan", "javier"];
const JUN10_ROBERTO_AMBER = { date: "2026-06-10", time: "5.30 to 6" };
const RAYYAN_RE = /rayaan|rayyan/i;

/** Only outstanding Rayyan feedback in term: Youssef · Tue 9 Jun 2026 (Sun 7 Jun Giuseppe+Javier done). */
function isPendingRayyanFeedback(row) {
  return (
    row.session_date === "2026-06-09" &&
    RAYYAN_RE.test(String(row.client_name || "")) &&
    instKeys(row.instructors).indexOf("youssef") >= 0
  );
}

/** Amber adelantada 5.30–6 solo Wed 10 Jun (Amar Ra absent; era 6–6.30) — feedback Roberto pendiente. */
function isPendingRobertoAmberJun10(row) {
  return (
    row.session_date === JUN10_ROBERTO_AMBER.date &&
    slug(row.client_name) === "amber" &&
    instKeys(row.instructors).indexOf("roberto") >= 0
  );
}

function isExplicitPendingFeedback(row) {
  if (isNoFeedbackClient(row.client_name)) return false;
  if (isPendingRayyanFeedback(row)) return true;
  if (isPendingRobertoAmberJun10(row)) return true;
  if (row.session_date === "2026-06-10") {
    return JUN10_PENDING_STAFF.some(function (s) {
      return instKeys(row.instructors).indexOf(s) >= 0;
    });
  }
  return false;
}

/** Wed 10 Jun: Amber 5.30–6 (not 6–6.30). Thu 11 Jun: restore Mohammed 5.30–6.30. */
function patchSeedRobertoAmberSlots(seed) {
  seed.weeks.forEach(function (w) {
    w.staff.forEach(function (st) {
      if (st.staffKey !== "roberto") return;
      st.days.forEach(function (d) {
        if (d.sessionDate === JUN10_ROBERTO_AMBER.date) {
          d.slots = (d.slots || []).filter(function (s) {
            return !(slug(s.client_name) === "amber" && String(s.time_slot || "").indexOf("6 to 6") >= 0);
          });
          var hasAmberEarly = d.slots.some(function (s) {
            return slug(s.client_name) === "amber" && String(s.time_slot || "").indexOf("5.30") >= 0;
          });
          if (!hasAmberEarly) {
            d.slots.push({
              time_slot: JUN10_ROBERTO_AMBER.time,
              client_name: "Amber",
              service: "Aquatic Activity",
              area: "Teaching Pool",
              pool_note: "Teaching Pool",
              venue: "Acton",
              instructors: "ROBERTO",
              participant_info: "",
            });
          }
        }
        if (d.sessionDate === "2026-06-11") {
          d.slots = (d.slots || []).filter(function (s) {
            return slug(s.client_name) !== "amber";
          });
          var hasMohammed = d.slots.some(function (s) {
            return slug(s.client_name) === "mohammed";
          });
          if (!hasMohammed) {
            d.slots.push({
              time_slot: "5.30 to 6.30",
              client_name: "Mohammed",
              service: "Aquatic Activity",
              area: "Teaching Pool",
              pool_note: "Teaching Pool",
              venue: "Acton",
              instructors: "ROBERTO",
              participant_info: "",
            });
          }
        }
        d.slots.sort(function (a, b) {
          return String(a.time_slot || "").localeCompare(String(b.time_slot || ""));
        });
      });
    });
  });
  return seed;
}

function slug(v) {
  return String(v || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseTimeHm(ts) {
  const m = String(ts || "").match(/(\d{1,2})(?:\.(\d{2}))?/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2] || "00";
  if (h <= 6 && !String(ts).includes(".")) h += 12;
  return String(h).padStart(2, "0") + ":" + min;
}

function isDayCentre(service) {
  return /day\s*centre/i.test(String(service || ""));
}

function isNoFeedbackClient(name) {
  const n = String(name || "").trim().toUpperCase();
  return (
    !n ||
    n === "CLOSED" ||
    n === "NO CLIENT" ||
    n === "NO_CLIENT" ||
    n === "CASA" ||
    n === "HOME" ||
    n === "MANAGER"
  );
}

function normalizeMadreDashboardClient(cn, area) {
  const up = String(cn || "").trim().toUpperCase();
  const areaUp = String(area || "").trim().toUpperCase();
  if (up === "CASA" || up === "HOME" || areaUp === "HOME") return "HOME";
  if (up === "MANAGER") return "MANAGER";
  return String(cn || "").trim();
}

function feedbackUnitKey(row) {
  const iso = row.session_date;
  const client = slug(row.client_name);
  if (isDayCentre(row.service)) return iso + "|" + client + "|day_centre";
  const hm = parseTimeHm(row.time_slot);
  const svc = slug(row.service || "session");
  const area = slug(row.area || "area");
  return iso + "|" + client + "|" + hm + "|" + svc + "|" + area;
}

function sessionKey(row) {
  const hm = parseTimeHm(row.time_slot);
  return [row.session_date, hm, slug(row.client_name), slug(row.area || "")].join("|");
}

function instKeys(raw) {
  return String(raw || "")
    .split(/[,/&+]+|\s+and\s+/gi)
    .map(function (p) {
      return slug(p.split(/\s+/)[0]);
    })
    .filter(Boolean);
}

function rowPending(row) {
  return isExplicitPendingFeedback(row);
}

function seedToAdapterRows(seed) {
  const rows = [];
  seed.weeks.forEach(function (w) {
    w.staff.forEach(function (st) {
      st.days.forEach(function (d) {
        d.slots.forEach(function (s) {
          const area = String(s.pool_note || s.area || "").trim();
          const cn = normalizeMadreDashboardClient(s.client_name, area);
          if (!cn) return;
          if (["CLOSED", "NO CLIENT", "NO PARTICIPANT", "NO_CLIENT"].indexOf(cn.toUpperCase()) >= 0) return;
          rows.push({
            client_name: cn,
            day: d.weekday,
            instructors: String(st.staffName || st.staffKey || "").toUpperCase(),
            service: String(s.service || "").trim(),
            area: cn === "HOME" ? "HOME" : area,
            time_slot: String(s.time_slot || "").trim(),
            venue: String(s.venue || "SwimFarm").trim(),
            session_date: d.sessionDate,
          });
        });
      });
    });
  });
  rows.sort(function (a, b) {
    return (
      a.session_date.localeCompare(b.session_date) ||
      a.time_slot.localeCompare(b.time_slot) ||
      a.instructors.localeCompare(b.instructors)
    );
  });
  return rows;
}

function buildStatusRows(adapterRows) {
  const out = [];
  adapterRows.forEach(function (r) {
    if (isNoFeedbackClient(r.client_name)) return;
    if (r.session_date > "2026-06-11") return;
    const pending = rowPending(r);
    const done = !pending;
    out.push({
      date: r.session_date,
      weekday: r.day,
      client: r.client_name,
      service: r.service,
      timeSlot: r.time_slot,
      instructor: r.instructors,
      venue: r.venue,
      notes: r.area,
      sessionKey: sessionKey(r),
      feedbackUnitKey: feedbackUnitKey(r),
      feedbackMergeGroup: null,
      overviewStatus: done ? "feedback_submitted" : "",
      feedbackComplete: done,
      matchedFeedbackClient: done ? r.client_name : null,
      matchedFeedbackBy: done ? r.instructors : null,
      matchedPortalSessionKey: done ? sessionKey(r) : null,
    });
  });
  const seen = Object.create(null);
  return out.filter(function (st) {
    const k = [st.date, st.feedbackUnitKey, st.instructor].join("|");
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function buildCatchUpDoneByDate(adapterRows) {
  const map = Object.create(null);
  CATCHUP_STAFF.forEach(function (s) {
    map[s] = Object.create(null);
  });
  adapterRows.forEach(function (r) {
    if (isNoFeedbackClient(r.client_name)) return;
    if (r.session_date > ASSUME_COMPLETE_THRU && r.session_date !== "2026-06-10" && r.session_date !== "2026-06-11") return;
    if (isExplicitPendingFeedback(r)) return;
    instKeys(r.instructors).forEach(function (sk) {
      if (!map[sk]) return;
      if (!map[sk][r.session_date]) map[sk][r.session_date] = [];
      const cid = slug(r.client_name);
      if (map[sk][r.session_date].indexOf(cid) < 0) map[sk][r.session_date].push(cid);
    });
  });
  return map;
}

function patchTermConfig(catchUpDone) {
  [TERM, TERM_SHARED].forEach(function (p) {
    if (!fs.existsSync(p)) return;
    let txt = fs.readFileSync(p, "utf8");
    const m = txt.match(/window\.PORTAL_TERM_FROM_TIMETABLE\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!m) throw new Error("term config not found in " + p);
    const cfg = eval("(" + m[1] + ")");
    delete cfg.termFeedbackAssumeCompleteThroughYesterday;
    cfg.termFeedbackAssumeCompleteThroughIso = ASSUME_COMPLETE_THRU;
    cfg.termStaffLateSubmissionBypassProfileKeys = CATCHUP_STAFF.slice();
    cfg.termStaffCatchUpFeedbackDatesByProfileKey = {
      youssef: ["2026-06-09", "2026-06-10"],
      javier: ["2026-06-10"],
      dan: ["2026-06-10"],
      roberto: ["2026-06-10"],
    };
    cfg.termStaffCatchUpFeedbackDoneClientsByDateByProfileKey = catchUpDone;
    const body =
      "// Auto-generated in part by build_portal_summer2_roster_feedback.js (feedback catch-up)\n" +
      "window.PORTAL_TERM_FROM_TIMETABLE = " +
      JSON.stringify(cfg, null, 2) +
      ";\n";
    fs.writeFileSync(p, body, "utf8");
  });
}

const seed = patchSeedRobertoAmberSlots(JSON.parse(fs.readFileSync(SEED, "utf8")));
fs.writeFileSync(SEED, JSON.stringify(seed, null, 2), "utf8");
const adapterRows = seedToAdapterRows(seed);
const statusRows = buildStatusRows(adapterRows);
const catchUpDone = buildCatchUpDoneByDate(adapterRows);

const rowsJs =
  "// Roster MADRE → dashboard adapter rows. Generated from roster_term_master_seed.json\n" +
  "window.ROSTER_TERM_MASTER_DASHBOARD_ROWS = " +
  JSON.stringify(adapterRows) +
  ";\n";
fs.writeFileSync(ROWS_OUT, rowsJs, "utf8");

const statusPayload = {
  meta: {
    sourceFiles: ["roster_term_master_seed.json", "build_portal_summer2_roster_feedback.js"],
    exportedAt: new Date().toISOString(),
    rowCount: statusRows.length,
    logicDoc: "portal-import-bundle/FEEDBACK-COMPLETION-LOGIC.md",
    sourceNote:
      "Pending: Youssef·Rayyan Tue 9 Jun; Dan+Javier+Youssef all Wed 10 Jun; Roberto·Amber Wed 10 Jun 5.30–6 (Amar Ra absent). Rest Jun 1–9 complete.",
    coverageThroughIso: "2026-06-11",
  },
  rows: statusRows,
};
const statusJs =
  "window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE = " +
  JSON.stringify(statusPayload) +
  ";\n";
fs.writeFileSync(STATUS_OUT, statusJs, "utf8");
fs.writeFileSync(STATUS_SHARED, statusJs, "utf8");

patchTermConfig(catchUpDone);

console.log("Wrote", ROWS_OUT, adapterRows.length, "rows");
console.log("Wrote", STATUS_OUT, statusRows.length, "status rows");
console.log("Patched term_from_timetable (both copies)");
console.log(
  "Pending Rayyan:",
  statusRows.filter(function (r) {
    return RAYYAN_RE.test(r.client) && !r.feedbackComplete;
  }).map(function (r) {
    return r.date + " " + r.instructor;
  }).join(", ") || "none"
);
console.log(
  "Jun10 pending rows:",
  statusRows.filter(function (r) {
    return r.date === "2026-06-10" && !r.feedbackComplete;
  }).length,
  "by",
  [].concat
    .apply(
      [],
      statusRows
        .filter(function (r) {
          return r.date === "2026-06-10" && !r.feedbackComplete;
        })
        .map(function (r) {
          return r.instructor;
        })
    )
    .filter(function (v, i, a) {
      return a.indexOf(v) === i;
    })
    .join(", ")
);
console.log(
  "Jun10 Roberto Amber pending:",
  statusRows.some(function (r) {
    return r.date === "2026-06-10" && r.client === "Amber" && r.instructor === "ROBERTO" && !r.feedbackComplete;
  })
);
console.log(
  "Jun11 Roberto Amber pending:",
  statusRows.some(function (r) {
    return r.date === "2026-06-11" && r.client === "Amber" && !r.feedbackComplete;
  })
);
