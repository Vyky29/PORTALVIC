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
      '<td style="min-width:0"><div class="xero-map__name">' +
      cfg.esc(row.label || key) +
      '</div><div class="xero-map__code">' +
      key +
      '</div></td>' +
      '<td style="min-width:12rem"><select class="inp xero-map-vat">' +
      itemOptionsHtml(items, row.xero_item_code_vat) +
      '</select></td>' +
      '<td style="min-width:12rem"><select class="inp xero-map-exempt">' +
      itemOptionsHtml(items, row.xero_item_code_exempt) +
      '</select></td>' +
      '<td class="xero-map__status"><span class="chip chip--' +
      tone +
      '">' +
      (vatOk && exOk ? 'Both' : vatOk ? 'VAT only' : exOk ? 'Exempt only' : 'Unmapped') +
      '</span></td>' +
      '<td><button type="button" class="btn btn--sm btn--ghost xero-map-save">Save</button></td>' +
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
      '<style>' +
      '.xero-map{display:flex;flex-direction:column;gap:12px;min-width:0}' +
      '.xero-map__bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;min-width:0}' +
      '.xero-map__stats{display:flex;flex-wrap:wrap;gap:6px;min-width:0}' +
      '.xero-map__stat{display:inline-flex;align-items:center;min-width:0;padding:4px 8px;border-radius:999px;background:#f4f7fb;border:1px solid #e2e8f0;font-size:12px;overflow-wrap:anywhere}' +
      '.xero-map__actions{display:flex;flex-wrap:wrap;gap:8px}' +
      '.xero-map__lead{margin:0;max-width:42rem;line-height:1.45;overflow-wrap:break-word}' +
      '.xero-map__add{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:#f8fafc;min-width:0}' +
      '.xero-map__add label{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:12px;font-weight:650;color:#5c6b7a}' +
      '.xero-map__add .inp{width:100%;max-width:100%;box-sizing:border-box}' +
      '.xero-map__scroll{overflow:auto;min-width:0;border:1px solid var(--line,#e5e7eb);border-radius:12px}' +
      '.xero-map__table{width:100%;min-width:720px;border-collapse:collapse}' +
      '.xero-map__table th{text-align:left;font-size:11px;letter-spacing:.02em;text-transform:uppercase;color:#5c6b7a;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb}' +
      '.xero-map__table td{padding:10px 12px;border-bottom:1px solid #eef2f6;vertical-align:middle;min-width:0}' +
      '.xero-map__table tr:last-child td{border-bottom:0}' +
      '.xero-map__name{font-weight:700;overflow-wrap:anywhere}' +
      '.xero-map__code{font-size:11px;color:#7b8794;overflow-wrap:anywhere}' +
      '.xero-map__table .inp{width:100%;max-width:100%;min-width:0;box-sizing:border-box}' +
      '.xero-map__status{white-space:nowrap}' +
      '</style>' +
      '<div class="card xero-map"><div class="card-pad" style="min-width:0">' +
      '<div class="xero-map__bar">' +
      '<div class="xero-map__stats">' +
      '<span class="xero-map__stat">' + cfg.esc(String(stats.items_cached || 0)) + ' Xero items</span>' +
      '<span class="xero-map__stat">' + cfg.esc(String(stats.mapped_vat || 0)) + ' VAT</span>' +
      '<span class="xero-map__stat">' + cfg.esc(String(stats.mapped_exempt || 0)) + ' exempt</span>' +
      '<span class="xero-map__stat">' + cfg.esc(synced) + '</span>' +
      '</div>' +
      '<div class="xero-map__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="xeroMapAddBtn">Add row</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="xeroMapSyncBtn">Sync from Xero</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="xeroMapReloadBtn">Reload</button>' +
      '</div></div>' +
      '<p class="muted xero-map__lead">Each programme needs a VAT item for private parents and an exempt item for LA or Direct Payment. Re-enrolment invoices use this map.</p>' +
      '<div id="xeroMapAddForm" class="xero-map__add" hidden>' +
      '<label>Portal key<input class="inp" id="xeroMapNewKey" maxlength="80" placeholder="TRANSPORT" style="text-transform:uppercase"></label>' +
      '<label>Name<input class="inp" id="xeroMapNewLabel" maxlength="160" placeholder="Transport"></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;min-width:0">' +
      '<button type="button" class="btn btn--primary btn--sm" id="xeroMapCreateBtn">Create row</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="xeroMapCancelAddBtn">Cancel</button>' +
      '</div></div>' +
      '<div class="xero-map__scroll">' +
      '<table class="xero-map__table"><thead><tr>' +
      '<th>Portal service</th><th>VAT item</th><th>Exempt item</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      (map.length ? map.map(function (r) { return mapRowHtml(r, items); }).join('') : '<tr><td colspan="5" class="muted">No programmes yet.</td></tr>') +
      '</tbody></table></div>' +
      '</div></div>';
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
    var addBtn = root.querySelector('#xeroMapAddBtn');
    var addForm = root.querySelector('#xeroMapAddForm');
    var createBtn = root.querySelector('#xeroMapCreateBtn');
    var cancelAddBtn = root.querySelector('#xeroMapCancelAddBtn');
    var newKey = root.querySelector('#xeroMapNewKey');
    var newLabel = root.querySelector('#xeroMapNewLabel');
    var syncBtn = root.querySelector('#xeroMapSyncBtn');
    var reloadBtn = root.querySelector('#xeroMapReloadBtn');
    if (addBtn && addForm) {
      addBtn.addEventListener('click', function () {
        addForm.hidden = false;
        if (newKey) newKey.focus();
      });
    }
    if (cancelAddBtn && addForm) {
      cancelAddBtn.addEventListener('click', function () {
        addForm.hidden = true;
        if (newKey) newKey.value = '';
        if (newLabel) newLabel.value = '';
      });
    }
    if (createBtn) {
      createBtn.addEventListener('click', async function () {
        var key = String((newKey && newKey.value) || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
        var label = String((newLabel && newLabel.value) || '').trim();
        if (!key || !label) {
          cfg.toast('Enter a Portal key and name.', 'error');
          return;
        }
        createBtn.disabled = true;
        var r = await api({ action: 'add_key', service_key: key, label: label });
        createBtn.disabled = false;
        if (r.error) {
          cfg.toast(r.message || r.error || 'Could not create row', 'error');
          return;
        }
        cfg.toast('Added ' + label, 'ok');
        load(root);
      });
    }
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
