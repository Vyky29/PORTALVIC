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
    staff_unavailability: [],
    session_quick_marks: []
  };
  var loadInFlight = null;
  var trackingHub = null;
  var feedbackHub = null;
  var pendingOverviewTab = null;
  var pendingFeedbackNoteFilter = undefined;

  var PORTAL_DAY_OPS_BUILD = '20260924-training-own';
  var venueReviewFilters = {
    venue: '',
    staff: '',
    term: '',
    kind: ''
  };
  var venueAdminVideoUploading = {};
  function portalHubBuildToken() {
    return String(global.PORTAL_ADMIN_HUB_BUILD || PORTAL_DAY_OPS_BUILD || '').trim();
  }
  function portalHubScriptSrc() {
    return '/portal/admin-sessions-hub.js?v=' + encodeURIComponent(portalHubBuildToken());
  }
  var EDGE_FETCH_MS = 12000;
  /* Register tab used to block up to 45s on a slow Edge-first path; RPC-first should finish sooner. */
  var ENRICH_WAIT_MS = 20000;
  var SESSION_FEEDBACK_FETCH_MS = 28000;
  var SUPABASE_WAIT_MS = 22000;

  function dayOpsDebugEnabled() {
    try {
      if (typeof global.location !== 'undefined' && /portalDebug=1/.test(global.location.search || '')) {
        return true;
      }
      if (typeof global.localStorage !== 'undefined' && global.localStorage.getItem('portalDebugDayOps') === '1') {
        return true;
      }
    } catch (_dbg) {}
    return false;
  }

  function dayOpsDebug() {
    if (!dayOpsDebugEnabled()) return;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug.apply(console, arguments);
    }
  }

  var FB_FETCH_TIMEOUT = { __portalFbTimeout: true };

  function promiseWithTimeout(promise, ms, fallback, onLate) {
    var timedOut = false;
    var timer = null;
    var tracked = Promise.resolve(promise).then(
      function (value) {
        if (timedOut && typeof onLate === 'function') {
          try {
            onLate(value);
          } catch (_late) {}
        }
        return value;
      },
      function (err) {
        if (timedOut) {
          console.warn('[PortalDayOps] late fetch error', err);
          return fallback;
        }
        throw err;
      }
    );
    return Promise.race([
      tracked,
      new Promise(function (resolve) {
        timer = setTimeout(function () {
          timedOut = true;
          resolve(fallback);
        }, ms);
      })
    ]).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function feedbackRowMergeKey(row) {
    if (!row) return '';
    var id = String(row.id || '').trim();
    if (id) return 'id:' + id;
    return [
      String(row.session_date || '').slice(0, 10),
      String(row.client_name || '').trim().toLowerCase(),
      String(row.session_time || '').trim(),
      String(row.completed_by_name || '').trim().toLowerCase(),
      String(row.portal_session_key || '').trim()
    ].join('|');
  }

  function mergeSessionFeedbackRows(current, incoming) {
    if (!Array.isArray(incoming) || !incoming.length) {
      return Array.isArray(current) ? current : [];
    }
    if (!Array.isArray(current) || !current.length) return incoming.slice();
    var out = [];
    var at = Object.create(null);
    function add(row) {
      if (!row) return;
      var key = feedbackRowMergeKey(row);
      if (!key) {
        out.push(row);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(at, key)) {
        out[at[key]] = row;
        return;
      }
      at[key] = out.length;
      out.push(row);
    }
    current.forEach(add);
    incoming.forEach(add);
    return out;
  }

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
    var k = cfg.getAnonKey && cfg.getAnonKey();
    if (k) return String(k);
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE';
  }

  async function resolvePortalAccessToken(client) {
    function fromSession(session) {
      return session && session.access_token ? String(session.access_token) : '';
    }
    if (typeof global.portalAdminResolveAccessToken === 'function') {
      var bridged = String(global.portalAdminResolveAccessToken() || '').trim();
      if (bridged) return bridged;
    }
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var cached = fromSession(box.session);
      if (cached) return cached;
    } catch (_) {}
    if (!client || !client.auth) return '';
    try {
      var sessResp = await client.auth.getSession();
      var session = sessResp && sessResp.data && sessResp.data.session;
      var tok = fromSession(session);
      if (tok) {
        try {
          var b = global.__PORTAL_SUPABASE__ || {};
          if (b) b.session = session;
        } catch (_) {}
        return tok;
      }
      var gu = await client.auth.getUser();
      if (!gu.error && gu.data && gu.data.user) {
        sessResp = await client.auth.getSession();
        session = sessResp && sessResp.data && sessResp.data.session;
        tok = fromSession(session);
        if (tok) {
          try {
            var b2 = global.__PORTAL_SUPABASE__ || {};
            if (b2) b2.session = session;
          } catch (_) {}
          return tok;
        }
      }
    } catch (_) {}
    return '';
  }

  function emptyPayload() {
    return {
      counts: {},
      session_feedback: [],
      session_feedback_total: 0,
      session_feedback_loaded: false,
      incident_reports: [],
      lead_session_reports: [],
      venue_reviews: [],
      cancellation_reports: [],
      schedule_overrides: [],
      staff_unavailability: [],
      session_quick_marks: []
    };
  }

  function syncScheduleOverridesIntoPayload() {
    try {
      var cached = global.__PORTAL_SCHEDULE_OVERRIDES__;
      if (Array.isArray(cached) && cached.length) {
        var curLen = (payload.schedule_overrides || []).length;
        if (!curLen || cached.length > curLen) {
          payload.schedule_overrides = cached.slice();
        }
      }
      var cachedInc = global.__PORTAL_INCIDENT_REPORTS__;
      if (Array.isArray(cachedInc) && cachedInc.length) {
        if (!payload.incident_reports || !payload.incident_reports.length) {
          payload.incident_reports = cachedInc.slice();
        }
      }
      var cachedOff = global.__PORTAL_STAFF_UNAVAILABILITY__;
      if (Array.isArray(cachedOff) && cachedOff.length) {
        var curOff = (payload.staff_unavailability || []).length;
        if (!curOff || cachedOff.length > curOff) {
          payload.staff_unavailability = cachedOff.slice();
        }
      }
    } catch (_syncOv) {}
  }

  async function fetchParentFeedbackSharesInto(target) {
    if (!cfg.fetchParentFeedbackShares) return;
    try {
      var shares = await cfg.fetchParentFeedbackShares();
      target.parent_feedback_shares = shares || [];
    } catch (eShares) {
      console.debug('[PortalDayOps] parent_feedback_shares', eShares);
      target.parent_feedback_shares = target.parent_feedback_shares || [];
    }
  }

  /** Prefer non-empty merges — overview soft-refresh used to wipe lead/incident arrays with []. */
  function mergeArrayField(key, incoming) {
    if (!Array.isArray(incoming)) return;
    var cur = payload[key];
    if (incoming.length || !Array.isArray(cur) || !cur.length) {
      payload[key] = incoming;
    }
  }

  function applyPayload(j) {
    if (!j) return;
    if (j.counts) payload.counts = j.counts;
    if (Array.isArray(j.session_feedback)) {
      if (j.session_feedback.length) {
        payload.session_feedback = mergeSessionFeedbackRows(payload.session_feedback, j.session_feedback);
      } else if (!Array.isArray(payload.session_feedback) || !payload.session_feedback.length) {
        payload.session_feedback = j.session_feedback;
      }
    }
    if (j.session_feedback_loaded !== undefined) {
      if (j.session_feedback_loaded === true || !(payload.session_feedback || []).length) {
        payload.session_feedback_loaded = j.session_feedback_loaded;
      }
    }
    if (j.session_feedback_total != null) {
      payload.session_feedback_total = Math.max(Number(j.session_feedback_total) || 0, (payload.session_feedback || []).length);
    } else if (Array.isArray(payload.session_feedback) && payload.session_feedback.length) {
      payload.session_feedback_total = payload.session_feedback.length;
    }
    mergeArrayField('incident_reports', j.incident_reports);
    mergeArrayField('lead_session_reports', j.lead_session_reports);
    mergeArrayField('venue_reviews', j.venue_reviews);
    mergeArrayField('cancellation_reports', j.cancellation_reports);
    mergeArrayField('schedule_overrides', j.schedule_overrides);
    mergeArrayField('staff_unavailability', j.staff_unavailability);
    mergeArrayField('session_quick_marks', j.session_quick_marks);
    mergeArrayField('parent_feedback_shares', j.parent_feedback_shares);
    try {
      if ((payload.lead_session_reports || []).length) {
        global.__PORTAL_LEAD_SESSION_REPORTS__ = payload.lead_session_reports;
      }
    } catch (_syncLead) {}
    try {
      if (Array.isArray(payload.staff_unavailability)) {
        global.__PORTAL_STAFF_UNAVAILABILITY__ = payload.staff_unavailability.slice();
      }
    } catch (_syncOff) {}
  }

  function portalDayOpsHubIsLive(hub) {
    return !!(hub && hub.root && hub.root.isConnected);
  }

  function portalDayOpsAfterFeedbackPayloadMerge() {
    syncScheduleOverridesIntoPayload();
    if (typeof window.portalInvalidateAdminFeedbackStatusCache === 'function') {
      window.portalInvalidateAdminFeedbackStatusCache();
    }
    if (portalDayOpsHubIsLive(feedbackHub) && typeof feedbackHub.setPayload === 'function') {
      feedbackHub.setPayload(payload, { quiet: true });
    }
    /* Overview is a staffing board — do not re-paint on every feedback poll/realtime tick. */
    if (portalDayOpsHubIsLive(trackingHub) && typeof trackingHub.setPayload === 'function') {
      trackingHub.setPayload(payload, { quiet: true });
    }
    exposePortalAdminDebugGlobals();
    portalDayOpsRenderLiveLoadStatus();
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

  function adoptSessionFeedbackRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    payload.session_feedback = mergeSessionFeedbackRows(payload.session_feedback, rows);
    payload.session_feedback_total = payload.session_feedback.length;
    payload.session_feedback_loaded = true;
    portalDayOpsAfterFeedbackPayloadMerge();
  }

  async function refreshSessionFeedbackLive() {
    if (!cfg.fetchSessionFeedback) return;
    try {
      var dbFb = await promiseWithTimeout(
        cfg.fetchSessionFeedback(),
        SESSION_FEEDBACK_FETCH_MS,
        FB_FETCH_TIMEOUT,
        function (late) {
          if (Array.isArray(late) && late.length) adoptSessionFeedbackRows(late);
        }
      );
      if (dbFb && dbFb.__portalFbTimeout) {
        if ((payload.session_feedback || []).length) {
          payload.session_feedback_loaded = true;
        }
        portalDayOpsRenderLiveLoadStatus();
        return;
      }
      if (Array.isArray(dbFb) && dbFb.length) {
        payload.session_feedback = mergeSessionFeedbackRows(payload.session_feedback, dbFb);
      } else if (!Array.isArray(payload.session_feedback) || !payload.session_feedback.length) {
        payload.session_feedback = Array.isArray(dbFb) ? dbFb : [];
      }
      payload.session_feedback_total = payload.session_feedback.length;
      payload.session_feedback_loaded = true;
      await fetchParentFeedbackSharesInto(payload);
      portalDayOpsAfterFeedbackPayloadMerge();
    } catch (eFb) {
      console.error('[PortalDayOps] refreshSessionFeedbackLive', eFb);
      if ((payload.session_feedback || []).length) payload.session_feedback_loaded = true;
    } finally {
      portalDayOpsRenderLiveLoadStatus();
    }
  }

  function ensureSessionFeedbackLoadedSoon() {
    if (payload.session_feedback && payload.session_feedback.length) return;
    if (!cfg.fetchSessionFeedback) return;
    void refreshSessionFeedbackLive();
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
    if (!r) return '';
    var id = String(r.id || '').trim();
    if (id) return 'id:' + id;
    return (
      String((r && r.review_date) || '')
        .trim()
        .substring(0, 10) +
      '|' +
      String((r && r.venue) || '')
        .trim()
        .toLowerCase() +
      '|' +
      String((r && r.opening_or_closing) || '')
        .trim()
        .toLowerCase() +
      '|' +
      String((r && r.submitted_by_user_id) || (r && r.submitted_by_name) || '')
        .trim()
        .toLowerCase() +
      '|' +
      String((r && r.review_time) || '').trim()
    );
  }

  /** Static portal export supplements Supabase venue_reviews (same pattern as session feedback). */
  function mergePortalVenueIntoPayload() {
    if (!cfg.buildVenueFromPortal) return;
    var portalRows = cfg.buildVenueFromPortal() || [];
    if (!portalRows.length) return;
    var byKey = {};
    var out = [];
    (payload.venue_reviews || []).forEach(function (r) {
      var k = venueReviewMergeKey(r);
      if (!k || byKey[k]) return;
      byKey[k] = true;
      out.push(r);
    });
    portalRows.forEach(function (r) {
      var k = venueReviewMergeKey(r);
      if (!k || byKey[k]) return;
      byKey[k] = true;
      out.push(r);
    });
    out.sort(function (a, b) {
      var ca = String(a.created_at || '');
      var cb = String(b.created_at || '');
      if (ca !== cb) return cb.localeCompare(ca);
      var da = String(a.review_date || '');
      var db = String(b.review_date || '');
      if (da !== db) return db.localeCompare(da);
      var va = String(a.venue || '').localeCompare(String(b.venue || ''));
      if (va) return va;
      return String(a.submitted_by_name || '').localeCompare(String(b.submitted_by_name || ''));
    });
    payload.venue_reviews = out;
  }

  async function fetchEdgePayload() {
    var client = cfg.getClient && cfg.getClient();
    if (!client || !client.auth) return null;
    var at = await resolvePortalAccessToken(client);
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

  async function fetchStaffUnavailabilityInto(out, client) {
    if (!client) return;
    var sinceOff = new Date();
    sinceOff.setDate(sinceOff.getDate() - 14);
    var untilOff = new Date();
    untilOff.setDate(untilOff.getDate() + 120);
    var sinceOffIso = sinceOff.toISOString().slice(0, 10);
    var untilOffIso = untilOff.toISOString().slice(0, 10);
    try {
      var offRes = await client
        .from('staff_unavailability')
        .select('id, name_key, staff_name, staff_id, off_date, reason')
        .gte('off_date', sinceOffIso)
        .lte('off_date', untilOffIso)
        .order('off_date', { ascending: true })
        .limit(800);
      if (!offRes.error) {
        out.staff_unavailability = offRes.data || [];
        try {
          global.__PORTAL_STAFF_UNAVAILABILITY__ = (out.staff_unavailability || []).slice();
        } catch (_g) {}
      }
    } catch (eOff) {}
  }

  /** Fast path for Sessions overview — parallel, no incidents/lead/venue/DB feedback merge. */
  async function fetchOverviewSupabaseExtras() {
    var client = cfg.getClient && cfg.getClient();
    if (!client && global.__PORTAL_SUPABASE_BOOT_INFLIGHT__) {
      try {
        await global.__PORTAL_SUPABASE_BOOT_INFLIGHT__;
      } catch (_bootWait) {}
      client = cfg.getClient && cfg.getClient();
    }
    var out = emptyPayload();
    var tasks = [];
    if (cfg.fetchScheduleOverrides) {
      tasks.push(
        cfg.fetchScheduleOverrides().then(function (rows) {
          out.schedule_overrides = rows || [];
        })
      );
    } else if (client) {
      tasks.push(fetchScheduleOverridesInto(out, client));
    }
    if (client) {
      tasks.push(fetchStaffUnavailabilityInto(out, client));
    } else if (Array.isArray(global.__PORTAL_STAFF_UNAVAILABILITY__)) {
      out.staff_unavailability = global.__PORTAL_STAFF_UNAVAILABILITY__.slice();
    }
    if (cfg.fetchSessionFeedback) {
      tasks.push(
        (async function () {
          var live = [];
          try {
            if (!client && cfg.waitForSupabaseClient) {
              client = await cfg.waitForSupabaseClient(SUPABASE_WAIT_MS);
            }
            live = await promiseWithTimeout(
              cfg.fetchSessionFeedback(),
              SESSION_FEEDBACK_FETCH_MS,
              FB_FETCH_TIMEOUT,
              function (late) {
                if (Array.isArray(late) && late.length) adoptSessionFeedbackRows(late);
              }
            );
            if (live && live.__portalFbTimeout) {
              if ((payload.session_feedback || []).length) {
                out.session_feedback = payload.session_feedback;
                out.session_feedback_total = payload.session_feedback.length;
                out.session_feedback_loaded = true;
              } else {
                console.warn('[PortalDayOps] session_feedback still loading (timeout kept empty payload)');
              }
            } else {
              live = Array.isArray(live) ? live : [];
              out.session_feedback = live;
              out.session_feedback_total = live.length;
              out.session_feedback_loaded = true;
              if (!live.length) {
                var meta = global.__PORTAL_ADMIN_SESSION_FEEDBACK_LOAD__;
                var err = meta && meta.error ? String(meta.error) : '';
                console.warn(
                  '[PortalDayOps] session_feedback live rows: 0' + (err ? ' (' + err + ')' : '')
                );
              } else {
                console.log('[PortalDayOps] session_feedback live rows:', live.length);
              }
              dayOpsDebug('[PortalDayOps] session_feedback live rows:', live.length);
            }
          } catch (taskErr) {
            console.error('[PortalDayOps] session_feedback task failed', taskErr);
            if ((payload.session_feedback || []).length) {
              out.session_feedback = payload.session_feedback;
              out.session_feedback_total = payload.session_feedback.length;
              out.session_feedback_loaded = true;
            } else {
              out.session_feedback = out.session_feedback || [];
              out.session_feedback_total = out.session_feedback.length;
            }
          }
        })()
      );
    }
    if (cfg.fetchCancellations) {
      tasks.push({ seq: true, run: function () {
        return cfg.fetchCancellations().then(function (rows) {
          out.cancellation_reports = rows || [];
        });
      }});
    }
    if (cfg.fetchAbsents) {
      tasks.push({ seq: true, run: function () {
        return cfg.fetchAbsents().then(function (rows) {
          out.session_quick_marks = rows || [];
        });
      }});
    }
    var parallel = [];
    var sequential = [];
    tasks.forEach(function (t) {
      if (t && t.seq) sequential.push(t.run);
      else parallel.push(typeof t === 'function' ? t : t);
    });
    await Promise.all(
      parallel.map(function (p) {
        return Promise.resolve(typeof p === 'function' ? p() : p).catch(function (taskErr) {
          console.error('[PortalDayOps] overview enrich task failed', taskErr);
        });
      })
    );
    for (var si = 0; si < sequential.length; si++) {
      try {
        await sequential[si]();
      } catch (taskErr) {
        console.error('[PortalDayOps] overview enrich task failed', taskErr);
      }
      if (si < sequential.length - 1) {
        await new Promise(function (r) {
          setTimeout(r, 250);
        });
      }
    }
    await fetchParentFeedbackSharesInto(out);
    try {
      if ((!out.schedule_overrides || !out.schedule_overrides.length) && global.__PORTAL_SCHEDULE_OVERRIDES__) {
        out.schedule_overrides = global.__PORTAL_SCHEDULE_OVERRIDES__.slice();
      }
    } catch (_ovFallback) {}
    console.log('[PortalDayOps] schedule_overrides live rows:', (out.schedule_overrides || []).length);
    console.log('[PortalDayOps] staff_unavailability live rows:', (out.staff_unavailability || []).length);
    return out;
  }

  /** Heavier tables — incidents, lead, venue (edge fetchers avoid RLS client gaps). */
  async function fetchDeferredSupabaseExtras() {
    var client = cfg.getClient && cfg.getClient();
    if (!client && cfg.waitForSupabaseClient) {
      try {
        client = await cfg.waitForSupabaseClient(12000);
      } catch (_waitClient) {}
    }
    var out = emptyPayload();
    var since = new Date();
    since.setDate(since.getDate() - 120);
    var sinceIso = since.toISOString().slice(0, 10);
    var tasks = [];
    if (cfg.fetchIncidentReports) {
      tasks.push(function () {
        return cfg.fetchIncidentReports().then(function (rows) {
          out.incident_reports = rows || [];
        });
      });
    } else if (client) {
      tasks.push(function () {
        return client
          .from('incident_reports')
          .select('*')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(400)
          .then(function (inc) {
            if (!inc.error) out.incident_reports = inc.data || [];
          });
      });
    }
    if (cfg.fetchLeadReports) {
      tasks.push(function () {
        return cfg.fetchLeadReports().then(function (rows) {
          out.lead_session_reports = rows || [];
        });
      });
    } else if (client) {
      tasks.push(function () {
        return client
          .from('lead_session_reports')
          .select('*')
          .gte('session_date', sinceIso)
          .order('session_date', { ascending: false })
          .limit(500)
          .then(function (lead) {
            if (!lead.error) out.lead_session_reports = lead.data || [];
          });
      });
    }
    if (cfg.fetchVenueReviews) {
      tasks.push(function () {
        return cfg.fetchVenueReviews().then(function (rows) {
          out.venue_reviews = rows || [];
        });
      });
    } else if (client) {
      tasks.push(function () {
        return client
          .from('venue_reviews')
          .select('*')
          .order('review_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(500)
          .then(function (ven) {
            if (ven.error) {
              console.warn('[PortalDayOps] venue_reviews', ven.error.message || ven.error);
              return;
            }
            out.venue_reviews = ven.data || [];
          });
      });
    }
    for (var di = 0; di < tasks.length; di++) {
      try {
        await tasks[di]();
      } catch (deferErr) {
        console.error('[PortalDayOps] deferred enrich task failed', deferErr);
      }
      if (di < tasks.length - 1) {
        await new Promise(function (r) {
          setTimeout(r, 300);
        });
      }
    }
    console.log('[PortalDayOps] incident_reports live rows:', (out.incident_reports || []).length);
    console.log('[PortalDayOps] venue_reviews live rows:', (out.venue_reviews || []).length);
    return out;
  }

  function applyDeferredPayload(deferred) {
    applyPayload(
      Object.assign({}, payload, {
        incident_reports: deferred.incident_reports || [],
        lead_session_reports: deferred.lead_session_reports || [],
        venue_reviews: deferred.venue_reviews || []
      })
    );
    mergePortalVenueIntoPayload();
    portalDayOpsAfterFeedbackPayloadMerge();
    ensureSessionFeedbackRealtime();
    renderLeadVenueTables();
  }

  function startDeferredSupabaseExtras() {
    if (global.__PORTAL_DAY_OPS_DEFER__) return global.__PORTAL_DAY_OPS_DEFER__;
    var deferPromise = fetchDeferredSupabaseExtras()
      .then(function (deferred) {
        applyDeferredPayload(deferred);
        return deferred;
      })
      .catch(function (bgDeferErr) {
        console.error('[PortalDayOps] deferred enrich failed', bgDeferErr);
        return null;
      })
      .finally(function () {
        if (global.__PORTAL_DAY_OPS_DEFER__ === deferPromise) {
          global.__PORTAL_DAY_OPS_DEFER__ = null;
        }
      });
    global.__PORTAL_DAY_OPS_DEFER__ = deferPromise;
    return deferPromise;
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
    await fetchParentFeedbackSharesInto(overview);
    return overview;
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('portalDayOpsStatus');
    if (!el) return;
    el.className = 'portal-forms-status' + (isError ? ' is-error' : '');
    el.innerHTML = msg || '';
  }

  function portalDayOpsRenderLiveLoadStatus() {
    var el = document.getElementById('portalDayOpsStatus');
    if (!el) return;
    var live = global.__PORTAL_ADMIN_LIVE_LOAD__ || {};
    var fbMeta = live.session_feedback || global.__PORTAL_ADMIN_SESSION_FEEDBACK_LOAD__ || null;
    var ovMeta = live.schedule_overrides || null;
    var fbCount = (payload.session_feedback || []).length;
    var ovCount = (payload.schedule_overrides || []).length;
    if (!ovCount && global.__PORTAL_SCHEDULE_OVERRIDES__ && global.__PORTAL_SCHEDULE_OVERRIDES__.length) {
      ovCount = global.__PORTAL_SCHEDULE_OVERRIDES__.length;
    }
    if (ovMeta && ovMeta.count && !ovCount) ovCount = ovMeta.count;
    var incCount = (payload.incident_reports || []).length;
    if (!incCount && global.__PORTAL_INCIDENT_REPORTS__ && global.__PORTAL_INCIDENT_REPORTS__.length) {
      incCount = global.__PORTAL_INCIDENT_REPORTS__.length;
    }
    var incMeta = live.incident_reports || null;
    if (incMeta && incMeta.count && !incCount) incCount = incMeta.count;
    var venueCount = (payload.venue_reviews || []).length;
    if (!venueCount && global.__PORTAL_VENUE_REVIEWS__ && global.__PORTAL_VENUE_REVIEWS__.length) {
      venueCount = global.__PORTAL_VENUE_REVIEWS__.length;
    }
    var loaded = payload.session_feedback_loaded === true;
    var cache = global.__PORTAL_ADMIN_SESSION_FEEDBACK_CACHE__;
    if (!fbCount && Array.isArray(cache) && cache.length) {
      payload.session_feedback = mergeSessionFeedbackRows(payload.session_feedback, cache);
      payload.session_feedback_total = payload.session_feedback.length;
      payload.session_feedback_loaded = true;
      fbCount = payload.session_feedback.length;
      loaded = true;
    }
    if (!loaded) {
      el.className = 'portal-forms-status';
      el.innerHTML =
        '<strong>Loading live data…</strong> session feedback, overrides, absents from Supabase.';
      return;
    }
    if (!fbCount) {
      el.className = 'portal-forms-status is-error';
      var err = fbMeta && fbMeta.error ? esc(String(fbMeta.error)) : 'unknown';
      el.innerHTML =
        '<strong>Session feedback not loaded (0 rows).</strong> ' +
        esc(err) +
        ' — hard-refresh (Cmd+Shift+R) and sign in again as admin. Overrides: ' +
        esc(String(ovCount)) +
        (ovMeta && ovMeta.error ? ' (' + esc(String(ovMeta.error)) + ')' : '') +
        '.';
      return;
    }
    el.className = 'portal-forms-status';
    el.innerHTML =
      '<strong>Live data OK</strong> · Feedback: <strong>' +
      esc(String(fbCount)) +
      '</strong> rows · Overrides: <strong>' +
      esc(String(ovCount)) +
      '</strong> · Incidents: <strong>' +
      esc(String(incCount)) +
      '</strong> · Venue: <strong>' +
      esc(String(venueCount)) +
      '</strong> · build <code>' +
      esc(PORTAL_DAY_OPS_BUILD) +
      '</code>';
  }

  function exposePortalAdminDebugGlobals() {
    global.portalAdminSessionFeedbackLoadMeta = function portalAdminSessionFeedbackLoadMeta() {
      return global.__PORTAL_ADMIN_SESSION_FEEDBACK_LOAD__ || null;
    };
    global.portalAdminLiveLoadStatus = function portalAdminLiveLoadStatus() {
      return global.__PORTAL_ADMIN_LIVE_LOAD__ || null;
    };
    global.portalAdminDiagnoseFeedbackDay = function portalAdminDiagnoseFeedbackDay(iso) {
      var h = trackingHub || feedbackHub;
      if (!h || typeof h.diagnoseDay !== 'function') {
        return { error: 'hub_not_ready', payloadFeedback: (payload.session_feedback || []).length };
      }
      return h.diagnoseDay(iso || h.selectedDay);
    };
    global.portalAdminMissingFeedbackReport = function portalAdminMissingFeedbackReport(opts) {
      opts = opts || {};
      var h = trackingHub || feedbackHub;
      if (!h || typeof h.missingFeedbackForDay !== 'function') {
        return { error: 'hub_not_ready', payloadFeedback: (payload.session_feedback || []).length };
      }
      if (opts.day) {
        return h.missingFeedbackForDay(String(opts.day).trim().slice(0, 10));
      }
      var to = opts.to ? String(opts.to).trim().slice(0, 10) : String(h.selectedDay || '').slice(0, 10);
      var from = opts.from ? String(opts.from).trim().slice(0, 10) : '';
      if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        var today = new Date();
        to = today.toISOString().slice(0, 10);
      }
      if (!from) {
        var since = new Date(to + 'T12:00:00');
        since.setDate(since.getDate() - 13);
        from = since.toISOString().slice(0, 10);
      }
      if (typeof h.missingFeedbackForRange === 'function') {
        return h.missingFeedbackForRange(from, to);
      }
      return h.missingFeedbackForDay(to);
    };
  }
  exposePortalAdminDebugGlobals();
  try {
    if (typeof console !== 'undefined' && console.info) {
      console.info('[Portal] Admin day-ops build:', PORTAL_DAY_OPS_BUILD);
    }
  } catch (_buildLog) {}

  function hubScriptNeedsReload() {
    var tagged = document.querySelector('script[data-admin-sessions-hub="1"]');
    var build = portalHubBuildToken();
    if (tagged && build && tagged.src && tagged.src.indexOf(build) === -1) return true;
    if (!global.AdminSessionsHub) return false;
    if (
      !global.AdminSessionsHub.prototype ||
      typeof global.AdminSessionsHub.prototype.htmlOverviewFeedbackLoadHint !== 'function' ||
      typeof global.AdminSessionsHub.prototype.htmlDayBoard !== 'function'
    ) {
      return true;
    }
    return false;
  }

  function purgeHubScript() {
    try {
      var tagged = document.querySelector('script[data-admin-sessions-hub="1"]');
      if (tagged) tagged.remove();
    } catch (_rm) {}
    try {
      delete global.AdminSessionsHub;
    } catch (_del) {
      global.AdminSessionsHub = undefined;
    }
  }

  function ensureHubScript() {
    return new Promise(function (resolve, reject) {
      if (hubScriptNeedsReload()) purgeHubScript();
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
      s.src = portalHubScriptSrc();
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
    if (
      hub.tab === 'tracking' &&
      typeof hub.softRefreshOverview === 'function' &&
      typeof hub.overviewSurfaceReady === 'function' &&
      hub.overviewSurfaceReady()
    ) {
      hub.softRefreshOverview();
      return;
    }
    if (
      hub.mode === 'feedback' &&
      typeof hub.scheduleRegisterBodyPaint === 'function' &&
      typeof hub.feedbackSurfaceReady === 'function' &&
      hub.feedbackSurfaceReady()
    ) {
      hub.scheduleRegisterBodyPaint();
      return;
    }
    if (typeof hub.renderPanels === 'function' && hub.root.querySelector('.ash-panels, .ash-panels--feedback-only')) {
      hub.renderPanels();
      return;
    }
    if (typeof hub.render === 'function') {
      hub.render();
    } else if (typeof hub.renderPanels === 'function') {
      hub.renderPanels();
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
    var mode = extra.mode || 'tracking';
    return {
      escapeHtml: esc,
      mode: mode,
      externalTabs: true,
      payload: payload,
      feedbackMixAwaitingSlots: true,
      getFeedbackDayStats: cfg.getFeedbackDayStats,
      isClubClosedDay: cfg.isClubClosedDay,
      showFullWeekDayStrip: cfg.showFullWeekDayStrip,
      minSessionDate: cfg.minSessionDate || "",
      maxSessionDate: cfg.maxSessionDate || "",
      onViewFiltersChange: function (changedHub) {
        var other =
          changedHub === trackingHub
            ? feedbackHub
            : changedHub === feedbackHub
              ? trackingHub
              : null;
        syncHubViewFilters(changedHub, other);
        /* Only re-paint the sibling hub when that panel is actually visible. */
        if (
          other &&
          other.root &&
          other.root.isConnected &&
          other.root.offsetParent !== null
        ) {
          reRenderHub(other);
        }
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
    hub.feedbackNoteFilter = nf === 'relevant' ? 'relevant' : '';
    pendingFeedbackNoteFilter = undefined;
    if (hub.tab === 'positive' || hub.tab === 'relevant') hub.tab = 'feedback';
  }

  function overviewTabForC4k(tabId) {
    if (tabId === 'incidents') return 'incidents';
    if (tabId === 'absents') return 'absents';
    if (tabId === 'cancellations') return 'cancellations';
    return 'tracking';
  }

  function feedbackSetupForC4k(tabId) {
    return { tab: 'feedback', filter: '' };
  }

  function refreshHubRosterFromLiveSource() {
    if (trackingHub && typeof trackingHub.refreshRosterRowsFromResolvedSource === 'function') {
      trackingHub.refreshRosterRowsFromResolvedSource();
    }
    if (feedbackHub && typeof feedbackHub.refreshRosterRowsFromResolvedSource === 'function') {
      feedbackHub.refreshRosterRowsFromResolvedSource();
    }
  }

  async function ensureLiveRosterForHub(force) {
    if (typeof global.portalRefreshPortalRosterRowsFromSupabase !== 'function') return;
    if (
      global.portalAdminLoadHeavyScripts &&
      typeof global.portalAdminHeavyScriptsReady === 'function' &&
      !global.portalAdminHeavyScriptsReady()
    ) {
      try {
        await global.portalAdminLoadHeavyScripts(['roster']);
      } catch (_rosterScripts) {}
    }
    if (force) {
      try {
        if (global.PortalMadreFold && typeof global.PortalMadreFold.invalidateLiveMadreCache === 'function') {
          global.PortalMadreFold.invalidateLiveMadreCache();
        }
      } catch (_invMadre) {}
      try {
        global.PORTAL_ROSTER_ROWS_CACHE = null;
      } catch (_invRows) {}
    }
    var client = cfg.getClient && cfg.getClient();
    if (!client && cfg.waitForSupabaseClient) {
      try {
        client = await cfg.waitForSupabaseClient(12000);
      } catch (_waitClient) {}
    }
    if (!client) {
      console.warn('[PortalDayOps] live roster: no supabase client');
      return;
    }
    try {
      await global.portalRefreshPortalRosterRowsFromSupabase(client);
      refreshHubRosterFromLiveSource();
      try {
        global.__PORTAL_STAFF_ROSTER_LIVE_READY__ = true;
      } catch (_ready) {}
      console.log('[PortalDayOps] live MADRE + portal_roster_rows refreshed');
    } catch (eRoster) {
      console.warn('[PortalDayOps] live roster refresh failed', eRoster);
    }
  }

  function preferNonEmptyArray() {
    var best = [];
    for (var ai = 0; ai < arguments.length; ai++) {
      var a = arguments[ai];
      if (Array.isArray(a) && a.length > best.length) best = a;
    }
    return best;
  }

  function formsArrayForKind(kind) {
    if (kind === 'lead') {
      return preferNonEmptyArray(
        payload.lead_session_reports,
        global.__PORTAL_LEAD_SESSION_REPORTS__,
      );
    }
    if (kind === 'venue') return payload.venue_reviews || [];
    if (kind === 'incident') {
      return preferNonEmptyArray(
        payload.incident_reports,
        trackingHub && trackingHub.payload && trackingHub.payload.incident_reports,
        global.__PORTAL_INCIDENT_REPORTS__,
      );
    }
    if (kind === 'cancellation') {
      return preferNonEmptyArray(
        payload.cancellation_reports,
        trackingHub && trackingHub.payload && trackingHub.payload.cancellation_reports,
      );
    }
    return [];
  }

  function findFormsRow(kind, idx, rowId) {
    var arr = formsArrayForKind(kind);
    var id = String(rowId || '').trim();
    if (id) {
      for (var fi = 0; fi < arr.length; fi++) {
        if (String((arr[fi] && arr[fi].id) || '') === id) return arr[fi];
      }
    }
    var i = Number(idx);
    if (Number.isFinite(i) && i >= 0) return arr[i] || null;
    return null;
  }

  function openPortalFormsRecord(kind, idx, rowOverride, rowId) {
    kind = String(kind || '').trim();
    var i = Number(idx);
    if (!kind) return;
    var modal = global.PortalFormRecordModal;
    if (!modal) {
      console.warn('[PortalDayOps] PortalFormRecordModal missing — cannot open', kind);
      return;
    }
    var row = rowOverride || findFormsRow(kind, idx, rowId);
    if (!row) {
      console.warn(
        '[PortalDayOps] no row for forms view',
        kind,
        idx,
        rowId || '',
        'arrLen=',
        formsArrayForKind(kind).length,
      );
      return;
    }
    if (typeof modal.openWithRow === 'function') {
      modal.openWithRow(kind, row);
      return;
    }
    if (typeof modal.open === 'function' && Number.isFinite(i) && i >= 0) modal.open(kind, i);
  }

  function handlePortalFormsViewClick(ev) {
    if (!ev || !ev.target || !ev.target.closest) return false;
    var wkBtn = ev.target.closest('[data-ash-log-jump-week]');
    if (wkBtn && cfg.onLogJumpWeek) {
      ev.preventDefault();
      cfg.onLogJumpWeek(wkBtn.getAttribute('data-ash-log-jump-week'));
      return true;
    }
    var pfrmBtn = ev.target.closest('[data-pfrm-view]');
    if (pfrmBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      openPortalFormsRecord(
        pfrmBtn.getAttribute('data-pfrm-view') || pfrmBtn.getAttribute('data-portal-forms-kind'),
        pfrmBtn.getAttribute('data-portal-forms-idx'),
        null,
        pfrmBtn.getAttribute('data-portal-forms-id'),
      );
      return true;
    }
    var viewBtn = ev.target.closest(
      '.portal-forms-view-btn[data-portal-forms-kind], button[data-portal-forms-kind].portal-forms-view-btn',
    );
    if (viewBtn) {
      var kind = viewBtn.getAttribute('data-portal-forms-kind');
      var idx = parseInt(viewBtn.getAttribute('data-portal-forms-idx'), 10);
      var rowId = viewBtn.getAttribute('data-portal-forms-id');
      if (!kind) return false;
      var row = findFormsRow(kind, idx, rowId);
      if (!row) {
        console.warn(
          '[PortalDayOps] View click — missing row',
          kind,
          idx,
          rowId || '',
          formsArrayForKind(kind).length,
        );
        return false;
      }
      ev.preventDefault();
      ev.stopPropagation();
      openPortalFormsRecord(kind, idx, row, rowId);
      return true;
    }
    return false;
  }

  function ensurePortalFormsShellClicks() {
    // Document-level once — survives Sessions hub re-renders that replace .portal-day-ops-embed.
    if (!global.__PORTAL_FORMS_CLICKS_BOUND__) {
      global.__PORTAL_FORMS_CLICKS_BOUND__ = true;
      document.addEventListener(
        'click',
        function (ev) {
          handlePortalFormsViewClick(ev);
        },
        true,
      );
      document.addEventListener('dblclick', function (ev) {
        if (!ev || !ev.target || !ev.target.closest) return;
        if (ev.target.closest('[data-pfrm-view], .portal-forms-view-btn')) return;
        var row = ev.target.closest('.portal-forms-data-row[data-portal-forms-kind]');
        if (!row) return;
        // Only for lead/venue tables in the day-ops embed (incidents use hub handlers).
        if (!row.closest('.portal-day-ops-embed, #c4kHubPanelLead, #c4kHubPanelVenue')) return;
        var kind = row.getAttribute('data-portal-forms-kind');
        var idx = parseInt(row.getAttribute('data-portal-forms-idx'), 10);
        var rowId = row.getAttribute('data-portal-forms-id');
        if (!kind) return;
        ev.preventDefault();
        openPortalFormsRecord(kind, idx, findFormsRow(kind, idx, rowId), rowId);
      });
    }
    // Also bind directly on current lead/venue View buttons (mobile-safe).
    document.querySelectorAll('.portal-forms-view-btn[data-portal-forms-kind]').forEach(function (btn) {
      if (btn._portalFormsDirectBound) return;
      btn._portalFormsDirectBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var kind = btn.getAttribute('data-portal-forms-kind');
        var idx = parseInt(btn.getAttribute('data-portal-forms-idx'), 10);
        var rowId = btn.getAttribute('data-portal-forms-id');
        openPortalFormsRecord(kind, idx, findFormsRow(kind, idx, rowId), rowId);
      });
    });
  }

  async function initTrackingHub() {
    var root = document.getElementById('adminSessionsHubRoot');
    if (!root) return null;
    await ensureHubScript();
    await ensureLiveRosterForHub(false);
    if (!global.AdminSessionsHub) return null;
    if (trackingHub && trackingHub.root !== root) trackingHub = null;
    if (trackingHub && trackingHub.root === root) {
      trackingHub.refreshRosterRowsFromResolvedSource();
      trackingHub.setPayload(payload);
      applyPendingOverviewTab();
      ensureSessionFeedbackLoadedSoon();
      if (
        !root.querySelector(".ash-panels") &&
        !root.querySelector(".ash-panels--feedback-only") &&
        typeof trackingHub.render === "function"
      ) {
        trackingHub.render();
      }
      ensurePortalFormsShellClicks();
      return trackingHub;
    }
    trackingHub = await global.AdminSessionsHub.mount(root, hubMountOpts({ mode: 'tracking' }));
    ensurePortalFormsShellClicks();
    applyPendingOverviewTab();
    ensureSessionFeedbackLoadedSoon();
    return trackingHub;
  }

  async function initFeedbackHub() {
    var root = document.getElementById('adminSessionFeedbacksRoot');
    if (!root) return null;
    await ensureHubScript();
    await ensureLiveRosterForHub(false);
    if (!global.AdminSessionsHub) {
      root.innerHTML =
        '<p class="submission-state is-error"><strong>Feedback view failed to load.</strong> Refresh the page.</p>';
      return null;
    }
    if (feedbackHub && feedbackHub.root === root) {
      feedbackHub.refreshRosterRowsFromResolvedSource();
      feedbackHub.setPayload(payload, { quiet: true });
      ensureSessionFeedbackLoadedSoon();
      if (typeof feedbackHub.scheduleRegisterBodyPaint === 'function' && feedbackHub.feedbackSurfaceReady()) {
        feedbackHub.scheduleRegisterBodyPaint();
      } else if (typeof feedbackHub.render === 'function') {
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
    ensureSessionFeedbackLoadedSoon();
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

  function venueReviewIso(row) {
    return String((row && (row.review_date || row.created_at)) || '').slice(0, 10);
  }
  function venueReviewTermId(iso) {
    var d = String(iso || '').slice(0, 10);
    if (d >= '2026-09-01' && d <= '2026-12-18') return 'autumn-2026';
    if (d >= '2026-04-13' && d <= '2026-08-31') return 'summer-2026';
    if (d >= '2026-01-06' && d <= '2026-04-12') return 'spring-2026';
    return 'earlier';
  }
  function venueReviewTermLabel(id) {
    if (id === 'autumn-2026') return 'Autumn 2026';
    if (id === 'summer-2026') return 'Summer 2026';
    if (id === 'spring-2026') return 'Spring 2026';
    if (id === 'earlier') return 'Earlier';
    return 'All terms';
  }
  function venueReviewKindKey(row) {
    var k = String((row && row.opening_or_closing) || '').trim().toLowerCase();
    if (k === 'open' || k === 'opening') return 'Opening';
    if (k === 'close' || k === 'closing') return 'Closing';
    return '';
  }
  function venueReviewLondonTodayIso() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (_tz) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function venueReviewDayFinished(row) {
    var day = venueReviewIso(row);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
    return day < venueReviewLondonTodayIso();
  }
  function venueReviewAdminClient() {
    var c = cfg.getClient && cfg.getClient();
    if (c && c.storage) return c;
    var box = global.__PORTAL_SUPABASE__;
    return box && box.client ? box.client : null;
  }
  function venueAdminVideoMime(mime) {
    var raw = String(mime || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (
      raw === 'video/webm' ||
      raw === 'video/mp4' ||
      raw === 'video/quicktime' ||
      raw === 'video/ogg' ||
      raw === 'video/x-matroska'
    ) {
      return raw;
    }
    if (raw.indexOf('quicktime') >= 0 || raw.indexOf('mov') >= 0) return 'video/quicktime';
    if (raw.indexOf('mp4') >= 0 || raw.indexOf('m4v') >= 0) return 'video/mp4';
    if (raw.indexOf('ogg') >= 0) return 'video/ogg';
    if (raw.indexOf('matroska') >= 0 || raw.indexOf('mkv') >= 0) return 'video/x-matroska';
    return 'video/webm';
  }
  function venueAdminVideoExt(mime) {
    var m = String(mime || '').toLowerCase();
    if (m.indexOf('mp4') >= 0 || m.indexOf('m4v') >= 0) return 'mp4';
    if (m.indexOf('quicktime') >= 0 || m.indexOf('mov') >= 0) return 'mov';
    if (m.indexOf('ogg') >= 0) return 'ogv';
    return 'webm';
  }
  function ensureVenueAdminVideoInput() {
    var inp = document.getElementById('portalVenueAdminVideoFile');
    if (inp) return inp;
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'portalVenueAdminVideoFile';
    inp.accept = 'video/*,video/mp4,video/quicktime,.mov,.mp4,.webm';
    inp.setAttribute('hidden', 'hidden');
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      var reviewId = String(inp.getAttribute('data-review-id') || '').trim();
      try {
        inp.value = '';
      } catch (_clr) {}
      if (!file || !reviewId) return;
      void uploadVenueReviewAdminVideo(reviewId, file);
    });
    return inp;
  }
  function patchVenueReviewVideoLocal(reviewId, path, mime) {
    (payload.venue_reviews || []).forEach(function (r) {
      if (String((r && r.id) || '') === reviewId) {
        r.video_storage_path = path;
        r.video_mime_type = mime;
      }
    });
    try {
      if (Array.isArray(window.__PORTAL_VENUE_REVIEWS__)) {
        window.__PORTAL_VENUE_REVIEWS__.forEach(function (r) {
          if (String((r && r.id) || '') === reviewId) {
            r.video_storage_path = path;
            r.video_mime_type = mime;
          }
        });
      }
    } catch (_cache) {}
  }
  async function uploadVenueReviewAdminVideo(reviewId, file) {
    var MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
      alert('Video is too large (max 50 MB).');
      return;
    }
    var client = venueReviewAdminClient();
    if (!client || !client.storage) {
      alert('Sign in required to upload venue videos.');
      return;
    }
    var row = (payload.venue_reviews || []).filter(function (r) {
      return String((r && r.id) || '') === reviewId;
    })[0];
    if (!row) {
      alert('Could not find that venue review.');
      return;
    }
    if (!venueReviewDayFinished(row)) {
      alert('This day has not finished yet. Attach the walkthrough after closing.');
      return;
    }
    var mime = venueAdminVideoMime(file.type || 'video/mp4');
    var ext = venueAdminVideoExt(mime);
    var day = String(row.review_date || '').slice(0, 10) || 'undated';
    var kind = venueReviewKindKey(row) === 'Closing' ? 'close' : 'open';
    var uid = String(row.submitted_by_user_id || 'admin').trim() || 'admin';
    var path = uid + '/' + day + '/' + kind + '_admin_' + String(Date.now()) + '.' + ext;
    var uploadBlob = String(file.type || '').indexOf(';') >= 0 ? new Blob([file], { type: mime }) : file;
    venueAdminVideoUploading[reviewId] = true;
    try {
      await renderLeadVenueTables();
      var up = await client.storage.from('venue-review-videos').upload(path, uploadBlob, {
        contentType: mime,
        upsert: false
      });
      if (up.error) throw up.error;
      var patch = await client
        .from('venue_reviews')
        .update({
          video_storage_path: path,
          video_mime_type: mime
        })
        .eq('id', reviewId)
        .select('id, video_storage_path, video_mime_type')
        .maybeSingle();
      if (patch.error) throw patch.error;
      if (!patch.data || !patch.data.video_storage_path) {
        throw new Error('Saved the file but could not attach it to this review. Try again.');
      }
      patchVenueReviewVideoLocal(reviewId, path, mime);
    } catch (err) {
      console.error(err);
      var msg = String((err && err.message) || err || '');
      if (/mime|not allowed|invalid|content type/i.test(msg)) {
        msg = 'This video format was not accepted. Use MP4 or MOV from Photos.';
      }
      alert('Could not attach the video.\n' + msg);
    } finally {
      delete venueAdminVideoUploading[reviewId];
      await renderLeadVenueTables();
    }
  }
  function venueReviewPhotoPaths(r) {
    var raw = r && r.photo_storage_paths;
    if (Array.isArray(raw)) return raw.filter(function (p) { return String(p || '').trim(); });
    if (typeof raw === 'string') {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(function (p) { return String(p || '').trim(); });
        }
      } catch (_e) {}
    }
    return [];
  }
  function venueReviewVideoCellHtml(r) {
    if (!venueReviewDayFinished(r)) return '—';
    var reviewId = String((r && r.id) || '').trim();
    var videoPath = String((r && r.video_storage_path) || '').trim();
    var photoPaths = venueReviewPhotoPaths(r);
    var uploading = !!(reviewId && venueAdminVideoUploading[reviewId]);
    var playBtn = videoPath
      ? '<button type="button" class="portal-forms-view-btn" data-venue-video-path="' +
        esc(videoPath) +
        '" aria-label="Play venue walkthrough video">Play video</button>'
      : '';
    var photoBtns = photoPaths
      .map(function (p, i) {
        return (
          '<button type="button" class="portal-forms-view-btn" data-venue-video-path="' +
          esc(String(p)) +
          '" aria-label="Open venue photo ' +
          (i + 1) +
          '">Photo ' +
          (i + 1) +
          '</button>'
        );
      })
      .join('');
    var uploadLabel = uploading ? 'Uploading...' : videoPath ? 'Replace video' : 'Upload video';
    var uploadBtn = reviewId
      ? '<button type="button" class="portal-forms-view-btn" data-venue-video-upload="' +
        esc(reviewId) +
        '" aria-label="' +
        (videoPath ? 'Replace' : 'Upload') +
        ' venue walkthrough video"' +
        (uploading ? ' disabled' : '') +
        '>' +
        uploadLabel +
        '</button>'
      : '';
    if (!playBtn && !uploadBtn && !photoBtns) return '—';
    return '<div class="portal-venue-video-actions">' + playBtn + photoBtns + uploadBtn + '</div>';
  }
  function uniqueVenueFilterValues(vals) {
    var seen = {};
    var out = [];
    (vals || []).forEach(function (raw) {
      var s = String(raw || '').trim();
      if (!s || s === '—') return;
      var key = s.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(s);
    });
    out.sort(function (a, b) {
      return a.localeCompare(b, 'en', { sensitivity: 'base' });
    });
    return out;
  }
  function venueReviewSelectHtml(id, label, value, options, allLabel) {
    var html =
      '<label class="portal-venue-review-filter">' +
      esc(label) +
      '<select id="' +
      esc(id) +
      '">' +
      '<option value="">' +
      esc(allLabel) +
      '</option>';
    (options || []).forEach(function (opt) {
      var v = String(opt.value != null ? opt.value : opt);
      var lab = String(opt.label != null ? opt.label : v);
      html +=
        '<option value="' +
        esc(v) +
        '"' +
        (value === v ? ' selected' : '') +
        '>' +
        esc(lab) +
        '</option>';
    });
    html += '</select></label>';
    return html;
  }
  function venueReviewRowMatchesFilters(row) {
    var venueWant = String(venueReviewFilters.venue || '').trim().toLowerCase();
    var staffWant = String(venueReviewFilters.staff || '').trim().toLowerCase();
    var termWant = String(venueReviewFilters.term || '').trim();
    var kindWant = String(venueReviewFilters.kind || '').trim();
    if (venueWant) {
      if (String((row && row.venue) || '').trim().toLowerCase() !== venueWant) return false;
    }
    if (staffWant) {
      if (String((row && row.submitted_by_name) || '').trim().toLowerCase() !== staffWant) return false;
    }
    if (termWant && venueReviewTermId(venueReviewIso(row)) !== termWant) return false;
    if (kindWant && venueReviewKindKey(row) !== kindWant) return false;
    return true;
  }
  function paintVenueReviewFilters(allRows) {
    var host = document.getElementById('portalFormsVenueFilters');
    if (!host) return;
    var venues = uniqueVenueFilterValues(
      (allRows || []).map(function (r) {
        return r && r.venue;
      })
    ).map(function (v) {
      return { value: v, label: v };
    });
    var staff = uniqueVenueFilterValues(
      (allRows || []).map(function (r) {
        return r && r.submitted_by_name;
      })
    ).map(function (v) {
      return { value: v, label: v };
    });
    var termIds = {};
    (allRows || []).forEach(function (r) {
      termIds[venueReviewTermId(venueReviewIso(r))] = true;
    });
    var termOrder = ['autumn-2026', 'summer-2026', 'spring-2026', 'earlier'];
    var terms = termOrder
      .filter(function (id) {
        return termIds[id];
      })
      .map(function (id) {
        return { value: id, label: venueReviewTermLabel(id) };
      });
    var kinds = [
      { value: 'Opening', label: 'Opening' },
      { value: 'Closing', label: 'Closing' }
    ];
    host.innerHTML =
      venueReviewSelectHtml('portalVenueFilterVenue', 'Venue', venueReviewFilters.venue, venues, 'Any venue') +
      venueReviewSelectHtml('portalVenueFilterStaff', 'Instructor', venueReviewFilters.staff, staff, 'Any instructor') +
      venueReviewSelectHtml('portalVenueFilterTerm', 'Term', venueReviewFilters.term, terms, 'All terms') +
      venueReviewSelectHtml('portalVenueFilterKind', 'Open / close', venueReviewFilters.kind, kinds, 'Opening or closing') +
      '<p class="portal-venue-review-filter-count" id="portalFormsVenueFilterCount"></p>';
    if (!host._venueFilterBound) {
      host._venueFilterBound = true;
      host.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t || t.tagName !== 'SELECT') return;
        if (t.id === 'portalVenueFilterVenue') venueReviewFilters.venue = String(t.value || '');
        if (t.id === 'portalVenueFilterStaff') venueReviewFilters.staff = String(t.value || '');
        if (t.id === 'portalVenueFilterTerm') venueReviewFilters.term = String(t.value || '');
        if (t.id === 'portalVenueFilterKind') venueReviewFilters.kind = String(t.value || '');
        void renderLeadVenueTables();
      });
    }
  }
  async function renderLeadVenueTables() {
    var leadTbody = document.getElementById('portalFormsLeadTbody');
    var venueTbody = document.getElementById('portalFormsVenueTbody');
    if (!leadTbody && !venueTbody) return;
    var lead = payload.lead_session_reports || [];
    var venue = (payload.venue_reviews || []).slice().sort(function (a, b) {
      var da = venueReviewIso(a);
      var db = venueReviewIso(b);
      if (da !== db) return db.localeCompare(da);
      var ta = String((a && a.review_time) || '');
      var tb = String((b && b.review_time) || '');
      if (ta && tb && ta !== tb) return ta.localeCompare(tb);
      var ka = venueReviewKindKey(a) === 'Closing' ? 1 : venueReviewKindKey(a) === 'Opening' ? 0 : 2;
      var kb = venueReviewKindKey(b) === 'Closing' ? 1 : venueReviewKindKey(b) === 'Opening' ? 0 : 2;
      if (ka !== kb) return ka - kb;
      return String((a && a.submitted_by_name) || '').localeCompare(
        String((b && b.submitted_by_name) || ''),
        'en',
        { sensitivity: 'base' }
      );
    });
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
        try {
          global.__PORTAL_LEAD_SESSION_REPORTS__ = lead;
        } catch (_cacheLead) {}
        leadTbody.innerHTML = lead
          .map(function (r, i) {
            var who = esc(cellText(r.submitted_by_name));
            var svcSub = portalFormsLeadServiceSubLine(r);
            var svcTitle = String(r.service || '') + (svcSub ? ' · ' + svcSub : '');
            var rid = esc(String(r.id || ''));
            return (
              '<tr class="portal-forms-data-row" data-portal-forms-kind="lead" data-portal-forms-idx="' +
              i +
              '" data-portal-forms-id="' +
              rid +
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
              '<td class="col-actions"><button type="button" class="portal-forms-view-btn" data-pfrm-view="lead" data-portal-forms-kind="lead" data-portal-forms-idx="' +
              i +
              '" data-portal-forms-id="' +
              rid +
              '" aria-label="View lead report">View</button></td>' +
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
      paintVenueReviewFilters(venue);
      var filteredVenue = venue.filter(venueReviewRowMatchesFilters);
      var countEl = document.getElementById('portalFormsVenueFilterCount');
      if (countEl) {
        countEl.textContent =
          filteredVenue.length === venue.length
            ? String(venue.length) + ' reviews'
            : String(filteredVenue.length) + ' of ' + String(venue.length) + ' reviews';
      }
      if (!venue.length) {
        venueTbody.innerHTML =
          '<tr><td colspan="8"><div class="submission-state">No venue reviews yet.</div></td></tr>';
      } else if (!filteredVenue.length) {
        venueTbody.innerHTML =
          '<tr><td colspan="8"><div class="submission-state">No reviews match these filters.</div></td></tr>';
      } else {
        venueTbody.innerHTML = filteredVenue
          .map(function (r) {
            var videoCell = venueReviewVideoCellHtml(r);
            var kind = venueReviewKindKey(r) || '—';
            return (
              '<tr class="portal-forms-static-row">' +
              '<td class="cell-wrap col-venue-name">' +
              esc(cellText(r.venue)) +
              '</td>' +
              '<td>' +
              esc(cellText(r.review_date)) +
              '</td>' +
              '<td class="cell-wrap col-submitted-by"><div class="portal-forms-cell-main">' +
              esc(cellText(r.submitted_by_name)) +
              '</div></td>' +
              '<td>' +
              esc(kind) +
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
              '<td>' +
              videoCell +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
      }
    }
    ensurePortalFormsShellClicks();
    try {
      if (venueTbody && !venueTbody.__venueVideoBound) {
        venueTbody.__venueVideoBound = true;
        venueTbody.addEventListener('click', function (ev) {
          var uploadBtn =
            ev.target && ev.target.closest ? ev.target.closest('[data-venue-video-upload]') : null;
          if (uploadBtn) {
            ev.preventDefault();
            if (uploadBtn.disabled) return;
            var reviewId = String(uploadBtn.getAttribute('data-venue-video-upload') || '').trim();
            if (!reviewId || venueAdminVideoUploading[reviewId]) return;
            var inp = ensureVenueAdminVideoInput();
            inp.setAttribute('data-review-id', reviewId);
            try {
              inp.click();
            } catch (_click) {}
            return;
          }
          var btn = ev.target && ev.target.closest ? ev.target.closest('[data-venue-video-path]') : null;
          if (!btn) return;
          ev.preventDefault();
          var path = String(btn.getAttribute('data-venue-video-path') || '').trim();
          if (!path) return;
          void (async function () {
            try {
              var client = venueReviewAdminClient();
              if (!client || !client.storage) {
                alert('Sign in required to play venue videos.');
                return;
              }
              var signed = await client.storage.from('venue-review-videos').createSignedUrl(path, 3600);
              if (signed.error || !(signed.data && signed.data.signedUrl)) {
                throw signed.error || new Error('Could not create play link');
              }
              window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer');
            } catch (errPlay) {
              console.error(errPlay);
              alert('Could not open the venue video.');
            }
          })();
        });
      }
    } catch (_vidBind) {}
  }

  global.PortalDayOps = {
    configure: function (c) {
      cfg = Object.assign({}, cfg, c || {});
      if (trackingHub) trackingHub.opts.getFeedbackDayStats = cfg.getFeedbackDayStats;
      if (feedbackHub) feedbackHub.opts.getFeedbackDayStats = cfg.getFeedbackDayStats;
    },
    openFormsRecord: function (kind, idx, rowOverride, rowId) {
      openPortalFormsRecord(kind, idx, rowOverride, rowId);
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
    ensurePayload: function (opts) {
      opts = opts || {};
      var forceReload = !!(opts && opts.force);
      if (loadInFlight) return loadInFlight;
      var skipEdgeEarly = !!(cfg && cfg.skipAdminFormsEdge);
      /* Re-entering Sessions overview must not wipe settled live rows (that flashes foto1 → foto2). */
      if (
        !forceReload &&
        skipEdgeEarly &&
        payload.session_feedback_loaded === true &&
        Array.isArray(payload.session_feedback) &&
        payload.session_feedback.length > 0
      ) {
        syncScheduleOverridesIntoPayload();
        portalDayOpsRenderLiveLoadStatus();
        setStatus('');
        if (!global.__PORTAL_DAY_OPS_ENRICH__ && !global.__PORTAL_DAY_OPS_SOFT_REFRESH__) {
          var softPromise = fetchOverviewSupabaseExtras()
            .then(function (partial) {
              applyPayload(partial);
              mergePortalVenueIntoPayload();
              portalDayOpsAfterFeedbackPayloadMerge();
              return partial;
            })
            .catch(function (softErr) {
              dayOpsDebug('[PortalDayOps] soft refresh failed', softErr);
              return null;
            })
            .finally(function () {
              if (global.__PORTAL_DAY_OPS_SOFT_REFRESH__ === softPromise) {
                global.__PORTAL_DAY_OPS_SOFT_REFRESH__ = null;
              }
            });
          global.__PORTAL_DAY_OPS_SOFT_REFRESH__ = softPromise;
        }
        return Promise.resolve(payload);
      }
      loadInFlight = (async function () {
        if (
          global.portalAdminLoadHeavyScripts &&
          typeof global.portalAdminHeavyScriptsReady === 'function' &&
          !global.portalAdminHeavyScriptsReady()
        ) {
          await global.portalAdminLoadHeavyScripts(['roster']);
        }
        var skipEdge = !!(cfg && cfg.skipAdminFormsEdge);
        var edge = null;
        if (!skipEdge) {
          edge = await fetchEdgePayload();
          if (edge && edge.data) {
            applyPayload(edge.data);
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
          if (cfg.buildVenueFromPortal) {
            quick.venue_reviews = cfg.buildVenueFromPortal() || [];
          }
          applyPayload(quick);
          syncScheduleOverridesIntoPayload();
          portalDayOpsRenderLiveLoadStatus();
          setStatus('');
          var enrichPromise = fetchOverviewSupabaseExtras()
            .then(function (partial) {
              applyPayload(partial);
              mergePortalVenueIntoPayload();
              portalDayOpsAfterFeedbackPayloadMerge();
              dayOpsDebug(
                '[PortalDayOps] session_feedback ready:',
                (payload.session_feedback || []).length,
                'rows'
              );
              return partial;
            })
            .catch(function (bgErr) {
              dayOpsDebug('[PortalDayOps] overview enrich failed', bgErr);
            })
            .finally(function () {
              if (global.__PORTAL_DAY_OPS_ENRICH__ === enrichPromise) {
                global.__PORTAL_DAY_OPS_ENRICH__ = null;
              }
            });
          global.__PORTAL_DAY_OPS_ENRICH__ = enrichPromise;
          startDeferredSupabaseExtras();
          void ensureLiveRosterForHub(false);
          return payload;
        }
        var fb = await fetchFallbackSupabase();
        applyPayload(fb);
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
    refreshTab: async function (tabId, options) {
      try {
        if (options && options.force && cfg.invalidateLiveCaches) {
          try {
            cfg.invalidateLiveCaches();
          } catch (_inv) {}
        }
        await global.PortalDayOps.ensurePayload({ force: !!(options && options.force) });
        await ensureLiveRosterForHub(!!(options && options.force));
        if (tabId === 'overview' || tabId === 'incidents' || tabId === 'absents' || tabId === 'cancellations') {
          pendingOverviewTab = overviewTabForC4k(tabId);
          var th = await initTrackingHub();
          if (th && feedbackHub) syncHubViewFilters(feedbackHub, th);
          if (th) {
            applyPendingOverviewTab();
            reRenderHub(th);
          }
          try {
            var enrichWait = global.__PORTAL_DAY_OPS_ENRICH__;
            if (enrichWait) {
              await promiseWithTimeout(enrichWait, ENRICH_WAIT_MS, null);
              if (th && typeof th.setPayload === 'function') {
                /* Quiet: keep Overview stable; feedback land on Register hub only. */
                th.setPayload(payload, { quiet: true });
              }
            }
            if (tabId === 'incidents' || tabId === 'cancellations' || tabId === 'lead' || tabId === 'venue') {
              var deferWait = global.__PORTAL_DAY_OPS_DEFER__;
              if (!deferWait && cfg.fetchIncidentReports) {
                deferWait = startDeferredSupabaseExtras();
              }
              if (deferWait) {
                await promiseWithTimeout(deferWait, ENRICH_WAIT_MS, null);
                if (th && typeof th.setPayload === 'function') {
                  th.setPayload(payload, { quiet: true });
                }
                if (tabId !== 'overview') reRenderHub(th);
              }
            }
          } catch (_enrichWait) {}
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
          function paintFeedbackHubFromPayload() {
            if (!fh) return;
            if (typeof fh.setPayload === 'function') fh.setPayload(payload, { quiet: true });
            fh.tab = fs.tab;
            fh.feedbackNoteFilter = fs.filter;
            applyPendingFeedbackNav(fh);
            reRenderHub(fh);
          }
          try {
            var enrichWaitFb = global.__PORTAL_DAY_OPS_ENRICH__;
            if (enrichWaitFb && typeof enrichWaitFb.then === 'function') {
              /* Do not block Register on enrich — late payload still re-paints the table body. */
              enrichWaitFb.then(function () {
                paintFeedbackHubFromPayload();
              }).catch(function () {});
            }
          } catch (_enrichWaitFb) {}
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
          if (tabId === 'venue' && cfg.fetchVenueReviews) {
            try {
              var deferWait = global.__PORTAL_DAY_OPS_DEFER__;
              if (deferWait && typeof deferWait.then === 'function') {
                await promiseWithTimeout(deferWait, 8000, null);
              }
            } catch (_deferVenue) {}
            try {
              var liveVenue = (await cfg.fetchVenueReviews()) || [];
              if (liveVenue.length) payload.venue_reviews = liveVenue;
              mergePortalVenueIntoPayload();
            } catch (eVenueTab) {
              console.debug('[PortalDayOps] fetchVenueReviews', eVenueTab);
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
          window.__PORTAL_STAFF_UNAVAILABILITY__ = null;
          window.__PORTAL_VENUE_REVIEWS__ = null;
        }
      } catch (_eOv) {}
      try {
        if (typeof window.portalInvalidateAdminFeedbackStatusCache === 'function') {
          window.portalInvalidateAdminFeedbackStatusCache();
        }
      } catch (_e) {}
    },
    refreshSessionFeedback: function () {
      return refreshSessionFeedbackLive();
    },
    adoptSessionFeedback: adoptSessionFeedbackRows,
    ensureLiveRoster: function (force) {
      return ensureLiveRosterForHub(!!force);
    }
  };

  global.portalAdminAdoptSessionFeedback = adoptSessionFeedbackRows;

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('portal:supabase-ready', function () {
      if (!cfg.fetchSessionFeedback) return;
      if (payload.session_feedback && payload.session_feedback.length) return;
      void refreshSessionFeedbackLive();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
