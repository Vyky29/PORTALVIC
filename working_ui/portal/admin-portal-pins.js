/**
 * Admin · Portal PINs — login PINs for the Staff / Lead / Admin portals.
 *
 * SECURITY NOTE: this file is served as a public static asset. The PINs below
 * are therefore readable by anyone who fetches this file directly. They are
 * low-sensitivity per-portal login codes for a small team, masked by default
 * in the UI. For real protection, move this list to a Supabase table with
 * admin-only RLS and fetch it via an Edge Function instead of hard-coding here.
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) { return String(s == null ? '' : s); }
  };

  function configure(options) {
    if (options && options.esc) cfg.esc = options.esc;
  }
  function esc(s) { return cfg.esc(s); }

  var PORTALS = [
    {
      key: 'staff',
      label: 'Staff portal',
      credLabel: 'PIN',
      rows: [
        { name: 'Alex Stone', role: 'Climbing Instructor 3', pin: '4827' },
        { name: 'Berta Trapero Casado', role: 'Service Lead', pin: '3915' },
        { name: 'Angel Falceto', role: 'Swimming Instructor 3', pin: '7264' },
        { name: 'Aurora Garcia', role: 'Swimming Instructor 3', pin: '5183' },
        { name: 'Dan Clarke', role: 'Swimming Instructor 3', pin: '9027' },
        { name: 'John Kyei-Fram', role: 'Service Lead', pin: '2641' },
        { name: 'Bismark Gyan', role: 'Support Worker 3 · Climbing Instructor 3', pin: '6398' },
        { name: 'Carlos Herrero', role: 'Climbing Instructor 3 · Support Worker 3', pin: '6815' },
        { name: 'Javier Marquez', role: 'Swimming Instructor 3', pin: '1750' },
        { name: 'Roberto Reali', role: 'Swimming Instructor 2 · Support Worker 2', pin: '4592' },
        { name: 'Youssef Moustafa', role: 'Swimming Instructor 2', pin: '8163' },
        { name: 'Giuseppe Morelli', role: 'Support Worker 2', pin: '3074' },
        { name: 'Simon Griffiths', role: 'Swimming Instructor 1', pin: '7421' },
        { name: 'Luliya', role: 'Swimming Instructor 1 · Support Worker 1', pin: '5836' },
        { name: 'Godsway Yatofo', role: 'Support Worker 1', pin: '9268' },
        { name: 'Sandra Bartolome', role: 'Fitness Instructor 2', pin: '2497' },
        { name: 'Michelle', role: 'Onboarding', pin: '5555' },
        { name: 'Teflon', role: 'Onboarding', pin: '1111' },
        { name: 'Raul', role: 'Manager', pin: '6184' },
        { name: 'Sevitha', role: 'Admin', pin: '8847' },
        { name: 'Javier Arranz Escorial', role: 'CEO', pin: '5293' }
      ]
    },
    {
      key: 'lead',
      label: 'Lead portal',
      credLabel: 'PIN',
      rows: [
        { name: 'John Kyei-Fram', role: 'Service Lead', pin: '2641' },
        { name: 'Berta Trapero Casado', role: 'Service Lead', pin: '3915' },
        { name: 'Victor', role: 'Manager', pin: '1212' },
        { name: 'Admin', role: 'Admin', pin: '1234' },
        { name: 'Raul', role: 'Manager', pin: '6184' },
        { name: 'Sevitha', role: 'Admin', pin: '8847' },
        { name: 'Javier Arranz Escorial', role: 'CEO', pin: '5293' }
      ]
    },
    {
      key: 'admin',
      label: 'Admin portal',
      credLabel: 'Password',
      rows: [
        { name: 'Victor', role: 'Manager / Admin', pin: '1212' },
        { name: 'Admin', role: 'Admin', pin: '1234' },
        { name: 'Raul', role: 'Manager', pin: '6184' },
        { name: 'Sevitha', role: 'Admin', pin: '8847' },
        { name: 'Javier Arranz Escorial', role: 'CEO', pin: '5293' }
      ]
    }
  ];

  function totalCount() {
    return PORTALS.reduce(function (a, p) { return a + p.rows.length; }, 0);
  }

  function rowsHtml(portal) {
    return portal.rows.map(function (r, i) {
      return (
        '<tr>' +
        '<td class="muted" style="width:34px">' + (i + 1) + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong></td>' +
        '<td class="muted" style="min-width:0;overflow-wrap:break-word">' + esc(r.role) + '</td>' +
        '<td><span class="portal-pin-code" data-portal-pin="' + esc(r.pin) + '">••••</span></td>' +
        '<td style="white-space:nowrap">' +
        '<button type="button" class="btn btn--ghost btn--sm portal-pin-copy" data-portal-pin-copy="' + esc(r.pin) + '">Copy</button>' +
        '</td>' +
        '<td class="muted">—</td>' +
        '</tr>'
      );
    }).join('');
  }

  function portalSectionHtml(portal) {
    return (
      '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>' + esc(portal.label) + '</h3>' +
      '<span class="chip chip--info">' + portal.rows.length + '</span></div>' +
      '<div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl portal-pin-tbl" style="min-width:560px"><thead><tr>' +
      '<th>#</th><th>Name</th><th>Role(s)</th><th>' + esc(portal.credLabel) + '</th><th></th><th>Sent</th>' +
      '</tr></thead><tbody>' + rowsHtml(portal) + '</tbody></table></div></div>'
    );
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
      '<p>These are working login PINs/passwords. Do not share this screen. For stronger security these should live in Supabase with admin-only access.</p></div>' +
      '<div class="toolbar" style="margin-bottom:14px;gap:8px">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalPinsReveal">Reveal all</button>' +
      '<span class="muted" id="portalPinsMeta">' + totalCount() + ' codes across 3 portals</span>' +
      '</div>' +
      PORTALS.map(portalSectionHtml).join('') +
      '</div>'
    );
  }

  function bindModule() {
    var root = document.getElementById('portalPinsRoot');
    if (!root || root.getAttribute('data-portal-pins-bound') === '1') return;
    root.setAttribute('data-portal-pins-bound', '1');

    var revealed = false;
    function applyReveal() {
      root.querySelectorAll('.portal-pin-code').forEach(function (el) {
        el.textContent = revealed ? (el.getAttribute('data-portal-pin') || '') : '••••';
      });
    }
    var revealBtn = document.getElementById('portalPinsReveal');
    if (revealBtn) revealBtn.addEventListener('click', function () {
      revealed = !revealed;
      revealBtn.textContent = revealed ? 'Hide all' : 'Reveal all';
      applyReveal();
    });

    root.querySelectorAll('[data-portal-pin-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-portal-pin-copy') || '';
        var done = function () {
          var prev = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = prev; }, 1200);
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(done, done);
          } else {
            done();
          }
        } catch (_e) { done(); }
      });
    });
  }

  global.PortalPins = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    totalCount: totalCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
