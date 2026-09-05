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
    },
    toast: function (m) {
      try {
        console.log('[documents]', m);
      } catch (_e) {}
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
    other: 'Other',
    admin_upload: 'Admin upload'
  };

  /** Types office can attach for a worker (My Documents). Payslips stay on Payslips screen. */
  var ADMIN_UPLOAD_TYPES = [
    { key: 'certificate', label: 'Certificate', category: 'training' },
    { key: 'passport', label: 'Passport', category: 'documents' },
    { key: 'checklist', label: 'Checklist', category: 'documents' },
    { key: 'firstaid', label: 'First aid', category: 'training' },
    { key: 'safeguarding', label: 'Safeguarding', category: 'training' },
    { key: 'other', label: 'Other document', category: 'documents' }
  ];

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
    previewIdx: -1,
    expenseUnpaidCount: 0,
    staff: [],
    uploading: false
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
  }

  function client() {
    return cfg.getClient ? cfg.getClient() : null;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  async function waitForClient(maxWaitMs) {
    maxWaitMs = maxWaitMs || 15000;
    var sb = cfg.getClient ? cfg.getClient() : null;
    if (sb) return sb;
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(found) {
        if (settled) return;
        settled = true;
        clearInterval(pollId);
        clearTimeout(timeoutId);
        window.removeEventListener('portal:supabase-ready', onReady);
        if (found) resolve(found);
        else reject(new Error('Supabase client not available.'));
      }
      function onReady() {
        done(cfg.getClient ? cfg.getClient() : null);
      }
      window.addEventListener('portal:supabase-ready', onReady);
      var pollId = setInterval(function () {
        var live = cfg.getClient ? cfg.getClient() : null;
        if (live) done(live);
      }, 50);
      var timeoutId = setTimeout(function () {
        done(cfg.getClient ? cfg.getClient() : null);
      }, maxWaitMs);
    });
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
        id: r.id || '',
        name: exName,
        path: exPath,
        storageBucket: 'documents',
        size: null,
        amount: r.expense_amount != null && Number.isFinite(Number(r.expense_amount))
          ? Number(r.expense_amount)
          : null,
        created: r.created_at || deriveCreatedFromName(exName, exPath),
        source: 'portal',
        isPaid: !!r.is_paid || !!r.expense_admin_paid_at,
        expenseAdminPaidAt: r.expense_admin_paid_at || null,
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
        id: r.id || '',
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

  function staffNameById(id) {
    var want = String(id || '').trim();
    for (var i = 0; i < state.staff.length; i++) {
      if (String(state.staff[i].id || '') === want) {
        return String(state.staff[i].full_name || state.staff[i].username || 'Worker').trim();
      }
    }
    return 'Worker';
  }

  function sanitizeFilenamePart(s) {
    return String(s || 'document')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'document';
  }

  function adminUploadTypeMeta(key) {
    var k = String(key || '').trim().toLowerCase();
    for (var i = 0; i < ADMIN_UPLOAD_TYPES.length; i++) {
      if (ADMIN_UPLOAD_TYPES[i].key === k) return ADMIN_UPLOAD_TYPES[i];
    }
    return ADMIN_UPLOAD_TYPES[ADMIN_UPLOAD_TYPES.length - 1];
  }

  function normalizeAdminWorkerDocRows(rows) {
    return (rows || []).map(function (r) {
      var type = String(r.document_type || 'other').toLowerCase();
      if (type === 'training_external_certificate') type = 'certificate';
      var worker = staffNameById(r.user_id);
      var title = String(r.title || type || 'Document').trim();
      return {
        type: type,
        id: r.id || '',
        name: worker + ' — ' + title,
        path: r.file_url || '',
        storageBucket: 'documents',
        size: null,
        created: r.created_at || null,
        source: 'portal',
        adminAttach: true,
        details: r
      };
    });
  }

  async function loadStaffDirectory() {
    var sb = client();
    if (!sb) sb = await waitForClient();
    var resp = await sb
      .from('staff_profiles')
      .select('id, full_name, username')
      .order('full_name', { ascending: true });
    if (resp.error) throw resp.error;
    state.staff = resp.data || [];
  }

  async function loadAdminWorkerDocs() {
    var sb = client();
    if (!sb) sb = await waitForClient();
    var resp = await sb
      .from('documents')
      .select('id, user_id, title, document_type, category, created_at, file_url, source_page')
      .eq('source_page', 'admin_documents')
      .order('created_at', { ascending: false })
      .limit(400);
    if (resp.error) throw resp.error;
    return normalizeAdminWorkerDocRows(resp.data || []);
  }

  async function loadAllItems() {
    var out = [];
    try {
      await loadStaffDirectory();
    } catch (staffErr) {
      console.warn('[documents] staff directory', staffErr);
    }
    try {
      out = out.concat(await loadAdminWorkerDocs());
    } catch (adminErr) {
      console.warn('[documents] admin worker docs', adminErr);
    }
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
    var ex = await edgePost('portal-admin-expenses-list', { unpaid_since: '2026-04-01' });
    if (!ex.error) {
      global._portalDocsExpensesMeta = ex.data.meta || {};
      state.expenseUnpaidCount = Number((ex.data.meta && ex.data.meta.unpaid_count) || 0);
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

  function formatMoney(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '—';
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP'
      }).format(x);
    } catch (_e) {
      return '£' + x.toFixed(2);
    }
  }

  function amountOrSizeCell(it) {
    if (it.type === 'expense') {
      if (it.amount != null && Number.isFinite(Number(it.amount))) {
        return formatMoney(it.amount);
      }
      if (it.details && it.details.expense_amount != null) {
        return formatMoney(it.details.expense_amount);
      }
      return '—';
    }
    return formatBytes(it.size);
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
    if (openBtn) openBtn.onclick = function () {
      try {
        var a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        if (a.parentNode) a.parentNode.removeChild(a);
      } catch (_e) {
        try { window.open(url, '_blank'); } catch (_e2) {}
      }
    };
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

  async function markExpensePaid(documentId, paid) {
    var res = await edgePost('portal-admin-expense-mark-paid', {
      document_id: documentId,
      paid: paid !== false
    });
    if (res.error) throw new Error(res.error);
    if (typeof global.portalAdminBellRemoveExpenseUnpaid === 'function') {
      global.portalAdminBellRemoveExpenseUnpaid(documentId);
    }
    return res.data;
  }

  async function deleteDocument(item) {
    var payload;
    if (item.id) {
      payload = { document_id: item.id };
    } else if (item.path) {
      payload = {
        path: item.path,
        bucket: item.storageBucket || 'documents',
        source: item.source || 'portal'
      };
    } else {
      throw new Error('Nothing to delete for this row.');
    }
    var res = await edgePost('portal-admin-document-delete', payload);
    if (res.error) throw new Error(res.error);
    if (item.type === 'expense' && item.id &&
        typeof global.portalAdminBellRemoveExpenseUnpaid === 'function') {
      global.portalAdminBellRemoveExpenseUnpaid(item.id);
    }
    return res.data;
  }

  function renderExpenseUnpaidBanner() {
    var el = document.getElementById('portalDocumentsExpenseBanner');
    if (!el) return;
    var n = state.expenseUnpaidCount || 0;
    if (!n) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<div class="portal-documents-expense-banner" role="status">' +
      '<strong>' + esc(String(n)) + ' expense' + (n === 1 ? '' : 's') + ' pending payment</strong>' +
      '<span>Since April 2026 — remember to include them in monthly payroll.</span>' +
      '</div>';
  }

  function rowMetaHtml(it) {
    if (it.type === 'expense' && it.details) {
      var ex = it.details;
      var bits = [];
      if (ex.category) bits.push('Category: ' + esc(ex.category));
      if (ex.related_date) bits.push('Date: ' + esc(ex.related_date));
      if (it.isPaid) {
        bits.push('<span class="portal-documents-expense-paid">Paid</span>');
      } else {
        bits.push('<span class="portal-documents-expense-unpaid">Pending payment</span>');
      }
      return bits.join(' · ');
    }
    return it.path ? esc(it.path) : '';
  }

  function renderTable(items) {
    var tbody = document.getElementById('portalDocumentsTbody');
    if (!tbody) return;
    var th = document.getElementById('portalDocumentsAmountSizeTh');
    if (th) {
      th.textContent = state.filter === 'expense' ? 'Amount' : 'Amount / size';
    }
    global._portalDocumentsCurrent = items;
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="muted" style="padding:16px">No files match this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(function (it, idx) {
        var typeLabel = TYPE_LABELS[it.type] || it.type || 'Other';
        var actionHtml = '—';
        if (it.path) {
          actionHtml = '<button type="button" class="portal-forms-view-btn" data-portal-doc-view="' + idx + '">View</button>';
        }
        if (it.type === 'expense' && it.id) {
          var paidLabel = it.isPaid ? 'Mark unpaid' : 'Mark paid';
          var paidClass = it.isPaid ? 'portal-forms-view-btn' : 'portal-forms-view-btn portal-documents-expense-mark-btn';
          actionHtml +=
            ' <button type="button" class="' + paidClass + '" data-portal-expense-paid="' + esc(it.id) + '" data-portal-expense-is-paid="' + (it.isPaid ? '1' : '0') + '">' + paidLabel + '</button>';
        }
        if (it.id || it.path) {
          actionHtml +=
            ' <button type="button" class="portal-forms-view-btn portal-documents-delete-btn" data-portal-doc-delete="' + idx + '">Delete</button>';
        }
        return (
          '<tr class="portal-documents-data-row" data-portal-doc-idx="' + idx + '">' +
          '<td><span class="portal-documents-type-pill portal-documents-type-pill--' + esc(it.type) + '">' + esc(typeLabel) + '</span></td>' +
          '<td><div class="portal-forms-cell-main">' + esc(it.name) + '</div><div class="portal-forms-cell-sub">' + rowMetaHtml(it) + '</div></td>' +
          '<td style="white-space:nowrap">' + esc(formatDate(it.created)) + '</td>' +
          '<td style="white-space:nowrap">' + esc(amountOrSizeCell(it)) + '</td>' +
          '<td style="white-space:nowrap">' + actionHtml + '</td></tr>'
        );
      })
      .join('');
    tbody.querySelectorAll('[data-portal-doc-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        void openPreview(Number(btn.getAttribute('data-portal-doc-view')));
      });
    });
    tbody.querySelectorAll('[data-portal-expense-paid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var docId = String(btn.getAttribute('data-portal-expense-paid') || '').trim();
        var isPaid = btn.getAttribute('data-portal-expense-is-paid') === '1';
        if (!docId) return;
        btn.disabled = true;
        void markExpensePaid(docId, !isPaid)
          .then(function () { return refresh(); })
          .catch(function (err) {
            console.error(err);
            setStatus('<strong>Error</strong> ' + esc(err.message || String(err)), true);
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    });
    tbody.querySelectorAll('[data-portal-doc-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var didx = Number(btn.getAttribute('data-portal-doc-delete'));
        var it = global._portalDocumentsCurrent && global._portalDocumentsCurrent[didx];
        if (!it) return;
        var typeLabel = TYPE_LABELS[it.type] || it.type || 'document';
        var confirmMsg =
          'Delete this ' + typeLabel.toLowerCase() + '?\n\n' +
          (it.name || '(unnamed)') + '\n\n' +
          'This permanently removes the file and cannot be undone.';
        var ok = false;
        try { ok = window.confirm(confirmMsg); } catch (_e) { ok = true; }
        if (!ok) return;
        btn.disabled = true;
        setStatus('<strong>Deleting…</strong> Removing ' + esc(it.name || 'file') + '.');
        void deleteDocument(it)
          .then(function () {
            setStatus('<strong>Deleted.</strong> ' + esc(it.name || 'File') + ' removed.');
            return refresh();
          })
          .catch(function (err) {
            console.error(err);
            setStatus('<strong>Error</strong> ' + esc(err.message || String(err)), true);
            btn.disabled = false;
          });
      });
    });
  }

  async function refresh() {
    var btn = document.getElementById('portalDocumentsRefresh');
    if (btn) btn.disabled = true;
    setStatus('<strong>Loading…</strong> Fetching documents from Supabase.');
    try {
      await waitForClient();
      state.items = await loadAllItems();
      updateStats(state.items);
      renderExpenseUnpaidBanner();
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

  function bindStaffCombo() {
    var input = document.getElementById('portalDocumentsStaffInput');
    var hidden = document.getElementById('portalDocumentsStaff');
    var suggest = document.getElementById('portalDocumentsStaffSuggest');
    if (!input || !hidden || !suggest) return;
    if (input.getAttribute('data-docs-staff-bound') === '1') return;
    input.setAttribute('data-docs-staff-bound', '1');

    function hideSuggest() {
      suggest.hidden = true;
      suggest.innerHTML = '';
    }

    function pickStaff(s) {
      if (!s) return;
      hidden.value = String(s.id || '');
      input.value = String(s.full_name || s.username || '').trim();
      hideSuggest();
    }

    function renderSuggest(q) {
      var needle = String(q || '')
        .trim()
        .toLowerCase();
      var matches = (state.staff || []).filter(function (s) {
        var label = String(s.full_name || s.username || '')
          .trim()
          .toLowerCase();
        if (!needle) return true;
        return label.indexOf(needle) >= 0;
      }).slice(0, 12);
      if (!matches.length) {
        hideSuggest();
        return;
      }
      suggest.innerHTML = matches
        .map(function (s) {
          var label = String(s.full_name || s.username || 'Worker').trim();
          return (
            '<button type="button" class="portal-documents-suggest__btn" role="option" data-staff-id="' +
            esc(s.id) +
            '">' +
            esc(label) +
            '</button>'
          );
        })
        .join('');
      suggest.hidden = false;
      suggest.querySelectorAll('[data-staff-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-staff-id');
          var hit = state.staff.find(function (s) {
            return String(s.id) === String(id);
          });
          pickStaff(hit);
        });
      });
    }

    input.addEventListener('focus', function () {
      renderSuggest(input.value);
    });
    input.addEventListener('input', function () {
      hidden.value = '';
      renderSuggest(input.value);
    });
    input.addEventListener('blur', function () {
      setTimeout(hideSuggest, 180);
    });
  }

  async function handleUpload(ev) {
    ev.preventDefault();
    if (state.uploading) return;
    var staffSel = document.getElementById('portalDocumentsStaff');
    var staffInput = document.getElementById('portalDocumentsStaffInput');
    var typeSel = document.getElementById('portalDocumentsType');
    var titleInput = document.getElementById('portalDocumentsTitle');
    var fileInput = document.getElementById('portalDocumentsFile');
    var staffId = staffSel ? String(staffSel.value || '').trim() : '';
    if (!staffId && staffInput) {
      var typed = String(staffInput.value || '')
        .trim()
        .toLowerCase();
      if (typed) {
        var hit = state.staff.find(function (s) {
          var label = String(s.full_name || s.username || '')
            .trim()
            .toLowerCase();
          return label === typed;
        });
        if (hit) staffId = String(hit.id || '').trim();
      }
    }
    var typeKey = typeSel ? String(typeSel.value || '').trim().toLowerCase() : 'other';
    var meta = adminUploadTypeMeta(typeKey);
    var title = titleInput ? String(titleInput.value || '').trim() : '';
    var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (!staffId) {
      setStatus('<strong>Select a worker</strong> before attaching a file.', true);
      return;
    }
    if (!title) {
      setStatus('<strong>Enter a title</strong> so the worker can recognise the file.', true);
      return;
    }
    if (!file) {
      setStatus('<strong>Choose a file</strong> (PDF or image).', true);
      return;
    }
    var mime = String(file.type || '').toLowerCase();
    var okMime =
      !mime ||
      mime === 'application/pdf' ||
      mime === 'image/jpeg' ||
      mime === 'image/png';
    if (!okMime) {
      setStatus('<strong>PDF or image only</strong> — PDF, JPG or PNG.', true);
      return;
    }

    var sb = client();
    if (!sb) {
      try {
        sb = await waitForClient();
      } catch (_) {
        sb = null;
      }
    }
    if (!sb) {
      setStatus('<strong>Not signed in</strong> — refresh and try again.', true);
      return;
    }

    var ext = 'pdf';
    if (mime === 'image/png' || /\.png$/i.test(file.name || '')) ext = 'png';
    else if (mime === 'image/jpeg' || /\.jpe?g$/i.test(file.name || '')) ext = 'jpg';
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var filename = stamp + '_' + sanitizeFilenamePart(title) + '.' + ext;
    var storagePath = staffId + '/admin_documents/' + meta.key + '/' + filename;
    var contentType =
      ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/pdf';

    state.uploading = true;
    var btn = document.getElementById('portalDocumentsUploadSubmit');
    if (btn) btn.disabled = true;
    setStatus(
      '<strong>Uploading…</strong> ' +
        esc(title) +
        ' for ' +
        esc(staffNameById(staffId)) +
        '.'
    );

    try {
      var up = await sb.storage.from('documents').upload(storagePath, file, {
        contentType: contentType,
        upsert: false
      });
      if (up.error) throw up.error;

      var ins = await sb.from('documents').insert([
        {
          user_id: staffId,
          document_type: meta.key,
          category: meta.category,
          title: title,
          related_date: null,
          file_url: storagePath,
          source_page: 'admin_documents'
        }
      ]);
      if (ins.error) throw ins.error;

      if (fileInput) fileInput.value = '';
      if (titleInput) titleInput.value = '';
      cfg.toast('Document attached for ' + staffNameById(staffId));
      setStatus(
        '<strong>Attached.</strong> ' +
          esc(title) +
          ' is now in ' +
          esc(staffNameById(staffId)) +
          '’s <em>My Documents</em>.'
      );
      await refresh();
    } catch (err) {
      console.error(err);
      setStatus('<strong>Upload failed</strong> ' + esc(err.message || String(err)), true);
    } finally {
      state.uploading = false;
      if (btn) btn.disabled = false;
    }
  }

  function bindModule() {
    var root = document.getElementById('portalDocumentsRoot');
    if (!root || root.getAttribute('data-portal-documents-bound') === '1') return;
    root.setAttribute('data-portal-documents-bound', '1');

    var form = document.getElementById('portalDocumentsUploadForm');
    if (form) {
      form.addEventListener('submit', function (ev) {
        void handleUpload(ev);
      });
    }

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
        var typeSel = document.getElementById('portalDocumentsType');
        if (typeSel && state.filter !== 'all' && ADMIN_UPLOAD_TYPES.some(function (t) { return t.key === state.filter; })) {
          typeSel.value = state.filter;
        }
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

    var typeSelInit = document.getElementById('portalDocumentsType');
    if (typeSelInit && state.filter !== 'all' && ADMIN_UPLOAD_TYPES.some(function (t) { return t.key === state.filter; })) {
      typeSelInit.value = state.filter;
    }

    bindStaffCombo();

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
      '#portalDocumentsRoot .portal-documents-upload-card{background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:16px 18px;margin:0 0 16px;min-width:0}' +
      '#portalDocumentsRoot .portal-documents-upload-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end;min-width:0}' +
      '#portalDocumentsRoot .portal-documents-upload-card label{display:block;font-size:12px;font-weight:700;color:var(--muted,#64748b);margin:0 0 6px;text-transform:uppercase;letter-spacing:.03em}' +
      '#portalDocumentsRoot .portal-documents-upload-card .inp,#portalDocumentsRoot .portal-documents-upload-card select,#portalDocumentsRoot .portal-documents-upload-card input[type=file]{width:100%;min-width:0;font:inherit;padding:9px 11px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff;color:var(--ink,#0f172a);box-sizing:border-box}' +
      '#portalDocumentsRoot .portal-documents-staff-combo{position:relative;min-width:0;max-width:100%}' +
      '#portalDocumentsRoot .portal-documents-suggest{margin-top:6px;border:1px solid var(--line,#e5e7eb);border-radius:10px;max-height:min(240px,42vh);overflow:auto;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.08);-webkit-overflow-scrolling:touch}' +
      '#portalDocumentsRoot .portal-documents-suggest[hidden]{display:none!important}' +
      '#portalDocumentsRoot .portal-documents-suggest__btn{display:block;width:100%;max-width:100%;min-width:0;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid var(--line,#e5e7eb);background:#fff;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--ink,#0f172a);overflow-wrap:break-word}' +
      '#portalDocumentsRoot .portal-documents-suggest__btn:last-child{border-bottom:0}' +
      '#portalDocumentsRoot .portal-documents-suggest__btn:hover,#portalDocumentsRoot .portal-documents-suggest__btn:focus-visible{background:#f0f7ff;outline:none}' +
      '#portalDocumentsRoot .portal-documents-upload-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}' +
      '#portalDocumentsRoot .portal-documents-main{display:flex;gap:16px;align-items:flex-start;min-width:0}' +
      '#portalDocumentsRoot .portal-documents-listcol{flex:1 1 auto;min-width:0}' +
      '#portalDocumentsRoot .portal-documents-preview{flex:0 0 420px;max-width:46%;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:var(--card,#fff);overflow:hidden;display:flex;flex-direction:column;min-height:440px}' +
      '#portalDocumentsRoot.portal-documents--has-preview .portal-documents-listcol{flex:1 1 0}' +
      '#portalDocumentsRoot .portal-documents-preview-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb)}' +
      '#portalDocumentsRoot .portal-documents-preview-title{flex:1;min-width:0;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#portalDocumentsRoot .portal-documents-preview-frame{flex:1;width:100%;border:0;min-height:380px;background:#f8fafc}' +
      '#portalDocumentsRoot .portal-documents-preview-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--line,#e5e7eb)}' +
      '#portalDocumentsRoot .portal-documents-expense-banner{display:flex;flex-direction:column;gap:4px;padding:12px 14px;margin:0 0 14px;border-radius:12px;border:1px solid #f5c78a;background:#fff7ed;color:#7c2d12;font-size:13px;line-height:1.35}' +
      '#portalDocumentsRoot .portal-documents-expense-banner strong{font-size:14px;color:#9a3412}' +
      '#portalDocumentsRoot .portal-documents-expense-unpaid{color:#b45309;font-weight:700}' +
      '#portalDocumentsRoot .portal-documents-expense-paid{color:#15803d;font-weight:700}' +
      '#portalDocumentsRoot .portal-documents-expense-mark-btn{background:#0b2a5b;color:#fff;border:0}' +
      '#portalDocumentsRoot .portal-documents-delete-btn{background:#fff;color:#b91c1c;border:1px solid #fca5a5}' +
      '#portalDocumentsRoot .portal-documents-delete-btn:hover{background:#fef2f2;border-color:#ef4444}' +
      '#portalDocumentsRoot .portal-documents-delete-btn:disabled{opacity:.6;cursor:default}' +
      '@media(max-width:860px){#portalDocumentsRoot .portal-documents-main{flex-direction:column}#portalDocumentsRoot .portal-documents-preview{flex:1 1 auto;max-width:none;width:100%}}' +
      '</style>'
    );
  }

  function adminUploadTypeOptionsHtml() {
    return ADMIN_UPLOAD_TYPES.map(function (t) {
      return '<option value="' + esc(t.key) + '">' + esc(t.label) + '</option>';
    }).join('');
  }

  function viewHtml() {
    return (
      '<div id="portalDocumentsRoot" class="portal-documents-embed portal-day-ops-embed" data-portal-documents-bound="0">' +
      styleHtml() +
      '<h1 class="page-title">Documents</h1>' +
      '<p class="page-intro" id="portalDocumentsMeta">Attach files for a worker (certificate, passport, checklist, etc.), plus timesheets, expenses and onboarding uploads. Payslips stay under <strong>Payslips</strong>.</p>' +
      '<div id="portalDocumentsExpenseBanner" hidden></div>' +
      '<div id="portalDocumentsStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-documents-upload-card">' +
      '<h2 style="margin:0 0 12px;font-size:16px;color:var(--ink,#0f172a)">Attach file for worker</h2>' +
      '<form id="portalDocumentsUploadForm">' +
      '<div class="portal-documents-upload-grid">' +
      '<div><label for="portalDocumentsStaffInput">Worker</label>' +
      '<div class="portal-documents-staff-combo" id="portalDocumentsStaffCombo">' +
      '<input type="hidden" id="portalDocumentsStaff" value="" />' +
      '<input class="inp" id="portalDocumentsStaffInput" type="text" placeholder="Type to search worker…" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="portalDocumentsStaffSuggest" required />' +
      '<div id="portalDocumentsStaffSuggest" class="portal-documents-suggest" role="listbox" aria-label="Matching workers" hidden></div>' +
      '</div></div>' +
      '<div><label for="portalDocumentsType">Document type</label>' +
      '<select class="inp" id="portalDocumentsType" required>' +
      adminUploadTypeOptionsHtml() +
      '</select></div>' +
      '<div><label for="portalDocumentsTitle">Title</label>' +
      '<input class="inp" id="portalDocumentsTitle" type="text" maxlength="120" placeholder="e.g. DBS certificate · First aid expiring 2027" required /></div>' +
      '<div><label for="portalDocumentsFile">File</label>' +
      '<input type="file" id="portalDocumentsFile" accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png" required /></div>' +
      '</div>' +
      '<div class="portal-documents-upload-actions">' +
      '<button type="submit" class="btn btn--pri" id="portalDocumentsUploadSubmit">Attach to My Documents</button>' +
      '<span class="muted" style="font-size:12px;min-width:0;overflow-wrap:break-word">Visible in the worker’s staff app under My Documents.</span>' +
      '</div>' +
      '</form></div>' +
      '<div class="portal-documents-toolbar">' +
      '<input type="search" class="inp" id="portalDocumentsSearch" placeholder="Search files, names…" style="max-width:280px;min-width:0" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalDocumentsRefresh">Refresh</button>' +
      '</div>' +
      '<div class="portal-documents-statrow">' + statCardsHtml() + '</div>' +
      '<div class="portal-documents-main">' +
      '<div class="portal-documents-listcol">' +
      '<div class="portal-forms-table-wrap">' +
      '<table class="portal-forms-table portal-forms-table--full-detail">' +
      '<thead><tr><th>Type</th><th>Name / details</th><th>Uploaded</th><th id="portalDocumentsAmountSizeTh">Amount</th><th>View</th></tr></thead>' +
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
