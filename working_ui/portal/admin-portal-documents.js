/**
 * Admin Documents — Portal Supabase uploads (timesheets, expenses, onboarding files).
 */
(function (global) {
  'use strict';

  var cfg = {
    esc: function (s) {
      return String(s == null ? '' : s);
    },
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

  var TYPE_LABELS = {
    timesheet: 'Timesheet',
    expense: 'Expense',
    portalpin: 'Portal PIN',
    checklist: 'Checklist',
    passport: 'Passport',
    certificate: 'Certificate',
    firstaid: 'First aid',
    safeguarding: 'Safeguarding',
    other: 'Other'
  };

  // Stat-card filters for actual file types (Portal PINs is a separate screen).
  var STAT_CARDS = [
    { key: 'timesheet', label: 'Timesheets' },
    { key: 'expense', label: 'Expenses' },
    { key: 'checklist', label: 'Checklists' },
    { key: 'passport', label: 'Passports' },
    { key: 'certificate', label: 'Certificates' },
    { key: 'firstaid', label: 'First aids' }
  ];

  var state = {
    filter: 'all',
    search: '',
    items: [],
    previewIdx: -1
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
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

  async function edgePost(path, body) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: body == null ? '{}' : JSON.stringify(body)
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && (j.error || j.message)) || res.statusText || 'request_failed' };
    }
    return { data: j };
  }

  function normalizeExpenseRows(rows) {
    return (rows || []).map(function (r) {
      var exName = r.title || r.name || 'Expense report';
      var exPath = r.file_url || r.path || '';
      return {
        type: 'expense',
        name: exName,
        path: exPath,
        storageBucket: 'documents',
        size: null,
        created: r.created_at || deriveCreatedFromName(exName, exPath),
        source: 'portal',
        details: r
      };
    });
  }

  function normalizeTimesheetRows(rows) {
    return (rows || []).map(function (r) {
      var name = r.name || r.label || r.path || 'Timesheet';
      var path = r.path || r.file_path || '';
      return {
        type: 'timesheet',
        name: name,
        path: path,
        storageBucket: r.bucket || r.storage_bucket || 'club-files',
        size: r.size || null,
        created: r.created_at || r.uploaded_at || deriveCreatedFromName(name, path),
        source: r.source || 'portal',
        details: r
      };
    });
  }

  function normalizeOnboardingRows(rows) {
    return (rows || []).map(function (r) {
      var type = r.type || 'other';
      var n = String(r.name || r.path || '').toLowerCase();
      if (type === 'certificate' && n.indexOf('firstaid-') >= 0) type = 'firstaid';
      var obName = r.name || r.path || 'File';
      var obPath = r.path || '';
      return {
        type: type,
        name: obName,
        path: obPath,
        storageBucket: r.storage_bucket || r.bucket || 'club-files',
        size: r.size || null,
        created: r.created_at || r.uploaded_at || deriveCreatedFromName(obName, obPath),
        source: r.source || 'onboarding',
        details: r
      };
    });
  }

  async function loadAllItems() {
    var out = [];
    var ob = await edgePost('portal-admin-onboarding-documents-list', {});
    if (!ob.error) {
      global._portalDocsOnboardingMeta = ob.data.meta || {};
      global._portalDocsApplicants = ob.data.applicants || [];
      out = out.concat(normalizeOnboardingRows(ob.data.documents));
    }
    var ts = await edgePost('portal-admin-hr-files-list', {});
    if (!ts.error) {
      global._portalDocsTimesheetMeta = ts.data.meta || {};
      out = out.concat(normalizeTimesheetRows(ts.data.timesheets));
    }
    var ex = await edgePost('portal-admin-expenses-list', {});
    if (!ex.error) {
      global._portalDocsExpensesMeta = ex.data.meta || {};
      out = out.concat(normalizeExpenseRows(ex.data.expenses));
    }
    return out;
  }

  /**
   * Many timesheet/expense files are stored with a Date.now() prefix in the
   * filename (e.g. "1779813340877-Name_s_May_2026_Timesheet.pdf"). When the
   * storage listing has no created_at, derive the submission time from that
   * leading epoch (13 digits = ms, 10 digits = seconds).
   */
  function deriveCreatedFromName() {
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i] == null ? '' : arguments[i]);
      var base = s.split('/').pop();
      var m = base.match(/^(\d{10,13})\D/);
      if (!m) continue;
      var num = Number(m[1]);
      if (!Number.isFinite(num)) continue;
      if (m[1].length <= 10) num *= 1000; // seconds -> ms
      var d = new Date(num);
      var yr = d.getFullYear();
      if (yr >= 2020 && yr <= 2100) return d.toISOString();
    }
    return null;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-GB', {
        weekday: 'short',
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

  function formatBytes(n) {
    var x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return '—';
    if (x < 1024) return x + ' B';
    if (x < 1048576) return (x / 1024).toFixed(1) + ' KB';
    return (x / 1048576).toFixed(1) + ' MB';
  }

  function countByType(items, type) {
    return items.filter(function (it) {
      return it.type === type;
    }).length;
  }

  function filteredItems() {
    var q = String(state.search || '')
      .trim()
      .toLowerCase();
    return state.items
      .filter(function (it) {
        if (state.filter !== 'all' && it.type !== state.filter) return false;
        if (!q) return true;
        var hay =
          (it.name || '') +
          ' ' +
          (it.path || '') +
          (it.details ? ' ' + JSON.stringify(it.details) : '');
        return hay.toLowerCase().indexOf(q) >= 0;
      })
      .sort(function (a, b) {
        var da = a.created ? new Date(a.created).getTime() : 0;
        var db = b.created ? new Date(b.created).getTime() : 0;
        return db - da;
      });
  }

  function setStatus(html, isError) {
    var el = document.getElementById('portalDocumentsStatus');
    if (!el) return;
    el.className = 'portal-forms-status' + (isError ? ' is-error' : '');
    el.innerHTML = html || '';
  }

  function updateStats(items) {
    var map = {
      timesheet: countByType(items, 'timesheet'),
      expense: countByType(items, 'expense'),
      portalpin: countByType(items, 'portalpin'),
      checklist: countByType(items, 'checklist'),
      passport: countByType(items, 'passport'),
      certificate: countByType(items, 'certificate'),
      firstaid: countByType(items, 'firstaid')
    };
    document.querySelectorAll('[data-portal-doc-stat]').forEach(function (el) {
      var k = el.getAttribute('data-portal-doc-stat');
      if (map[k] != null) el.textContent = String(map[k]);
    });
    var applicants = global._portalDocsApplicants || [];
    var metaEl = document.getElementById('portalDocumentsMeta');
    if (metaEl) {
      metaEl.textContent =
        items.length +
        ' file' +
        (items.length === 1 ? '' : 's') +
        ' from Portal Supabase' +
        (applicants.length
          ? ' · ' + applicants.length + ' onboarding applicant' + (applicants.length === 1 ? '' : 's')
          : '');
    }
  }

  async function getSignedUrl(path, bucket, source) {
    var body = await edgePost('portal-admin-hr-file-signed-url', {
      path: path,
      bucket: bucket || 'club-files',
      source: source || 'portal'
    });
    if (body.error || !body.data || !body.data.signed_url) return null;
    return body.data.signed_url;
  }

  async function openPreview(idx) {
    var row = global._portalDocumentsCurrent && global._portalDocumentsCurrent[idx];
    if (!row || !row.path) return;
    state.previewIdx = idx;
    var panel = document.getElementById('portalDocumentsPreview');
    var frame = document.getElementById('portalDocumentsPreviewFrame');
    var title = document.getElementById('portalDocumentsPreviewTitle');
    var root = document.getElementById('portalDocumentsRoot');
    if (root) root.classList.add('portal-documents--has-preview');
    if (panel) panel.hidden = false;
    if (title) title.textContent = row.name || 'Document';
    if (frame) frame.removeAttribute('src');
    setStatus('<strong>Opening…</strong> Generating a secure link.');
    var url = await getSignedUrl(row.path, row.storageBucket, row.source);
    setStatus('');
    if (!url) {
      try { window.alert('Could not open file. Sign in again or check admin allow-list.'); } catch (_e) {}
      return;
    }
    if (frame) frame.src = url;
    var openBtn = document.getElementById('portalDocumentsPreviewOpen');
    if (openBtn) openBtn.onclick = function () { window.open(url, '_blank', 'noopener,noreferrer'); };
    var dlBtn = document.getElementById('portalDocumentsPreviewDownload');
    if (dlBtn) dlBtn.onclick = function () {
      var a = document.createElement('a');
      a.href = url;
      a.download = row.name || 'document.pdf';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }

  function closePreview() {
    state.previewIdx = -1;
    var panel = document.getElementById('portalDocumentsPreview');
    var frame = document.getElementById('portalDocumentsPreviewFrame');
    var root = document.getElementById('portalDocumentsRoot');
    if (frame) frame.removeAttribute('src');
    if (panel) panel.hidden = true;
    if (root) root.classList.remove('portal-documents--has-preview');
  }

  function rowMetaHtml(it) {
    if (it.type === 'expense' && it.details) {
      var ex = it.details;
      return (
        (ex.category ? 'Category: ' + esc(ex.category) + ' · ' : '') +
        (ex.related_date ? 'Date: ' + esc(ex.related_date) : '')
      );
    }
    return it.path ? esc(it.path) : '';
  }

  function renderTable(items) {
    var tbody = document.getElementById('portalDocumentsTbody');
    if (!tbody) return;
    global._portalDocumentsCurrent = items;
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="muted" style="padding:16px">No files match this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(function (it, idx) {
        var typeLabel = TYPE_LABELS[it.type] || it.type || 'Other';
        return (
          '<tr class="portal-documents-data-row" data-portal-doc-idx="' + idx + '">' +
          '<td><span class="portal-documents-type-pill portal-documents-type-pill--' + esc(it.type) + '">' + esc(typeLabel) + '</span></td>' +
          '<td><div class="portal-forms-cell-main">' + esc(it.name) + '</div><div class="portal-forms-cell-sub">' + rowMetaHtml(it) + '</div></td>' +
          '<td style="white-space:nowrap">' + esc(formatDate(it.created)) + '</td>' +
          '<td style="white-space:nowrap">' + esc(formatBytes(it.size)) + '</td>' +
          '<td>' + (it.path ? '<button type="button" class="portal-forms-view-btn" data-portal-doc-view="' + idx + '">View</button>' : '—') + '</td></tr>'
        );
      })
      .join('');
    tbody.querySelectorAll('[data-portal-doc-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        void openPreview(Number(btn.getAttribute('data-portal-doc-view')));
      });
    });
  }

  async function refresh() {
    var btn = document.getElementById('portalDocumentsRefresh');
    if (btn) btn.disabled = true;
    setStatus('<strong>Loading…</strong> Fetching documents from Supabase.');
    try {
      state.items = await loadAllItems();
      updateStats(state.items);
      renderTable(filteredItems());
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus(
        '<strong>Error</strong> ' + esc(err.message || String(err)),
        true
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindModule() {
    var root = document.getElementById('portalDocumentsRoot');
    if (!root || root.getAttribute('data-portal-documents-bound') === '1') return;
    root.setAttribute('data-portal-documents-bound', '1');

    var refreshBtn = document.getElementById('portalDocumentsRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      void refresh();
    });

    var search = document.getElementById('portalDocumentsSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.search = search.value || '';
        renderTable(filteredItems());
      });
    }

    function applyActiveCard() {
      root.querySelectorAll('[data-portal-doc-filter]').forEach(function (c) {
        c.classList.toggle('is-active', c.getAttribute('data-portal-doc-filter') === state.filter);
      });
    }

    root.querySelectorAll('[data-portal-doc-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var key = chip.getAttribute('data-portal-doc-filter') || 'all';
        // Click the already-active card to clear back to all.
        state.filter = (state.filter === key) ? 'all' : key;
        applyActiveCard();
        closePreview();
        renderTable(filteredItems());
      });
    });

    var closeBtn = document.getElementById('portalDocumentsPreviewClose');
    if (closeBtn) closeBtn.addEventListener('click', closePreview);

    // Preset filter from the sidebar sub-menu (e.g. clicking "Expenses") or from
    // an onboarding document chip (which also presets a search + auto-open).
    var preset = String(global.__portalDocsPresetFilter || '').trim();
    if (preset && (preset === 'all' || TYPE_LABELS[preset])) {
      state.filter = preset;
    }
    var presetSearch = String(global.__portalDocsPresetSearch || '').trim();
    if (presetSearch) {
      state.search = presetSearch;
      if (search) search.value = presetSearch;
    }
    var autoOpen = global.__portalDocsAutoOpen === true;
    // One-shot presets: clear so a later plain visit is not stuck filtered.
    global.__portalDocsPresetFilter = '';
    global.__portalDocsPresetSearch = '';
    global.__portalDocsAutoOpen = false;
    applyActiveCard();

    refresh().then(function () {
      if (!autoOpen) return;
      var items = global._portalDocumentsCurrent || [];
      if (items.length) void openPreview(0);
    });
  }

  function statCardsHtml() {
    return STAT_CARDS.map(function (c) {
      return (
        '<button type="button" class="portal-documents-statcard" data-portal-doc-filter="' + esc(c.key) + '">' +
        '<span class="portal-documents-statcard-num" data-portal-doc-stat="' + esc(c.key) + '">0</span>' +
        '<span class="portal-documents-statcard-label">' + esc(c.label) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function styleHtml() {
    return (
      '<style>' +
      '#portalDocumentsRoot .portal-documents-statrow{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 16px}' +
      '#portalDocumentsRoot .portal-documents-statcard{flex:1 1 120px;min-width:110px;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;cursor:pointer;text-align:left;transition:border-color .12s,box-shadow .12s}' +
      '#portalDocumentsRoot .portal-documents-statcard:hover{border-color:var(--brand,#2563eb)}' +
      '#portalDocumentsRoot .portal-documents-statcard.is-active{border-color:var(--brand,#2563eb);box-shadow:0 0 0 2px rgba(37,99,235,.18)}' +
      '#portalDocumentsRoot .portal-documents-statcard-num{font-size:22px;font-weight:800;color:var(--ink,#0f172a);line-height:1.1}' +
      '#portalDocumentsRoot .portal-documents-statcard-label{font-size:12px;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.03em}' +
      '#portalDocumentsRoot .portal-documents-main{display:flex;gap:16px;align-items:flex-start;min-width:0}' +
      '#portalDocumentsRoot .portal-documents-listcol{flex:1 1 auto;min-width:0}' +
      '#portalDocumentsRoot .portal-documents-preview{flex:0 0 420px;max-width:46%;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:var(--card,#fff);overflow:hidden;display:flex;flex-direction:column;min-height:440px}' +
      '#portalDocumentsRoot.portal-documents--has-preview .portal-documents-listcol{flex:1 1 0}' +
      '#portalDocumentsRoot .portal-documents-preview-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb)}' +
      '#portalDocumentsRoot .portal-documents-preview-title{flex:1;min-width:0;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#portalDocumentsRoot .portal-documents-preview-frame{flex:1;width:100%;border:0;min-height:380px;background:#f8fafc}' +
      '#portalDocumentsRoot .portal-documents-preview-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--line,#e5e7eb)}' +
      '@media(max-width:860px){#portalDocumentsRoot .portal-documents-main{flex-direction:column}#portalDocumentsRoot .portal-documents-preview{flex:1 1 auto;max-width:none;width:100%}}' +
      '</style>'
    );
  }

  function viewHtml() {
    return (
      '<div id="portalDocumentsRoot" class="portal-documents-embed portal-day-ops-embed" data-portal-documents-bound="0">' +
      styleHtml() +
      '<h1 class="page-title">Documents</h1>' +
      '<p class="page-intro" id="portalDocumentsMeta">Timesheets, expenses, and onboarding uploads from Portal Supabase.</p>' +
      '<div id="portalDocumentsStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-documents-toolbar">' +
      '<input type="search" class="inp" id="portalDocumentsSearch" placeholder="Search files, names…" style="max-width:280px;min-width:0" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalDocumentsRefresh">Refresh</button>' +
      '</div>' +
      '<div class="portal-documents-statrow">' + statCardsHtml() + '</div>' +
      '<div class="portal-documents-main">' +
      '<div class="portal-documents-listcol">' +
      '<div class="portal-forms-table-wrap">' +
      '<table class="portal-forms-table portal-forms-table--full-detail">' +
      '<thead><tr><th>Type</th><th>Name / details</th><th>Uploaded</th><th>Size</th><th>View</th></tr></thead>' +
      '<tbody id="portalDocumentsTbody"><tr><td colspan="5" class="muted" style="padding:16px">Loading…</td></tr></tbody>' +
      '</table></div></div>' +
      '<aside class="portal-documents-preview" id="portalDocumentsPreview" hidden>' +
      '<div class="portal-documents-preview-head">' +
      '<span class="portal-documents-preview-title" id="portalDocumentsPreviewTitle">Document</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalDocumentsPreviewClose" aria-label="Close preview">✕</button>' +
      '</div>' +
      '<iframe class="portal-documents-preview-frame" id="portalDocumentsPreviewFrame" title="Document preview"></iframe>' +
      '<div class="portal-documents-preview-foot">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalDocumentsPreviewOpen">Open</button>' +
      '<button type="button" class="btn btn--pri btn--sm" id="portalDocumentsPreviewDownload">Download</button>' +
      '</div>' +
      '</aside>' +
      '</div></div>'
    );
  }

  global.PortalDocuments = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh
  };
})(typeof window !== 'undefined' ? window : globalThis);
