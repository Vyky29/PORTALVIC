# -*- coding: utf-8 -*-
"""One-off patch: Sessions Overview hub UI. Run: python database/_patch_sessions_hub.py"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_TARGETS = [
    ROOT / "working_ui" / "admin_dashboard.html",
    ROOT / "working_ui" / "portal" / "admin_embed.html",
]

CSS_BLOCK = """
    /* Sessions Overview hub (portal-import-bundle week + Day ops tabs) */
    .c4k-sessions-hub{min-width:0}
    .c4k-sessions-hub__head{margin-bottom:12px;min-width:0}
    .c4k-sessions-hub__title{margin:0;font-size:22px;font-weight:800;color:#1e3a5f;letter-spacing:.02em}
    .c4k-sessions-hub__sub{margin:6px 0 0;font-size:13px;color:var(--muted);max-width:40rem;overflow-wrap:break-word}
    .c4k-sessions-hub-tabs{
      display:flex;flex-wrap:wrap;gap:8px;align-items:center;
      margin:14px 0 12px;min-width:0
    }
    .c4k-sessions-hub-tab{
      display:inline-flex;align-items:center;gap:6px;
      padding:8px 14px;border-radius:9999px;border:1px solid var(--line);
      background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:600;
      cursor:pointer;min-width:0;max-width:100%
    }
    .c4k-sessions-hub-tab:hover{border-color:#94a3b8;background:#f8fafc}
    .c4k-sessions-hub-tab.is-active{
      background:linear-gradient(180deg,#1e40af 0%,#1d4ed8 100%);
      border-color:#1e3a8a;color:#fff;box-shadow:0 2px 8px rgba(30,64,175,.25)
    }
    .c4k-sessions-hub-tab--dash{background:linear-gradient(180deg,#fff7ed 0%,#ffedd5 100%);border-color:#fdba74}
    .c4k-sessions-hub-tab--dash.is-active{background:linear-gradient(180deg,#ea580c 0%,#c2410c 100%);border-color:#9a3412;color:#fff}
    .c4k-hub-weekbar{
      display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;
      margin-bottom:14px;border:1px solid var(--line);border-radius:var(--radiusLg);
      background:var(--surface);box-shadow:var(--shadow)
    }
    .c4k-hub-weekbar__lbl{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--muted)}
    .c4k-hub-weekbar__range{display:block;font-size:14px;font-weight:700;color:var(--ink);margin-top:2px}
    .c4k-hub-weekbar__btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .c4k-hub-sess-strip{
      display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;
      min-width:0;margin-bottom:14px
    }
    @media (max-width:900px){
      .c4k-hub-sess-strip{grid-template-columns:repeat(7,minmax(72px,1fr));overflow-x:auto;padding-bottom:6px}
    }
    .c4k-hub-sess-card{
      min-width:0;border:1px solid var(--line);border-radius:14px;background:var(--surface);
      padding:10px 8px 12px;text-align:center;cursor:pointer;box-sizing:border-box;
      transition:border-color .15s,box-shadow .15s
    }
    .c4k-hub-sess-card:hover{border-color:#94a3b8}
    .c4k-hub-sess-card.is-selected{
      border-width:2px;box-shadow:0 0 0 3px var(--cap-soft, rgba(2,132,199,.15))
    }
    .c4k-hub-sess-card__day{font-size:12px;font-weight:700;line-height:1.2;min-width:0;overflow-wrap:break-word}
    .c4k-hub-sess-card__date{font-size:11px;color:var(--muted);margin-top:2px}
    .c4k-hub-sess-card__rule{height:3px;border-radius:2px;margin:8px 4px 10px;min-width:0}
    .c4k-hub-sess-card__count{font-size:28px;font-weight:800;line-height:1;color:#1e3a8a}
    .c4k-hub-sess-card__lbl{font-size:10px;font-weight:700;letter-spacing:.12em;color:var(--muted);margin-top:4px}
    .c4k-hub-fb-title{margin:0 0 10px;font-size:15px;font-weight:700;color:var(--ink)}
    .c4k-sessions-hub-panel[hidden]{display:none!important}
"""

JS_BLOCK = r"""
    var C4K_SESSIONS_HUB_TABS = [
      { id:'overview', label:'Overview', mode:'panel' },
      { id:'feedback', label:'Feedback', mode:'panel' },
      { id:'positive', label:'Positive', mode:'sfSection', section:'positive' },
      { id:'relevant', label:'Relevant', mode:'sfSection', section:'relevant' },
      { id:'incidents', label:'Incidents', mode:'sfSection', section:'incidents' },
      { id:'cancellations', label:'Cancellations', mode:'view', view:'scheduling' },
      { id:'absents', label:'Absents', mode:'view', view:'absents_refunds' },
      { id:'lead', label:'Lead report', mode:'view', view:'c4k_reviews' },
      { id:'dashboard', label:'Dashboard', mode:'view', view:'dashboard', dash:true }
    ];
    function sessionsHubEnsureState(){
      state.sessionsHub = state.sessionsHub || {};
      var h = state.sessionsHub;
      if(!h.weekAnchorIso) h.weekAnchorIso = isoDateLocal(new Date());
      if(h.selectedIso === undefined) h.selectedIso = null;
      if(!h.tab) h.tab = 'overview';
      if(h.clientQ === undefined) h.clientQ = '';
      if(h.instructorQ === undefined) h.instructorQ = '';
      if(!h.sfSection) h.sfSection = 'main';
      state.sessionOverview = state.sessionOverview || {};
      if(!state.sessionOverview.iso) state.sessionOverview.iso = h.selectedIso || h.weekAnchorIso;
      var st = sessionFeedbackEnsureState();
      st.anchorIso = h.weekAnchorIso;
      st.clientQ = h.clientQ;
      if(h.tab === 'feedback' || h.sfSection !== 'main') st.selectedIso = h.selectedIso;
      return h;
    }
    function sessionsHubWeekRangeLabel(anchorIso){
      var days = bookingWeekIsoRangeMonSun(anchorIso);
      if(!days.length) return '—';
      return bookingFormatDdMmYyyy(days[0]) + ' – ' + bookingFormatDdMmYyyy(days[6]);
    }
    function sessionsHubShiftWeek(deltaWeeks){
      var h = sessionsHubEnsureState();
      var d = bookingParseIsoLocal(h.weekAnchorIso || isoDateLocal(new Date()));
      if(!d) return;
      d.setDate(d.getDate() + deltaWeeks * 7);
      h.weekAnchorIso = isoDateLocal(d);
      h.selectedIso = null;
      state.sessionOverview.iso = h.weekAnchorIso;
      sessionsHubRefreshActiveTab();
    }
    function bookingSessionsCountForIso(iso){
      var want = String(iso || '').trim().substring(0, 10);
      var statusDay = adminSessionFeedbackStatusByDate()[want];
      if(statusDay && statusDay.length) return statusDay.length;
      return bookingRosterStatsForIsoCalendarDay(iso).booked || bookingRosterStatsForIsoCalendarDay(iso).total;
    }
    function bookingWeekSessionsHubHtml(anchorIso, opts){
      opts = opts || {};
      if(!adminSpreadsheetAdapterAvailable() && !adminSessionFeedbackStatusRows().length){
        return '<div class="card-pad"><p class="muted" style="margin:0">Roster not loaded.</p></div>';
      }
      var days = bookingWeekIsoRangeMonSun(anchorIso);
      if(!days.length) return '<div class="card-pad"><p class="muted" style="margin:0">Pick a valid date.</p></div>';
      var sel = String(opts.selectedIso || anchorIso || '').trim().substring(0, 10);
      var cards = [];
      for(var di = 0; di < days.length; di++){
        var dIso = days[di];
        var pal = BOOKING_WEEK_CAP_PALETTE[di] || BOOKING_WEEK_CAP_PALETTE[0];
        var dParse = bookingParseIsoLocal(dIso);
        var dayLong = dParse ? dParse.toLocaleDateString('en-GB', { weekday: 'long' }) : '—';
        var n = bookingSessionsCountForIso(dIso);
        var isSel = dIso === sel;
        cards.push(
          '<div class="c4k-hub-sess-card' + (isSel ? ' is-selected' : '') + '" data-booking-week-day="' + esc(dIso) + '" role="button" tabindex="0" title="' + esc(String(n) + ' sessions') + '" style="--cap-soft:' + pal.soft + ';--cap-border:' + pal.border + ';border-color:' + (isSel ? pal.lo : 'var(--line)') + '">' +
            '<div class="c4k-hub-sess-card__day" style="color:' + pal.lo + '">' + esc(dayLong) + '</div>' +
            '<div class="c4k-hub-sess-card__date">' + esc(bookingFormatDdMmYyyy(dIso)) + '</div>' +
            '<div class="c4k-hub-sess-card__rule" style="background:' + pal.lo + '"></div>' +
            '<div class="c4k-hub-sess-card__count">' + esc(String(n)) + '</div>' +
            '<div class="c4k-hub-sess-card__lbl">SESSIONS</div>' +
          '</div>'
        );
      }
      return '<div class="c4k-hub-sess-strip" role="region" aria-label="Sessions per day">' + cards.join('') + '</div>';
    }
    function sessionsHubWeekNavHtml(anchorIso){
      return (
        '<div class="c4k-hub-weekbar card-pad">' +
          '<div class="c4k-hub-weekbar__left">' +
            '<span class="c4k-hub-weekbar__lbl">WEEK (MON–SUN)</span>' +
            '<span class="c4k-hub-weekbar__range" id="c4kHubWeekRange">' + esc(sessionsHubWeekRangeLabel(anchorIso)) + '</span>' +
          '</div>' +
          '<div class="c4k-hub-weekbar__btns">' +
            '<button type="button" class="btn btn--ghost btn--sm" id="c4kHubWeekPrev">← Prev week</button>' +
            '<button type="button" class="btn btn--sec btn--sm" id="c4kHubWeekThis">This week</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" id="c4kHubWeekNext">Next week →</button>' +
          '</div>' +
        '</div>'
      );
    }
    function sessionsHubTabsHtml(activeTab){
      return C4K_SESSIONS_HUB_TABS.map(function(t){
        var on = t.id === activeTab;
        var cls = 'c4k-sessions-hub-tab' + (on ? ' is-active' : '') + (t.dash ? ' c4k-sessions-hub-tab--dash' : '');
        return '<button type="button" class="' + cls + '" data-sessions-hub-tab="' + esc(t.id) + '">' + esc(t.label) + '</button>';
      }).join('');
    }
    function adminListSessionFeedbackInstructors(){
      var seen = {}, out = [];
      function add(name){
        var n = String(name || '').trim();
        if(!n) return;
        var k = n.toLowerCase();
        if(seen[k]) return;
        seen[k] = true;
        out.push(n);
      }
      adminSessionFeedbackStatusRows().forEach(function(r){ add(r.instructor); });
      adminSessionFeedbackPortalRows().forEach(function(r){ add(r.instructor); });
      return out.sort(function(a, b){ return a.localeCompare(b); });
    }
    function sessionsHubRefreshActiveTab(){
      var h = sessionsHubEnsureState();
      var ov = $('c4kHubPanelOverview');
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
      if(h.tab === 'overview' && h.sfSection === 'main'){
        var cap = $('c4kSessionOverviewCapacity');
        if(cap) cap.innerHTML = bookingWeekSessionsHubHtml(h.weekAnchorIso, { selectedIso: h.selectedIso || h.weekAnchorIso });
        void refreshSessionOverviewTable(h.selectedIso || h.weekAnchorIso);
      }else{
        void refreshSessionFeedbackGrid();
      }
    }
    function c4kSessionFeedbackPanelInnerHtml(){
      var usingPortal = adminSessionFeedbackPortalRows().length > 0;
      var meta = usingPortal && window.SESSION_FEEDBACK_PORTAL_SOURCE && window.SESSION_FEEDBACK_PORTAL_SOURCE.meta;
      var metaLine = usingPortal
        ? ('<span class="chip chip--ok">Session feedback</span> <span class="muted" style="font-size:12px">' + esc(String(meta && meta.sourceFile ? meta.sourceFile : 'session_feedback_portal_data.js')) + '</span>')
        : '<span class="chip chip--info">Demo</span>';
      var instOpts = adminListSessionFeedbackInstructors().map(function(n){
        return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
      }).join('');
      return (
        '<p class="page-intro" style="max-width:52rem;margin-top:0;min-width:0;overflow-wrap:break-word">Instructor notes for attended sessions. ' + metaLine + '</p>' +
        '<h2 class="c4k-hub-fb-title">Feedback progress (<span id="c4kHubFbWeekRange">—</span>)</h2>' +
        '<div id="c4kSfWeekShell" role="region" aria-label="Session feedback completion this week">' +
        '<div id="c4kSfWeekInner"></div></div>' +
        '<div class="card card-pad" style="margin-bottom:12px;min-width:0">' +
        '<div class="filter-row" style="flex-wrap:wrap;gap:10px;align-items:flex-end">' +
        '<div style="min-width:0;flex:1 1 220px">' +
        '<label class="muted" for="c4kSfClientFilter" style="display:block;font-size:12px;margin-bottom:4px">Search client</label>' +
        '<input type="search" id="c4kSfClientFilter" class="inp" placeholder="Name contains…" autocomplete="off" style="max-width:100%;width:100%;min-width:0" /></div>' +
        '<div style="min-width:0;flex:1 1 180px">' +
        '<label class="muted" for="c4kSfInstructorFilter" style="display:block;font-size:12px;margin-bottom:4px">Instructor</label>' +
        '<select id="c4kSfInstructorFilter" class="inp" style="max-width:100%;width:100%"><option value="">All instructors</option>' + instOpts + '</select></div>' +
        '<div><label class="muted" for="c4kSfDateFrom" style="display:block;font-size:12px;margin-bottom:4px">From</label>' +
        '<input type="date" id="c4kSfDateFrom" class="inp" style="max-width:180px" value="" /></div>' +
        '<div><label class="muted" for="c4kSfDateTo" style="display:block;font-size:12px;margin-bottom:4px">To</label>' +
        '<input type="date" id="c4kSfDateTo" class="inp" style="max-width:180px" value="" /></div>' +
        '<button type="button" class="btn btn--pri btn--sm" id="c4kSfApplyRange">Apply dates</button>' +
        '</div>' +
        '<p id="c4kSfFilterHint" class="muted" style="margin:10px 0 0;font-size:12px;line-height:1.45;max-width:52rem;min-width:0;overflow-wrap:break-word"></p>' +
        '</div>' +
        '<div class="card" id="c4kSfMainGridCard"><div class="card-pad c4k-sf-main-tbl-wrap" style="overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%"><table class="tbl tbl--center c4k-sf-main-tbl"><thead><tr><th>Participant</th><th scope="col" class="c4k-sf-col-svc">Service</th><th scope="col" class="c4k-sf-th-eng">' + adminC4kEmotionHeaderLegendHtml() + '</th><th scope="col" class="c4k-sf-col-indep">Independence</th><th scope="col" class="c4k-sf-col-pos">Positive</th><th scope="col" class="c4k-sf-col-rel">Relevant</th><th scope="col" class="c4k-sf-col-inst">Instructor</th></tr></thead><tbody id="c4kSfFeedbackTbody"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table></div></div>' +
        '<div class="card c4k-sf-out-card" id="c4kSfOutcomeCard" style="margin-bottom:12px;min-width:0"><div class="card-h"><h3>Not attended / cancelled</h3></div><div class="card-pad" style="overflow:auto;padding:0"><table class="tbl tbl--center c4k-sf-out-tbl"><thead><tr><th>Participant</th><th>Date</th><th>Service</th><th>Outcome</th><th>Notify by</th><th>When</th></tr></thead><tbody id="c4kSfOutcomeTbody"><tr><td colspan="6" class="muted">Loading…</td></tr></tbody></table></div></div>' +
        '<div class="card c4k-sf-out-card" id="c4kSfIncidentsCard" style="margin-bottom:12px;min-width:0"><div class="card-h"><h3>Incidents</h3></div><div class="card-pad" style="overflow:auto;padding:0"><table class="tbl tbl--center c4k-sf-inc-tbl"><thead><tr><th>Participant</th><th>Service</th><th>Day</th><th>Completed by</th></tr></thead><tbody id="c4kSfIncidentsTbody"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>'
      );
    }
    function bindSessionsHubModule(){
      var h = sessionsHubEnsureState();
      document.querySelectorAll('[data-sessions-hub-tab]').forEach(function(btn){
        btn.onclick = function(){
          var id = btn.getAttribute('data-sessions-hub-tab');
          var tab = C4K_SESSIONS_HUB_TABS.filter(function(t){ return t.id === id; })[0];
          if(!tab) return;
          if(tab.mode === 'view' && tab.view){ setView(tab.view); return; }
          if(tab.mode === 'sfSection'){
            h.tab = id;
            h.sfSection = tab.section;
            sessionsHubRefreshActiveTab();
            return;
          }
          h.tab = id;
          h.sfSection = 'main';
          sessionsHubRefreshActiveTab();
        };
      });
      var prev = $('c4kHubWeekPrev'), thisw = $('c4kHubWeekThis'), next = $('c4kHubWeekNext');
      if(prev) prev.onclick = function(){ sessionsHubShiftWeek(-1); };
      if(thisw) thisw.onclick = function(){
        h.weekAnchorIso = isoDateLocal(new Date());
        h.selectedIso = null;
        h.rangeFrom = '';
        h.rangeTo = '';
        var st = sessionFeedbackEnsureState();
        st.rangeFrom = ''; st.rangeTo = ''; st.selectedIso = null; st.anchorIso = h.weekAnchorIso;
        sessionsHubRefreshActiveTab();
      };
      if(next) next.onclick = function(){ sessionsHubShiftWeek(1); };
      function onWeekDayPick(e){
        var col = e.target && e.target.closest ? e.target.closest('[data-booking-week-day]') : null;
        if(!col) return;
        e.preventDefault();
        var nextIso = col.getAttribute('data-booking-week-day');
        if(!nextIso) return;
        h.selectedIso = nextIso;
        h.weekAnchorIso = bookingWeekIsoRangeMonSun(nextIso)[0] || h.weekAnchorIso;
        state.sessionOverview.iso = nextIso;
        var st = sessionFeedbackEnsureState();
        st.selectedIso = nextIso;
        st.anchorIso = h.weekAnchorIso;
        sessionsHubRefreshActiveTab();
      }
      var cap = $('c4kSessionOverviewCapacity');
      var sfShell = $('c4kSfWeekShell');
      if(cap){ cap.onclick = onWeekDayPick; cap.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' ') onWeekDayPick(e); }; }
      if(sfShell){ sfShell.onclick = onWeekDayPick; sfShell.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' ') onWeekDayPick(e); }; }
      var paxF = $('c4kSessionOverviewPaxFilter');
      if(paxF){
        paxF.value = h.clientQ || '';
        paxF.oninput = function(){ h.clientQ = paxF.value || ''; sessionFeedbackEnsureState().clientQ = h.clientQ; applySessionOverviewPaxFilter(); if($('c4kSfClientFilter')) $('c4kSfClientFilter').value = h.clientQ; void refreshSessionFeedbackGrid(); };
      }
      bindSessionFeedbackModule();
      var instSel = $('c4kSfInstructorFilter');
      if(instSel){
        instSel.value = h.instructorQ || '';
        instSel.onchange = function(){ h.instructorQ = instSel.value || ''; void refreshSessionFeedbackGrid(); };
      }
      sessionsHubRefreshActiveTab();
    }
"""

VIEW_C4K_SESSIONS_NEW = r"""
    function viewC4kSessions(){
      var h = sessionsHubEnsureState();
      return (
        '<div class="c4k-sessions-hub">' +
        '<div class="c4k-sessions-hub__head">' +
        '<h1 class="c4k-sessions-hub__title">SESSIONS OVERVIEW</h1>' +
        '<p class="c4k-sessions-hub__sub">Weekly roster, session status, and feedback by day — same counts as portal-import-bundle.</p>' +
        '</div>' +
        '<div class="c4k-sessions-hub-tabs" role="tablist" aria-label="Day operations">' + sessionsHubTabsHtml(h.tab) + '</div>' +
        sessionsHubWeekNavHtml(h.weekAnchorIso) +
        '<div id="c4kHubPanelOverview" class="c4k-sessions-hub-panel">' +
        '<div id="c4kSessionOverviewCapacity" style="margin-bottom:14px;min-width:0"></div>' +
        '<div class="c4k-sess-overview-pax-filter">' +
        '<label class="c4k-sess-overview-pax-filter__lbl" for="c4kSessionOverviewPaxFilter">Search client</label>' +
        '<input type="search" class="inp" id="c4kSessionOverviewPaxFilter" placeholder="Name contains..." autocomplete="off" aria-label="Search client by name" />' +
        '</div>' +
        '<div class="card" style="margin-bottom:12px"><div class="card-h" style="align-items:flex-start;gap:10px"><h3 id="c4kSessionOverviewRosterTitle" class="c4k-sess-roster-h">Roster</h3>' +
        (adminSpreadsheetAdapterAvailable() ? '<span class="chip chip--ok">Roster</span>' : '<span class="chip chip--pend">No sheet</span>') +
        '</div><div class="card-pad" style="overflow:auto;padding:0;min-width:0"><table class="tbl tbl--center c4k-sess-overview-tbl"><thead><tr><th scope="col">Service</th><th>Instructor</th><th scope="col" class="c4k-sess-pax-th">Participant</th><th>Status</th><th>Override</th><th>Feedback</th>' +
        '<th scope="col" class="c4k-sess-ico-th" title="Incidents">Inc.</th><th scope="col" class="c4k-sess-ico-th" title="Cancellations">Can.</th><th scope="col">Ops flag</th></tr></thead><tbody id="c4kSessionOverviewTbody">' +
        '<tr><td colspan="9" class="muted">Loading…</td></tr></tbody></table></div>' +
        '<p class="muted card-pad" style="margin:0;border-top:1px solid var(--line);font-size:12px;max-width:52rem;min-width:0;overflow-wrap:break-word">Feedback chips use <code>session_feedback_status_portal_data.js</code> (absent = done; shared units per FEEDBACK-COMPLETION-LOGIC.md).</p></div>' +
        '<div class="toolbar" style="margin-bottom:12px">' +
        '<button type="button" class="btn btn--pri btn--sm" data-view-target="scheduling">Scheduling &amp; Cover</button>' +
        '<button type="button" class="btn btn--sec btn--sm" data-view-target="bookings">Bookings</button>' +
        '</div></div>' +
        '<div id="c4kHubPanelFeedback" class="c4k-sessions-hub-panel" hidden>' + c4kSessionFeedbackPanelInnerHtml() + '</div>' +
        '</div>'
      );
    }
"""

def patch_html(html_path: Path) -> bool:
    text = html_path.read_text(encoding="utf-8")
    if ".c4k-sessions-hub" in text:
        print("Already patched:", html_path)
        return False
    text = text.replace(
        "    .c4k-bridgesched{border:2px solid #7dd3fc;",
        CSS_BLOCK + "\n    .c4k-bridgesched{border:2px solid #7dd3fc;",
        1,
    )
    marker = "    function viewC4kSessions(){"
    if marker not in text:
        raise SystemExit("viewC4kSessions marker not found")
    # Replace entire viewC4kSessions function until viewC4kPaymentsView
    start = text.index(marker)
    end = text.index("    function viewC4kPaymentsView(){")
    text = text[:start] + JS_BLOCK + "\n" + VIEW_C4K_SESSIONS_NEW + "\n" + text[end:]
    text = text.replace(
        "      if(cap) cap.innerHTML = bookingWeekCapacityHtml(iso, { embedWeekTile: true });",
        "      if(cap) cap.innerHTML = bookingWeekSessionsHubHtml(iso, { selectedIso: iso });",
        1,
    )
    text = text.replace(
        "      if(id==='c4k_sessions'){\n        bindSessionOverviewModule();\n      }\n      if(id==='c4k_registers'){\n        bindSessionFeedbackModule();\n      }",
        "      if(id==='c4k_sessions'){\n        bindSessionsHubModule();\n      }\n      if(id==='c4k_registers'){\n        sessionsHubEnsureState().tab = 'feedback';\n        sessionsHubEnsureState().sfSection = 'main';\n        setView('c4k_sessions');\n      }",
        1,
    )
    # Extend sessionFeedbackApplyFiltersToRows with instructor + section
    old_filter_loop = """        if(clientQ && String(d.pax || '').toLowerCase().indexOf(clientQ) < 0) continue;
        out.push(d);"""
    new_filter_loop = """        if(clientQ && String(d.pax || '').toLowerCase().indexOf(clientQ) < 0) continue;
        var hub = state.sessionsHub || {};
        var iq = String(hub.instructorQ || st.instructorQ || '').trim().toLowerCase();
        if(iq && String(d.instructor || '').toLowerCase().indexOf(iq) < 0) continue;
        var sec = String(hub.sfSection || 'main');
        if(sec === 'positive'){
          if(!adminSfStr(d.pos) || adminSfStr(d.pos) === '—') continue;
        }else if(sec === 'relevant'){
          if(!adminSfStr(d.rel) || adminSfStr(d.rel) === '—') continue;
        }else if(sec === 'incidents'){
          if(!adminC4kIncidentNotesArePresent(d.incidents)) continue;
        }
        out.push(d);"""
    if old_filter_loop in text:
        text = text.replace(old_filter_loop, new_filter_loop, 1)
    # Show/hide grid sections by sfSection in refreshSessionFeedbackGrid
    old_refresh_end = "      bindSessionFeedbackTbodyClicks();\n    }"
    new_refresh_end = """      var hub = state.sessionsHub || {};
      var sec = String(hub.sfSection || 'main');
      var mainCard = $('c4kSfMainGridCard');
      var outCard = $('c4kSfOutcomeCard');
      var incCard = $('c4kSfIncidentsCard');
      if(sec === 'positive' || sec === 'relevant'){
        if(mainCard) mainCard.hidden = false;
        if(outCard) outCard.hidden = true;
        if(incCard) incCard.hidden = true;
      }else if(sec === 'incidents'){
        if(mainCard) mainCard.hidden = true;
        if(outCard) outCard.hidden = true;
        if(incCard) incCard.hidden = false;
      }else{
        if(mainCard) mainCard.hidden = false;
        if(outCard) outCard.hidden = false;
        if(incCard) incCard.hidden = false;
      }
      bindSessionFeedbackTbodyClicks();
    }"""
    if old_refresh_end in text:
        text = text.replace(old_refresh_end, new_refresh_end, 1)
    # st.instructorQ in sessionFeedbackEnsureState
    text = text.replace(
        "      if(st.clientQ === undefined) st.clientQ = '';\n      return st;",
        "      if(st.clientQ === undefined) st.clientQ = '';\n      if(st.instructorQ === undefined) st.instructorQ = '';\n      return st;",
        1,
    )
    html_path.write_text(text, encoding="utf-8")
    print("Patched", html_path)
    return True


def main():
    patched = 0
    for html_path in HTML_TARGETS:
        if not html_path.is_file():
            print("Skip (missing):", html_path)
            continue
        if patch_html(html_path):
            patched += 1
    if not patched:
        print("No files changed.")


if __name__ == "__main__":
    main()
