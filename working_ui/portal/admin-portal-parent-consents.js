/**
 * Admin — parent photo/marketing + medication-at-centre consents.
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

  var state = { filter: 'pending', q: '', entries: [], meta: {} };

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
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (_e) {
      return String(iso);
    }
  }

  async function api(body) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-parent-consents-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify(body || {})
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed' };
    }
    return j;
  }

  function photoLabel(e) {
    if (!e.photo_done) return { text: 'Pending', tone: 'pend' };
    if (e.photo_consent === 'yes') return { text: 'Marketing OK', tone: 'ok' };
    return { text: 'Family only', tone: 'info' };
  }

  function medLabel(e) {
    if (!e.medication_done) return { text: 'Pending', tone: 'pend' };
    if (e.medication_at_centre_needed === 'yes') return { text: 'Meds at centre', tone: 'warn' };
    return { text: 'No meds', tone: 'ok' };
  }

  function emergencyLabel(e) {
    if (!e.emergency_done) return { text: 'Pending', tone: 'pend' };
    if (e.emergency_treatment_consent === 'yes') return { text: 'Treat OK', tone: 'ok' };
    return { text: 'Wait for carer', tone: 'info' };
  }

  function rowHtml(e) {
    var photo = photoLabel(e);
    var med = medLabel(e);
    var emergency = emergencyLabel(e);
    var medDetails =
      e.medication_at_centre_needed === 'yes' && e.medication_at_centre_details
        ? '<div class="muted" style="margin-top:4px;font-size:12px;max-width:18rem;overflow-wrap:break-word">' +
          esc(e.medication_at_centre_details) +
          '</div>'
        : '';
    var emergencyContact =
      e.emergency_done && (e.emergency_contact_name || e.emergency_contact_phone)
        ? '<div class="muted" style="margin-top:4px;font-size:12px;max-width:16rem;overflow-wrap:break-word">' +
          esc(e.emergency_contact_name || '') +
          (e.emergency_contact_phone ? ' · ' + esc(e.emergency_contact_phone) : '') +
          '</div>'
        : '';
    return (
      '<tr>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(e.participant_display || '—') +
      '</strong>' +
      (e.parent_display
        ? '<div class="muted" style="font-size:12px;overflow-wrap:break-word">' +
          esc(e.parent_display) +
          '</div>'
        : '') +
      '</td>' +
      '<td><span class="chip chip--' +
      photo.tone +
      '">' +
      esc(photo.text) +
      '</span>' +
      (e.photo_done
        ? '<div class="muted" style="margin-top:4px;font-size:12px;white-space:nowrap">' +
          esc(formatDate(e.photo_consent_signed_at)) +
          (e.photo_consent_signed_by_name ? ' · ' + esc(e.photo_consent_signed_by_name) : '') +
          '</div>'
        : '') +
      '</td>' +
      '<td><span class="chip chip--' +
      med.tone +
      '">' +
      esc(med.text) +
      '</span>' +
      medDetails +
      (e.medication_done
        ? '<div class="muted" style="margin-top:4px;font-size:12px;white-space:nowrap">' +
          esc(formatDate(e.medication_at_centre_signed_at)) +
          (e.medication_at_centre_signed_by_name
            ? ' · ' + esc(e.medication_at_centre_signed_by_name)
            : '') +
          '</div>'
        : '') +
      '</td>' +
      '<td><span class="chip chip--' +
      emergency.tone +
      '">' +
      esc(emergency.text) +
      '</span>' +
      emergencyContact +
      (e.emergency_done
        ? '<div class="muted" style="margin-top:4px;font-size:12px;white-space:nowrap">' +
          esc(formatDate(e.emergency_treatment_signed_at)) +
          '</div>'
        : '') +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(e.updated_at)) +
      '</td>' +
      '</tr>'
    );
  }

  function tableHtml(entries) {
    if (!entries || !entries.length) {
      return '<p class="muted" style="margin:0">No participants match this filter.</p>';
    }
    return (
      '<div style="overflow:auto"><table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Photo / marketing</th><th>Medication</th><th>Emergency</th><th>Updated</th>' +
      '</tr></thead><tbody>' +
      entries.map(rowHtml).join('') +
      '</tbody></table></div>'
    );
  }

  function syncFilterButtons() {
    global.document.querySelectorAll('[data-consents-filter]').forEach(function (b) {
      var on = b.getAttribute('data-consents-filter') === state.filter;
      b.classList.toggle('btn--ghost', !on);
    });
  }

  async function renderHost() {
    var hostEl = global.document.getElementById('portalParentConsentsHost');
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var res = await api({ filter: state.filter, q: state.q, limit: 400 });
    if (res.error) {
      hostEl.innerHTML = '<p class="muted">Could not load consents (' + esc(res.error) + ').</p>';
      return;
    }
    state.entries = res.entries || [];
    state.meta = res.meta || {};
    var metaEl = global.document.getElementById('portalParentConsentsMeta');
    if (metaEl) {
      metaEl.textContent =
        String(state.meta.photo_pending || 0) +
        ' photo · ' +
        String(state.meta.medication_pending || 0) +
        ' meds · ' +
        String(state.meta.emergency_pending || 0) +
        ' emergency pending · ' +
        String(state.meta.photo_yes || 0) +
        ' marketing OK';
    }
    hostEl.innerHTML = tableHtml(state.entries);
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Parent consents</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">Photo consent is for <strong>website / marketing / training / research</strong> only — portal progress photos do not need this. Also tracks medication at the centre and emergency treatment / contacts.</p>' +
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Consent status</h3>' +
      '<span class="chip chip--pend" id="portalParentConsentsMeta">…</span></div>' +
      '<div class="card-pad">' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-consents-filter="pending">Pending</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="photo_yes">Marketing OK</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="photo_no">Family only</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="med_yes">Meds at centre</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="emergency_pending">Emergency pending</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="complete">Complete</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="all">All</button>' +
      '<input id="portalParentConsentsSearch" type="search" placeholder="Search name…" style="min-width:10rem;max-width:100%;flex:1 1 12rem;padding:8px 10px;border:1px solid var(--line);border-radius:10px;font:inherit" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentConsentsRefresh">Refresh</button>' +
      '</div>' +
      '<div id="portalParentConsentsHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindModule() {
    state.filter = 'pending';
    state.q = '';
    syncFilterButtons();
    var refresh = global.document.getElementById('portalParentConsentsRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost();
      });
    }
    global.document.querySelectorAll('[data-consents-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-consents-filter') || 'pending';
        syncFilterButtons();
        void renderHost();
      });
    });
    var search = global.document.getElementById('portalParentConsentsSearch');
    if (search) {
      var t = null;
      search.addEventListener('input', function () {
        if (t) global.clearTimeout(t);
        t = global.setTimeout(function () {
          state.q = String(search.value || '').trim();
          void renderHost();
        }, 220);
      });
    }
    void renderHost();
  }

  global.PortalParentConsents = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule
  };
})(typeof window !== 'undefined' ? window : globalThis);
