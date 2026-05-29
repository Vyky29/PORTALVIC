/**
 * Admin · Portal PINs — login PINs for the Staff / Lead / Admin portals.
 *
 * Data now lives in Supabase (public.portal_login_pins, admin/CEO-only RLS) so
 * the codes are not shipped in this public asset. The hard-coded list below is
 * only a FALLBACK shown if the table cannot be read yet (e.g. before the
 * migration runs) — with the "Sent" actions disabled in that mode.
 *
 * The "Sent" column writes sent_at / sent_by back to the table.
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) { return String(s == null ? '' : s); },
    toast: function () {},
    getClient: function () { return null; },
    getAuthUid: function () { return ''; }
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getAuthUid) cfg.getAuthUid = options.getAuthUid;
  }
  function esc(s) { return cfg.esc(s); }

  var PORTAL_META = [
    { key: 'staff', label: 'Staff portal', credLabel: 'PIN' },
    { key: 'lead', label: 'Lead portal', credLabel: 'PIN' },
    { key: 'admin', label: 'Admin portal', credLabel: 'Password' }
  ];

  // Fallback roster (used only when the table is unreachable). Mirrors the seed.
  var FALLBACK = {
    staff: [
      { name: 'Alex Stone', roles: 'Climbing Instructor 3', pin: '4827' },
      { name: 'Berta Trapero Casado', roles: 'Service Lead', pin: '3915' },
      { name: 'Angel Falceto', roles: 'Swimming Instructor 3', pin: '7264' },
      { name: 'Aurora Garcia', roles: 'Swimming Instructor 3', pin: '5183' },
      { name: 'Dan Clarke', roles: 'Swimming Instructor 3', pin: '9027' },
      { name: 'John Kyei-Fram', roles: 'Service Lead', pin: '2641' },
      { name: 'Bismark Gyan', roles: 'Support Worker 3 · Climbing Instructor 3', pin: '6398' },
      { name: 'Carlos Herrero', roles: 'Climbing Instructor 3 · Support Worker 3', pin: '6815' },
      { name: 'Javier Marquez', roles: 'Swimming Instructor 3', pin: '1750' },
      { name: 'Roberto Reali', roles: 'Swimming Instructor 2 · Support Worker 2', pin: '4592' },
      { name: 'Youssef Moustafa', roles: 'Swimming Instructor 2', pin: '8163' },
      { name: 'Giuseppe Morelli', roles: 'Support Worker 2', pin: '3074' },
      { name: 'Simon Griffiths', roles: 'Swimming Instructor 1', pin: '7421' },
      { name: 'Luliya', roles: 'Swimming Instructor 1 · Support Worker 1', pin: '5836' },
      { name: 'Godsway Yatofo', roles: 'Support Worker 1', pin: '9268' },
      { name: 'Sandra Bartolome', roles: 'Fitness Instructor 2', pin: '2497' },
      { name: 'Michelle', roles: 'Onboarding', pin: '5555' },
      { name: 'Teflon', roles: 'Onboarding', pin: '1111' },
      { name: 'Raul', roles: 'Manager', pin: '6184' },
      { name: 'Sevitha', roles: 'Admin', pin: '8847' },
      { name: 'Javier Arranz Escorial', roles: 'CEO', pin: '5293' }
    ],
    lead: [
      { name: 'John Kyei-Fram', roles: 'Service Lead', pin: '2641' },
      { name: 'Berta Trapero Casado', roles: 'Service Lead', pin: '3915' },
      { name: 'Victor', roles: 'Manager', pin: '1212' },
      { name: 'Admin', roles: 'Admin', pin: '1234' },
      { name: 'Raul', roles: 'Manager', pin: '6184' },
      { name: 'Sevitha', roles: 'Admin', pin: '8847' },
      { name: 'Javier Arranz Escorial', roles: 'CEO', pin: '5293' }
    ],
    admin: [
      { name: 'Victor', roles: 'Manager / Admin', pin: '1212' },
      { name: 'Admin', roles: 'Admin', pin: '1234' },
      { name: 'Raul', roles: 'Manager', pin: '6184' },
      { name: 'Sevitha', roles: 'Admin', pin: '8847' },
      { name: 'Javier Arranz Escorial', roles: 'CEO', pin: '5293' }
    ]
  };

  var state = {
    revealed: false,
    fromDb: false,
    rowsByPortal: { staff: [], lead: [], admin: [] }
  };

  function totalCount() {
    return PORTAL_META.reduce(function (a, p) {
      return a + (state.rowsByPortal[p.key] ? state.rowsByPortal[p.key].length : 0);
    }, 0);
  }

  function fmtSent(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_e) { return ''; }
  }

  function sentCellHtml(r) {
    if (!state.fromDb || !r.id) {
      return '<span class="muted">—</span>';
    }
    if (r.sent_at) {
      return (
        '<span class="chip chip--ok" style="margin-right:6px">Sent ' + esc(fmtSent(r.sent_at)) + '</span>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-pin-sent-toggle="' + esc(r.id) + '" data-pin-sent-next="0">Undo</button>'
      );
    }
    return '<button type="button" class="btn btn--sec btn--sm" data-pin-sent-toggle="' + esc(r.id) + '" data-pin-sent-next="1">Mark sent</button>';
  }

  function rowsHtml(portalKey) {
    var rows = state.rowsByPortal[portalKey] || [];
    if (!rows.length) {
      return '<tr><td colspan="6" class="muted">No entries.</td></tr>';
    }
    return rows.map(function (r, i) {
      return (
        '<tr>' +
        '<td class="muted" style="width:34px">' + (i + 1) + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong></td>' +
        '<td class="muted" style="min-width:0;overflow-wrap:break-word">' + esc(r.roles) + '</td>' +
        '<td><span class="portal-pin-code" data-portal-pin="' + esc(r.pin) + '">••••</span></td>' +
        '<td style="white-space:nowrap"><button type="button" class="btn btn--ghost btn--sm portal-pin-copy" data-portal-pin-copy="' + esc(r.pin) + '">Copy</button></td>' +
        '<td style="white-space:nowrap">' + sentCellHtml(r) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function sectionHtml(meta) {
    var count = (state.rowsByPortal[meta.key] || []).length;
    return (
      '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>' + esc(meta.label) + '</h3>' +
      '<span class="chip chip--info">' + count + '</span></div>' +
      '<div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl portal-pin-tbl" style="min-width:620px"><thead><tr>' +
      '<th>#</th><th>Name</th><th>Role(s)</th><th>' + esc(meta.credLabel) + '</th><th></th><th>Sent</th>' +
      '</tr></thead><tbody>' + rowsHtml(meta.key) + '</tbody></table></div></div>'
    );
  }

  function sectionsHtml() {
    return PORTAL_META.map(sectionHtml).join('');
  }

  function viewHtml() {
    return (
      '<div id="portalPinsRoot" class="portal-pins-embed">' +
      '<style>' +
      '#portalPinsRoot .portal-pin-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.12em}' +
      '#portalPinsRoot .portal-pin-tbl td{vertical-align:middle}' +
      '</style>' +
      '<h1 class="page-title">Portal PINs</h1>' +
      '<p class="page-intro">Login codes for the Staff, Lead and Admin portals. Hidden by default — reveal only when needed.</p>' +
      '<div class="op-banner" style="margin-bottom:14px"><strong>Keep this private.</strong>' +
      '<p>These are working login PINs/passwords (admin/CEO only). Mark a code as <em>Sent</em> once it has been handed to the person.</p></div>' +
      '<div class="toolbar" style="margin-bottom:14px;gap:8px;display:flex;align-items:center;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalPinsReveal">Reveal all</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalPinsRefresh">Refresh</button>' +
      '<span class="muted" id="portalPinsMeta">Loading…</span>' +
      '</div>' +
      '<div id="portalPinsSections"></div>' +
      '</div>'
    );
  }

  function applyReveal(root) {
    root.querySelectorAll('.portal-pin-code').forEach(function (el) {
      el.textContent = state.revealed ? (el.getAttribute('data-portal-pin') || '') : '••••';
    });
  }

  function setMeta(root, extra) {
    var meta = root.querySelector('#portalPinsMeta');
    if (!meta) return;
    var base = totalCount() + ' codes across 3 portals';
    if (!state.fromDb) base += ' · built-in list (DB not reachable — Sent disabled)';
    meta.textContent = extra ? (base + ' · ' + extra) : base;
  }

  function renderSections(root) {
    var host = root.querySelector('#portalPinsSections');
    if (host) host.innerHTML = sectionsHtml();
    applyReveal(root);
    setMeta(root);
  }

  function useFallback() {
    state.fromDb = false;
    state.rowsByPortal = {
      staff: FALLBACK.staff.slice(),
      lead: FALLBACK.lead.slice(),
      admin: FALLBACK.admin.slice()
    };
  }

  function loadFromDb() {
    var client = cfg.getClient();
    if (!client) { useFallback(); return Promise.resolve(); }
    return client
      .from('portal_login_pins')
      .select('id,portal,display_order,name,roles,pin,sent_at,sent_by')
      .order('portal', { ascending: true })
      .order('display_order', { ascending: true })
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          useFallback();
          return;
        }
        state.fromDb = true;
        var grouped = { staff: [], lead: [], admin: [] };
        res.data.forEach(function (r) {
          var p = String(r.portal || '').toLowerCase();
          if (grouped[p]) grouped[p].push(r);
        });
        state.rowsByPortal = grouped;
      })
      .catch(function () { useFallback(); });
  }

  function findRowById(id) {
    var keys = ['staff', 'lead', 'admin'];
    for (var k = 0; k < keys.length; k++) {
      var arr = state.rowsByPortal[keys[k]] || [];
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i].id) === String(id)) return arr[i];
      }
    }
    return null;
  }

  function toggleSent(root, id, makeSent) {
    var client = cfg.getClient();
    if (!client) { cfg.toast('Supabase not connected yet.'); return; }
    var row = findRowById(id);
    if (!row) return;
    var patch = makeSent
      ? { sent_at: new Date().toISOString(), sent_by: cfg.getAuthUid() || null }
      : { sent_at: null, sent_by: null };
    client
      .from('portal_login_pins')
      .update(patch)
      .eq('id', id)
      .select('id,sent_at,sent_by')
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          cfg.toast('Could not update (write blocked?): ' + String((res.error && res.error.message) || 'no rows'));
          return;
        }
        row.sent_at = res.data[0].sent_at;
        row.sent_by = res.data[0].sent_by;
        renderSections(root);
        cfg.toast(makeSent ? 'Marked as sent.' : 'Marked as not sent.');
      })
      .catch(function (e) {
        cfg.toast('Could not update: ' + String((e && e.message) || e));
      });
  }

  function bindModule() {
    var root = document.getElementById('portalPinsRoot');
    if (!root || root.getAttribute('data-portal-pins-bound') === '1') return;
    root.setAttribute('data-portal-pins-bound', '1');

    var revealBtn = root.querySelector('#portalPinsReveal');
    if (revealBtn) revealBtn.addEventListener('click', function () {
      state.revealed = !state.revealed;
      revealBtn.textContent = state.revealed ? 'Hide all' : 'Reveal all';
      applyReveal(root);
    });

    var refreshBtn = root.querySelector('#portalPinsRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      refreshBtn.disabled = true;
      loadFromDb().then(function () { renderSections(root); refreshBtn.disabled = false; });
    });

    // Delegated handlers for dynamically rendered rows.
    var host = root.querySelector('#portalPinsSections');
    if (host) host.addEventListener('click', function (ev) {
      var copyBtn = ev.target.closest ? ev.target.closest('[data-portal-pin-copy]') : null;
      if (copyBtn) {
        var code = copyBtn.getAttribute('data-portal-pin-copy') || '';
        var done = function () {
          var prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = prev; }, 1200);
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(done, done);
          } else { done(); }
        } catch (_e) { done(); }
        return;
      }
      var sentBtn = ev.target.closest ? ev.target.closest('[data-pin-sent-toggle]') : null;
      if (sentBtn) {
        var id = sentBtn.getAttribute('data-pin-sent-toggle');
        var next = sentBtn.getAttribute('data-pin-sent-next') === '1';
        toggleSent(root, id, next);
      }
    });

    loadFromDb().then(function () { renderSections(root); });
  }

  global.PortalPins = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    totalCount: totalCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
