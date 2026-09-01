/**
 * Admin — parent Absent reports (Missed → proof → validate → credit/refund/makeup).
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

  var state = { filter: 'pending_review', reports: [], meta: {}, pick: null };

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

  function statusChip(status) {
    var s = String(status || '');
    var tone = 'info';
    if (s === 'pending_review') tone = 'pend';
    else if (s === 'excused') tone = 'ok';
    else if (s === 'rejected' || s === 'expired') tone = 'warn';
    else if (s === 'missed') tone = 'info';
    else if (s === 'noted') tone = 'ok';
    return '<span class="chip chip--' + tone + '">' + esc(s.replace(/_/g, ' ')) + '</span>';
  }

  async function fetchReports(status) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired', reports: [] };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-parent-absence-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify({ status: status || 'all', limit: 150 })
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'request_failed', reports: [] };
    }
    return { reports: j.reports || [], meta: j.meta || {} };
  }

  async function createAbsence(body) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-parent-absence-create', {
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

  async function searchParticipants(q) {
    var client = cfg.getClient();
    var hitsEl = global.document.getElementById('ppAbsenceCreateHits');
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
          '<button type="button" class="btn btn--ghost btn--sm" style="display:block;width:100%;text-align:left;margin:0 0 4px;min-width:0;overflow-wrap:break-word" data-pp-abs-pick="' +
          esc(p.contact_id) +
          '" data-pp-abs-name="' +
          esc(name) +
          '" data-pp-abs-parent="' +
          esc(p.parent_person_id || '') +
          '">' +
          esc(name) +
          ' <span class="muted">' +
          esc(p.contact_id) +
          '</span></button>'
        );
      })
      .join('');
    hitsEl.querySelectorAll('[data-pp-abs-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.pick = {
          contact_id: btn.getAttribute('data-pp-abs-pick') || '',
          parent_person_id: btn.getAttribute('data-pp-abs-parent') || '',
          display_name: btn.getAttribute('data-pp-abs-name') || ''
        };
        var label = global.document.getElementById('ppAbsenceCreateSelected');
        if (label) {
          label.textContent =
            state.pick.display_name + ' (' + state.pick.contact_id + ')';
        }
        hitsEl.innerHTML = '';
        hitsEl.hidden = true;
      });
    });
  }

  function openCreateModal() {
    if (typeof cfg.openModal !== 'function') {
      cfg.toast('Add absent modal unavailable', 'error');
      return;
    }
    state.pick = null;
    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Add absent (office phone)</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Record a missed / noted session when a parent calls. Unwell → Missed (can then grant makeup / approve). Other reasons → Noted.</p>' +
        '<label class="muted">Search participant</label>' +
        '<input class="inp" id="ppAbsenceCreateSearch" type="search" placeholder="Name or contact id" autocomplete="off" style="max-width:100%;box-sizing:border-box" />' +
        '<div id="ppAbsenceCreateHits" hidden style="margin:6px 0"></div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px">Selected</div>' +
        '<div id="ppAbsenceCreateSelected" style="font-weight:700;overflow-wrap:break-word;min-width:0">No participant selected</div>' +
        '<label class="muted" style="display:block;margin-top:10px">Session date</label>' +
        '<input class="inp" id="ppAbsenceCreateDate" type="date" style="max-width:100%;box-sizing:border-box" />' +
        '<label class="muted" style="display:block;margin-top:10px">Service</label>' +
        '<input class="inp" id="ppAbsenceCreateService" placeholder="e.g. Aquatic Activity · Acton" style="max-width:100%;box-sizing:border-box" />' +
        '<label class="muted" style="display:block;margin-top:10px">Time (optional)</label>' +
        '<input class="inp" id="ppAbsenceCreateTime" placeholder="e.g. 5 to 5.30" style="max-width:100%;box-sizing:border-box" />' +
        '<label class="muted" style="display:block;margin-top:10px">Reason</label>' +
        '<select class="inp" id="ppAbsenceCreateReason" style="max-width:100%;box-sizing:border-box">' +
        '<option value="unwell">Unwell (Missed)</option>' +
        '<option value="other_commitments">Other commitments (Noted)</option>' +
        '<option value="party">Party (Noted)</option>' +
        '<option value="holidays">Holidays (Noted)</option>' +
        '<option value="travel">Travel (Noted)</option>' +
        '<option value="birthday">Birthday (Noted)</option>' +
        '<option value="instructor_cancelled">Instructor cancelled (Noted)</option>' +
        '<option value="bank_holiday">Bank holiday (Noted)</option>' +
        '<option value="strike">Strike / disruption (Noted)</option>' +
        '<option value="office_other">Office note (Noted)</option>' +
        '</select>' +
        '<label class="muted" style="display:block;margin-top:10px">Notes (optional)</label>' +
        '<textarea class="inp" id="ppAbsenceCreateNotes" rows="2" placeholder="What the parent said…" style="max-width:100%;box-sizing:border-box;resize:vertical"></textarea>' +
        '<p id="ppAbsenceCreateErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppAbsenceCreateCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppAbsenceCreateSave">Save absent</button>' +
        '</div>'
    );

    var searchTimer = null;
    var search = global.document.getElementById('ppAbsenceCreateSearch');
    if (search) {
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          void searchParticipants(search.value);
        }, 280);
      });
    }
    var cancel = global.document.getElementById('ppAbsenceCreateCancel');
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === 'function') cfg.closeModal();
      };
    }
    var save = global.document.getElementById('ppAbsenceCreateSave');
    if (save) {
      save.onclick = function () {
        var errEl = global.document.getElementById('ppAbsenceCreateErr');
        function showErr(msg) {
          if (!errEl) return;
          errEl.style.display = 'block';
          errEl.textContent = msg;
        }
        if (!state.pick || !state.pick.contact_id) {
          showErr('Pick a participant first.');
          return;
        }
        var dateEl = global.document.getElementById('ppAbsenceCreateDate');
        var svcEl = global.document.getElementById('ppAbsenceCreateService');
        var timeEl = global.document.getElementById('ppAbsenceCreateTime');
        var reasonEl = global.document.getElementById('ppAbsenceCreateReason');
        var notesEl = global.document.getElementById('ppAbsenceCreateNotes');
        var sessionDate = dateEl ? String(dateEl.value || '').trim() : '';
        var serviceLabel = svcEl ? String(svcEl.value || '').trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
          showErr('Session date is required.');
          return;
        }
        if (!serviceLabel) {
          showErr('Service is required.');
          return;
        }
        save.disabled = true;
        void createAbsence({
          contact_id: state.pick.contact_id,
          parent_person_id: state.pick.parent_person_id || '',
          participant_display: state.pick.display_name || '',
          session_date: sessionDate,
          service_label: serviceLabel,
          session_time: timeEl ? String(timeEl.value || '').trim() : '',
          reason_code: reasonEl ? reasonEl.value : 'unwell',
          reason_text: notesEl ? String(notesEl.value || '').trim() : ''
        }).then(function (r) {
          save.disabled = false;
          if (r.error) {
            showErr(r.message || r.error || 'Save failed');
            return;
          }
          if (typeof cfg.closeModal === 'function') cfg.closeModal();
          cfg.toast(
            r.already_reported
              ? 'Absent already on file for that session'
              : 'Absent recorded from office phone',
            'ok'
          );
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      };
    }
  }

  async function decide(reportId, action, outcome, notes, preferredVenue, amountGbp) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var body = {
      report_id: reportId,
      action: action,
      outcome: outcome || 'none',
      notes: notes || '',
      preferred_venue: preferredVenue || ''
    };
    if (amountGbp != null && amountGbp !== '' && isFinite(Number(amountGbp))) {
      body.amount_gbp = Number(amountGbp);
    }
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-parent-absence-decide', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify(body)
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
    return { report: j.report, grant: j.grant, credit: j.credit };
  }

  function rowHtml(r) {
    var proof = r.proof_signed_url
      ? '<a href="' + esc(r.proof_signed_url) + '" target="_blank" rel="noopener">Open proof</a>'
      : '<span class="muted">No proof</span>';
    var canDecide = r.status === 'pending_review' || (r.status === 'missed' && r.proof_storage_path);
    var canGrantMakeup =
      (r.status === 'missed' || r.status === 'expired' || r.status === 'rejected') && !r.proof_storage_path;
    var actions = '';
    if (canDecide) {
      actions =
        '<div class="pp-admin-absence-acts" style="display:flex;flex-wrap:wrap;gap:6px;min-width:0">' +
        '<select data-absence-outcome="' +
        esc(r.id) +
        '" aria-label="Outcome">' +
        '<option value="credit">Credit</option>' +
        '<option value="refund">Refund</option>' +
        '<option value="makeup">Makeup</option>' +
        '<option value="none">None</option>' +
        '</select>' +
        '<button type="button" class="btn btn--sm btn--primary" data-absence-approve="' +
        esc(r.id) +
        '">Approve</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-absence-reject="' +
        esc(r.id) +
        '">Reject</button>' +
        '</div>';
    } else if (canGrantMakeup) {
      actions =
        '<button type="button" class="btn btn--sm btn--sec" data-absence-grant-makeup="' +
        esc(r.id) +
        '">Grant makeup</button>' +
        '<span class="muted" style="display:block;margin-top:4px;font-size:11px;overflow-wrap:break-word">No valid proof — venue-scoped waiting list</span>';
    } else {
      actions =
        '<span class="muted">' +
        esc(r.outcome ? 'Outcome: ' + r.outcome : r.review_notes || '—') +
        '</span>';
    }
    return (
      '<tr>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(r.participant_display || '—') +
      '</strong></td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(r.session_date)) +
      '</td>' +
      '<td style="min-width:0;overflow-wrap:break-word">' +
      esc(r.service_label || '—') +
      (r.session_time ? ' · ' + esc(r.session_time) : '') +
      '</td>' +
      '<td style="min-width:0;max-width:12rem;overflow-wrap:break-word">' +
      esc(r.reason_text || '—') +
      '</td>' +
      '<td>' +
      statusChip(r.status) +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDate(r.proof_deadline)) +
      '</td>' +
      '<td>' +
      proof +
      '</td>' +
      '<td style="min-width:0">' +
      actions +
      '</td>' +
      '</tr>'
    );
  }

  function tableHtml(reports) {
    if (!reports.length) {
      return '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">No reports in this filter.</p>';
    }
    return (
      '<div class="card" style="margin-top:0"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Session</th><th>Service</th><th>Note</th><th>Status</th><th>Proof deadline</th><th>Proof</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      reports.map(rowHtml).join('') +
      '</tbody></table></div></div>'
    );
  }

  function viewHtml() {
    return (
      '<div class="portal-parent-absences-embed">' +
      '<h1 class="page-title">Parent absents (proof queue)</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">Parents report <strong>Absent</strong> → Missed session. Proof upload within <strong>2 weeks</strong> of the session date. Admin must always validate before credit, refund, or makeup. After the deadline, parents cannot upload and must contact the office.</p>' +
      '<div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-absence-filter="pending_review">Pending proof</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="missed">Missed (no proof)</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="all">All</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="excused">Excused</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentAbsenceRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="portalParentAbsenceAdd">Add absent</button>' +
      '<span class="chip chip--pend" id="portalParentAbsenceMeta"></span>' +
      '</div>' +
      '<div id="portalParentAbsenceHost"><p class="muted">Loading…</p></div>' +
      '</div>'
    );
  }

  async function renderHost(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var res = await fetchReports(state.filter);
    if (res.error) {
      hostEl.innerHTML =
        '<p class="muted" style="color:var(--danger,#c62828)">Could not load (' +
        esc(res.error) +
        '). Apply the absence SQL migration and deploy the edge functions if this is new.</p>';
      return;
    }
    state.reports = res.reports || [];
    state.meta = res.meta || {};
    var metaEl = global.document.getElementById('portalParentAbsenceMeta');
    if (metaEl) {
      metaEl.textContent =
        String(state.meta.pending_review || 0) +
        ' pending · ' +
        String(state.meta.missed_open || 0) +
        ' missed open';
    }
    var metaEmbed = global.document.getElementById('portalParentAbsenceMetaEmbed');
    if (metaEmbed) {
      metaEmbed.textContent =
        String(state.meta.pending_review || 0) +
        ' pending · ' +
        String(state.meta.missed_open || 0) +
        ' missed';
    }
    hostEl.innerHTML = tableHtml(state.reports);
    bindRowActions(hostEl);
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-absence-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-approve');
        var sel = hostEl.querySelector('[data-absence-outcome="' + id + '"]');
        var outcome = sel ? sel.value : 'none';
        var notes = global.prompt('Optional notes for the family / file:', '') || '';
        var venue = '';
        var amount = null;
        if (outcome === 'makeup') {
          venue = global.prompt('Preferred venue for makeup offers (required):', '') || '';
          if (!String(venue).trim()) {
            cfg.toast('Venue required for makeup grants', 'error');
            return;
          }
        }
        if (outcome === 'credit' || outcome === 'refund') {
          var amountRaw =
            global.prompt(
              '£ amount for the family ledger (optional — leave blank for session credit without cash figure):',
              ''
            ) || '';
          if (String(amountRaw).trim()) {
            amount = Number(amountRaw);
            if (!isFinite(amount) || amount < 0) {
              cfg.toast('Invalid amount', 'error');
              return;
            }
          }
        }
        btn.disabled = true;
        void decide(id, 'approve', outcome, notes, venue, amount).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Approve failed', 'error');
            btn.disabled = false;
            return;
          }
          var extra = r.credit ? ' · ledger row created' : '';
          cfg.toast('Excused — outcome: ' + outcome + extra, 'ok');
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-absence-reject]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-reject');
        var notes = global.prompt('Reason for rejection (shown to parent):', 'Proof not accepted') || '';
        btn.disabled = true;
        void decide(id, 'reject', 'none', notes).then(function (r) {
          if (r.error) {
            cfg.toast(r.error || 'Reject failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Rejected', 'ok');
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-absence-grant-makeup]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-grant-makeup');
        var venue = global.prompt('Preferred venue (offers stay at this centre):', '') || '';
        if (!String(venue).trim()) {
          cfg.toast('Venue required', 'error');
          return;
        }
        var notes = global.prompt('Optional notes:', '') || '';
        btn.disabled = true;
        void decide(id, 'grant_makeup', 'makeup', notes, venue).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Grant failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast(r.already ? 'Makeup grant already exists' : 'Makeup grant added to venue waiting list', 'ok');
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
  }

  function bindAddButtons() {
    ['portalParentAbsenceAdd', 'portalParentAbsenceAddEmbed'].forEach(function (id) {
      var btn = global.document.getElementById(id);
      if (!btn || btn.getAttribute('data-bound') === '1') return;
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', function () {
        openCreateModal();
      });
    });
  }

  function bindModule() {
    var host = global.document.getElementById('portalParentAbsenceHost');
    if (host) void renderHost(host);
    var refresh = global.document.getElementById('portalParentAbsenceRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalParentAbsenceHost'));
      });
    }
    bindAddButtons();
    global.document.querySelectorAll('[data-absence-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-absence-filter') || 'all';
        global.document.querySelectorAll('[data-absence-filter]').forEach(function (b) {
          var on = b.getAttribute('data-absence-filter') === state.filter;
          b.classList.toggle('btn--ghost', !on);
        });
        void renderHost(global.document.getElementById('portalParentAbsenceHost'));
      });
    });
  }

  /** Embed block for Absents & credits page (above workbook queue). */
  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Parent portal — proof validation</h3>' +
      '<span class="chip chip--pend" id="portalParentAbsenceMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Missed sessions from the parent app <strong>or office phone</strong>. Validate proof within the family&apos;s 2-week window; after that they must contact admin. Use <strong>Add absent</strong> when a parent calls.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-absence-filter="pending_review">Pending proof</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="missed">Missed</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="noted">Noted</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="all">All</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentAbsenceRefreshEmbed">Refresh</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="portalParentAbsenceAddEmbed">Add absent</button>' +
      '</div>' +
      '<div id="portalParentAbsenceHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindEmbed() {
    state.filter = 'pending_review';
    bindModule();
    bindAddButtons();
    var meta = global.document.getElementById('portalParentAbsenceMetaEmbed');
    var refresh = global.document.getElementById('portalParentAbsenceRefreshEmbed');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalParentAbsenceHost')).then(function () {
          if (meta) {
            meta.textContent =
              String(state.meta.pending_review || 0) +
              ' pending · ' +
              String(state.meta.missed_open || 0) +
              ' missed';
          }
        });
      });
    }
    void renderHost(global.document.getElementById('portalParentAbsenceHost')).then(function () {
      if (meta) {
        meta.textContent =
          String(state.meta.pending_review || 0) +
          ' pending · ' +
          String(state.meta.missed_open || 0) +
          ' missed';
      }
    });
  }

  global.PortalParentAbsences = {
    configure: configure,
    viewHtml: viewHtml,
    embedHtml: embedHtml,
    bindModule: bindModule,
    bindEmbed: bindEmbed,
    fetchReports: fetchReports,
    openCreateModal: openCreateModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
