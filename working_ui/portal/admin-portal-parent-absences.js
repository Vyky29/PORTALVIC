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

  var state = { filter: 'needs_decision', reports: [], meta: {}, pick: null, since: '2026-09-01' };

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
      body: JSON.stringify({
        status: status || state.filter || 'needs_decision',
        since: state.since || '2026-09-01',
        limit: 300
      })
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

  function openCreateModal(mode) {
    var isCancel = mode === 'cancellation';
    if (typeof cfg.openModal !== 'function') {
      cfg.toast('Add modal unavailable', 'error');
      return;
    }
    state.pick = null;
    var title = isCancel ? 'Add cancelled session (office)' : 'Add absent (office phone)';
    var intro = isCancel
      ? 'Club / admin cancelled a booked session. Lands in the same decision queue as absents — choose credit, refund, makeup or none after you validate. No medical proof required.'
      : 'Record a missed / noted session when a parent calls. Unwell → Missed (proof then approve). Other reasons → Noted. Credit only after proof + approve.';
    var reasonOpts = isCancel
      ? '<option value="club_cancelled">Club cancelled session</option>' +
        '<option value="pool_closed">Pool / venue closed</option>' +
        '<option value="facility">Facility issue</option>' +
        '<option value="instructor_cancelled">Instructor cancelled</option>' +
        '<option value="bank_holiday">Bank holiday</option>' +
        '<option value="strike">Strike / disruption</option>' +
        '<option value="office_other">Office note</option>'
      : '<option value="unwell">Unwell (Missed)</option>' +
        '<option value="other_commitments">Other commitments (Noted)</option>' +
        '<option value="party">Party (Noted)</option>' +
        '<option value="holidays">Holidays (Noted)</option>' +
        '<option value="travel">Travel (Noted)</option>' +
        '<option value="birthday">Birthday (Noted)</option>' +
        '<option value="office_other">Office note (Noted)</option>';
    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">' +
        title +
        '</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">' +
        intro +
        '</p>' +
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
        reasonOpts +
        '</select>' +
        '<label class="muted" style="display:block;margin-top:10px">Notes (optional)</label>' +
        '<textarea class="inp" id="ppAbsenceCreateNotes" rows="2" placeholder="Context…" style="max-width:100%;box-sizing:border-box;resize:vertical"></textarea>' +
        '<p id="ppAbsenceCreateErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppAbsenceCreateCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppAbsenceCreateSave">' +
        (isCancel ? 'Save cancelled' : 'Save absent') +
        '</button>' +
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
          reason_code: reasonEl ? reasonEl.value : isCancel ? 'club_cancelled' : 'unwell',
          reason_text: notesEl ? String(notesEl.value || '').trim() : '',
          case_kind: isCancel ? 'cancellation' : 'absence'
        }).then(function (r) {
          save.disabled = false;
          if (r.error) {
            showErr(r.message || r.error || 'Save failed');
            return;
          }
          if (typeof cfg.closeModal === 'function') cfg.closeModal();
          cfg.toast(
            r.already_reported
              ? 'Already on file for that session'
              : isCancel
                ? 'Cancelled session queued for credit / refund / makeup decision'
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
    return { report: j.report, grant: j.grant, credit: j.credit, credit_apply: j.credit_apply };
  }

  function rowHtml(r) {
    var proof = r.proof_signed_url
      ? '<a href="' + esc(r.proof_signed_url) + '" target="_blank" rel="noopener">Open proof</a>'
      : '<span class="muted">No proof</span>';
    var isCancel = String(r.case_kind || '') === 'cancellation';
    var fromSchedule = !!(r.schedule_override_id);
    var canDecide =
      r.status === 'pending_review' ||
      (r.status === 'missed' && (r.proof_storage_path || fromSchedule));
    var canGrantMakeup =
      !isCancel &&
      !canDecide &&
      (r.status === 'missed' || r.status === 'expired') &&
      !r.proof_storage_path;
    var actions = '';
    if (canDecide) {
      actions =
        '<div class="pp-admin-absence-acts" style="display:flex;flex-wrap:wrap;gap:6px;min-width:0">' +
        '<select data-absence-outcome="' +
        esc(r.id) +
        '" aria-label="Outcome">' +
        '<option value="none">None (no money / no message)</option>' +
        '<option value="credit">Credit</option>' +
        '<option value="refund">Refund</option>' +
        '<option value="makeup">Makeup</option>' +
        '</select>' +
        '<button type="button" class="btn btn--sm btn--primary" data-absence-approve="' +
        esc(r.id) +
        '">Approve</button>' +
        '</div>';
    } else if (canGrantMakeup) {
      actions =
        '<button type="button" class="btn btn--sm btn--sec" data-absence-grant-makeup="' +
        esc(r.id) +
        '">Grant makeup</button>' +
        '<span class="muted" style="display:block;margin-top:4px;font-size:11px;overflow-wrap:break-word">Pick venue + open roster seat</span>';
    } else if (
      r.status === 'excused' ||
      r.status === 'noted' ||
      r.status === 'rejected' ||
      r.status === 'expired'
    ) {
      actions =
        '<span class="muted" style="display:block;margin-bottom:4px;overflow-wrap:break-word">' +
        esc(r.outcome ? 'Outcome: ' + r.outcome : r.review_notes || '—') +
        '</span>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-absence-reopen="' +
        esc(r.id) +
        '">Reopen to decide again</button>';
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
      '</strong>' +
      (String(r.case_kind || '') === 'cancellation'
        ? ' <span class="chip chip--pend" style="font-size:10px">Cancel</span>'
        : '') +
      '</td>' +
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
      (r.outcome
        ? ' <span class="chip chip--ok" style="font-size:10px">' + esc(String(r.outcome)) + '</span>'
        : '') +
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
      return '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">No reports in this filter. Try <strong>Decided</strong> or <strong>All since 1 Sep</strong>.</p>';
    }
    return (
      '<div class="card" style="margin-top:0"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense"><thead><tr>' +
      '<th>Participant</th><th>Session</th><th>Service</th><th>Note</th><th>Status / outcome</th><th>Proof deadline</th><th>Proof</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      reports.map(rowHtml).join('') +
      '</tbody></table></div></div>'
    );
  }

  function viewHtml() {
    return (
      '<div class="portal-parent-absences-embed">' +
      '<h1 class="page-title">Absents &amp; cancelled (decision queue)</h1>' +
      '<p class="page-intro" style="max-width:52rem;overflow-wrap:break-word">Decide credit, refund, makeup or none. None = no parent message — find those under <strong>Decided</strong>. Wrong call? Use <strong>Reopen to decide again</strong>. Makeup picks an open roster seat — or place MakeUp in Schedule &amp; Covers and this row closes automatically.</p>' +
      '<div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-absence-filter="needs_decision">Open (decide)</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="decided">Decided</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="all">All</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentAbsenceRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="portalParentAbsenceAdd">Add absent</button>' +
      '<button type="button" class="btn btn--sm" id="portalParentAbsenceAddCancel">Add cancelled</button>' +
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
    function metaLine() {
      return (
        String(state.meta.total != null ? state.meta.total : state.reports.length) +
        ' open since ' +
        String(state.meta.since || state.since || '1 Sep') +
        ' · ' +
        String(state.meta.absences || 0) +
        ' absent · ' +
        String(state.meta.cancellations || 0) +
        ' cancel'
      );
    }
    var metaEl = global.document.getElementById('portalParentAbsenceMeta');
    if (metaEl) metaEl.textContent = metaLine();
    var metaEmbed = global.document.getElementById('portalParentAbsenceMetaEmbed');
    if (metaEmbed) metaEmbed.textContent = metaLine();
    hostEl.innerHTML = tableHtml(state.reports);
    bindRowActions(hostEl);
  }

  function normName(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function timeLabelToOffer(label) {
    var s = String(label || '')
      .replace(/\u2013|\u2014|–|—/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    var m = s.match(/(\d{1,2}(?:\.\d{1,2})?)\s*[-to]+\s*(\d{1,2}(?:\.\d{1,2})?)/i);
    if (!m) return s.replace(/\./g, '.');
    function fmt(x) {
      var n = String(x).replace(/^0+/, '') || '0';
      return n;
    }
    return fmt(m[1]) + ' to ' + fmt(m[2]);
  }

  function nextIsoForWeekday(dayName) {
    var map = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    var want = map[String(dayName || '').toLowerCase()];
    if (want == null) return '';
    var d = new Date();
    var cur = d.getDay();
    var add = (want - cur + 7) % 7;
    if (add === 0) add = 7;
    d.setDate(d.getDate() + add);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function standingInstructorForParticipant(displayName) {
    var occ = global.PORTAL_CAPACITY_CHAIN_OCCUPANTS;
    var by = occ && occ.bySlotId;
    if (!by) return '';
    var target = normName(displayName);
    if (!target) return '';
    var hit = '';
    Object.keys(by).forEach(function (id) {
      if (hit) return;
      var slot = by[id] || {};
      (slot.seatLines || []).forEach(function (line) {
        if (hit) return;
        if (String(line.kind || '') !== 'booked') return;
        var cn = normName(line.client);
        if (!cn) return;
        if (cn === target || cn.indexOf(target) === 0 || target.indexOf(cn) === 0) {
          hit = String(line.instructor || '').trim();
        }
      });
    });
    return hit;
  }

  function listOpenMakeupSlots(opts) {
    opts = opts || {};
    var venueFilter = String(opts.venue || '').trim().toLowerCase();
    var preferInstr = normName(opts.preferInstructor || '');
    var occ = global.PORTAL_CAPACITY_CHAIN_OCCUPANTS;
    var by = occ && occ.bySlotId;
    if (!by) return [];
    var rows = [];
    Object.keys(by).forEach(function (id) {
      var slot = by[id] || {};
      if (String(slot.phase || '').indexOf('week1') === 0) return;
      if (String(slot.phase || '').indexOf('dated_') === 0) return;
      if (Number(slot.openSeats || 0) < 1 && !(slot.openInstructors || []).length) return;
      var venue = String(slot.venue || '').trim();
      if (venueFilter && venue.toLowerCase() !== venueFilter) return;
      (slot.seatLines || []).forEach(function (line) {
        if (String(line.kind || '') !== 'open') return;
        var instr = String(line.instructor || '').trim();
        if (!instr) return;
        var same = preferInstr && normName(instr) === preferInstr;
        rows.push({
          slotId: id,
          venue: venue,
          day: String(slot.day || '').trim(),
          timeLabel: String(slot.timeLabel || '').trim(),
          serviceId: String(slot.serviceId || '').trim(),
          instructor: instr,
          sameStanding: !!same,
          nextDate: nextIsoForWeekday(slot.day)
        });
      });
    });
    rows.sort(function (a, b) {
      if (a.sameStanding !== b.sameStanding) return a.sameStanding ? -1 : 1;
      if (a.venue !== b.venue) return a.venue < b.venue ? -1 : 1;
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      return String(a.timeLabel).localeCompare(String(b.timeLabel));
    });
    return rows;
  }

  function openMakeupSlotModal(report, onPicked) {
    if (typeof cfg.openModal !== 'function') {
      cfg.toast('Modal unavailable', 'error');
      return;
    }
    var preferInstr = standingInstructorForParticipant(report.participant_display);
    var hintVenue = '';
    var svc = String(report.service_label || '');
    ['Acton', 'Northolt', 'SwimFarm', 'Westway'].forEach(function (v) {
      if (!hintVenue && svc.toLowerCase().indexOf(v.toLowerCase()) >= 0) hintVenue = v;
    });
    var venues = [];
    listOpenMakeupSlots({}).forEach(function (s) {
      if (venues.indexOf(s.venue) < 0) venues.push(s.venue);
    });
    venues.sort();
    if (hintVenue && venues.indexOf(hintVenue) < 0) venues.unshift(hintVenue);

    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Makeup — pick open roster seat</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Open seats from capacity-chain roster. Prefer same standing instructor' +
        (preferInstr ? ' (<strong>' + esc(preferInstr) + '</strong>)' : '') +
        '; other open plazas still listed if that instructor is full.</p>' +
        '<label class="muted">Venue</label>' +
        '<select class="inp" id="ppMakeupVenuePick" style="max-width:100%;box-sizing:border-box">' +
        venues
          .map(function (v) {
            return (
              '<option value="' +
              esc(v) +
              '"' +
              (v === hintVenue ? ' selected' : '') +
              '>' +
              esc(v) +
              '</option>'
            );
          })
          .join('') +
        '</select>' +
        '<label class="muted" style="display:block;margin-top:10px">Session date</label>' +
        '<input class="inp" id="ppMakeupDatePick" type="date" style="max-width:100%;box-sizing:border-box" />' +
        '<div id="ppMakeupSlotList" style="margin-top:10px;max-height:280px;overflow:auto;min-width:0"></div>' +
        '<p id="ppMakeupSlotErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppMakeupSlotCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppMakeupSlotSave" disabled>Approve makeup + offer</button>' +
        '</div>'
    );

    var picked = null;
    function paintSlots() {
      var venueEl = global.document.getElementById('ppMakeupVenuePick');
      var listEl = global.document.getElementById('ppMakeupSlotList');
      var dateEl = global.document.getElementById('ppMakeupDatePick');
      var saveBtn = global.document.getElementById('ppMakeupSlotSave');
      if (!listEl) return;
      var venue = venueEl ? venueEl.value : hintVenue;
      var slots = listOpenMakeupSlots({ venue: venue, preferInstructor: preferInstr });
      picked = null;
      if (saveBtn) saveBtn.disabled = true;
      if (!slots.length) {
        listEl.innerHTML =
          '<p class="muted" style="margin:0;overflow-wrap:break-word">No open seats at this venue on the standing roster.</p>';
        return;
      }
      listEl.innerHTML = slots
        .map(function (s, i) {
          return (
            '<button type="button" class="btn btn--ghost btn--sm" data-mk-slot="' +
            i +
            '" style="display:block;width:100%;text-align:left;margin:0 0 6px;min-width:0;overflow-wrap:break-word">' +
            (s.sameStanding ? '<span class="chip chip--ok" style="font-size:10px">Same instructor</span> ' : '') +
            '<strong>' +
            esc(s.instructor) +
            '</strong> · ' +
            esc(s.day) +
            ' · ' +
            esc(s.timeLabel) +
            ' · ' +
            esc(s.venue) +
            '</button>'
          );
        })
        .join('');
      listEl.querySelectorAll('[data-mk-slot]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-mk-slot'));
          picked = slots[idx];
          listEl.querySelectorAll('[data-mk-slot]').forEach(function (b) {
            b.classList.toggle('btn--pri', b === btn);
            b.classList.toggle('btn--ghost', b !== btn);
          });
          if (dateEl && picked && picked.nextDate) dateEl.value = picked.nextDate;
          if (saveBtn) saveBtn.disabled = false;
        });
      });
      if (slots[0] && dateEl && !dateEl.value) dateEl.value = slots[0].nextDate || '';
    }

    var venueEl = global.document.getElementById('ppMakeupVenuePick');
    if (venueEl) venueEl.addEventListener('change', paintSlots);
    paintSlots();

    var cancel = global.document.getElementById('ppMakeupSlotCancel');
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === 'function') cfg.closeModal();
      };
    }
    var save = global.document.getElementById('ppMakeupSlotSave');
    if (save) {
      save.onclick = function () {
        var errEl = global.document.getElementById('ppMakeupSlotErr');
        var dateEl = global.document.getElementById('ppMakeupDatePick');
        function showErr(msg) {
          if (!errEl) return;
          errEl.style.display = 'block';
          errEl.textContent = msg;
        }
        if (!picked) {
          showErr('Pick an open seat.');
          return;
        }
        var sessionDate = dateEl ? String(dateEl.value || '').trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
          showErr('Session date required.');
          return;
        }
        save.disabled = true;
        onPicked({
          venue: picked.venue,
          instructor: picked.instructor,
          session_date: sessionDate,
          session_time: timeLabelToOffer(picked.timeLabel),
          service_label: (picked.serviceId || 'session') + ' · ' + picked.venue
        });
      };
    }
  }

  async function createMakeupOffer(grantId, slot) {
    var token = await portalAuthToken();
    if (!token) return { error: 'session_expired' };
    var res = await fetch(supabaseBase() + '/functions/v1/portal-admin-makeup-offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: cfg.getAnonKey()
      },
      body: JSON.stringify({
        action: 'create',
        grant_id: grantId,
        venue: slot.venue,
        session_date: slot.session_date,
        session_time: slot.session_time,
        instructor_name: slot.instructor,
        service_label: slot.service_label || '',
        offer_notes: 'Offered from Absents decide queue'
      })
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return { error: (j && j.error) || 'offer_failed', message: (j && j.message) || '' };
    }
    return j;
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-absence-reopen]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-reopen');
        if (
          !global.confirm(
            'Reopen this row to decide again? Linked open makeup grants / open credits for this row will be cancelled.'
          )
        ) {
          return;
        }
        btn.disabled = true;
        void decide(id, 'reopen', '', 'Reopened by office to decide again', '').then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Reopen failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Reopened — back in Open (decide). Refresh Makeup / Credits if needed.', 'ok');
          state.filter = 'needs_decision';
          global.document.querySelectorAll('[data-absence-filter]').forEach(function (b) {
            var on = b.getAttribute('data-absence-filter') === state.filter;
            b.classList.toggle('btn--ghost', !on);
          });
          void renderHost(global.document.getElementById('portalParentAbsenceHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-absence-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-approve');
        var sel = hostEl.querySelector('[data-absence-outcome="' + id + '"]');
        var outcome = sel ? sel.value : 'none';
        var report = null;
        for (var i = 0; i < state.reports.length; i++) {
          if (String(state.reports[i].id) === String(id)) {
            report = state.reports[i];
            break;
          }
        }

        function runApprove(notes, venue, amount, slot) {
          btn.disabled = true;
          void decide(id, 'approve', outcome, notes || '', venue || '', amount).then(function (r) {
            if (r.error) {
              cfg.toast(r.message || r.error || 'Approve failed', 'error');
              btn.disabled = false;
              return;
            }
            var finish = function () {
              var extra = r.credit ? ' · ledger row created' : '';
              if (outcome === 'credit' && r.credit_apply) {
                if (r.credit_apply.skipped === 'gocardless_held_for_next_term') {
                  extra += ' — credit held for next term (GoCardless)';
                } else if (r.credit_apply.skipped === 'no_open_invoice') {
                  extra += ' — credit open (no unpaid invoice yet)';
                } else if (r.credit_apply.applications && r.credit_apply.applications.length) {
                  extra += ' — applied to next invoice';
                }
              }
              if (r.parent_notify) {
                if (r.parent_notify.ok) extra += ' · parent notified';
                else if (r.parent_notify.skipped) extra += ' · notify skipped';
                else extra += ' · notify failed';
              }
              if (slot) extra += ' · makeup offer sent';
              cfg.toast(
                outcome === 'none'
                  ? 'Decided: none (no parent message)' + extra
                  : 'Excused — outcome: ' + outcome + extra,
                'ok'
              );
              void renderHost(global.document.getElementById('portalParentAbsenceHost'));
            };
            if (outcome === 'makeup' && slot && r.grant && r.grant.id) {
              void createMakeupOffer(r.grant.id, slot).then(function (o) {
                if (o.error) {
                  cfg.toast(
                    'Makeup granted but offer failed: ' + (o.message || o.error),
                    'error'
                  );
                }
                if (typeof cfg.closeModal === 'function') cfg.closeModal();
                finish();
              });
              return;
            }
            if (typeof cfg.closeModal === 'function') cfg.closeModal();
            finish();
          });
        }

        if (outcome === 'makeup') {
          if (!report) {
            cfg.toast('Report not found', 'error');
            return;
          }
          openMakeupSlotModal(report, function (slot) {
            runApprove('', slot.venue, null, slot);
          });
          return;
        }

        var notes = '';
        var amount = null;
        if (outcome === 'credit' || outcome === 'refund') {
          notes = global.prompt('Optional notes for the family / file:', '') || '';
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
        runApprove(notes, '', amount, null);
      });
    });
    hostEl.querySelectorAll('[data-absence-grant-makeup]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-absence-grant-makeup');
        var report = null;
        for (var i = 0; i < state.reports.length; i++) {
          if (String(state.reports[i].id) === String(id)) {
            report = state.reports[i];
            break;
          }
        }
        if (!report) {
          cfg.toast('Report not found', 'error');
          return;
        }
        openMakeupSlotModal(report, function (slot) {
          btn.disabled = true;
          void decide(id, 'grant_makeup', 'makeup', '', slot.venue).then(function (r) {
            if (r.error) {
              cfg.toast(r.message || r.error || 'Grant failed', 'error');
              btn.disabled = false;
              return;
            }
            var grantId = r.grant && r.grant.id;
            if (!grantId) {
              cfg.toast(r.already ? 'Makeup grant already exists' : 'Grant saved', 'ok');
              if (typeof cfg.closeModal === 'function') cfg.closeModal();
              void renderHost(global.document.getElementById('portalParentAbsenceHost'));
              return;
            }
            void createMakeupOffer(grantId, slot).then(function (o) {
              if (typeof cfg.closeModal === 'function') cfg.closeModal();
              if (o.error) {
                cfg.toast('Grant ok; offer failed: ' + (o.message || o.error), 'error');
              } else {
                cfg.toast('Makeup grant + offer (parent can Accept / Decline)', 'ok');
              }
              void renderHost(global.document.getElementById('portalParentAbsenceHost'));
            });
          });
        });
      });
    });
  }

  function bindAddButtons() {
    [
      { id: 'portalParentAbsenceAdd', mode: 'absence' },
      { id: 'portalParentAbsenceAddEmbed', mode: 'absence' },
      { id: 'portalParentAbsenceAddCancel', mode: 'cancellation' },
      { id: 'portalParentAbsenceAddCancelEmbed', mode: 'cancellation' }
    ].forEach(function (item) {
      var btn = global.document.getElementById(item.id);
      if (!btn || btn.getAttribute('data-bound') === '1') return;
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', function () {
        openCreateModal(item.mode);
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

  /** Embed block for Absents & credits page — primary decide queue. */
  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Absents &amp; cancellations — decide</h3>' +
      '<span class="chip chip--pend" id="portalParentAbsenceMetaEmbed">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:52rem;overflow-wrap:break-word">Pick outcome → <strong>Approve</strong>. <strong>None</strong> = nothing owed, no parent message (then leaves Open — find them under <strong>Decided</strong>). <strong>Credit / refund</strong> = ledger + aviso. <strong>Makeup</strong> = pick venue + open roster seat here, or place MakeUp in Schedule &amp; Covers (auto-closes the oldest open row for that child). Wrong decision? Open <strong>Decided</strong> → <strong>Reopen to decide again</strong>.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-absence-filter="needs_decision">Open (decide)</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="decided">Decided</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-absence-filter="all">All since 1 Sep</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalParentAbsenceRefreshEmbed">Refresh</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="portalParentAbsenceAddEmbed">Add absent</button>' +
      '<button type="button" class="btn btn--sm" id="portalParentAbsenceAddCancelEmbed">Add cancelled</button>' +
      '</div>' +
      '<div id="portalParentAbsenceHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  function bindEmbed() {
    state.filter = 'needs_decision';
    state.since = '2026-09-01';
    bindModule();
    bindAddButtons();
    var refresh = global.document.getElementById('portalParentAbsenceRefreshEmbed');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalParentAbsenceHost'));
      });
    }
    void renderHost(global.document.getElementById('portalParentAbsenceHost'));
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
