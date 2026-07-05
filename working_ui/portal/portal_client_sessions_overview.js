/**
 * Read-only participant Sessions Overview — KPI strip + feedback table (admin-style).
 */
(function (global) {
  "use strict";

  var TERM_LABEL = "Summer Term 2026";

  function clean(v) {
    return String(v == null ? "" : v)
      .replace(/\s+/g, " ")
      .trim();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normName(v) {
    return clean(v).toLowerCase();
  }

  function isoFromAny(raw) {
    const s = clean(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) {
      return (
        m[3] +
        "-" +
        String(m[2]).padStart(2, "0") +
        "-" +
        String(m[1]).padStart(2, "0")
      );
    }
    return "";
  }

  function formatDateLong(iso) {
    const s = isoFromAny(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return clean(iso) || "—";
    try {
      const p = s.split("-").map(Number);
      const d = new Date(p[0], p[1] - 1, p[2]);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_) {
      return s;
    }
  }

  function formatServiceTime(raw) {
    const t = clean(raw);
    if (!t) return "";
    return t.replace(/\./g, ":").replace(/\s*-\s*/g, " to ");
  }

  /** Canonical programme label — Aquatic / Climbing / Physical / Multi-Activity only. */
  function displayProgrammeName(raw) {
    var t = clean(raw);
    if (!t) return "Session";
    t = t.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    var p = t.toLowerCase().replace(/\s+/g, " ");
    if (/multi[\s_-]*activity/i.test(t) || /splash[\s&+]+connect|splash\s+and\s+connect/i.test(t)) {
      return "Multi-Activity";
    }
    if (/\bfitness\b/.test(p) || /physical\s+act/i.test(p)) return "Physical Activity";
    if (/\bclimbing\s+activity\b/.test(p) || /\bclimb(ing)?\b/.test(p)) return "Climbing Activity";
    if (
      /\baquatic\s+activity\b/.test(p) ||
      /\bswimming\b/.test(p) ||
      /\bswim\b/.test(p) ||
      p.indexOf("aquatic") >= 0
    ) {
      return "Aquatic Activity";
    }
    if (p.indexOf("physical activity") >= 0) return "Physical Activity";
    if (/\bbespoke\b/.test(p) || /\bfitfun\b/.test(p)) return "Bespoke Programme";
    if (p.indexOf("day centre") >= 0 || p.indexOf("daycentre") >= 0) return "Day centre";
    return t.length > 40 ? t.slice(0, 37) + "…" : t;
  }

  function participantMatches(clientId, clientName, rowName, rowId) {
    const wantName = normName(clientName);
    const wantId = slugify(clientId || clientName);
    const gotName = normName(rowName);
    const gotId = slugify(rowId || rowName);
    if (wantId && gotId && wantId === gotId) return true;
    if (wantName && gotName && wantName === gotName) return true;
    return false;
  }

  function independenceLabel(raw) {
    if (Array.isArray(raw)) return raw.map(clean).filter(Boolean).join(", ");
    return clean(raw);
  }

  function embeddedFeedbackRows() {
    const src = global.SESSION_FEEDBACK_PORTAL_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  function mapEmbeddedFeedback(r) {
    return {
      kind: "feedback",
      session_date: isoFromAny(r.date || r.session_date || r.sessionDate),
      client_name: clean(r.clientName || r.client || r.client_name),
      service: clean(r.service),
      session_time: clean(r.sessionTime || r.time || r.session_time),
      completed_by_name: clean(r.instructor || r.completedBy || r.completed_by_name),
      attendance: clean(r.attendance),
      engagement_rating: r.engagement != null ? r.engagement : r.engagement_rating,
      client_emotions: clean(r.emotions || r.client_emotions),
      engagement_patterns: independenceLabel(
        r.independence || r.engagement_patterns || r.engagementPatterns
      ),
      positive_feedback: clean(r.positive || r.positive_feedback),
      relevant_information: clean(
        r.relevantParent || r.relevant || r.relevant_information
      ),
      incidents: clean(r.incidents),
      source: "embed",
    };
  }

  function mapDbFeedback(r) {
    const patterns = r.engagement_patterns;
    return {
      kind: "feedback",
      session_date: isoFromAny(r.session_date),
      client_name: clean(r.client_name),
      service: clean(r.service),
      session_time: clean(r.session_time),
      completed_by_name: clean(r.completed_by_name),
      attendance: clean(r.attendance),
      engagement_rating: r.engagement_rating,
      client_emotions: clean(r.client_emotions),
      engagement_patterns: Array.isArray(patterns)
        ? patterns.map(clean).filter(Boolean).join(", ")
        : clean(patterns),
      positive_feedback: clean(r.positive_feedback),
      relevant_information: clean(r.relevant_information),
      incidents: clean(r.incidents),
      source: "live",
    };
  }

  function mapDbIncident(r) {
    return {
      kind: "incident",
      session_date: isoFromAny(r.session_date),
      client_name: clean(r.client_name),
      service: clean(r.service),
      session_time: clean(r.session_time),
      completed_by_name: clean(r.submitted_by_name),
      incident_category: clean(r.incident_category),
      statement_during: clean(r.statement_during),
      statement_before: clean(r.statement_before),
      statement_after: clean(r.statement_after),
      location: clean(r.location),
      source: "live",
    };
  }

  function mergeKey(row) {
    return [
      row.kind,
      row.session_date,
      row.client_name,
      row.session_time,
      row.completed_by_name,
      row.incident_category || "",
      (row.positive_feedback || "").slice(0, 40),
    ].join("|");
  }

  function sortNewestFirst(a, b) {
    const da = isoFromAny(a.session_date);
    const db = isoFromAny(b.session_date);
    if (da !== db) return db.localeCompare(da);
    return clean(b.session_time).localeCompare(clean(a.session_time));
  }

  function collectEmbedded(clientId, clientName) {
    const out = [];
    embeddedFeedbackRows().forEach(function (r) {
      if (!r) return;
      const mapped = mapEmbeddedFeedback(r);
      if (!participantMatches(clientId, clientName, mapped.client_name, "")) return;
      out.push(mapped);
    });
    return out;
  }

  async function fetchLiveRows(clientId, clientName) {
    const box = global.__PORTAL_SUPABASE__;
    const sb = box && box.client;
    if (!sb) return { feedback: [], incidents: [] };

    const name = clean(clientName);
    const id = slugify(clientId || clientName);
    const fbSel =
      "session_date, client_name, client_id, service, session_time, attendance, engagement_rating, engagement_patterns, client_emotions, positive_feedback, relevant_information, completed_by_name, incidents, created_at";
    const incSel =
      "session_date, client_name, client_id, service, session_time, incident_category, statement_during, statement_before, statement_after, location, submitted_by_name, created_at";

    const queries = [];
    if (name) {
      queries.push(
        sb.from("session_feedback").select(fbSel).ilike("client_name", name),
        sb.from("incident_reports").select(incSel).ilike("client_name", name)
      );
    }
    if (id) {
      queries.push(
        sb.from("session_feedback").select(fbSel).eq("client_id", id),
        sb.from("incident_reports").select(incSel).eq("client_id", id)
      );
    }

    const feedback = [];
    const incidents = [];
    try {
      const results = await Promise.all(queries);
      results.forEach(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return;
        res.data.forEach(function (row) {
          if (!row) return;
          if (row.incident_category != null) {
            if (participantMatches(clientId, clientName, row.client_name, row.client_id)) {
              incidents.push(mapDbIncident(row));
            }
          } else if (row.attendance != null || row.engagement_rating != null) {
            if (participantMatches(clientId, clientName, row.client_name, row.client_id)) {
              feedback.push(mapDbFeedback(row));
            }
          }
        });
      });
    } catch (_) {}
    return { feedback: feedback, incidents: incidents };
  }

  function mergeRows(lists) {
    const seen = new Set();
    const out = [];
    lists.forEach(function (list) {
      (list || []).forEach(function (row) {
        const k = mergeKey(row);
        if (!k || seen.has(k)) return;
        seen.add(k);
        out.push(row);
      });
    });
    out.sort(sortNewestFirst);
    return out;
  }

  function emotionPalette(k) {
    const p = String(k || "").trim().toLowerCase();
    if (/happy|excited|pleased|joy/.test(p)) return "happy";
    if (/anxious|anxiety|worried|nervous/.test(p)) return "anxious";
    if (/withdrawn|withdraw|quiet|shut\s*down/.test(p)) return "withdrawn";
    if (/out\s*of\s*control|meltdown|dysreg/.test(p)) return "outcontrol";
    return "default";
  }

  function emotionFaceSvg(cat) {
    const vb = "0 0 20 20";
    const sw = "1.15";
    const ink = "#0f172b";
    if (cat === "happy") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="12" height="12" aria-hidden="true"><circle cx="10" cy="10" r="8.3" fill="#22c55e" stroke="' + ink + '" stroke-width="' + sw + '"/><circle cx="6.9" cy="7.6" r="1.05" fill="' + ink + '"/><circle cx="13.1" cy="7.6" r="1.05" fill="' + ink + '"/><path d="M6.8 12.2 Q10 15.6 13.2 12.2" fill="none" stroke="' + ink + '" stroke-width="' + sw + '" stroke-linecap="round"/></svg>';
    }
    if (cat === "anxious") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="12" height="12" aria-hidden="true"><circle cx="10" cy="10" r="8.3" fill="#facc15" stroke="' + ink + '" stroke-width="' + sw + '"/><path d="M6 7.2h2M12 7.2h2" stroke="' + ink + '" stroke-width="' + sw + '" stroke-linecap="round"/><path d="M6.5 13h7" fill="none" stroke="' + ink + '" stroke-width="' + sw + '" stroke-linecap="round"/></svg>';
    }
    if (cat === "withdrawn") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="12" height="12" aria-hidden="true"><circle cx="10" cy="10" r="8.3" fill="#3b82f6" stroke="' + ink + '" stroke-width="' + sw + '"/><circle cx="6.9" cy="7.2" r="0.95" fill="' + ink + '"/><circle cx="13.1" cy="7.2" r="0.95" fill="' + ink + '"/><path d="M6.5 13h7" fill="none" stroke="' + ink + '" stroke-width="' + sw + '" stroke-linecap="round"/></svg>';
    }
    if (cat === "outcontrol") {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="12" height="12" aria-hidden="true"><circle cx="10" cy="10" r="8.3" fill="#ef4444" stroke="' + ink + '" stroke-width="' + sw + '"/><circle cx="7" cy="7.2" r="1.35" fill="' + ink + '"/><circle cx="13" cy="7.2" r="1.35" fill="' + ink + '"/><ellipse cx="10" cy="13.2" rx="3.2" ry="2.2" fill="' + ink + '"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="12" height="12" aria-hidden="true"><circle cx="10" cy="10" r="8.3" fill="#94a3b8" stroke="' + ink + '" stroke-width="' + sw + '"/><circle cx="7" cy="7.5" r="1" fill="' + ink + '"/><circle cx="13" cy="7.5" r="1" fill="' + ink + '"/><path d="M7 12.5h6" fill="none" stroke="' + ink + '" stroke-width="' + sw + '" stroke-linecap="round"/></svg>';
  }

  function emotionIconsCell(raw) {
    const s = clean(raw);
    if (!s || s === "—") return '<span class="muted">—</span>';
    const parts = s.split(/[,;·|]+/).map(clean).filter(Boolean);
    if (!parts.length) return '<span class="muted">—</span>';
    const title = esc(parts.join("; "));
    return (
      '<span class="pcso-emo-faces" title="' +
      title +
      '" aria-label="' +
      title +
      '">' +
      parts.map(function (tok) {
        return emotionFaceSvg(emotionPalette(tok));
      }).join("") +
      "</span>"
    );
  }

  function emotionHeaderHtml() {
    return (
      '<span class="pcso-emo-key" aria-hidden="true">' +
      emotionFaceSvg("happy") +
      emotionFaceSvg("anxious") +
      emotionFaceSvg("withdrawn") +
      emotionFaceSvg("outcontrol") +
      "</span>"
    );
  }

  function starHeaderHtml() {
    return (
      '<span class="pcso-th-star" role="img" aria-label="Engagement score, 1 to 5">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' +
      "</svg></span>"
    );
  }

  function independenceBucket(raw) {
    const p = String(raw || "").trim().toLowerCase();
    if (!p || p === "—") return null;
    if (/full\s*support|fully\s*supported/.test(p)) return "full";
    if (/regular\s*support/.test(p)) return "regular";
    if (/prompt|minimal/.test(p)) return "prompts";
    if (/^independent$|mostly\s+independent/.test(p)) return "independent";
    if (/independent/.test(p)) return "prompts";
    return "other";
  }

  function attendanceIsAbsent(raw) {
    var p = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!p) return false;
    return (
      p.charAt(0) === "n" ||
      p.indexOf("absent") >= 0 ||
      p.indexOf("did not") >= 0 ||
      p === "dna"
    );
  }

  function attendanceKpiHtml(list) {
    var total = list.length;
    if (!total) return '<p class="pcso-kpi-empty">No sessions yet.</p>';
    var absent = 0;
    list.forEach(function (r) {
      if (attendanceIsAbsent(r.attendance)) absent++;
    });
    var present = total - absent;
    var pctPresent = Math.round((present / total) * 100);
    var pctAbsent = Math.max(0, 100 - pctPresent);
    return (
      '<div class="pcso-att-kpi" role="img" aria-label="' +
      present +
      " attended, " +
      absent +
      " absent, " +
      total +
      ' sessions">' +
      '<div class="pcso-att-bar">' +
      (present > 0
        ? '<span class="pcso-att-bar__seg pcso-att-bar__seg--present" style="width:' + pctPresent + '%"></span>'
        : "") +
      (absent > 0
        ? '<span class="pcso-att-bar__seg pcso-att-bar__seg--absent" style="width:' + pctAbsent + '%"></span>'
        : "") +
      "</div>" +
      '<div class="pcso-att-legend">' +
      '<span class="pcso-att-legend__item pcso-att-legend__item--present"><strong>' +
      present +
      "</strong> attended</span>" +
      '<span class="pcso-att-legend__item pcso-att-legend__item--absent"><strong>' +
      absent +
      "</strong> absent</span>" +
      "</div>" +
      '<div class="pcso-att-foot">' +
      pctPresent +
      "% · " +
      total +
      " sessions</div></div>"
    );
  }

  function engagementGaugeHtml(list) {
    const vals = [];
    list.forEach(function (r) {
      const n = Number(r.engagement_rating);
      if (Number.isFinite(n) && n >= 1 && n <= 5) vals.push(n);
    });
    if (!vals.length) {
      return '<p class="pcso-kpi-empty">No engagement scores yet.</p>';
    }
    const avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    const pctInt = Math.min(100, Math.max(0, Math.round((avg / 5) * 100)));
    const ang = Math.PI - (pctInt / 100) * Math.PI;
    const cx = 100, cy = 94, r = 70;
    const nx = cx + r * Math.cos(ang);
    const ny = cy - r * Math.sin(ang);
    const tier = pctInt >= 75 ? "g" : pctInt >= 50 ? "y" : pctInt >= 25 ? "o" : "r";
    return (
      '<div class="pcso-gauge">' +
      '<svg class="pcso-gauge__svg" viewBox="0 0 200 100" role="img" aria-label="Engagement ' + pctInt + ' percent">' +
      '<path class="pcso-gauge__seg pcso-gauge__seg--r" d="M 30 94 A 70 70 0 0 1 58.8 30.6"/>' +
      '<path class="pcso-gauge__seg pcso-gauge__seg--o" d="M 58.8 30.6 A 70 70 0 0 1 100 24"/>' +
      '<path class="pcso-gauge__seg pcso-gauge__seg--y" d="M 100 24 A 70 70 0 0 1 141.2 30.6"/>' +
      '<path class="pcso-gauge__seg pcso-gauge__seg--g" d="M 141.2 30.6 A 70 70 0 0 1 170 94"/>' +
      '<line class="pcso-gauge__needle" x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '"/>' +
      '<circle class="pcso-gauge__hub" cx="' + cx + '" cy="' + cy + '" r="5"/>' +
      "</svg>" +
      '<div class="pcso-gauge__stats">' +
      '<span class="pcso-gauge__pct pcso-gauge__pct--' + tier + '">' + pctInt + "%</span>" +
      '<span class="pcso-gauge__avg">' + avg.toFixed(1) + " / 5 avg</span>" +
      '<span class="pcso-gauge__foot">' + vals.length + " sessions with scores</span>" +
      "</div></div>"
    );
  }

  function emotionKpiHtml(list) {
    const buckets = { happy: 0, anxious: 0, withdrawn: 0, outcontrol: 0 };
    let total = 0;
    list.forEach(function (r) {
      const em = clean(r.client_emotions);
      if (!em || em === "—") return;
      em.split(/[,;]+/).map(clean).filter(Boolean).forEach(function (tok) {
        const pal = emotionPalette(tok);
        if (pal === "happy" || pal === "anxious" || pal === "withdrawn" || pal === "outcontrol") {
          buckets[pal]++;
          total++;
        }
      });
    });
    const order = [
      { key: "happy", label: "Happy", colors: { hi: "#4ade80", lo: "#15803d", track: "#ecfdf5" } },
      { key: "anxious", label: "Anxious", colors: { hi: "#fde047", lo: "#ca8a04", track: "#fffbeb" } },
      { key: "withdrawn", label: "Withdrawn", colors: { hi: "#60a5fa", lo: "#1d4ed8", track: "#eff6ff" } },
      { key: "outcontrol", label: "Out of ctrl", colors: { hi: "#fb7185", lo: "#b91c1c", track: "#fff1f2" } },
    ];
    const items = order
      .map(function (o) {
        const n = buckets[o.key] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const c = o.colors;
        const deg = n > 0 ? Math.min(359.98, Math.round(pct * 3.6 * 10) / 10) : 0;
        const bg =
          deg <= 0.05
            ? c.track
            : "conic-gradient(from -90deg, " + c.lo + " 0deg, " + c.hi + " " + deg + "deg, " + c.track + " " + deg + "deg 360deg)";
        return (
          '<div class="pcso-emo-grid__item">' +
          '<div class="pcso-emo-grid__face">' +
          emotionFaceSvg(o.key) +
          "</div>" +
          '<div class="pcso-emo-donut pcso-emo-donut--sm" style="background:' +
          bg +
          '">' +
          '<div class="pcso-emo-donut__inner pcso-emo-donut__inner--sm">' +
          pct +
          "%</div></div>" +
          '<span class="pcso-emo-grid__lbl">' +
          esc(o.label) +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<div class="pcso-emo-grid" role="img" aria-label="Regulation and emotions">' +
      items +
      "</div>" +
      '<div class="pcso-emo-grid__foot">' +
      (total ? total + " tags total" : "No emotion tags yet") +
      "</div>"
    );
  }

  function independenceKpiHtml(list) {
    const buckets = { independent: 0, prompts: 0, regular: 0, full: 0 };
    let total = 0;
    list.forEach(function (r) {
      const b = independenceBucket(r.engagement_patterns);
      if (!b || b === "other") return;
      if (buckets[b] != null) {
        buckets[b]++;
        total++;
      }
    });
    if (!total) return '<p class="pcso-kpi-empty">No independence labels yet.</p>';
    const order = [
      { key: "independent", label: "Independent", color: "#ddd6fe" },
      { key: "prompts", label: "With prompts", color: "#c4b5fd" },
      { key: "regular", label: "Regular support", color: "#a78bfa" },
      { key: "full", label: "Full support", color: "#7c3aed" },
    ];
    return (
      '<div class="pcso-ind-bars" role="img" aria-label="Independence distribution">' +
      order
        .map(function (o) {
          const n = buckets[o.key] || 0;
          const pct = (n / total) * 100;
          const h = n > 0 ? Math.max(10, Math.round(pct)) : 0;
          return (
            '<div class="pcso-ind-bar">' +
            '<span class="pcso-ind-bar__pct">' + Math.round(pct) + "%</span>" +
            '<div class="pcso-ind-bar__track" title="' + esc(o.label + ": " + n) + '">' +
            '<div class="pcso-ind-bar__fill" style="height:' + h + "%;background:" + o.color + '"></div></div>' +
            '<span class="pcso-ind-bar__lbl">' + esc(o.label) + "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function kpiSlabHtml(feedback, termLabel, opts) {
    var term = clean(termLabel || TERM_LABEL);
    var includeAttendance = !!(opts && opts.includeAttendance);
    var attendanceCard = includeAttendance
      ? '<article class="pcso-kpi-card"><header class="pcso-kpi-card__head"><h4>Attendance</h4><p>(' + esc(term) + ")</p></header>" +
        attendanceKpiHtml(feedback) +
        "</article>"
      : "";
    return (
      '<div class="pcso-kpi-grid' +
      (includeAttendance ? " pcso-kpi-grid--4" : "") +
      '" role="region" aria-label="Session summary">' +
      attendanceCard +
      '<article class="pcso-kpi-card"><header class="pcso-kpi-card__head"><h4>Engagement</h4><p>(' + esc(term) + ")</p></header>" +
      engagementGaugeHtml(feedback) +
      "</article>" +
      '<article class="pcso-kpi-card"><header class="pcso-kpi-card__head"><h4>Regulation / emotions</h4><p>(' + esc(term) + ")</p></header>" +
      emotionKpiHtml(feedback) +
      "</article>" +
      '<article class="pcso-kpi-card"><header class="pcso-kpi-card__head"><h4>Independence</h4><p>(' + esc(term) + ")</p></header>" +
      independenceKpiHtml(feedback) +
      "</article></div>"
    );
  }

  function incidentLookup(incidents) {
    const map = Object.create(null);
    incidents.forEach(function (inc) {
      const k = isoFromAny(inc.session_date);
      if (!k) return;
      const prev = map[k] || [];
      prev.push(inc);
      map[k] = prev;
    });
    return map;
  }

  function incidentCellForRow(row, incMap) {
    const inline = clean(row.incidents);
    if (inline && inline.toLowerCase() !== "none" && inline !== "—") {
      const short = inline.length > 72 ? inline.slice(0, 69) + "…" : inline;
      return '<span title="' + esc(inline) + '">' + esc(short) + "</span>";
    }
    const list = incMap[isoFromAny(row.session_date)] || [];
    if (!list.length) return '<span class="muted">—</span>';
    const txt = list
      .map(function (i) {
        return clean(i.incident_category) || "Incident";
      })
      .join("; ");
    return '<span class="pcso-inc-flag" title="' + esc(txt) + '">' + esc(txt.length > 48 ? txt.slice(0, 45) + "…" : txt) + "</span>";
  }

  function noteCell(raw, max) {
    const v = clean(raw);
    if (!v || v === "—") return '<span class="muted">—</span>';
    max = max || 120;
    const short = v.length > max ? v.slice(0, max - 1) + "…" : v;
    return '<span title="' + esc(v) + '">' + esc(short) + "</span>";
  }

  function feedbackTableRow(row, incMap) {
    const inst = clean(row.completed_by_name) || "—";
    const dateLine = formatDateLong(row.session_date);
    const svc = displayProgrammeName(row.service);
    const timeLine = formatServiceTime(row.session_time);
    const eng =
      row.engagement_rating != null && row.engagement_rating !== ""
        ? esc(String(row.engagement_rating))
        : '<span class="muted">—</span>';
    return (
      "<tr>" +
      '<td class="pcso-tbl__inst">' +
      '<div class="pcso-tbl__inst-name">' + esc(inst) + "</div>" +
      '<div class="pcso-tbl__inst-date">' + esc(dateLine) + "</div></td>" +
      '<td class="pcso-tbl__svc">' +
      '<div class="pcso-tbl__svc-main">' + esc(svc) + "</div>" +
      (timeLine ? '<div class="pcso-tbl__sub">' + esc(timeLine) + "</div>" : "") +
      "</td>" +
      '<td class="pcso-tbl__eng">' + eng + "</td>" +
      '<td class="pcso-tbl__emo">' + emotionIconsCell(row.client_emotions) + "</td>" +
      '<td class="pcso-tbl__indep">' + esc(clean(row.engagement_patterns) || "—") + "</td>" +
      '<td class="pcso-tbl__inc">' + incidentCellForRow(row, incMap) + "</td>" +
      '<td class="pcso-tbl__pos">' + noteCell(row.positive_feedback, 140) + "</td>" +
      '<td class="pcso-tbl__rel">' + noteCell(row.relevant_information, 100) + "</td>" +
      "</tr>"
    );
  }

  function feedbackTableHtml(feedback, incMap) {
    if (!feedback.length) {
      return '<p class="pcso-empty" role="status">No session feedback recorded for this participant yet.</p>';
    }
    return (
      '<div class="pcso-table-wrap">' +
      '<table class="pcso-table">' +
      "<thead><tr>" +
      '<th scope="col" class="pcso-tbl__inst">Instructor</th>' +
      '<th scope="col" class="pcso-tbl__svc">Service</th>' +
      '<th scope="col" class="pcso-tbl__eng" title="Engagement (1–5)">' + starHeaderHtml() + "</th>" +
      '<th scope="col" class="pcso-tbl__emo" aria-label="Regulation and emotions">' + emotionHeaderHtml() + "</th>" +
      '<th scope="col" class="pcso-tbl__indep">Independence</th>' +
      '<th scope="col" class="pcso-tbl__inc">Incidents</th>' +
      '<th scope="col" class="pcso-tbl__pos">Positive</th>' +
      '<th scope="col" class="pcso-tbl__rel">Relevant</th>' +
      "</tr></thead><tbody>" +
      feedback.map(function (r) { return feedbackTableRow(r, incMap); }).join("") +
      "</tbody></table></div>"
    );
  }

  function incidentsSectionHtml(incidents) {
    if (!incidents.length) return "";
    const rows = incidents
      .map(function (inc) {
        const when = formatDateLong(inc.session_date);
        const worker = clean(inc.completed_by_name) || "—";
        const cat = clean(inc.incident_category) || "Incident";
        const body = clean(inc.statement_during || inc.statement_before || inc.statement_after);
        return (
          '<details class="pcso-inc-card">' +
          '<summary><span class="pcso-inc-card__cat">' + esc(cat) + "</span>" +
          '<span class="pcso-inc-card__meta">' + esc(when) + " · " + esc(worker) + "</span>" +
          (body ? '<span class="pcso-inc-card__preview">' + esc(body.length > 100 ? body.slice(0, 97) + "…" : body) + "</span>" : "") +
          "</summary>" +
          (body ? '<div class="pcso-inc-card__body">' + esc(body).replace(/\n/g, "<br>") + "</div>" : "") +
          "</details>"
        );
      })
      .join("");
    return (
      '<section class="pcso-inc-section">' +
      '<h4 class="pcso-section__title">Incident reports</h4>' +
      '<div class="pcso-inc-list">' + rows + "</div></section>"
    );
  }

  async function render(hostEl, opts) {
    if (!hostEl) return;
    const clientId = clean(opts && opts.clientId);
    const clientName = clean(opts && opts.clientName);
    hostEl.innerHTML = '<p class="pcso-loading" role="status">Loading sessions overview…</p>';

    const embedded = collectEmbedded(clientId, clientName);
    let liveFb = [];
    let liveInc = [];
    try {
      const live = await fetchLiveRows(clientId, clientName);
      liveFb = live.feedback;
      liveInc = live.incidents;
    } catch (_) {}

    const feedback = mergeRows([
      embedded.filter(function (r) { return r.kind === "feedback"; }),
      liveFb,
    ]);
    const incidents = mergeRows([liveInc]);
    const incMap = incidentLookup(incidents);

    hostEl.innerHTML =
      kpiSlabHtml(feedback) +
      '<section class="pcso-feed-section">' +
      '<div class="pcso-feed-head"><h4 class="pcso-section__title">All feedbacks</h4></div>' +
      feedbackTableHtml(feedback, incMap) +
      "</section>" +
      incidentsSectionHtml(incidents);
  }

  function parentEngagementCell(row) {
    if (row.engagement_rating == null || row.engagement_rating === "") {
      return '<span class="muted">—</span>';
    }
    var n = esc(String(row.engagement_rating));
    return (
      '<span class="pcso-eng-score">' +
      n +
      ' <span class="pcso-th-star pcso-eng-star" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="13" height="13" focusable="false">' +
      '<path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' +
      "</svg></span></span>"
    );
  }

  function parentCommentsCell(row) {
    if (row.message_pending) {
      return '<span class="pcso-pending">Preparing…</span>';
    }
    var text = clean(row.comment || row.parent_message);
    if (!text || text === "—") return '<span class="muted">—</span>';
    return '<span class="pcso-comment-text" title="' + esc(text) + '">' + esc(text) + "</span>";
  }

  function parentAuthorCell(row) {
    var name = clean(row.feedback_by_name);
    var role = clean(row.feedback_by_role);
    if (!name && !role) return '<span class="muted">—</span>';
    return (
      '<div class="pcso-author-stack">' +
      (name ? '<div class="pcso-tbl__author-name">' + esc(name) + "</div>" : "") +
      (role ? '<div class="pcso-tbl__author-role">' + esc(role) + "</div>" : "") +
      "</div>"
    );
  }

  function parentFeedbackTableRow(row) {
    const dateLine = formatDateLong(row.session_date);
    const svc = displayProgrammeName(row.service);
    const timeLine = formatServiceTime(row.session_time);
    const indep = esc(clean(row.engagement_patterns) || "—");
    return (
      "<tr>" +
      '<td class="pcso-tbl__date">' +
      '<div class="pcso-tbl__date-main">' + esc(dateLine) + "</div>" +
      "</td>" +
      '<td class="pcso-tbl__svc">' +
      '<div class="pcso-tbl__svc-main">' + esc(svc) + "</div>" +
      (timeLine ? '<div class="pcso-tbl__sub">' + esc(timeLine) + "</div>" : "") +
      "</td>" +
      '<td class="pcso-tbl__eng">' + parentEngagementCell(row) + "</td>" +
      '<td class="pcso-tbl__emo">' + emotionIconsCell(row.client_emotions) + "</td>" +
      '<td class="pcso-tbl__indep"><span class="pcso-indep-text" title="' + indep + '">' + indep + "</span></td>" +
      '<td class="pcso-tbl__comments">' + parentCommentsCell(row) + "</td>" +
      '<td class="pcso-tbl__author">' + parentAuthorCell(row) + "</td>" +
      "</tr>"
    );
  }

  function parentFeedbackTableHtml(feedback) {
    if (!feedback.length) {
      return '<p class="pcso-empty" role="status">No session feedback recorded for this participant yet.</p>';
    }
    return (
      '<div class="pcso-table-wrap">' +
      '<table class="pcso-table pcso-table--parent">' +
      "<thead><tr>" +
      '<th scope="col" class="pcso-tbl__date">Date</th>' +
      '<th scope="col" class="pcso-tbl__svc">Service &amp; time</th>' +
      '<th scope="col" class="pcso-tbl__eng">Engagement</th>' +
      '<th scope="col" class="pcso-tbl__emo">Regulation</th>' +
      '<th scope="col" class="pcso-tbl__indep">Independence</th>' +
      '<th scope="col" class="pcso-tbl__comments">Comments</th>' +
      '<th scope="col" class="pcso-tbl__author">Written by</th>' +
      "</tr></thead><tbody>" +
      feedback.map(function (r) { return parentFeedbackTableRow(r); }).join("") +
      "</tbody></table></div>"
    );
  }

  function achievementsGalleryHtml(items, opts) {
    var list = Array.isArray(items) ? items : [];
    var parentDownloads = !!(opts && opts.parentDownloads);
    if (!list.length) {
      return '<p class="pcso-empty">No achievement photos shared yet.</p>';
    }
    return (
      '<div class="pp-ach-grid" role="list">' +
      list
        .map(function (a) {
          var when = formatDateLong(a.session_date);
          var photoId = clean(a.id);
          var isDownloaded = String(a.status || "").toLowerCase() === "downloaded";
          var dlLabel = isDownloaded ? "Saved" : "Download";
          var dlBtn = parentDownloads && photoId
            ? '<button type="button" class="pp-ach-dl-btn' +
              (isDownloaded ? " pp-ach-dl-btn--saved" : "") +
              '" data-pp-ach-download="' +
              esc(photoId) +
              '"' +
              (isDownloaded ? ' disabled aria-label="Already saved on your device"' : ' aria-label="Download achievement photo"') +
              ">" +
              esc(dlLabel) +
              "</button>"
            : "";
          return (
            '<figure class="pp-ach-item" role="listitem">' +
            '<a href="' + esc(a.url || "#") + '" target="_blank" rel="noopener noreferrer">' +
            '<img src="' + esc(a.url || "") + '" alt="Achievement photo, ' + esc(when) + '" loading="lazy" width="160" height="160" />' +
            "</a>" +
            '<figcaption class="pp-ach-cap">' + esc(when) + dlBtn + "</figcaption></figure>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function mapParentSessionRow(r) {
    return {
      kind: "feedback",
      session_date: isoFromAny(r.session_date),
      client_name: "",
      service: clean(r.service),
      session_time: clean(r.session_time),
      completed_by_name: clean(r.feedback_by_name || r.completed_by_name),
      attendance: clean(r.attendance),
      engagement_rating: r.engagement_rating,
      client_emotions: clean(r.client_emotions),
      engagement_patterns: clean(r.independence),
      feedback_by_name: clean(r.feedback_by_name),
      feedback_by_role: clean(r.feedback_by_role),
      comment: clean(r.comment || r.parent_message),
      parent_message: clean(r.comment || r.parent_message),
      message_pending: !!r.message_pending,
      positive_feedback: "",
      relevant_information: "",
    };
  }

  function renderParent(hostEl, opts) {
    if (!hostEl) return;
    var sessions = (opts && opts.sessions) || [];
    var achievements = (opts && opts.achievements) || [];
    var hideAchievements = !!(opts && opts.hideAchievements);
    var term = clean((opts && opts.term_label) || TERM_LABEL);
    var feedback = sessions.map(mapParentSessionRow);
    hostEl.innerHTML =
      kpiSlabHtml(feedback, term, { includeAttendance: true }) +
      '<section class="pcso-feed-section">' +
      '<div class="pcso-feed-head"><h4 class="pcso-section__title">Session feedback</h4></div>' +
      parentFeedbackTableHtml(feedback) +
      "</section>" +
      (hideAchievements
        ? ""
        : '<section class="pcso-feed-section pp-ach-section">' +
          '<div class="pcso-feed-head"><h4 class="pcso-section__title">Achievements</h4></div>' +
          achievementsGalleryHtml(achievements) +
          "</section>");
  }

  global.PortalClientSessionsOverview = {
    render: render,
    renderParent: renderParent,
    achievementsGalleryHtml: achievementsGalleryHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
