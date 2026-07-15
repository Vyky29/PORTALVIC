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
      swim_done: r.swim_done === true || r.swim_done === "true" || r.swim_done === 1,
      swim_engagement_rating: r.swim_engagement_rating,
      swim_regulation: clean(r.swim_regulation),
      swim_independence: clean(r.swim_independence),
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
      "session_date, client_name, client_id, service, session_time, attendance, engagement_rating, engagement_patterns, client_emotions, positive_feedback, relevant_information, completed_by_name, incidents, created_at, swim_done, swim_engagement_rating, swim_regulation, swim_independence";
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
      p === "dna" ||
      /\b(no[\s-]?show|noshow|absence|cancel)/.test(p) ||
      /\b(make[\s-]?up|makeup|replaced|slot.?given)\b/.test(p)
    );
  }

  function attendanceKpiHtml(list, summary) {
    if (summary && Number(summary.total) > 0) {
      var present = Number(summary.attended) || 0;
      var absent = Number(summary.absent) || 0;
      var total = Number(summary.total) || present + absent;
      var pctPresent = total ? Math.round((present / total) * 100) : 0;
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

  function gaugeValueColor(pct) {
    var p = Number(pct) || 0;
    if (p >= 75) return "#15803d";
    if (p >= 50) return "#65a30d";
    if (p >= 25) return "#ea580c";
    return "#dc2626";
  }

  function polarGauge(cx, cy, r, deg) {
    var rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }

  function gaugeArc(cx, cy, r, degStart, degEnd) {
    var s = polarGauge(cx, cy, r, degStart);
    var e = polarGauge(cx, cy, r, degEnd);
    var large = Math.abs(degEnd - degStart) > 180 ? 1 : 0;
    return (
      "M " +
      s.x.toFixed(2) +
      " " +
      s.y.toFixed(2) +
      " A " +
      r +
      " " +
      r +
      " 0 " +
      large +
      " 1 " +
      e.x.toFixed(2) +
      " " +
      e.y.toFixed(2)
    );
  }

  function gaugeTickLabels(cx, cy, labelR) {
    var specs = [
      { tick: 0, deg: 180, anchor: "end", dy: 5 },
      { tick: 25, deg: 135, anchor: "middle", dy: -5 },
      { tick: 50, deg: 90, anchor: "middle", dy: -9 },
      { tick: 75, deg: 45, anchor: "middle", dy: -5 },
      { tick: 100, deg: 0, anchor: "start", dy: 5 },
    ];
    var out = "";
    for (var ti = 0; ti < specs.length; ti++) {
      var spec = specs[ti];
      var lp = polarGauge(cx, cy, labelR, spec.deg);
      out +=
        '<text x="' +
        lp.x.toFixed(1) +
        '" y="' +
        (lp.y + spec.dy).toFixed(1) +
        '" text-anchor="' +
        spec.anchor +
        '" class="pcso-gauge__tick">' +
        spec.tick +
        "%</text>";
    }
    return out;
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
    const avgText = avg.toFixed(1);
    const cx = 120;
    const cy = 118;
    const r = 76;
    const strokeW = 22;
    const labelR = r + 28;
    const needleDeg = 180 - (pctInt / 100) * 180;
    const needleReach = r - 6;
    const tip = polarGauge(cx, cy, needleReach, needleDeg);
    const valCol = gaugeValueColor(pctInt);
    const tickLabels = gaugeTickLabels(cx, cy, labelR);
    const segColors = ["#e85d5d", "#f59e0b", "#a3e635", "#16a34a"];
    const segEnds = [
      [180, 135],
      [135, 90],
      [90, 45],
      [45, 0],
    ];
    var arcPaths = "";
    for (var si = 0; si < segEnds.length; si++) {
      arcPaths +=
        '<path d="' +
        gaugeArc(cx, cy, r, segEnds[si][0], segEnds[si][1]) +
        '" fill="none" stroke="' +
        segColors[si] +
        '" stroke-width="' +
        strokeW +
        '" stroke-linecap="round"/>';
    }
    return (
      '<div class="pcso-gauge pcso-gauge--modern" role="img" aria-label="Engagement ' +
      esc(String(pctInt)) +
      " percent, average " +
      esc(avgText) +
      ' out of 5">' +
      '<svg class="pcso-gauge__svg" viewBox="0 0 240 152" aria-hidden="true">' +
      arcPaths +
      tickLabels +
      '<line x1="' +
      cx +
      '" y1="' +
      cy +
      '" x2="' +
      tip.x.toFixed(2) +
      '" y2="' +
      tip.y.toFixed(2) +
      '" class="pcso-gauge__needle"/>' +
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="10" class="pcso-gauge__hub"/>' +
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="3.5" class="pcso-gauge__hub-dot"/>' +
      "</svg>" +
      '<p class="pcso-gauge__pct" style="color:' +
      valCol +
      '">' +
      esc(String(pctInt)) +
      '%</p><p class="pcso-gauge__avg">' +
      esc(avgText) +
      " / 5 avg</p></div>"
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
      { key: "full", label: "Full support", labelLines: ["Full", "Support"], color: "#7c3aed" },
    ];
    return (
      '<div class="pcso-ind-bars" role="img" aria-label="Independence distribution">' +
      order
        .map(function (o) {
          const n = buckets[o.key] || 0;
          const pct = (n / total) * 100;
          const h = n > 0 ? Math.max(10, Math.round(pct)) : 0;
          const lbl =
            o.labelLines && o.labelLines.length
              ? '<span class="pcso-ind-bar__lbl">' +
                o.labelLines.map(function (line) { return esc(line); }).join("<br>") +
                "</span>"
              : '<span class="pcso-ind-bar__lbl">' + esc(o.label) + "</span>";
          return (
            '<div class="pcso-ind-bar">' +
            '<span class="pcso-ind-bar__pct">' + Math.round(pct) + "%</span>" +
            '<div class="pcso-ind-bar__track" title="' + esc(o.label + ": " + n) + '">' +
            '<div class="pcso-ind-bar__fill" style="height:' + h + "%;background:" + o.color + '"></div></div>' +
            lbl +
            "</div>"
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
      ? '<article class="pcso-kpi-card pcso-kpi-card--att"><header class="pcso-kpi-card__head"><h4>Attendance</h4><p>(' + esc(term) + ")</p></header>" +
        attendanceKpiHtml(feedback, opts && opts.attendanceSummary) +
        "</article>"
      : "";
    return (
      '<div class="pcso-kpi-grid' +
      (includeAttendance ? " pcso-kpi-grid--4" : "") +
      '" role="region" aria-label="Session summary">' +
      attendanceCard +
      '<article class="pcso-kpi-card pcso-kpi-card--eng"><header class="pcso-kpi-card__head"><h4>Engagement</h4><p>(' + esc(term) + ")</p></header>" +
      engagementGaugeHtml(feedback) +
      "</article>" +
      '<article class="pcso-kpi-card pcso-kpi-card--emo"><header class="pcso-kpi-card__head"><h4>Regulation / emotions</h4><p>(' + esc(term) + ")</p></header>" +
      emotionKpiHtml(feedback) +
      "</article>" +
      '<article class="pcso-kpi-card pcso-kpi-card--indep"><header class="pcso-kpi-card__head"><h4>Independence</h4><p>(' + esc(term) + ")</p></header>" +
      independenceKpiHtml(feedback) +
      "</article></div>"
    );
  }

  /** Prefer a stable programme order so Aquatic / Climbing stay side-by-side for multi-service kids. */
  var SERVICE_GROUP_ORDER = [
    "Aquatic Activity",
    "Climbing Activity",
    "Multi-Activity",
    "Physical Activity",
    "Bespoke Programme",
    "Day centre",
  ];

  function serviceGroupSortKey(label) {
    var i = SERVICE_GROUP_ORDER.indexOf(label);
    return i >= 0 ? i : 100;
  }

  /**
   * Split feedback by programme. Mixing Climbing “full support” with Aquatic
   * independence pulls the % down and misrepresents each activity.
   *
   * Exception: Day centre kids often also get an Aquatic / pool feedback line in
   * the same day. Keep those in one Day centre block until Sep data collection
   * changes — swimming is part of their day, not a separate programme card.
   */
  function groupFeedbackByService(list) {
    var map = Object.create(null);
    (list || []).forEach(function (r) {
      var label = displayProgrammeName(r && r.service);
      if (!map[label]) map[label] = [];
      map[label].push(r);
    });
    if (map["Day centre"] && map["Aquatic Activity"]) {
      map["Day centre"] = map["Day centre"].concat(map["Aquatic Activity"]);
      delete map["Aquatic Activity"];
      map["Day centre"].sort(function (a, b) {
        var da = isoFromAny(a && a.session_date);
        var db = isoFromAny(b && b.session_date);
        if (da !== db) return db.localeCompare(da);
        return clean(b && b.session_time).localeCompare(clean(a && a.session_time));
      });
    }
    return Object.keys(map)
      .sort(function (a, b) {
        var da = serviceGroupSortKey(a) - serviceGroupSortKey(b);
        if (da !== 0) return da;
        return a.localeCompare(b);
      })
      .map(function (label) {
        return { label: label, rows: map[label] };
      });
  }

  function serviceToneClass(label) {
    var s = String(label || "").toLowerCase();
    if (/aquatic|swim/.test(s)) return "aquatic";
    if (/climb/.test(s)) return "climbing";
    if (/multi/.test(s)) return "multi";
    if (/physical|fitness/.test(s)) return "physical";
    if (/bespoke/.test(s)) return "bespoke";
    if (/day\s*centre|daycentre/.test(s)) return "daycentre";
    return "default";
  }

  function serviceOverviewBlockHtml(group, termLabel, opts) {
    var label = group.label;
    var rows = group.rows || [];
    var term = clean(termLabel || TERM_LABEL);
    var includeTable = !!(opts && opts.includeTable);
    var tableHtml = "";
    if (includeTable) {
      tableHtml =
        opts && opts.parentTable
          ? parentFeedbackTableHtml(rows)
          : feedbackTableHtml(rows, (opts && opts.incMap) || Object.create(null));
    }
    /* Per-service attendance must come from this group's rows — never the
       whole-child attendance_summary (that mixes programmes). */
    var kpiOpts = {
      includeAttendance: !!(opts && opts.includeAttendance),
      attendanceSummary: null,
    };
    return (
      '<section class="pcso-service-block pcso-service-block--' +
      esc(serviceToneClass(label)) +
      '" aria-label="' +
      esc(label) +
      ' overview">' +
      '<header class="pcso-service-block__head">' +
      '<h4 class="pcso-service-block__title">' +
      esc(label) +
      "</h4>" +
      '<p class="pcso-service-block__meta">' +
      esc(term) +
      " · " +
      rows.length +
      (rows.length === 1 ? " session" : " sessions") +
      "</p></header>" +
      kpiSlabHtml(rows, term, kpiOpts) +
      (includeTable
        ? '<div class="pcso-service-block__table">' + tableHtml + "</div>"
        : "") +
      "</section>"
    );
  }

  /**
   * One KPI slab when a single programme; otherwise one block per service so
   * independence / engagement % stay honest (e.g. Rodin Climbing vs Aquatic).
   */
  function overviewByServiceHtml(feedback, termLabel, opts) {
    var groups = groupFeedbackByService(feedback);
    if (!groups.length) {
      return kpiSlabHtml(feedback, termLabel, opts);
    }
    if (groups.length === 1) {
      var only = groups[0];
      var single =
        kpiSlabHtml(only.rows, termLabel, opts) +
        (opts && opts.includeTable
          ? '<section class="pcso-feed-section">' +
            '<div class="pcso-feed-head"><h4 class="pcso-section__title">' +
            esc((opts && opts.tableTitle) || "Session feedback") +
            "</h4></div>" +
            (opts.parentTable
              ? parentFeedbackTableHtml(only.rows)
              : feedbackTableHtml(only.rows, (opts && opts.incMap) || Object.create(null))) +
            "</section>"
          : "");
      return single;
    }
    var note =
      '<p class="pcso-service-split-note" role="note">Stats are shown <strong>per activity</strong> — mixing programmes (e.g. Climbing + Aquatic) would distort independence and engagement. Day centre includes pool time in the same block.</p>';
    return (
      note +
      groups
        .map(function (g) {
          return serviceOverviewBlockHtml(g, termLabel, opts);
        })
        .join("")
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
      overviewByServiceHtml(feedback, TERM_LABEL, {
        includeTable: true,
        parentTable: false,
        tableTitle: "All feedbacks",
        incMap: incMap,
      }) +
      incidentsSectionHtml(incidents);
  }

  function parentEngagementCell(row) {
    if (row.engagement_rating == null || row.engagement_rating === "") {
      return '<span class="muted">—</span>';
    }
    var swim = global.PortalSwimSessionAxes;
    if (swim && swim.isAquaticService(row.service)) {
      var lab = swim.engagementLabelForDisplay(row.engagement_rating, row.service);
      return (
        '<span class="pcso-eng-score pcso-eng-score--swim" title="' +
        esc(lab) +
        '">' +
        esc(lab) +
        "</span>"
      );
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

  function parentRegulationCell(row) {
    var swim = global.PortalSwimSessionAxes;
    if (swim && swim.isAquaticService(row.service)) {
      var lab = swim.regulationLabelForDisplay(row.client_emotions, row.service);
      return '<span class="pcso-reg-text" title="' + esc(lab) + '">' + esc(lab) + "</span>";
    }
    return emotionIconsCell(row.client_emotions);
  }

  function parentIndependenceCell(row) {
    var swim = global.PortalSwimSessionAxes;
    if (swim && swim.isAquaticService(row.service)) {
      var lab = swim.independenceLabelForDisplay(row.engagement_patterns, row.service);
      return '<span class="pcso-indep-text" title="' + esc(lab) + '">' + esc(lab) + "</span>";
    }
    var indep = esc(clean(row.engagement_patterns) || "—");
    return '<span class="pcso-indep-text" title="' + indep + '">' + indep + "</span>";
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
    const svcTime = timeLine ? (svc + " · " + timeLine) : svc;
    const venue = esc(clean(row.venue) || "—");
    const instructor = esc(clean(row.instructor || row.feedback_by_name || row.completed_by_name) || "—");
    const swimAdd =
      global.PortalSwimSessionAxes && typeof global.PortalSwimSessionAxes.swimAxesDisplayHtml === "function"
        ? global.PortalSwimSessionAxes.swimAxesDisplayHtml(row, esc)
        : "";
    return (
      "<tr>" +
      '<td class="pcso-tbl__date"><span class="pcso-tbl__date-main" title="' + esc(dateLine) + '">' + esc(dateLine) + "</span></td>" +
      '<td class="pcso-tbl__svc"><span class="pcso-tbl__svc-main" title="' + esc(svcTime) + '">' + esc(svcTime) + "</span>" +
      swimAdd +
      "</td>" +
      '<td class="pcso-tbl__venue"><span class="pcso-venue-text" title="' + venue + '">' + venue + "</span></td>" +
      '<td class="pcso-tbl__eng">' + parentEngagementCell(row) + "</td>" +
      '<td class="pcso-tbl__emo">' + parentRegulationCell(row) + "</td>" +
      '<td class="pcso-tbl__indep">' + parentIndependenceCell(row) + "</td>" +
      '<td class="pcso-tbl__instructor"><span class="pcso-inst-text" title="' + instructor + '">' + instructor + "</span></td>" +
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
      '<th scope="col" class="pcso-tbl__svc">Service / time</th>' +
      '<th scope="col" class="pcso-tbl__venue">Venue</th>' +
      '<th scope="col" class="pcso-tbl__eng">Engagement</th>' +
      '<th scope="col" class="pcso-tbl__emo">Regulation</th>' +
      '<th scope="col" class="pcso-tbl__indep">Independence</th>' +
      '<th scope="col" class="pcso-tbl__instructor">Instructor</th>' +
      "</tr></thead><tbody>" +
      feedback.map(function (r) { return parentFeedbackTableRow(r); }).join("") +
      "</tbody></table></div>"
    );
  }

  function achievementPhotoAspect(a) {
    var w = Number(a && a.width) || 0;
    var h = Number(a && a.height) || 0;
    if (w > 0 && h > 0) return { w: w, h: h, landscape: w >= h };
    return null;
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
          var aspect = achievementPhotoAspect(a);
          var itemClass =
            "pp-ach-item" +
            (aspect ? (aspect.landscape ? " pp-ach-item--landscape" : " pp-ach-item--portrait") : "");
          var linkStyle = aspect
            ? ' style="aspect-ratio:' + aspect.w + " / " + aspect.h + ';"'
            : "";
          var imgDims = aspect
            ? ' width="' + aspect.w + '" height="' + aspect.h + '"'
            : ' width="160" height="120"';
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
            '<figure class="' +
            itemClass +
            '" role="listitem">' +
            '<a href="' +
            esc(a.url || "#") +
            '" target="_blank" rel="noopener noreferrer"' +
            linkStyle +
            ">" +
            '<img src="' +
            esc(a.url || "") +
            '" alt="Achievement photo, ' +
            esc(when) +
            '" loading="lazy"' +
            imgDims +
            ' />' +
            "</a>" +
            '<figcaption class="pp-ach-cap">' +
            esc(when) +
            dlBtn +
            "</figcaption></figure>"
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
      venue: clean(r.venue),
      instructor: clean(r.instructor || r.feedback_by_name || r.completed_by_name),
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
    var groups = groupFeedbackByService(feedback);
    var multi = groups.length > 1;
    /* Whole-child attendance_summary only when a single programme — otherwise
       each service block counts attendance from its own rows. */
    hostEl.innerHTML =
      overviewByServiceHtml(feedback, term, {
        includeAttendance: true,
        attendanceSummary: multi ? null : opts && opts.attendance_summary,
        includeTable: true,
        parentTable: true,
        tableTitle: "Session feedback",
      }) +
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
