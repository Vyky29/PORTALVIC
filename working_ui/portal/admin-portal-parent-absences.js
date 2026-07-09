/**
 * Admin — parent Absent reports (Missed → proof → validate → credit/refund/makeup).
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) {
      return String(s == null ? '' : s);
    },
    toast: function () {},
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return '';
    },
    getAnonKey: function () {
      return '';
    }
  };

  var state = { filter: 'pending_review', reports: [], meta: {} };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || '').replace(/\/$/, '');
  }

  async function portalAuthToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        var p = iso.split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function statusChip(status) {
    var s = String(status || '');
    var tone = 'info';
    if (s === 'pending_review') tone = 'pend';
    else if (s === 'excused') tone = 'ok';
    else if (s === 'rejected' || s === 'expired') tone = 'warn';
    else if (s === 'missed') tone = 'info';
    else if (s === 'noted') tone = 'ok';
    return '<span class="chip chip--' + tone + '">' + esc(s.replace(/_/g, ' ')) + '</span>';
  }

  async function fetchReports(status) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired', reports: [] };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-parent-absence-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify({ status: status || 'all', limit: 150 })
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed', reports: [] };
    }
    return { reports: j.reports || [], meta: j.meta || {} };
  }

  async function decide(reportId, action, outcome, notes, preferredVenue) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-parent-absence-decide', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify({
        report_id: reportId,
        action: action,
        outcome: outcome || 'none',
        notes: notes || '',
        preferred_venue: preferredVenue || ''
      })
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed', message: (j && j.message) || '' };
    }
    return { report: j.report, grant: j.grant };
  }

  function rowHtml(r) {
    var proof = r.proof_signed_url
      ? '<a href="' + esc(r.proof_signed_url) + '" target="_blank" rel="noopener">Open proof</a>'
      : '<span class="muted">No proof</span>';
    var canDecide = r.status === 'pending_review' || (r.status === 'missed' && r.proof_storage_path);
    var canGrantMakeup =
      (r.status === 'missed' || r.status === 'expired' || r.status === 'rejected') && !r.proof_storage_path;
    var actions = '';
    if (canDecide) {
      actions =
        '<div class="pp-admin-absence-acts" style="display:flex;flex-wrap:wrap;gap:6px;min-width:0">' +
        '<select data-absence-outcome="' +
        esc(r.id) +
        '" aria-label="Outcome">' +
        '<option value="credit">Credit</option>' +
        '<option value="refund">Refund</option>' +
        '<option value="makeup">Makeup</option>' +
        '<option value="none">None</option>' +
        '</select>' +
        '<button type="button" class="btn btn--sm btn--primary" data-absence-approve="' +
        esc(r.id) +
        '">Approve</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-absence-reject="' +
        esc(r.id) +
        '">Reject</button>' +
        '</div>';
    } else if (canGrantMakeup) {
      actions =
        '<button type="button" class="btn btn--sm btn--sec" data-absence-grant-makeup="' +
        esc(r.id) +
        '">Grant makeup</button>' +
        '<span class="muted" style="display:block;margin-top:4px;font-size:11px;overflow-wrap:break-word">No valid proof — venue-scoped waiting list</span>';
    } else {
      actions =
        '<span class="muted">' +
        esc(r.outcome ? 'Outcome: ' + r.outcome : r.review_notes || '—') +
        '</span>';
    }
    return (
      '<tr>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(r.participant_display || '—') +
      '</strong></td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(r.session_date)) +
      '</td>' +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(r.service_label || '—') +
      (r.session_time ? ' · ' + esc(r.session_time) : '') +
      '</td>' +
      '<td style="min-width:0;max-width:12rem;overflow-wrap:break-word">' +
      esc(r.reason_text || '—') +
      '</td>' +
      '<td>' +
      statusChip(r.status) +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(r.proof_deadline)) +
      '</td>' +
      '<td>' +
      proof +
      '</td>' +
      '<td style="min-width:0">' +
      actions +
      '</td>' +
      '</tr>'
    );
  }

  function tableHtml(reports) {
    if (!reports.length) {
      return '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">No reports in this filter.</p>';
    }
    return (
      '<div class="card" style="margin-top:0"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Session</th><th>Service</th><th>Note</th><th>Status</th><th>Proof deadline</th><th>Proof</th><th>Validate</th>' +
      '</tr></thead><tbody>' +
      reports.map(rowHtml).join('') +
      '</tbody></table></div></div>'
    );
  }

  function viewHtml() {
    return (
      '<div class="portal-parent-absences-embed">' +
      '<h1 class="page-title">Parent absents (proof queue)</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">Parents report <strong>Absent</strong> → Missed session. Proof upload within <strong>2 weeks</strong> of the session date. Admin must always validate before credit, refund, or makeup. After the deadline, parents cannot upload and must contact the office.</p>' +
      '<div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-absence-filter="pending_review">Pending proof</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="missed">Missed (no proof)</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="all">All</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="excused">Excused</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentAbsenceRefresh">Refresh</button>' +
      '<span class="chip chip--pend" id="portalParentAbsenceMeta"></span>' +
      '</div>' +
      '<div id="portalParentAbsenceHost"><p class="muted">Loading…</p></div>' +
      '</div>'
    );
  }

  async function renderHost(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var res = await fetchReports(state.filter);
    if (res.error) {
      hostEl.innerHTML =
        '<p class="muted" style="color:var(--danger,#c62828)">Could not load (' +
        esc(res.error) +
        '). Apply the absence SQL migration and deploy the edge functions if this is new.</p>';
      return;
    }
    state.reports = res.reports || [];
    state.meta = res.meta || {};
    var metaEl = global.document.getElementById('portalParentAbsenceMeta');
    if (metaEl) {
      metaEl.textContent =
        String(state.meta.pending_review || 0) +
        ' pending · ' +
        String(state.meta.missed_open || 0) +
        ' missed open';
    }
    var metaEmbed = global.document.getElementById('portalParentAbsenceMetaEmbed');
    if (metaEmbed) {
      metaEmbed.textContent =
        String(state.meta.pending_review || 0) +
        ' pending · ' +
        String(state.meta.missed_open || 0) +
        ' missed';
    }
    hostEl.innerHTML = tableHtml(state.reports);
    bindRowActions(hostEl);
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-absence-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-approve');
        var sel = hostEl.querySelector('[data-absence-outcome="' + id + '"]');
        var outcome = sel ? sel.value : 'none';
        var notes = global.prompt('Optional notes for the family / file:', '') || '';
        var venue = '';
        if (outcome === 'makeup') {
          venue = global.prompt('Preferred venue for makeup offers (required):', '') || '';
          if (!String(venue).trim()) {
            cfg.toast('Venue required for makeup grants', 'error');
            return;
          }
        }
        btn.disabled = true;
        void decide(id, 'approve', outcome, notes, venue).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Approve failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Excused — outcome: ' + outcome, 'ok');
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-absence-reject]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-reject');
        var notes = global.prompt('Reason for rejection (shown to parent):', 'Proof not accepted') || '';
        btn.disabled = true;
        void decide(id, 'reject', 'none', notes).then(function (r) {
          if (r.error) {
            cfg.toast(r.error || 'Reject failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Rejected', 'ok');
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-absence-grant-makeup]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-grant-makeup');
        var venue = global.prompt('Preferred venue (offers stay at this centre):', '') || '';
        if (!String(venue).trim()) {
          cfg.toast('Venue required', 'error');
          return;
        }
        var notes = global.prompt('Optional notes:', '') || '';
        btn.disabled = true;
        void decide(id, 'grant_makeup', 'makeup', notes, venue).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Grant failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast(r.already ? 'Makeup grant already exists' : 'Makeup grant added to venue waiting list', 'ok');
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
  }

  function bindModule() {
    var host = global.document.getElementById('portalParentAbsenceHost');
    if (host) void renderHost(host);
    var refresh = global.document.getElementById('portalParentAbsenceRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalParentAbsenceHost'));
      });
    }
    global.document.querySelectorAll('[data-absence-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-absence-filter') || 'all';
        global.document.querySelectorAll('[data-absence-filter]').forEach(function (b) {
          var on = b.getAttribute('data-absence-filter') === state.filter;
          b.classList.toggle('btn--ghost', !on);
        });
        void renderHost(global.document.getElementById('portalParentAbsenceHost'));
      });
    });
  }

  /** Embed block for Absents & credits page (above workbook queue). */
  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Parent portal — proof validation</h3>' +
      '<span class="chip chip--pend" id="portalParentAbsenceMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Missed sessions reported in the parent app. Validate proof within the family&apos;s 2-week window; after that they must contact admin.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-absence-filter="pending_review">Pending proof</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="missed">Missed</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="noted">Noted</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="all">All</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentAbsenceRefreshEmbed">Refresh</button>' +
      '</div>' +
      '<div id="portalParentAbsenceHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindEmbed() {
    state.filter = 'pending_review';
    bindModule();
    var meta = global.document.getElementById('portalParentAbsenceMetaEmbed');
    var refresh = global.document.getElementById('portalParentAbsenceRefreshEmbed');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalParentAbsenceHost')).then(function () {
          if (meta) {
            meta.textContent =
              String(state.meta.pending_review || 0) +
              ' pending · ' +
              String(state.meta.missed_open || 0) +
              ' missed';
          }
        });
      });
    }
    void renderHost(global.document.getElementById('portalParentAbsenceHost')).then(function () {
      if (meta) {
        meta.textContent =
          String(state.meta.pending_review || 0) +
          ' pending · ' +
          String(state.meta.missed_open || 0) +
          ' missed';
      }
    });
  }

  global.PortalParentAbsences = {
    configure: configure,
    viewHtml: viewHtml,
    embedHtml: embedHtml,
    bindModule: bindModule,
    bindEmbed: bindEmbed,
    fetchReports: fetchReports
  };
})(typeof window !== 'undefined' ? window : globalThis);
