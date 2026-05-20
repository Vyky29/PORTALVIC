# -*- coding: utf-8 -*-
"""Inject Positive / Relevant / Absents / Cancellations hub panels into admin_dashboard.html."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AD = ROOT / "working_ui" / "admin_dashboard.html"
EMB = ROOT / "working_ui" / "portal" / "admin_embed.html"

CSS = r"""
    .c4k-hub-week-host{margin-bottom:14px;min-width:0}
    .c4k-hub-day-strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;min-width:0}
    @media (max-width:900px){
      .c4k-hub-day-strip{grid-template-columns:repeat(7,minmax(72px,1fr));overflow-x:auto;padding-bottom:6px}
    }
    .c4k-hub-day-card{
      min-width:0;border:1px solid var(--line);border-radius:14px;background:var(--surface);
      padding:10px 8px 12px;text-align:center;cursor:pointer;box-sizing:border-box;
      transition:border-color .15s,box-shadow .15s
    }
    .c4k-hub-day-card:hover{border-color:#94a3b8}
    .c4k-hub-day-card.is-selected{border-width:2px;box-shadow:0 0 0 3px rgba(124,58,237,.12)}
    .c4k-hub-day-card__day{font-size:12px;font-weight:700;line-height:1.2;min-width:0;overflow-wrap:break-word}
    .c4k-hub-day-card__date{font-size:11px;color:var(--muted);margin-top:2px}
    .c4k-hub-day-card__rule{height:3px;border-radius:2px;margin:8px 4px 10px;min-width:0}
    .c4k-hub-day-card__count{font-size:28px;font-weight:800;line-height:1;color:#1e3a8a}
    .c4k-hub-day-card__lbl{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--muted);margin-top:4px}
    .c4k-hub-day-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:16px 0 10px;min-width:0}
    .c4k-hub-day-head__title{margin:0;font-size:16px;font-weight:700;color:var(--ink);min-width:0;overflow-wrap:break-word}
    .chip--hub-pos{background:#dcfce7;color:#166534;border:1px solid #86efac}
    .chip--hub-rel{background:#ffedd5;color:#9a3412;border:1px solid #fdba74}
    .chip--hub-abs{background:#ffedd5;color:#9a3412;border:1px solid #fdba74}
    .chip--hub-can{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca}
    .chip--hub-count{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
    .c4k-hub-pax-pill{
      display:inline-block;max-width:100%;padding:6px 14px;border-radius:9999px;
      background:#e0f2fe;border:1px solid #bae6fd;color:#0369a1;font-size:13px;font-weight:700;
      cursor:pointer;border-width:1px;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap
    }
    .tbl.c4k-hub-notes-tbl tbody tr:nth-child(even){background:#fffbeb}
    .tbl.c4k-hub-notes-tbl tbody tr:nth-child(odd){background:#fff}
    .c4k-hub-notes-tbl .c4k-sf-col-note{min-width:0;max-width:100%;text-align:left;vertical-align:top;line-height:1.45;overflow-wrap:break-word}
"""

FN_BLOCK = r"""
    function sessionsHubTabUsesWeekStrip(tab){
      return tab === 'overview' || tab === 'positive' || tab === 'relevant' || tab === 'absents' || tab === 'cancellations';
    }
    function sessionsHubTabShowsRefresh(tab){
      return tab === 'feedback' || tab === 'positive' || tab === 'relevant' || tab === 'absents' || tab === 'cancellations';
    }
    function adminHubFormatInstructorName(raw){
      var s = String(raw || '').trim();
      if(!s) return '—';
      return s.toLowerCase().replace(/\b\w/g, function(c){ return c.toUpperCase(); });
    }
    function adminHubFormatWhenShort(iso, atIso){
      if(atIso){
        try{
          var dt = new Date(atIso);
          if(!Number.isFinite(dt.getTime())) throw 0;
          var d = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
          var t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
          return d + ' ' + t;
        }catch(_e){}
      }
      return bookingFormatDdMmYy(iso) || '—';
    }
    function adminHubPositiveRowsForIso(iso){
      var want = String(iso || '').trim().substring(0, 10);
      return adminC4kDailyRegistersList().filter(function(d){
        var iso10 = adminC4kRegisterRowIso10(d);
        return iso10 === want && adminC4kSfMeaningfulText(d.pos);
      });
    }
    function adminHubRelevantRowsForIso(iso){
      var want = String(iso || '').trim().substring(0, 10);
      return adminC4kDailyRegistersList().filter(function(d){
        var iso10 = adminC4kRegisterRowIso10(d);
        return iso10 === want && adminC4kSfMeaningfulText(d.rel);
      });
    }
    function adminHubAbsentsStatusRowsForIso(iso){
      var want = String(iso || '').trim().substring(0, 10);
      return adminSessionFeedbackStatusRows().filter(function(r){
        return String(r.date || '').trim().substring(0, 10) === want && String(r.overviewStatus || '').trim() === 'absent';
      });
    }
    function adminHubCancellationReportsAll(){
      if(window.__PORTAL_CANCELLATION_REPORTS__) return window.__PORTAL_CANCELLATION_REPORTS__;
      return [];
    }
    function adminHubCancellationsForIso(iso){
      var want = String(iso || '').trim().substring(0, 10);
      var fromDb = adminHubCancellationReportsAll().filter(function(r){
        return String(r.session_date || '').trim().substring(0, 10) === want;
      });
      if(fromDb.length) return fromDb;
      return adminC4kSessionFeedbackOutcomeModelsAll().filter(function(o){
        return String(o.sortIso || '').trim().substring(0, 10) === want && String(o.outcome || '').toUpperCase().indexOf('CANCEL') >= 0;
      }).map(function(o){
        return {
          session_date: o.sortIso,
          submitted_by_name: o.notifyBy,
          client_name: o.pax,
          session_time: o.timeText,
          service: o.service,
          cancellation_timing: '—',
          reason_category: o.outcome,
          created_at: null,
          _fromOutcome: true
        };
      });
    }
    function sessionsHubWeekDayStripHtml(anchorIso, opts){
      opts = opts || {};
      var countMode = String(opts.countMode || 'notes');
      var labelUnit = String(opts.countLabel || 'NOTES');
      var sel = String(opts.selectedIso || '').trim().substring(0, 10);
      var days = bookingWeekIsoRangeMonSun(anchorIso);
      if(!days.length) return '<p class="muted" style="margin:0">Pick a valid date.</p>';
      var cards = [];
      for(var di = 0; di < days.length; di++){
        var dIso = days[di];
        var pal = BOOKING_WEEK_CAP_PALETTE[di] || BOOKING_WEEK_CAP_PALETTE[0];
        var dParse = bookingParseIsoLocal(dIso);
        var dayLong = dParse ? dParse.toLocaleDateString('en-GB', { weekday: 'long' }) : '—';
        var n = 0;
        if(countMode === 'positive') n = adminHubPositiveRowsForIso(dIso).length;
        else if(countMode === 'relevant') n = adminHubRelevantRowsForIso(dIso).length;
        else if(countMode === 'absents') n = adminHubAbsentsStatusRowsForIso(dIso).length;
        else if(countMode === 'cancellations') n = adminHubCancellationsForIso(dIso).length;
        var isSel = dIso === sel;
        cards.push(
          '<div class="c4k-hub-day-card' + (isSel ? ' is-selected' : '') + '" data-booking-week-day="' + esc(dIso) + '" role="button" tabindex="0" style="--cap-soft:' + pal.soft + ';border-color:' + (isSel ? pal.lo : 'var(--line)') + '">' +
            '<div class="c4k-hub-day-card__day" style="color:' + pal.lo + '">' + esc(dayLong) + '</div>' +
            '<div class="c4k-hub-day-card__date">' + esc(bookingFormatDdMmYyyy(dIso)) + '</div>' +
            '<div class="c4k-hub-day-card__rule" style="background:' + pal.lo + '"></div>' +
            '<div class="c4k-hub-day-card__count">' + esc(String(n)) + '</div>' +
            '<div class="c4k-hub-day-card__lbl">' + esc(labelUnit) + '</div>' +
          '</div>'
        );
      }
      return '<div class="c4k-hub-day-strip" role="region" aria-label="Week days">' + cards.join('') + '</div>';
    }
    function adminHubDayTitleHtml(iso, badgeLabel, badgeCls, count){
      var d = bookingParseIsoLocal(String(iso || '') + 'T12:00:00');
      var title = d ? d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '—';
      return (
        '<div class="c4k-hub-day-head">' +
        '<h2 class="c4k-hub-day-head__title">' + esc(title) + '</h2>' +
        '<span class="chip ' + badgeCls + '">' + esc(badgeLabel) + '</span>' +
        '<span class="chip chip--hub-count">' + esc(String(count)) + ' ' + (badgeLabel === 'ABSENTS' ? 'MARKS' : badgeLabel === 'CANCELLATIONS' ? 'REPORTS' : 'NOTES') + '</span>' +
        '</div>'
      );
    }
    function adminHubPosRelRowHtml(d, mode){
      var note = mode === 'positive' ? String(d.pos || '') : String(d.rel || '');
      var cid = resolveAdminClientDrawerIdFromDisplayName(d.pax);
      var paxNm = String(d.pax || '').trim();
      var paxCell = cid
        ? '<button type="button" class="c4k-hub-pax-pill" data-client="' + esc(cid) + '">' + esc(paxNm) + '</button>'
        : '<button type="button" class="c4k-hub-pax-pill" data-pax-name="' + escAttr(paxNm) + '">' + esc(paxNm) + '</button>';
      return (
        '<tr>' +
        '<td style="min-width:0;vertical-align:top">' + paxCell + '</td>' +
        adminC4kRegisterServiceCellHtml(d, { feedbackDateLine: true }) +
        '<td class="muted c4k-sf-col-note">' + esc(note) + '</td>' +
        adminC4kRegisterReviewedByCellHtml(d) +
        '</tr>'
      );
    }
    function adminHubAbsentRowHtml(r, mark){
      var iso = String(r.date || '').trim().substring(0, 10);
      var pax = String(r.client || '').trim();
      var svc = portalDisplayProgrammeFromSheet(r.service) || String(r.service || '—');
      var slot = String(r.timeSlot || '').trim();
      var svcLine = esc(svc) + (slot ? ' · ' + esc(slot) : '');
      var markedBy = mark && mark.staff_name ? mark.staff_name : adminHubFormatInstructorName(r.instructor);
      var when = mark && mark.created_at ? adminHubFormatWhenShort(iso, mark.created_at) : adminHubFormatWhenShort(iso, null);
      var cid = resolveAdminClientDrawerIdFromDisplayName(pax);
      var paxCell = cid
        ? '<button type="button" class="c4k-hub-pax-pill" data-client="' + esc(cid) + '">' + esc(pax) + '</button>'
        : '<button type="button" class="c4k-hub-pax-pill" data-pax-name="' + escAttr(pax) + '">' + esc(pax) + '</button>';
      return (
        '<tr><td style="min-width:0;vertical-align:middle">' + paxCell + '</td>' +
        '<td class="muted" style="min-width:0;overflow-wrap:break-word;vertical-align:middle">' + svcLine + '</td>' +
        '<td style="min-width:0;overflow-wrap:break-word;vertical-align:middle">' + esc(markedBy) + '</td>' +
        '<td class="muted" style="white-space:nowrap;vertical-align:middle">' + esc(when) + '</td></tr>'
      );
    }
    function adminHubCancellationRowHtml(r){
      if(r._fromOutcome){
        return (
          '<tr><td class="muted">' + esc(r.dateDisplay || adminFormatUkDateFromIso(String(r.session_date) + 'T12:00:00')) + '</td>' +
          '<td>' + esc(String(r.submitted_by_name || '—')) + '</td>' +
          '<td><strong>' + esc(String(r.client_name || '—')) + '</strong></td>' +
          '<td class="muted">' + esc(String(r.session_date || '').substring(0, 10)) + '</td>' +
          '<td class="muted">' + esc(String(r.session_time || '—')) + '</td>' +
          '<td>' + esc(String(r.service || '—')) + '</td>' +
          '<td class="muted">—</td><td class="muted">' + esc(String(r.reason_category || '—')) + '</td></tr>'
        );
      }
      var rec = '';
      if(r.created_at){
        try{
          var cdt = new Date(r.created_at);
          rec = cdt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }catch(_c){ rec = String(r.created_at).slice(0, 10); }
      }
      return (
        '<tr><td class="muted">' + esc(rec || '—') + '</td>' +
        '<td>' + esc(String(r.submitted_by_name || '—')) + '</td>' +
        '<td><strong>' + esc(String(r.client_name || '—')) + '</strong></td>' +
        '<td class="muted">' + esc(String(r.session_date || '').substring(0, 10)) + '</td>' +
        '<td class="muted">' + esc(String(r.session_time || '—')) + '</td>' +
        '<td style="min-width:0;overflow-wrap:break-word">' + esc(String(r.service || '—')) + '</td>' +
        '<td class="muted" style="min-width:0;overflow-wrap:break-word">' + esc(String(r.cancellation_timing || '—')) + '</td>' +
        '<td style="min-width:0;overflow-wrap:break-word">' + esc(String(r.reason_category || '—')) + '</td></tr>'
      );
    }
    function adminHubQuickMarksBySessionKey(){
      if(adminHubQuickMarksBySessionKey._m) return adminHubQuickMarksBySessionKey._m;
      var m = {};
      var list = window.__PORTAL_ABSENT_QUICK_MARKS__ || [];
      for(var i = 0; i < list.length; i++){
        var q = list[i];
        var k = String(q.portal_session_key || '').trim();
        if(k) m[k] = q;
      }
      adminHubQuickMarksBySessionKey._m = m;
      return m;
    }
    async function adminFetchCancellationReportsForHub(){
      if(window.__PORTAL_CANCELLATION_REPORTS__) return window.__PORTAL_CANCELLATION_REPORTS__;
      var client = getSchedSupabaseClient();
      if(!client){ window.__PORTAL_CANCELLATION_REPORTS__ = []; return []; }
      try{
        var since = new Date();
        since.setDate(since.getDate() - 120);
        var res = await client
          .from('cancellation_reports')
          .select('id,created_at,session_date,session_time,client_name,service,cancellation_timing,reason_category,submitted_by_name')
          .gte('session_date', since.toISOString().slice(0, 10))
          .order('session_date', { ascending: false })
          .limit(400);
        window.__PORTAL_CANCELLATION_REPORTS__ = res.error ? [] : (res.data || []);
      }catch(_e){
        window.__PORTAL_CANCELLATION_REPORTS__ = [];
      }
      return window.__PORTAL_CANCELLATION_REPORTS__;
    }
    async function adminFetchAbsentQuickMarksForHub(){
      if(window.__PORTAL_ABSENT_QUICK_MARKS__) return window.__PORTAL_ABSENT_QUICK_MARKS__;
      var client = getSchedSupabaseClient();
      if(!client){ window.__PORTAL_ABSENT_QUICK_MARKS__ = []; return []; }
      try{
        var since = new Date();
        since.setDate(since.getDate() - 60);
        var res = await client
          .from('portal_staff_session_quick_marks')
          .select('portal_session_key,session_date,created_at,staff_user_id')
          .eq('mark_type', 'absent')
          .gte('session_date', since.toISOString().slice(0, 10))
          .order('created_at', { ascending: false })
          .limit(500);
        var rows = res.error ? [] : (res.data || []);
        var prof = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
        window.__PORTAL_ABSENT_QUICK_MARKS__ = rows.map(function(r){
          return {
            portal_session_key: r.portal_session_key,
            session_date: r.session_date,
            created_at: r.created_at,
            staff_name: prof && r.staff_user_id === prof.id ? String(prof.full_name || prof.username || '') : ''
          };
        });
      }catch(_e2){
        window.__PORTAL_ABSENT_QUICK_MARKS__ = [];
      }
      return window.__PORTAL_ABSENT_QUICK_MARKS__;
    }
    function refreshSessionsHubPosRelGrid(){
      var h = sessionsHubEnsureState();
      var mode = h.tab === 'positive' ? 'positive' : 'relevant';
      var st = sessionFeedbackEnsureState();
      var iso = String(h.selectedIso || st.selectedIso || h.weekAnchorIso || '').trim().substring(0, 10);
      var stripHost = $('c4kHubNotesWeekInner');
      var tbody = $('c4kHubNotesTbody');
      var titleHost = $('c4kHubNotesDayTitle');
      if(stripHost){
        stripHost.innerHTML = sessionsHubWeekDayStripHtml(h.weekAnchorIso, {
          countMode: mode,
          countLabel: 'NOTES',
          selectedIso: iso
        });
      }
      var rows = mode === 'positive' ? adminHubPositiveRowsForIso(iso) : adminHubRelevantRowsForIso(iso);
      var q = String(h.clientQ || st.clientQ || '').trim().toLowerCase();
      if(q){
        rows = rows.filter(function(d){ return String(d.pax || '').toLowerCase().indexOf(q) >= 0; });
      }
      if(titleHost){
        titleHost.innerHTML = adminHubDayTitleHtml(
          iso,
          mode === 'positive' ? 'POSITIVE' : 'RELEVANT',
          mode === 'positive' ? 'chip--hub-pos' : 'chip--hub-rel',
          rows.length
        );
      }
      var colLabel = mode === 'positive' ? 'Positive (opt.)' : 'Relevant (opt.)';
      if(tbody){
        tbody.innerHTML = rows.length
          ? rows.map(function(d){ return adminHubPosRelRowHtml(d, mode); }).join('')
          : '<tr><td colspan="4" class="muted">No ' + (mode === 'positive' ? 'positive' : 'relevant') + ' notes for this day' + (q ? ' matching search' : '') + '.</td></tr>';
      }
      bindSessionFeedbackTbodyClicks();
      sessionsHubStampRefresh();
    }
    function refreshSessionsHubAbsentsGrid(){
      var h = sessionsHubEnsureState();
      var st = sessionFeedbackEnsureState();
      var iso = String(h.selectedIso || st.selectedIso || h.weekAnchorIso || '').trim().substring(0, 10);
      var stripHost = $('c4kHubAbsWeekInner');
      var tbody = $('c4kHubAbsTbody');
      var titleHost = $('c4kHubAbsDayTitle');
      if(stripHost){
        stripHost.innerHTML = sessionsHubWeekDayStripHtml(h.weekAnchorIso, {
          countMode: 'absents',
          countLabel: 'ABSENTS',
          selectedIso: iso
        });
      }
      var statusRows = adminHubAbsentsStatusRowsForIso(iso);
      var marks = adminHubQuickMarksBySessionKey();
      var q = String(h.clientQ || st.clientQ || '').trim().toLowerCase();
      if(q){
        statusRows = statusRows.filter(function(r){ return String(r.client || '').toLowerCase().indexOf(q) >= 0; });
      }
      if(titleHost) titleHost.innerHTML = adminHubDayTitleHtml(iso, 'ABSENTS', 'chip--hub-abs', statusRows.length);
      if(tbody){
        tbody.innerHTML = statusRows.length
          ? statusRows.map(function(r){
              var sk = String(r.sessionKey || '').trim();
              return adminHubAbsentRowHtml(r, sk ? marks[sk] : null);
            }).join('')
          : '<tr><td colspan="4" class="muted">No absent marks for this day' + (q ? ' matching search' : '') + '.</td></tr>';
      }
      bindSessionFeedbackTbodyClicks();
      sessionsHubStampRefresh();
    }
    function refreshSessionsHubCancellationsGrid(){
      var h = sessionsHubEnsureState();
      var st = sessionFeedbackEnsureState();
      var iso = String(h.selectedIso || st.selectedIso || h.weekAnchorIso || '').trim().substring(0, 10);
      var stripHost = $('c4kHubCanWeekInner');
      var tbody = $('c4kHubCanTbody');
      var titleHost = $('c4kHubCanDayTitle');
      if(stripHost){
        stripHost.innerHTML = sessionsHubWeekDayStripHtml(h.weekAnchorIso, {
          countMode: 'cancellations',
          countLabel: 'CANCELLATIONS',
          selectedIso: iso
        });
      }
      var rows = adminHubCancellationsForIso(iso);
      var q = String(h.clientQ || st.clientQ || '').trim().toLowerCase();
      if(q){
        rows = rows.filter(function(r){
          var nm = String(r.client_name || r.pax || '').toLowerCase();
          return nm.indexOf(q) >= 0;
        });
      }
      if(titleHost) titleHost.innerHTML = adminHubDayTitleHtml(iso, 'CANCELLATIONS', 'chip--hub-can', rows.length);
      if(tbody){
        tbody.innerHTML = rows.length
          ? rows.map(adminHubCancellationRowHtml).join('')
          : '<tr><td colspan="8" class="muted">No cancellation reports for this day' + (q ? ' matching search' : '') + '.</td></tr>';
      }
      sessionsHubStampRefresh();
    }
    function c4kHubPosRelPanelInnerHtml(){
      return (
        '<div class="c4k-hub-week-host"><div id="c4kHubNotesWeekInner"></div></div>' +
        '<div class="c4k-sess-overview-pax-filter">' +
        '<label class="c4k-sess-overview-pax-filter__lbl" for="c4kHubNotesClientFilter">Search client</label>' +
        '<input type="search" class="inp" id="c4kHubNotesClientFilter" placeholder="Name contains..." autocomplete="off" />' +
        '</div>' +
        '<div id="c4kHubNotesDayTitle"></div>' +
        '<div class="card"><div class="card-pad" style="overflow:auto;padding:0;min-width:0">' +
        '<table class="tbl tbl--center c4k-hub-notes-tbl"><thead><tr>' +
        '<th scope="col">Participant</th>' +
        '<th scope="col">Service</th>' +
        '<th scope="col" id="c4kHubNotesColLabel">Note</th>' +
        '<th scope="col">Reviewed by</th>' +
        '</tr></thead><tbody id="c4kHubNotesTbody"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>'
      );
    }
    function c4kHubAbsentsPanelInnerHtml(){
      return (
        '<div class="c4k-hub-week-host"><div id="c4kHubAbsWeekInner"></div></div>' +
        '<div class="c4k-sess-overview-pax-filter">' +
        '<label class="c4k-sess-overview-pax-filter__lbl" for="c4kHubAbsClientFilter">Search client</label>' +
        '<input type="search" class="inp" id="c4kHubAbsClientFilter" placeholder="Name contains..." autocomplete="off" />' +
        '</div>' +
        '<div id="c4kHubAbsDayTitle"></div>' +
        '<div class="card"><div class="card-pad" style="overflow:auto;padding:0;min-width:0">' +
        '<table class="tbl tbl--center"><thead><tr>' +
        '<th scope="col">Participant</th>' +
        '<th scope="col">Service / session</th>' +
        '<th scope="col">Marked by</th>' +
        '<th scope="col">When</th>' +
        '</tr></thead><tbody id="c4kHubAbsTbody"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>'
      );
    }
    function c4kHubCancellationsPanelInnerHtml(){
      return (
        '<div class="c4k-hub-week-host"><div id="c4kHubCanWeekInner"></div></div>' +
        '<div class="c4k-sess-overview-pax-filter">' +
        '<label class="c4k-sess-overview-pax-filter__lbl" for="c4kHubCanClientFilter">Search client</label>' +
        '<input type="search" class="inp" id="c4kHubCanClientFilter" placeholder="Name contains..." autocomplete="off" />' +
        '</div>' +
        '<div id="c4kHubCanDayTitle"></div>' +
        '<div class="card"><div class="card-pad" style="overflow:auto;padding:0;min-width:0">' +
        '<table class="tbl tbl--center"><thead><tr>' +
        '<th scope="col">Recorded</th><th scope="col">Submitted by</th><th scope="col">Client</th>' +
        '<th scope="col">Session date</th><th scope="col">Session time</th><th scope="col">Service</th>' +
        '<th scope="col">Timing</th><th scope="col">Reason</th>' +
        '</tr></thead><tbody id="c4kHubCanTbody"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table></div></div>' +
        '<h2 class="c4k-hub-fb-title" style="margin-top:18px">Cancellations log</h2>'
      );
    }

"""

OLD_TABS = """    var C4K_SESSIONS_HUB_TABS = [
      { id:'overview', label:'Overview', mode:'panel' },
      { id:'feedback', label:'Feedback', mode:'panel' },
      { id:'positive', label:'Positive', mode:'sfSection', section:'positive' },
      { id:'relevant', label:'Relevant', mode:'sfSection', section:'relevant' },
      { id:'incidents', label:'Incidents', mode:'sfSection', section:'incidents' },
      { id:'cancellations', label:'Cancellations', mode:'view', view:'scheduling' },
      { id:'absents', label:'Absents', mode:'view', view:'absents_refunds' },
      { id:'lead', label:'Lead report', mode:'view', view:'c4k_reviews' },
      { id:'dashboard', label:'Dashboard', mode:'view', view:'dashboard', dash:true }
    ];"""

NEW_TABS = """    var C4K_SESSIONS_HUB_TABS = [
      { id:'overview', label:'Overview', mode:'panel' },
      { id:'feedback', label:'Feedback', mode:'panel' },
      { id:'positive', label:'Positive', mode:'hubNotes', notesMode:'positive' },
      { id:'relevant', label:'Relevant', mode:'hubNotes', notesMode:'relevant' },
      { id:'incidents', label:'Incidents', mode:'sfSection', section:'incidents' },
      { id:'cancellations', label:'Cancellations', mode:'hubCancellations' },
      { id:'absents', label:'Absents', mode:'hubAbsents' },
      { id:'lead', label:'Lead report', mode:'view', view:'c4k_reviews' },
      { id:'dashboard', label:'Dashboard', mode:'view', view:'dashboard', dash:true }
    ];"""

OLD_IS_FB = """    function sessionsHubIsFeedbackTab(tab){
      return tab === 'feedback' || ['positive','relevant','incidents'].indexOf(tab) >= 0;
    }"""

NEW_IS_FB = """    function sessionsHubIsFeedbackTab(tab){
      return tab === 'feedback' || ['positive','relevant','incidents'].indexOf(tab) >= 0;
    }
    function sessionsHubIsNotesTab(tab){
      return tab === 'positive' || tab === 'relevant';
    }"""

OLD_HEAD = """    function sessionsHubHeadHtml(tab){
      if(sessionsHubIsFeedbackTab(tab)){
        return (
          '<div class="c4k-sessions-hub__head">' +
          '<div class="c4k-sessions-hub__title-row">' +
          '<span class="c4k-sessions-hub__ico" aria-hidden="true">📋</span>' +
          '<div style="min-width:0">' +
          '<h1 class="c4k-sessions-hub__title">SESSION FEEDBACKS</h1>' +
          '<p class="c4k-sessions-hub__sub">All instructor session feedback, ratings, and notes.</p>' +
          '</div></div></div>'
        );
      }
      return (
        '<div class="c4k-sessions-hub__head">' +
        '<h1 class="c4k-sessions-hub__title">SESSIONS OVERVIEW</h1>' +
        '<p class="c4k-sessions-hub__sub">Weekly roster, session status, and feedback by day.</p>' +
        '</div>'
      );
    }"""

NEW_HEAD = """    function sessionsHubHeadHtml(tab){
      if(tab === 'feedback'){
        return (
          '<div class="c4k-sessions-hub__head">' +
          '<div class="c4k-sessions-hub__title-row">' +
          '<span class="c4k-sessions-hub__ico" aria-hidden="true">📋</span>' +
          '<div style="min-width:0">' +
          '<h1 class="c4k-sessions-hub__title">SESSION FEEDBACKS</h1>' +
          '<p class="c4k-sessions-hub__sub">All instructor session feedback, ratings, and notes.</p>' +
          '</div></div></div>'
        );
      }
      if(tab === 'positive'){
        return (
          '<div class="c4k-sessions-hub__head">' +
          '<div class="c4k-sessions-hub__title-row">' +
          '<span class="c4k-sessions-hub__ico" aria-hidden="true">⭐</span>' +
          '<div style="min-width:0">' +
          '<h1 class="c4k-sessions-hub__title">POSITIVE FEEDBACK</h1>' +
          '<p class="c4k-sessions-hub__sub">Highlights and strengths recorded for attended sessions.</p>' +
          '</div></div></div>'
        );
      }
      if(tab === 'relevant'){
        return (
          '<div class="c4k-sessions-hub__head">' +
          '<div class="c4k-sessions-hub__title-row">' +
          '<span class="c4k-sessions-hub__ico" aria-hidden="true">👁</span>' +
          '<div style="min-width:0">' +
          '<h1 class="c4k-sessions-hub__title">RELEVANT INFORMATION</h1>' +
          '<p class="c4k-sessions-hub__sub">Important context and relevant notes to review.</p>' +
          '</div></div></div>'
        );
      }
      if(tab === 'absents'){
        return (
          '<div class="c4k-sessions-hub__head">' +
          '<div class="c4k-sessions-hub__title-row">' +
          '<span class="c4k-sessions-hub__ico" aria-hidden="true">🚫</span>' +
          '<div style="min-width:0">' +
          '<h1 class="c4k-sessions-hub__title">ABSENTS</h1>' +
          '<p class="c4k-sessions-hub__sub">Clients marked absent by staff for the selected day.</p>' +
          '</div></div></div>'
        );
      }
      if(tab === 'cancellations'){
        return (
          '<div class="c4k-sessions-hub__head">' +
          '<div class="c4k-sessions-hub__title-row">' +
          '<span class="c4k-sessions-hub__ico" aria-hidden="true">✕</span>' +
          '<div style="min-width:0">' +
          '<h1 class="c4k-sessions-hub__title">CANCELLATIONS</h1>' +
          '<p class="c4k-sessions-hub__sub">Cancellation reports by session week and day.</p>' +
          '</div></div></div>'
        );
      }
      return (
        '<div class="c4k-sessions-hub__head">' +
        '<h1 class="c4k-sessions-hub__title">SESSIONS OVERVIEW</h1>' +
        '<p class="c4k-sessions-hub__sub">Weekly roster, session status, and feedback by day.</p>' +
        '</div>'
      );
    }"""

OLD_TOOLBAR_HIDDEN = """        (sessionsHubIsFeedbackTab(tab) ? '' : ' hidden') +"""

NEW_TOOLBAR_HIDDEN = """        (sessionsHubTabShowsRefresh(tab) ? '' : ' hidden') +"""

OLD_REFRESH = """      if((h.tab === 'feedback' || ['positive','relevant','incidents'].indexOf(h.tab) >= 0) && !h.selectedIso){"""

NEW_REFRESH = """      if((h.tab === 'feedback' || sessionsHubIsNotesTab(h.tab) || h.tab === 'absents' || h.tab === 'cancellations' || h.tab === 'incidents') && !h.selectedIso){"""

OLD_PANELS = """      var ov = $('c4kHubPanelOverview');
      var fb = $('c4kHubPanelFeedback');
      var showOv = h.tab === 'overview' && h.sfSection === 'main';
      var showFb = h.tab === 'feedback' || ['positive','relevant','incidents'].indexOf(h.tab) >= 0;
      if(ov) ov.hidden = !showOv;
      if(fb) fb.hidden = !showFb;
      document.querySelectorAll('[data-sessions-hub-tab]').forEach(function(btn){
        var id = btn.getAttribute('data-sessions-hub-tab');
        var on = (h.sfSection !== 'main' && ['positive','relevant','incidents'].indexOf(id) >= 0 && h.sfSection === id) ||
          (h.sfSection === 'main' && id === h.tab);
        btn.classList.toggle('is-active', !!on);
      });
      var wr = $('c4kHubWeekRange');
      if(wr) wr.textContent = sessionsHubWeekRangeLabel(h.weekAnchorIso);
      var fbr = $('c4kHubFbWeekRange');
      if(fbr) fbr.textContent = sessionsHubWeekRangeLabel(h.weekAnchorIso);
      var wn = $('c4kHubWeekNavWrap');
      if(wn) wn.hidden = h.tab !== 'overview';
      var head = document.querySelector('.c4k-sessions-hub__head');
      if(head) head.outerHTML = sessionsHubHeadHtml(h.tab);
      var hubActs = $('c4kHubToolbarActions');
      if(hubActs) hubActs.hidden = !sessionsHubIsFeedbackTab(h.tab);
      if(h.tab === 'overview' && h.sfSection === 'main'){
        var cap = $('c4kSessionOverviewCapacity');
        if(cap) cap.innerHTML = bookingWeekSessionsHubHtml(h.weekAnchorIso, { selectedIso: h.selectedIso || h.weekAnchorIso });
        void refreshSessionOverviewTable(h.selectedIso || h.weekAnchorIso);
      }else{
        void refreshSessionFeedbackGrid();
      }"""

NEW_PANELS = """      var ov = $('c4kHubPanelOverview');
      var fb = $('c4kHubPanelFeedback');
      var notes = $('c4kHubPanelNotes');
      var abs = $('c4kHubPanelAbsents');
      var can = $('c4kHubPanelCancellations');
      var showOv = h.tab === 'overview';
      var showFb = h.tab === 'feedback' || h.tab === 'incidents';
      var showNotes = sessionsHubIsNotesTab(h.tab);
      var showAbs = h.tab === 'absents';
      var showCan = h.tab === 'cancellations';
      if(ov) ov.hidden = !showOv;
      if(fb) fb.hidden = !showFb;
      if(notes) notes.hidden = !showNotes;
      if(abs) abs.hidden = !showAbs;
      if(can) can.hidden = !showCan;
      document.querySelectorAll('[data-sessions-hub-tab]').forEach(function(btn){
        btn.classList.toggle('is-active', btn.getAttribute('data-sessions-hub-tab') === h.tab);
      });
      var wr = $('c4kHubWeekRange');
      if(wr) wr.textContent = sessionsHubWeekRangeLabel(h.weekAnchorIso);
      var fbr = $('c4kHubFbWeekRange');
      if(fbr) fbr.textContent = sessionsHubWeekRangeLabel(h.weekAnchorIso);
      var wn = $('c4kHubWeekNavWrap');
      if(wn) wn.hidden = !sessionsHubTabUsesWeekStrip(h.tab);
      var head = document.querySelector('.c4k-sessions-hub__head');
      if(head) head.outerHTML = sessionsHubHeadHtml(h.tab);
      var hubActs = $('c4kHubToolbarActions');
      if(hubActs) hubActs.hidden = !sessionsHubTabShowsRefresh(h.tab);
      var colLbl = $('c4kHubNotesColLabel');
      if(colLbl) colLbl.textContent = h.tab === 'positive' ? 'Positive (opt.)' : 'Relevant (opt.)';
      if(h.tab === 'overview'){
        var cap = $('c4kSessionOverviewCapacity');
        if(cap) cap.innerHTML = bookingWeekSessionsHubHtml(h.weekAnchorIso, { selectedIso: h.selectedIso || h.weekAnchorIso });
        void refreshSessionOverviewTable(h.selectedIso || h.weekAnchorIso);
      }else if(showNotes){
        refreshSessionsHubPosRelGrid();
      }else if(showAbs){
        void adminFetchAbsentQuickMarksForHub().then(function(){ refreshSessionsHubAbsentsGrid(); });
      }else if(showCan){
        void adminFetchCancellationReportsForHub().then(function(){ refreshSessionsHubCancellationsGrid(); });
      }else{
        void refreshSessionFeedbackGrid();
      }"""

OLD_BIND_TAB = """          if(tab.mode === 'sfSection'){
            h.tab = id;
            h.sfSection = tab.section;
            sessionsHubRefreshActiveTab();
            return;
          }
          h.tab = id;
          h.sfSection = 'main';
          sessionsHubRefreshActiveTab();"""

NEW_BIND_TAB = """          if(tab.mode === 'hubNotes' || tab.mode === 'hubAbsents' || tab.mode === 'hubCancellations'){
            h.tab = id;
            h.sfSection = 'main';
            sessionsHubRefreshActiveTab();
            return;
          }
          if(tab.mode === 'sfSection'){
            h.tab = id;
            h.sfSection = tab.section;
            sessionsHubRefreshActiveTab();
            return;
          }
          h.tab = id;
          h.sfSection = 'main';
          sessionsHubRefreshActiveTab();"""

OLD_HUB_REF = """      var hubRef = $('c4kHubRefresh');
      if(hubRef){
        hubRef.onclick = function(){
          void refreshSessionFeedbackGrid();
          sessionsHubStampRefresh();
        };
      }"""

NEW_HUB_REF = """      var hubRef = $('c4kHubRefresh');
      if(hubRef){
        hubRef.onclick = function(){
          var ht = h.tab;
          if(ht === 'positive' || ht === 'relevant') refreshSessionsHubPosRelGrid();
          else if(ht === 'absents') void adminFetchAbsentQuickMarksForHub().then(function(){ refreshSessionsHubAbsentsGrid(); });
          else if(ht === 'cancellations') void adminFetchCancellationReportsForHub().then(function(){ refreshSessionsHubCancellationsGrid(); });
          else void refreshSessionFeedbackGrid();
          sessionsHubStampRefresh();
        };
      }
      function bindHubClientFilter(inpId){
        var inp = $(inpId);
        if(!inp) return;
        inp.value = h.clientQ || '';
        inp.oninput = function(){
          h.clientQ = inp.value || '';
          sessionFeedbackEnsureState().clientQ = h.clientQ;
          if(h.tab === 'positive' || h.tab === 'relevant') refreshSessionsHubPosRelGrid();
          else if(h.tab === 'absents') refreshSessionsHubAbsentsGrid();
          else if(h.tab === 'cancellations') refreshSessionsHubCancellationsGrid();
        };
      }
      bindHubClientFilter('c4kHubNotesClientFilter');
      bindHubClientFilter('c4kHubAbsClientFilter');
      bindHubClientFilter('c4kHubCanClientFilter');
      ['c4kHubNotesWeekInner','c4kHubAbsWeekInner','c4kHubCanWeekInner'].forEach(function(wid){
        var wh = $(wid);
        if(!wh) return;
        wh.onclick = onWeekDayPick;
        wh.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' ') onWeekDayPick(e); };
      });"""

OLD_VIEW_END = """        '<div id="c4kHubPanelFeedback" class="c4k-sessions-hub-panel" hidden>' + c4kSessionFeedbackPanelInnerHtml() + '</div>' +
        '</div>'
      );
    }"""

NEW_VIEW_END = """        '<div id="c4kHubPanelFeedback" class="c4k-sessions-hub-panel" hidden>' + c4kSessionFeedbackPanelInnerHtml() + '</div>' +
        '<div id="c4kHubPanelNotes" class="c4k-sessions-hub-panel" hidden>' + c4kHubPosRelPanelInnerHtml() + '</div>' +
        '<div id="c4kHubPanelAbsents" class="c4k-sessions-hub-panel" hidden>' + c4kHubAbsentsPanelInnerHtml() + '</div>' +
        '<div id="c4kHubPanelCancellations" class="c4k-sessions-hub-panel" hidden>' + c4kHubCancellationsPanelInnerHtml() + '</div>' +
        '</div>'
      );
    }"""

OLD_WEEK_NAV_VIEW = """        '<div id="c4kHubWeekNavWrap"' + (h.tab === 'overview' ? '' : ' hidden') + '>' + sessionsHubWeekNavHtml(h.weekAnchorIso) + '</div>' +"""

NEW_WEEK_NAV_VIEW = """        '<div id="c4kHubWeekNavWrap"' + (sessionsHubTabUsesWeekStrip(h.tab) ? '' : ' hidden') + '>' + sessionsHubWeekNavHtml(h.weekAnchorIso) + '</div>' +"""

OLD_GRID_SEC = """      if(sec === 'positive' || sec === 'relevant'){
        if(mainCard) mainCard.hidden = false;
        if(outCard) outCard.hidden = true;
        if(incCard) incCard.hidden = true;
      }else if(sec === 'incidents'){"""

NEW_GRID_SEC = """      if(sec === 'incidents'){"""

SUPABASE_INIT = """
      if(!window.__portalHubDataPrefetchBound){
        window.__portalHubDataPrefetchBound = true;
        window.addEventListener('portal:supabase-ready', function(){
          void adminFetchCancellationReportsForHub();
          void adminFetchAbsentQuickMarksForHub();
        });
      }
"""


def patch_file(path: Path):
    text = path.read_text(encoding="utf-8")
    if "function sessionsHubTabUsesWeekStrip" in text:
        print(path.name, "already patched")
        return
    anchor_css = ".c4k-sessions-hub-tab--dash.is-active{background:linear-gradient(180deg,#ea580c 0%,#c2410c 100%);border-color:#9a3412;color:#fff}"
    if anchor_css not in text:
        raise SystemExit("CSS anchor missing in " + str(path))
    text = text.replace(anchor_css, anchor_css + CSS, 1)
    text = text.replace(OLD_TABS, NEW_TABS, 1)
    text = text.replace(
        "    function sessionsHubTabsHtml(activeTab){",
        FN_BLOCK + "    function sessionsHubTabsHtml(activeTab){",
        1,
    )
    text = text.replace(OLD_IS_FB, NEW_IS_FB, 1)
    text = text.replace(OLD_HEAD, NEW_HEAD, 1)
    text = text.replace(OLD_TOOLBAR_HIDDEN, NEW_TOOLBAR_HIDDEN, 1)
    text = text.replace(OLD_REFRESH, NEW_REFRESH, 1)
    text = text.replace(OLD_PANELS, NEW_PANELS, 1)
    text = text.replace(OLD_BIND_TAB, NEW_BIND_TAB, 1)
    text = text.replace(OLD_HUB_REF, NEW_HUB_REF, 1)
    text = text.replace(OLD_WEEK_NAV_VIEW, NEW_WEEK_NAV_VIEW, 1)
    text = text.replace(OLD_VIEW_END, NEW_VIEW_END, 1)
    text = text.replace(OLD_GRID_SEC, NEW_GRID_SEC, 1)
    if "__portalHubDataPrefetchBound" not in text:
        text = text.replace(
            "      sessionsHubStampRefresh();\n    }\n\n\n    function viewC4kSessions(){",
            "      sessionsHubStampRefresh();\n    }" + SUPABASE_INIT + "\n\n\n    function viewC4kSessions(){",
            1,
        )
    path.write_text(text, encoding="utf-8", newline="\n")
    print("patched", path)


def main():
    patch_file(AD)
    patch_file(EMB)


if __name__ == "__main__":
    main()
