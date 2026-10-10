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

  /** DB keeps status=open; UI says Available so it does not read as "still to do". */
  function statusLabel(status, kind) {
    var s = String(status || '').toLowerCase();
    var k = String(kind || '').toLowerCase();
    if (s === 'open') return k === 'refund' ? 'Pending payout' : 'Available';
    if (s === 'applied') return 'Applied to invoice';
    if (s === 'refunded') return 'Refunded';
    if (s === 'cancelled') return 'Cancelled';
    return s || '—';
  }

  function statusChip(status, kind) {
    var s = String(status || '');
    var k = String(kind || '').toLowerCase();
    var tone = 'info';
    if (s === 'cancelled') tone = 'urg';
    else if (s === 'refunded' || k === 'refund') tone = 'refund';
    else if (s === 'applied' || k === 'credit') tone = 'credit';
    else if (s === 'open') tone = k === 'refund' ? 'refund' : 'credit';
    return '<span class="chip chip--' + tone + '">' + esc(statusLabel(s, kind)) + '</span>';
  }

  function kindChip(kind) {
    var k = String(kind || '').toLowerCase();
    var tone = k === 'refund' ? 'refund' : 'credit';
    var label = k === 'refund' ? 'refund' : 'credit';
    return '<span class="chip chip--' + tone + '">' + esc(label) + '</span>';
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
          '">Apply to invoice</button>';
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
      '<td style="text-align:center">' +
      kindChip(e.kind) +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatMoney(e.amount_gbp)) +
      '</td>' +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(e.service_label || '—') +
      (e.session_date ? ' · ' + esc(formatDate(e.session_date)) : '') +
      '</td>' +
      '<td style="text-align:center">' +
      statusChip(e.status, e.kind) +
      '</td>' +
      '<td class="muted" style="min-width:0;max-width:16rem">' +
      '<div style="overflow-wrap:break-word;min-width:0">' +
      esc(e.notes || e.close_notes || '—') +
      '</div>' +
      '<button type="button" class="btn btn--sm btn--ghost" style="margin-top:6px" data-credit-act="edit_note" data-credit-id="' +
      esc(e.id) +
      '">Edit note</button>' +
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
      '<div style="overflow:auto"><table class="tbl tbl--center tbl--dense pp-queue-tbl"><thead><tr>' +
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
        ' available · ' +
        String(state.meta.open_refunds || 0) +
        ' pending payout';
    }
    hostEl.innerHTML = tableHtml(state.entries);
    bindRowActions(hostEl);
    focusUnpaidRefund(hostEl);
  }

  function focusUnpaidRefund(hostEl) {
    var focusId = String(global.__portalAbsentsFocusCreditId || '').trim();
    if (!focusId || !hostEl) return;
    var box = global.document.getElementById('portalAbsentsLedgerDetails');
    if (box) box.open = true;
    var hit = null;
    hostEl.querySelectorAll('[data-credit-id]').forEach(function (btn) {
      if (!hit && btn.getAttribute('data-credit-id') === focusId) hit = btn;
    });
    var row = hit && hit.closest ? hit.closest('tr') : null;
    if (row) row.style.background = 'rgba(91, 75, 255, 0.08)';
    var target = row || box;
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    global.__portalAbsentsFocusCreditId = '';
    global.__portalAbsentsOpenLedger = false;
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-credit-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-credit-id');
        var act = btn.getAttribute('data-credit-act');
        if (act === 'edit_note') {
          var found = (state.entries || []).filter(function (row) {
            return String(row.id) === String(id);
          })[0];
          openNoteModal(found || { id: id, notes: '' });
          return;
        }
        if (act === 'mark_refunded' || act === 'sync_refund_xero') {
          var foundRefund = (state.entries || []).filter(function (row) {
            return String(row.id) === String(id);
          })[0];
          openRefundPayoutModal(foundRefund || { id: id }, act);
          return;
        }
        var promptLabel =
          act === 'mark_applied'
            ? 'Notes (optional). Flexi → 2nd half; GoCardless → hold for Spring mandate (monthly):'
            : 'Cancel reason (optional):';
        var notes = global.prompt(promptLabel, '') || '';
        btn.disabled = true;
        submitCreditAction({ action: act, entry_id: id, notes: notes }, btn, act);
      });
    });
  }

  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Family credits &amp; refunds</h3>' +
      '<span class="chip chip--ok" id="portalParentCreditsMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Ledger from excused absences or <strong>Add credit / refund</strong>. <strong>Available</strong> = on the family account (nothing left to decide) — GoCardless holds it for <strong>Spring</strong>; bank/flexi can <strong>Apply to invoice</strong> (2nd flexi half). Mark refunded after bank/Stripe.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-credits-filter="open">Available</button>' +
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

  function submitCreditAction(body, btn, act, onDone) {
    void api('portal-admin-parent-credits-update', body).then(function (r) {
      if (r.error) {
        cfg.toast(r.message || r.error || 'Update failed', 'error');
        if (btn) btn.disabled = false;
        return;
      }
      if (act === 'mark_applied') {
        var apps = (r.credit_apply && r.credit_apply.applications) || [];
        var okApp = apps.find(function (a) {
          return a && a.ok;
        });
        if (okApp) {
          cfg.toast(
            'Credit applied to invoice' +
              (okApp.applied_gbp != null ? ' (£' + Number(okApp.applied_gbp).toFixed(2) + ')' : '') +
              (okApp.invoice_remaining_gbp != null
                ? ' · remaining £' + Number(okApp.invoice_remaining_gbp).toFixed(2)
                : '') +
              ' (flexi → 2nd half when open)',
            'ok'
          );
          state.filter = 'all';
        } else if (r.held_for_spring_gc) {
          cfg.toast(
            'GoCardless — credit stays Available for Spring mandate (monthly). Not taken off Autumn GC.',
            'ok'
          );
          state.filter = 'open';
        } else if (r.held_for_next_term || (r.entry && r.entry.status === 'open')) {
          cfg.toast('No bank/flexi invoice yet — credit stays Available for next term', 'ok');
          state.filter = 'open';
        } else {
          cfg.toast('Credit updated', 'ok');
          state.filter = 'all';
        }
      } else if (act === 'sync_refund_xero') {
        var sx = r.settlement && r.settlement.xero;
        if (sx && sx.ok) {
          cfg.toast(
            'Xero credit note synced' + (sx.xero_credit_note_number ? ' (' + sx.xero_credit_note_number + ')' : ''),
            'ok'
          );
        } else {
          cfg.toast((sx && sx.detail) || (sx && sx.error) || 'Xero sync failed', 'error');
        }
        state.filter = 'all';
      } else if (act === 'mark_refunded') {
        var st = r.settlement && r.settlement.notify;
        if (st && st.ok) {
          cfg.toast('Marked refunded · parent notified', 'ok');
        } else {
          cfg.toast('Marked refunded', 'ok');
        }
        state.filter = 'all';
      } else {
        cfg.toast(act === 'cancel' ? 'Cancelled' : 'Updated', 'ok');
        if (act === 'cancel') state.filter = 'all';
      }
      global.document.querySelectorAll('[data-credits-filter]').forEach(function (b) {
        var on = b.getAttribute('data-credits-filter') === state.filter;
        b.classList.toggle('btn--ghost', !on);
      });
      void renderHost(global.document.getElementById('portalParentCreditsHost'));
      if (typeof onDone === 'function') onDone(r);
    });
  }

  /**
   * Mark refunded / Sync Xero: one modal, optional parent notify (off by default).
   */
  function openRefundPayoutModal(entry, act, opts) {
    opts = opts || {};
    if (!entry || !entry.id) return;
    var isSync = act === 'sync_refund_xero';
    var title = isSync ? 'Sync Xero credit note' : 'Mark refund paid';
    var primaryLabel = isSync ? 'Sync Xero CN' : 'Mark refunded';
    var amountKnown = entry.amount_gbp != null && entry.amount_gbp !== '';
    var defaultNotes = isSync ? 'Xero credit note sync' : '';

    function runFallback() {
      var notes = global.prompt(isSync ? 'Notes (optional):' : 'Notes for refunded (optional):', defaultNotes);
      if (notes == null) return;
      var amountRaw = '';
      if (!amountKnown && !isSync) {
        amountRaw = global.prompt('Confirm £ amount (optional):', String(entry.amount_gbp || '')) || '';
      }
      var body = { action: act, entry_id: entry.id, notes: notes, notify_parent: false };
      if (String(amountRaw).trim()) body.amount_gbp = Number(amountRaw);
      submitCreditAction(body, null, act, opts.onSuccess);
    }

    if (typeof cfg.openModal !== 'function') {
      runFallback();
      return;
    }

    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">' +
        esc(title) +
        '</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p style="margin:0 0 8px;font-weight:700;overflow-wrap:break-word;min-width:0">' +
        esc(entry.participant_display || 'Participant') +
        ' · ' +
        esc(formatMoney(entry.amount_gbp)) +
        '</p>' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Updates the ledger to <strong>Refunded</strong>, creates the Xero credit note when needed, and leaves the parent portal on Refunded. They do not get a message unless you tick below.</p>' +
        (amountKnown
          ? ''
          : '<label class="muted">Amount £</label>' +
            '<input class="inp" id="ppRefundPayoutAmount" type="number" min="0" step="0.01" placeholder="Required if missing" style="max-width:100%;box-sizing:border-box;margin-bottom:10px" />') +
        '<label class="muted">Office note (optional, parents do not see this)</label>' +
        '<textarea class="inp" id="ppRefundPayoutNotes" rows="3" maxlength="800" placeholder="Bank ref, date paid…" style="max-width:100%;box-sizing:border-box;resize:vertical"></textarea>' +
        '<label style="display:flex;align-items:flex-start;gap:8px;margin:14px 0 0;cursor:pointer;min-width:0">' +
        '<input type="checkbox" id="ppRefundNotifyParent" style="margin-top:3px;flex-shrink:0" />' +
        '<span style="min-width:0;overflow-wrap:break-word;font-size:13px;line-height:1.45"><strong>Notify parent</strong> — WhatsApp and email: refund has been sent (use after money left the bank).</span>' +
        '</label>' +
        '<p id="ppRefundPayoutErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppRefundPayoutCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppRefundPayoutSave">' +
        esc(primaryLabel) +
        '</button>' +
        '</div>'
    );

    var notesBox = global.document.getElementById('ppRefundPayoutNotes');
    if (notesBox) notesBox.value = defaultNotes;
    var cancel = global.document.getElementById('ppRefundPayoutCancel');
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === 'function') cfg.closeModal();
      };
    }
    var save = global.document.getElementById('ppRefundPayoutSave');
    if (save) {
      save.onclick = function () {
        var errEl = global.document.getElementById('ppRefundPayoutErr');
        function showErr(msg) {
          if (!errEl) return;
          errEl.style.display = 'block';
          errEl.textContent = msg;
        }
        if (errEl) errEl.style.display = 'none';
        var notes = notesBox ? String(notesBox.value || '').trim() : '';
        var notifyEl = global.document.getElementById('ppRefundNotifyParent');
        var notify = !!(notifyEl && notifyEl.checked);
        var body = { action: act, entry_id: entry.id, notes: notes, notify_parent: notify };
        if (!amountKnown) {
          var amtEl = global.document.getElementById('ppRefundPayoutAmount');
          var raw = amtEl ? String(amtEl.value || '').trim() : '';
          if (!raw) {
            showErr('Enter the refund amount.');
            return;
          }
          var n = Number(raw);
          if (!isFinite(n) || n <= 0) {
            showErr('Invalid amount.');
            return;
          }
          body.amount_gbp = n;
        }
        save.disabled = true;
        submitCreditAction(body, save, act, function () {
          if (typeof cfg.closeModal === 'function') cfg.closeModal();
          if (typeof opts.onSuccess === 'function') opts.onSuccess();
        });
      };
    }
  }

  function openNoteModal(entry) {
    if (!entry || !entry.id) return;
    var current = String(entry.notes || entry.close_notes || '');
    if (typeof cfg.openModal !== 'function') {
      var typed = global.prompt('Office note (parents do not see this):', current);
      if (typed == null) return;
      void api('portal-admin-parent-credits-update', {
        action: 'set_note',
        entry_id: entry.id,
        notes: String(typed).trim()
      }).then(function (r) {
        if (r.error) {
          cfg.toast(r.message || r.error || 'Note not saved', 'error');
          return;
        }
        cfg.toast('Office note saved', 'ok');
        void renderHost(global.document.getElementById('portalParentCreditsHost'));
      });
      return;
    }
    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Office note</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.45;overflow-wrap:break-word">This note stays on the admin ledger. The parent does not see it and does not get a message.</p>' +
        '<label class="muted">Note</label>' +
        '<textarea class="inp" id="ppCreditNoteText" rows="5" maxlength="800" style="max-width:100%;box-sizing:border-box;resize:vertical"></textarea>' +
        '<p id="ppCreditNoteErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppCreditNoteCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppCreditNoteSave">Save note</button>' +
        '</div>'
    );
    var box = global.document.getElementById('ppCreditNoteText');
    if (box) box.value = current;
    var cancel = global.document.getElementById('ppCreditNoteCancel');
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === 'function') cfg.closeModal();
      };
    }
    var save = global.document.getElementById('ppCreditNoteSave');
    if (save) {
      save.onclick = function () {
        var errEl = global.document.getElementById('ppCreditNoteErr');
        var text = box ? String(box.value || '').trim() : '';
        save.disabled = true;
        void api('portal-admin-parent-credits-update', {
          action: 'set_note',
          entry_id: entry.id,
          notes: text
        }).then(function (r) {
          save.disabled = false;
          if (r.error) {
            if (errEl) {
              errEl.style.display = 'block';
              errEl.textContent = r.message || r.error || 'Note not saved';
            }
            return;
          }
          if (typeof cfg.closeModal === 'function') cfg.closeModal();
          cfg.toast('Office note saved', 'ok');
          void renderHost(global.document.getElementById('portalParentCreditsHost'));
        });
      };
    }
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
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Creates an <strong>Available</strong> ledger row the family can see. Credit = on account for next invoice / Spring GC; Refund = money back after you pay out.</p>' +
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
        '<label class="muted" style="display:block;margin-top:10px">Office note (optional, parents do not see it)</label>' +
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

  function firstToken(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)[0] || '';
  }

  /**
   * Participant Payments: the refund told when the standing place was cancelled.
   * Mark paid back writes the same ledger row as Absents, refunds and credits.
   */
  async function mountParticipantCancelRefunds(hostEl, participantName) {
    if (!hostEl) return;
    var name = String(participantName || '').trim();
    hostEl.innerHTML = '<p class="muted" style="margin:0">Loading cancel refund…</p>';
    if (!name) {
      hostEl.innerHTML = '';
      return;
    }
    var res = await api('portal-admin-parent-credits-list', {
      status: 'all',
      kind: 'refund',
      source: 'club_cancellation',
      participant: name,
      limit: 20
    });
    if (res.error) {
      hostEl.innerHTML =
        '<p class="muted" style="margin:0">Could not load the cancel refund (' + esc(res.error) + ').</p>';
      return;
    }
    var want = firstToken(name);
    var rows = (res.entries || []).filter(function (e) {
      return firstToken(e.participant_display) === want && String(e.source || '') === 'club_cancellation';
    });
    if (!rows.length) {
      hostEl.innerHTML =
        '<p class="muted" style="margin:0;min-width:0;overflow-wrap:break-word">No refund was recorded when a service was cancelled.</p>';
      return;
    }
    hostEl.innerHTML = rows
      .map(function (e) {
        var open = String(e.status || '') === 'open';
        var when = open
          ? 'Not paid back yet.'
          : 'Paid back' + (e.closed_at ? ' · ' + formatDate(e.closed_at) : '') + '.';
        var btn = open
          ? '<button type="button" class="btn btn--pri btn--sm" data-pax-refund-paid="' +
            esc(e.id) +
            '" data-pax-refund-amt="' +
            esc(e.amount_gbp) +
            '">Mark paid back</button>'
          : '';
        return (
          '<div style="min-width:0;overflow-wrap:break-word;padding:8px 0;border-top:1px solid var(--line)">' +
          '<strong>' +
          esc(formatMoney(e.amount_gbp)) +
          '</strong> · ' +
          statusChip(e.status, 'refund') +
          ' · <span class="muted">' +
          esc(when) +
          '</span>' +
          '<p class="muted" style="margin:6px 0 0;min-width:0;overflow-wrap:break-word">' +
          esc(e.notes || e.service_label || '') +
          '</p>' +
          (btn ? '<div style="margin-top:8px">' + btn + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
    hostEl.querySelectorAll('[data-pax-refund-paid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pax-refund-paid');
        var amt = btn.getAttribute('data-pax-refund-amt');
        var label = formatMoney(amt);
        var row = rows.filter(function (e) {
          return String(e.id) === String(id);
        })[0];
        openRefundPayoutModal(row || { id: id, amount_gbp: amt, participant_display: name }, 'mark_refunded', {
          onSuccess: function () {
            void mountParticipantCancelRefunds(hostEl, name);
          }
        });
      });
    });
  }

  global.PortalParentCredits = {
    configure: configure,
    embedHtml: embedHtml,
    bindEmbed: bindEmbed,
    openCreateModal: openCreateModal,
    mountParticipantCancelRefunds: mountParticipantCancelRefunds
  };
})(typeof window !== 'undefined' ? window : globalThis);
