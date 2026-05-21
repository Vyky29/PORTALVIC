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
    checklist: 'Checklist',
    passport: 'Passport',
    certificate: 'Certificate',
    firstaid: 'First aid',
    safeguarding: 'Safeguarding',
    other: 'Other'
  };

  var state = {
    filter: 'all',
    search: '',
    items: []
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
      return {
        type: 'expense',
        name: r.title || r.name || 'Expense report',
        path: r.file_url || r.path || '',
        storageBucket: 'documents',
        size: null,
        created: r.created_at || null,
        source: 'portal',
        details: r
      };
    });
  }

  function normalizeTimesheetRows(rows) {
    return (rows || []).map(function (r) {
      return {
        type: 'timesheet',
        name: r.name || r.label || r.path || 'Timesheet',
        path: r.path || r.file_path || '',
        storageBucket: r.bucket || r.storage_bucket || 'club-files',
        size: r.size || null,
        created: r.created_at || r.uploaded_at || null,
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
      return {
        type: type,
        name: r.name || r.path || 'File',
        path: r.path || '',
        storageBucket: r.storage_bucket || r.bucket || 'club-files',
        size: r.size || null,
        created: r.created_at || r.uploaded_at || null,
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

  function formatDate(iso) {
    if (!iso) return '—';
    try {
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

  async function openSignedUrl(path, bucket, source) {
    var body = await edgePost('portal-admin-hr-file-signed-url', {
      path: path,
      bucket: bucket || 'club-files',
      source: source || 'portal'
    });
    if (body.error || !body.data || !body.data.signed_url) {
      try {
        window.alert('Could not open file. Sign in again or check admin allow-list.');
      } catch (_e) {}
      return;
    }
    window.open(body.data.signed_url, '_blank', 'noopener,noreferrer');
  }

  function renderTable(items) {
    var tbody = document.getElementById('portalDocumentsTbody');
    if (!tbody) return;
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="muted" style="padding:16px">No files match this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(function (it, idx) {
        var typeLabel = TYPE_LABELS[it.type] || it.type || 'Other';
        var meta = '';
        if (it.type === 'expense' && it.details) {
          var ex = it.details;
          meta =
            (ex.category ? 'Category: ' + esc(ex.category) + ' · ' : '') +
            (ex.related_date ? 'Date: ' + esc(ex.related_date) : '');
        } else if (it.path) {
          meta = esc(it.path);
        }
        return (
          '<tr class="portal-documents-data-row" data-portal-doc-idx="' +
          idx +
          '">' +
          '<td><span class="portal-documents-type-pill portal-documents-type-pill--' +
          esc(it.type) +
          '">' +
          esc(typeLabel) +
          '</span></td>' +
          '<td><div class="portal-forms-cell-main">' +
          esc(it.name) +
          '</div><div class="portal-forms-cell-sub">' +
          meta +
          '</div></td>' +
          '<td style="white-space:nowrap">' +
          esc(formatDate(it.created)) +
          '</td>' +
          '<td style="white-space:nowrap">' +
          esc(formatBytes(it.size)) +
          '</td>' +
          '<td>' +
          (it.path
            ? '<button type="button" class="portal-forms-view-btn" data-portal-doc-view="' +
              idx +
              '">View</button>'
            : '—') +
          '</td></tr>'
        );
      })
      .join('');
    global._portalDocumentsCurrent = items;
    tbody.querySelectorAll('[data-portal-doc-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-portal-doc-view'));
        var row = global._portalDocumentsCurrent && global._portalDocumentsCurrent[idx];
        if (!row || !row.path) return;
        void openSignedUrl(row.path, row.storageBucket, row.source);
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

    root.querySelectorAll('[data-portal-doc-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.filter = chip.getAttribute('data-portal-doc-filter') || 'all';
        root.querySelectorAll('[data-portal-doc-filter]').forEach(function (c) {
          c.classList.toggle('is-active', c === chip);
        });
        renderTable(filteredItems());
      });
    });

    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalDocumentsRoot" class="portal-documents-embed portal-day-ops-embed" data-portal-documents-bound="0">' +
      '<h1 class="page-title">Documents</h1>' +
      '<p class="page-intro" id="portalDocumentsMeta">Timesheets, expenses, and onboarding uploads from Portal Supabase.</p>' +
      '<div id="portalDocumentsStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-documents-toolbar">' +
      '<input type="search" class="inp" id="portalDocumentsSearch" placeholder="Search files, names…" style="max-width:280px;min-width:0" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalDocumentsRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="policies">Policies &amp; compliance</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="onboarding">Onboarding progress</button>' +
      '</div>' +
      '<div class="portal-documents-stats">' +
      '<button type="button" class="portal-documents-stat is-active" data-portal-doc-filter="all">All</button>' +
      '<button type="button" class="portal-documents-stat" data-portal-doc-filter="timesheet">Timesheets <span data-portal-doc-stat="timesheet">0</span></button>' +
      '<button type="button" class="portal-documents-stat" data-portal-doc-filter="expense">Expenses <span data-portal-doc-stat="expense">0</span></button>' +
      '<button type="button" class="portal-documents-stat" data-portal-doc-filter="checklist">Checklists <span data-portal-doc-stat="checklist">0</span></button>' +
      '<button type="button" class="portal-documents-stat" data-portal-doc-filter="passport">Passports <span data-portal-doc-stat="passport">0</span></button>' +
      '<button type="button" class="portal-documents-stat" data-portal-doc-filter="certificate">Certificates <span data-portal-doc-stat="certificate">0</span></button>' +
      '<button type="button" class="portal-documents-stat" data-portal-doc-filter="firstaid">First aid <span data-portal-doc-stat="firstaid">0</span></button>' +
      '</div>' +
      '<div class="portal-forms-table-wrap">' +
      '<table class="portal-forms-table portal-forms-table--full-detail">' +
      '<thead><tr><th>Type</th><th>Name</th><th>Uploaded</th><th>Size</th><th></th></tr></thead>' +
      '<tbody id="portalDocumentsTbody"><tr><td colspan="5" class="muted" style="padding:16px">Loading…</td></tr></tbody>' +
      '</table></div></div>'
    );
  }

  global.PortalDocuments = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh
  };
})(typeof window !== 'undefined' ? window : globalThis);
