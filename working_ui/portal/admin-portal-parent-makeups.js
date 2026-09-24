/**
 * Admin — makeup grants waiting list (offer by venue; decline forfeits).
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

  var state = { filter: 'open', venue: '', grants: [], meta: {}, pick: null };

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
      return { error: (j && j.error) || 'request_failed', message: (j && j.message) || '', raw: j };
    }
    return j;
  }

  function formatDayOnly(iso) {
    if (!iso) return '—';
    try {
      var s = String(iso).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        var p = s.split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      return formatDate(iso);
    } catch (_e) {
      return String(iso);
    }
  }

  function statusLabel(status) {
    var st = String(status || '').toLowerCase();
    if (st === 'consumed') return 'Make up';
    if (st === 'offered') return 'Offered';
    if (st === 'open') return 'Open';
    if (st === 'cancelled') return 'Cancelled';
    if (st === 'forfeited') return 'Forfeited';
    return status || '—';
  }

  function statusChipClass(status) {
    var st = String(status || '').toLowerCase();
    if (st === 'open') return 'pend';
    if (st === 'offered') return 'info';
    if (st === 'consumed') return 'makeup';
    if (st === 'cancelled') return 'urg';
    if (st === 'forfeited') return 'warn';
    return 'pend';
  }

  function rowHtml(g) {
    var pending = g.pending_offer;
    var makeupDay = String(g.makeup_day || '').slice(0, 10);
    var makeupTime = String(g.makeup_time || '').trim();
    var absentDay = String(g.absence_session_date || '').slice(0, 10);
    var actions = '';
    var reopenBtn =
      g.absence_report_id && (g.status === 'open' || g.status === 'offered')
        ? ' <button type="button" class="btn btn--sm btn--ghost" data-makeup-reopen-decide="' +
          esc(g.absence_report_id) +
          '" data-grant-id="' +
          esc(g.id) +
          '">Back to decide</button>'
        : '';
    if (g.status === 'open') {
      actions =
        '<button type="button" class="btn btn--sm btn--primary" data-makeup-offer="' +
        esc(g.id) +
        '" data-venue="' +
        esc(g.preferred_venue || '') +
        '">Offer slot</button>' +
        ' <button type="button" class="btn btn--sm btn--ghost" data-makeup-cancel="' +
        esc(g.id) +
        '">Cancel grant</button>' +
        reopenBtn;
    } else if (g.status === 'offered' && pending) {
      actions =
        '<span class="muted" style="display:block;margin-bottom:4px;overflow-wrap:break-word">' +
        esc(formatDayOnly(pending.session_date)) +
        (pending.session_time ? ' · ' + esc(pending.session_time) : '') +
        (pending.instructor_name ? ' · ' + esc(pending.instructor_name) : '') +
        '</span>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-makeup-withdraw="' +
        esc(pending.id) +
        '">Withdraw offer</button>' +
        ' <button type="button" class="btn btn--sm btn--ghost" data-makeup-cancel="' +
        esc(g.id) +
        '">Cancel grant</button>' +
        reopenBtn;
    } else if (g.status === 'consumed') {
      var accepted = (g.offers || []).find(function (o) {
        return o && o.status === 'accepted';
      });
      actions =
        '<span class="muted" style="overflow-wrap:break-word">On roster' +
        (accepted && accepted.roster_override_id ? ' ✓' : makeupDay ? '' : ' (pending link)') +
        '</span>' +
        reopenBtn;
    } else {
      actions = '<span class="muted">' + esc(statusLabel(g.status)) + '</span>' + reopenBtn;
    }

    var makeupCell =
      makeupDay
        ? '<strong>' +
          esc(formatDayOnly(makeupDay)) +
          '</strong>' +
          (makeupTime
            ? '<div class="muted" style="font-size:11px;margin-top:2px;overflow-wrap:break-word">' +
              esc(makeupTime) +
              '</div>'
            : '')
        : '<span class="muted">—</span>';

    return (
      '<tr>' +
      '<td style="min-width:0;overflow-wrap:break-word;text-align:left">' +
      '<strong style="display:block">' +
      esc(g.participant_display || '—') +
      '</strong>' +
      '<span class="muted" style="display:block;font-size:11px;margin-top:2px;overflow-wrap:break-word">' +
      esc(g.service_label || '—') +
      '</span></td>' +
      '<td style="min-width:0;overflow-wrap:break-word"><strong>' +
      esc(g.preferred_venue || '—') +
      '</strong></td>' +
      '<td style="text-align:center;vertical-align:middle"><span class="chip chip--' +
      statusChipClass(g.status) +
      '">' +
      esc(statusLabel(g.status)) +
      '</span></td>' +
      '<td class="muted">' +
      esc(String(g.source || '').replace(/_/g, ' ')) +
      '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
      esc(formatDayOnly(absentDay)) +
      '</td>' +
      '<td style="min-width:0;overflow-wrap:break-word;white-space:nowrap">' +
      makeupCell +
      '</td>' +
      '<td style="min-width:0">' +
      actions +
      '</td>' +
      '</tr>'
    );
  }

  function tableHtml(grants) {
    if (!grants.length) {
      return '<p class="muted" style="margin:0;max-width:48rem;overflow-wrap:break-word">No makeup grants in this filter.</p>';
    }
    return (
      '<div class="card" style="margin-top:0"><div class="card-pad" style="overflow:auto;padding:0">' +
      '<table class="tbl tbl--center tbl--dense pp-queue-tbl"><thead><tr>' +
      '<th>Participant</th><th>Venue</th><th>Status</th><th>Source</th><th>Absent date</th><th>Makeup day</th><th>Actions</th>' +
      '</tr></thead><tbody>' +
      grants.map(rowHtml).join('') +
      '</tbody></table></div></div>'
    );
  }

  function embedHtml() {
    return (
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-h"><h3>Makeup grants (by venue)</h3>' +
      '<span class="chip chip--pend" id="portalMakeupMeta">…</span></div>' +
      '<div class="card-pad">' +
      '<p class="muted" style="margin:0 0 10px;max-width:48rem;overflow-wrap:break-word">Waiting-list style: offer a concrete slot at the family&apos;s <strong>preferred venue</strong> (instructor + time required). If they <strong>Accept</strong>, MakeUp is written to the roster automatically. If they <strong>Decline</strong>, they forfeit the grant and the slot can go to the next family. Wrong grant? <strong>Cancel grant</strong>. Use <strong>Add makeup</strong> when a parent phones in.</p>' +
      '<div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--sm" data-makeup-filter="open">Open</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-makeup-filter="offered">Offered</button>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-makeup-filter="all">All</button>' +
      '<input type="text" id="portalMakeupVenueFilter" placeholder="Filter venue…" style="min-width:0;max-width:10rem;padding:6px 8px;border:1px solid var(--line);border-radius:8px" />' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalMakeupRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="portalMakeupAdd">Add makeup</button>' +
      '</div>' +
      '<div id="portalMakeupHost"><p class="muted">Loading…</p></div>' +
      '</div></div>'
    );
  }

  async function renderHost(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = '<p class="muted">Loading…</p>';
    var venueEl = global.document.getElementById('portalMakeupVenueFilter');
    state.venue = venueEl ? String(venueEl.value || '').trim() : state.venue;
    var res = await api('portal-admin-makeup-list', {
      status: state.filter,
      venue: state.venue,
      limit: 150
    });
    if (res.error) {
      hostEl.innerHTML =
        '<p class="muted" style="color:var(--danger,#c62828)">Could not load (' +
        esc(res.error) +
        '). Apply makeup SQL + deploy functions if this is new.</p>';
      return;
    }
    state.grants = res.grants || [];
    state.meta = res.meta || {};
    var meta = global.document.getElementById('portalMakeupMeta');
    if (meta) {
      meta.textContent =
        String(state.meta.open || 0) + ' open · ' + String(state.meta.offered || 0) + ' offered';
    }
    hostEl.innerHTML = tableHtml(state.grants);
    bindRowActions(hostEl);
  }

  function bindRowActions(hostEl) {
    if (!hostEl) return;
    hostEl.querySelectorAll('[data-makeup-offer]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var grantId = btn.getAttribute('data-makeup-offer');
        var venue = btn.getAttribute('data-venue') || '';
        var sessionDate = global.prompt('Session date (YYYY-MM-DD):', '') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate.trim())) {
          cfg.toast('Need a valid date YYYY-MM-DD', 'error');
          return;
        }
        var sessionTime = global.prompt('Time slot (e.g. 5 to 5.30) — required:', '') || '';
        if (!String(sessionTime).trim()) {
          cfg.toast('Time slot required', 'error');
          return;
        }
        var instructor = global.prompt('Instructor (required — used for roster):', '') || '';
        if (!String(instructor).trim()) {
          cfg.toast('Instructor required so Accept can place MakeUp on the roster', 'error');
          return;
        }
        var notes = global.prompt('Note to family (optional):', '') || '';
        btn.disabled = true;
        void api('portal-admin-makeup-offer', {
          action: 'create',
          grant_id: grantId,
          venue: venue,
          session_date: sessionDate.trim(),
          session_time: sessionTime.trim(),
          instructor_name: instructor.trim(),
          offer_notes: notes.trim()
        }).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error, 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Offer sent — Accept places MakeUp on roster; Decline forfeits', 'ok');
          void renderHost(global.document.getElementById('portalMakeupHost'));
        });
      });
    });
    hostEl.querySelectorAll('[data-makeup-withdraw]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var offerId = btn.getAttribute('data-makeup-withdraw');
        if (!global.confirm('Withdraw this offer? Grant returns to Open.')) return;
        btn.disabled = true;
        void api('portal-admin-makeup-offer', { action: 'withdraw', offer_id: offerId }).then(
          function (r) {
            if (r.error) {
              cfg.toast(r.error, 'error');
              btn.disabled = false;
              return;
            }
            cfg.toast('Offer withdrawn', 'ok');
            void renderHost(global.document.getElementById('portalMakeupHost'));
          }
        );
      });
    });
    hostEl.querySelectorAll('[data-makeup-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var grantId = btn.getAttribute('data-makeup-cancel');
        if (
          !global.confirm(
            'Cancel this makeup grant? It leaves the Open list (view under All as cancelled).'
          )
        ) {
          return;
        }
        btn.disabled = true;
        void api('portal-admin-makeup-grant', { action: 'cancel', grant_id: grantId }).then(
          function (r) {
            if (r.error) {
              cfg.toast(r.message || r.error, 'error');
              btn.disabled = false;
              return;
            }
            cfg.toast('Makeup grant cancelled', 'ok');
            void renderHost(global.document.getElementById('portalMakeupHost'));
          }
        );
      });
    });
    hostEl.querySelectorAll('[data-makeup-reopen-decide]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var absenceId = btn.getAttribute('data-makeup-reopen-decide');
        if (!absenceId) {
          cfg.toast('No linked absence to reopen', 'error');
          return;
        }
        if (
          !global.confirm(
            'Reopen the linked absence to decide again? This cancels open makeup grants / open credits for that row.'
          )
        ) {
          return;
        }
        btn.disabled = true;
        void api('portal-admin-parent-absence-decide', {
          action: 'reopen',
          report_id: absenceId,
          notes: 'Reopened from Makeup grants — office to decide again'
        }).then(function (r) {
          if (r.error) {
            cfg.toast(r.message || r.error || 'Reopen failed', 'error');
            btn.disabled = false;
            return;
          }
          cfg.toast('Reopened — back in Absents Open. Refresh if needed.', 'ok');
          void renderHost(global.document.getElementById('portalMakeupHost'));
        });
      });
    });
  }

  async function searchParticipants(q) {
    var client = cfg.getClient();
    var hitsEl = global.document.getElementById('ppMakeupCreateHits');
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
          '<button type="button" class="btn btn--ghost btn--sm" style="display:block;width:100%;text-align:left;margin:0 0 4px;min-width:0;overflow-wrap:break-word" data-pp-mu-pick="' +
          esc(p.contact_id) +
          '" data-pp-mu-name="' +
          esc(name) +
          '" data-pp-mu-parent="' +
          esc(p.parent_person_id || '') +
          '">' +
          esc(name) +
          ' <span class="muted">' +
          esc(p.contact_id) +
          '</span></button>'
        );
      })
      .join('');
    hitsEl.querySelectorAll('[data-pp-mu-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.pick = {
          contact_id: btn.getAttribute('data-pp-mu-pick') || '',
          parent_person_id: btn.getAttribute('data-pp-mu-parent') || '',
          display_name: btn.getAttribute('data-pp-mu-name') || ''
        };
        var label = global.document.getElementById('ppMakeupCreateSelected');
        if (label) {
          label.textContent = state.pick.display_name + ' (' + state.pick.contact_id + ')';
        }
        hitsEl.innerHTML = '';
        hitsEl.hidden = true;
        paintCreateSlots();
      });
    });
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
    if (!m) return s;
    return String(m[1]).replace(/^0+/, '') + ' to ' + String(m[2]).replace(/^0+/, '');
  }

  function nextIsoForWeekday(dayName) {
    var map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    var want = map[String(dayName || '').toLowerCase()];
    if (want == null) return '';
    var d = new Date();
    var add = (want - d.getDay() + 7) % 7;
    if (add === 0) add = 7;
    d.setDate(d.getDate() + add);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function upcomingWeekdayDates(dayName, count) {
    var first = nextIsoForWeekday(dayName);
    if (!first) return [];
    var d = new Date(first + 'T12:00:00');
    var out = [];
    var i;
    for (i = 0; i < count; i++) {
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      out.push(y + '-' + m + '-' + day);
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  function prettyMakeupDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso;
    var names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    return names[dt.getUTCDay()] + ' ' + p[2] + '-' + p[1] + '-' + p[0];
  }

  function standingSeatForParticipant(displayName) {
    var occ = global.PORTAL_CAPACITY_CHAIN_OCCUPANTS;
    var by = occ && occ.bySlotId;
    if (!by) return null;
    var target = normName(displayName);
    if (!target) return null;
    var hit = null;
    Object.keys(by).forEach(function (id) {
      if (hit) return;
      var slot = by[id] || {};
      (slot.seatLines || []).forEach(function (line) {
        if (hit) return;
        if (String(line.kind || '') !== 'booked') return;
        var cn = normName(line.client);
        if (!cn) return;
        if (cn === target || cn.indexOf(target) === 0 || target.indexOf(cn) === 0) {
          hit = {
            instructor: String(line.instructor || '').trim(),
            venue: String(slot.venue || '').trim(),
            service: String(slot.service || slot.programme || slot.serviceId || '').trim()
          };
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
      var serviceMap = {
        aquatic: 'Aquatic Activity',
        physical: 'Physical Activity',
        climbing: 'Climbing',
        multi: 'Multi-activity',
        bespoke: 'Bespoke',
        day_centre: 'Day Centre'
      };
      var rawService = String(slot.service || slot.programme || slot.serviceName || slot.serviceId || '').trim();
      var service = serviceMap[rawService] || rawService.replace(/[-_]+/g, ' ');
      (slot.seatLines || []).forEach(function (line) {
        if (String(line.kind || '') !== 'open') return;
        var instr = String(line.instructor || '').trim();
        if (!instr) return;
        rows.push({
          venue: venue,
          day: String(slot.day || '').trim(),
          timeLabel: String(slot.timeLabel || '').trim(),
          service: service,
          instructor: instr,
          sameStanding: !!(preferInstr && normName(instr) === preferInstr)
        });
      });
    });
    rows.sort(function (a, b) {
      if (a.sameStanding !== b.sameStanding) return a.sameStanding ? -1 : 1;
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      return String(a.timeLabel).localeCompare(String(b.timeLabel));
    });
    return rows;
  }

  function paintCreateSlots() {
    var venueEl = global.document.getElementById('ppMakeupCreateVenue');
    var listEl = global.document.getElementById('ppMakeupCreateSlots');
    var datesEl = global.document.getElementById('ppMakeupCreateDates');
    if (!listEl || !state.pick) return;
    var standing = standingSeatForParticipant(state.pick.display_name);
    state.standing = standing;
    var all = listOpenMakeupSlots({ preferInstructor: standing && standing.instructor });
    var venues = [];
    all.forEach(function (s) {
      if (s.venue && venues.indexOf(s.venue) < 0) venues.push(s.venue);
    });
    venues.sort();
    var preferVenue = standing && standing.venue && venues.indexOf(standing.venue) >= 0 ? standing.venue : venues[0] || '';
    if (venueEl) {
      var current = venueEl.value && venues.indexOf(venueEl.value) >= 0 ? venueEl.value : preferVenue;
      venueEl.innerHTML = venues
        .map(function (v) {
          return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
        })
        .join('');
    }
    var venue = venueEl ? venueEl.value : preferVenue;
    var slots = all.filter(function (s) {
      return !venue || s.venue === venue;
    });
    state.slotPick = null;
    state.datePick = '';
    if (datesEl) datesEl.innerHTML = '';
    if (!slots.length) {
      listEl.innerHTML = '<p class="muted" style="margin:0">No open seats at this centre.</p>';
      return;
    }
    listEl.innerHTML = slots
      .map(function (s, i) {
        var dates = upcomingWeekdayDates(s.day, 4);
        var dateBtns = dates
          .map(function (iso) {
            return (
              '<button type="button" class="btn btn--ghost btn--sm" data-mk-create-slot="' +
              i +
              '" data-mk-create-date="' +
              esc(iso) +
              '" style="margin:0 6px 6px 0">' +
              esc(prettyMakeupDate(iso)) +
              '</button>'
            );
          })
          .join('');
        return (
          '<div style="margin:0 0 10px;min-width:0">' +
          '<div style="font-size:13px;overflow-wrap:break-word;margin:0 0 4px">' +
          (s.sameStanding ? '<span class="chip chip--ok" style="font-size:10px">Their instructor</span> ' : '<span class="chip" style="font-size:10px">Other instructor</span> ') +
          '<strong>' +
          esc(s.instructor) +
          '</strong> · ' +
          esc(s.timeLabel) +
          ' · ' +
          esc(s.service || 'Session') +
          '</div>' +
          '<div style="min-width:0">' +
          dateBtns +
          '</div></div>'
        );
      })
      .join('');
    listEl.querySelectorAll('[data-mk-create-date]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-mk-create-slot'));
        state.slotPick = slots[idx];
        state.datePick = btn.getAttribute('data-mk-create-date') || '';
        listEl.querySelectorAll('[data-mk-create-date]').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('btn--pri', on);
          b.classList.toggle('btn--ghost', !on);
        });
      });
    });
  }

  function paintCreateDates() {
    var datesEl = global.document.getElementById('ppMakeupCreateDates');
    if (!datesEl || !state.slotPick) return;
    var dates = upcomingWeekdayDates(state.slotPick.day, 6);
    state.datePick = dates[0] || '';
    datesEl.innerHTML =
      '<div class="muted" style="font-size:12px;margin:8px 0 6px">Day for the parent to accept</div>' +
      dates
        .map(function (iso) {
          return (
            '<button type="button" class="btn btn--sm ' +
            (iso === state.datePick ? 'btn--pri' : 'btn--ghost') +
            '" data-mk-create-date="' +
            esc(iso) +
            '" style="margin:0 6px 6px 0">' +
            esc(prettyMakeupDate(iso)) +
            '</button>'
          );
        })
        .join('');
    datesEl.querySelectorAll('[data-mk-create-date]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.datePick = btn.getAttribute('data-mk-create-date') || '';
        datesEl.querySelectorAll('[data-mk-create-date]').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('btn--pri', on);
          b.classList.toggle('btn--ghost', !on);
        });
      });
    });
  }

  function openCreateModal() {
    if (typeof cfg.openModal !== 'function') {
      cfg.toast('Add makeup modal unavailable', 'error');
      return;
    }
    state.pick = null;
    cfg.openModal(
      '<div class="modal-h"><h2 id="modalTitle">Add makeup grant (office phone)</h2></div>' +
        '<div class="modal-b" style="min-width:0">' +
        '<p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:break-word">Type the first letters of the name. Then pick an open seat (their instructor, or another instructor at that centre) and the day. The parent Accepts or Declines in the parent portal.</p>' +
        '<label class="muted">Search participant</label>' +
        '<input class="inp" id="ppMakeupCreateSearch" type="search" placeholder="First letters of the name" autocomplete="off" style="max-width:100%;box-sizing:border-box" />' +
        '<div id="ppMakeupCreateHits" hidden style="margin:6px 0"></div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px">Selected</div>' +
        '<div id="ppMakeupCreateSelected" style="font-weight:700;overflow-wrap:break-word;min-width:0">No participant selected</div>' +
        '<label class="muted" style="display:block;margin-top:10px">Centre</label>' +
        '<select class="inp" id="ppMakeupCreateVenue" style="max-width:100%;box-sizing:border-box"></select>' +
        '<div id="ppMakeupCreateSlots" style="margin-top:10px;max-height:320px;overflow:auto;min-width:0"></div>' +
        '<div id="ppMakeupCreateDates" style="min-width:0"></div>' +
        '<p id="ppMakeupCreateErr" class="muted" style="display:none;margin:10px 0 0;color:#b91c1c;font-size:13px;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="modal-f">' +
        '<button type="button" class="btn btn--ghost" id="ppMakeupCreateCancel">Cancel</button>' +
        '<button type="button" class="btn btn--pri" id="ppMakeupCreateSave">Send to parent</button>' +
        '</div>'
    );

    var venueSel = global.document.getElementById('ppMakeupCreateVenue');
    if (venueSel) {
      venueSel.addEventListener('change', function () {
        state.slotPick = null;
        state.datePick = '';
        paintCreateSlots();
      });
    }
    var searchTimer = null;
    var search = global.document.getElementById('ppMakeupCreateSearch');
    if (search) {
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          void searchParticipants(search.value);
        }, 280);
      });
    }
    var cancel = global.document.getElementById('ppMakeupCreateCancel');
    if (cancel) {
      cancel.onclick = function () {
        if (typeof cfg.closeModal === 'function') cfg.closeModal();
      };
    }
    var save = global.document.getElementById('ppMakeupCreateSave');
    if (save) {
      save.onclick = function () {
        var errEl = global.document.getElementById('ppMakeupCreateErr');
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
        if (!state.slotPick) {
          showErr('Pick an open seat.');
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(state.datePick || '')) {
          showErr('Pick the day.');
          return;
        }
        var slot = state.slotPick;
        var serviceLabel = [slot.service || 'Session', slot.venue].filter(Boolean).join(' · ');
        save.disabled = true;
        void api('portal-admin-makeup-grant', {
          action: 'create',
          contact_id: state.pick.contact_id,
          parent_person_id: state.pick.parent_person_id,
          participant_display: state.pick.display_name || '',
          preferred_venue: slot.venue,
          service_label: serviceLabel,
          source: 'admin',
          notes: 'Office phone · parent to accept'
        }).then(function (r) {
          if (r.error || !r.grant || !r.grant.id) {
            save.disabled = false;
            showErr((r && (r.message || r.error)) || 'Save failed');
            return;
          }
          return api('portal-admin-makeup-offer', {
            action: 'create',
            grant_id: r.grant.id,
            venue: slot.venue,
            session_date: state.datePick,
            session_time: timeLabelToOffer(slot.timeLabel),
            instructor_name: slot.instructor,
            service_label: serviceLabel,
            await_parent: true,
            offer_notes: 'Parent to accept'
          }).then(function (o) {
            save.disabled = false;
            if (o.error) {
              showErr(o.message || o.error || 'Offer failed');
              return;
            }
            if (typeof cfg.closeModal === 'function') cfg.closeModal();
            cfg.toast(
              o.parent_notify && o.parent_notify.ok
                ? 'Sent. Parent Accepts or Declines in the portal.'
                : 'Offer saved. Parent notify did not send — they can still Accept in the portal.',
              'ok'
            );
            void renderHost(global.document.getElementById('portalMakeupHost'));
          });
        });
      };
    }
  }

  function bindEmbed() {
    state.filter = 'open';
    var host = global.document.getElementById('portalMakeupHost');
    if (host) void renderHost(host);
    var refresh = global.document.getElementById('portalMakeupRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        void renderHost(global.document.getElementById('portalMakeupHost'));
      });
    }
    var addBtn = global.document.getElementById('portalMakeupAdd');
    if (addBtn && addBtn.getAttribute('data-bound') !== '1') {
      addBtn.setAttribute('data-bound', '1');
      addBtn.addEventListener('click', function () {
        openCreateModal();
      });
    }
    global.document.querySelectorAll('[data-makeup-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-makeup-filter') || 'open';
        global.document.querySelectorAll('[data-makeup-filter]').forEach(function (b) {
          var on = b.getAttribute('data-makeup-filter') === state.filter;
          b.classList.toggle('btn--ghost', !on);
        });
        void renderHost(global.document.getElementById('portalMakeupHost'));
      });
    });
  }

  global.PortalParentMakeups = {
    configure: configure,
    embedHtml: embedHtml,
    bindEmbed: bindEmbed,
    api: api,
    openCreateModal: openCreateModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
