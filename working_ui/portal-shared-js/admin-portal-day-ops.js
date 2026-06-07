/**
 * Portal 2026 day-operations (AdminSessionsHub + forms tables) for admin_dashboard embed.
 * Configure via PortalDayOps.configure({ esc, getClient, getSupabaseUrl, getAnonKey, mapPortalFeedbackRow, ... })
 */
(function (global) {
  'use strict';

  var cfg = {};
  var payload = {
    counts: {},
    session_feedback: [],
    session_feedback_total: 0,
    incident_reports: [],
    lead_session_reports: [],
    venue_reviews: [],
    cancellation_reports: [],
    schedule_overrides: [],
    session_quick_marks: []
  };
  var loadInFlight = null;
  var trackingHub = null;
  var feedbackHub = null;
  var pendingOverviewTab = null;
  var pendingFeedbackNoteFilter = undefined;

  var HUB_SRC = '/portal-shared-js/admin-sessions-hub.js?v=20260607-feedback-unit-key';

  function esc(s) {
    if (cfg.esc) return cfg.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cellText(s) {
    var t = String(s == null ? '' : s).trim();
    return t ? t : '—';
  }

  function truncate(s, max) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return '—';
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  function formatDate(iso) {
    if (cfg.formatDate) return cfg.formatDate(iso);
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  function supabaseBase() {
    var u = cfg.getSupabaseUrl && cfg.getSupabaseUrl();
    if (u) return String(u).replace(/\/$/, '');
    return 'https://cklpnwhlqsulpmkipmqb.supabase.co';
  }

  function supabaseAnon() {
    return (cfg.getAnonKey && cfg.getAnonKey()) || '';
  }

  function emptyPayload() {
    return {
      counts: {},
      session_feedback: [],
      session_feedback_total: 0,
      incident_reports: [],
      lead_session_reports: [],
      venue_reviews: [],
      cancellation_reports: [],
      schedule_overrides: [],
      session_quick_marks: []
    };
  }

  function applyPayload(j) {
    payload.counts = j.counts || {};
    payload.session_feedback = j.session_feedback || [];
    payload.session_feedback_loaded = j.session_feedback_loaded;
    payload.session_feedback_total = j.session_feedback_total != null ? j.session_feedback_total : payload.session_feedback.length;
    payload.incident_reports = j.incident_reports || [];
    payload.lead_session_reports = j.lead_session_reports || [];
    payload.venue_reviews = j.venue_reviews || [];
    payload.cancellation_reports = j.cancellation_reports || [];
    payload.schedule_overrides = j.schedule_overrides || [];
    payload.session_quick_marks = j.session_quick_marks || [];
  }

  /** Portal workbook export is authoritative for feedback rows; edge often returns []. */
  function mergePortalFeedbackIntoPayload() {
    if (!cfg.buildFeedbackFromPortal) return;
    var portalRows = cfg.buildFeedbackFromPortal() || [];
    if (!portalRows.length) return;
    payload.session_feedback = portalRows;
    payload.session_feedback_total = portalRows.length;
    payload.session_feedback_loaded = portalRows.length;
  }

  function venueReviewMergeKey(r) {
    return (
      String((r && r.review_date) || '').trim().substring(0, 10) +
      '|' +
      String((r && r.venue) || '')
        .trim()
        .toLowerCase() +
      '|' +
      String((r && r.opening_or_closing) || '').trim()
    );
  }

  /** Static portal export supplements Supabase venue_reviews (same pattern as session feedback). */
  function mergePortalVenueIntoPayload() {
    if (!cfg.buildVenueFromPortal) return;
    var portalRows = cfg.buildVenueFromPortal() || [];
    if (!portalRows.length) return;
    var byKey = {};
    var out = [];
    portalRows.forEach(function (r) {
      var k = venueReviewMergeKey(r);
      if (!k || byKey[k]) return;
      byKey[k] = true;
      out.push(r);
    });
    (payload.venue_reviews || []).forEach(function (r) {
      var k = venueReviewMergeKey(r);
      if (!k || byKey[k]) return;
      byKey[k] = true;
      out.push(r);
    });
    out.sort(function (a, b) {
      var da = String(a.review_date || '');
      var db = String(b.review_date || '');
      if (da !== db) return db.localeCompare(da);
      var va = String(a.venue || '').localeCompare(String(b.venue || ''));
      if (va) return va;
      return String(a.opening_or_closing || '').localeCompare(String(b.opening_or_closing || ''));
    });
    payload.venue_reviews = out;
  }

  async function fetchEdgePayload() {
    var client = cfg.getClient && cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    var at = session && session.access_token;
    if (!at) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-forms-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + at,
        apikey: supabaseAnon()
      },
      body: '{}'
    });
    var j = null;
    try {
      j = await res.json();
    } catch (e) {
      j = null;
    }
    if (!res.ok || !j) return { error: (j && (j.error || j.message)) || res.statusText || 'request_failed' };
    if (!j.ok) return { error: j.error || 'not_allowed' };
    return { data: j };
  }

  async function fetchFallbackSupabase() {
    var client = cfg.getClient && cfg.getClient();
    if (!client) return emptyPayload();
    var out = emptyPayload();
    if (cfg.buildFeedbackFromPortal) {
      out.session_feedback = cfg.buildFeedbackFromPortal() || [];
      out.session_feedback_total = out.session_feedback.length;
    }
    if (cfg.fetchCancellations) {
      try {
        out.cancellation_reports = await cfg.fetchCancellations();
      } catch (e) {}
    }
    if (cfg.fetchAbsents) {
      try {
        out.session_quick_marks = await cfg.fetchAbsents();
      } catch (e2) {}
    }
    var since = new Date();
    since.setDate(since.getDate() - 120);
    var sinceIso = since.toISOString().slice(0, 10);
    try {
      var inc = await client
        .from('incident_reports')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(400);
      if (!inc.error) out.incident_reports = inc.data || [];
    } catch (e3) {}
    try {
      var lead = await client
        .from('lead_session_reports')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(400);
      if (!lead.error) out.lead_session_reports = lead.data || [];
    } catch (e4) {}
    try {
      var ven = await client
        .from('venue_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400);
      if (!ven.error) out.venue_reviews = ven.data || [];
    } catch (e5) {}
    return out;
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('portalDayOpsStatus');
    if (!el) return;
    el.className = 'portal-forms-status' + (isError ? ' is-error' : '');
    el.innerHTML = msg || '';
  }

  function ensureHubScript() {
    return new Promise(function (resolve, reject) {
      if (global.AdminSessionsHub) {
        resolve();
        return;
      }
      var tagged = document.querySelector('script[data-admin-sessions-hub="1"]');
      if (tagged) {
        if (global.AdminSessionsHub) {
          resolve();
          return;
        }
        tagged.addEventListener(
          'load',
          function () {
            global.AdminSessionsHub ? resolve() : reject(new Error('hub missing'));
          },
          { once: true }
        );
        tagged.addEventListener(
          'error',
          function () {
            reject(new Error('hub load failed'));
          },
          { once: true }
        );
        return;
      }
      var s = document.createElement('script');
      s.src = HUB_SRC;
      s.dataset.adminSessionsHub = '1';
      s.onload = function () {
        global.AdminSessionsHub ? resolve() : reject(new Error('hub missing'));
      };
      s.onerror = function () {
        reject(new Error('hub load failed'));
      };
      document.head.appendChild(s);
    });
  }

  function hubMountOpts(extra) {
    extra = extra || {};
    return {
      escapeHtml: esc,
      mode: extra.mode || 'tracking',
      externalTabs: true,
      payload: payload,
      getFeedbackDayStats: cfg.getFeedbackDayStats
    };
  }

  function applyPendingOverviewTab() {
    if (!pendingOverviewTab || !trackingHub) return;
    var nextTab = pendingOverviewTab;
    var prevTab = trackingHub.tab;
    trackingHub.tab = nextTab;
    if (
      (nextTab === 'absents' || nextTab === 'incidents' || nextTab === 'cancellations') &&
      prevTab !== nextTab &&
      typeof trackingHub.syncWeekPickerToCurrentWeek === 'function'
    ) {
      trackingHub.syncWeekPickerToCurrentWeek();
    }
    pendingOverviewTab = null;
    if (typeof trackingHub.renderPanels === 'function') trackingHub.renderPanels();
  }

  function applyPendingFeedbackNav(hub) {
    if (!hub || pendingFeedbackNoteFilter === undefined) return;
    var nf = pendingFeedbackNoteFilter;
    hub.tab = nf === 'positive' ? 'positive' : nf === 'relevant' ? 'relevant' : 'feedback';
    hub.feedbackNoteFilter = nf === 'positive' || nf === 'relevant' ? nf : '';
    pendingFeedbackNoteFilter = undefined;
    if (hub.tab === 'positive' || hub.tab === 'relevant') {
      if (typeof hub.syncWeekPickerToCurrentWeek === 'function') hub.syncWeekPickerToCurrentWeek();
    }
    hub.render();
  }

  function overviewTabForC4k(tabId) {
    if (tabId === 'incidents') return 'incidents';
    if (tabId === 'absents') return 'absents';
    if (tabId === 'cancellations') return 'cancellations';
    return 'tracking';
  }

  function feedbackSetupForC4k(tabId) {
    if (tabId === 'positive') return { tab: 'positive', filter: 'positive' };
    if (tabId === 'relevant') return { tab: 'relevant', filter: 'relevant' };
    return { tab: 'feedback', filter: '' };
  }

  async function initTrackingHub() {
    var root = document.getElementById('adminSessionsHubRoot');
    if (!root) return null;
    await ensureHubScript();
    if (!global.AdminSessionsHub) return null;
    if (trackingHub && trackingHub.root === root) {
      trackingHub.setPayload(payload);
      applyPendingOverviewTab();
      return trackingHub;
    }
    trackingHub = await global.AdminSessionsHub.mount(root, hubMountOpts({ mode: 'tracking' }));
    applyPendingOverviewTab();
    return trackingHub;
  }

  async function initFeedbackHub() {
    var root = document.getElementById('adminSessionFeedbacksRoot');
    if (!root) return null;
    await ensureHubScript();
    if (!global.AdminSessionsHub) {
      root.innerHTML =
        '<p class="submission-state is-error"><strong>Feedback view failed to load.</strong> Refresh the page.</p>';
      return null;
    }
    if (feedbackHub && feedbackHub.root === root) {
      feedbackHub.setPayload(payload);
      return feedbackHub;
    }
    feedbackHub = await global.AdminSessionsHub.mount(root, hubMountOpts({ mode: 'feedback' }));
    return feedbackHub;
  }

  function yesNoPill(val) {
    var s = String(val == null ? '' : val).trim().toLowerCase();
    if (val === true || s === 'yes' || s === 'true' || s === '1') {
      return '<span class="portal-forms-pill portal-forms-pill--yes">Yes</span>';
    }
    if (val === false || s === 'no' || s === 'false' || s === '0' || s === 'none') {
      return '<span class="portal-forms-pill portal-forms-pill--no">No</span>';
    }
    return esc(String(val));
  }

  function renderLeadVenueTables() {
    var leadTbody = document.getElementById('portalFormsLeadTbody');
    var venueTbody = document.getElementById('portalFormsVenueTbody');
    if (!leadTbody && !venueTbody) return;
    var lead = payload.lead_session_reports || [];
    var venue = payload.venue_reviews || [];
    if (leadTbody) {
      if (!lead.length) {
        leadTbody.innerHTML =
          '<tr><td colspan="6"><div class="submission-state">No lead reports yet.</div></td></tr>';
      } else {
        leadTbody.innerHTML = lead
          .map(function (r, i) {
            var who = esc(cellText(r.submitted_by_name));
            var svc = esc(cellText(r.service));
            var act = esc(truncate(r.activity || r.session_activity || '—', 28));
            var brief = esc(truncate(r.brief_description || r.description || '—', 120));
            return (
              '<tr class="portal-forms-data-row" data-portal-forms-kind="lead" data-portal-forms-idx="' +
              i +
              '">' +
              '<td class="col-date">' +
              esc(formatDate(r.created_at)) +
              '</td>' +
              '<td><div class="portal-forms-cell-main">' +
              who +
              '</div></td>' +
              '<td class="cell-clip">' +
              svc +
              '</td>' +
              '<td class="cell-clip">' +
              act +
              '</td>' +
              '<td class="cell-clip col-brief-desc">' +
              brief +
              '</td>' +
              '<td class="col-actions"><button type="button" class="portal-forms-view-btn" data-portal-forms-kind="lead" data-portal-forms-idx="' +
              i +
              '">View</button></td>' +
              '</tr>'
            );
          })
          .join('');
      }
    }
    if (venueTbody) {
      if (!venue.length) {
        venueTbody.innerHTML =
          '<tr><td colspan="6"><div class="submission-state">No venue reviews yet.</div></td></tr>';
      } else {
        venueTbody.innerHTML = venue
          .map(function (r) {
            return (
              '<tr class="portal-forms-static-row">' +
              '<td class="cell-wrap col-venue-name">' +
              esc(cellText(r.venue)) +
              '</td>' +
              '<td>' +
              esc(cellText(r.review_date)) +
              '</td>' +
              '<td>' +
              esc(cellText(r.review_time)) +
              '</td>' +
              '<td>' +
              yesNoPill(r.has_issues) +
              '</td>' +
              '<td class="cell-wrap col-issues-detail">' +
              esc(cellText(r.issues_reported)) +
              '</td>' +
              '<td><div class="portal-forms-cell-main">' +
              esc(cellText(r.submitted_by_name)) +
              '</div></td>' +
              '</tr>'
            );
          })
          .join('');
      }
    }
    bindLeadVenueClicks();
  }

  function bindLeadVenueClicks() {
    var shell = document.querySelector('.portal-day-ops-embed');
    if (!shell || shell._portalFormsBound) return;
    shell._portalFormsBound = true;
    shell.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-portal-forms-kind]') : null;
      if (!btn) return;
      var kind = btn.getAttribute('data-portal-forms-kind');
      var idx = parseInt(btn.getAttribute('data-portal-forms-idx'), 10);
      if (isNaN(idx)) return;
      var arr =
        kind === 'lead' ? payload.lead_session_reports : kind === 'venue' ? payload.venue_reviews : null;
      if (!arr || !arr[idx]) return;
      try {
        alert(JSON.stringify(arr[idx], null, 2));
      } catch (e) {
        alert(String(arr[idx]));
      }
    });
  }

  global.PortalDayOps = {
    configure: function (c) {
      cfg = Object.assign({}, cfg, c || {});
      if (trackingHub) trackingHub.opts.getFeedbackDayStats = cfg.getFeedbackDayStats;
      if (feedbackHub) feedbackHub.opts.getFeedbackDayStats = cfg.getFeedbackDayStats;
    },
    getPayload: function () {
      return payload;
    },
    getTrackingHub: function () {
      return trackingHub;
    },
    getFeedbackHub: function () {
      return feedbackHub;
    },
    ensurePayload: function () {
      if (loadInFlight) return loadInFlight;
      loadInFlight = (async function () {
        var skipEdge = !!(cfg && cfg.skipAdminFormsEdge);
        var edge = null;
        if (!skipEdge) {
          edge = await fetchEdgePayload();
          if (edge && edge.data) {
            applyPayload(edge.data);
            mergePortalFeedbackIntoPayload();
            mergePortalVenueIntoPayload();
            setStatus('');
            return payload;
          }
          if (edge && edge.error === 'not_allowed') {
            setStatus(
              '<strong>Not allowed</strong> Set <code>PORTAL_ADMIN_FORMS_EMAILS</code> on Portal Supabase for your email.',
              true
            );
          } else if (edge && edge.error === 'session_expired') {
            setStatus('<strong>Session expired</strong> Sign in again.', true);
          } else if (edge && edge.error) {
            setStatus(
              '<strong>Live load failed</strong> ' +
                esc(String(edge.error)) +
                ' — showing roster/export data where available.',
              false
            );
          }
        }
        var fb = await fetchFallbackSupabase();
        applyPayload(fb);
        mergePortalFeedbackIntoPayload();
        mergePortalVenueIntoPayload();
        if (skipEdge) setStatus('');
        return payload;
      })()
        .finally(function () {
          loadInFlight = null;
        });
      return loadInFlight;
    },
    refreshTab: async function (tabId) {
      await global.PortalDayOps.ensurePayload();
      if (tabId === 'overview' || tabId === 'incidents' || tabId === 'absents' || tabId === 'cancellations') {
        pendingOverviewTab = overviewTabForC4k(tabId);
        var th = await initTrackingHub();
        if (th) applyPendingOverviewTab();
        return th;
      }
      if (tabId === 'feedback' || tabId === 'positive' || tabId === 'relevant') {
        var fs = feedbackSetupForC4k(tabId);
        pendingFeedbackNoteFilter = fs.filter;
        var fh = await initFeedbackHub();
        if (fh) {
          fh.tab = fs.tab;
          fh.feedbackNoteFilter = fs.filter;
          applyPendingFeedbackNav(fh);
        }
        return fh;
      }
      if (tabId === 'lead' || tabId === 'venue') {
        renderLeadVenueTables();
        return null;
      }
      return null;
    },
    invalidatePayload: function () {
      loadInFlight = null;
      try {
        if (typeof window.portalInvalidateAdminFeedbackStatusCache === 'function') {
          window.portalInvalidateAdminFeedbackStatusCache();
        }
      } catch (_e) {}
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
