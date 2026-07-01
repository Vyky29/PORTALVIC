    /** When the landing URL had a valid `portalReviewDay`, rehydrate/demo-reset must not overwrite DEMO_VIEW_DAY on the same load. Also on `window` for the second script block's `rehydrateFromProfile`. */
    var __PORTAL_REVIEW_DAY_URL_LOCK = '';
    try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_){}
    /** YYYY-MM-DD from `portalReviewDate` or TERM navigation; drives `getViewAnchorCalendarDate` / session keys for historical days. */
    var __PORTAL_REVIEW_DATE_URL_LOCK = '';
    try{ window.__PORTAL_REVIEW_DATE_URL_LOCK = ''; }catch(_){}
    function portalParseIsoDateLocal(ymd){
      const s = String(ymd || '').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const p = s.split('-').map(Number);
      const dt = new Date(p[0], p[1] - 1, p[2]);
      if(Number.isNaN(dt.getTime())) return null;
      if(dt.getFullYear() !== p[0] || dt.getMonth() !== p[1] - 1 || dt.getDate() !== p[2]) return null;
      return dt;
    }
    function portalClearReviewDateUrlLock(){
      __PORTAL_REVIEW_DATE_URL_LOCK = '';
      try{ window.__PORTAL_REVIEW_DATE_URL_LOCK = ''; }catch(_){}
    }
    function portalSetReviewDateUrlLock(ymd){
      const dt = portalParseIsoDateLocal(ymd);
      if(!dt) return false;
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      __PORTAL_REVIEW_DATE_URL_LOCK = iso;
      try{ window.__PORTAL_REVIEW_DATE_URL_LOCK = iso; }catch(_){}
      return true;
    }
    function portalSyncReviewNavigationQueryToHistory(){
      try{
        const u = new URL(location.href.split('#')[0]);
        const iso = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '').trim();
        if(/^\d{4}-\d{2}-\d{2}$/.test(iso) && portalParseIsoDateLocal(iso)){
          u.searchParams.set('portalReviewDate', iso);
          const d = portalParseIsoDateLocal(iso);
          u.searchParams.set('portalReviewDay', d.toLocaleDateString('en-GB', { weekday: 'long' }));
        }else{
          u.searchParams.delete('portalReviewDate');
          u.searchParams.delete('portalReviewDay');
        }
        const qs = u.searchParams.toString();
        history.replaceState({}, '', u.pathname + (qs ? '?' + qs : '') + (location.hash || ''));
      }catch(_){}
    }
    (function portalApplyInitialReviewDayFromUrl(){
      try{
        const params = new URLSearchParams(window.location.search);
        const reviewDateRaw = params.get('portalReviewDate');
        const reviewDateParsed = portalParseIsoDateLocal(reviewDateRaw);
        if(reviewDateParsed){
          const iso = `${reviewDateParsed.getFullYear()}-${String(reviewDateParsed.getMonth() + 1).padStart(2, '0')}-${String(reviewDateParsed.getDate()).padStart(2, '0')}`;
          portalSetReviewDateUrlLock(iso);
          DEMO_VIEW_DAY = reviewDateParsed.toLocaleDateString('en-GB', { weekday: 'long' });
          __PORTAL_REVIEW_DAY_URL_LOCK = DEMO_VIEW_DAY;
          try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = DEMO_VIEW_DAY; }catch(_){}
          try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
          try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = true; }catch(_){}
          return;
        }
        const reviewDay = params.get('portalReviewDay');
        if(reviewDay && PORTAL_WEEK_REVIEW_VALID_DAYS.has(String(reviewDay).trim())){
          portalClearReviewDateUrlLock();
          DEMO_VIEW_DAY = String(reviewDay).trim();
          __PORTAL_REVIEW_DAY_URL_LOCK = DEMO_VIEW_DAY;
          try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = DEMO_VIEW_DAY; }catch(_){}
          try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
          try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = true; }catch(_){}
        }
      }catch(_){}
    })();
    function portalTermSessionJudgementAllowed(){
      try{
        if(typeof window !== 'undefined' && window.__PORTAL_TERM_JUDGEMENT_ALLOWED === false) return false;
      }catch(_){}
      return true;
    }
    try{ window.portalTermSessionJudgementAllowed = portalTermSessionJudgementAllowed; }catch(_){}
    function portalFinishWeekDayReviewFlow(day, isoOpt, usedDateLock, termJudgementAllowed){
      try{ window.__PORTAL_TERM_JUDGEMENT_ALLOWED = termJudgementAllowed; }catch(_){}
      try{ window.__PORTAL_TODAY_SYNC_RETRY__ = false; }catch(_){}
      DEMO_VIEW_DAY = day;
      if(typeof getDemoDateLabel === 'function') dashboardData.dateLabel = getDemoDateLabel(DEMO_VIEW_DAY);
      if(typeof getDemoDateTopbar === 'function') dashboardData.dateTopbar = getDemoDateTopbar(DEMO_VIEW_DAY);
      hydrateSessionReviewMapFromStorage();
      portalSyncTodaySectionDisplay();
      if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
      renderHeader();
      renderToday();
      renderMiniCounts();
      renderLists();
      document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function portalOpenWeekDayReviewFlow(dayName, opts){
      const day = String(dayName || '').trim();
      if(!PORTAL_WEEK_REVIEW_VALID_DAYS.has(day)) return;
      opts = opts || {};
      const isoOpt = opts.portalReviewDate ? String(opts.portalReviewDate).trim() : '';
      /* Close term sheet first so the UI is never stuck behind it during date navigation. */
      if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
      closeClientGeneralSheet();
      document.body.style.overflow = '';
      const hasJudgementOpt = Object.prototype.hasOwnProperty.call(opts, 'portalTermJudgementAllowed');
      let termJudgementAllowed = hasJudgementOpt ? !!opts.portalTermJudgementAllowed : true;
      const todayKey = typeof portalTermLocalYmdFromMs === 'function' ? portalTermLocalYmdFromMs(Date.now()) : '';
      if(!termJudgementAllowed && /^\d{4}-\d{2}-\d{2}$/.test(isoOpt)){
        if(todayKey && isoOpt < todayKey){
          termJudgementAllowed = true;
        }
      }
      let usedDateLock = false;
      if(/^\d{4}-\d{2}-\d{2}$/.test(isoOpt)){
        const dtIso = portalParseIsoDateLocal(isoOpt);
        const wIso = dtIso ? dtIso.toLocaleDateString('en-GB', { weekday: 'long' }) : '';
        if(dtIso && wIso === day && portalSetReviewDateUrlLock(isoOpt)){
          usedDateLock = true;
          __PORTAL_REVIEW_DAY_URL_LOCK = day;
          try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = day; }catch(_){}
          try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = true; }catch(_){}
        }
      }
      if(!usedDateLock){
        portalClearReviewDateUrlLock();
        __PORTAL_REVIEW_DAY_URL_LOCK = '';
        try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_){}
        try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = false; }catch(_){}
      }
      portalSyncReviewNavigationQueryToHistory();
      const finish = function(){
        if(!termJudgementAllowed && /^\d{4}-\d{2}-\d{2}$/.test(isoOpt)
          && typeof portalTermCalendarDayStillHasPendingFeedback === 'function'){
          const dayWordCheck = new Date(isoOpt + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
          if(portalTermCalendarDayStillHasPendingFeedback(isoOpt, dayWordCheck)) termJudgementAllowed = true;
        }
        portalFinishWeekDayReviewFlow(day, isoOpt, usedDateLock, termJudgementAllowed);
      };
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
      else finish();
    }
    try{ window.portalOpenWeekDayReviewFlow = portalOpenWeekDayReviewFlow; }catch(_){}
    /** System notification (roster override): open the affected calendar day in Today / week anchor. */
    window.portalNavigateDashboardToOverrideDate = function portalNavigateDashboardToOverrideDate(isoYmd){
      try{
        const iso = String(isoYmd || '').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
        const dt = typeof portalParseIsoDateLocal === 'function' ? portalParseIsoDateLocal(iso) : null;
        if(!dt) return false;
        const dayName = dt.toLocaleDateString('en-GB', { weekday: 'long' });
        if(typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== 'undefined' && !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dayName)) return false;
        if(typeof portalOpenWeekDayReviewFlow === 'function'){
          portalOpenWeekDayReviewFlow(dayName, { portalReviewDate: iso });
          return true;
        }
      }catch(_){}
      return false;
    };
    function buildSessionFeedbackPageUrl(item){
      const base = portalSessionFeedbackPageBase();
      if(!item || !item.sessionKey) return portalAppendFromPortalQuery(base.split('?')[0].split('#')[0] || 'portal-session-feedback.html');
      const sk = encodeURIComponent(String(item.sessionKey));
      const nm = encodeURIComponent(String(item.name || '').trim());
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      const parts = ['sessionKey=' + sk];
      if(nm) parts.push('clientName=' + nm);
      const skRaw = String(item.sessionKey || '');
      const dateFromKey = (skRaw.split('|')[0] || '').trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(dateFromKey)) parts.push('date=' + encodeURIComponent(dateFromKey));
      const svc = portalFeedbackFormServiceLabel(item.activity)
        || portalFeedbackFormServiceLabel(item && item.__portalBaseSession && item.__portalBaseSession.activity)
        || 'Session feedback';
      parts.push('service=' + encodeURIComponent(String(svc).trim()));
      const cid = String(item.clientId || '').trim();
      if(cid && cid !== 'available' && cid !== 'closed') parts.push('clientId=' + encodeURIComponent(cid));
      const tlab = String(item.time || '').trim();
      if(tlab) parts.push('time=' + encodeURIComponent(tlab));
      return portalAppendFromPortalQuery(base.split('#')[0] + sep + parts.join('&'));
    }
    function buildIncidentReportPageUrl(item){
      const base = portalIncidentReportPageBase();
      if(!item || !item.sessionKey){
        const staffBase = (base.split('?')[0].split('#')[0] || 'portal-incident.html');
        const staffSep = staffBase.indexOf('?') >= 0 ? '&' : '?';
        return portalAppendFromPortalQuery(staffBase + staffSep + 'subject=staff');
      }
      let skEncoded = '';
      try{
        skEncoded = btoa(unescape(encodeURIComponent(String(item.sessionKey || ''))))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
      }catch(_){}
      const skRaw = String(item.sessionKey || '');
      const dateFromKey = (skRaw.split('|')[0] || '').trim();
      const reviewDay = portalWeekdayLongFromSessionDateKey(item.sessionKey) || String(DEMO_VIEW_DAY || '').trim();
      const parts = [];
      if(skEncoded) parts.push('sk=' + encodeURIComponent(skEncoded));
      parts.push('sessionKey=' + encodeURIComponent(String(item.sessionKey || '')));
      const nmInc = encodeURIComponent(String(item.name || '').trim());
      if(nmInc) parts.push('clientName=' + nmInc);
      parts.push('origin=' + encodeURIComponent(portalGetReviewFlowOrigin()));
      parts.push('rp=' + encodeURIComponent(String(location.pathname || 'staff_dashboard.html')));
      if(reviewDay) parts.push('rday=' + encodeURIComponent(reviewDay));
      if(/^\d{4}-\d{2}-\d{2}$/.test(dateFromKey)){
        parts.push('date=' + encodeURIComponent(dateFromKey));
        parts.push('rd=' + encodeURIComponent(dateFromKey));
      }
      const svcInc = portalFeedbackFormServiceLabel(item.activity)
        || portalFeedbackFormServiceLabel(item && item.__portalBaseSession && item.__portalBaseSession.activity);
      if(svcInc) parts.push('service=' + encodeURIComponent(String(svcInc).trim()));
      const cidInc = String(item.clientId || '').trim();
      if(cidInc && cidInc !== 'available' && cidInc !== 'closed') parts.push('clientId=' + encodeURIComponent(cidInc));
      const tlabInc = String(item.time || '').trim();
      if(tlabInc) parts.push('time=' + encodeURIComponent(tlabInc));
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      return portalAppendFromPortalQuery(base.split('#')[0] + sep + parts.join('&'));
    }
    function buildCancellationReportPageUrl(item){
      const base = portalCancellationReportPageBase();
      if(!item || !item.sessionKey) return base.split('?')[0].split('#')[0] || 'cancellation.html';
      let skEncoded = '';
      try{
        skEncoded = btoa(unescape(encodeURIComponent(String(item.sessionKey || ''))))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
      }catch(_){}
      const skRaw = String(item.sessionKey || '');
      const dateFromKey = (skRaw.split('|')[0] || '').trim();
      const reviewDay = portalWeekdayLongFromSessionDateKey(item.sessionKey) || String(DEMO_VIEW_DAY || '').trim();
      const parts = [];
      if(skEncoded) parts.push('sk=' + encodeURIComponent(skEncoded));
      parts.push('sessionKey=' + encodeURIComponent(String(item.sessionKey || '')));
      const nmCx = encodeURIComponent(String(item.name || '').trim());
      if(nmCx) parts.push('clientName=' + nmCx);
      parts.push('origin=' + encodeURIComponent(portalGetReviewFlowOrigin()));
      parts.push('rp=' + encodeURIComponent(String(location.pathname || 'staff_dashboard.html')));
      if(reviewDay) parts.push('rday=' + encodeURIComponent(reviewDay));
      if(/^\d{4}-\d{2}-\d{2}$/.test(dateFromKey)){
        parts.push('date=' + encodeURIComponent(dateFromKey));
        parts.push('rd=' + encodeURIComponent(dateFromKey));
      }
      const svcCx = portalFeedbackFormServiceLabel(item.activity)
        || portalFeedbackFormServiceLabel(item && item.__portalBaseSession && item.__portalBaseSession.activity);
      if(svcCx) parts.push('service=' + encodeURIComponent(String(svcCx).trim()));
      const cidCx = String(item.clientId || '').trim();
      if(cidCx && cidCx !== 'available' && cidCx !== 'closed') parts.push('clientId=' + encodeURIComponent(cidCx));
      const tlabCx = String(item.time || '').trim();
      if(tlabCx) parts.push('time=' + encodeURIComponent(tlabCx));
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      return portalAppendFromPortalQuery(base.split('#')[0] + sep + parts.join('&'));
    }
    function portalOpenPendingFeedbackReviewFlow(opts){
      const openFirst = !opts || opts.openFirstClient !== false;
      const stats = collectSessionReviewPendingStats();
      const first = stats.pending[0];
      if(!first) return;
      const dayFromKey = portalWeekdayLongFromSessionDateKey(first.sessionKey);
      const skDate = String(first.sessionKey || '').split('|')[0].trim();
      const dateOpt = /^\d{4}-\d{2}-\d{2}$/.test(skDate) ? { portalReviewDate: skDate } : null;
      if(dayFromKey){
        if(dateOpt) portalOpenWeekDayReviewFlow(dayFromKey, dateOpt);
        else portalOpenWeekDayReviewFlow(dayFromKey);
      }else{
        closeSheet();
        closeClientGeneralSheet();
        hydrateSessionReviewMapFromStorage();
        portalSyncTodaySectionDisplay();
        if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
        (function(){
          if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
        })();
        renderHeader();
        renderToday();
        renderMiniCounts();
        renderLists();
        document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      if(openFirst){
        openClient(first);
        requestAnimationFrame(function(){
          const key = String(first.sessionKey || '');
          if(!key) return;
          const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const el = document.querySelector('.session-card[data-session-key="' + esc + '"]');
          if(el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }else{
        document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    window.portalOpenPendingFeedbackReviewFlow = portalOpenPendingFeedbackReviewFlow;
    const DEMO_DATE_BY_DAY = {
      Monday: new Date(2026, 5, 1),
      Tuesday: new Date(2026, 4, 27),
      Sunday: new Date(2026, 4, 25)
    };
    /** When the rota weekday matches today, use the real calendar date (accurate session times / headers). */
    function getViewAnchorCalendarDate(dayName){
      try{
        const lockIso = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '').trim();
        const locked = portalParseIsoDateLocal(lockIso);
        if(locked) return new Date(locked.getFullYear(), locked.getMonth(), locked.getDate());
      }catch(_){}
      const key = String(dayName || '').trim();
      const now = new Date();
      const todayKey = now.toLocaleDateString('en-GB', { weekday: 'long' });
      if(key === todayKey){
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      if(portalStaffIsDemoAccount()){
        const fixed = DEMO_DATE_BY_DAY[key];
        if(fixed){
          return new Date(fixed.getFullYear(), fixed.getMonth(), fixed.getDate());
        }
      }
      const weekCell = calendarDateForWeekListDay(key);
      if(weekCell) return weekCell;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    function getDemoDateLabel(dayName){
      const d = getViewAnchorCalendarDate(dayName);
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    function dayOrdinalSuffix(n){
      const j = n % 10;
      const k = n % 100;
      if(k >= 11 && k <= 13) return 'th';
      if(j === 1) return 'st';
      if(j === 2) return 'nd';
      if(j === 3) return 'rd';
      return 'th';
    }
    function getDemoDateTopbar(dayName){
      const d = getViewAnchorCalendarDate(dayName);
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const num = portalFormatTopbarDateNumericFromDate(d);
      return weekday + '\n' + num;
    }
    /** True when an explicit review calendar date is locked and it is not the device’s current local calendar day. */
    function portalStaffIsHistoricalReviewDayMode(){
      try{
        const todayKey = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
        const lockIso = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '').trim();
        const locked = portalParseIsoDateLocal(lockIso);
        if(locked){
          const now = new Date();
          const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const l0 = new Date(locked.getFullYear(), locked.getMonth(), locked.getDate()).getTime();
          if(l0 !== t0) return true;
        }
        const lockDay = String(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DAY_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DAY_URL_LOCK) || '').trim();
        if(lockDay && PORTAL_WEEK_REVIEW_VALID_DAYS.has(lockDay) && lockDay !== todayKey) return true;
        const origin = (typeof portalGetReviewFlowOrigin === 'function') ? portalGetReviewFlowOrigin() : 'dashboard';
        const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        if(origin === 'term' && viewDay && viewDay !== todayKey) return true;
        return false;
      }catch(_){ return false; }
    }
    /** Calendar day for the Today block heading (review URL date lock, else week anchor from DEMO_VIEW_DAY). */
    function portalResolveTodaySectionCalendarDate(){
      try{
        const lockIso = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '').trim();
        const locked = portalParseIsoDateLocal(lockIso);
        if(locked && !isNaN(locked.getTime())) return locked;
        const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : (typeof window !== 'undefined' && window.DEMO_VIEW_DAY) || '').trim() || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
        if(!viewDay) return null;
        const d = getViewAnchorCalendarDate(viewDay);
        return (d && !isNaN(d.getTime())) ? d : null;
      }catch(_){ return null; }
    }
    function portalFormatTodaySectionCompactDate(d){
      const wk = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const num = typeof portalFormatPortalDateDdMmYyyy === 'function'
        ? portalFormatPortalDateDdMmYyyy(d)
        : '';
      return num ? `${wk} ${num}` : wk;
    }
    function portalFormatHistoricalReviewDayHeading(){
      return portalTodaySectionTitleText();
    }
    function portalExitHistoricalReviewToLiveTodayMode(forceExit){
      if(!forceExit && !portalStaffIsHistoricalReviewDayMode()) return false;
      if(typeof closeSheet === 'function') closeSheet();
      if(typeof closeClientGeneralSheet === 'function') closeClientGeneralSheet();
      portalClearReviewDateUrlLock();
      __PORTAL_REVIEW_DAY_URL_LOCK = '';
      try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_){}
      try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = false; }catch(_){}
      portalSetReviewFlowOrigin('dashboard');
      try{ portalSyncReviewNavigationQueryToHistory(); }catch(_){}
      const todayWord = typeof portalWeekdayLongEnGB === 'function' ? portalWeekdayLongEnGB(new Date()) : 'Monday';
      DEMO_VIEW_DAY = todayWord;
      try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
      if(typeof hydrateSessionReviewMapFromStorage === 'function') hydrateSessionReviewMapFromStorage();
      const liveHdrExit = typeof portalLiveHeaderWeekday === 'function' ? portalLiveHeaderWeekday() : DEMO_VIEW_DAY;
      if(typeof window.dashboardData !== 'undefined' && window.dashboardData){
        const dd = window.dashboardData;
        dd.dateLabel = typeof getDemoDateLabel === 'function' ? getDemoDateLabel(liveHdrExit) : dd.dateLabel;
        dd.dateTopbar = typeof portalFormatTopbarDateFromDate === 'function' ? portalFormatTopbarDateFromDate(new Date()) : dd.dateTopbar;
        if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
        else dd.today = typeof buildSelectedDayViewFromLauraModel === 'function' ? buildSelectedDayViewFromLauraModel() : dd.today;
        if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
        const staffIdEx = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        if(staffIdEx && typeof buildWeekRows === 'function') dd.week = buildWeekRows(staffIdEx);
      }
      if(typeof renderHeader === 'function') renderHeader();
      if(typeof renderToday === 'function') renderToday();
      if(typeof renderMiniCounts === 'function') renderMiniCounts();
      if(typeof renderLists === 'function') renderLists();
      return true;
    }
    function portalTodaySectionTitleText(){
      const custom = dashboardData && dashboardData.portalTodaySectionHeading;
      if(custom) return String(custom);
      const d = portalResolveTodaySectionCalendarDate();
      if(!d) return 'TODAY';
      const num = typeof portalFormatPortalDateDdMmYyyy === 'function'
        ? portalFormatPortalDateDdMmYyyy(d)
        : '';
      const now = new Date();
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if(d0 === t0) return num ? ('TODAY ' + num) : 'TODAY';
      return portalFormatTodaySectionCompactDate(d);
    }

    /** Title for Next session sheet: calendar date of the next day (after today) when this staff has rota sessions. */
    function formatNextSessionSheetTitle(){
      const raw = window.dashboardData && window.dashboardData.nextSessionCalendarDate;
      if(!raw) return 'No upcoming sessions';
      const dt = raw instanceof Date ? raw : new Date(raw);
      const w = dt.toLocaleDateString('en-GB', { weekday: 'long' });
      const num = typeof portalFormatPortalDateDdMmYyyy === 'function' ? portalFormatPortalDateDdMmYyyy(dt) : '';
      return num ? `${w} ${num}` : w;
    }

    /* Sessions + clients: staff_dashboard_spreadsheet_bundle.js (export of machine-readable xlsx). */
    /* Today pool column: roster `service` (Teaching Pool, Lane (SE), …) or tier→label; programme type not shown in client service row. */

    function normalizeTimeForSort(t){
      return t.replace(':', '');
    }

    function meridiemFromHHmm(t){
      const bits = String(t).split(':');
      const h = Number(bits[0]);
      if(Number.isNaN(h)) return 'pm';
      return h >= 12 ? 'pm' : 'am';
    }
    function formatSlotRange(start, end){
      function part(t){
        const bits = String(t).split(':');
        let h = Number(bits[0]);
        const m = Number(bits[1] || 0);
        if(h >= 13 && h <= 23) h -= 12;
        if(h === 0) h = 12;
        if(m === 0) return String(h);
        if(m === 30) return h + '.30';
        return h + '.' + String(m).padStart(2, '0');
      }
      return part(start) + ' to ' + part(end);
    }
    function stripMeridiemFromSlotLabel(str){
      let s = String(str).trim();
      s = s.replace(/\s+(a\.\s*m\.|p\.\s*m\.)\s*/gi, ' ');
      s = s.replace(/\s+(am|pm)\b/gi, '');
      return s.replace(/\s{2,}/g, ' ').trim();
    }
    /** Tomorrow list: show client start only, e.g. "9 to 10 am" → "9 am"; optional HH:mm via row.start */
    function formatHHmmAsStartLabel(hm){
      const bits = String(hm).split(':');
      let h = Number(bits[0]);
      const m = Number(bits[1] || 0);
      if(Number.isNaN(h)) return '—';
      const mer = h >= 12 ? 'pm' : 'am';
      if(h > 12) h -= 12;
      if(h === 0) h = 12;
      let part;
      if(m === 0) part = String(h);
      else if(m === 30) part = h + '.30';
      else part = h + '.' + String(m).padStart(2, '0');
      return `${part} ${mer}`;
    }
    function formatTomorrowListStartTime(timeStr){
      const raw = String(timeStr || '').trim();
      if(!raw || raw === '—') return '—';
      const m = raw.match(/^(.*?)\s+(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\s*$/i);
      let core = raw;
      let mer = 'am';
      if(m){
        core = m[1].trim();
        const tok = m[2].toLowerCase().replace(/\s/g, '');
        mer = tok.startsWith('p') ? 'pm' : 'am';
      }
      const toSplit = core.split(/\s+to\s+/i);
      const startPart = (toSplit[0] || '').trim() || core;
      return `${startPart} ${mer}`;
    }

    function buildSessionEndMs(dayName, endHm){
      const base = getViewAnchorCalendarDate(dayName);
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      const parts = String(endHm).split(':');
      const H = Number(parts[0]);
      const M = Number(parts[1] || 0);
      d.setHours(H, M, 0, 0);
      return d.getTime();
    }
    /** Shift end on an actual calendar date (TERM grid / per-day review keys). */
    function buildSessionEndMsForCalendarDate(y, monthIndex, dayOfMonth, endHm){
      const d = new Date(y, monthIndex, dayOfMonth);
      const parts = String(endHm || '').split(':');
      const H = Number(parts[0] || 0);
      const M = Number(parts[1] || 0);
      d.setHours(H, M, 0, 0);
      return d.getTime();
    }
    function buildSessionStartMsForCalendarDate(y, monthIndex, dayOfMonth, startHm){
      const d = new Date(y, monthIndex, dayOfMonth);
      const parts = String(startHm || '').split(':');
      const H = Number(parts[0] || 0);
      const M = Number(parts[1] || 0);
      d.setHours(H, M, 0, 0);
      return d.getTime();
    }
    /** Session start/end on the row's calendar day (sessionDateKey), not DEMO_VIEW_DAY alone — fixes next-session preview orange. */
    function portalSessionRowTimestamps(sessionDateIso, startHm, endHm, fallbackAnchor){
      const iso = String(sessionDateIso || '').trim().slice(0, 10);
      let d = null;
      if(/^\d{4}-\d{2}-\d{2}$/.test(iso) && typeof portalParseIsoDateLocal === 'function'){
        d = portalParseIsoDateLocal(iso);
      }
      if((!d || isNaN(d.getTime())) && fallbackAnchor && !isNaN(fallbackAnchor.getTime())) d = fallbackAnchor;
      if(!d || isNaN(d.getTime())){
        const vw = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        return {
          sessionStartTs: buildSessionEndMs(vw, startHm),
          sessionEndTs: buildSessionEndMs(vw, endHm)
        };
      }
      const y = d.getFullYear();
      const mo = d.getMonth();
      const da = d.getDate();
      return {
        sessionStartTs: buildSessionStartMsForCalendarDate(y, mo, da, startHm),
        sessionEndTs: buildSessionEndMsForCalendarDate(y, mo, da, endHm)
      };
    }

    function getSessionReviewRecord(item){
      if(!item || !item.sessionKey) return null;
      return sessionReviewMapMemory[item.sessionKey] || null;
    }
    /** Export bundle overrides stale localStorage when support vs instructor units differ. */
    function getEffectiveSessionReviewRecord(item){
      if(!item || !item.sessionKey){
        return { feedbackDone: false, incident: false, absent: false, cancelled: false };
      }
      const iso = portalSessionDateIsoFromItemSessionKey(item);
      const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      if(iso && staffId && typeof portalTermFeedbackAssumeComplete === 'function'
        && portalTermFeedbackAssumeComplete(iso, staffId)){
        return { feedbackDone: true, incident: false, absent: false, cancelled: false };
      }
      const baseEarly = portalReviewSessionForItem(item);
      if(baseEarly && iso && !portalTodayCardUsesReplaceOverride(item)
        && typeof portalRosterSessionSupersededByMakeupReplace === 'function'
        && portalRosterSessionSupersededByMakeupReplace(baseEarly, iso)){
        return { feedbackDone: false, incident: false, absent: false, cancelled: true };
      }
      if(baseEarly && iso && typeof portalRosterSessionFeedbackResolvedFlags === 'function' && !portalTodayCardUsesReplaceOverride(item)){
        const exEarly = portalRosterSessionFeedbackResolvedFlags(baseEarly, iso, staffId);
        if(exEarly && exEarly.absent){
          return { feedbackDone: false, incident: false, absent: true, cancelled: false };
        }
        if(exEarly && exEarly.cancelled){
          return { feedbackDone: false, incident: false, absent: false, cancelled: true };
        }
        if(exEarly && exEarly.feedbackDone){
          const memEarly = getSessionReviewRecord(item) || {};
          return {
            feedbackDone: true,
            incident: !!(exEarly.incident || memEarly.incident),
            absent: false,
            cancelled: false
          };
        }
      }
      if(item.noSessionFeedbackRequired){
        const pillEarly = String(item.portalOverrideAlertPill || '').trim().toUpperCase();
        if(pillEarly === 'ABSENT'){
          return { feedbackDone: false, incident: !!(getSessionReviewRecord(item) || {}).incident, absent: true, cancelled: false };
        }
        if(pillEarly === 'CANCELLED'){
          return { feedbackDone: false, incident: !!(getSessionReviewRecord(item) || {}).incident, absent: false, cancelled: true };
        }
      }
      if(iso && portalReviewAbsentResolvedForItem(item, iso)){
        return {
          feedbackDone: false,
          incident: !!(getSessionReviewRecord(item) || {}).incident,
          absent: true,
          cancelled: false
        };
      }
      if(iso && portalReviewFeedbackResolvedForItem(item, iso)){
        const memFb = getSessionReviewRecord(item) || {};
        return {
          feedbackDone: true,
          incident: !!memFb.incident,
          absent: false,
          cancelled: false
        };
      }
      if(iso && portalIsServerTruthFeedbackDay(iso)){
        const serverRec = portalServerTruthReviewRecordForItem(item, iso);
        if(serverRec.absent || serverRec.cancelled) return serverRec;
        const dayWordSrv = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
        const baseSrv = portalReviewSessionForItem(item);
        if(baseSrv && typeof portalGetMergedSessionReviewRecordForRoster === 'function'){
          const memSrv = portalGetMergedSessionReviewRecordForRoster(baseSrv, dayWordSrv, iso);
          if(memSrv.absent || memSrv.cancelled){
            return {
              feedbackDone: false,
              incident: !!(serverRec.incident || memSrv.incident),
              absent: !!(serverRec.absent || memSrv.absent),
              cancelled: !!(serverRec.cancelled || memSrv.cancelled)
            };
          }
        }
        return serverRec;
      }
      const dayWord = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : '';
      const baseS = portalReviewSessionForItem(item);
      let mem = getSessionReviewRecord(item) || { feedbackDone: false, incident: false, absent: false, cancelled: false };
      if(baseS && iso && typeof portalGetMergedSessionReviewRecordForRoster === 'function'){
        mem = portalGetMergedSessionReviewRecordForRoster(baseS, dayWord, iso);
      }
      if(!iso || !staffId) return mem;
      if(baseS && typeof portalRosterSessionFeedbackResolvedFlags === 'function' && !portalTodayCardUsesReplaceOverride(item)){
        const ex = portalRosterSessionFeedbackResolvedFlags(baseS, iso, staffId);
        if(ex){
          return {
            feedbackDone: ex.feedbackDone === false ? !!mem.feedbackDone : !!(ex.feedbackDone || mem.feedbackDone),
            incident: !!(ex.incident || mem.incident),
            absent: !!(ex.absent || mem.absent),
            cancelled: !!(ex.cancelled || mem.cancelled)
          };
        }
      }
      if(item.noSessionFeedbackRequired){
        const pill = String(item.portalOverrideAlertPill || '').trim().toUpperCase();
        return {
          feedbackDone: !!(mem.feedbackDone || (pill !== 'ABSENT' && pill !== 'CANCELLED')),
          incident: !!mem.incident,
          absent: !!(mem.absent || pill === 'ABSENT'),
          cancelled: !!(mem.cancelled || pill === 'CANCELLED')
        };
      }
      if(typeof portalRosterReviewStateFromStatusBundle !== 'function') return mem;
      const bundle = portalRosterReviewStateFromStatusBundle(portalReviewSessionForItem(item) || item.__portalBaseSession, iso, staffId);
      if(!bundle){
        if(typeof portalTermStaffDayExplicitlyForceComplete === 'function'
          && portalTermStaffDayExplicitlyForceComplete(iso, staffId)){
          return {
            feedbackDone: true,
            incident: !!mem.incident,
            absent: !!mem.absent,
            cancelled: !!mem.cancelled
          };
        }
        const floorIso = portalMachineRosterFeedbackFloorIso();
        if(iso >= floorIso && !portalStaffInGhostView()){
          if(portalIsServerTruthFeedbackDay(iso)){
            return portalServerTruthReviewRecordForItem(item, iso);
          }
          let feedbackDone = !!mem.feedbackDone;
          if(!feedbackDone && baseS){
            try{
              const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
              const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
              if(bridge && typeof bridge.sessionComplete === 'function'
                && bridge.sessionComplete(iso, staffId, baseS, notes, mem)){
                feedbackDone = true;
              }
            }catch(_bridgeNull){}
          }
          return portalApplyGrandfatheredSessionReviewComplete({
            feedbackDone: feedbackDone,
            incident: !!mem.incident,
            absent: !!mem.absent,
            cancelled: !!mem.cancelled
          }, iso, staffId);
        }
        return portalApplyGrandfatheredSessionReviewComplete(mem, iso, staffId);
      }
      const ghost = portalStaffInGhostView();
      let feedbackDone = bundle.feedbackDone === false
        ? !!mem.feedbackDone
        : !!(bundle.feedbackDone || (!ghost && mem.feedbackDone));
      if(!feedbackDone && baseS){
        try{
          const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
          const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
          if(bridge && typeof bridge.sessionComplete === 'function'
            && bridge.sessionComplete(iso, staffId, baseS, notes, mem)){
            feedbackDone = true;
          }
        }catch(_){}
      }
      return portalApplyGrandfatheredSessionReviewComplete({
        feedbackDone: feedbackDone,
        incident: !!(bundle.incident || mem.incident),
        absent: !!(bundle.absent || mem.absent),
        cancelled: !!(bundle.cancelled || mem.cancelled)
      }, iso, staffId);
    }
    function portalSessionDateIsoFromItemSessionKey(item){
      if(!item || !item.sessionKey) return null;
      const part = String(item.sessionKey).split('|')[0] || '';
      return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
    }
    function portalTrySyncSessionQuickMarkToServer(item, prev, next){
      try{
        const iso = portalSessionDateIsoFromItemSessionKey(item);
        if(!item || !item.sessionKey || !iso) return;
        const box = window.__PORTAL_SUPABASE__;
        const uid = box && box.session && box.session.user && box.session.user.id ? String(box.session.user.id).trim() : '';
        if(!box || !box.client || !uid) return;
        const sk = String(item.sessionKey || '').trim();
        const tasks = [];
        if(next.absent && !prev.absent){
          const dayWordSync = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
          const absentKeys = new Set([sk]);
          if(typeof portalCollectItemSessionReviewKeyAliases === 'function'){
            portalCollectItemSessionReviewKeyAliases(item, iso, dayWordSync).forEach(function(k){
              k = String(k || '').trim();
              if(k) absentKeys.add(k);
            });
          }
          absentKeys.forEach(function(markKey){
            tasks.push(
              import(PORTAL_SUPABASE_CLIENT_MODULE).then(function(mod){
                if(!mod.portalUpsertStaffSessionQuickMark) return;
                return mod.portalUpsertStaffSessionQuickMark(box.client, {
                  staff_user_id: uid,
                  portal_session_key: markKey,
                  session_date: iso,
                  mark_type: 'absent'
                });
              })
            );
          });
        }
        if(next.feedbackDone && !prev.feedbackDone){
          tasks.push(
            import(PORTAL_SUPABASE_CLIENT_MODULE).then(function(mod){
              if(!mod.portalUpsertStaffSessionQuickMark) return;
              return mod.portalUpsertStaffSessionQuickMark(box.client, {
                staff_user_id: uid,
                portal_session_key: sk,
                session_date: iso,
                mark_type: 'feedback_done'
              });
            })
          );
        }
        if(!tasks.length) return;
        Promise.all(tasks).catch(function(e){
          console.warn('[portal] quick mark server sync failed', e);
        });
      }catch(e){
        console.warn('[portal] quick mark server sync skipped', e);
      }
    }
    function mergeSessionReview(item, updater){
      if(!item || !item.sessionKey) return;
      const prev = sessionReviewMapMemory[item.sessionKey] || {
        feedbackDone: false,
        incident: false,
        absent: false,
        cancelled: false
      };
      const next = updater(prev);
      sessionReviewMapMemory[item.sessionKey] = next;
      sessionReviewActivityTs[item.sessionKey] = Date.now();
      persistSessionReviewMap();
      portalTrySyncSessionQuickMarkToServer(item, prev, next);
      if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
      if(next.absent && !prev.absent){
        if(typeof renderToday === 'function') renderToday();
      }
      if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid();
      if(typeof renderLists === 'function') renderLists();
    }

    function getLocalDateKey(){
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function getSessionReviewReminderClockTier(){
      const m = new Date().getHours() * 60 + new Date().getMinutes();
      if(m >= 23 * 60 + 30) return 3;
      if(m >= 21 * 60 + 30) return 2;
      if(m >= 19 * 60 + 30) return 1;
      return 0;
    }
    function loadSessionReviewReminderDayState(dayKey){
      try{
        const r = localStorage.getItem(SESSION_REVIEW_REMINDER_STORAGE + '_' + dayKey);
        if(!r) return { maxTierShown: 0 };
        const o = JSON.parse(r);
        const n = Number(o.maxTierShown);
        return { maxTierShown: Number.isFinite(n) && n >= 0 ? Math.min(3, Math.floor(n)) : 0 };
      }catch(e){
        return { maxTierShown: 0 };
      }
    }
    function saveSessionReviewReminderDayState(dayKey, state){
      try{
        localStorage.setItem(SESSION_REVIEW_REMINDER_STORAGE + '_' + dayKey, JSON.stringify({ maxTierShown: state.maxTierShown }));
      }catch(e){}
    }
    function collectSessionReviewPendingStats(){
      if(typeof portalStaffFeedbackPipelineReady === 'function' && !portalStaffFeedbackPipelineReady()){
        return { pending: [], eligible: 0, completed: 0, loading: true };
      }
      const today = dashboardData.today || [];
      const pending = [];
      let eligible = 0;
      for(let i = 0; i < today.length; i++){
        const item = today[i];
        if(!item || !item.sessionKey) continue;
        if(item.kind === 'closed' || item.kind === 'available') continue;
        if(item.noSessionFeedbackRequired) continue;
        if(!isSessionEndedForFeedback(item)) continue;
        eligible++;
        const r = getEffectiveSessionReviewRecord(item) || {};
        if(r.feedbackDone || r.absent || r.cancelled) continue;
        pending.push(item);
      }
      return {
        pending,
        eligible,
        completed: Math.max(0, eligible - pending.length)
      };
    }
