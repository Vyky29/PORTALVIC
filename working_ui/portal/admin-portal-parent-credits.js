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
    },
    openModal: null,
    closeModal: null
  };

  var state = { filter: 'open', entries: [], meta: {}, pick: null };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.openModal) cfg.openModal = options.openModal;
    if (options.closeModal) cfg.closeModal = options.closeModal;
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
      '<th>Participant</th><th>Kind</th><th>£</th><th>Service / session</th><th>Status</th><th>Notes</th><th>Created</th><th>Actions</th>' +
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
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Ledger rows from excused absences or <strong>Add credit / refund</strong> when a parent phones. Families see open balances in the parent hub. Mark refunded after the bank/Stripe transfer; mark applied when a credit is used on a booking.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-credits-filter="open">Open</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-credits-filter="all">All</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentCreditsRefreshEmbed">Refresh</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="portalParentCreditsAdd">Add credit / refund</button>' +
      '</div>' +
      '<div id="portalParentCreditsHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  async function searchParticipants(q) {
    var client = cfg.getClient();
    var hitsEl = global.document.getElementById('ppCreditCreateHits');
    if (!client || !hitsEl) return;
    var term = String(q || '').trim();
    if (term.length < 2) {
      hitsEl.innerHTML = '';
      hitsEl.hidden = true;
      return;
    }
    var safe = term.replace(/%/g, '').replace(/,/g, '');
    var { data, error } = await client
      .from('portal_participants')
      .select('contact_id, display_name, first_name, last_name, parent_person_id')
      .or(
        'display_name.ilike.%' +
          safe +
          '%,first_name.ilike.%' +
          safe +
          '%,last_name.ilike.%' +
          safe +
          '%,contact_id.ilike.%' +
          safe +
          '%'
      )
      .limit(12);
    if (error) {
      hitsEl.innerHTML = '<p class="muted">Search failed.</p>';
      hitsEl.hidden = false;
      return;
    }
    var hits = data || [];
    if (!hits.length) {
      hitsEl.innerHTML = '<p class="muted">No matches.</p>';
      hitsEl.hidden = false;
      return;
    }
    hitsEl.hidden = false;
    hitsEl.innerHTML = hits
      .map(function (p) {
        var name =
          String(p.display_name || '').trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          p.contact_id;
        return (
          '<button type="button" class="btn btn--ghost btn--sm" style="display:block;width:100%;text-align:left;margin:0 0 4px;min-width:0;overflow-wrap:break-word" data-pp-cr-pick="' +
          esc(p.contact_id) +
          '" data-pp-cr-name="' +
          esc(name) +
          '" data-pp-cr-parent="' +
          esc(p.parent_person_id || '') +
          '">' +
          esc(name) +
          ' <span class="muted">' +
          esc(p.contact_id) +
          '</span></button>'
        );
      })
      .join('');
    hitsEl.querySelectorAll('[data-pp-cr-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.pick = {
          contact_id: btn.getAttribute('data-pp-cr-pick') || '',
          parent_person_id: btn.getAttribute('data-pp-cr-parent') || '',
          display_name: btn.getAttribute('data-pp-cr-name') || ''
        };
        var label = global.document.getElementById('ppCreditCreateSelected');
        if (label) {
          label.textContent = state.pick.display_name + ' (' + state.pick.contact_id + ')';
        }
        hitsEl.innerHTML = '';
        hitsEl.hidden = true;
      });
    });
  }

  function openCreateModal() {
    if (typeof cfg.openModal !== 'function') {
      cfg.toast('Add credit modal unavailable', 'error');
      return;
    }
    state.pick = null;
    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Add credit / refund (office phone)</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Creates an open ledger row the family can see. Use Credit for carry-forward; Refund when you will transfer money back.</p>' +
        '<label class="muted">Search participant</label>' +
        '<input class="inp" id="ppCreditCreateSearch" type="search" placeholder="Name or contact id" autocomplete="off" style="max-width:100%;box-sizing:border-box" />' +
        '<div id="ppCreditCreateHits" hidden style="margin:6px 0"></div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px">Selected</div>' +
        '<div id="ppCreditCreateSelected" style="font-weight:700;overflow-wrap:break-word;min-width:0">No participant selected</div>' +
        '<label class="muted" style="display:block;margin-top:10px">Kind</label>' +
        '<select class="inp" id="ppCreditCreateKind" style="max-width:100%;box-sizing:border-box">' +
        '<option value="credit">Credit</option>' +
        '<option value="refund">Refund</option>' +
        '</select>' +
        '<label class="muted" style="display:block;margin-top:10px">Amount £ (optional)</label>' +
        '<input class="inp" id="ppCreditCreateAmount" type="number" min="0" step="0.01" placeholder="e.g. 50.00" style="max-width:100%;box-sizing:border-box" />' +
        '<label class="muted" style="display:block;margin-top:10px">Service (optional)</label>' +
        '<input class="inp" id="ppCreditCreateService" placeholder="e.g. Aquatic Activity" style="max-width:100%;box-sizing:border-box" />' +
        '<label class="muted" style="display:block;margin-top:10px">Session date (optional)</label>' +
        '<input class="inp" id="ppCreditCreateDate" type="date" style="max-width:100%;box-sizing:border-box" />' +
        '<label class="muted" style="display:block;margin-top:10px">Notes (optional)</label>' +
        '<textarea class="inp" id="ppCreditCreateNotes" rows="2" placeholder="Parent called…" style="max-width:100%;box-sizing:border-box;resize:vertical"></textarea>' +
        '<p id="ppCreditCreateErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppCreditCreateCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppCreditCreateSave">Save ledger row</button>' +
        '</div>'
    );

    var searchTimer = null;
    var search = global.document.getElementById('ppCreditCreateSearch');
    if (search) {
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          void searchParticipants(search.value);
        }, 280);
      });
    }
    var cancel = global.document.getElementById('ppCreditCreateCancel');
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === 'function') cfg.closeModal();
      };
    }
    var save = global.document.getElementById('ppCreditCreateSave');
    if (save) {
      save.onclick = function () {
        var errEl = global.document.getElementById('ppCreditCreateErr');
        function showErr(msg) {
          if (!errEl) return;
          errEl.style.display = 'block';
          errEl.textContent = msg;
        }
        if (!state.pick || !state.pick.contact_id) {
          showErr('Pick a participant first.');
          return;
        }
        if (!state.pick.parent_person_id) {
          showErr('This participant has no parent link — fix the contact first.');
          return;
        }
        var kindEl = global.document.getElementById('ppCreditCreateKind');
        var amountEl = global.document.getElementById('ppCreditCreateAmount');
        var svcEl = global.document.getElementById('ppCreditCreateService');
        var dateEl = global.document.getElementById('ppCreditCreateDate');
        var notesEl = global.document.getElementById('ppCreditCreateNotes');
        var amountRaw = amountEl ? String(amountEl.value || '').trim() : '';
        var amountGbp = null;
        if (amountRaw) {
          amountGbp = Number(amountRaw);
          if (!isFinite(amountGbp) || amountGbp < 0) {
            showErr('Invalid amount.');
            return;
          }
        }
        var notes = notesEl ? String(notesEl.value || '').trim() : '';
        save.disabled = true;
        var body = {
          action: 'create',
          kind: kindEl ? kindEl.value : 'credit',
          contact_id: state.pick.contact_id,
          parent_person_id: state.pick.parent_person_id,
          participant_display: state.pick.display_name || '',
          service_label: svcEl ? String(svcEl.value || '').trim() : '',
          session_date: dateEl ? String(dateEl.value || '').trim() : '',
          notes: notes ? 'Office phone · ' + notes : 'Office phone'
        };
        if (amountGbp != null) body.amount_gbp = amountGbp;
        void api('portal-admin-parent-credits-update', body).then(function (r) {
          save.disabled = false;
          if (r.error) {
            showErr(r.message || r.error || 'Save failed');
            return;
          }
          if (typeof cfg.closeModal === 'function') cfg.closeModal();
          cfg.toast((body.kind === 'refund' ? 'Refund' : 'Credit') + ' added', 'ok');
          void renderHost(global.document.getElementById('portalParentCreditsHost'));
        });
      };
    }
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
    var addBtn = global.document.getElementById('portalParentCreditsAdd');
    if (addBtn && addBtn.getAttribute('data-bound') !== '1') {
      addBtn.setAttribute('data-bound', '1');
      addBtn.addEventListener('click', function () {
        openCreateModal();
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
    bindEmbed: bindEmbed,
    openCreateModal: openCreateModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
