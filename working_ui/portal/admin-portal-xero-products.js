/**
 * Admin — Xero product map (sync Items + link Portal services to VAT / exempt codes).
 */
(function (global) {
  'use strict';

  var cfg = {
    getClient: function () {
      return null;
    },
    getAnonKey: function () {
      return '';
    },
    getSupabaseUrl: function () {
      return '';
    },
    toast: function (_m, _t) {},
    esc: function (s) {
      return String(s == null ? '' : s);
    },
  };

  function configure(opts) {
    if (!opts) return;
    if (opts.getClient) cfg.getClient = opts.getClient;
    if (opts.getAnonKey) cfg.getAnonKey = opts.getAnonKey;
    if (opts.getSupabaseUrl) cfg.getSupabaseUrl = opts.getSupabaseUrl;
    if (opts.toast) cfg.toast = opts.toast;
    if (opts.esc) cfg.esc = opts.esc;
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || '').replace(/\/$/, '');
  }

  async function portalAuthToken() {
    var c = cfg.getClient();
    if (!c || !c.auth) return null;
    var sess = await c.auth.getSession();
    return (sess && sess.data && sess.data.session && sess.data.session.access_token) || null;
  }

  async function api(body) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-xero-product-map', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed', message: (j && j.message) || (j && j.detail) || '' };
    }
    return j;
  }

  function itemOptionsHtml(items, selected) {
    var sel = String(selected || '');
    var out = ['<option value="">—</option>'];
    (items || []).forEach(function (it) {
      var code = String(it.item_code || '');
      if (!code) return;
      var tax = String(it.sales_tax_type || '').toUpperCase();
      var label = code + ' — ' + String(it.name || code) + (tax ? ' (' + tax + ')' : '');
      out.push(
        '<option value="' +
          cfg.esc(code) +
          '"' +
          (code === sel ? ' selected' : '') +
          '>' +
          cfg.esc(label) +
          '</option>',
      );
    });
    return out.join('');
  }

  function mapRowHtml(row, items) {
    var key = cfg.esc(row.service_key || '');
    var vatOk = !!row.xero_item_code_vat;
    var exOk = !!row.xero_item_code_exempt;
    var tone = vatOk && exOk ? 'ok' : vatOk || exOk ? 'pend' : 'warn';
    return (
      '<tr class="xero-map-row" data-service-key="' +
      key +
      '">' +
      '<td style="min-width:0;overflow-wrap:break-word"><code>' +
      key +
      '</code><div class="muted" style="font-size:12px">' +
      cfg.esc(row.label || '') +
      '</div></td>' +
      '<td><select class="inp xero-map-vat" style="max-width:100%;min-width:0">' +
      itemOptionsHtml(items, row.xero_item_code_vat) +
      '</select></td>' +
      '<td><select class="inp xero-map-exempt" style="max-width:100%;min-width:0">' +
      itemOptionsHtml(items, row.xero_item_code_exempt) +
      '</select></td>' +
      '<td><span class="chip chip--' +
      tone +
      '">' +
      (vatOk && exOk ? 'Both' : vatOk ? 'VAT only' : exOk ? 'Exempt only' : 'Unmapped') +
      '</span></td>' +
      '<td><button type="button" class="btn btn--sm btn--primary xero-map-save">Save</button></td>' +
      '</tr>'
    );
  }

  function renderPanel(root, data) {
    if (!root) return;
    var stats = (data && data.stats) || {};
    var items = (data && data.items) || [];
    var map = (data && data.map) || [];
    var synced = items.length
      ? 'Last sync: ' + cfg.esc(String((items[0] && items[0].synced_at) || '').slice(0, 16).replace('T', ' '))
      : 'No items cached — sync from Xero first.';

    root.innerHTML =
      '<div class="card" style="min-width:0">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">' +
      '<div style="min-width:0">' +
      '<h2 style="margin:0 0 4px;font-size:16px">Xero product map</h2>' +
      '<p class="muted" style="margin:0;font-size:13px;overflow-wrap:break-word">Link each Portal programme to your Xero Items — <strong>VAT 20%</strong> (private parents) and <strong>exempt</strong> (Direct Payment / LA).</p>' +
      '<p class="muted" style="margin:6px 0 0;font-size:12px">' +
      cfg.esc(synced) +
      ' · ' +
      cfg.esc(String(stats.items_cached || 0)) +
      ' items · ' +
      cfg.esc(String(stats.mapped_vat || 0)) +
      ' VAT mapped · ' +
      cfg.esc(String(stats.mapped_exempt || 0)) +
      ' exempt mapped</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn--primary" id="xeroMapSyncBtn">Sync from Xero</button>' +
      '<button type="button" class="btn btn--ghost" id="xeroMapReloadBtn">Reload</button>' +
      '</div></div>' +
      '<div style="overflow:auto;margin-top:12px;min-width:0">' +
      '<table class="data-table" style="width:100%;min-width:640px"><thead><tr>' +
      '<th>Portal service</th><th>Xero item (VAT)</th><th>Xero item (Exempt)</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      (map.length ? map.map(function (r) { return mapRowHtml(r, items); }).join('') : '<tr><td colspan="5" class="muted">No map rows.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="muted" style="margin:12px 0 0;font-size:12px">Re-enrolment invoices use this map for line items (Aquatic, Climbing, etc.) when parents submit.</p>' +
      '</div>';
  }

  async function load(root) {
    root.innerHTML = '<p class="muted">Loading Xero products…</p>';
    var data = await api({ action: 'list' });
    if (data.error) {
      root.innerHTML =
        '<p class="muted">Could not load product map' +
        (data.message ? ': ' + cfg.esc(data.message) : '') +
        '.</p>';
      return;
    }
    renderPanel(root, data);
    bind(root);
  }

  function bind(root) {
    var syncBtn = root.querySelector('#xeroMapSyncBtn');
    var reloadBtn = root.querySelector('#xeroMapReloadBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async function () {
        syncBtn.disabled = true;
        var r = await api({ action: 'sync' });
        syncBtn.disabled = false;
        if (r.error) {
          cfg.toast(r.message || r.error || 'Sync failed', 'error');
          return;
        }
        cfg.toast(r.message || 'Synced from Xero', 'ok');
        load(root);
      });
    }
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function () {
        load(root);
      });
    }
    root.querySelectorAll('.xero-map-save').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var tr = btn.closest('tr');
        if (!tr) return;
        var key = tr.getAttribute('data-service-key') || '';
        var vatSel = tr.querySelector('.xero-map-vat');
        var exSel = tr.querySelector('.xero-map-exempt');
        btn.disabled = true;
        var r = await api({
          action: 'upsert',
          service_key: key,
          xero_item_code_vat: vatSel ? vatSel.value : null,
          xero_item_code_exempt: exSel ? exSel.value : null,
        });
        btn.disabled = false;
        if (r.error) {
          cfg.toast(r.message || r.error || 'Save failed', 'error');
          return;
        }
        cfg.toast('Saved ' + key, 'ok');
        load(root);
      });
    });
  }

  function mountHtml() {
    return '<div id="xeroProductsModuleRoot"></div>';
  }

  function mountBind() {
    var root = global.document.getElementById('xeroProductsModuleRoot');
    if (root) load(root);
  }

  global.PortalXeroProducts = {
    configure: configure,
    mountHtml: mountHtml,
    mountBind: mountBind,
    reload: function () {
      var root = global.document.getElementById('xeroProductsModuleRoot');
      if (root) load(root);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
