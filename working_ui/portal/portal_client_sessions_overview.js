/**
 * Read-only participant Sessions Overview — feedbacks + incidents from all workers.
 */
(function (global) {
  "use strict";

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

  function formatDateUk(iso) {
    const s = isoFromAny(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return clean(iso) || "—";
    const p = s.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
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
      positive_feedback: clean(r.positive || r.positive_feedback),
      relevant_information: clean(
        r.relevantParent || r.relevant || r.relevant_information
      ),
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
      positive_feedback: clean(r.positive_feedback),
      relevant_information: clean(r.relevant_information),
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
      "session_date, client_name, client_id, service, session_time, attendance, engagement_rating, client_emotions, positive_feedback, relevant_information, completed_by_name, created_at";
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

  function detailBlock(label, value) {
    const v = clean(value);
    if (!v) return "";
    return (
      '<div class="pcso-detail">' +
      '<div class="pcso-detail__label">' +
      esc(label) +
      "</div>" +
      '<div class="pcso-detail__value">' +
      esc(v).replace(/\n/g, "<br>") +
      "</div></div>"
    );
  }

  function renderCard(row) {
    const isInc = row.kind === "incident";
    const title = isInc
      ? clean(row.incident_category) || "Incident"
      : clean(row.service) || "Session feedback";
    const when =
      formatDateUk(row.session_date) +
      (clean(row.session_time) ? " · " + clean(row.session_time) : "");
    const worker = clean(row.completed_by_name) || "—";
    const preview = isInc
      ? clean(row.statement_during || row.statement_before || row.statement_after)
      : clean(row.positive_feedback || row.relevant_information || row.client_emotions);
    const previewShort =
      preview.length > 140 ? preview.slice(0, 137).trim() + "…" : preview;

    let details = "";
    if (isInc) {
      details =
        detailBlock("Category", row.incident_category) +
        detailBlock("Location", row.location) +
        detailBlock("Before", row.statement_before) +
        detailBlock("During", row.statement_during) +
        detailBlock("After", row.statement_after);
    } else {
      details =
        detailBlock("Attendance", row.attendance) +
        detailBlock(
          "Engagement",
          row.engagement_rating != null && row.engagement_rating !== ""
            ? String(row.engagement_rating) + " / 5"
            : ""
        ) +
        detailBlock("Emotions", row.client_emotions) +
        detailBlock("Positive feedback", row.positive_feedback) +
        detailBlock("Relevant information", row.relevant_information);
    }

    return (
      '<details class="pcso-card pcso-card--' +
      (isInc ? "incident" : "feedback") +
      '">' +
      '<summary class="pcso-card__summary">' +
      '<span class="pcso-card__kind">' +
      esc(isInc ? "Incident" : "Feedback") +
      "</span>" +
      '<span class="pcso-card__title">' +
      esc(title) +
      "</span>" +
      '<span class="pcso-card__meta">' +
      esc(when) +
      "</span>" +
      '<span class="pcso-card__worker">' +
      esc(worker) +
      "</span>" +
      (previewShort
        ? '<span class="pcso-card__preview">' + esc(previewShort) + "</span>"
        : "") +
      "</summary>" +
      '<div class="pcso-card__body">' +
      details +
      "</div></details>"
    );
  }

  function renderListHtml(rows, emptyLabel) {
    if (!rows.length) {
      return (
        '<p class="pcso-empty" role="status">' +
        esc(emptyLabel) +
        "</p>"
      );
    }
    return '<div class="pcso-list">' + rows.map(renderCard).join("") + "</div>";
  }

  async function render(hostEl, opts) {
    if (!hostEl) return;
    const clientId = clean(opts && opts.clientId);
    const clientName = clean(opts && opts.clientName);
    hostEl.innerHTML =
      '<p class="pcso-loading" role="status">Loading sessions overview…</p>';

    const embedded = collectEmbedded(clientId, clientName);
    let liveFb = [];
    let liveInc = [];
    try {
      const live = await fetchLiveRows(clientId, clientName);
      liveFb = live.feedback;
      liveInc = live.incidents;
    } catch (_) {}

    const feedback = mergeRows([embedded.filter(function (r) { return r.kind === "feedback"; }), liveFb]);
    const incidents = mergeRows([liveInc]);

    hostEl.innerHTML =
      '<p class="pcso-intro">Read-only history from all workers supporting this participant.</p>' +
      '<div class="pcso-section">' +
      '<h4 class="pcso-section__title">Session feedback</h4>' +
      renderListHtml(
        feedback,
        "No session feedback recorded for this participant yet."
      ) +
      "</div>" +
      '<div class="pcso-section">' +
      '<h4 class="pcso-section__title">Incidents</h4>' +
      renderListHtml(incidents, "No incidents recorded for this participant yet.") +
      "</div>";
  }

  global.PortalClientSessionsOverview = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
