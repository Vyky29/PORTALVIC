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

  var HUB_SRC = '/portal/admin-sessions-hub.js?v=20260620-absent-perf-fix';
  var EDGE_FETCH_MS = 12000;

  function fetchWithTimeout(url, options, ms) {
    ms = ms || EDGE_FETCH_MS;
    if (typeof AbortController === 'undefined') {
      return fetch(url, options);
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, ms);
    var opts = Object.assign({}, options || {}, { signal: ctrl.signal });
    return fetch(url, opts).finally(function () {
      clearTimeout(timer);
    });
  }

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

  function feedbackRowMergeKey(row) {
    var pk = String((row && row.portal_session_key) || '').trim();
    if (pk) {
      var by = String((row && row.completed_by_name) || '')
        .trim()
        .toLowerCase();
      if (pk.indexOf('||') >= 0 || !by) return 'pk:' + pk;
      return 'pk:' + pk + '|' + by;
    }
    return (
      'd:' +
      String((row && row.session_date) || '').trim().slice(0, 10) +
      '|' +
      String((row && row.client_name) || '')
        .trim()
        .toLowerCase() +
      '|' +
      String((row && row.session_time) || '').trim() +
      '|' +
      String((row && row.completed_by_name) || '')
        .trim()
        .toLowerCase()
    );
  }

  function feedbackRowSubmittedAt(row) {
    return String(
      (row && (row.created_at || row.submittedAt || row.submitted_at || row.updated_at)) || ""
    ).trim();
  }

  function mergeFeedbackRowLists(a, b) {
    var byKey = {};
    var out = [];
    function addRow(row) {
      if (!row) return;
      var k = feedbackRowMergeKey(row);
      if (!k) return;
      if (byKey[k] !== undefined) {
        var prev = out[byKey[k]];
        if (!feedbackRowSubmittedAt(prev) && feedbackRowSubmittedAt(row)) out[byKey[k]] = row;
        return;
      }
      byKey[k] = out.length;
      out.push(row);
    }
    (a || []).forEach(addRow);
    (b || []).forEach(addRow);
    return out;
  }

  /** Static export coverage date (rows after this come from Supabase live only). */
  function portalFeedbackCoverageThroughIso() {
    try {
      var meta =
        typeof window !== 'undefined' &&
        window.SESSION_FEEDBACK_PORTAL_SOURCE &&
        window.SESSION_FEEDBACK_PORTAL_SOURCE.meta;
      return String((meta && meta.coverageThroughIso) || '')
        .trim()
        .slice(0, 10);
    } catch (eCov) {
      return '';
    }
  }

  /** Historical workbook rows only — recent days must not override live Supabase. */
  function staticPortalFeedbackRowsForMerge() {
    if (!cfg.buildFeedbackFromPortal) return [];
    var all = cfg.buildFeedbackFromPortal() || [];
    var thru = portalFeedbackCoverageThroughIso();
    if (!thru) return all;
    return all.filter(function (r) {
      var d = String((r && (r.session_date || r.date)) || '')
        .trim()
        .slice(0, 10);
      return d && d <= thru;
    });
  }

  /** Live Supabase first; static export supplements history only. */
  function mergePortalFeedbackIntoPayload() {
    var portalRows = staticPortalFeedbackRowsForMerge();
    if (!portalRows.length && !(payload.session_feedback || []).length) return;
    payload.session_feedback = mergeFeedbackRowLists(
      payload.session_feedback || [],
      portalRows
    );
    payload.session_feedback_total = payload.session_feedback.length;
    payload.session_feedback_loaded = payload.session_feedback.length;
  }

  function portalDayOpsAfterFeedbackPayloadMerge() {
    if (typeof window.portalInvalidateAdminFeedbackStatusCache === 'function') {
      window.portalInvalidateAdminFeedbackStatusCache();
    }
    if (feedbackHub && typeof feedbackHub.setPayload === 'function') {
      feedbackHub.setPayload(payload);
      if (typeof feedbackHub.render === 'function') feedbackHub.render();
    }
    if (trackingHub && typeof trackingHub.setPayload === 'function') {
      trackingHub.setPayload(payload);
      if (typeof trackingHub.renderPanels === 'function') trackingHub.renderPanels();
    }
    if (typeof global.portalAdminDayOpsBadgesRefresh === 'function') {
      global.portalAdminDayOpsBadgesRefresh();
    }
  }

  var payloadMergeDebounce = null;
  function portalDayOpsAfterFeedbackPayloadMergeDebounced() {
    if (payloadMergeDebounce) clearTimeout(payloadMergeDebounce);
    payloadMergeDebounce = setTimeout(function () {
      payloadMergeDebounce = null;
      portalDayOpsAfterFeedbackPayloadMerge();
    }, 150);
  }

  var sessionFeedbackRtBound = false;
  var sessionFeedbackRtDebounce = null;

  async function refreshSessionFeedbackLive() {
    if (!cfg.fetchSessionFeedback) return;
    try {
      var dbFb = await cfg.fetchSessionFeedback();
      if (cfg.buildFeedbackFromPortal) {
        payload.session_feedback = mergeFeedbackRowLists(
          dbFb || [],
          staticPortalFeedbackRowsForMerge()
        );
      } else {
        payload.session_feedback = dbFb || [];
      }
      payload.session_feedback_total = payload.session_feedback.length;
      payload.session_feedback_loaded = payload.session_feedback.length;
      portalDayOpsAfterFeedbackPayloadMerge();
    } catch (eFb) {
      console.debug('[PortalDayOps] refreshSessionFeedbackLive', eFb);
    }
  }

  function ensureSessionFeedbackRealtime() {
    if (sessionFeedbackRtBound) return;
    var client = cfg.getClient && cfg.getClient();
    if (!client || typeof client.channel !== 'function') return;
    sessionFeedbackRtBound = true;
    try {
      client
        .channel('portal-admin-session-feedback')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'session_feedback' },
          function () {
            if (sessionFeedbackRtDebounce) clearTimeout(sessionFeedbackRtDebounce);
            sessionFeedbackRtDebounce = setTimeout(function () {
              sessionFeedbackRtDebounce = null;
              void refreshSessionFeedbackLive();
            }, 400);
          }
        )
        .subscribe(function (status, err) {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.debug('[PortalDayOps] session_feedback realtime', status, err || '');
          }
        });
    } catch (eRt) {
      console.debug('[PortalDayOps] ensureSessionFeedbackRealtime', eRt);
    }
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
    var res = await fetchWithTimeout(
      supabaseBase() + '/functions/v1/portal-admin-forms-list',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + at,
          apikey: supabaseAnon()
        },
        body: '{}'
      },
      EDGE_FETCH_MS
    );
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

  async function fetchScheduleOverridesInto(out, client) {
    if (cfg.fetchScheduleOverrides) {
      try {
        out.schedule_overrides = await cfg.fetchScheduleOverrides();
      } catch (eOv) {}
      return;
    }
    var sinceOv = new Date();
    sinceOv.setDate(sinceOv.getDate() - 120);
    var sinceOvIso = sinceOv.toISOString().slice(0, 10);
    try {
      var ovRes = await client
        .from('schedule_overrides')
        .select(
          'id,created_at,created_by,session_date,anchor_start,anchor_end,anchor_staff_id,anchor_venue,anchor_client_id,override_type,reason,status,payload'
        )
        .gte('session_date', sinceOvIso)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(600);
      if (!ovRes.error) out.schedule_overrides = ovRes.data || [];
    } catch (eOv2) {}
  }

  /** Fast path for Sessions overview — parallel, no incidents/lead/venue/DB feedback merge. */
  async function fetchOverviewSupabaseExtras() {
    var client = cfg.getClient && cfg.getClient();
    if (!client) return emptyPayload();
    var out = emptyPayload();
    if (cfg.buildFeedbackFromPortal) {
      out.session_feedback = cfg.buildFeedbackFromPortal() || [];
      out.session_feedback_total = out.session_feedback.length;
      out.session_feedback_loaded = out.session_feedback.length;
    }
    var tasks = [fetchScheduleOverridesInto(out, client)];
    if (cfg.fetchSessionFeedback) {
      tasks.push(
        cfg.fetchSessionFeedback().then(function (dbFb) {
          if (dbFb && dbFb.length) {
            out.session_feedback = mergeFeedbackRowLists(out.session_feedback || [], dbFb);
            out.session_feedback_total = out.session_feedback.length;
            out.session_feedback_loaded = out.session_feedback.length;
          }
        })
      );
    }
    if (cfg.fetchCancellations) {
      tasks.push(
        cfg.fetchCancellations().then(function (rows) {
          out.cancellation_reports = rows || [];
        })
      );
    }
    if (cfg.fetchAbsents) {
      tasks.push(
        cfg.fetchAbsents().then(function (rows) {
          out.session_quick_marks = rows || [];
        })
      );
    }
    await Promise.all(
      tasks.map(function (p) {
        return p.catch(function () {});
      })
    );
    return out;
  }

  /** Heavier tables — defer until idle so overview paints first. */
  async function fetchDeferredSupabaseExtras() {
    var client = cfg.getClient && cfg.getClient();
    if (!client) return emptyPayload();
    var out = emptyPayload();
    var since = new Date();
    since.setDate(since.getDate() - 120);
    var sinceIso = since.toISOString().slice(0, 10);
    var tasks = [];
    tasks.push(
      client
        .from('incident_reports')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(400)
        .then(function (inc) {
          if (!inc.error) out.incident_reports = inc.data || [];
        })
    );
    if (cfg.fetchLeadReports) {
      tasks.push(
        cfg.fetchLeadReports().then(function (rows) {
          out.lead_session_reports = rows || [];
        })
      );
    } else {
      tasks.push(
        client
          .from('lead_session_reports')
          .select('*')
          .gte('session_date', sinceIso)
          .order('session_date', { ascending: false })
          .limit(500)
          .then(function (lead) {
            if (!lead.error) out.lead_session_reports = lead.data || [];
          })
      );
    }
    tasks.push(
      client
        .from('venue_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400)
        .then(function (ven) {
          if (!ven.error) out.venue_reviews = ven.data || [];
        })
    );
    await Promise.all(
      tasks.map(function (p) {
        return p.catch(function () {});
      })
    );
    if (out.session_feedback && out.session_feedback.length && cfg.buildFeedbackFromPortal) {
      out.session_feedback = mergeFeedbackRowLists(
        cfg.buildFeedbackFromPortal() || [],
        out.session_feedback
      );
      out.session_feedback_total = out.session_feedback.length;
      out.session_feedback_loaded = out.session_feedback.length;
    }
    return out;
  }

  async function fetchFallbackSupabase() {
    var overview = await fetchOverviewSupabaseExtras();
    var deferred = await fetchDeferredSupabaseExtras();
    overview.incident_reports = deferred.incident_reports || [];
    overview.lead_session_reports = deferred.lead_session_reports || [];
    overview.venue_reviews = deferred.venue_reviews || [];
    if (deferred.session_feedback && deferred.session_feedback.length) {
      overview.session_feedback = deferred.session_feedback;
      overview.session_feedback_total = deferred.session_feedback_total;
      overview.session_feedback_loaded = deferred.session_feedback_loaded;
    }
    return overview;
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

  function reRenderHub(hub) {
    if (!hub || !hub.root || !hub.root.isConnected) return;
    if (hub.opts && hub.opts.externalTabs) {
      if (typeof hub.renderPanels === 'function') hub.renderPanels();
    } else if (typeof hub.render === 'function') {
      hub.render();
    }
  }

  function syncHubViewFilters(fromHub, toHub) {
    if (!fromHub || !toHub || fromHub === toHub) return;
    toHub.instructorFilter = fromHub.instructorFilter || '';
    toHub.serviceFilter = fromHub.serviceFilter || '';
    toHub.clientSearch = fromHub.clientSearch || '';
    if (fromHub.weekStart) toHub.weekStart = fromHub.weekStart;
    if (fromHub.selectedDay) toHub.selectedDay = fromHub.selectedDay;
    if (fromHub.mode === 'feedback' && toHub.mode === 'feedback' && fromHub.feedbackMetricsDay) {
      toHub.feedbackMetricsDay = fromHub.feedbackMetricsDay;
    }
    toHub.invalidateComputeCaches();
  }

  function hubMountOpts(extra) {
    extra = extra || {};
    return {
      escapeHtml: esc,
      mode: extra.mode || 'tracking',
      externalTabs: true,
      payload: payload,
      getFeedbackDayStats: cfg.getFeedbackDayStats,
      isClubClosedDay: cfg.isClubClosedDay,
      showFullWeekDayStrip: cfg.showFullWeekDayStrip,
      onViewFiltersChange: function (changedHub) {
        var other =
          changedHub === trackingHub
            ? feedbackHub
            : changedHub === feedbackHub
              ? trackingHub
              : null;
        syncHubViewFilters(changedHub, other);
        reRenderHub(other);
      }
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
      if (
        !root.querySelector(".ash-panels") &&
        !root.querySelector(".ash-panels--feedback-only") &&
        typeof trackingHub.render === "function"
      ) {
        trackingHub.render();
      }
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
      if (typeof feedbackHub.render === 'function') {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            feedbackHub.render();
          });
        } else {
          setTimeout(function () {
            feedbackHub.render();
          }, 0);
        }
      }
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

  function formatDateOnly(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function formatTimeOnly(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function portalFormsWhenStackHtml(iso, escFn) {
    var date = formatDateOnly(iso);
    var time = formatTimeOnly(iso);
    if (date === '—') return '—';
    return (
      '<span class="portal-forms-when-stack">' +
      '<span class="portal-forms-when-stack__date">' +
      escFn(date) +
      '</span><span class="portal-forms-when-stack__time">' +
      escFn(time) +
      '</span></span>'
    );
  }

  function portalFormsLeadServiceSubLine(r) {
    var svc = String((r && r.service) || '').trim();
    var low = svc.toLowerCase();
    if (low === 'multi-activity' || low.indexOf('multi-activity') !== -1) return 'Group Session';
    if ((r && r.is_bespoke_programme) || low.indexOf('bespoke') !== -1) {
      return String((r && r.client_name) || '').trim();
    }
    return '';
  }

  function portalFormsLeadServiceHtml(r, escFn) {
    var svc = String((r && r.service) || '').trim() || '—';
    var sub = portalFormsLeadServiceSubLine(r);
    if (!sub) {
      return escFn(truncate(svc, 36));
    }
    return (
      '<span class="portal-forms-svc-stack">' +
      '<span class="portal-forms-cell-main">' +
      escFn(truncate(svc, 36)) +
      '</span><span class="portal-forms-cell-sub">' +
      escFn(truncate(sub, 36)) +
      '</span></span>'
    );
  }

  function leadReportActivity(r) {
    var P = global.PortalFormRecordModal;
    if (P && typeof P.leadReportActivity === 'function') return P.leadReportActivity(r);
    return String(r.brief_description || r.other_information || r.activity || '').trim();
  }

  function leadReportBriefBody(r) {
    var P = global.PortalFormRecordModal;
    if (P && typeof P.leadReportBriefBody === 'function') return P.leadReportBriefBody(r);
    return String(r.brief_description || r.summary_text || '').trim();
  }

  function leadLogOpenContext() {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = d.getDay();
    var diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    var weekStart =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    return { openTermLabel: '', openWeekStart: weekStart };
  }

  function renderLeadTermWeekLog(Hub, lead) {
    var leadLogEl = document.getElementById('portalFormsLeadLog');
    if (!leadLogEl || !Hub || typeof Hub.renderTermWeekLogHtml !== 'function') return;
    var ctx = leadLogOpenContext();
    var rowDateIso = Hub.rowDateIso || function (v) {
      return String(v || '').slice(0, 10);
    };
    leadLogEl.innerHTML = Hub.renderTermWeekLogHtml({
      escapeHtml: esc,
      title: 'Lead reports log',
      emptyMsg: 'No lead reports in loaded data.',
      rows: lead,
      getDateIso: function (r) {
        return rowDateIso(r.session_date) || rowDateIso(r.created_at);
      },
      openTermLabel: ctx.openTermLabel,
      openWeekStart: ctx.openWeekStart,
      tableClass: ' ash-table--overview portal-forms-table--lead-reports',
      headHtml:
        '<th class="ash-td-center">Session date</th><th class="ash-td-center">Recorded</th><th class="ash-td-center">Submitted by</th><th class="ash-td-center">Service</th>',
      rowHtml: function (r, escFn) {
        var sd = rowDateIso(r.session_date) || rowDateIso(r.created_at);
        var svcSub = portalFormsLeadServiceSubLine(r);
        var svcTitle = String(r.service || '') + (svcSub ? ' · ' + svcSub : '');
        return (
          '<tr>' +
          '<td class="ash-td-center">' +
          escFn(formatDateOnly(sd || r.session_date)) +
          '</td><td class="ash-td-center">' +
          portalFormsWhenStackHtml(r.created_at, escFn) +
          '</td><td class="ash-td-center"><div class="portal-forms-cell-main">' +
          escFn(cellText(r.submitted_by_name)) +
          '</div></td><td class="ash-td-center cell-clip" title="' +
          escFn(svcTitle) +
          '">' +
          portalFormsLeadServiceHtml(r, escFn) +
          '</td></tr>'
        );
      }
    });
  }

  async function renderLeadVenueTables() {
    var leadTbody = document.getElementById('portalFormsLeadTbody');
    var venueTbody = document.getElementById('portalFormsVenueTbody');
    if (!leadTbody && !venueTbody) return;
    var lead = payload.lead_session_reports || [];
    var venue = payload.venue_reviews || [];
    var Hub = null;
    if (leadTbody || document.getElementById('portalFormsLeadLog')) {
      try {
        await ensureHubScript();
        Hub = global.AdminSessionsHub;
      } catch (eHub) {
        console.debug('[PortalDayOps] hub for lead log', eHub);
      }
    }
    if (leadTbody) {
      if (!lead.length) {
        leadTbody.innerHTML =
          '<tr><td colspan="4"><div class="submission-state">No lead reports yet.</div></td></tr>';
      } else {
        leadTbody.innerHTML = lead
          .map(function (r, i) {
            var who = esc(cellText(r.submitted_by_name));
            var svcSub = portalFormsLeadServiceSubLine(r);
            var svcTitle = String(r.service || '') + (svcSub ? ' · ' + svcSub : '');
            return (
              '<tr class="portal-forms-data-row" data-portal-forms-kind="lead" data-portal-forms-idx="' +
              i +
              '" title="Double-click to view">' +
              '<td class="col-date">' +
              portalFormsWhenStackHtml(r.created_at, esc) +
              '</td>' +
              '<td><div class="portal-forms-cell-main">' +
              who +
              '</div></td>' +
              '<td class="cell-clip" title="' +
              esc(svcTitle) +
              '">' +
              portalFormsLeadServiceHtml(r, esc) +
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
    var leadLogMount = document.getElementById('portalFormsLeadLog');
    if (leadLogMount) {
      if (!Hub) {
        try {
          await ensureHubScript();
          Hub = global.AdminSessionsHub;
        } catch (eHub2) {
          console.debug('[PortalDayOps] hub for lead log mount', eHub2);
        }
      }
      renderLeadTermWeekLog(Hub, lead);
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
      var wkBtn = ev.target && ev.target.closest ? ev.target.closest('[data-ash-log-jump-week]') : null;
      if (wkBtn && cfg.onLogJumpWeek) {
        ev.preventDefault();
        cfg.onLogJumpWeek(wkBtn.getAttribute('data-ash-log-jump-week'));
        return;
      }
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-portal-forms-kind]') : null;
      if (!btn) return;
      var kind = btn.getAttribute('data-portal-forms-kind');
      var idx = parseInt(btn.getAttribute('data-portal-forms-idx'), 10);
      if (isNaN(idx)) return;
      var arr =
        kind === 'lead' ? payload.lead_session_reports : kind === 'venue' ? payload.venue_reviews : null;
      if (!arr || !arr[idx]) return;
      if (global.PortalFormRecordModal && typeof global.PortalFormRecordModal.open === 'function') {
        global.PortalFormRecordModal.open(kind, idx);
        return;
      }
      try {
        alert(JSON.stringify(arr[idx], null, 2));
      } catch (e) {
        alert(String(arr[idx]));
      }
    });
    shell.addEventListener('dblclick', function (ev) {
      var row = ev.target && ev.target.closest ? ev.target.closest('.portal-forms-data-row[data-portal-forms-kind]') : null;
      if (!row) return;
      var kind = row.getAttribute('data-portal-forms-kind');
      var idx = parseInt(row.getAttribute('data-portal-forms-idx'), 10);
      if (isNaN(idx)) return;
      var arr =
        kind === 'lead' ? payload.lead_session_reports : kind === 'venue' ? payload.venue_reviews : null;
      if (!arr || !arr[idx]) return;
      if (global.PortalFormRecordModal && typeof global.PortalFormRecordModal.open === 'function') {
        global.PortalFormRecordModal.open(kind, idx);
        return;
      }
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
        if (
          global.portalAdminLoadHeavyScripts &&
          typeof global.portalAdminHeavyScriptsReady === 'function' &&
          !global.portalAdminHeavyScriptsReady()
        ) {
          await global.portalAdminLoadHeavyScripts(['roster', 'feedback']);
        }
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
        if (skipEdge) {
          var quick = emptyPayload();
          if (cfg.buildFeedbackFromPortal) {
            quick.session_feedback = cfg.buildFeedbackFromPortal() || [];
            quick.session_feedback_total = quick.session_feedback.length;
            quick.session_feedback_loaded = quick.session_feedback.length;
          }
          if (cfg.buildVenueFromPortal) {
            quick.venue_reviews = cfg.buildVenueFromPortal() || [];
          }
          applyPayload(quick);
          setStatus('');
          void (async function () {
            try {
              var partial = await fetchOverviewSupabaseExtras();
              applyPayload(partial);
              mergePortalFeedbackIntoPayload();
              mergePortalVenueIntoPayload();
              portalDayOpsAfterFeedbackPayloadMergeDebounced();
              var runDeferred = function () {
                void (async function () {
                  try {
                    var deferred = await fetchDeferredSupabaseExtras();
                    applyPayload(
                      Object.assign({}, payload, {
                        incident_reports: deferred.incident_reports || [],
                        lead_session_reports: deferred.lead_session_reports || [],
                        venue_reviews: deferred.venue_reviews || []
                      })
                    );
                    mergePortalFeedbackIntoPayload();
                    mergePortalVenueIntoPayload();
                    portalDayOpsAfterFeedbackPayloadMergeDebounced();
                    ensureSessionFeedbackRealtime();
                    renderLeadVenueTables();
                  } catch (bgDeferErr) {
                    console.debug('[PortalDayOps] background deferred enrich', bgDeferErr);
                  }
                })();
              };
              if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(runDeferred, { timeout: 6000 });
              } else {
                setTimeout(runDeferred, 1200);
              }
            } catch (bgErr) {
              console.debug('[PortalDayOps] background enrich', bgErr);
            }
          })();
          return payload;
        }
        var fb = await fetchFallbackSupabase();
        applyPayload(fb);
        mergePortalFeedbackIntoPayload();
        mergePortalVenueIntoPayload();
        portalDayOpsAfterFeedbackPayloadMerge();
        ensureSessionFeedbackRealtime();
        return payload;
      })()
        .finally(function () {
          loadInFlight = null;
        });
      return loadInFlight;
    },
    refreshTab: async function (tabId) {
      try {
        if (cfg.invalidateLiveCaches) {
          try {
            cfg.invalidateLiveCaches();
          } catch (_inv) {}
        } else {
          this.invalidatePayload();
        }
        await global.PortalDayOps.ensurePayload();
        if (tabId === 'overview' || tabId === 'incidents' || tabId === 'absents' || tabId === 'cancellations') {
          pendingOverviewTab = overviewTabForC4k(tabId);
          var th = await initTrackingHub();
          if (th && feedbackHub) syncHubViewFilters(feedbackHub, th);
          if (th) {
            applyPendingOverviewTab();
            reRenderHub(th);
          }
          return th;
        }
        if (tabId === 'feedback' || tabId === 'positive' || tabId === 'relevant') {
          var fs = feedbackSetupForC4k(tabId);
          pendingFeedbackNoteFilter = fs.filter;
          var fh = await initFeedbackHub();
          if (fh && trackingHub) syncHubViewFilters(trackingHub, fh);
          if (fh) {
            fh.tab = fs.tab;
            fh.feedbackNoteFilter = fs.filter;
            applyPendingFeedbackNav(fh);
            reRenderHub(fh);
          }
          return fh;
        }
        if (tabId === 'lead' || tabId === 'venue') {
          if (loadInFlight) {
            try {
              await loadInFlight;
            } catch (eWait) {
              console.debug('[PortalDayOps] lead tab wait payload', eWait);
            }
          }
          if (tabId === 'lead' && cfg.fetchLeadReports) {
            try {
              payload.lead_session_reports = (await cfg.fetchLeadReports()) || [];
            } catch (eLeadTab) {
              console.debug('[PortalDayOps] fetchLeadReports', eLeadTab);
            }
          }
          await renderLeadVenueTables();
          return null;
        }
        return null;
      } catch (err) {
        console.error('[PortalDayOps] refreshTab', err);
        var fbRoot = document.getElementById('adminSessionFeedbacksRoot');
        if (fbRoot) {
          fbRoot.innerHTML =
            '<p class="submission-state is-error" style="margin:0"><strong>Could not load session feedback.</strong> ' +
            esc(String((err && err.message) || err)) +
            ' Try <strong>Refresh</strong> or reload the page.</p>';
        }
        var trackRoot = document.getElementById('adminSessionsHubRoot');
        if (trackRoot && !trackRoot.querySelector('.ash-panels')) {
          trackRoot.innerHTML =
            '<p class="submission-state is-error" style="margin:0"><strong>Could not load session overview.</strong> ' +
            esc(String((err && err.message) || err)) +
            '</p>';
        }
        return null;
      }
    },
    invalidatePayload: function () {
      loadInFlight = null;
      try {
        if (typeof window !== 'undefined') {
          window.__PORTAL_SCHEDULE_OVERRIDES__ = null;
        }
      } catch (_eOv) {}
      try {
        if (typeof window.portalInvalidateAdminFeedbackStatusCache === 'function') {
          window.portalInvalidateAdminFeedbackStatusCache();
        }
      } catch (_e) {}
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
