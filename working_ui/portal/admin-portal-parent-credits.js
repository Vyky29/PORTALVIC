/**
 * Admin — family credits / refunds ledger (mark refunded / applied).
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

  var state = { filter: 'open', entries: [], meta: {} };

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

  function formatMoney(n) {
    if (n == null || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return '£' + v.toFixed(2);
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
      return { error: (j && j.error) || 'request_failed', message: (j && j.message) || '' };
    }
    return j;
  }

  function statusChip(status) {
    var s = String(status || '');
    var tone = 'info';
    if (s === 'open') tone = 'pend';
    else if (s === 'refunded' || s === 'applied') tone = 'ok';
    else if (s === 'cancelled') tone = 'warn';
    return '<span class="chip chip--' + tone + '">' + esc(s) + '</span>';
  }

  function rowHtml(e) {
    var actions = '<span class="muted">—</span>';
    if (e.status === 'open') {
      if (e.kind === 'refund') {
        actions =
          '<button type="button" class="btn btn--sm btn--primary" data-credit-act="mark_refunded" data-credit-id="' +
          esc(e.id) +
          '">Mark refunded</button>';
      } else if (e.kind === 'credit') {
        actions =
          '<button type="button" class="btn btn--sm btn--sec" data-credit-act="mark_applied" data-credit-id="' +
          esc(e.id) +
          '">Mark applied</button>';
      }
      actions +=
        ' <button type="button" class="btn btn--sm btn--ghost" data-credit-act="cancel" data-credit-id="' +
        esc(e.id) +
        '">Cancel</button>';
    }
    return (
      '<tr>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(e.participant_display || '—') +
      '</strong></td>' +
      '<td>' +
      esc(e.kind) +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatMoney(e.amount_gbp)) +
      '</td>' +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(e.service_label || '—') +
      (e.session_date ? ' · ' + esc(formatDate(e.session_date)) : '') +
      '</td>' +
      '<td>' +
      statusChip(e.status) +
      '</td>' +
      '<td class="muted" style="min-width:0;max-width:14rem;overflow-wrap:break-word">' +
      esc(e.notes || e.close_notes || '—') +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(e.created_at)) +
      '</td>' +
      '<td style="min-width:0">' +
      actions +
      '</td>' +
      '</tr>'
    );
  }

  function tableHtml(entries) {
    if (!entries || !entries.length) {
      return '<p class="muted" style="margin:0">No ledger rows for this filter.</p>';
    }
    return (
      '<div style="overflow:auto"><table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Kind</th><th>£</th><th>Service / session</th><th>Status</th><th>Notes</th><th>Created</th><th></th>' +
      '</tr></thead><tbody>' +
      entries.map(rowHtml).join('') +
      '</tbody></table></div>'
    );
  }

  async function renderHost(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var res = await api('portal-admin-parent-credits-list', {
      status: state.filter,
      limit: 120
    });
    if (res.error) {
      hostEl.innerHTML = '<p class="muted">Could not load credits (' + esc(res.error) + ').</p>';
      return;
    }
    state.entries = res.entries || [];
    state.meta = res.meta || {};
    var metaEl = global.document.getElementById('portalParentCreditsMetaEmbed');
    if (metaEl) {
      metaEl.textContent =
        String(state.meta.open_credits || 0) +
        ' open credits · ' +
        String(state.meta.open_refunds || 0) +
        ' open refunds';
    }
    hostEl.innerHTML = tableHtml(state.entries);
    bindRowActions(hostEl);
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-credit-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-credit-id');
        var act = btn.getAttribute('data-credit-act');
        var promptLabel =
          act === 'mark_refunded'
            ? 'Notes for refunded (optional):'
            : act === 'mark_applied'
              ? 'Notes for applied credit (optional):'
              : 'Cancel reason (optional):';
        var notes = global.prompt(promptLabel, '') || '';
        var amountRaw = '';
        if (act === 'mark_refunded') {
          amountRaw = global.prompt('Confirm / set £ amount if missing (optional):', '') || '';
        }
        btn.disabled = true;
        var body = { action: act, entry_id: id, notes: notes };
        if (String(amountRaw).trim()) body.amount_gbp = Number(amountRaw);
        void api('portal-admin-parent-credits-update', body).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Update failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast(
            act === 'mark_refunded' ? 'Marked refunded' : act === 'mark_applied' ? 'Credit applied' : 'Cancelled',
            'ok'
          );
          void renderHost(global.document.getElementById('portalParentCreditsHost'));
        });
      });
    });
  }

  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Family credits &amp; refunds</h3>' +
      '<span class="chip chip--pend" id="portalParentCreditsMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Ledger rows created when you excuse an absence as <strong>Credit</strong> or <strong>Refund</strong>. Families see open balances in the parent hub. Mark refunded after the bank/Stripe transfer; mark applied when a credit is used on a booking.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-credits-filter="open">Open</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-credits-filter="all">All</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentCreditsRefreshEmbed">Refresh</button>' +
      '</div>' +
      '<div id="portalParentCreditsHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindEmbed() {
    state.filter = 'open';
    var host = global.document.getElementById('portalParentCreditsHost');
    var refresh = global.document.getElementById('portalParentCreditsRefreshEmbed');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(host);
      });
    }
    global.document.querySelectorAll('[data-credits-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-credits-filter') || 'open';
        global.document.querySelectorAll('[data-credits-filter]').forEach(function (b) {
          var on = b.getAttribute('data-credits-filter') === state.filter;
          b.classList.toggle('btn--ghost', !on);
        });
        void renderHost(global.document.getElementById('portalParentCreditsHost'));
      });
    });
    void renderHost(host);
  }

  global.PortalParentCredits = {
    configure: configure,
    embedHtml: embedHtml,
    bindEmbed: bindEmbed
  };
})(typeof window !== 'undefined' ? window : globalThis);
