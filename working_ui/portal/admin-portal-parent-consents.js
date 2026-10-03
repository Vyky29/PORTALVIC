/**
 * Admin — parent photo/marketing, medication, emergency, off-site/transport consents.
 * Annual renewal: signed answers older than 365 days count as pending.
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

  var state = { group: 'status', filter: 'pending', q: '', entries: [], roster: null, meta: {} };

  var FILTER_GROUPS = [
    {
      id: 'status',
      label: 'Status',
      subs: [
        { id: 'pending', label: 'Pending' },
        { id: 'complete', label: 'Complete' },
        { id: 'renewal', label: 'Annual renewal' },
        { id: 'all', label: 'All' }
      ]
    },
    {
      id: 'photo',
      label: 'Photo',
      subs: [
        { id: 'photo_pending', label: 'Pending' },
        { id: 'photo_yes', label: 'Marketing OK' },
        { id: 'photo_no', label: 'Family only' }
      ]
    },
    {
      id: 'meds',
      label: 'Medication',
      subs: [
        { id: 'med_pending', label: 'Pending' },
        { id: 'med_yes', label: 'Meds at centre' },
        { id: 'med_no', label: 'No meds' }
      ]
    },
    {
      id: 'emergency',
      label: 'Emergency',
      subs: [
        { id: 'emergency_pending', label: 'Pending' },
        { id: 'emergency_yes', label: 'Treat OK' },
        { id: 'emergency_no', label: 'Wait for carer' }
      ]
    },
    {
      id: 'travel',
      label: 'Travel',
      subs: [
        { id: 'offsite_pending', label: 'Pending' },
        { id: 'offsite_done', label: 'Signed' }
      ]
    }
  ];

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
    if (!e.photo_done) {
      return { text: e.renewal_needed ? 'Renew' : 'Pending', tone: 'pend' };
    }
    if (e.photo_consent === 'yes') return { text: 'Marketing OK', tone: 'ok' };
    return { text: 'Family only', tone: 'info' };
  }

  function medLabel(e) {
    if (!e.medication_done) {
      return { text: e.renewal_needed ? 'Renew' : 'Pending', tone: 'pend' };
    }
    if (e.medication_at_centre_needed === 'yes') return { text: 'Meds at centre', tone: 'warn' };
    return { text: 'No meds', tone: 'ok' };
  }

  function emergencyLabel(e) {
    if (!e.emergency_done) {
      return { text: e.renewal_needed ? 'Renew' : 'Pending', tone: 'pend' };
    }
    if (e.emergency_treatment_consent === 'yes') return { text: 'Treat OK', tone: 'ok' };
    return { text: 'Wait for carer', tone: 'info' };
  }

  function yn(v) {
    if (v === 'yes') return 'Yes';
    if (v === 'no') return 'No';
    return '—';
  }

  function offsiteLabel(e) {
    if (!e.offsite_done) {
      return { text: e.renewal_needed ? 'Renew' : 'Pending', tone: 'pend' };
    }
    return {
      text:
        'Walk ' +
        yn(e.community_walk_consent) +
        ' · PT ' +
        yn(e.public_transport_consent) +
        ' · Taxi ' +
        yn(e.taxi_home_transport_consent),
      tone: 'ok'
    };
  }

  function rowHtml(e) {
    var photo = photoLabel(e);
    var med = medLabel(e);
    var emergency = emergencyLabel(e);
    var offsite = offsiteLabel(e);
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
      (e.renewal_needed
        ? '<div style="margin-top:4px"><span class="chip chip--pend">Annual renewal</span></div>'
        : '') +
      '</td>' +
      '<td><span class="chip chip--' +
      photo.tone +
      '">' +
      esc(photo.text) +
      '</span>' +
      (e.photo_consent_signed_at
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
      (e.medication_at_centre_signed_at
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
      (e.emergency_treatment_signed_at
        ? '<div class="muted" style="margin-top:4px;font-size:12px;white-space:nowrap">' +
          esc(formatDate(e.emergency_treatment_signed_at)) +
          '</div>'
        : '') +
      '</td>' +
      '<td><span class="chip chip--' +
      offsite.tone +
      '" style="max-width:14rem;overflow-wrap:break-word;white-space:normal">' +
      esc(offsite.text) +
      '</span>' +
      (e.offsite_transport_signed_at
        ? '<div class="muted" style="margin-top:4px;font-size:12px;white-space:nowrap">' +
          esc(formatDate(e.offsite_transport_signed_at)) +
          '</div>'
        : '') +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(e.updated_at)) +
      '</td>' +
      '</tr>'
    );
  }

  function isAcatGroupEntry(e) {
    var name = String((e && e.participant_display) || '').trim().toLowerCase();
    var id = String((e && e.contact_id) || '').trim().toLowerCase();
    if (name === 'acat' || name === 'acat group') return true;
    return id === 'gap-acat-group' || id === 'acat' || id === 'acat_group';
  }

  function isActiveClient(e) {
    return !!(e && e.in_class === true) && !isAcatGroupEntry(e);
  }

  function matchesFilter(e, filter) {
    if (filter === 'pending') return e.pending_count > 0;
    if (filter === 'photo_pending') return !e.photo_done;
    if (filter === 'photo_yes') return e.photo_done && e.photo_consent === 'yes';
    if (filter === 'photo_no') return e.photo_done && e.photo_consent === 'no';
    if (filter === 'med_pending') return !e.medication_done;
    if (filter === 'med_yes') return e.medication_done && e.medication_at_centre_needed === 'yes';
    if (filter === 'med_no') return e.medication_done && e.medication_at_centre_needed !== 'yes';
    if (filter === 'emergency_pending') return !e.emergency_done;
    if (filter === 'emergency_yes') return e.emergency_done && e.emergency_treatment_consent === 'yes';
    if (filter === 'emergency_no') return e.emergency_done && e.emergency_treatment_consent !== 'yes';
    if (filter === 'offsite_pending') return !e.offsite_done;
    if (filter === 'offsite_done') return !!e.offsite_done;
    if (filter === 'renewal') return !!e.renewal_needed;
    if (filter === 'complete') return e.pending_count === 0;
    return true;
  }

  function groupById(id) {
    for (var i = 0; i < FILTER_GROUPS.length; i++) {
      if (FILTER_GROUPS[i].id === id) return FILTER_GROUPS[i];
    }
    return FILTER_GROUPS[0];
  }

  function filterInGroup(groupId, filterId) {
    var group = groupById(groupId);
    for (var i = 0; i < group.subs.length; i++) {
      if (group.subs[i].id === filterId) return true;
    }
    return false;
  }

  function countsFor(entries) {
    var photoPending = 0;
    var medPending = 0;
    var emergencyPending = 0;
    var offsitePending = 0;
    var renewal = 0;
    (entries || []).forEach(function (e) {
      if (!e.photo_done) photoPending += 1;
      if (!e.medication_done) medPending += 1;
      if (!e.emergency_done) emergencyPending += 1;
      if (!e.offsite_done) offsitePending += 1;
      if (e.renewal_needed) renewal += 1;
    });
    return {
      photo_pending: photoPending,
      medication_pending: medPending,
      emergency_pending: emergencyPending,
      offsite_pending: offsitePending,
      renewal_needed: renewal
    };
  }

  function tableHtml(entries) {
    if (!entries || !entries.length) {
      if (state.filter === 'renewal') {
        return '<p class="muted" style="margin:0;max-width:40rem;overflow-wrap:break-word">Annual renewal is for ACTIVE clients who already signed, when that signature is older than 12 months. Nobody is due yet. People who have not signed are under Pending.</p>';
      }
      return '<p class="muted" style="margin:0">No participants match this filter.</p>';
    }
    return (
      '<div style="overflow:auto"><table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Photo / marketing</th><th>Medication</th><th>Emergency</th><th>Travel</th><th>Updated</th>' +
      '</tr></thead><tbody>' +
      entries.map(rowHtml).join('') +
      '</tbody></table></div>'
    );
  }

  function syncFilterButtons() {
    global.document.querySelectorAll('[data-consents-group]').forEach(function (b) {
      var on = b.getAttribute('data-consents-group') === state.group;
      b.classList.toggle('btn--ghost', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    global.document.querySelectorAll('[data-consents-subs]').forEach(function (row) {
      row.hidden = row.getAttribute('data-consents-subs') !== state.group;
    });
    global.document.querySelectorAll('[data-consents-filter]').forEach(function (b) {
      var on = b.getAttribute('data-consents-filter') === state.filter;
      b.classList.toggle('btn--ghost', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function paintSubCounts(list) {
    var rows = list || [];
    global.document.querySelectorAll('[data-consents-count]').forEach(function (el) {
      var id = el.getAttribute('data-consents-count');
      var n = 0;
      for (var i = 0; i < rows.length; i++) {
        if (matchesFilter(rows[i], id)) n += 1;
      }
      el.textContent = String(n);
    });
  }

  function applyList() {
    var hostEl = global.document.getElementById('portalParentConsentsHost');
    if (!hostEl) return;
    var roster = state.roster || [];
    paintSubCounts(roster);
    var q = String(state.q || '').trim().toLowerCase();
    state.entries = roster.filter(function (e) {
      if (!matchesFilter(e, state.filter)) return false;
      if (!q) return true;
      var hay = (
        String(e.participant_display || '') +
        ' ' +
        String(e.parent_display || '') +
        ' ' +
        String(e.contact_id || '')
      ).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var metaEl = global.document.getElementById('portalParentConsentsMeta');
    if (metaEl) metaEl.textContent = String(state.entries.length) + ' showing';
    hostEl.innerHTML = tableHtml(state.entries);
    syncFilterButtons();
  }

  async function renderHost(force) {
    var hostEl = global.document.getElementById('portalParentConsentsHost');
    if (!hostEl) return;
    if (!state.roster || force) {
      hostEl.innerHTML = '<p class="muted">Loading…</p>';
      var res = await api({ filter: 'all', q: '', limit: 500 });
      if (res.error) {
        hostEl.innerHTML = '<p class="muted">Could not load consents (' + esc(res.error) + ').</p>';
        return;
      }
      state.roster = (res.entries || []).filter(isActiveClient);
      state.meta = countsFor(state.roster);
    }
    applyList();
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Parent consents</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">Only <strong>ACTIVE</strong> clients. Photo consent is for <strong>website / marketing / training / research</strong> only — portal progress photos do not need this. Also tracks medication, emergency treatment, and off-site travel (walk / public transport / taxi with PA). <strong>Annual renewal</strong> is a signature older than 12 months. People who have not signed yet stay under Pending.</p>' +
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Consent status</h3>' +
      '<span class="chip chip--pend" id="portalParentConsentsMeta">…</span></div>' +
      '<div class="card-pad">' +
      '<style>' +
      '.pc-filters{display:flex;flex-direction:column;gap:8px;min-width:0;margin-bottom:12px}' +
      '.pc-filters__tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}' +
      '.pc-filters__tools input{min-width:0;width:14rem;max-width:100%;flex:1 1 12rem;padding:8px 10px;border:1px solid var(--line);border-radius:10px;font:inherit}' +
      '.pc-filters__row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}' +
      '.pc-filters__row--sub{padding:8px;border-radius:12px;background:#f8fafc;border:1px solid var(--line)}' +
      '.pc-filters__row[hidden]{display:none !important}' +
      '.pc-filters__row .btn{min-width:0;max-width:100%}' +
      '.pc-filters__n{margin-left:6px;font-weight:800}' +
      '</style>' +
      '<div class="pc-filters">' +
      '<div class="pc-filters__tools">' +
      '<input id="portalParentConsentsSearch" type="search" placeholder="Search name…" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentConsentsRefresh">Refresh</button>' +
      '</div>' +
      '<div class="pc-filters__row" role="tablist" aria-label="Consent area">' +
      FILTER_GROUPS.map(function (g) {
        return (
          '<button type="button" class="btn btn--sm' +
          (g.id === 'status' ? '' : ' btn--ghost') +
          '" data-consents-group="' +
          g.id +
          '">' +
          esc(g.label) +
          '</button>'
        );
      }).join('') +
      '</div>' +
      FILTER_GROUPS.map(function (g) {
        return (
          '<div class="pc-filters__row pc-filters__row--sub" data-consents-subs="' +
          g.id +
          '"' +
          (g.id === 'status' ? '' : ' hidden') +
          ' role="group" aria-label="' +
          esc(g.label) +
          ' filters">' +
          g.subs
            .map(function (s) {
              return (
                '<button type="button" class="btn btn--sm btn--ghost" data-consents-filter="' +
                s.id +
                '">' +
                esc(s.label) +
                ' <span class="pc-filters__n" data-consents-count="' +
                s.id +
                '">0</span></button>'
              );
            })
            .join('') +
          '</div>'
        );
      }).join('') +
      '</div>' +
      '<div id="portalParentConsentsHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindModule() {
    state.group = 'status';
    state.filter = 'pending';
    state.q = '';
    state.roster = null;
    syncFilterButtons();
    var refresh = global.document.getElementById('portalParentConsentsRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(true);
      });
    }
    global.document.querySelectorAll('[data-consents-group]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-consents-group') || 'status';
        state.group = next;
        if (!filterInGroup(next, state.filter)) {
          var group = groupById(next);
          state.filter = group.subs[0].id;
        }
        syncFilterButtons();
        applyList();
      });
    });
    global.document.querySelectorAll('[data-consents-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-consents-filter') || 'pending';
        syncFilterButtons();
        applyList();
      });
    });
    var search = global.document.getElementById('portalParentConsentsSearch');
    if (search) {
      var t = null;
      search.addEventListener('input', function () {
        if (t) global.clearTimeout(t);
        t = global.setTimeout(function () {
          state.q = String(search.value || '').trim();
          applyList();
        }, 220);
      });
    }
    void renderHost(true);
  }

  global.PortalParentConsents = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule
  };
})(typeof window !== 'undefined' ? window : globalThis);
