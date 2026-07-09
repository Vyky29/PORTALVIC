/**
 * Admin — share client invoice PDFs with the parent hub (Phase 1: view only).
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

  var state = { filter: 'all', invoices: [], meta: {}, searchHits: [] };

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
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
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

  async function api(path, body, isForm) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var headers = {
      Authorization: 'Bearer ' + token,
      apikey: cfg.getAnonKey()
    };
    var opts = { method: 'POST', headers: headers };
    if (isForm) {
      opts.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }
    var res = await fetch(supabaseBase() + '/functions/v1/' + path, opts);
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

  function statusChip(payment, share) {
    var pay = String(payment || 'unpaid');
    var sh = String(share || 'hidden');
    var tone = 'pend';
    if (pay === 'paid') tone = 'ok';
    else if (pay === 'void') tone = 'warn';
    else if (pay === 'partial') tone = 'info';
    else if (pay === 'pending_confirmation') tone = 'pend';
    return (
      '<span class="chip chip--' +
      tone +
      '">' +
      esc(pay.replace(/_/g, ' ')) +
      '</span> ' +
      '<span class="chip chip--' +
      (sh === 'ready' ? 'ok' : 'warn') +
      '">' +
      esc(sh) +
      '</span>'
    );
  }

  function rowHtml(inv) {
    var id = esc(inv.id);
    var reportBits = [];
    if (inv.parent_reported_paid_at) {
      reportBits.push('Reported ' + formatDate(inv.parent_reported_paid_at));
    }
    if (inv.parent_reported_ref) reportBits.push('ref ' + inv.parent_reported_ref);
    if (inv.parent_reported_method) reportBits.push(inv.parent_reported_method);
    var linkBits = [];
    if (inv.gocardless_url) linkBits.push('GoCardless');
    if (inv.payment_link_url) linkBits.push('Payment link');
    var confirmBtn =
      inv.payment_status === 'pending_confirmation'
        ? '<button type="button" class="btn btn--sm btn--primary" data-inv-act="paid" data-inv-id="' +
          id +
          '">Confirm paid</button> '
        : inv.payment_status !== 'paid'
          ? '<button type="button" class="btn btn--sm btn--sec" data-inv-act="paid" data-inv-id="' +
            id +
            '">Mark paid</button> '
          : '<button type="button" class="btn btn--sm btn--ghost" data-inv-act="unpaid" data-inv-id="' +
            id +
            '">Mark unpaid</button> ';
    return (
      '<tr data-invoice-id="' +
      id +
      '">' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(inv.participant_display || inv.related_client || inv.contact_id) +
      '</strong><div class="muted" style="font-size:12px">' +
      esc(inv.contact_id) +
      '</div></td>' +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(inv.invoice_number || '—') +
      '<div class="muted" style="font-size:12px">' +
      esc(inv.title || '') +
      '</div>' +
      (inv.xero_invoice_id
        ? '<div class="muted" style="font-size:11px">Xero ' +
          esc(String(inv.xero_invoice_id).slice(0, 8)) +
          '…' +
          (inv.xero_payment_id ? ' · paid in Xero' : '') +
          '</div>'
        : '') +
      (linkBits.length
        ? '<div class="muted" style="font-size:11px">' + esc(linkBits.join(' · ')) + '</div>'
        : '') +
      (reportBits.length
        ? '<div class="muted" style="font-size:11px;color:#92400e">' +
          esc(reportBits.join(' · ')) +
          '</div>'
        : '') +
      '</td>' +
      '<td>' +
      esc(formatMoney(inv.amount_gbp)) +
      '</td>' +
      '<td>' +
      esc(formatDate(inv.due_date)) +
      '</td>' +
      '<td>' +
      statusChip(inv.payment_status, inv.share_status) +
      '</td>' +
      '<td style="white-space:nowrap">' +
      (inv.pdf_url
        ? '<a class="btn btn--ghost btn--sm" href="' +
          esc(inv.pdf_url) +
          '" target="_blank" rel="noopener">PDF</a> '
        : '') +
      (inv.share_status === 'ready'
        ? '<button type="button" class="btn btn--sm btn--ghost" data-inv-act="hide" data-inv-id="' +
          id +
          '">Hide</button> '
        : '<button type="button" class="btn btn--sm btn--primary" data-inv-act="share" data-inv-id="' +
          id +
          '">Share</button> ') +
      confirmBtn +
      '</td></tr>'
    );
  }

  async function renderHost(host) {
    if (!host) return;
    host.innerHTML = '<p class="muted">Loading…</p>';
    var body = { limit: 100 };
    if (state.filter === 'ready' || state.filter === 'hidden') body.share_status = state.filter;
    if (state.filter === 'unpaid') {
      body.share_status = 'ready';
      body.payment_status = 'unpaid';
    }
    if (state.filter === 'pending') {
      body.share_status = 'ready';
      body.payment_status = 'pending_confirmation';
    }
    var r = await api('portal-admin-parent-invoices-list', body);
    if (r.error) {
      host.innerHTML = '<p class="muted">Could not load invoices (' + esc(r.error) + ').</p>';
      return;
    }
    state.invoices = r.invoices || [];
    state.meta = r.meta || {};
    var metaEl = global.document.getElementById('portalParentInvoicesMetaEmbed');
    if (metaEl) {
      var parts = [];
      parts.push(String(state.meta.ready_unpaid || 0) + ' unpaid');
      if (state.meta.pending_confirmation) {
        parts.push(String(state.meta.pending_confirmation) + ' pending');
      }
      metaEl.textContent = parts.join(' · ');
    }
    if (!state.invoices.length) {
      host.innerHTML = '<p class="muted">No invoices yet. Upload a PDF below to share with a family.</p>';
      return;
    }
    host.innerHTML =
      '<div style="overflow:auto;min-width:0"><table class="tbl tbl--dense" style="min-width:720px"><thead><tr>' +
      '<th>Participant</th><th>Invoice</th><th>Amount</th><th>Due</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      state.invoices.map(rowHtml).join('') +
      '</tbody></table></div>';
    bindRowActions(host);
  }

  function bindRowActions(host) {
    host.querySelectorAll('[data-inv-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-inv-act');
        var id = btn.getAttribute('data-inv-id');
        if (!id) return;
        btn.disabled = true;
        var body = { action: 'update', invoice_id: id };
        if (act === 'share') body.share_status = 'ready';
        else if (act === 'hide') body.share_status = 'hidden';
        else if (act === 'paid') {
          body.payment_status = 'paid';
          body.paid_via = 'admin';
        }
        else if (act === 'unpaid') body.payment_status = 'unpaid';
        else {
          btn.disabled = false;
          return;
        }
        void api('portal-admin-parent-invoices-upsert', body).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Update failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Invoice updated', 'ok');
          void renderHost(global.document.getElementById('portalParentInvoicesHost'));
        });
      });
    });
  }

  async function searchParticipants(q) {
    var client = cfg.getClient();
    var hitsEl = global.document.getElementById('portalParentInvoicesSearchHits');
    if (!client || !hitsEl) return;
    var term = String(q || '').trim();
    if (term.length < 2) {
      hitsEl.innerHTML = '';
      hitsEl.hidden = true;
      return;
    }
    var { data, error } = await client
      .from('portal_participants')
      .select('contact_id, display_name, first_name, last_name')
      .or(
        'display_name.ilike.%' +
          term.replace(/%/g, '') +
          '%,first_name.ilike.%' +
          term.replace(/%/g, '') +
          '%,last_name.ilike.%' +
          term.replace(/%/g, '') +
          '%,contact_id.ilike.%' +
          term.replace(/%/g, '') +
          '%'
      )
      .limit(12);
    if (error) {
      hitsEl.innerHTML = '<p class="muted">Search failed.</p>';
      hitsEl.hidden = false;
      return;
    }
    state.searchHits = data || [];
    if (!state.searchHits.length) {
      hitsEl.innerHTML = '<p class="muted">No matches.</p>';
      hitsEl.hidden = false;
      return;
    }
    hitsEl.hidden = false;
    hitsEl.innerHTML = state.searchHits
      .map(function (p) {
        var name =
          String(p.display_name || '').trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          p.contact_id;
        return (
          '<button type="button" class="btn btn--ghost btn--sm" style="display:block;width:100%;text-align:left;margin:0 0 4px" data-pick-contact="' +
          esc(p.contact_id) +
          '" data-pick-name="' +
          esc(name) +
          '">' +
          esc(name) +
          ' <span class="muted">' +
          esc(p.contact_id) +
          '</span></button>'
        );
      })
      .join('');
    hitsEl.querySelectorAll('[data-pick-contact]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cid = btn.getAttribute('data-pick-contact') || '';
        var name = btn.getAttribute('data-pick-name') || '';
        var idEl = global.document.getElementById('portalParentInvoiceContactId');
        var nameEl = global.document.getElementById('portalParentInvoiceParticipantLabel');
        if (idEl) idEl.value = cid;
        if (nameEl) nameEl.textContent = name + ' (' + cid + ')';
        hitsEl.hidden = true;
        hitsEl.innerHTML = '';
      });
    });
  }

  function bindUploadForm() {
    var form = global.document.getElementById('portalParentInvoiceUploadForm');
    if (!form || form.getAttribute('data-bound') === '1') return;
    form.setAttribute('data-bound', '1');

    var search = global.document.getElementById('portalParentInvoiceSearch');
    var searchTimer = null;
    if (search) {
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          void searchParticipants(search.value);
        }, 280);
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var contactId = String(
        (global.document.getElementById('portalParentInvoiceContactId') || {}).value || ''
      ).trim();
      var fileInput = global.document.getElementById('portalParentInvoiceFile');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!contactId) {
        cfg.toast('Pick a participant first', 'error');
        return;
      }
      if (!file) {
        cfg.toast('Choose a PDF', 'error');
        return;
      }
      var fd = new FormData();
      fd.append('action', 'create');
      fd.append('contact_id', contactId);
      fd.append('file', file);
      var invNo = global.document.getElementById('portalParentInvoiceNumber');
      var amount = global.document.getElementById('portalParentInvoiceAmount');
      var due = global.document.getElementById('portalParentInvoiceDue');
      var title = global.document.getElementById('portalParentInvoiceTitle');
      var notes = global.document.getElementById('portalParentInvoiceNotes');
      var xeroId = global.document.getElementById('portalParentInvoiceXeroId');
      var gcUrl = global.document.getElementById('portalParentInvoiceGcUrl');
      var plUrl = global.document.getElementById('portalParentInvoicePlUrl');
      var plNote = global.document.getElementById('portalParentInvoicePlNote');
      if (invNo && invNo.value) fd.append('invoice_number', invNo.value);
      if (amount && amount.value) fd.append('amount_gbp', amount.value);
      if (due && due.value) fd.append('due_date', due.value);
      if (title && title.value) fd.append('title', title.value);
      if (notes && notes.value) fd.append('notes', notes.value);
      if (xeroId && xeroId.value) fd.append('xero_invoice_id', xeroId.value);
      if (gcUrl && gcUrl.value) fd.append('gocardless_url', gcUrl.value);
      if (plUrl && plUrl.value) fd.append('payment_link_url', plUrl.value);
      if (plNote && plNote.value) fd.append('payment_link_surcharge_note', plNote.value);
      fd.append('payment_method_hint', 'bank_transfer');
      fd.append('share_status', 'ready');
      fd.append('payment_status', 'unpaid');

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      void api('portal-admin-parent-invoices-upsert', fd, true).then(function (r) {
        if (submitBtn) submitBtn.disabled = false;
        if (r.error) {
          cfg.toast(r.message || r.error || 'Upload failed', 'error');
          return;
        }
        cfg.toast('Invoice shared with family', 'ok');
        form.reset();
        var nameEl = global.document.getElementById('portalParentInvoiceParticipantLabel');
        if (nameEl) nameEl.textContent = 'No participant selected';
        var idEl = global.document.getElementById('portalParentInvoiceContactId');
        if (idEl) idEl.value = '';
        void renderHost(global.document.getElementById('portalParentInvoicesHost'));
      });
    });
  }

  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Family invoices</h3>' +
      '<span class="chip chip--pend" id="portalParentInvoicesMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Upload a Xero invoice PDF and share it to the parent hub. Paste the Xero <strong>Invoice ID</strong> (GUID) so when the family pays (card / bank confirm / credit), Portal can mark it paid in Xero. Families see <strong>Tide bank transfer</strong> by default; Card / Apple Pay adds the Stripe fee. Add GoCardless only when needed.</p>' +
      '<form id="portalParentInvoiceUploadForm" class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px;margin-bottom:14px">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
      '<label style="flex:1 1 200px;min-width:0">Search participant' +
      '<input class="inp" id="portalParentInvoiceSearch" type="search" placeholder="Name or contact id" autocomplete="off" style="width:100%" />' +
      '</label>' +
      '<div style="flex:1 1 180px;min-width:0"><span class="muted" style="font-size:12px">Selected</span>' +
      '<div id="portalParentInvoiceParticipantLabel" style="font-weight:700;overflow-wrap:break-word">No participant selected</div>' +
      '<input type="hidden" id="portalParentInvoiceContactId" value="" />' +
      '</div></div>' +
      '<div id="portalParentInvoicesSearchHits" hidden style="margin-top:-4px"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<label style="flex:1 1 120px;min-width:0">Invoice #<input class="inp" id="portalParentInvoiceNumber" style="width:100%" /></label>' +
      '<label style="flex:1 1 100px;min-width:0">Amount £<input class="inp" id="portalParentInvoiceAmount" type="number" min="0" step="0.01" style="width:100%" /></label>' +
      '<label style="flex:1 1 140px;min-width:0">Due date<input class="inp" id="portalParentInvoiceDue" type="date" style="width:100%" /></label>' +
      '</div>' +
      '<label style="min-width:0">Xero Invoice ID (GUID, for payment sync)<input class="inp" id="portalParentInvoiceXeroId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Title (optional)<input class="inp" id="portalParentInvoiceTitle" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Notes (optional)<input class="inp" id="portalParentInvoiceNotes" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">GoCardless URL (optional)<input class="inp" id="portalParentInvoiceGcUrl" type="url" placeholder="https://…" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Payment Link URL (rare)<input class="inp" id="portalParentInvoicePlUrl" type="url" placeholder="https://…" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">Payment Link surcharge note<input class="inp" id="portalParentInvoicePlNote" placeholder="e.g. +2.5% card fee" style="width:100%;max-width:28rem" /></label>' +
      '<label style="min-width:0">PDF<input class="inp" id="portalParentInvoiceFile" type="file" accept="application/pdf,.pdf" style="width:100%;max-width:28rem" /></label>' +
      '<div><button type="submit" class="btn btn--primary btn--sm">Upload &amp; share</button></div>' +
      '</form>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-inv-filter="all">All</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="ready">Shared</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="unpaid">Ready unpaid</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="pending">Pending confirmation</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-inv-filter="hidden">Hidden</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentInvoicesRefreshEmbed">Refresh</button>' +
      '</div>' +
      '<div id="portalParentInvoicesHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindEmbed() {
    state.filter = 'all';
    bindUploadForm();
    var host = global.document.getElementById('portalParentInvoicesHost');
    var refresh = global.document.getElementById('portalParentInvoicesRefreshEmbed');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(host);
      });
    }
    global.document.querySelectorAll('[data-inv-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-inv-filter') || 'all';
        global.document.querySelectorAll('[data-inv-filter]').forEach(function (b) {
          var on = b.getAttribute('data-inv-filter') === state.filter;
          b.classList.toggle('btn--ghost', !on);
        });
        void renderHost(global.document.getElementById('portalParentInvoicesHost'));
      });
    });
    void renderHost(host);
  }

  global.PortalParentInvoices = {
    configure: configure,
    embedHtml: embedHtml,
    bindEmbed: bindEmbed
  };
})(typeof window !== 'undefined' ? window : globalThis);
