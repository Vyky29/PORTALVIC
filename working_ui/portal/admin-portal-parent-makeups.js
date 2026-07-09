/**
 * Admin — makeup grants waiting list (offer by venue; decline forfeits).
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

  var state = { filter: 'open', venue: '', grants: [], meta: {} };

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

  async function api(path, body) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/' + path, {
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
      return { error: (j && j.error) || 'request_failed', message: (j && j.message) || '', raw: j };
    }
    return j;
  }

  function rowHtml(g) {
    var pending = g.pending_offer;
    var actions = '';
    if (g.status === 'open') {
      actions =
        '<button type="button" class="btn btn--sm btn--primary" data-makeup-offer="' +
        esc(g.id) +
        '" data-venue="' +
        esc(g.preferred_venue || '') +
        '">Offer slot</button>';
    } else if (g.status === 'offered' && pending) {
      actions =
        '<span class="muted" style="display:block;margin-bottom:4px;overflow-wrap:break-word">' +
        esc(formatDate(pending.session_date)) +
        (pending.session_time ? ' · ' + esc(pending.session_time) : '') +
        (pending.instructor_name ? ' · ' + esc(pending.instructor_name) : '') +
        '</span>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-makeup-withdraw="' +
        esc(pending.id) +
        '">Withdraw offer</button>';
    } else if (g.status === 'consumed') {
      var accepted = (g.offers || []).find(function (o) {
        return o && o.status === 'accepted';
      });
      actions =
        '<span class="muted" style="overflow-wrap:break-word">On roster' +
        (accepted && accepted.roster_override_id ? ' ✓' : ' (pending link)') +
        (accepted
          ? '<br>' +
            esc(formatDate(accepted.session_date)) +
            (accepted.session_time ? ' · ' + esc(accepted.session_time) : '')
          : '') +
        '</span>';
    } else {
      actions = '<span class="muted">' + esc(g.status) + '</span>';
    }
    return (
      '<tr>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(g.participant_display || '—') +
      '</strong></td>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(g.preferred_venue || '—') +
      '</strong></td>' +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(g.service_label || '—') +
      '</td>' +
      '<td><span class="chip chip--' +
      (g.status === 'open' ? 'pend' : g.status === 'offered' ? 'info' : 'ok') +
      '">' +
      esc(g.status) +
      '</span></td>' +
      '<td class="muted">' +
      esc(String(g.source || '').replace(/_/g, ' ')) +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(g.created_at)) +
      '</td>' +
      '<td style="min-width:0">' +
      actions +
      '</td>' +
      '</tr>'
    );
  }

  function tableHtml(grants) {
    if (!grants.length) {
      return '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">No makeup grants in this filter.</p>';
    }
    return (
      '<div class="card" style="margin-top:0"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Venue</th><th>Service</th><th>Status</th><th>Source</th><th>Since</th><th>Offer</th>' +
      '</tr></thead><tbody>' +
      grants.map(rowHtml).join('') +
      '</tbody></table></div></div>'
    );
  }

  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Makeup grants (by venue)</h3>' +
      '<span class="chip chip--pend" id="portalMakeupMeta">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Waiting-list style: offer a concrete slot at the family&apos;s <strong>preferred venue</strong> (instructor + time required). If they <strong>Accept</strong>, MakeUp is written to the roster automatically. If they <strong>Decline</strong>, they forfeit the grant and the slot can go to the next family.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-makeup-filter="open">Open</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-makeup-filter="offered">Offered</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-makeup-filter="all">All</button>' +
      '<input type="text" id="portalMakeupVenueFilter" placeholder="Filter venue…" style="min-width:0;max-width:10rem;padding:6px 8px;border:1px solid var(--line);border-radius:8px" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalMakeupRefresh">Refresh</button>' +
      '</div>' +
      '<div id="portalMakeupHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  async function renderHost(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var venueEl = global.document.getElementById('portalMakeupVenueFilter');
    state.venue = venueEl ? String(venueEl.value || '').trim() : state.venue;
    var res = await api('portal-admin-makeup-list', {
      status: state.filter,
      venue: state.venue,
      limit: 150
    });
    if (res.error) {
      hostEl.innerHTML =
        '<p class="muted" style="color:var(--danger,#c62828)">Could not load (' +
        esc(res.error) +
        '). Apply makeup SQL + deploy functions if this is new.</p>';
      return;
    }
    state.grants = res.grants || [];
    state.meta = res.meta || {};
    var meta = global.document.getElementById('portalMakeupMeta');
    if (meta) {
      meta.textContent =
        String(state.meta.open || 0) + ' open · ' + String(state.meta.offered || 0) + ' offered';
    }
    hostEl.innerHTML = tableHtml(state.grants);
    bindRowActions(hostEl);
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-makeup-offer]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var grantId = btn.getAttribute('data-makeup-offer');
        var venue = btn.getAttribute('data-venue') || '';
        var sessionDate = global.prompt('Session date (YYYY-MM-DD):', '') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate.trim())) {
          cfg.toast('Need a valid date YYYY-MM-DD', 'error');
          return;
        }
        var sessionTime = global.prompt('Time slot (e.g. 5 to 5.30) — required:', '') || '';
        if (!String(sessionTime).trim()) {
          cfg.toast('Time slot required', 'error');
          return;
        }
        var instructor = global.prompt('Instructor (required — used for roster):', '') || '';
        if (!String(instructor).trim()) {
          cfg.toast('Instructor required so Accept can place MakeUp on the roster', 'error');
          return;
        }
        var notes = global.prompt('Note to family (optional):', '') || '';
        btn.disabled = true;
        void api('portal-admin-makeup-offer', {
          action: 'create',
          grant_id: grantId,
          venue: venue,
          session_date: sessionDate.trim(),
          session_time: sessionTime.trim(),
          instructor_name: instructor.trim(),
          offer_notes: notes.trim()
        }).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error, 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Offer sent — Accept places MakeUp on roster; Decline forfeits', 'ok');
          void renderHost(global.document.getElementById('portalMakeupHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-makeup-withdraw]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var offerId = btn.getAttribute('data-makeup-withdraw');
        if (!global.confirm('Withdraw this offer? Grant returns to Open.')) return;
        btn.disabled = true;
        void api('portal-admin-makeup-offer', { action: 'withdraw', offer_id: offerId }).then(
          function (r) {
            if (r.error) {
              cfg.toast(r.error, 'error');
              btn.disabled = false;
              return;
            }
            cfg.toast('Offer withdrawn', 'ok');
            void renderHost(global.document.getElementById('portalMakeupHost'));
          }
        );
      });
    });
  }

  function bindEmbed() {
    state.filter = 'open';
    var host = global.document.getElementById('portalMakeupHost');
    if (host) void renderHost(host);
    var refresh = global.document.getElementById('portalMakeupRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalMakeupHost'));
      });
    }
    global.document.querySelectorAll('[data-makeup-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-makeup-filter') || 'open';
        global.document.querySelectorAll('[data-makeup-filter]').forEach(function (b) {
          var on = b.getAttribute('data-makeup-filter') === state.filter;
          b.classList.toggle('btn--ghost', !on);
        });
        void renderHost(global.document.getElementById('portalMakeupHost'));
      });
    });
  }

  global.PortalParentMakeups = {
    configure: configure,
    embedHtml: embedHtml,
    bindEmbed: bindEmbed,
    api: api
  };
})(typeof window !== 'undefined' ? window : globalThis);
