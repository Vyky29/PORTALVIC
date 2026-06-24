/** Real calendar weekday for “Today” (en-GB), aligned with staff_clients_machine.xlsx */
    function portalWeekdayLongEnGB(d){
      return new Date(d).toLocaleDateString('en-GB', { weekday: 'long' });
    }
    window.portalWeekdayLongEnGB = portalWeekdayLongEnGB;
    var portalQuickMenuEntryMode = 'full';
    /** Weekday name for the real local calendar “today” — used for the top header only (not DEMO_VIEW_DAY / historical review). */
    function portalLiveHeaderWeekday(){
      return typeof portalWeekdayLongEnGB === 'function' ? portalWeekdayLongEnGB(new Date()) : 'Monday';
    }
    function portalFormatTopbarDateFromDate(dateObj){
      const d = dateObj instanceof Date ? dateObj : new Date();
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('en-GB', { month: 'long' });
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
      return `${weekday}, ${dayNum}${dayOrdinalSuffix(dayNum)} ${month}`;
    }
    function portalFormatTopbarDateNumericFromDate(dateObj){
      const d = dateObj instanceof Date ? dateObj : new Date();
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    /** DD/MM/YYYY — same numeric style as the live topbar date pill (`topbarDateLineYmd`). */
    function portalFormatPortalDateDdMmYyyy(dateObj){
      return typeof portalFormatTopbarDateNumericFromDate === 'function'
        ? portalFormatTopbarDateNumericFromDate(dateObj)
        : '';
    }
    try{ window.portalFormatPortalDateDdMmYyyy = portalFormatPortalDateDdMmYyyy; }catch(_){}
    function portalFormatTopbarTimeFromDate(dateObj){
      const d = dateObj instanceof Date ? dateObj : new Date();
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function portalApplyTopbarDateDisplayFromDate(dateObj){
      const d = dateObj instanceof Date ? dateObj : new Date();
      const wkEl = document.getElementById('topbarDateLineWk');
      const ymdEl = document.getElementById('topbarDateLineYmd');
      const btn = document.getElementById('topbarDateBtn');
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const num = portalFormatTopbarDateNumericFromDate(d);
      const time = portalFormatTopbarTimeFromDate(d);
      if(wkEl) wkEl.textContent = weekday;
      if(ymdEl) ymdEl.textContent = num;
      if(btn) btn.setAttribute('aria-label', 'Working day: ' + weekday + ', ' + num);
    }
    function portalStartTopbarLiveClock(){
      if(window.__portalTopbarClockTimer) return;
      const tick = function(){
        if(typeof portalApplyTopbarDateDisplayFromDate === 'function'){
          const d = typeof portalResolveTopbarDisplayDate === 'function'
            ? portalResolveTopbarDisplayDate()
            : new Date();
          portalApplyTopbarDateDisplayFromDate(d);
        }
      };
      tick();
      window.__portalTopbarClockTimer = window.setInterval(tick, 1000);
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', portalStartTopbarLiveClock, { once: true });
    }else{
      portalStartTopbarLiveClock();
    }
    let DEMO_VIEW_DAY = portalWeekdayLongEnGB(new Date());
    /** Optional local preview only: `?portalPreview=teflon` (not used on Vercel production). */
    function portalStaffDashIsEditorPreviewMode(){
      try{
        if(typeof window === 'undefined' || !window.location) return false;
        return /(?:^|[?&])portalPreview=teflon(?:&|$)/i.test(String(window.location.search || ''));
      }catch(_){}
      return false;
    }
    /** Live: no rota id until `rehydrateFromProfile` maps Supabase `staff_profile`. Preview: sample `teflon` rota only. */
    window.portalParticipantsSheetStaffOnly = true;
    let STAFF_DASHBOARD_ID = '';
    let __spreadsheetBoot = null;
    let sessionsModel = [];
    let clientNotesById = {};
    if(portalStaffDashIsEditorPreviewMode()){
      STAFF_DASHBOARD_ID = 'teflon';
      var _staffDashSource = typeof window.portalResolveStaffDashboardSource === 'function'
        ? window.portalResolveStaffDashboardSource()
        : window.STAFF_DASHBOARD_SOURCE;
      __spreadsheetBoot = (typeof StaffDashboardSpreadsheetAdapter !== 'undefined' && _staffDashSource)
        ? StaffDashboardSpreadsheetAdapter.bootstrap({ source: _staffDashSource, staffId: STAFF_DASHBOARD_ID })
        : null;
      if(__spreadsheetBoot){
        sessionsModel = __spreadsheetBoot.sessionsModel || [];
        clientNotesById = __spreadsheetBoot.clientNotesById || {};
        portalApplyClientsInfoToNotes();
      }
      if(typeof portalApplyTeflonGuideDemoRoster === 'function') portalApplyTeflonGuideDemoRoster();
      if(__spreadsheetBoot && typeof portalStaffIsDemoAccount === 'function' && portalStaffIsDemoAccount()){
        if(typeof portalApplyTeflonGuideDemoViewDefaults === 'function') portalApplyTeflonGuideDemoViewDefaults();
        else if(__spreadsheetBoot.defaultViewDay) DEMO_VIEW_DAY = __spreadsheetBoot.defaultViewDay;
      }
      if(typeof portalSeedTeflonGuideDemoReviewState === 'function') portalSeedTeflonGuideDemoReviewState();
    }
    /** Teflon demo login: fake term dates, sample TERM feedback, bypass session-end for quick feedback, etc. */
    function portalStaffIsDemoAccount(){
      return String(STAFF_DASHBOARD_ID || '').trim().toLowerCase() === 'teflon';
    }
    const TEFLON_GUIDE_DEFAULT_ISO = '2026-06-04';
    const TEFLON_GUIDE_TOMORROW_ISO = '2026-06-05';
    function portalTeflonGuidePinnedIso(){
      try{
        if(window.PortalTeflonGuideDemo && typeof window.PortalTeflonGuideDemo.pinnedIso === 'function'){
          return window.PortalTeflonGuideDemo.pinnedIso();
        }
      }catch(_){}
      return TEFLON_GUIDE_DEFAULT_ISO;
    }
    function portalTeflonGuidePinnedDayWord(){
      const data = window.PortalTeflonGuideDemoData;
      const iso = portalTeflonGuidePinnedIso();
      if(data && typeof data.weekdayForIso === 'function') return data.weekdayForIso(iso);
      try{
        return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      }catch(_){
        return 'Thursday';
      }
    }
    /** Isolated guide roster (Thu 04/06 + Fri 05/06) — never touches shared STAFF_DASHBOARD_SOURCE. */
    function portalApplyTeflonGuideDemoRoster(){
      if(typeof portalStaffIsDemoAccount !== 'function' || !portalStaffIsDemoAccount()) return false;
      if(!window.PortalTeflonGuideDemo || typeof window.PortalTeflonGuideDemo.applyToDashboard !== 'function') return false;
      const boot = window.PortalTeflonGuideDemo.applyToDashboard();
      if(!boot || !Array.isArray(boot.sessionsModel)) return false;
      sessionsModel = boot.sessionsModel;
      clientNotesById = boot.clientNotesById || {};
      __spreadsheetBoot = Object.assign({}, __spreadsheetBoot || {}, boot, {
        defaultViewDay: portalTeflonGuidePinnedDayWord()
      });
      if(typeof portalApplyClientsInfoToNotes === 'function') portalApplyClientsInfoToNotes();
      return true;
    }
    /** Guide photos: anchor to Thu 04/06/2026 by default; `?portalGuideIso=2026-06-05` for Fri. */
    function portalApplyTeflonGuideDemoViewDefaults(){
      if(!portalStaffIsDemoAccount()) return;
      const iso = portalTeflonGuidePinnedIso();
      const dayWord = portalTeflonGuidePinnedDayWord();
      DEMO_VIEW_DAY = dayWord;
      try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
      try{
        __PORTAL_REVIEW_DATE_URL_LOCK = iso;
        __PORTAL_REVIEW_DAY_URL_LOCK = dayWord;
        window.__PORTAL_REVIEW_DATE_URL_LOCK = iso;
        window.__PORTAL_REVIEW_DAY_URL_LOCK = dayWord;
      }catch(_){}
    }
    /** Topbar date pill: Teflon demo pins showcase ISO; everyone else uses live clock. */
    function portalResolveTopbarDisplayDate(){
      if(typeof portalStaffIsDemoAccount === 'function' && portalStaffIsDemoAccount()){
        const iso = portalTeflonGuidePinnedIso();
        const d = typeof portalParseIsoDateLocal === 'function'
          ? portalParseIsoDateLocal(iso)
          : new Date(2026, 5, 4);
        if(d && !isNaN(d.getTime())) return d;
      }
      return new Date();
    }
    /** Guide showcase card colours for 04/06 and 05/06 (portal/teflon_guide_demo_data.js). */
    function portalSeedTeflonGuideDemoReviewState(){
      if(!portalStaffIsDemoAccount()) return false;
      if(window.PortalTeflonGuideDemo && typeof window.PortalTeflonGuideDemo.seedReviewState === 'function'){
        return window.PortalTeflonGuideDemo.seedReviewState(
          sessionReviewMapMemory,
          typeof persistSessionReviewMap === 'function' ? persistSessionReviewMap : null
        );
      }
      return false;
    }
    (function portalGuideShotHaloOverride(){
      try{
        if(typeof window === 'undefined' || !window.location) return;
        const p = new URLSearchParams(String(window.location.search || ''));
        const h = String(p.get('portalGuideHalo') || '').trim().toLowerCase();
        if(!h) return;
        window.__PORTAL_GUIDE_HALO_SHOT__ = h;
      }catch(_e){}
    })();
    var _staffDashAdapterMissing = typeof StaffDashboardSpreadsheetAdapter === 'undefined' || !window.STAFF_DASHBOARD_SOURCE;
    if(_staffDashAdapterMissing){
      console.warn('staff_dashboard: STAFF_DASHBOARD_SOURCE or adapter missing; sessions/clients empty.');
      var todayFallback = document.getElementById('todayGridFallback');
      if (todayFallback) {
        todayFallback.innerHTML = '<div class="today-grid-rows" role="list"><div class="session-card session-card--empty" role="presentation" style="pointer-events:none;cursor:default"><div class="session-cell session-cell--client session-cell--empty-msg">Spreadsheet source is not loaded yet.</div></div></div>';
      }
    }
    (function applyClientDisplayNameOverrides(){
      var KEY = 'staffDashboard_clientNameOverrides_v1';
      try{
        var raw = localStorage.getItem(KEY);
        if(!raw) return;
        var o = JSON.parse(raw);
        if(!o || typeof o !== 'object') return;
        Object.keys(o).forEach(function(id){
          var name = String(o[id] || '').trim();
          if(!name || !clientNotesById[id]) return;
          clientNotesById[id].name = name;
        });
      }catch(e){}
    })();
    /**
     * false = feedback only after the slot end time (demo date + end).
     * true = ignore the clock (local testing only).
     */
