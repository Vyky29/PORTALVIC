    function portalStaffClientSessionsOnCalendarDate(isoYmd, weekdayLong, staffId, modelOverride){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      const w = String(weekdayLong || '').trim();
      if(!iso || !sid || !w) return false;
      const model = Array.isArray(modelOverride)
        ? modelOverride
        : ((typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : []);
      return model.some(function(s){
        if(String(s.staffId || '').toLowerCase() !== sid) return false;
        if(!portalSessionClientActiveOnDate(s, iso)) return false;
        return typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'
          && portalSessionSpreadsheetRowMatchesCalendarDate(s, iso, w);
      });
    }
    /** Timetable shift today but merged Supabase roster dropped dated rows — restore from shipped bundle once. */
    function portalStaffMergeMachineSessionsIfShiftWithoutTodayCards(staffId){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sid) return false;
      const liveToday = typeof portalIsViewingLiveCalendarToday === 'function' && portalIsViewingLiveCalendarToday();
      if(!liveToday) return false;
      const anchor = typeof portalResolveTodaySectionCalendarDate === 'function'
        ? portalResolveTodaySectionCalendarDate()
        : null;
      if(!anchor || isNaN(anchor.getTime())) return false;
      const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(anchor) : '';
      const dayWord = anchor.toLocaleDateString('en-GB', { weekday: 'long' });
      if(!iso || !dayWord) return false;
      if(typeof portalStaffClientSessionsOnCalendarDate === 'function'
        && portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid)) return false;
      if(typeof portalStaffLiveTodayHasScheduledShift !== 'function' || !portalStaffLiveTodayHasScheduledShift(sid, anchor)) return false;
      if(typeof portalStaffMachineBundleFallbackAllowed === 'function'
        && !portalStaffMachineBundleFallbackAllowed(sid, iso)) return false;
      try{
        if(!window.__PORTAL_STAFF_MACHINE_TODAY_MERGE_TRIED__) window.__PORTAL_STAFF_MACHINE_TODAY_MERGE_TRIED__ = Object.create(null);
        const mergeKey = sid + '|' + iso;
        if(window.__PORTAL_STAFF_MACHINE_TODAY_MERGE_TRIED__[mergeKey]) return false;
        window.__PORTAL_STAFF_MACHINE_TODAY_MERGE_TRIED__[mergeKey] = true;
      }catch(_){ return false; }
      if(typeof window.portalBootstrapFromMachineFallback !== 'function') return false;
      const fb = window.portalBootstrapFromMachineFallback(sid);
      if(!fb || !fb.boot || !Array.isArray(fb.boot.sessionsModel) || !fb.boot.sessionsModel.length) return false;
      const onIso = fb.boot.sessionsModel.some(function(s){
        return String(s.staffId || '').toLowerCase() === sid
          && normaliseIsoDate(s.session_date || s.sessionDate) === iso;
      });
      if(!onIso) return false;
      sessionsModel = fb.boot.sessionsModel;
      if(fb.boot.clientNotesById){
        clientNotesById = Object.assign({}, clientNotesById || {}, fb.boot.clientNotesById);
      }
      if(typeof portalApplyClientsInfoToNotes === 'function') portalApplyClientsInfoToNotes();
      if(typeof portalStaffUpdateSessionsModelGuard === 'function') portalStaffUpdateSessionsModelGuard(sid, sessionsModel);
      return true;
    }
    try{ window.portalStaffMergeMachineSessionsIfShiftWithoutTodayCards = portalStaffMergeMachineSessionsIfShiftWithoutTodayCards; }catch(_){}
    /** Any worker: model/timetable says today should have cards but the Today list is still empty (rehydrate race). */
    function portalStaffTodayScheduleCardsStillExpected(staffId, modelOverride){
      const sid = String(staffId || (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '') || (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '') || '').trim().toLowerCase();
      if(!sid) return false;
      if(typeof portalStaffTodayBlockIsOff === 'function' && portalStaffTodayBlockIsOff(sid)) return false;
      const anchor = typeof portalResolveTodaySectionCalendarDate === 'function'
        ? portalResolveTodaySectionCalendarDate()
        : null;
      if(!anchor || isNaN(anchor.getTime())) return false;
      const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(anchor) : '';
      const dayWord = anchor.toLocaleDateString('en-GB', { weekday: 'long' });
      if(!iso || !dayWord) return false;
      if(typeof portalStaffClientSessionsOnCalendarDate === 'function'
        && portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid, modelOverride)){
        return true;
      }
      if(!modelOverride){
        try{
          const guard = typeof window !== 'undefined' ? window.__PORTAL_STAFF_SESSIONS_GUARD_MODEL__ : null;
          if(Array.isArray(guard) && guard.length
            && typeof portalStaffClientSessionsOnCalendarDate === 'function'
            && portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid, guard)){
            return true;
          }
        }catch(_){}
      }
      const model = Array.isArray(modelOverride)
        ? modelOverride
        : ((typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : []);
      if(!model.some(function(s){ return String(s.staffId || '').toLowerCase() === sid; })) return false;
      /* Timetable-only shift hints apply to live calendar today — not week/term review days. */
      const liveToday = typeof portalIsViewingLiveCalendarToday === 'function' && portalIsViewingLiveCalendarToday();
      if(!liveToday) return false;
      var rosterReady = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_ROSTER_HYDRATED__);
      var overridesReady = !!(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__);
      var settled = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__);
      if(rosterReady && overridesReady && settled){
        if(typeof portalStaffClientSessionsOnCalendarDate === 'function'
          && portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid, modelOverride)){
          return false;
        }
        if(typeof portalStaffMachineBundleFallbackAllowed === 'function'
          && portalStaffMachineBundleFallbackAllowed(sid, iso)
          && typeof portalStaffMergeMachineSessionsIfShiftWithoutTodayCards === 'function'){
          portalStaffMergeMachineSessionsIfShiftWithoutTodayCards(sid);
          if(portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid, modelOverride)){
            return false;
          }
        }
        return false;
      }
      if(typeof portalStaffLiveTodayHasScheduledShift === 'function' && portalStaffLiveTodayHasScheduledShift(sid, anchor)) return true;
      if(typeof portalStaffHasShiftOnCalendarDate === 'function' && portalStaffHasShiftOnCalendarDate(iso, sid) === true){
        if(!portalStaffSummerShiftDateWithoutRosterRow(iso, sid)) return true;
      }
      return false;
    }
    function portalStaffSessionsModelWouldDropToday(staffId, priorModel, nextModel){
      return !!(Array.isArray(priorModel) && priorModel.length
        && Array.isArray(nextModel)
        && typeof portalStaffTodayScheduleCardsStillExpected === 'function'
        && portalStaffTodayScheduleCardsStillExpected(staffId, priorModel)
        && !portalStaffTodayScheduleCardsStillExpected(staffId, nextModel));
    }
    function portalStaffUpdateSessionsModelGuard(staffId, model){
      const sid = String(staffId || (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '') || '').trim().toLowerCase();
      if(!sid || !Array.isArray(model) || !model.length) return;
      if(typeof portalStaffTodayScheduleCardsStillExpected === 'function'
        && portalStaffTodayScheduleCardsStillExpected(sid, model)){
        try{ window.__PORTAL_STAFF_SESSIONS_GUARD_MODEL__ = model.slice(); }catch(_){}
      }
    }
    try{ window.portalStaffSessionsModelWouldDropToday = portalStaffSessionsModelWouldDropToday; }catch(_){}
    try{ window.portalStaffUpdateSessionsModelGuard = portalStaffUpdateSessionsModelGuard; }catch(_){}
    function portalTodayRowsCalendarIso(rows){
      if(!Array.isArray(rows) || !rows.length) return '';
      for(var i = 0; i < rows.length; i++){
        var item = rows[i];
        if(!item || !item.sessionKey) continue;
        var iso = String(item.sessionKey).split('|')[0].trim().slice(0, 10);
        if(/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      }
      return '';
    }
    function portalStaffRebuildTodayRowsFromCandidates(modelOverride){
      if(typeof buildSelectedDayViewFromLauraModel !== 'function') return [];
      var selectedIso = '';
      try{
        var anchor = typeof portalResolveTodaySectionCalendarDate === 'function'
          ? portalResolveTodaySectionCalendarDate()
          : null;
        if(anchor && typeof portalIsoYmdFromDate === 'function'){
          selectedIso = portalIsoYmdFromDate(anchor);
        }
      }catch(_){}
      if(selectedIso && typeof portalBuildTodayRowsForIso === 'function'){
        try{
          var pinnedRows = portalBuildTodayRowsForIso(selectedIso) || [];
          if(pinnedRows.length) return pinnedRows;
        }catch(_){}
      }
      var candidates = [];
      if(Array.isArray(modelOverride) && modelOverride.length) candidates.push(modelOverride);
      try{
        var guard = window.__PORTAL_STAFF_SESSIONS_GUARD_MODEL__;
        if(Array.isArray(guard) && guard.length) candidates.push(guard);
      }catch(_){}
      if(typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel) && sessionsModel.length) candidates.push(sessionsModel);
      var seen = Object.create(null);
      var i;
      for(i = 0; i < candidates.length; i++){
        var key = String(candidates[i].length) + ':' + String(candidates[i][0] && candidates[i][0].staffId || '');
        if(seen[key]) continue;
        seen[key] = true;
        try{
          var rebuilt = buildSelectedDayViewFromLauraModel(candidates[i]) || [];
          if(rebuilt.length) return rebuilt;
        }catch(_){}
      }
      return [];
    }
    try{ window.portalStaffRebuildTodayRowsFromCandidates = portalStaffRebuildTodayRowsFromCandidates; }catch(_){}
    try{ window.portalStaffTodayScheduleCardsStillExpected = portalStaffTodayScheduleCardsStillExpected; }catch(_){}
    /** Pool shift dates from Staff Timetable (1 Jun+); null when map not loaded. */
    function portalTermStaffShiftDatesFor(staffId){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      if(!t || !Object.prototype.hasOwnProperty.call(t, 'termStaffShiftDatesByProfileKey')) return null;
      const map = t.termStaffShiftDatesByProfileKey;
      if(!map || typeof map !== 'object') return null;
      const keys = typeof portalTermStaffProfileLookupKeys === 'function'
        ? portalTermStaffProfileLookupKeys(staffId)
        : [String(staffId || '').trim().toLowerCase()];
      let foundAny = false;
      const seen = Object.create(null);
      const out = [];
      keys.forEach(function(k){
        if(!Object.prototype.hasOwnProperty.call(map, k)) return;
        foundAny = true;
        const raw = map[k];
        if(!Array.isArray(raw)) return;
        raw.forEach(function(d){
          const iso = String(d || '').trim().slice(0, 10);
          if(iso && !seen[iso]){ seen[iso] = true; out.push(iso); }
        });
      });
      if(!foundAny) return [];
      return out.sort();
    }
    function portalStaffHasShiftOnCalendarDate(isoYmd, staffId){
      const dates = portalTermStaffShiftDatesFor(staffId);
      if(dates === null) return null;
      const iso = normaliseIsoDate(isoYmd);
      return !!(iso && dates.indexOf(iso) >= 0);
    }
    /** Worked day for term colours: clients that day, export done, or dated roster snap (not pool-only). */
    function portalStaffRosterAppliesOnCalendarDate(isoYmd, weekdayLong, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      const w = String(weekdayLong || '').trim();
      if(!iso || !sid || !w) return true;
      if(typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
        && portalStaffHasInstructorCoverOnCalendarDate(iso, sid)) return true;
      if(portalTermStaffExtraCalendarDates(sid).indexOf(iso) >= 0) return true;
      if(portalTermDateForcedComplete(iso, sid)) return true;
      if(portalTermStaffOffWeekdayOnDate(iso, sid)) return false;
      if(portalCalendarIsoUsesSummerDatedRosterOnly(iso)){
        const onShift = portalStaffHasShiftOnCalendarDate(iso, sid);
        if(onShift !== null) return onShift;
      }
      if(portalStaffHasDatedRowsForIso(iso, sid)) return true;
      if(portalStaffClientSessionsOnCalendarDate(iso, w, sid)) return true;
      const snapFloor = portalCalendarIsoUsesSummerDatedRosterOnly(iso) ? portalTermSummerRosterFromIso() : '';
      const hasSnaps = portalStaffHasDatedWeekdaySnapshots(sid, w, snapFloor);
      if(!hasSnaps) return true;
      const anchor = new Date(iso + 'T12:00:00');
      const model = (typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : [];
      if(!!portalBestStaffRosterIsoForWeekday(model, sid, w, anchor)) return true;
      const worked = Array.isArray(dashboardData.termWorkedWeekdays)
        ? dashboardData.termWorkedWeekdays.map(Number)
        : [];
      const wd = anchor.getDay();
      return worked.indexOf(wd) >= 0;
    }
    /** Catch-up / extra term days use exact YYYY-MM-DD roster rows (not nearest-weekday snap). */
    function portalStaffUsesExactRosterIsoOnDate(isoYmd, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!iso || !sid) return false;
      if(typeof portalTermIsCatchUpFeedbackDate === 'function' && portalTermIsCatchUpFeedbackDate(iso, sid)) return true;
      if(typeof portalTermStaffExtraCalendarDates === 'function' && portalTermStaffExtraCalendarDates(sid).indexOf(iso) >= 0) return true;
      return false;
    }
    /** Match dated roster snapshot when calendar day has no rows (same rule as day sheet). */
    function portalStaffRosterMatchIsoForCalendar(isoYmd, weekdayLong, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      const w = String(weekdayLong || '').trim();
      if(!iso || !sid || !w) return iso;
      if(portalStaffUsesExactRosterIsoOnDate(iso, sid)) return iso;
      if(portalCalendarIsoUsesSummerDatedRosterOnly(iso)) return iso;
      if(portalStaffHasDatedRowsForIso(iso, sid)) return iso;
      const snapFloor = portalCalendarIsoUsesSummerDatedRosterOnly(iso) ? portalTermSummerRosterFromIso() : '';
      if(portalStaffHasDatedWeekdaySnapshots(sid, w, snapFloor)){
        const anchor = new Date(iso + 'T12:00:00');
        const model = (typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : [];
        return portalBestStaffRosterIsoForWeekday(model, sid, w, anchor) || '';
      }
      return iso;
    }
    function portalClientFirstSessionDateIso(clientKey){
      const P = window.PortalParticipantsSheet;
      if(P && typeof P.clientFirstSessionDateIso === 'function'){
        const fromRoster = P.clientFirstSessionDateIso(clientKey, P.buildContext ? P.buildContext() : undefined);
        if(fromRoster) return fromRoster;
      }
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termClientFirstSessionDate;
      if(!map || typeof map !== 'object') return '';
      const k = String(clientKey || '').trim().toLowerCase();
      return String(map[k] || '').trim().slice(0, 10);
    }
    function portalSessionClientActiveOnDate(s, isoYmd){
      const iso = normaliseIsoDate(isoYmd);
      if(!iso) return true;
      const cid = String(s && s.clientId || '').trim().toLowerCase();
      const first = portalClientFirstSessionDateIso(cid);
      if(first && iso < first) return false;
      return true;
    }
    function portalStaffSessionServiceActiveOnDate(s, isoYmd, staffId){
      const ptd = window.PortalTermCalendarDashboard;
      if(ptd && typeof ptd.staffSessionServiceActiveOnDate === 'function'){
        const sid = String(staffId != null ? staffId : (s && s.staffId) || '').trim().toLowerCase();
        return !!ptd.staffSessionServiceActiveOnDate(sid, s, isoYmd);
      }
      return true;
    }
    /** Nearest roster YYYY-MM-DD for this staff on a weekday (Summer term dated rows). */
    function portalBestStaffRosterIsoForWeekday(model, staffId, weekdayLong, anchorDate){
      const sid = String(staffId || '').trim().toLowerCase();
      const w = String(weekdayLong || '').trim();
      if(!sid || !w || !Array.isArray(model)) return '';
      const anchorMs = anchorDate instanceof Date && !isNaN(anchorDate.getTime()) ? anchorDate.getTime() : Date.now();
      const seen = Object.create(null);
      const isos = [];
      model.forEach(function(s){
        if(String(s.staffId || '').toLowerCase() !== sid) return;
        if(String(s.day || '').trim() !== w) return;
        const ri = normaliseIsoDate(s.session_date || s.sessionDate);
        if(!ri || seen[ri]) return;
        seen[ri] = true;
        isos.push(ri);
      });
      if(!isos.length) return '';
      const anchorIso = typeof portalIsoYmdFromDate === 'function'
        ? portalIsoYmdFromDate(anchorDate)
        : '';
      let best = '';
      let bestDiff = Infinity;
      const summerFloor = portalTermSummerRosterFromIso();
      const summerOnly = portalCalendarIsoUsesSummerDatedRosterOnly(anchorIso);
      isos.forEach(function(ri){
        if(anchorIso && String(ri) > anchorIso) return;
        if(summerOnly && summerFloor && String(ri) < summerFloor) return;
        const p = String(ri).split('-');
        const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        if(isNaN(d.getTime())) return;
        const diff = Math.abs(d.getTime() - anchorMs);
        if(diff < bestDiff){ bestDiff = diff; best = ri; }
      });
      return best;
    }
    /** Roster row vs calendar day: dated rows match YYYY-MM-DD; undated rows match weekday (en-GB long). */
    function portalSessionSpreadsheetRowMatchesCalendarDate(s, isoYmd, weekdayLong){
      if(!s) return false;
      if(!portalSessionClientActiveOnDate(s, isoYmd)) return false;
      if(!portalStaffSessionServiceActiveOnDate(s, isoYmd, s.staffId)) return false;
      const iso = normaliseIsoDate(isoYmd);
      const rowIso = normaliseIsoDate(s.session_date || s.sessionDate);
      const sid = String(s.staffId || '').trim().toLowerCase();
      const w = String(weekdayLong || '').trim();
      if(rowIso){
        if(portalCalendarIsoUsesSummerDatedRosterOnly(iso)) return rowIso === iso;
        if(portalStaffUsesExactRosterIsoOnDate(iso, sid)) return rowIso === iso;
        const matchIso = portalStaffRosterMatchIsoForCalendar(iso, w, sid);
        return !!(iso && matchIso && rowIso === matchIso);
      }
      if(portalStaffHasDatedRowsForIso(iso, sid)) return false;
      const snapFloor = portalCalendarIsoUsesSummerDatedRosterOnly(iso) ? portalTermSummerRosterFromIso() : '';
      if(portalStaffHasDatedWeekdaySnapshots(sid, w, snapFloor)) return false;
      return w === String(s.day || '').trim();
    }
    function portalScheduleOverrideFetchIsoList(opts){
      opts = opts || {};
      const out = [];
      const add = function(iso){
        const x = String(iso || '').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(x)) return;
        if(out.indexOf(x) < 0) out.push(x);
      };
      try{
        const now = new Date();
        for(let i = 0; i <= 14; i++){
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          add(portalIsoYmdFromDate(d));
        }
      }catch(_){}
      try{
        const sid = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        if(sid && typeof portalStaffInstructorCoverCalendarIsoKeys === 'function'){
          const now = new Date();
          const from = portalIsoYmdFromDate(now);
          const toD = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 120);
          const to = portalIsoYmdFromDate(toD);
          portalStaffInstructorCoverCalendarIsoKeys(sid, from, to).forEach(add);
        }
      }catch(_){}
      try{
        const sid = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        if(sid && typeof portalTermStaffExtraCalendarDates === 'function'){
          portalTermStaffExtraCalendarDates(sid).forEach(add);
        }
      }catch(_){}
      try{
        const vd = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        if(vd && typeof getViewAnchorCalendarDate === 'function'){
          const a = getViewAnchorCalendarDate(vd);
          if(a && !isNaN(a.getTime())) add(portalIsoYmdFromDate(a));
        }
      }catch(_){}
      try{
        if(typeof mondayStartOfWeekLocal === 'function'){
          const mon = mondayStartOfWeekLocal(new Date());
          for(let i = 0; i < 7; i++){
            const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
            add(portalIsoYmdFromDate(d));
          }
        }
      }catch(_){}
      try{
        (dashboardData && Array.isArray(dashboardData.week) ? dashboardData.week : []).forEach(function(w){
          const dayName = String(w && w.day || '').trim();
          if(!dayName || typeof calendarDateForWeekListDay !== 'function') return;
          const d = calendarDateForWeekListDay(dayName);
          if(d && !isNaN(d.getTime())) add(portalIsoYmdFromDate(d));
        });
      }catch(_){}
      try{
        const ns = dashboardData && dashboardData.nextSessionCalendarDate;
        if(ns){
          const d = ns instanceof Date ? ns : new Date(ns);
          if(d && !isNaN(d.getTime())) add(portalIsoYmdFromDate(d));
        }
      }catch(_){}
      try{
        if(opts.termCalendar !== false){
        const y = Number(dashboardData && dashboardData.termCalendarYear);
        let months = Array.isArray(dashboardData && dashboardData.termCalendarMonths) && dashboardData.termCalendarMonths.length
          ? dashboardData.termCalendarMonths.map(Number).filter(function(m){ return m >= 0 && m <= 11; })
          : null;
        if(!months || !months.length){
          const single = Number(dashboardData && dashboardData.termCalendarMonth);
          if(Number.isFinite(single) && single >= 0 && single <= 11) months = [single];
        }
        if(Number.isFinite(y) && Array.isArray(months) && months.length){
          const firstDomMap = dashboardData && dashboardData.termCalendarFirstDom;
          months.forEach(function(monthIndex){
            const lastDay = new Date(y, monthIndex + 1, 0).getDate();
            let firstDom = 1;
            if(firstDomMap && Object.prototype.hasOwnProperty.call(firstDomMap, monthIndex)){
              const fd = Math.floor(Number(firstDomMap[monthIndex]));
              if(Number.isFinite(fd) && fd > 1) firstDom = Math.min(fd, lastDay);
            }
            for(let day = firstDom; day <= lastDay; day++){
              add(portalIsoYmdFromDate(new Date(y, monthIndex, day)));
            }
          });
        }
        }
      }catch(_){}
      if(!out.length) add(portalIsoYmdFromDate(new Date()));
      return out;
    }
    window.portalRefreshScheduleOverridesCache = async function portalRefreshScheduleOverridesCache(opts){
      try{
        const box = window.__PORTAL_SUPABASE__;
        if(!box || !box.client){
          try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
          return;
        }
        const sess = box.session;
        if(!sess || !sess.user){
          try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
          return;
        }
        const isoList = typeof portalScheduleOverrideFetchIsoList === "function" ? portalScheduleOverrideFetchIsoList(opts) : [portalIsoYmdFromDate(new Date())];
        const selectCols = 'id,created_at,session_date,anchor_start,anchor_end,anchor_staff_id,anchor_venue,anchor_client_id,anchor_time_slot_label,override_type,payload,status';
        const merged = [];
        const CHUNK = 40;
        for(let start = 0; start < isoList.length; start += CHUNK){
          const chunk = isoList.slice(start, start + CHUNK);
          if(!chunk.length) continue;
          const res = await box.client.from('schedule_overrides')
            .select(selectCols)
            .eq('status', 'active')
            .in('session_date', chunk)
            .order('created_at', { ascending: false });
          if(res.error){
            console.debug('[portal] schedule_overrides fetch', res.error, chunk);
            continue;
          }
          (res.data || []).forEach(function(row){ merged.push(row); });
        }
        merged.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
        window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__ = merged;
      }catch(e){
        console.debug('[portal] schedule_overrides fetch', e);
        window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__ = [];
      }finally{
        try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
      }
      if(typeof portalParticipantsSheetRefreshTabs === 'function') portalParticipantsSheetRefreshTabs();
      try{
        if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
        if(typeof renderLists === 'function') renderLists();
        if(typeof renderMiniCounts === 'function') renderMiniCounts();
        if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
        if(typeof renderToday === 'function'){
          const grid = document.getElementById('todayGrid');
          if(grid) grid.removeAttribute('data-today-cards-sig');
          renderToday();
        }
        if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid();
        if(typeof window.portalSyncLeadTeamShiftUi === 'function') window.portalSyncLeadTeamShiftUi();
        if(typeof portalRefreshScheduleOverrideDayChrome === 'function') portalRefreshScheduleOverrideDayChrome({ forceTerm: true });
      }catch(_syncOv){}
    };
    /** Kick async schedule_overrides fetch so Today does not stay on “syncing” after identity resolves. */
    function portalStaffKickScheduleOverridesHydrate(opts){
      opts = opts || {};
      if(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__) return Promise.resolve();
      var fn = typeof window !== 'undefined' ? window.portalRefreshScheduleOverridesCache : null;
      if(typeof fn !== 'function'){
        try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
        return Promise.resolve();
      }
      var ms = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 4500;
      return Promise.race([
        fn({ termCalendar: !!opts.termCalendar }),
        new Promise(function(r){ setTimeout(r, ms); })
      ]).then(function(){
        try{
          if(!window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__) window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true;
        }catch(_){}
        try{
          if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
          if(typeof renderToday === 'function') renderToday();
          if(typeof renderLists === 'function') renderLists();
          if(typeof renderMiniCounts === 'function') renderMiniCounts();
        }catch(_){}
      }).catch(function(){
        try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
        try{ if(typeof renderToday === 'function') renderToday(); }catch(_){}
      });
    }
    try{ window.portalStaffKickScheduleOverridesHydrate = portalStaffKickScheduleOverridesHydrate; }catch(_){}
    /** OS banner when app is backgrounded/closed. Foreground uses quick-menu + header chrome only. */
    function portalStaffNotifyOsWhiteTile(title, body, tag, opts){
      opts = opts || {};
      if(opts.force !== true && typeof document !== 'undefined' && document.visibilityState === 'visible'){
        return false;
      }
      if(opts.vibrate !== false){
        try{
          if(navigator.vibrate) navigator.vibrate([120, 55, 120, 55, 160]);
        }catch(_){}
      }
      if(typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
      var icon = '/portal/app-icon/icon-192.png?v=20260624-push-icon';
      try{
        var n = new Notification(String(title || 'clubSENsational'), {
          body: String(body || ''),
          tag: String(tag || 'clubsensational-portal'),
          renotify: true,
          icon: icon,
          badge: icon
        });
        n.addEventListener('click', function(){
          try{ window.focus(); }catch(_e){}
          if(typeof portalOpenLogoLiteQuickMenuFromIosAlertPreview === 'function'){
            portalOpenLogoLiteQuickMenuFromIosAlertPreview();
          }
        });
        return true;
      }catch(_e){
        return false;
      }
    }
    /** Push/vibrate only for these roster override types (not other override_type values). */
    function portalOverrideTypeEligibleForStaffPush(overrideType){
      const t = String(overrideType || '').trim();
      return t === 'client_replace_in_slot' || t === 'client_absence_announced' || t === 'slot_open';
    }
    function portalOverridePushCopyForRow(row){
      const t = String(row && row.override_type || '').trim();
      if(t === 'client_replace_in_slot'){
        const who = typeof portalOverrideReplaceParticipantDisplayName === 'function'
          ? portalOverrideReplaceParticipantDisplayName(row)
          : '';
        if(who){
          return {
            title: 'Make-up: ' + who,
            body: who + ' is on your roster for a make-up session.'
          };
        }
        return { title: 'Make-up session', body: 'A make-up session was scheduled on your roster.' };
      }
      if(t === 'client_absence_announced') return { title: 'Absent participant', body: 'An absence was recorded on your roster.' };
      if(t === 'slot_open'){
        return {
          title: 'Slot reopened',
          body: 'A closed block was reopened on your roster for this date. Open the quick menu or that day to review.'
        };
      }
      return { title: 'Schedule update', body: 'Your roster was updated.' };
    }
    window.portalMaybeNotifyScheduleOverrideFromPayload = function portalMaybeNotifyScheduleOverrideFromPayload(payload){
      try{
        try{
          var _legacyRosterToast = document.getElementById('portalRosterOverrideToast');
          if(_legacyRosterToast && _legacyRosterToast.parentNode) _legacyRosterToast.parentNode.removeChild(_legacyRosterToast);
        }catch(_){}
        const row = payload && (payload.new || payload.old);
        if(!row || typeof portalScheduleOverrideRowAppliesToLoggedInStaff !== 'function') return;
        if(!portalScheduleOverrideRowAppliesToLoggedInStaff(row)) return;
        if(!portalOverrideTypeEligibleForStaffPush(row.override_type)) return;
        const iso = normaliseIsoDate(row.session_date);
        if(!iso || typeof portalOverrideRowIsWithinReminderHorizonSessionDate !== 'function' || !portalOverrideRowIsWithinReminderHorizonSessionDate(iso)) return;
        const id = String(row.id || '');
        try{
          if(id && sessionStorage.getItem('portalOvPushLast') === id) return;
        }catch(_){}
        const copy = portalOverridePushCopyForRow(row);
        const body = copy.body + (iso ? (' Date: ' + iso + '.') : '') + ' Tap the centre logo → Quick menu for details.';
        const tag = 'clubsensational-portal-roster-ov' + (id ? '-' + id : '');
        const appVisible = typeof document !== 'undefined' && String(document.visibilityState || '') === 'visible';
        if(appVisible){
          try{ if(navigator.vibrate) navigator.vibrate([120, 55, 120, 55, 160]); }catch(_){}
          if(typeof syncPortalHeaderAlertChrome === 'function'){
            syncPortalHeaderAlertChrome(typeof portalReminderState === 'function' ? portalReminderState() : null);
          }
          if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
        }else{
          portalStaffNotifyOsWhiteTile(copy.title, body, tag);
        }
        try{ if(id) sessionStorage.setItem('portalOvPushLast', id); }catch(_){}
      }catch(_){}
    };
    var __PORTAL_STAFF_OVR_DEB = null;
    window.portalInitScheduleOverrideRealtimeForStaff = function portalInitScheduleOverrideRealtimeForStaff(){
      try{
        if(typeof window.portalRealtimePrepareInit === "function"){
          if(!window.portalRealtimePrepareInit("__PORTAL_STAFF_SCHED_RT_CH", "__PORTAL_STAFF_SCHED_RT_READY")) return;
        }else if(window.__PORTAL_STAFF_SCHED_RT_CH) return;
        var box = window.__PORTAL_SUPABASE__;
        if(!box || !box.client || typeof box.client.channel !== "function") return;
        if(typeof window.__PORTAL_STAFF_REMOTE_OVERRIDE_REFRESH__ !== "function"){
          setTimeout(function(){ window.portalInitScheduleOverrideRealtimeForStaff(); }, 600);
          return;
        }
        var ch = box.client
          .channel("staff-schedule-overrides-" + String(Date.now()))
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "schedule_overrides" },
            function(payload){
              if(__PORTAL_STAFF_OVR_DEB) clearTimeout(__PORTAL_STAFF_OVR_DEB);
              __PORTAL_STAFF_OVR_DEB = setTimeout(function(){
                __PORTAL_STAFF_OVR_DEB = null;
                var fn = window.__PORTAL_STAFF_REMOTE_OVERRIDE_REFRESH__;
                if(typeof fn === "function") void fn(payload);
              }, 400);
            }
          )
          .subscribe(function(status, err){
            if(status === "SUBSCRIBED"){
              window.__PORTAL_STAFF_SCHED_RT_READY = true;
              if(typeof window.portalRealtimeMarkSubscribed === "function"){
                window.portalRealtimeMarkSubscribed("[portal] Realtime schedule_overrides");
              }
            }else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT"){
              if(typeof window.portalRealtimeOnChannelError === "function"){
                window.portalRealtimeOnChannelError(
                  "__PORTAL_STAFF_SCHED_RT_CH",
                  "__PORTAL_STAFF_SCHED_RT_READY",
                  window.portalInitScheduleOverrideRealtimeForStaff,
                  "[portal] Realtime schedule_overrides",
                  status,
                  err
                );
              }else if(typeof window.portalWarnUnlessOffline === "function"){
                window.portalWarnUnlessOffline("[portal] Realtime schedule_overrides", status, err);
              }else if(typeof navigator === "undefined" || navigator.onLine !== false){
                console.warn("[portal] Realtime schedule_overrides", status, err || "");
              }
            }
          });
        window.__PORTAL_STAFF_SCHED_RT_CH = ch;
        /* SW registered once via portalRegisterStaffServiceWorkerEarly */
      }catch(e){
        console.warn("[portal] portalInitScheduleOverrideRealtimeForStaff", e);
      }
    };
    var __PORTAL_STAFF_ANN_RT_DEB = null;
    window.portalInitStaffAnnouncementsRealtime = function portalInitStaffAnnouncementsRealtime(){
      try{
        if(typeof window.portalRealtimePrepareInit === "function"){
          if(!window.portalRealtimePrepareInit("__PORTAL_STAFF_ANN_RT_CH", "__PORTAL_STAFF_ANN_RT_READY")) return;
        }else if(window.__PORTAL_STAFF_ANN_RT_CH) return;
        var box = window.__PORTAL_SUPABASE__;
        if(!box || !box.client || typeof box.client.channel !== "function") return;
        if(typeof portalHydrateAnnouncementsFromSupabase !== "function"){
          setTimeout(function(){ window.portalInitStaffAnnouncementsRealtime(); }, 600);
          return;
        }
        var ch = box.client
          .channel("staff-portal-announcements-" + String(Date.now()))
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "portal_staff_announcements" },
            function(){
              if(__PORTAL_STAFF_ANN_RT_DEB) clearTimeout(__PORTAL_STAFF_ANN_RT_DEB);
              __PORTAL_STAFF_ANN_RT_DEB = setTimeout(function(){
                __PORTAL_STAFF_ANN_RT_DEB = null;
                void portalHydrateAnnouncementsFromSupabase();
              }, 400);
            }
          )
          .subscribe(function(status, err){
            if(status === "SUBSCRIBED"){
              window.__PORTAL_STAFF_ANN_RT_READY = true;
              if(typeof window.portalRealtimeMarkSubscribed === "function"){
                window.portalRealtimeMarkSubscribed("[portal] Realtime portal_staff_announcements");
              }
            }else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT"){
              if(typeof window.portalRealtimeOnChannelError === "function"){
                window.portalRealtimeOnChannelError(
                  "__PORTAL_STAFF_ANN_RT_CH",
                  "__PORTAL_STAFF_ANN_RT_READY",
                  window.portalInitStaffAnnouncementsRealtime,
                  "[portal] Realtime portal_staff_announcements",
                  status,
                  err
                );
              }else if(typeof window.portalWarnUnlessOffline === "function"){
                window.portalWarnUnlessOffline("[portal] Realtime portal_staff_announcements", status, err);
              }else if(typeof navigator === "undefined" || navigator.onLine !== false){
                console.warn("[portal] Realtime portal_staff_announcements", status, err || "");
              }
            }
          });
        window.__PORTAL_STAFF_ANN_RT_CH = ch;
      }catch(e){
        console.warn("[portal] portalInitStaffAnnouncementsRealtime", e);
      }
    };
    var __PORTAL_STAFF_DM_RT_DEB = null;
    window.__PORTAL_INTERNAL_CHAT_UI = window.__PORTAL_INTERNAL_CHAT_UI || { threadId: null };

    /* Chat removed 2026-06-09 — archived under working_ui/archive/chat-full-removal-20260609/ */
    window.portalRenderInternalChatSheet = async function(){};
    window.portalInitFloatingInternalChat = function(){};
    window.portalStaffDmSyncUnreadChrome = async function(){};
    window.portalStaffDmOnRealtimeInsert = async function(){ return false; };
    window.portalSyncInternalChatSheetView = function(){};
    window.portalSyncInternalChatMobileViewport = function(){};
    window.syncPortalInternalChatImmersive = function(){};
    window.portalInitStaffDmRealtime = function(){};
    window.portalInitStaffDmUnreadPoll = function(){};
    window.portalAdminBootDmWatchers = function(){};
    window.portalAdminDmHasUnread = function(){ return false; };
    window.portalAdminBellResolveChatHints = function(){ return []; };
    window.portalPlayChatMessageAlertSound = function(){};

    window.portalWaitForSupabaseClientReady = async function portalWaitForSupabaseClientReady(timeoutMs){
      const doneNow = function(){
        const box = window.__PORTAL_SUPABASE__;
        return !!(box && box.client);
      };
      if(doneNow()) return true;
      const waitMs = Number(timeoutMs || 10000);
      return await new Promise(function(resolve){
        let settled = false;
        const finish = function(ok){
          if(settled) return;
          settled = true;
          resolve(!!ok);
        };
        const onReady = function(){
          finish(doneNow());
        };
        window.addEventListener('portal:supabase-ready', onReady, { once: true });
        setTimeout(function(){
          finish(doneNow());
        }, waitMs);
      });
    };
    /**
     * Previously fetched `schedule_overrides` for the anchor date and wrote `session.override` (etc.)
     * onto recurring `sessionsModel` rows. That is one row per weekday slot — mutating it made a
     * single-date absence (e.g. 2026-04-26) appear on every future Sunday. Overrides are resolved
     * per calendar ISO only via `portalPickScheduleOverrideForSession` + `__PORTAL_SCHEDULE_OVERRIDE_ROWS__`
     * (see `portalRefreshScheduleOverridesCache`). This hook stays as a no-op compat return.
     */
    window.portalApplyScheduleOverridesToSessionsModelSafe = async function portalApplyScheduleOverridesToSessionsModelSafe(){
      try{
        if(!Array.isArray(sessionsModel) || !sessionsModel.length) return sessionsModel;
        return sessionsModel;
      }catch(e){
        console.warn('portalApplyScheduleOverridesToSessionsModelSafe', e);
        return sessionsModel;
      }
    };
    function portalSessionContributesToReviewKeys(s, viewDayWord, sessionDateIso){
      if(!s) return false;
      const st = typeof sessionModelStatus === 'function' ? sessionModelStatus(s) : '';
      const openedClosed = typeof portalSessionHasSlotOpenOverride === 'function' && portalSessionHasSlotOpenOverride(s, sessionDateIso);
      if(st === 'Available') return false;
      if(st === 'Home' || st === 'Manager') return false;
      if(st === 'Closed' && !openedClosed) return false;
      const cid0 = String(s.clientId || '').trim().toLowerCase();
      if(!cid0 || cid0 === 'available') return false;
      if(cid0 === 'closed' && !openedClosed) return false;
      const ov = portalTodayScheduleOverrideForSession(s, sessionDateIso);
      if(ov){
        const t = String(ov.override_type || '').trim();
        if(t === 'instructor_reassign'){
          const cov = String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase();
          const orig = portalNormKeyStr(s.staffId);
          const me = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
          if(cov && orig === me) return false;
        }
        if(t === 'client_replace_in_slot'){
          const repId = portalOverrideReplacementClientId(ov.payload);
          const anchorId = String(s.clientId || '').trim().toLowerCase();
          if(repId && anchorId && repId !== anchorId && !portalOverrideIsTrial(ov)) return false;
        }
        if(t === 'slot_clear_client' || t === 'client_absence_announced' || t === 'slot_close') return false;
      }
      if(typeof portalReplaceMakeupOverrideForSession === 'function'
        && portalReplaceMakeupOverrideForSession(s, sessionDateIso)){
        return false;
      }
      return true;
    }
    /** Sessions that need no feedback register (absent, cancelled, closed, covered away, no client). */
    function portalRosterSessionFeedbackResolvedFlags(s, sessionDateIso, staffId){
      if(!s) return null;
      const iso = String(sessionDateIso || '').trim().slice(0, 10);
      const sid = String(staffId != null ? staffId : (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '')).trim().toLowerCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
      const manualOv = String(s && s.override || '').trim().toUpperCase();
      if(manualOv === 'ABSENT'){
        return { feedbackDone: false, incident: false, absent: true, cancelled: false };
      }
      if(manualOv === 'CLOSED' || manualOv === 'NO_CLIENT'){
        return { feedbackDone: true, incident: false, absent: false, cancelled: false };
      }
      if(manualOv === 'CANCELLED'){
        return { feedbackDone: false, incident: false, absent: false, cancelled: true };
      }
      const st = typeof sessionModelStatus === 'function' ? sessionModelStatus(s) : '';
      const openedClosed = typeof portalSessionHasSlotOpenOverride === 'function' && portalSessionHasSlotOpenOverride(s, iso);
      if(st === 'Available'){
        if(typeof portalOpenSlotMakeupOverrideForSession === 'function' && portalOpenSlotMakeupOverrideForSession(s, iso)){
          return null;
        }
        return { feedbackDone: true, incident: false, absent: false, cancelled: false };
      }
      if(st === 'Home' || st === 'Manager'){
        return { feedbackDone: true, incident: false, absent: false, cancelled: false };
      }
      if(st === 'Closed' && !openedClosed){
        return { feedbackDone: true, incident: false, absent: false, cancelled: false };
      }
      const absentOvDedicated = typeof portalScheduleOverrideForSessionByType === 'function'
        ? portalScheduleOverrideForSessionByType(s, iso, 'client_absence_announced')
        : null;
      if(absentOvDedicated){
        return { feedbackDone: false, incident: false, absent: true, cancelled: false };
      }
      const replaceMakeupDedicated = typeof portalReplaceMakeupOverrideForSession === 'function'
        ? portalReplaceMakeupOverrideForSession(s, iso)
        : null;
      if(replaceMakeupDedicated){
        return { feedbackDone: false, incident: false, absent: false, cancelled: true };
      }
      const ov = typeof portalTodayScheduleOverrideForSession === 'function'
        ? portalTodayScheduleOverrideForSession(s, iso)
        : null;
      if(ov){
        const t = String(ov.override_type || '').trim();
        if(t === 'client_absence_announced'){
          return { feedbackDone: false, incident: false, absent: true, cancelled: false };
        }
        if(t === 'slot_close'){
          return { feedbackDone: false, incident: false, absent: false, cancelled: true };
        }
        if(t === 'slot_clear_client'){
          if(ov.payload && ov.payload.cancelled_by_admin){
            return { feedbackDone: false, incident: false, absent: false, cancelled: true };
          }
          if(typeof portalOpenSlotMakeupOverrideForSession === 'function' && portalOpenSlotMakeupOverrideForSession(s, iso)){
            return null;
          }
          return { feedbackDone: true, incident: false, absent: false, cancelled: false };
        }
        if(t === 'instructor_reassign'){
          const cov = String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase();
          const orig = typeof portalNormKeyStr === 'function' ? portalNormKeyStr(s.staffId) : String(s.staffId || '').trim().toLowerCase();
          if(cov && orig === sid){
            return { feedbackDone: true, incident: false, absent: false, cancelled: false };
          }
        }
      }
      if(typeof portalSessionContributesToReviewKeys === 'function'){
        const dayWord = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : '';
        if(!portalSessionContributesToReviewKeys(s, dayWord, iso)){
          return { feedbackDone: true, incident: false, absent: false, cancelled: false };
        }
      }
      try{
        const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
        const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
        if(bridge && typeof bridge.rosterSessionMarkedAbsent === 'function'
          && bridge.rosterSessionMarkedAbsent(iso, sid, s, notes)){
          return { feedbackDone: false, incident: false, absent: true, cancelled: false };
        }
        const src = typeof window !== 'undefined' ? window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE : null;
        if(src && Array.isArray(src.rows) && bridge && typeof bridge.statusRowMatchesRosterSession === 'function'){
          for(let i = 0; i < src.rows.length; i++){
            const st = src.rows[i];
            if(String(st.date || '').trim().substring(0, 10) !== iso) continue;
            if(!portalStaffOwnsFeedbackStatusRow(sid, st)) continue;
            if(!bridge.statusRowMatchesRosterSession(st, s, notes)) continue;
            const osSt = String(st.overviewStatus || '').trim().toLowerCase();
            if(osSt === 'absent' || osSt === 'cancelled'){
              const fl = portalFlagsFromStatusBundleRow(st);
              if(fl) return fl;
              continue;
            }
            if(bridge.statusSlotResolved && bridge.statusSlotResolved(iso, st, sid)){
              return portalReviewFlagsForResolvedSession(iso, sid, s);
            }
          }
        }
      }catch(_){}
      try{
        const dayWordRes = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : '';
        const pseudoAbsent = {
          kind: 'client',
          sessionKey: typeof portalSessionReviewKeyForModelRow === 'function'
            ? portalSessionReviewKeyForModelRow(s, dayWordRes, iso)
            : '',
          __portalBaseSession: s,
          clientId: typeof portalEffectiveClientIdForReview === 'function'
            ? portalEffectiveClientIdForReview(s, iso)
            : String(s && s.clientId || '').trim().toLowerCase()
        };
        if(typeof portalReviewAbsentResolvedForItem === 'function'
          && portalReviewAbsentResolvedForItem(pseudoAbsent, iso)){
          return { feedbackDone: false, incident: false, absent: true, cancelled: false };
        }
      }catch(_qa){}
      try{
        const bridgeLate = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
        const notesLate = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
        if(bridgeLate && typeof bridgeLate.sessionComplete === 'function'
          && bridgeLate.sessionComplete(iso, sid, s, notesLate, {})){
          return portalReviewFlagsForResolvedSession(iso, sid, s);
        }
      }catch(_bridgeLate){}
      return null;
    }
    function portalRosterSessionFeedbackExempt(s, sessionDateIso, staffId){
      return !!portalRosterSessionFeedbackResolvedFlags(s, sessionDateIso, staffId);
    }
    function portalEffectiveClientIdForReview(s, sessionDateIso){
      if(!s || !sessionDateIso) return String(s && s.clientId || '').trim().toLowerCase();
      const isoEff = portalNormalizeScheduleOverrideSessionDate(sessionDateIso);
      if(!isoEff) return String(s && s.clientId || '').trim().toLowerCase();
      const rows = portalScheduleOverrideRowsAll().filter(function(r){
        if(String(r.status || 'active') !== 'active') return false;
        const rowIso = portalNormalizeScheduleOverrideSessionDate(r.session_date);
        if(!rowIso || rowIso !== isoEff) return false;
        if(portalNormKeyStr(r.anchor_staff_id) !== portalNormKeyStr(s.staffId)) return false;
        if(portalNormKeyStr(r.anchor_venue) !== portalNormKeyStr(s.venue)) return false;
        if(!portalRosterClientIdsMatch(r.anchor_client_id, s.clientId)) return false;
        if(!portalTimeAnchorsMatch(r.anchor_start, s.start)) return false;
        if(!portalTimeAnchorsMatch(r.anchor_end, s.end)) return false;
        if(!portalOverrideSlotLabelMatchesRow(r, s)) return false;
        return String(r.override_type || '').trim() === 'client_replace_in_slot';
      });
      rows.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
      const rep = rows[0];
      if(rep && rep.payload){
        const rid = portalOverrideReplacementClientId(rep.payload);
        if(rid) return rid;
      }
      return String(s.clientId || '').trim().toLowerCase();
    }
    function portalSlugifyAreaKey(area){
      return String(area || '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'default';
    }
    function portalSessionNeedsFeedbackUnitSuffix(s, activity){
      const act = String(activity || (s && (s.activity || s.rosterService || s.service)) || '').trim().toLowerCase();
      if(/day\s*centre/.test(act)) return false;
      if(/multi[-\s]?activity/.test(act) || act === 'bespoke') return true;
      if(act.indexOf('climbing') >= 0) return true;
      return false;
    }
    function portalSessionFeedbackUnitSuffix(s, activity, supportWorkerMode){
      if(!portalSessionNeedsFeedbackUnitSuffix(s, activity)) return '';
      const area = rosterAreaLabelForSession(s, activity, supportWorkerMode);
      const ak = portalSlugifyAreaKey(area);
      return ak ? '|' + ak : '';
    }
    function portalBuildSessionReviewKey(sessionDateIso, s, viewDayWord, clientId){
      if(!s || !sessionDateIso) return '';
      const cid = String(clientId != null ? clientId : '').trim().toLowerCase();
      if(!cid) return '';
      if(portalRosterSessionIsDayCentre(s)) return String(sessionDateIso) + '|' + cid + '|day_centre';
      if(portalRosterSessionIsBespokeShared(s)) return String(sessionDateIso) + '|' + cid + '|bespoke_shared';
      const activity = String(s.activity || s.rosterService || 'Swimming').trim();
      if(typeof portalStaffLeadIsAquaticActivity === 'function' && portalStaffLeadIsAquaticActivity(activity)){
        if(typeof portalStaffLeadAquaticSessionReviewKey === 'function'){
          return portalStaffLeadAquaticSessionReviewKey(sessionDateIso, cid, s, viewDayWord);
        }
      }
      const suffix = portalSessionFeedbackUnitSuffix(s, activity, portalStaffIsSupportWorkerForAreaNotes());
      return String(sessionDateIso) + '|' + String(s.start || '') + '|' + cid + suffix;
    }
    function portalSessionReviewKeyForModelRow(s, viewDayWord, sessionDateIso){
      if(!portalSessionContributesToReviewKeys(s, viewDayWord, sessionDateIso)) return '';
      const cid = portalEffectiveClientIdForReview(s, sessionDateIso);
      if(!cid) return '';
      return portalBuildSessionReviewKey(sessionDateIso, s, viewDayWord, cid);
    }
    window.portalWeekStripSessionShouldCount = function(s, dayName, staffId){
      const sid = String(staffId || '').trim().toLowerCase();
      if(String(s.staffId || '').toLowerCase() !== sid) return false;
      if(String(s.day || '').trim() !== String(dayName || '').trim()) return false;
      if(typeof portalStaffDashboardOmitSpreadsheetSession === 'function'
        && portalStaffDashboardOmitSpreadsheetSession(s, dayName)) return false;
      const st = sessionModelStatus(s);
      if(st === 'Available') return false;
      const cell = typeof calendarDateForWeekListDay === 'function' ? calendarDateForWeekListDay(dayName) : null;
      if(!cell) return false;
      const iso = portalIsoYmdFromDate(cell);
      if(typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'
        && !portalSessionSpreadsheetRowMatchesCalendarDate(s, iso, dayName)) return false;
      const openedClosed = typeof portalSessionHasSlotOpenOverride === 'function' && portalSessionHasSlotOpenOverride(s, iso);
      if(st === 'Closed' && !openedClosed) return false;
      const ov = portalTodayScheduleOverrideForSession(s, iso);
      if(ov && ov.override_type === 'instructor_reassign' && String(ov.payload && ov.payload.covering_staff_id || '').trim()) return false;
      if(ov && ov.override_type === 'client_replace_in_slot'){
        const repId = portalOverrideReplacementClientId(ov.payload);
        const anchorId = String(s.clientId || '').trim().toLowerCase();
        if(repId && anchorId && repId !== anchorId && !portalOverrideIsTrial(ov)) return false;
      }
      if(ov && (ov.override_type === 'slot_clear_client' || ov.override_type === 'client_absence_announced' || ov.override_type === 'slot_close')) return false;
      if(typeof portalReplaceMakeupOverrideForSession === 'function' && portalReplaceMakeupOverrideForSession(s, iso)) return false;
      return true;
    };
    /** One count per feedback/session unit (not per 30' roster row) — matches Today cards + feedback keys. */
    window.portalWeekStripSessionCountKey = function(s, dayName, staffId){
      const cell = typeof calendarDateForWeekListDay === 'function' ? calendarDateForWeekListDay(dayName) : null;
      if(!cell || !s) return '';
      const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(cell) : '';
      if(!iso) return '';
      if(typeof portalSessionReviewKeyForModelRow === 'function'){
        const k = portalSessionReviewKeyForModelRow(s, dayName, iso);
        if(k) return k;
      }
      const fb = String(s.feedbackUnitKey || '').trim();
      if(fb) return fb + '\0' + iso;
      const cid = typeof portalEffectiveClientIdForReview === 'function'
        ? portalEffectiveClientIdForReview(s, iso)
        : String(s.clientId || '').trim().toLowerCase();
      if(!cid) return '';
      return iso + '\0' + cid + '\0' + String(s.start || '');
    };
    window.portalWeekStripAddSyntheticCoverCounts = function(dayName, staffId, bucket, weekServiceCatFn, seenCount){
      const cell = typeof calendarDateForWeekListDay === 'function' ? calendarDateForWeekListDay(dayName) : null;
      if(!cell || typeof weekServiceCatFn !== 'function') return;
      const iso = portalIsoYmdFromDate(cell);
      const sid = String(staffId || '').trim().toLowerCase();
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(iso)) return;
        if(String(ov.status || 'active') !== 'active') return;
        if(ov.override_type !== 'instructor_reassign') return;
        const cov = String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase();
        if(!cov || cov !== sid) return;
        const base = typeof portalFindSpreadsheetSessionMatchingOverride === 'function' ? portalFindSpreadsheetSessionMatchingOverride(ov, dayName) : null;
        if(!base) return;
        const s = Object.assign({}, base, { staffId: cov });
        if(typeof window.portalWeekStripSessionCountKey === 'function' && seenCount){
          const countKey = window.portalWeekStripSessionCountKey(s, dayName, sid);
          if(!countKey) return;
          if(seenCount[countKey]) return;
          seenCount[countKey] = true;
        }
        const venue = String(s.venue || '—');
        const lab = weekServiceCatFn(s);
        const key = venue + '\0' + lab;
        if(!bucket[key]) bucket[key] = { count: 0, venue: venue, serviceLabel: lab };
        bucket[key].count += 1;
      });
    };
    /** Full roster rows for staff + weekday + calendar date (same base Today uses), plus instructor-cover synthetics. Does not strip absences or overrides — callers run portalPickScheduleOverrideForSession / feedback rules themselves. */
    function portalBaseClientSessionsForCalendarDate(dayWord, sessionDateIso, staffId, isRealFn){
      const sid = String(staffId || '').trim().toLowerCase();
      const dw = String(dayWord || '').trim();
      const acc = [];
      (sessionsModel || []).forEach(function(s){
        if(!s) return;
        if(String(s.staffId || '').toLowerCase() !== sid) return;
        if(String(s.day || '').trim() !== dw) return;
        if(typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'
          && !portalSessionSpreadsheetRowMatchesCalendarDate(s, sessionDateIso, dw)) return;
        if(!isRealFn(s)){
          if(typeof portalSessionHasSlotOpenOverride === 'function' && portalSessionHasSlotOpenOverride(s, sessionDateIso) && typeof portalSpreadsheetSlotClosedLike === 'function' && portalSpreadsheetSlotClosedLike(s)){
            /* reopened closed slot: include in week/feedback lists */
          }else{
            return;
          }
        }
        const ov0 = typeof portalTodayScheduleOverrideForSession === 'function' ? portalTodayScheduleOverrideForSession(s, sessionDateIso) : null;
        if(ov0 && ov0.override_type === 'instructor_reassign' && String(ov0.payload && ov0.payload.covering_staff_id || '').trim()) return;
        if(typeof portalSessionStaffReassignedOff === 'function' && portalSessionStaffReassignedOff(s, sessionDateIso)) return;
        const eid = typeof portalEffectiveClientIdForReview === 'function' ? portalEffectiveClientIdForReview(s, sessionDateIso) : String(s.clientId || '').trim().toLowerCase();
        const eff = eid !== String(s.clientId || '').trim().toLowerCase()
          ? Object.assign({}, s, { clientId: eid, __portalBaseSession: s })
          : Object.assign({}, s, { __portalBaseSession: s });
        if(eff.clientId) acc.push(eff);
      });
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(sessionDateIso)) return;
        if(String(ov.status || 'active') !== 'active') return;
        if(ov.override_type !== 'instructor_reassign') return;
        const cov = String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase();
        if(!cov || cov !== sid) return;
        const base = typeof portalFindSpreadsheetSessionMatchingOverride === 'function' ? portalFindSpreadsheetSessionMatchingOverride(ov, dw) : null;
        const synth = Object.assign({}, base || {
          day: dw,
          start: portalHmFromDbTime(ov.anchor_start) || '09:00',
          end: portalHmFromDbTime(ov.anchor_end) || portalHmFromDbTime(ov.anchor_start) || '10:00',
          venue: ov.anchor_venue || '',
          clientId: String(ov.anchor_client_id || '').toLowerCase(),
          staffId: cov,
          status: 'Scheduled',
          activity: 'Swimming'
        }, { staffId: cov });
        if(String(synth.day || '').trim() !== dw) return;
        if(!isRealFn(synth)) return;
        acc.push(synth);
      });
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(String(ov.status || 'active') !== 'active') return;
        if(String(ov.override_type || '').trim() !== 'client_replace_in_slot') return;
        if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(sessionDateIso)) return;
        if(portalNormKeyStr(ov.anchor_staff_id) !== portalNormKeyStr(sid)) return;
        const repId = portalOverrideReplacementClientId(ov.payload);
        if(!repId) return;
        const base = typeof portalFindSpreadsheetSessionMatchingOverride === 'function'
          ? portalFindSpreadsheetSessionMatchingOverride(ov, dw)
          : null;
        const slotBase = base || (typeof portalSyntheticSessionFromOverride === 'function'
          ? portalSyntheticSessionFromOverride(ov, dw)
          : null);
        if(!slotBase) return;
        const startTok = portalCanonicalHmToken(slotBase.start) || portalCanonicalHmToken(ov.anchor_start);
        let listed = false;
        for(let li = 0; li < acc.length; li++){
          const s = acc[li];
          const bs = s.__portalBaseSession || s;
          const ovMatch = typeof portalTodayScheduleOverrideForSession === 'function'
            ? portalTodayScheduleOverrideForSession(bs, sessionDateIso)
            : null;
          if(ov.id && ovMatch && ovMatch.id === ov.id){ listed = true; break; }
          if(portalCanonicalHmToken(bs.start) !== startTok) continue;
          const eff = typeof portalEffectiveClientIdForReview === 'function'
            ? portalEffectiveClientIdForReview(bs, sessionDateIso)
            : String(s.clientId || '').trim().toLowerCase();
          if(eff === repId || String(s.clientId || '').trim().toLowerCase() === repId){ listed = true; break; }
        }
        if(listed) return;
        acc.push(Object.assign({}, slotBase, {
          clientId: repId,
          __portalBaseSession: slotBase,
          __portalScheduleOverride: ov
        }));
      });
      return portalStaffKeyIsLulia(sid) ? portalApplyLuliaIkramCutoffToRosterSessions(acc) : acc;
    }
    function portalTermFeedbackSessionsForDate(dayWord, sessionDateIso, staffId, isRealFn){
      const base = portalBaseClientSessionsForCalendarDate(dayWord, sessionDateIso, staffId, isRealFn);
      const iso = String(sessionDateIso || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      const filtered = base.filter(function(s){
        if(typeof portalScheduleOverrideForSessionByType === 'function'){
          const absentOv = portalScheduleOverrideForSessionByType(s, iso, 'client_absence_announced');
          const replaceOv = portalScheduleOverrideForSessionByType(s, iso, 'client_replace_in_slot');
          if(absentOv && !replaceOv) return false;
        }
        return true;
      });
      if(sid && portalTermIsCatchUpFeedbackDate(iso, sid)) return filtered;
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      if(bridge && typeof bridge.termSessionsForDate === 'function'){
        return bridge.termSessionsForDate(dayWord, sessionDateIso, staffId, filtered, clientNotesById);
      }
      return filtered;
    }
    function portalRosterSessionFeedbackCompleteForTerm(s, dayWord, sessionDateIso, staffId){
      const iso = String(sessionDateIso || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(portalTermIsCatchUpFeedbackDate(iso, sid)){
        if(portalTermStaffForcedCompleteDates(sid).indexOf(iso) >= 0) return true;
        const cid = typeof portalEffectiveClientIdForReview === 'function'
          ? portalEffectiveClientIdForReview(s, sessionDateIso)
          : String(s && s.clientId || '').trim().toLowerCase();
        if(portalTermCatchUpClientMarkedDone(iso, sid, cid)) return true;
      }
      if(typeof portalRosterSessionFeedbackExempt === 'function'
        && portalRosterSessionFeedbackExempt(s, iso, sid)) return true;
      const dw = String(dayWord || '').trim();
      const cur = new Date(iso + 'T12:00:00');
      const list = typeof portalTodayListItemsForCalendarDay === 'function'
        ? portalTodayListItemsForCalendarDay(iso, dw, { allowDuringRebuild: true })
        : [];
      const tCanon = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(s && s.start) : String(s && s.start || '').trim();
      const cid = typeof portalEffectiveClientIdForReview === 'function'
        ? portalEffectiveClientIdForReview(s, sessionDateIso)
        : String(s && s.clientId || '').trim().toLowerCase();
      for(let i = 0; i < list.length; i++){
        const item = list[i];
        if(!item || item.kind !== 'client' || !item.sessionKey) continue;
        const base = item.__portalBaseSession;
        if(base){
          const sameStaff = portalNormKeyStr(base.staffId) === portalNormKeyStr(sid);
          const sameClient = String(item.clientId || '').trim().toLowerCase() === cid
            || portalNormKeyStr(base.clientId) === portalNormKeyStr(s.clientId);
          const sameStart = typeof portalCanonicalHmToken === 'function'
            ? portalCanonicalHmToken(base.start) === tCanon
            : String(base.start || '').trim() === String(s.start || '').trim();
          if(!sameStaff || !sameClient || !sameStart) continue;
        }else{
          const sk = String(item.sessionKey || '');
          if(cid && tCanon && sk.indexOf('|' + tCanon + '|') < 0 && sk.indexOf('|' + String(s.start || '').trim() + '|') < 0) continue;
          if(cid && sk.indexOf('|' + cid) < 0 && sk.indexOf('|' + cid + '|') < 0) continue;
        }
        if(item.noSessionFeedbackRequired) return true;
        const r = typeof getEffectiveSessionReviewRecord === 'function'
          ? (getEffectiveSessionReviewRecord(item) || {})
          : {};
        return !!(r.feedbackDone || r.absent || r.cancelled);
      }
      const item = typeof portalMinimalReviewItemFromRosterRow === 'function'
        ? portalMinimalReviewItemFromRosterRow(s, dw, iso, cur)
        : null;
      if(!item || !item.sessionKey) return false;
      if(item.noSessionFeedbackRequired) return true;
      const rec = typeof getEffectiveSessionReviewRecord === 'function'
        ? (getEffectiveSessionReviewRecord(item) || {})
        : {};
      return !!(rec.feedbackDone || rec.absent || rec.cancelled);
    }
    function portalEnrichClientNotesFromPortalFeedback(){
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      if(!bridge || typeof bridge.metricsForClient !== 'function') return;
      const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      const ids = typeof getAssignedClientIdsForStaff === 'function' ? getAssignedClientIdsForStaff() : [];
      ids.forEach(function(cid){
        const c = clientNotesById[cid];
        if(!c || !c.name) return;
        const m = bridge.metricsForClient(c.name, { staffId: staffId });
        if(!m || !m.n) return;
        c.portalFeedbackSessions = m.n;
        if(m.attPct != null) c.portalAttendancePct = m.attPct;
        if(m.engagementAvg != null) c.portalEngagementAvg = m.engagementAvg;
      });
    }

    function portalCanonicalTodayClientKey(clientId, displayName){
      var P = window.PortalParticipantIdentity;
      var fromName = String(displayName || '').trim();
      if(fromName && fromName !== '—' && P && typeof P.canonicalClientId === 'function'){
        var cn = P.canonicalClientId(fromName);
        if(cn) return cn;
      }
      var cid = String(clientId || '').trim().toLowerCase();
      if(P && cid && typeof P.canonicalClientId === 'function'){
        return P.canonicalClientId(cid) || cid;
      }
      if(typeof window.portalCanonicalParticipantClientId === 'function'){
        return window.portalCanonicalParticipantClientId(fromName || cid) || cid;
      }
      var raw = (fromName && fromName !== '—') ? fromName : cid;
      return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    function portalRosterSpreadsheetSessionDedupeKey(s){
      if(!s) return '';
      const sid = String(s.staffId || '').trim().toLowerCase();
      const iso = normaliseIsoDate(s.session_date || s.sessionDate);
      const cid = String(s.clientId || '').trim().toLowerCase();
      const start = typeof portalCanonicalHmToken === 'function'
        ? portalCanonicalHmToken(s.start)
        : String(s.start || '').trim();
      const end = typeof portalCanonicalHmToken === 'function'
        ? portalCanonicalHmToken(s.end)
        : String(s.end || '').trim();
      const venue = portalNormKeyStr(s.venue);
      const ts = String(s.timeSlotLabel || '').trim();
      return [sid, iso, cid, start || ts, end, venue].join('|');
    }
    /** Programme-lead wide day: same client slot from multiple instructor bootstraps → one row. */
    function portalProgrammeWideRosterSessionDedupeKey(s){
      if(!s) return '';
      const iso = normaliseIsoDate(s.session_date || s.sessionDate);
      const cid = portalCanonicalTodayClientKey(s.clientId, s.clientDisplay || s.clientName || s.name);
      const start = typeof portalCanonicalHmToken === 'function'
        ? portalCanonicalHmToken(s.start)
        : String(s.start || '').trim();
      const end = typeof portalCanonicalHmToken === 'function'
        ? portalCanonicalHmToken(s.end)
        : String(s.end || '').trim();
      const venue = portalNormKeyStr(s.venue);
      const ts = String(s.timeSlotLabel || '').trim();
      return [iso, cid, start || ts, end, venue].join('|');
    }
    function portalDedupeRosterSpreadsheetSessions(rows, opts){
      opts = opts || {};
      if(!Array.isArray(rows) || !rows.length) return rows || [];
      const out = [];
      const seen = Object.create(null);
      const keyFn = opts.programmeWide ? portalProgrammeWideRosterSessionDedupeKey : portalRosterSpreadsheetSessionDedupeKey;
      rows.forEach(function(s){
        const k = keyFn(s);
        if(k && seen[k]) return;
        if(k) seen[k] = true;
        out.push(s);
      });
      return out;
    }
    function portalScheduleOverrideInstructorCoverSlotKey(ov){
      if(!ov) return '';
      return [
        normaliseIsoDate(ov.session_date),
        portalNormKeyStr(ov.anchor_staff_id),
        String(ov.anchor_client_id || '').trim().toLowerCase(),
        portalHmFromDbTime(ov.anchor_start) || '',
        portalHmFromDbTime(ov.anchor_end) || '',
        portalNormKeyStr(ov.anchor_venue)
      ].join('|');
    }
    function portalPickLatestInstructorCoverOverridesForStaff(staffId, sessionDateKey){
      const sid = portalNormKeyStr(staffId);
      const iso = normaliseIsoDate(sessionDateKey);
      const bySlot = Object.create(null);
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(normaliseIsoDate(ov.session_date) !== iso) return;
        if(String(ov.status || 'active') !== 'active') return;
        if(String(ov.override_type || '').trim() !== 'instructor_reassign') return;
        const cov = portalNormKeyStr(ov.payload && ov.payload.covering_staff_id);
        if(!cov || cov !== sid) return;
        const slotKey = portalScheduleOverrideInstructorCoverSlotKey(ov);
        if(!slotKey) return;
        const prev = bySlot[slotKey];
        if(!prev || new Date(ov.created_at || 0) > new Date(prev.created_at || 0)) bySlot[slotKey] = ov;
      });
      return Object.keys(bySlot).map(function(k){ return bySlot[k]; });
    }
    /** Luliya Day Centre (Ikram) ends at 15:00 when she covers aquatic sessions that afternoon. */
    function portalStaffKeyIsLulia(staffId){
      return portalNormKeyStr(staffId) === 'lulia';
    }
    function portalRosterRowIsLuliaIkramDayCentre(s){
      if(!s) return false;
      const cid = String(s.clientId || s.client_id || '').trim().toLowerCase();
      const cname = String(s.client_name || s.clientDisplay || s.clientName || s.name || '').trim().toLowerCase();
      if(cid.indexOf('ikram') < 0 && cname.indexOf('ikram') < 0) return false;
      if(typeof portalRosterSessionIsDayCentre === 'function' && portalRosterSessionIsDayCentre(s)) return true;
      const act = String(s.activity || s.rosterService || s.service || '').toLowerCase();
      return /day\s*centre/.test(act);
    }
    function portalRosterRowIsLuliaAfternoonCover(s){
      if(!s) return false;
      const act = String(s.activity || s.rosterService || s.service || '').toLowerCase();
      if(/day\s*centre/.test(act)) return false;
      if(!/aquatic|multi[-\s]?activity|swimming/.test(act)) return false;
      const start = String(s.start || '').trim();
      if(typeof portalHmToMinutes === 'function'){
        const m = portalHmToMinutes(start);
        return Number.isFinite(m) && m >= 15 * 60;
      }
      return false;
    }
    function portalLuliaDayHasAfternoonCover(sessions){
      if(!Array.isArray(sessions) || !sessions.length) return false;
      for(let i = 0; i < sessions.length; i++){
        if(portalRosterRowIsLuliaAfternoonCover(sessions[i])) return true;
      }
      return false;
    }
    function portalApplyLuliaIkramCutoffToRosterSessions(sessions){
      if(!Array.isArray(sessions) || !sessions.length) return sessions || [];
      if(!portalLuliaDayHasAfternoonCover(sessions)) return sessions;
      return sessions.map(function(s){
        if(!portalRosterRowIsLuliaIkramDayCentre(s)) return s;
        const endM = typeof portalHmToMinutes === 'function' ? portalHmToMinutes(String(s.end || '').trim()) : NaN;
        if(!Number.isFinite(endM) || endM <= 15 * 60) return s;
        return Object.assign({}, s, {
          end: '15:00',
          timeSlotLabel: '',
          __portalLuliaIkramCutoff: true
        });
      });
    }
    function portalTodayItemIsLuliaAfternoonCover(it){
      if(!it || it.kind !== 'client') return false;
      const base = it.__portalBaseSession || it;
      return portalRosterRowIsLuliaAfternoonCover(base);
    }
    function portalTodayItemIsLuliaIkramDayCentre(it){
      if(!it || it.kind !== 'client') return false;
      return portalRosterRowIsLuliaIkramDayCentre(it.__portalBaseSession || it);
    }
    function portalApplyLuliaIkramCutoffToTodayItems(items, staffId, sessionDateKey, anchor){
      if(!portalStaffKeyIsLulia(staffId)) return items || [];
      if(!Array.isArray(items) || !items.length) return items;
      if(!items.some(portalTodayItemIsLuliaAfternoonCover)) return items;
      return items.map(function(it){
        if(!portalTodayItemIsLuliaIkramDayCentre(it)) return it;
        const base = it.__portalBaseSession || {};
        const endM = typeof portalHmToMinutes === 'function' ? portalHmToMinutes(String(base.end || '').trim()) : NaN;
        if(!Number.isFinite(endM) || endM <= 15 * 60) return it;
        const newEnd = '15:00';
        const newBase = Object.assign({}, base, {
          end: newEnd,
          timeSlotLabel: '',
          __portalLuliaIkramCutoff: true
        });
        const newTime = typeof rosterSlotTimeLabel === 'function' ? rosterSlotTimeLabel(newBase) : '11 to 3';
        const ts = typeof portalSessionRowTimestamps === 'function'
          ? portalSessionRowTimestamps(sessionDateKey, newBase.start || base.start, newEnd, anchor)
          : { sessionStartTs: it.sessionStartTs, sessionEndTs: it.sessionEndTs };
        return Object.assign({}, it, {
          time: newTime,
          sessionEndTs: ts.sessionEndTs,
          __portalBaseSession: newBase,
          __portalLuliaIkramCutoff: true
        });
      });
    }
    function portalTodayScheduleViewCardDedupeKey(it){
      if(!it) return '';
      if(it.kind === 'client' || it.kind === 'available'){
        const base = it.__portalBaseSession ? it.__portalBaseSession : (it || {});
        const skParts = String(it.sessionKey || '').split('|');
        const cid = portalCanonicalTodayClientKey(
          it.clientId || base.clientId,
          it.name || base.clientDisplay || base.clientName
        );
        if(!cid || cid === 'available' || cid === 'closed' || cid === 'meeting' || cid === 'training' || cid === 'shadowing') return '';
        const start = typeof portalCanonicalHmToken === 'function'
          ? portalCanonicalHmToken(base.start || skParts[1] || '')
          : String(base.start || skParts[1] || '').trim();
        const end = typeof portalCanonicalHmToken === 'function'
          ? portalCanonicalHmToken(base.end || '')
          : String(base.end || '').trim();
        const venue = portalNormKeyStr(it.sessionVenue != null ? it.sessionVenue : base.venue);
        return [cid, start, end, venue].join('|');
      }
      return String(it.sessionKey || '').trim();
    }
    function portalTodaySlotOccupancyKey(it){
      const base = it && it.__portalBaseSession ? it.__portalBaseSession : {};
      const skParts = String(it && it.sessionKey || '').split('|');
      const start = typeof portalCanonicalHmToken === 'function'
        ? portalCanonicalHmToken(base.start || skParts[1] || '')
        : String(base.start || skParts[1] || '').trim();
      const end = typeof portalCanonicalHmToken === 'function'
        ? portalCanonicalHmToken(base.end || '')
        : String(base.end || '').trim();
      const staff = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : base.staffId);
      const venue = portalNormKeyStr(it && it.sessionVenue != null ? it.sessionVenue : base.venue);
      return [start, end, staff, venue].join('|');
    }
    function portalDedupeTodayScheduleViewCards(items){
      if(!Array.isArray(items) || !items.length) return items || [];
      const makeupSlotKeys = Object.create(null);
      items.forEach(function(it){
        if(!it || !it.portalOverrideMakeUpTag) return;
        const occ = portalTodaySlotOccupancyKey(it);
        if(occ) makeupSlotKeys[occ] = true;
      });
      const seen = Object.create(null);
      const out = [];
      items.forEach(function(it){
        if(it && it.kind === 'client' && !it.portalOverrideMakeUpTag){
          const occ = portalTodaySlotOccupancyKey(it);
          if(occ && makeupSlotKeys[occ]){
            const ov = it.__portalScheduleOverride;
            const isMakeupRow = ov && String(ov.override_type || '').trim() === 'client_replace_in_slot';
            if(!isMakeupRow) return;
          }
        }
        const k = portalTodayScheduleViewCardDedupeKey(it);
        if(k){
          if(seen[k]) return;
          seen[k] = true;
        }
        out.push(it);
      });
      return out;
    }

    /** Selected-day session list (overview “Today” block): anchor = `getViewAnchorCalendarDate(DEMO_VIEW_DAY)` — live calendar or Week/Term URL date lock. Optional `calendarIsoOverride` (YYYY-MM-DD) pins an exact day (next-session preview). */
    function buildSelectedDayViewFromLauraModel(modelOverride, calendarIsoOverride){
      const viewDay = String(DEMO_VIEW_DAY).trim();
      const staffId = portalAuthStaffRosterId();
      if(staffId && !calendarIsoOverride && typeof portalIsViewingLiveCalendarToday === 'function'
        && portalIsViewingLiveCalendarToday()
        && typeof portalStaffMergeMachineSessionsIfShiftWithoutTodayCards === 'function'){
        try{ portalStaffMergeMachineSessionsIfShiftWithoutTodayCards(staffId); }catch(_){}
      }
      const _rtPool = String(staffRoleTrackForTodayBuild() || 'swimming').toLowerCase().replace(/[\s_-]+/g,'');
      const supportHidePoolNote = _rtPool === 'support' || _rtPool === 'supportlead';
      const isoPin = String(calendarIsoOverride || '').trim().slice(0, 10);
      const useIsoPin = /^\d{4}-\d{2}-\d{2}$/.test(isoPin);
      let anchor = null;
      if(useIsoPin && typeof portalParseIsoDateLocal === 'function'){
        anchor = portalParseIsoDateLocal(isoPin);
      }
      if(!anchor || isNaN(anchor.getTime())) anchor = getViewAnchorCalendarDate(viewDay);
      let sessionDateKey = useIsoPin
        ? isoPin
        : (typeof portalIsoYmdFromDate === 'function'
          ? portalIsoYmdFromDate(anchor)
          : `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(anchor.getDate()).padStart(2, '0')}`);
      const anchorDayWord = anchor && !isNaN(anchor.getTime())
        ? anchor.toLocaleDateString('en-GB', { weekday: 'long' })
        : viewDay;
      let baseModel = (Array.isArray(modelOverride) && modelOverride.length)
        ? modelOverride
        : (Array.isArray(sessionsModel) ? sessionsModel : []);
      if(staffId && !baseModel.length && typeof window.portalBootstrapFromMachineFallback === 'function'){
        const fbAllowed = typeof portalStaffMachineBundleFallbackAllowed !== 'function'
          || portalStaffMachineBundleFallbackAllowed(staffId, sessionDateKey);
        if(fbAllowed){
        try{
          const fb = window.portalBootstrapFromMachineFallback(staffId);
          if(fb && fb.boot && Array.isArray(fb.boot.sessionsModel) && fb.boot.sessionsModel.length){
            baseModel = fb.boot.sessionsModel;
            sessionsModel = fb.boot.sessionsModel;
            if(fb.boot.clientNotesById){
              clientNotesById = Object.assign({}, clientNotesById || {}, fb.boot.clientNotesById);
            }
          }
        }catch(_fb){}
        }
      }
      if(staffId && baseModel.length && !useIsoPin){
        const hasStaffOnIso = baseModel.some(function(s){
          return String(s.staffId || '').toLowerCase() === staffId
            && normaliseIsoDate(s.session_date || s.sessionDate) === sessionDateKey;
        });
        if(!hasStaffOnIso){
          var shiftExpected = typeof portalStaffHasShiftOnCalendarDate === 'function'
            && portalStaffHasShiftOnCalendarDate(sessionDateKey, staffId) === true;
          if(!shiftExpected && typeof portalTermStaffExtraCalendarDates === 'function'){
            shiftExpected = portalTermStaffExtraCalendarDates(staffId).indexOf(sessionDateKey) >= 0;
          }
          if(shiftExpected && typeof window.portalBootstrapFromMachineFallback === 'function'
            && (typeof portalStaffMachineBundleFallbackAllowed !== 'function'
              || portalStaffMachineBundleFallbackAllowed(staffId, sessionDateKey))){
            try{
              const fbShift = window.portalBootstrapFromMachineFallback(staffId);
              if(fbShift && fbShift.boot && Array.isArray(fbShift.boot.sessionsModel)){
                const onIso = fbShift.boot.sessionsModel.some(function(s){
                  return String(s.staffId || '').toLowerCase() === staffId
                    && normaliseIsoDate(s.session_date || s.sessionDate) === sessionDateKey;
                });
                if(onIso){
                  baseModel = fbShift.boot.sessionsModel;
                  sessionsModel = fbShift.boot.sessionsModel;
                  if(fbShift.boot.clientNotesById){
                    clientNotesById = Object.assign({}, clientNotesById || {}, fbShift.boot.clientNotesById);
                  }
                }
              }
            }catch(_fbShift){}
          }
        }
        if(!baseModel.some(function(s){
          return String(s.staffId || '').toLowerCase() === staffId
            && normaliseIsoDate(s.session_date || s.sessionDate) === sessionDateKey;
        }) && typeof portalBestStaffRosterIsoForWeekday === 'function'
          && !portalCalendarIsoUsesSummerDatedRosterOnly(sessionDateKey)){
          const altIso = portalBestStaffRosterIsoForWeekday(baseModel, staffId, anchorDayWord, anchor);
          const floor = portalTermSummerRosterFromIso();
          if(altIso && (!floor || altIso >= floor)) sessionDateKey = altIso;
        }
      }
      let programmeWidePack = null;
      if(staffId){
        try{
          var wideIso = useIsoPin ? isoPin : sessionDateKey;
          programmeWidePack = typeof portalStaffCollectProgrammeWideSessionsInline === 'function'
            ? portalStaffCollectProgrammeWideSessionsInline(wideIso, staffId)
            : null;
          if(programmeWidePack && programmeWidePack.active && Array.isArray(programmeWidePack.sessionsModel)
            && programmeWidePack.sessionsModel.length){
            baseModel = programmeWidePack.sessionsModel;
            if(programmeWidePack.clientNotesById){
              clientNotesById = Object.assign({}, clientNotesById || {}, programmeWidePack.clientNotesById);
            }
            if(typeof portalApplyClientsInfoToNotes === 'function') portalApplyClientsInfoToNotes();
          }else{
            programmeWidePack = null;
          }
        }catch(_pw){ programmeWidePack = null; }
      }
      const todaySessionsAfterFilter = baseModel.filter(function(s){
        if(programmeWidePack){
          if(useIsoPin) return normaliseIsoDate(s.session_date || s.sessionDate) === isoPin;
          if(typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'
            && !portalSessionSpreadsheetRowMatchesCalendarDate(s, sessionDateKey, anchorDayWord)) return false;
          /* ES-module scope check is not ready while classic scripts render — fall back to the inline check. */
          if(typeof window.portalLeadSpreadsheetSessionInScopeForLead === 'function'){
            return window.portalLeadSpreadsheetSessionInScopeForLead(
              s,
              sessionDateKey,
              programmeWidePack.leadKey,
              programmeWidePack.scopes
            );
          }
          if(typeof portalStaffLeadSessionRowInScope === 'function'){
            return portalStaffLeadSessionRowInScope(s, sessionDateKey, programmeWidePack.scopes);
          }
          return true;
        }
        if(String(s.staffId || '').toLowerCase() !== staffId) return false;
        if(useIsoPin) return normaliseIsoDate(s.session_date || s.sessionDate) === isoPin;
        return typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'
          && portalSessionSpreadsheetRowMatchesCalendarDate(s, sessionDateKey, anchorDayWord);
      }).filter(function(s){
        return !portalStaffDashboardOmitSpreadsheetSession(s, anchorDayWord);
      });
      const todaySessionsAfterDedupe = portalDedupeRosterSpreadsheetSessions(
        todaySessionsAfterFilter,
        programmeWidePack ? { programmeWide: true } : null
      );
      const primary = portalUpgradeTodayItemsWithAbsentOverrides(
        portalInjectAbsentCardsAlongsideMakeup(
        todaySessionsAfterDedupe
        .sort((a, b) => Number(normalizeTimeForSort(a.start)) - Number(normalizeTimeForSort(b.start)))
        .map(s => {
          let ov = portalTodayScheduleOverrideForSession(s, sessionDateKey);
          if((!ov || String(ov.override_type || '').trim() !== 'client_replace_in_slot')
            && typeof portalReplaceOverrideForSessionAnchor === 'function'){
            const anchorReplace = portalReplaceOverrideForSessionAnchor(s, sessionDateKey);
            if(anchorReplace) ov = anchorReplace;
          }
          const manualOv = String(s && s.override || '').trim().toUpperCase();
          const replaceNotSameCalendarDay = !!(ov && ov.override_type === 'client_replace_in_slot' && typeof portalCalendarDateIsSelectedDashboardDay === 'function' && !portalCalendarDateIsSelectedDashboardDay(sessionDateKey));
          const sessionVenue = String(s.venue || '').trim() || '—';
          const meta = {
            __portalBaseSession: s,
            sessionVenue,
            scheduleAdminAdjusted: !!(ov && !replaceNotSameCalendarDay),
            __portalScheduleOverride: replaceNotSameCalendarDay ? null : (ov || null)
          };
          if(portalSpreadsheetSlotClosedLike(s) && !portalSessionHasSlotOpenOverride(s, sessionDateKey) && !portalSessionHasReplaceMakeupOverride(s, sessionDateKey)) return null;
          if(ov && ov.override_type === 'instructor_reassign'){
            const cov = String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase();
            if(cov) return null;
          }
          // The slot was reassigned to a cover instructor — drop it even when a
          // higher-priority override (e.g. a client absence) outranked the reassign
          // in the picker, so the original worker does not see a slot they're off.
          if(typeof portalSessionStaffReassignedOff === 'function' && portalSessionStaffReassignedOff(s, sessionDateKey)) return null;
          let st = sessionModelStatus(s);
          const time = rosterSlotTimeLabel(s);
          const activity = (s.activity || 'Swimming').trim();
          const _rowTs = portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor);
          const sessionStartTs = _rowTs.sessionStartTs;
          const sessionEndTs = _rowTs.sessionEndTs;
          const dutyLabel = portalRosterDutySlotLabel(s);
          if(dutyLabel){
            const dutyKind = dutyLabel === 'HOME' ? 'home' : 'manager';
            const dutyArea = dutyLabel === 'HOME'
              ? 'HOME'
              : String(s.rosterArea || s.area || 'Hub · Manager').trim();
            return Object.assign({
              time,
              kind: dutyKind,
              clientId: String(s.clientId || '').trim().toLowerCase() || dutyKind,
              name: dutyLabel,
              activity,
              areaLabel: dutyArea,
              poolLocationLabel: null,
              poolTier: null,
              showPoolSymbol: false,
              showSpecialty: false,
              specialtyLabel: '',
              general: dutyLabel === 'HOME' ? 'Working from home.' : 'Manager on duty.',
              specialty: '—',
              openSheet: false,
              sessionKey: `${sessionDateKey}|${s.start}|${String(s.clientId || dutyKind).toLowerCase()}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              portalOverrideSuppressReviewOrange: true,
            }, meta);
          }
          if(portalSessionHasSlotOpenOverride(s, sessionDateKey) && portalSpreadsheetSlotClosedLike(s)){
            const slotOp = typeof portalFindSlotOpenOverrideForSession === 'function' ? portalFindSlotOpenOverrideForSession(s, sessionDateKey) : null;
            const disp = String(s.clientDisplay || s.clientName || '').trim();
            const nm = disp && disp.toLowerCase() !== 'closed' ? disp : 'Open slot';
            const cid0 = String(s.clientId || '').trim().toLowerCase() || 'closed';
            const cOpen = clientNotesById[cid0] || { name: nm, generalLead: '', specialty: '', specialtyClimbing: '', specialtyFitness: '', generalInfoSheet: '' };
            const genOpen = clientGeneralBodyFromNotes(cOpen, s);
            let poolLocOpen = resolvePoolLocationLabelFromSession(s, activity, cOpen, viewDay);
            if(supportHidePoolNote) poolLocOpen = null;
            const areaOpen = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
            const showSpecOpen = !isBespokeActivity(activity);
            const reasonOpen = String(slotOp && slotOp.reason || '').trim();
            return Object.assign({
              time,
              kind: 'client',
              clientId: cid0,
              name: cOpen.name || nm,
              activity,
              areaLabel: areaOpen,
              poolLocationLabel: poolLocOpen,
              poolTier: poolTierForAreaNoteRow(s, activity, cOpen, viewDay, supportHidePoolNote),
              showPoolSymbol: !!(poolLocOpen || areaOpen),
              showSpecialty: showSpecOpen,
              specialtyLabel: specialtyInfoTitle(activity),
              general: (reasonOpen || 'This block was closed on the rota and has been reopened for you for this date.') + (genOpen ? (' ' + genOpen) : ''),
              specialty: showSpecOpen ? pickSpecialtyBody(cOpen, activity) : '',
              openSheet: true,
              sessionKey: portalBuildSessionReviewKey(sessionDateKey, s, anchorDayWord, cid0),
              sessionStartTs,
              sessionEndTs,
              scheduleAdminAdjusted: true,
              __portalScheduleOverride: slotOp || ov || null,
              portalOverrideCardTone: 'blue',
              portalOverrideAlertPill: ''
            }, meta);
          }
          if(manualOv === 'CLOSED' && !portalSessionHasSlotOpenOverride(s, sessionDateKey)){
            return Object.assign({
              time,
              kind: 'closed',
              name: 'Closed',
              areaLabel: '',
              general: 'Closed',
              specialty: '—',
              activity: '',
              poolTier: null,
              showPoolSymbol: false,
              openSheet: false,
              sessionKey: `${sessionDateKey}|${s.start}|${s.clientId}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'red',
              portalOverrideSymbolText: 'Closed'
            }, meta);
          }
          if(manualOv === 'NO_CLIENT'){
            const cNo = clientNotesById.available;
            const showSpecNo = !isBespokeActivity(activity);
            return Object.assign({
              time,
              kind: 'available',
              clientId: s.clientId,
              name: 'No Participant',
              activity,
              areaLabel: '',
              poolLocationLabel: null,
              poolTier: poolTierForAreaNoteRow(s, activity, cNo, viewDay, supportHidePoolNote),
              showPoolSymbol: true,
              showSpecialty: showSpecNo,
              specialtyLabel: specialtyInfoTitle(activity),
              general: `No participant. ${s.venue || ''} · ${(cNo && cNo.generalLead) || ''}`.trim(),
              specialty: showSpecNo ? pickSpecialtyBody(cNo, activity) : '',
              openSheet: false,
              sessionKey: `${sessionDateKey}|${s.start}|${String(s.clientId || '').toLowerCase()}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'red',
              portalOverrideSymbolText: 'No Participant'
            }, meta);
          }
          if(manualOv === 'ABSENT'){
            const baseId = String(s.clientId || '').trim().toLowerCase();
            const cAbs = clientNotesById[baseId] || { name: baseId || 'Participant', generalLead: '', specialty: '', specialtyClimbing: '', specialtyFitness: '', generalInfoSheet: '' };
            const showSpecAbs = !isBespokeActivity(activity);
            let poolLocationAbs = resolvePoolLocationLabelFromSession(s, activity, cAbs, viewDay);
            if(supportHidePoolNote) poolLocationAbs = null;
            const areaAbs = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
            return Object.assign({
              time,
              kind: 'client',
              clientId: baseId,
              name: cAbs.name || 'Participant',
              activity,
              areaLabel: areaAbs,
              poolLocationLabel: poolLocationAbs,
              poolTier: poolTierForAreaNoteRow(s, activity, cAbs, viewDay, supportHidePoolNote),
              showPoolSymbol: !!(poolLocationAbs || areaAbs),
              showSpecialty: showSpecAbs,
              specialtyLabel: specialtyInfoTitle(activity),
              general: `Absent. ${clientGeneralBodyFromNotes(cAbs, s)}`.trim(),
              specialty: showSpecAbs ? pickSpecialtyBody(cAbs, activity) : '',
              openSheet: true,
              sessionKey: `${sessionDateKey}|${s.start}|${baseId}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              actionsDisabled: true,
              detailsOpenAllowed: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'green',
              portalOverrideAlertPill: 'ABSENT'
            }, meta);
          }
          if(st === 'Closed' && !portalSessionHasSlotOpenOverride(s, sessionDateKey)){
            return Object.assign({
              time,
              kind: 'closed',
              name: 'Closed',
              areaLabel: '',
              general: 'Closed on the rota — no participant is assigned to this block.',
              specialty: '—',
              activity: '',
              poolTier: null,
              showPoolSymbol: false,
              openSheet: false,
              sessionKey: `${sessionDateKey}|${s.start}|${s.clientId}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: '',
              portalOverrideSymbolText: '',
              portalOverrideAlertPill: ''
            }, meta);
          }
          const adminAbsentOv = portalScheduleOverrideForSessionByType(s, sessionDateKey, 'client_absence_announced');
          const replaceOvSameSlot = portalScheduleOverrideForSessionByType(s, sessionDateKey, 'client_replace_in_slot');
          if(adminAbsentOv && !replaceOvSameSlot){
            const cAbs = portalClientNotesLookup(s.clientId) || clientNotesById[s.clientId] || {
              name: String(s.clientDisplay || s.clientName || s.clientId || 'Participant').trim() || 'Participant',
              generalLead: '', specialty: '', specialtyClimbing: '', specialtyFitness: '', generalInfoSheet: ''
            };
            const showSpec = !isBespokeActivity(activity);
            const skAbs = `${sessionDateKey}|${s.start}|${String(s.clientId || '').toLowerCase()}`;
            let poolLocationAbs = resolvePoolLocationLabelFromSession(s, activity, cAbs, viewDay);
            if(supportHidePoolNote) poolLocationAbs = null;
            const areaAbs = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
            return Object.assign({
              time,
              kind: 'client',
              clientId: s.clientId,
              name: cAbs.name || 'Participant',
              activity,
              areaLabel: areaAbs,
              poolLocationLabel: poolLocationAbs,
              poolTier: poolTierForAreaNoteRow(s, activity, cAbs, viewDay, supportHidePoolNote),
              showPoolSymbol: !!(poolLocationAbs || areaAbs),
              showSpecialty: showSpec,
              specialtyLabel: specialtyInfoTitle(activity),
              general: `Absent. ${clientGeneralBodyFromNotes(cAbs, s)}`.trim(),
              specialty: showSpec ? pickSpecialtyBody(cAbs, activity) : '',
              openSheet: true,
              sessionKey: skAbs,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              actionsDisabled: true,
              detailsOpenAllowed: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'green',
              portalOverrideAlertPill: 'ABSENT',
              __portalScheduleOverride: adminAbsentOv
            }, meta);
          }
          if(ov && ov.override_type === 'slot_clear_client' && !replaceOvSameSlot){
            const isCancelledByAdmin = !!(ov.payload && ov.payload.cancelled_by_admin);
            if(isCancelledByAdmin
              && !(typeof portalStaffHasRequestedTimeOffOnDate === 'function'
                && sessionDateKey
                && portalStaffHasRequestedTimeOffOnDate(sessionDateKey, STAFF_DASHBOARD_ID))){
              const cCan = portalTodayClientNotesForSession(s);
              const showSpecCan = !isBespokeActivity(activity);
              let poolLocationCan = resolvePoolLocationLabelFromSession(s, activity, cCan, viewDay);
              if(supportHidePoolNote) poolLocationCan = null;
              const areaCan = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
              return Object.assign({
                time,
                kind: 'client',
                clientId: String(s.clientId || '').trim().toLowerCase(),
                name: cCan.name || 'Participant',
                activity,
                areaLabel: areaCan,
                poolLocationLabel: poolLocationCan,
                poolTier: poolTierForAreaNoteRow(s, activity, cCan, viewDay, supportHidePoolNote),
                showPoolSymbol: !!(poolLocationCan || areaCan),
                showSpecialty: showSpecCan,
                specialtyLabel: specialtyInfoTitle(activity),
                general: `Cancelled (Today). ${clientGeneralBodyFromNotes(cCan, s)}`.trim(),
                specialty: showSpecCan ? pickSpecialtyBody(cCan, activity) : '',
                openSheet: true,
                sessionKey: `${sessionDateKey}|${s.start}|${String(s.clientId || '').toLowerCase()}`,
                sessionStartTs,
                sessionEndTs,
                noSessionFeedbackRequired: true,
                actionsDisabled: true,
                detailsOpenAllowed: true,
                portalOverrideSuppressReviewOrange: true,
                portalOverrideCardTone: 'green',
                portalOverrideAlertPill: 'CANCELLED',
                __portalScheduleOverride: ov
              }, meta);
            }
            const makeupFromClear = portalTryMakeupTodayCardFromOpenSlot(s, sessionDateKey, anchorDayWord, anchor, viewDay, supportHidePoolNote);
            if(makeupFromClear){
              return Object.assign({}, meta, makeupFromClear, {
                __portalScheduleOverride: makeupFromClear.__portalScheduleOverride,
                scheduleAdminAdjusted: true
              });
            }
            const c = clientNotesById.available;
            const showSpec = !isBespokeActivity(activity);
            return Object.assign({
              time,
              kind: 'available',
              clientId: s.clientId,
              name: 'NO PARTICIPANT',
              activity,
              areaLabel: '',
              poolLocationLabel: null,
              poolTier: poolTierForAreaNoteRow(s, activity, c, viewDay, supportHidePoolNote),
              showPoolSymbol: true,
              showSpecialty: showSpec,
              specialtyLabel: specialtyInfoTitle(activity),
              general: `Slot cleared — no participant. ${s.venue || ''} · ${c.generalLead || ''}`.trim(),
              specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
              openSheet: false,
              sessionKey: `${sessionDateKey}|${s.start}|${String(s.clientId || '').toLowerCase()}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'red',
              portalOverrideSymbolText: 'NO CLIENT'
            }, meta);
          }
          if(st === 'Available'){
            const makeupFromOpen = portalTryMakeupTodayCardFromOpenSlot(s, sessionDateKey, anchorDayWord, anchor, viewDay, supportHidePoolNote);
            if(makeupFromOpen){
              return Object.assign({}, meta, makeupFromOpen, {
                __portalScheduleOverride: makeupFromOpen.__portalScheduleOverride,
                scheduleAdminAdjusted: true
              });
            }
            const c = clientNotesById.available;
            let poolLocationLabel = resolvePoolLocationLabelFromSession(s, activity, c, viewDay);
            if(supportHidePoolNote) poolLocationLabel = null;
            const areaLabel = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
            const poolTier = poolTierForAreaNoteRow(s, activity, c, viewDay, supportHidePoolNote);
            const showPoolSymbol = !!(poolLocationLabel || areaLabel);
            const showSpec = !isBespokeActivity(activity);
            return Object.assign({
              time,
              kind: 'available',
              clientId: s.clientId,
              name: 'NO PARTICIPANT',
              activity,
              areaLabel,
              poolLocationLabel,
              poolTier,
              showPoolSymbol,
              showSpecialty: showSpec,
              specialtyLabel: specialtyInfoTitle(activity),
              general: `No participant yet — slot open for new bookings. ${s.venue || ''} · ${c.generalLead || ''}`.trim(),
              specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
              openSheet: false,
              sessionKey: `${sessionDateKey}|${s.start}|${s.clientId}`,
              sessionStartTs,
              sessionEndTs,
              noSessionFeedbackRequired: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'red',
              portalOverrideSymbolText: 'No Participant'
            }, meta);
          }
          let effClientId = String(s.clientId || '').trim().toLowerCase();
          let nameFromReplace = '';
          if(ov && ov.override_type === 'client_replace_in_slot' && ov.payload){
            const rep = portalOverrideReplacementClientId(ov.payload);
            if(rep){
              effClientId = rep;
              nameFromReplace = portalOverrideReplacementClientName(ov.payload);
            }
          }
          const c = clientNotesById[effClientId] || (nameFromReplace ? { name: nameFromReplace, generalLead: '', specialty: '', specialtyClimbing: '', specialtyFitness: '', generalInfoSheet: '' } : null);
          if(!c) return null;
          const hasReplaceOv = !!(ov && ov.override_type === 'client_replace_in_slot');
          const anchorNotesForMakeup = hasReplaceOv
            ? (portalClientNotesLookup(String(s.clientId || '').trim().toLowerCase()) || { name: '' })
            : null;
          const poolNotesForRow = hasReplaceOv && anchorNotesForMakeup
            ? anchorNotesForMakeup
            : c;
          let poolLocationLabel = resolvePoolLocationLabelFromSession(s, activity, poolNotesForRow, viewDay);
          if(supportHidePoolNote) poolLocationLabel = null;
          const areaLabel = rosterAreaLabelForSession(s, activity, supportHidePoolNote, viewDay);
          const poolTier = poolTierForAreaNoteRow(s, activity, poolNotesForRow, viewDay, supportHidePoolNote);
          const showPoolSymbol = !!(poolLocationLabel || areaLabel);
          const showSpec = !isBespokeActivity(activity);
          const sessionKey = portalBuildSessionReviewKey(sessionDateKey, s, anchorDayWord, effClientId);
          const isTrialOv = (hasReplaceOv && portalOverrideIsTrial(ov)) || portalRosterParticipantNameLooksTrial(c.name || nameFromReplace);
          const replacedVisual = manualOv === 'REPLACED';
          const isMakeUpCard = !isTrialOv && (hasReplaceOv || replacedVisual);
          const makeUpPink = isMakeUpCard;
          const slotWasUpdated = typeof portalSessionRosterTimeWasUpdated === 'function'
            && portalSessionRosterTimeWasUpdated(s, sessionDateKey);
          const generalBody = hasReplaceOv && anchorNotesForMakeup
            ? clientGeneralBodyForMakeupSession(anchorNotesForMakeup, c, s, activity, viewDay, supportHidePoolNote)
            : clientGeneralBodyFromNotes(c, s);
          return Object.assign({
            time,
            kind: 'client',
            clientId: effClientId,
            name: portalParticipantDisplayName(c.name || nameFromReplace || effClientId),
            activity,
            areaLabel,
            poolLocationLabel,
            poolTier,
            showPoolSymbol,
            showSpecialty: showSpec,
            specialtyLabel: specialtyInfoTitle(activity),
            general: generalBody,
            specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
            openSheet: true,
            sessionKey,
            sessionStartTs,
            sessionEndTs,
            portalOverrideMakeUpTag: (hasReplaceOv || replacedVisual) && !isTrialOv,
            portalOverrideTrialTag: isTrialOv,
            portalOverrideCardTone: isMakeUpCard ? 'pink' : (slotWasUpdated ? 'blue' : (isTrialOv ? 'trial' : '')),
            portalOverrideSymbolText: isTrialOv ? 'Trial' : (isMakeUpCard ? 'Make Up' : ''),
            portalOverrideHideAdminBadge: false,
            portalOverrideAlertPill: slotWasUpdated ? 'UPDATED' : '',
            portalRosterTimeUpdated: !!slotWasUpdated
          }, meta);
        })
        .filter(Boolean),
        sessionDateKey,
        viewDay,
        anchor,
        supportHidePoolNote
      ),
        sessionDateKey
      );
      const extra = [];
      portalPickLatestInstructorCoverOverridesForStaff(staffId, sessionDateKey).forEach(function(ov){
        const cov = portalNormKeyStr(ov.payload && ov.payload.covering_staff_id) || portalNormKeyStr(staffId);
        const base = portalFindSpreadsheetSessionMatchingOverride(ov, anchorDayWord) || {
          day: anchorDayWord,
          start: portalHmFromDbTime(ov.anchor_start) || '09:00',
          end: portalHmFromDbTime(ov.anchor_end) || portalHmFromDbTime(ov.anchor_start) || '10:00',
          venue: ov.anchor_venue || '',
          clientId: String(ov.anchor_client_id || '').toLowerCase(),
          staffId: String(ov.anchor_staff_id || '').trim().toLowerCase(),
          status: 'Scheduled',
          activity: String(ov.payload && ov.payload.activity || ov.payload && ov.payload.service || 'Swimming').trim() || 'Swimming',
          rosterService: String(ov.payload && ov.payload.service || '').trim(),
          session_date: sessionDateKey
        };
        const coverWinStart = portalHmFromDbTime(ov.anchor_start) || base.start;
        const coverWinEnd = portalHmFromDbTime(ov.anchor_end) || base.end || coverWinStart;
        const s = Object.assign({}, base, { staffId: cov });
        let st2 = sessionModelStatus(s);
        /* Admin absence / cancellation on a covered slot can be anchored to EITHER the
           original instructor (base.staffId) or the cover (s.staffId = Luliya). Check both
           so the cover instructor still sees the green ABSENT / CANCELLED card. */
        const slotOvBase = portalTodayScheduleOverrideForSession(base, sessionDateKey);
        const slotOvCover = portalTodayScheduleOverrideForSession(s, sessionDateKey);
        const isAbsenceOrClearOv = function(o){
          const t = o && String(o.override_type || '').trim();
          return t === 'client_absence_announced' || t === 'slot_clear_client';
        };
        let slotOv = slotOvBase;
        if(isAbsenceOrClearOv(slotOvCover) && !isAbsenceOrClearOv(slotOvBase)) slotOv = slotOvCover;
        if(st2 === 'Closed' || st2 === 'Available') return;
        if(slotOv && slotOv.override_type === 'slot_clear_client'){
          const isCancelledByAdmin = !!(slotOv.payload && slotOv.payload.cancelled_by_admin);
          if(isCancelledByAdmin
            && !(typeof portalStaffHasRequestedTimeOffOnDate === 'function'
              && sessionDateKey
              && portalStaffHasRequestedTimeOffOnDate(sessionDateKey, STAFF_DASHBOARD_ID))){
            const cCan = portalTodayClientNotesForSession(s);
            const activityCan = (s.activity || 'Swimming').trim();
            const timeCan = rosterSlotTimeLabel(s);
            let poolLocationCan = resolvePoolLocationLabelFromSession(s, activityCan, cCan, viewDay);
            if(supportHidePoolNote) poolLocationCan = null;
            const areaCan = rosterAreaLabelForSession(s, activityCan, supportHidePoolNote);
            const showSpecCan = !isBespokeActivity(activityCan);
            extra.push(Object.assign({
              time: timeCan,
              kind: 'client',
              clientId: base.clientId,
              name: cCan.name || 'Participant',
              activity: activityCan,
              areaLabel: areaCan,
              poolLocationLabel: poolLocationCan,
              poolTier: poolTierForAreaNoteRow(s, activityCan, cCan, viewDay, supportHidePoolNote),
              showPoolSymbol: !!(poolLocationCan || areaCan),
              showSpecialty: showSpecCan,
              specialtyLabel: specialtyInfoTitle(activityCan),
              general: `Cancelled (Today). ${clientGeneralBodyFromNotes(cCan, s)}`.trim(),
              specialty: showSpecCan ? pickSpecialtyBody(cCan, activityCan) : '',
              openSheet: true,
              sessionKey: `${sessionDateKey}|${s.start}|${String(base.clientId || '').toLowerCase()}`,
              ...portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor),
              noSessionFeedbackRequired: true,
              actionsDisabled: true,
              detailsOpenAllowed: true,
              portalOverrideSuppressReviewOrange: true,
              portalOverrideCardTone: 'green',
              portalOverrideAlertPill: 'CANCELLED',
              scheduleAdminAdjusted: true,
              sessionVenue: String(s.venue || '').trim() || '—',
              __portalBaseSession: base,
              __portalScheduleOverride: slotOv
            }));
            return;
          }
          const c0 = clientNotesById.available;
          const activity0 = (s.activity || 'Swimming').trim();
          const time0 = rosterSlotTimeLabel(s);
          extra.push(Object.assign({
            time: time0,
            kind: 'available',
            clientId: base.clientId,
            name: 'NO PARTICIPANT',
            activity: activity0,
            areaLabel: '',
            poolLocationLabel: null,
            poolTier: poolTierForAreaNoteRow(s, activity0, c0, viewDay, supportHidePoolNote),
            showPoolSymbol: true,
            showSpecialty: !isBespokeActivity(activity0),
            specialtyLabel: specialtyInfoTitle(activity0),
            general: `Slot cleared — no participant. ${s.venue || ''} · ${c0.generalLead || ''}`.trim(),
            specialty: !isBespokeActivity(activity0) ? pickSpecialtyBody(c0, activity0) : '',
            openSheet: false,
            sessionKey: `${sessionDateKey}|${s.start}|${String(base.clientId || '').toLowerCase()}`,
            ...portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor),
            noSessionFeedbackRequired: true,
            portalOverrideSuppressReviewOrange: true,
            portalOverrideCardTone: 'red',
            portalOverrideSymbolText: 'NO CLIENT',
            scheduleAdminAdjusted: true,
            sessionVenue: String(s.venue || '').trim() || '—',
            __portalBaseSession: base,
            __portalScheduleOverride: ov
          }));
          return;
        }
        if(slotOv && slotOv.override_type === 'client_absence_announced'){
          const cAbs = clientNotesById[base.clientId];
          if(!cAbs) return;
          const activityA = (s.activity || 'Swimming').trim();
          const timeA = rosterSlotTimeLabel(s);
          let poolLocationAbs = resolvePoolLocationLabelFromSession(s, activityA, cAbs, viewDay);
          if(supportHidePoolNote) poolLocationAbs = null;
          const areaAbs = rosterAreaLabelForSession(s, activityA, supportHidePoolNote);
          const poolTier = poolTierForAreaNoteRow(s, activityA, cAbs, viewDay, supportHidePoolNote);
          const showSpec = !isBespokeActivity(activityA);
          extra.push(Object.assign({
            time: timeA,
            kind: 'client',
            clientId: base.clientId,
            name: cAbs.name || 'Participant',
            activity: activityA,
            areaLabel: areaAbs,
            poolLocationLabel: poolLocationAbs,
            poolTier,
            showPoolSymbol: !!(poolLocationAbs || areaAbs),
            showSpecialty: showSpec,
            specialtyLabel: specialtyInfoTitle(activityA),
            general: `Absent. ${clientGeneralBodyFromNotes(cAbs, s)}`.trim(),
            specialty: showSpec ? pickSpecialtyBody(cAbs, activityA) : '',
            openSheet: true,
            sessionKey: `${sessionDateKey}|${s.start}|${String(base.clientId || '').toLowerCase()}`,
            ...portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor),
            noSessionFeedbackRequired: true,
            actionsDisabled: true,
            detailsOpenAllowed: true,
            portalOverrideSuppressReviewOrange: true,
            portalOverrideCardTone: 'green',
            portalOverrideAlertPill: 'ABSENT',
            scheduleAdminAdjusted: true,
            sessionVenue: String(s.venue || '').trim() || '—',
            __portalBaseSession: base,
            __portalScheduleOverride: slotOv
          }));
          return;
        }
        const effCoverId = portalEffectiveClientIdForReview(base, sessionDateKey);
        let nameFromReplaceC = '';
        if(slotOv && slotOv.override_type === 'client_replace_in_slot' && slotOv.payload){
          nameFromReplaceC = portalOverrideReplacementClientName(slotOv.payload);
        }
        const c = portalClientNotesLookup(effCoverId) || portalTodayClientNotesForSession(Object.assign({}, base, { clientId: effCoverId || base.clientId }));
        if(!c || !String(c.name || effCoverId || base.clientId || '').trim()) return;
        const activity = (s.activity || 'Swimming').trim();
        const time = rosterSlotTimeLabel(s);
        const sessionKey = portalBuildSessionReviewKey(sessionDateKey, s, anchorDayWord, effCoverId);
        let poolLocationLabel = resolvePoolLocationLabelFromSession(s, activity, c, viewDay);
        if(supportHidePoolNote) poolLocationLabel = null;
        const areaLabel = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
        const poolTier = poolTierForAreaNoteRow(s, activity, c, viewDay, supportHidePoolNote);
        const showPoolSymbol = !!(poolLocationLabel || areaLabel);
        const showSpec = !isBespokeActivity(activity);
        const hasReplaceCoverOv = !!(slotOv && slotOv.override_type === 'client_replace_in_slot');
        const isTrialCoverOv = hasReplaceCoverOv && portalOverrideIsTrial(slotOv);
        const isInstructorCoverOv = String(ov.override_type || '').trim() === 'instructor_reassign';
        const coverTs = portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor);
        const coverItemProbe = { sessionEndTs: coverTs.sessionEndTs, sessionKey };
        const makeUpPinkCover = !isInstructorCoverOv && !isTrialCoverOv && hasReplaceCoverOv && !isSessionEndedForFeedback(coverItemProbe);
        extra.push({
          time,
          kind: 'client',
          clientId: effCoverId,
          name: c.name || nameFromReplaceC || effCoverId,
          activity,
          areaLabel,
          poolLocationLabel,
          poolTier,
          showPoolSymbol,
          showSpecialty: showSpec,
          specialtyLabel: specialtyInfoTitle(activity),
          general: clientGeneralBodyFromNotes(c, s),
          specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
          openSheet: true,
          sessionKey,
          sessionStartTs: coverTs.sessionStartTs,
          sessionEndTs: coverTs.sessionEndTs,
          scheduleAdminAdjusted: true,
          portalOverrideMakeUpTag: makeUpPinkCover,
          portalOverrideTrialTag: isTrialCoverOv,
          portalOverrideCardTone: isTrialCoverOv ? 'trial' : (makeUpPinkCover ? 'pink' : ''),
          portalOverrideSymbolText: isTrialCoverOv ? 'Trial' : (makeUpPinkCover ? 'Make Up' : ''),
          portalOverrideHideAdminBadge: false,
          portalOverrideAlertPill: '',
          sessionVenue: String(s.venue || '').trim() || '—',
          __portalBaseSession: base,
          __portalScheduleOverride: ov
        });
      });
      // Admin-added Training / Shadowing sessions (override_type='session_add').
      // anchor_staff_id is stored alnum-only (normalizeSchedAnchorStaffId in admin),
      // so normalise both sides the same way before matching.
      const normStaffKey = function(v){ return String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); };
      const staffIdNorm = normStaffKey(staffId);
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(sessionDateKey)) return;
        if(String(ov.status || 'active') !== 'active') return;
        if(ov.override_type !== 'session_add') return;
        if(normStaffKey(ov.anchor_staff_id) !== staffIdNorm) return;
        const kind = String(ov.payload && ov.payload.kind || '').trim().toLowerCase();
        const displayTitle = kind === 'shadowing' ? 'Shadowing' : (kind === 'meeting' ? 'Team meeting' : 'Training session');
        const slug = kind === 'meeting' ? 'meeting' : (kind === 'shadowing' ? 'shadowing' : 'training');
        const cardTone = kind === 'shadowing' ? 'shadowing' : (kind === 'meeting' ? 'meeting' : 'training');
        const stT = portalHmFromDbTime(ov.anchor_start) || '09:00';
        const enT = portalHmFromDbTime(ov.anchor_end) || stT;
        const sT = { start: stT, end: enT, venue: ov.anchor_venue || '' };
        const note = String(ov.reason || (ov.payload && ov.payload.note) || '').trim();
        const tts = portalSessionRowTimestamps(sessionDateKey, stT, enT, anchor);
        // Corporate-yellow while scheduled; turns green with a "Completed" chip once the slot has ended.
        const trainingEnded = (typeof tts.sessionEndTs === 'number' && Date.now() > tts.sessionEndTs);
        const locRaw = String(ov.payload && ov.payload.location || '').trim().toLowerCase();
        const areaNote = portalSessionAddAreaNoteLabel(locRaw);
        const peopleChips = (kind === 'meeting' || kind === 'training') ? [] : portalSessionAddPeopleChips(kind, ov.payload, ov, sessionDateKey);
        const meetingDetail = kind === 'meeting'
          ? portalSessionAddMeetingDetail(ov.payload)
          : (kind === 'training' ? portalSessionAddTrainingDetail(ov.payload, staffRoleTrackForTodayBuild()) : null);
        const venueTitle = String(ov.anchor_venue || '').trim()
          .replace(/\S+/g, function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
        extra.push({
          time: rosterSlotTimeLabel(sT),
          kind: 'client',
          clientId: slug,
          name: displayTitle,
          activity: displayTitle,
          areaLabel: areaNote,
          poolLocationLabel: areaNote,
          showPoolSymbol: !!areaNote,
          showSpecialty: false,
          specialtyLabel: '',
          general: note || (displayTitle + ' (added by admin) — paid at £13.50/h.'),
          specialty: '',
          openSheet: false,
          sessionKey: sessionDateKey + '|' + stT + '|' + slug,
          sessionStartTs: tts.sessionStartTs,
          sessionEndTs: tts.sessionEndTs,
          noSessionFeedbackRequired: true,
          actionsDisabled: true,
          detailsOpenAllowed: true,
          portalOverrideSuppressReviewOrange: true,
          portalOverrideCardTone: trainingEnded ? 'green' : cardTone,
          portalOverrideAlertPill: trainingEnded ? 'COMPLETED' : '',
          portalSessionAddChips: peopleChips,
          portalSessionAddMeetingDetail: meetingDetail,
          portalOverrideSymbolText: '',
          scheduleAdminAdjusted: true,
          portalOverrideHideAdminBadge: true,
          sessionVenue: venueTitle || '—',
          __portalScheduleOverride: ov
        });
      });
      function portalTodayItemSortKey(it){
        const sk = String(it.sessionKey || '');
        const p = sk.split('|');
        return p[1] || '00:00';
      }
      /** Dedupe cover rows injected from instructor_reassign when roster already lists the same client slot. */
      function portalTodayItemClientSlotDedupeKey(it){
        const base = it && it.__portalBaseSession ? it.__portalBaseSession : (it || {});
        const skParts = String(it && it.sessionKey || '').split('|');
        const cid = String(it && it.clientId || base.clientId || '').trim().toLowerCase();
        if(!cid || cid === 'available' || cid === 'closed' || cid === 'meeting' || cid === 'training' || cid === 'shadowing') return '';
        const start = typeof portalCanonicalHmToken === 'function'
          ? portalCanonicalHmToken(base.start || skParts[1] || '')
          : String(base.start || skParts[1] || '').trim();
        const end = typeof portalCanonicalHmToken === 'function'
          ? portalCanonicalHmToken(base.end || '')
          : String(base.end || '').trim();
        const venue = portalNormKeyStr(it && it.sessionVenue != null ? it.sessionVenue : base.venue);
        return [cid, start, end, venue].join('|');
      }
      function portalDedupeInstructorCoverExtras(primaryItems, extraItems){
        if(!Array.isArray(primaryItems) || !Array.isArray(extraItems) || !extraItems.length) return extraItems || [];
        const seen = Object.create(null);
        primaryItems.forEach(function(it){
          const k = portalTodayItemClientSlotDedupeKey(it);
          if(k) seen[k] = true;
        });
        return extraItems.filter(function(it){
          const ov = it && it.__portalScheduleOverride;
          if(!ov || String(ov.override_type || '').trim() !== 'instructor_reassign') return true;
          const k = portalTodayItemClientSlotDedupeKey(it);
          return !k || !seen[k];
        });
      }
      function portalSuppressAvailableWhenSlotFilled(items){
        if(!Array.isArray(items) || !items.length) return items || [];
        const filled = Object.create(null);
        items.forEach(function(it){
          if(!it || it.kind !== 'client') return;
          const cid = String(it.clientId || '').trim().toLowerCase();
          if(!cid || cid === 'available' || cid === 'closed') return;
          const ov = it && it.__portalScheduleOverride;
          if(ov && String(ov.override_type || '').trim() === 'instructor_reassign') return;
          filled[portalTodaySlotOccupancyKey(it)] = true;
        });
        return items.filter(function(it){
          if(!it || it.kind !== 'available') return true;
          return !filled[portalTodaySlotOccupancyKey(it)];
        });
      }
      var sortedToday = portalInjectOrphanMakeupOverrideCards(
        portalDedupeTodayScheduleViewCards(
          portalSuppressAvailableWhenSlotFilled(primary.concat(portalDedupeInstructorCoverExtras(primary, extra)))
        ),
        sessionDateKey,
        anchorDayWord,
        anchor,
        supportHidePoolNote,
        staffId
      ).sort(function(a, b){
        return Number(normalizeTimeForSort(portalTodayItemSortKey(a))) - Number(normalizeTimeForSort(portalTodayItemSortKey(b)));
      });
      var mergedToday = sortedToday;
      if(typeof portalMergeStaffLeadTodayAquaticCards === 'function'){
        mergedToday = portalMergeStaffLeadTodayAquaticCards(mergedToday, sessionDateKey, anchorDayWord);
      }
      if(typeof portalMergeStaffTodayFeedbackMergeGroups === 'function'){
        mergedToday = portalMergeStaffTodayFeedbackMergeGroups(mergedToday, sessionDateKey, anchorDayWord, staffId);
      }
      mergedToday = portalAttachShadowingObserverChips(
        mergedToday,
        sessionDateKey,
        staffId,
        String(dashboardData && dashboardData.staffName || '').trim()
      );
      if(typeof portalUpgradeTodayMakeupReplacePresentation === 'function'){
        mergedToday = portalUpgradeTodayMakeupReplacePresentation(mergedToday, sessionDateKey, anchorDayWord, supportHidePoolNote);
      }
      if(typeof portalSuppressAnchorClientWhenMakeupReplaced === 'function'){
        mergedToday = portalSuppressAnchorClientWhenMakeupReplaced(mergedToday, sessionDateKey, staffId);
      }
      if(typeof portalDedupeTodayScheduleViewCards === 'function'){
        mergedToday = portalDedupeTodayScheduleViewCards(mergedToday);
      }
      if(portalStaffKeyIsLulia(staffId)){
        mergedToday = portalApplyLuliaIkramCutoffToTodayItems(mergedToday, staffId, sessionDateKey, anchor);
      }
      return mergedToday;
    }
    var buildTodayFromLauraModel = buildSelectedDayViewFromLauraModel;
    try{ window.buildTodayFromLauraModel = buildTodayFromLauraModel; }catch(_){}
    try{ window.buildSelectedDayViewFromLauraModel = buildSelectedDayViewFromLauraModel; }catch(_){}

    function portalFormatNextSessionSectionHeading(sessionDate){
      const d = sessionDate instanceof Date && !isNaN(sessionDate.getTime()) ? sessionDate : null;
      if(!d) return 'NEXT SESSION';
      const num = typeof portalFormatPortalDateDdMmYyyy === 'function' ? portalFormatPortalDateDdMmYyyy(d) : '';
      return num ? `NEXT SESSION ${num}` : 'NEXT SESSION';
    }
    function portalIsViewingLiveCalendarToday(){
      if(typeof portalStaffIsHistoricalReviewDayMode === 'function' && portalStaffIsHistoricalReviewDayMode()) return false;
      const d = typeof portalResolveTodaySectionCalendarDate === 'function' ? portalResolveTodaySectionCalendarDate() : null;
      if(!d || isNaN(d.getTime())) return false;
      const now = new Date();
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return d0 === t0;
    }
    /** Block Today panel flashes until first full roster + term-calendar sync (live calendar day only). */
    function portalStaffLiveTodayAwaitingInitialSchedule(){
      if(typeof portalIsViewingLiveCalendarToday !== 'function' || !portalIsViewingLiveCalendarToday()) return false;
      try{
        if(window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__) return false;
        if(dashboardData && dashboardData.portalIdentityResolved === false) return true;
        if(!window.__PORTAL_STAFF_ROSTER_HYDRATED__) return true;
        /* Keep the Today cards on the brief "syncing" panel until schedule overrides have
           hydrated as well. Releasing on roster-only made staff with an instructor reassignment
           (e.g. Giuseppe) flash their pre-override sessions before the reassignment applied. The
           overrides flag is force-set to true on error/no-Supabase and via the settle/hydrate
           timers, so this can only hold the panel for the brief initial sync window. */
        if(!window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__) return true;
        return false;
      }catch(_){ return true; }
    }
    function portalStaffMarkInitialTodayScheduleUnsettled(){
      try{ window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__ = false; }catch(_){}
    }
    function portalStaffMarkInitialTodayScheduleSettled(){
      try{ window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__ = true; }catch(_){}
    }
    function portalStaffMarkRosterHydrated(){
      try{ window.__PORTAL_STAFF_ROSTER_HYDRATED__ = true; }catch(_){}
    }
    function portalStaffEnsureInitialTodayScheduleSettledSoon(delayMs){
      try{
        var wait = Number(delayMs) > 0 ? Number(delayMs) : 5000;
        if(window.__PORTAL_STAFF_INITIAL_TODAY_SETTLE_TIMER__){
          clearTimeout(window.__PORTAL_STAFF_INITIAL_TODAY_SETTLE_TIMER__);
          window.__PORTAL_STAFF_INITIAL_TODAY_SETTLE_TIMER__ = null;
        }
        window.__PORTAL_STAFF_INITIAL_TODAY_SETTLE_TIMER__ = setTimeout(function(){
          window.__PORTAL_STAFF_INITIAL_TODAY_SETTLE_TIMER__ = null;
          if(window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__) return;
          portalStaffMarkInitialTodayScheduleSettled();
          try{ if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay(); }catch(_){}
          try{ if(typeof renderToday === 'function') renderToday(); }catch(_){}
        }, wait);
      }catch(_){}
    }
    try{ window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__ = false; }catch(_){}
    try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = false; }catch(_){}
    try{ portalStaffEnsureInitialTodayScheduleSettledSoon(); }catch(_){}
    function portalStaffEnsureScheduleOverridesHydratedSoon(delayMs){
      try{
        var wait = Number(delayMs) > 0 ? Number(delayMs) : 6000;
        if(window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATE_TIMER__){
          clearTimeout(window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATE_TIMER__);
          window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATE_TIMER__ = null;
        }
        window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATE_TIMER__ = setTimeout(function(){
          window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATE_TIMER__ = null;
          if(window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__) return;
          if(typeof portalStaffKickScheduleOverridesHydrate === 'function'){
            void portalStaffKickScheduleOverridesHydrate({ timeoutMs: 500 });
          }else{
            try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
            try{ if(typeof renderToday === 'function') renderToday(); }catch(_){}
          }
        }, wait);
      }catch(_){}
    }
    try{ portalStaffEnsureScheduleOverridesHydratedSoon(); }catch(_){}
    /** Summer Term 2: shift-date list can include weekdays without a roster row — not a worked day. */
    function portalStaffSummerShiftDateWithoutRosterRow(isoYmd, staffId){
      try{
        const iso = normaliseIsoDate(isoYmd);
        const sid = String(staffId || '').trim().toLowerCase();
        if(!iso || !sid) return false;
        if(typeof portalCalendarIsoUsesSummerDatedRosterOnly !== 'function'
          || !portalCalendarIsoUsesSummerDatedRosterOnly(iso)) return false;
        if(typeof portalStaffHasShiftOnCalendarDate !== 'function'
          || portalStaffHasShiftOnCalendarDate(iso, sid) !== true) return false;
        if(typeof portalStaffHasDatedRowsForIso === 'function'
          && portalStaffHasDatedRowsForIso(iso, sid)) return false;
        return true;
      }catch(_){ return false; }
    }
    /** Live Today: staff has a dated shift on the anchor calendar day (Summer Term 2 timetable). */
    function portalStaffLiveTodayHasScheduledShift(staffId, anchorDate){
      try{
        const sid = String(staffId || '').trim().toLowerCase();
        if(!sid) return false;
        const anchor = anchorDate instanceof Date && !isNaN(anchorDate.getTime())
          ? anchorDate
          : (typeof portalResolveTodaySectionCalendarDate === 'function' ? portalResolveTodaySectionCalendarDate() : null);
        if(!anchor || isNaN(anchor.getTime())) return false;
        const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(anchor) : '';
        if(!iso) return false;
        if(typeof portalStaffHasShiftOnCalendarDate === 'function'){
          const onShift = portalStaffHasShiftOnCalendarDate(iso, sid);
          if(onShift === true){
            if(!portalStaffSummerShiftDateWithoutRosterRow(iso, sid)) return true;
          }
        }
        if(typeof portalStaffClientSessionsOnCalendarDate === 'function'){
          const dayWord = anchor.toLocaleDateString('en-GB', { weekday: 'long' });
          if(portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid)) return true;
        }
        if(typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
          && portalStaffHasInstructorCoverOnCalendarDate(iso, sid)) return true;
        return false;
      }catch(_){ return false; }
    }
    /** Same rules as This week “Off” (vacation, bank holiday, term red day) — live Today only; never block next-session preview builds. */
    function portalStaffTodayBlockIsOff(staffId){
      try{
        const sid = String(staffId || '').trim().toLowerCase();
        if(!sid) return false;
        if(typeof portalIsViewingLiveCalendarToday !== 'function' || !portalIsViewingLiveCalendarToday()) return false;
        const anchor = typeof portalResolveTodaySectionCalendarDate === 'function'
          ? portalResolveTodaySectionCalendarDate()
          : null;
        if(!anchor || isNaN(anchor.getTime())) return false;
        const dd = (typeof dashboardData !== 'undefined' && dashboardData) ? dashboardData : null;
        const halfWeeks = dd && Array.isArray(dd.termHalfTermWeekStarts) ? dd.termHalfTermWeekStarts : [];
        if(typeof isHalfTermDay === 'function' && isHalfTermDay(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), halfWeeks)) return true;
        const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(anchor) : '';
        if(iso && typeof portalTermStaffExtraCalendarDates === 'function' && portalTermStaffExtraCalendarDates(sid).indexOf(iso) >= 0){
          return false;
        }
        if(iso && typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
          && portalStaffHasInstructorCoverOnCalendarDate(iso, sid)){
          return false;
        }
        if(iso && portalStaffSummerShiftDateWithoutRosterRow(iso, sid)){
          const dayWord = anchor.toLocaleDateString('en-GB', { weekday: 'long' });
          if(typeof portalStaffClientSessionsOnCalendarDate === 'function'
            && portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid)) return false;
          return true;
        }
        if(iso && typeof portalTermStaffOffWeekdayOnDate === 'function' && portalTermStaffOffWeekdayOnDate(iso, sid)) return true;
        if(typeof portalTermCalendarDayIsRed === 'function'
          && portalTermCalendarDayIsRed(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), sid, halfWeeks)){
          return true;
        }
        if(iso && typeof portalTermStaffAwayOnDate === 'function' && portalTermStaffAwayOnDate(iso, sid)) return true;
        return false;
      }catch(_){ return false; }
    }
    /** Programme lead (John / Berta / Michelle) — support shift days without 1:1 client cards. */
    function portalStaffIsProgrammeLeadRosterKey(staffId){
      var k = String(staffId || '').trim().toLowerCase();
      return k === 'john' || k === 'berta' || k === 'michelle';
    }
    function portalStaffNormLeadScopeKey(v){
      return String(v || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
    }
    function portalStaffNormLeadService(v){
      var s = portalStaffNormLeadScopeKey(v);
      if(s.indexOf('daycentre') >= 0 || s.indexOf('daycenter') >= 0) return 'daycentre';
      if(s.indexOf('bespoke') >= 0) return 'bespoke';
      if(s.indexOf('multi') >= 0) return 'multi';
      if(s.indexOf('aquatic') >= 0) return 'aquatic';
      return s;
    }
    function portalStaffLeadScopesForStaffId(staffId){
      var sid = String(staffId || '').trim().toLowerCase();
      if(sid === 'john'){
        return [
          { weekdays: ['Monday', 'Friday'], serviceKeys: ['bespoke'], venues: ['swimfarm'], leadTeamBanner: true },
          { weekdays: ['Wednesday'], serviceKeys: ['multi', 'aquatic'], venues: ['acton'], leadTeamBanner: true },
          /* Sunday SwimFarm Multi-Activity: John teaches his own client per 45' slot; lead report at
             end covers the wider programme. Team banner (leadTeamBanner) lists who is on shift. */
          { weekdays: ['Sunday'], serviceKeys: ['multi'], venues: ['swimfarm'], leadTeamBanner: true }
        ];
      }
      if(sid === 'berta'){
        return [
          { weekdays: ['Wednesday'], serviceKeys: ['multi'], venues: ['acton'], programmeWideRoster: true },
          { weekdays: ['Sunday'], serviceKeys: ['multi'], venues: ['swimfarm'], programmeWideRoster: true }
        ];
      }
      if(sid === 'michelle'){
        return [{ weekdays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], serviceKeys: ['daycentre'], venues: [], programmeWideRoster: true, leadTeamBanner: true, ownClientsOnly: true }];
      }
      return [];
    }
    function portalStaffWeekdayFromIso(iso){
      var s = String(iso || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
      var d = new Date(s + 'T12:00:00');
      if(isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { weekday: 'long' });
    }
    function portalStaffLeadScopeMatchesService(serviceRaw, scope){
      var sk = portalStaffNormLeadService(serviceRaw);
      if(!scope.serviceKeys || !scope.serviceKeys.length) return true;
      if(scope.serviceKeys.indexOf('daycentre') >= 0 && sk === 'daycentre') return true;
      return scope.serviceKeys.indexOf(sk) >= 0;
    }
    function portalStaffLeadScopeMatchesVenue(venueRaw, scope){
      if(!scope.venues || !scope.venues.length) return true;
      var v = portalStaffNormLeadScopeKey(venueRaw).replace(/[^a-z]/g, '');
      if(!v) return false;
      return scope.venues.some(function(want){
        var w = portalStaffNormLeadScopeKey(want).replace(/[^a-z]/g, '');
        return v.indexOf(w) >= 0 || w.indexOf(v) >= 0;
      });
    }
    function portalStaffLeadSpreadsheetRowInScope(r, iso, scopes){
      if(!r || !scopes || !scopes.length) return false;
      var wd = portalStaffWeekdayFromIso(iso);
      if(!wd || String(r.day || '').trim() !== wd) return false;
      var sd = String(r.session_date || '').trim().slice(0, 10);
      if(sd && sd !== iso) return false;
      var svc = String(r.service || '').trim();
      var venue = String(r.venue || '').trim();
      for(var i = 0; i < scopes.length; i++){
        var sc = scopes[i];
        if(sc.weekdays.indexOf(wd) < 0) continue;
        if(!portalStaffLeadScopeMatchesService(svc, sc)) continue;
        if(!portalStaffLeadScopeMatchesVenue(venue, sc)) continue;
        return true;
      }
      return false;
    }
    function portalStaffLeadSessionRowInScope(s, iso, scopes){
      if(!s || !scopes || !scopes.length) return false;
      var svc = String(s.rosterService || s.activity || '').trim();
      if(portalStaffNormLeadService(svc) === 'climbing') return false;
      return portalStaffLeadSpreadsheetRowInScope({
        day: s.day,
        session_date: s.session_date || s.sessionDate,
        service: svc,
        venue: s.venue
      }, iso, scopes);
    }
    /** Sync fallback when lead ES module has not mounted yet (classic scripts run first). */
    function portalStaffProgrammeLeadWideDayFallback(staffId, isoYmd){
      var sid = String(staffId || '').trim().toLowerCase();
      var iso = String(isoYmd || '').trim().slice(0, 10);
      var scopes = portalStaffLeadScopesForStaffId(sid);
      if(!scopes.length || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      var wd = portalStaffWeekdayFromIso(iso);
      if(!wd) return false;
      if(typeof portalStaffHasShiftOnCalendarDate === 'function'){
        const onShift = portalStaffHasShiftOnCalendarDate(iso, sid);
        if(onShift === false) return false;
      }
      var active = scopes.filter(function(sc){ return sc.weekdays.indexOf(wd) >= 0; });
      return active.length > 0 && active.every(function(sc){ return sc.programmeWideRoster === true; });
    }
    function portalStaffCollectProgrammeWideSessionsInline(isoYmd, staffId){
      var iso = String(isoYmd || '').trim().slice(0, 10);
      var sid = String(staffId || '').trim().toLowerCase();
      if(!sid || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
      if(!portalStaffProgrammeLeadWideDayFallback(sid, iso)) return null;
      var scopes = portalStaffLeadScopesForStaffId(sid);
      var src = typeof window.portalResolveStaffDashboardSource === 'function'
        ? window.portalResolveStaffDashboardSource()
        : window.STAFF_DASHBOARD_SOURCE;
      var Adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
      if(!src || !Adapter || typeof Adapter.bootstrap !== 'function') return null;
      var rows = Array.isArray(src.rows) ? src.rows : [];
      var ownOnly = scopes.some(function(sc){ return sc.ownClientsOnly === true; });
      var instructorKeys = Object.create(null);
      if(ownOnly){
        instructorKeys[sid] = true;
      }else{
        rows.forEach(function(r){
          if(!r || !portalStaffLeadSpreadsheetRowInScope(r, iso, scopes)) return;
          var cn = portalStaffNormLeadScopeKey(r.client_name);
          if(!cn || cn === 'closed' || cn === 'available' || cn === 'noclient') return;
          String(r.instructors || '').split(/,|\/|&|\band\b/gi).forEach(function(part){
            var k = portalStaffNormLeadScopeKey(part);
            if(k) instructorKeys[k] = true;
          });
        });
      }
      var merged = [];
      var seen = Object.create(null);
      var notes = {};
      Object.keys(instructorKeys).forEach(function(instKey){
        var boot = null;
        try{ boot = Adapter.bootstrap({ source: src, staffId: instKey }); }catch(_b){ boot = null; }
        if(!boot || !Array.isArray(boot.sessionsModel)) return;
        if(boot.clientNotesById && typeof boot.clientNotesById === 'object'){
          Object.assign(notes, boot.clientNotesById);
        }
        boot.sessionsModel.forEach(function(s){
          if(!s) return;
          var rowIso = String(s.session_date || s.sessionDate || '').trim().slice(0, 10);
          if(rowIso !== iso) return;
          if(!portalStaffLeadSessionRowInScope(s, iso, scopes)) return;
          var effectiveSession = s;
          try{
            var reassign = typeof portalTodayScheduleOverrideForSession === 'function'
              ? portalTodayScheduleOverrideForSession(s, iso)
              : null;
            if(reassign && String(reassign.override_type || '').trim() === 'instructor_reassign'){
              var coverKey = portalStaffNormLeadScopeKey(reassign.payload && reassign.payload.covering_staff_id);
              if(coverKey){
                effectiveSession = Object.assign({}, s, {
                  staffId: coverKey,
                  __portalRosterInstructorBeforeOverride: s.staffId,
                  __portalInstructorReassignOverride: reassign
                });
              }
            }
          }catch(_reassign){}
          var dk = portalProgrammeWideRosterSessionDedupeKey(effectiveSession);
          if(seen[dk]) return;
          seen[dk] = true;
          merged.push(effectiveSession);
        });
      });
      merged.sort(function(a, b){ return String(a.start || '').localeCompare(String(b.start || '')); });
      if(!merged.length) return null;
      return {
        active: true,
        leadKey: sid,
        scopes: scopes,
        sessionsModel: merged,
        clientNotesById: notes
      };
    }
    try{ window.portalStaffCollectProgrammeWideSessionsInline = portalStaffCollectProgrammeWideSessionsInline; }catch(_){}
    function portalStaffProgrammeLeadWideCardsExpected(staffId, isoYmd){
      try{
        const sid = String(staffId || '').trim().toLowerCase();
        const iso = String(isoYmd || '').trim().slice(0, 10);
        if(!sid || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
        if(typeof window.portalLeadProgrammeWideTodayForStaff === 'function'){
          const prof = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
          const em = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session
            && window.__PORTAL_SUPABASE__.session.user
            ? window.__PORTAL_SUPABASE__.session.user.email
            : '';
          if(window.portalLeadProgrammeWideTodayForStaff(sid, iso, prof, em).active) return true;
        }
        return portalStaffProgrammeLeadWideDayFallback(sid, iso);
      }catch(_){ return false; }
    }
    try{ window.portalStaffProgrammeLeadWideCardsExpected = portalStaffProgrammeLeadWideCardsExpected; }catch(_){}
    function portalStaffTodayLeadShiftPanelMeta(staffId){
      var sid = String(staffId || '').trim().toLowerCase();
      if(!portalStaffIsProgrammeLeadRosterKey(sid)) return null;
      if(typeof portalStaffTodayBlockIsOff === 'function' && portalStaffTodayBlockIsOff(sid)) return null;
      var anchor = typeof portalResolveTodaySectionCalendarDate === 'function'
        ? portalResolveTodaySectionCalendarDate()
        : null;
      if(!anchor || isNaN(anchor.getTime())) return null;
      if(typeof portalStaffLiveTodayHasScheduledShift === 'function' && !portalStaffLiveTodayHasScheduledShift(sid, anchor)) return null;
      var iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(anchor) : '';
      if(!iso) return null;
      if(typeof portalStaffProgrammeLeadWideCardsExpected === 'function'
        && portalStaffProgrammeLeadWideCardsExpected(sid, iso)) return null;
      var dayWord = anchor.toLocaleDateString('en-GB', { weekday: 'long' });
      if(typeof portalCalendarIsoUsesSummerDatedRosterOnly === 'function'
        && portalCalendarIsoUsesSummerDatedRosterOnly(iso)
        && typeof portalStaffHasDatedRowsForIso === 'function'
        && !portalStaffHasDatedRowsForIso(iso, sid)){
        if(typeof portalStaffClientSessionsOnCalendarDate !== 'function'
          || !portalStaffClientSessionsOnCalendarDate(iso, dayWord, sid)){
          if(typeof portalStaffHasInstructorCoverOnCalendarDate !== 'function'
            || !portalStaffHasInstructorCoverOnCalendarDate(iso, sid)) return null;
        }
      }
      var venueLabel = '';
      var timeLabel = '';
      var programmeLabel = '';
      try{
        if(typeof window.portalLeadTeamOnShiftForIso === 'function'){
          var team = window.portalLeadTeamOnShiftForIso(iso);
          if(team && team.programmeLabel){
            programmeLabel = String(team.programmeLabel || '').trim();
            if(/acton/i.test(programmeLabel)) venueLabel = 'Acton';
            else if(/swimfarm/i.test(programmeLabel)) venueLabel = 'SwimFarm';
          }
        }
      }catch(_){}
      if(typeof window.portalStaffDayShiftLabelsByVenue === 'function'){
        var labels = window.portalStaffDayShiftLabelsByVenue(sid, iso) || {};
        var keys = Object.keys(labels);
        if(!venueLabel && keys.length){
          venueLabel = keys[0].charAt(0).toUpperCase() + keys[0].slice(1);
        }
        if(!timeLabel){
          timeLabel = labels[venueLabel ? venueLabel.toLowerCase().replace(/[^a-z]/g, '') : ''] || labels[keys[0]] || labels['_'] || '';
        }
      }
      if(!timeLabel && typeof window.portalStaffPayrollShiftBandLabel === 'function'){
        timeLabel = window.portalStaffPayrollShiftBandLabel(sid, iso, venueLabel) || '';
      }
      if(!venueLabel && programmeLabel){
        if(/acton/i.test(programmeLabel)) venueLabel = 'Acton';
        else if(/swimfarm/i.test(programmeLabel)) venueLabel = 'SwimFarm';
      }
      return {
        venueLabel: venueLabel || 'On shift',
        timeLabel: timeLabel || programmeLabel || 'See team roster above',
        programmeLabel: programmeLabel
      };
    }
    try{ window.portalStaffTodayLeadShiftPanelMeta = portalStaffTodayLeadShiftPanelMeta; }catch(_){}
    /** Panel under Today when there are no session cards: off vs roster still loading. */
    function portalStaffLiveTodayEmptyPanelMode(staffId, opts){
      opts = opts || {};
      if(opts.loading) return 'loading';
      const sid = String(staffId || '').trim().toLowerCase();
      const live = typeof portalIsViewingLiveCalendarToday === 'function' && portalIsViewingLiveCalendarToday();
      const anchor = typeof portalResolveTodaySectionCalendarDate === 'function'
        ? portalResolveTodaySectionCalendarDate()
        : null;
      const iso = anchor && typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(anchor) : '';
      if(live && sid && typeof portalStaffTodayBlockIsOff === 'function' && portalStaffTodayBlockIsOff(sid)) return 'off';
      let todayRows = [];
      try{
        if(typeof buildSelectedDayViewFromLauraModel === 'function'){
          todayRows = buildSelectedDayViewFromLauraModel(null) || [];
        }
      }catch(_){}
      if(todayRows.length) return 'empty';
      const hydrated = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_ROSTER_HYDRATED__);
      const overridesReady = !!(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__);
      const settled = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__);
      if(live && typeof portalStaffTodayScheduleCardsStillExpected === 'function'
        && portalStaffTodayScheduleCardsStillExpected(sid)){
        if(hydrated && overridesReady && settled){
          if(portalStaffIsProgrammeLeadRosterKey(sid)
            && typeof portalStaffProgrammeLeadWideCardsExpected === 'function'
            && portalStaffProgrammeLeadWideCardsExpected(sid, iso)){
            return todayRows.length ? 'empty' : 'sync';
          }
          if(portalStaffIsProgrammeLeadRosterKey(sid)
            && typeof portalStaffTodayLeadShiftPanelMeta === 'function'
            && portalStaffTodayLeadShiftPanelMeta(sid)){
            return 'shift';
          }
          return 'empty';
        }
        return 'sync';
      }
      if(live && sid && typeof portalStaffLiveTodayHasScheduledShift === 'function' && portalStaffLiveTodayHasScheduledShift(sid)){
        if(hydrated && settled && portalStaffIsProgrammeLeadRosterKey(sid)
          && typeof portalStaffProgrammeLeadWideCardsExpected === 'function'
          && portalStaffProgrammeLeadWideCardsExpected(sid, iso)){
          if(todayRows.length) return 'empty';
          if(!hydrated || !settled) return 'sync';
          return 'sync';
        }
        if(hydrated && settled && portalStaffIsProgrammeLeadRosterKey(sid)
          && typeof portalStaffTodayLeadShiftPanelMeta === 'function'
          && portalStaffTodayLeadShiftPanelMeta(sid)){
          return 'shift';
        }
        if(hydrated && settled && typeof portalStaffMergeMachineSessionsIfShiftWithoutTodayCards === 'function'){
          try{
            if(portalStaffMergeMachineSessionsIfShiftWithoutTodayCards(sid)){
              todayRows = typeof buildSelectedDayViewFromLauraModel === 'function'
                ? (buildSelectedDayViewFromLauraModel(null) || [])
                : todayRows;
              if(todayRows.length) return 'empty';
            }
          }catch(_){}
        }
        if(!hydrated || !settled) return 'sync';
        return 'empty';
      }
      return live ? 'empty' : 'empty';
    }
    function portalAuthStaffRosterId(){
      try{
        var p = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
        var user = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session && window.__PORTAL_SUPABASE__.session.user;
        if(typeof window.portalEffectiveStaffDashboardId === 'function'){
          return String(window.portalEffectiveStaffDashboardId(p, user, STAFF_DASHBOARD_ID)).trim().toLowerCase();
        }
        if(typeof window.portalPrimaryStaffRosterKey === 'function' && user){
          var pk = String(window.portalPrimaryStaffRosterKey(p || {}, user)).trim().toLowerCase();
          if(pk) return pk;
        }
      }catch(_){}
      return String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
    }
    function portalClearNextSessionPreviewCache(){
      if(!dashboardData) return;
      dashboardData.__portalStableNextSessionPreview = null;
      dashboardData.__portalStableNextSessionStaffId = '';
      dashboardData.portalTodayNextSessionPreview = null;
    }
    function portalStaffRosterKeysCross(a, b){
      var x = String(a || '').trim().toLowerCase();
      var y = String(b || '').trim().toLowerCase();
      if(!x || !y || x === y) return false;
      if((x === 'javi' && y === 'javier') || (x === 'javier' && y === 'javi')) return true;
      return false;
    }
    try{ window.portalAuthStaffRosterId = portalAuthStaffRosterId; }catch(_){}
    try{ window.portalClearNextSessionPreviewCache = portalClearNextSessionPreviewCache; }catch(_){}
    try{ window.portalStaffRosterKeysCross = portalStaffRosterKeysCross; }catch(_){}
    function portalBuildTodayRowsForIso(isoYmd){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return [];
      try{
        return buildSelectedDayViewFromLauraModel(null, iso) || [];
      }catch(_){ return []; }
    }
    function portalCalendarIsoIsTomorrow(isoYmd){
      const iso = normaliseIsoDate(isoYmd);
      if(!iso) return false;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      return iso === (typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(tomorrow) : '');
    }
    function portalNextSessionPreviewHasParticipants(preview){
      return !!(preview && (Number(preview.sessionCount) > 0 || (Array.isArray(preview.participants) && preview.participants.length)));
    }
    function portalStaffRosterReadyForNextSessionPreview(){
      try{
        return !!(typeof window !== 'undefined'
          && window.__PORTAL_STAFF_ROSTER_HYDRATED__
          && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__);
      }catch(_){ return false; }
    }
    function portalNextSessionPreviewIsTomorrow(preview){
      if(!preview) return false;
      const iso = String(preview.iso || '').trim().slice(0, 10);
      if(!iso || typeof portalCalendarIsoIsTomorrow !== 'function') return false;
      return portalCalendarIsoIsTomorrow(iso);
    }
    function portalNextSessionPreviewParticipantsComplete(preview){
      if(!portalNextSessionPreviewHasParticipants(preview)) return false;
      var list = Array.isArray(preview.participants) ? preview.participants : [];
      if(!list.length) return false;
      for(var i = 0; i < list.length; i++){
        var nm = String((list[i] && list[i].name) || '').trim();
        if(!nm || nm === '—') return false;
      }
      return true;
    }
    function portalStabilizeNextSessionPreview(nextPreview, prevPreview, staffId){
      var sid = String(staffId || portalAuthStaffRosterId() || '').trim().toLowerCase();
      if(dashboardData && dashboardData.__portalStableNextSessionStaffId !== sid){
        dashboardData.__portalStableNextSessionPreview = null;
        prevPreview = null;
      }
      var prevUsable = prevPreview && dashboardData && dashboardData.__portalStableNextSessionStaffId === sid
        && portalNextSessionPreviewHasParticipants(prevPreview);
      if(portalNextSessionPreviewHasParticipants(nextPreview)){
        /* Avoid the avatar/name flicker: a transient incomplete rebuild (participant missing its
           resolved name while the model is still hydrating) must not replace a complete cached
           next-session preview. */
        if(prevUsable && portalNextSessionPreviewParticipantsComplete(prevPreview)
          && !portalNextSessionPreviewParticipantsComplete(nextPreview)){
          return prevPreview;
        }
        if(dashboardData){
          dashboardData.__portalStableNextSessionPreview = nextPreview;
          dashboardData.__portalStableNextSessionStaffId = sid;
        }
        return nextPreview;
      }
      if(!(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__)){
        if(prevUsable) return prevPreview;
        return portalNextSessionPreviewHasParticipants(nextPreview) ? nextPreview : null;
      }
      if(prevUsable){
        return prevPreview;
      }
      if(dashboardData){
        dashboardData.__portalStableNextSessionPreview = null;
      }
      return null;
    }
    function portalRefreshNextSessionPreview(staffId){
      const id = String(staffId || portalAuthStaffRosterId() || '').trim().toLowerCase();
      if(!id) return null;
      const prev = dashboardData && dashboardData.__portalStableNextSessionPreview;
      if(dashboardData && dashboardData.__portalStableNextSessionStaffId && dashboardData.__portalStableNextSessionStaffId !== id){
        portalClearNextSessionPreviewCache();
      }
      if(!portalStaffRosterReadyForNextSessionPreview()){
        if(dashboardData) dashboardData.portalTodayNextSessionPreview = null;
        if(dashboardData && dashboardData.__portalStableNextSessionStaffId && dashboardData.__portalStableNextSessionStaffId !== id){
          return null;
        }
        return portalNextSessionPreviewHasParticipants(prev) ? prev : null;
      }
      if(typeof window.__portalSyncNextSessionFromModel === 'function'){
        try{ window.__portalSyncNextSessionFromModel(); }catch(_){}
      }
      const built = typeof portalBuildTodayNextSessionPreview === 'function'
        ? portalBuildTodayNextSessionPreview(id)
        : null;
      const stable = portalStabilizeNextSessionPreview(built, prev, id);
      if(dashboardData){
        dashboardData.__portalStableNextSessionPreview = stable;
        dashboardData.__portalStableNextSessionStaffId = id;
        dashboardData.portalTodayNextSessionPreview = stable;
      }
      return stable;
    }
    function portalApplyTodayVenueMeta(fallbackDayWord){
      const dw = String(fallbackDayWord || DEMO_VIEW_DAY || '').trim()
        || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
      const preview = dashboardData && dashboardData.portalTodayNextSessionPreview;
      const todayRows = dashboardData && Array.isArray(dashboardData.today) ? dashboardData.today : [];
      if(portalNextSessionPreviewHasParticipants(preview)){
        dashboardData.venueMeta = 'Next session ' + String(preview.dateLabel || '').trim();
        return;
      }
      if(todayRows.length){
        dashboardData.venueMeta = todayRows.length === 1 ? '1 participant' : (todayRows.length + ' participants');
        return;
      }
      dashboardData.venueMeta = 'No participants — ' + dw;
    }
    function portalBuildTodayNextSessionPreview(staffId){
      const id = String(staffId || '').trim().toLowerCase();
      if(!id) return null;
      const info = typeof window.portalFindNextSessionCalendarInfo === 'function'
        ? window.portalFindNextSessionCalendarInfo(id, new Date(), sessionsModel)
        : null;
      if(!info || !info.date) return null;
      const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(info.date) : '';
      // Show the genuine next session even when it is not literally tomorrow
      // (e.g. a worker off until Tuesday): the panel says "your next session is below".
      if(!iso) return null;
      let rows = [];
      try{
        rows = iso ? portalBuildTodayRowsForIso(iso) : [];
      }catch(_){ rows = []; }
      if(!rows.length){
        try{
          if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
          const nsRows = (typeof dashboardData !== 'undefined' && dashboardData && Array.isArray(dashboardData.tomorrow))
            ? dashboardData.tomorrow
            : [];
          if(nsRows.length){
            const weekday = info.date.toLocaleDateString('en-GB', { weekday: 'long' });
            const dateLabel = typeof portalFormatPortalDateDdMmYyyy === 'function'
              ? portalFormatPortalDateDdMmYyyy(info.date)
              : '';
            const participantsRaw = nsRows.map(function(r){
              const name = String(r && r.name || '').trim() || '—';
              const clientId = String(r && r.clientId || '').trim();
              let photoUrl = String(r && r.avatarFile || '').trim();
              if(!photoUrl && typeof resolveParticipantPhotoUrl === 'function'){
                photoUrl = resolveParticipantPhotoUrl(name, clientId) || '';
              }
              if(!photoUrl && typeof clientPhotoUrl === 'function') photoUrl = clientPhotoUrl(name) || '';
              return {
                name: name,
                clientId: clientId,
                photoUrl: photoUrl,
                preloadUrls: photoUrl ? [photoUrl] : [],
                hasMedicalAlert: portalParticipantHasMedicalAlert(clientId, name),
                time: String(r && r.time || r.timeSlotLabel || '').trim()
              };
            });
            const participants = typeof portalDedupeParticipantListEntries === 'function'
              ? portalDedupeParticipantListEntries(participantsRaw, resolveParticipantPhotoUrl)
              : participantsRaw;
            return {
              weekday: weekday,
              dateLabel: dateLabel,
              iso: iso,
              sessionCount: participants.length,
              venueLabel: String(nsRows[0] && nsRows[0].venue || '').trim(),
              participants: participants
            };
          }
        }catch(_fb){}
        return null;
      }
      const venues = {};
      rows.forEach(function(r){
        const base = r && r.__portalBaseSession;
        const v = String(r.sessionVenue || (base && base.venue) || '').trim();
        if(v && v !== '—') venues[v] = (venues[v] || 0) + 1;
      });
      const venueKeys = Object.keys(venues).sort(function(a, b){ return venues[b] - venues[a]; });
      const weekday = info.date.toLocaleDateString('en-GB', { weekday: 'long' });
      const dateLabel = typeof portalFormatPortalDateDdMmYyyy === 'function'
        ? portalFormatPortalDateDdMmYyyy(info.date)
        : '';
      const participantsRaw = rows.map(function(r){
        const name = String(r && r.name || '').trim() || '—';
        const clientId = String(r && r.clientId || '').trim();
        let photoUrl = typeof resolveParticipantPhotoUrl === 'function'
          ? resolveParticipantPhotoUrl(name, clientId)
          : '';
        if(!photoUrl && typeof clientPhotoUrl === 'function') photoUrl = clientPhotoUrl(name) || '';
        const preloadUrls = typeof portalParticipantPhotoPathCandidates === 'function'
          ? portalParticipantPhotoPathCandidates(name, photoUrl)
          : (photoUrl ? [photoUrl] : []);
        return {
          name: name,
          clientId: clientId,
          photoUrl: photoUrl,
          preloadUrls: preloadUrls,
          hasMedicalAlert: portalParticipantHasMedicalAlert(clientId, name)
        };
      });
      const participants = typeof portalDedupeParticipantListEntries === 'function'
        ? portalDedupeParticipantListEntries(participantsRaw, resolveParticipantPhotoUrl)
        : participantsRaw;
      if(typeof portalPreloadParticipantPhotoUrls === 'function'){
        const preloadAll = [];
        participants.forEach(function(p){
          if(p && Array.isArray(p.preloadUrls) && p.preloadUrls.length){
            p.preloadUrls.forEach(function(u){ if(u) preloadAll.push(u); });
          }else if(p && p.photoUrl){
            preloadAll.push(p.photoUrl);
          }
        });
        portalPreloadParticipantPhotoUrls(preloadAll);
      }
      return {
        weekday: weekday,
        dateLabel: dateLabel,
        iso: iso,
        sessionCount: participants.length,
        venueLabel: venueKeys[0] || '',
        participants: participants
      };
    }
    function portalSyncTodaySectionDisplay(modelOverride){
      const id = portalAuthStaffRosterId();
      const prevPreview = dashboardData && dashboardData.__portalStableNextSessionPreview;
      let rows = [];
      try{
        rows = typeof buildSelectedDayViewFromLauraModel === 'function'
          ? buildSelectedDayViewFromLauraModel(modelOverride)
          : [];
      }catch(_){ rows = []; }
      dashboardData.portalTodaySectionHeading = '';
      dashboardData.portalTodaySectionMode = 'today';
      const liveToday = typeof portalIsViewingLiveCalendarToday === 'function' && portalIsViewingLiveCalendarToday();
      if(liveToday && typeof portalStaffLiveTodayAwaitingInitialSchedule === 'function' && portalStaffLiveTodayAwaitingInitialSchedule()){
        dashboardData.portalTodayEmptyPanelMode = dashboardData.portalIdentityResolved === false ? 'loading' : 'sync';
        dashboardData.portalTodayNextSessionPreview = null;
        dashboardData.today = [];
        portalApplyTodayVenueMeta();
        return [];
      }
      const selectedAnchor = typeof portalResolveTodaySectionCalendarDate === 'function'
        ? portalResolveTodaySectionCalendarDate()
        : null;
      const selectedIso = selectedAnchor && typeof portalIsoYmdFromDate === 'function'
        ? portalIsoYmdFromDate(selectedAnchor)
        : '';
      /* Selected (non-live) day review: hold the cards on the brief "syncing" panel until schedule
         overrides hydrate, so reassignments/absences apply before the list renders. Without this a
         refresh on a past day flashes the pre-override roster (e.g. Aurora 23 Jun: Aydaan Ah present
         and Bediako not yet absent) before settling. Overrides stay hydrated after the first settle,
         so this only affects the initial load window, and the hydrate/rehydrate timers force it true
         on error so it can never hang. Day-off days are term-data driven and skip this wait. */
      if(!liveToday && id && selectedIso
        && dashboardData.portalIdentityResolved !== false
        && typeof window !== 'undefined'
        && window.__PORTAL_STAFF_ROSTER_HYDRATED__
        && !window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__
        && !(typeof portalTermStaffAwayOnDate === 'function' && portalTermStaffAwayOnDate(selectedIso, id))){
        dashboardData.portalTodayEmptyPanelMode = 'sync';
        dashboardData.portalTodayNextSessionPreview = null;
        dashboardData.today = [];
        portalApplyTodayVenueMeta();
        return [];
      }
      const todayOff = id && liveToday
        && typeof portalStaffTodayBlockIsOff === 'function'
        && portalStaffTodayBlockIsOff(id);
      const emptyPanelMode = typeof portalStaffLiveTodayEmptyPanelMode === 'function'
        ? portalStaffLiveTodayEmptyPanelMode(id, { loading: dashboardData.portalIdentityResolved === false })
        : (todayOff ? 'off' : 'empty');
      dashboardData.portalTodayEmptyPanelMode = emptyPanelMode;
      if(todayOff && selectedIso && typeof portalStaffDayOffIsTimeOffRequested === 'function'
        && portalStaffDayOffIsTimeOffRequested(selectedIso, id)){
        dashboardData.portalTodayEmptyPanelMode = 'off_time_requested';
      }
      if(todayOff) rows = [];
      const rosterReady = portalStaffRosterReadyForNextSessionPreview();
      if(liveToday && id && dashboardData.portalIdentityResolved !== false && rosterReady){
        portalRefreshNextSessionPreview(id);
      }else if(!rosterReady){
        dashboardData.portalTodayNextSessionPreview = null;
        if(liveToday && id && typeof portalStaffLiveTodayHasScheduledShift === 'function' && portalStaffLiveTodayHasScheduledShift(id)){
          var todaySettledEarly = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__);
          if(!todaySettledEarly) dashboardData.portalTodayEmptyPanelMode = 'sync';
        }
      }else if(!portalNextSessionPreviewHasParticipants(dashboardData.portalTodayNextSessionPreview)){
        if(typeof portalStaffTodayScheduleCardsStillExpected === 'function'
          && portalStaffTodayScheduleCardsStillExpected(id)){
          dashboardData.portalTodayNextSessionPreview = null;
        }else{
          dashboardData.portalTodayNextSessionPreview = portalStabilizeNextSessionPreview(null, prevPreview, id);
        }
      }
      if(!rows.length && id && !todayOff
        && typeof portalStaffTodayScheduleCardsStillExpected === 'function'
        && portalStaffTodayScheduleCardsStillExpected(id)){
        var recoveredRows = typeof portalStaffRebuildTodayRowsFromCandidates === 'function'
          ? portalStaffRebuildTodayRowsFromCandidates(modelOverride)
          : [];
        if(!recoveredRows.length && dashboardData && Array.isArray(dashboardData.today) && dashboardData.today.length){
          var cachedIso = String(dashboardData.__portalTodayCalendarIso || '').trim().slice(0, 10);
          if(!cachedIso) cachedIso = portalTodayRowsCalendarIso(dashboardData.today);
          var overridesReady = !!(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__);
          if(cachedIso && selectedIso && cachedIso === selectedIso && (!liveToday || overridesReady)){
            recoveredRows = dashboardData.today.slice();
          }
        }
        if(recoveredRows.length){
          rows = recoveredRows;
        }else{
          var rosterHydrated = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_ROSTER_HYDRATED__);
          var overridesReady = !!(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__);
          var todaySettled = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__);
          if((!liveToday && rosterHydrated) || (liveToday && rosterHydrated && overridesReady && todaySettled)){
            if(liveToday && id && portalStaffIsProgrammeLeadRosterKey(id)
              && typeof portalStaffProgrammeLeadWideCardsExpected === 'function'
              && portalStaffProgrammeLeadWideCardsExpected(id, selectedIso)){
              dashboardData.portalTodayEmptyPanelMode = rows.length ? 'empty' : 'sync';
            }else if(liveToday && id && portalStaffIsProgrammeLeadRosterKey(id)
              && typeof portalStaffTodayLeadShiftPanelMeta === 'function'
              && portalStaffTodayLeadShiftPanelMeta(id)){
              dashboardData.portalTodayEmptyPanelMode = 'shift';
            }else{
              dashboardData.portalTodayEmptyPanelMode = 'empty';
            }
          }else{
            dashboardData.portalTodayEmptyPanelMode = 'sync';
            dashboardData.portalTodayNextSessionPreview = null;
            dashboardData.today = [];
            portalApplyTodayVenueMeta();
            if(typeof portalStaffScheduleTodaySyncRetry === 'function') portalStaffScheduleTodaySyncRetry();
            return [];
          }
        }
      }
      if(liveToday && !todayOff && rows.length && typeof collectSessionReviewPendingStats === 'function'){
        const stats = collectSessionReviewPendingStats();
        const allEnded = rows.every(function(item){
          if(!item || item.noSessionFeedbackRequired) return true;
          if(item.kind === 'closed' || item.kind === 'available' || item.openSheet === false) return true;
          return typeof isSessionEndedForFeedback === 'function' ? isSessionEndedForFeedback(item) : true;
        });
        if(stats.eligible > 0 && !stats.pending.length && allEnded){
          const previewDone = portalRefreshNextSessionPreview(id);
          if(portalNextSessionPreviewHasParticipants(previewDone)){
            dashboardData.portalTodayNextSessionPreview = previewDone;
            dashboardData.portalTodayEmptyPanelMode = 'complete';
            dashboardData.portalTodaySectionMode = 'complete_next';
            dashboardData.today = [];
            portalApplyTodayVenueMeta();
            return [];
          }
        }
      }
      let showLiveEmptyPanel = liveToday
        && dashboardData.portalIdentityResolved !== false
        && (todayOff || (!rows.length && emptyPanelMode !== 'sync'));
      if(showLiveEmptyPanel && todayOff){
        if(!rosterReady){
          dashboardData.portalTodayNextSessionPreview = null;
          dashboardData.portalTodayEmptyPanelMode = 'sync';
          dashboardData.portalTodaySectionMode = 'day_off';
          dashboardData.today = [];
          portalApplyTodayVenueMeta();
          return [];
        }
        const previewOff = portalRefreshNextSessionPreview(id);
        dashboardData.portalTodayNextSessionPreview = previewOff;
        if(selectedIso && typeof portalStaffDayOffIsTimeOffRequested === 'function'
          && portalStaffDayOffIsTimeOffRequested(selectedIso, id)){
          dashboardData.portalTodayEmptyPanelMode = 'off_time_requested';
        }else if(dashboardData.portalTodayEmptyPanelMode !== 'off_time_requested'){
          dashboardData.portalTodayEmptyPanelMode = 'off';
        }
        dashboardData.portalTodaySectionMode = 'day_off';
        dashboardData.today = [];
        portalApplyTodayVenueMeta();
        return [];
      }
      if(!liveToday && id && selectedIso && !rows.length
        && typeof portalTermStaffAwayOnDate === 'function'
        && portalTermStaffAwayOnDate(selectedIso, id)){
        dashboardData.portalTodayEmptyPanelMode = (typeof portalStaffDayOffIsTimeOffRequested === 'function'
          && portalStaffDayOffIsTimeOffRequested(selectedIso, id))
          ? 'off_time_requested'
          : 'off';
        dashboardData.portalTodayNextSessionPreview = null;
        dashboardData.today = [];
        portalApplyTodayVenueMeta();
        return [];
      }
      if(showLiveEmptyPanel){
        if(!rosterReady){
          dashboardData.portalTodayNextSessionPreview = null;
          var todaySettledPanel = !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__);
          if(!todaySettledPanel){
            dashboardData.portalTodayEmptyPanelMode = 'sync';
            dashboardData.today = [];
            portalApplyTodayVenueMeta();
            return [];
          }
        }
        const preview = portalRefreshNextSessionPreview(id);
        dashboardData.portalTodayNextSessionPreview = preview;
        dashboardData.today = [];
        portalApplyTodayVenueMeta();
        return [];
      }
      dashboardData.today = rows;
      dashboardData.__portalTodayCalendarIso = selectedIso || (rows.length ? portalTodayRowsCalendarIso(rows) : '');
      if(liveToday && typeof window !== 'undefined'
        && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__
        && window.__PORTAL_STAFF_ROSTER_HYDRATED__
        && typeof portalStaffMarkInitialTodayScheduleSettled === 'function'){
        portalStaffMarkInitialTodayScheduleSettled();
      }
      if(rows.length && typeof portalStaffUpdateSessionsModelGuard === 'function'){
        portalStaffUpdateSessionsModelGuard(id, Array.isArray(modelOverride) ? modelOverride : sessionsModel);
      }
      portalApplyTodayVenueMeta();
      return rows;
    }
    /** While Today shows roster sync, retry Supabase merge + rebootstrap until sessions appear. */
    function portalStaffScheduleTodaySyncRetry(){
      if(typeof window === 'undefined' || window.__PORTAL_TODAY_SYNC_RETRY__) return;
      window.__PORTAL_TODAY_SYNC_RETRY__ = true;
      var tries = 0;
      var maxTries = 12;
      var timer = setInterval(function(){
        tries += 1;
        var sid = String(
          (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
          || STAFF_DASHBOARD_ID
          || ''
        ).trim().toLowerCase();
        if(!sid || tries > maxTries){
          clearInterval(timer);
          window.__PORTAL_TODAY_SYNC_RETRY__ = false;
          if(tries > maxTries){
            try{ window.__PORTAL_STAFF_SESSIONS_GUARD_MODEL__ = null; }catch(_){}
            portalStaffMarkInitialTodayScheduleSettled();
            try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
            if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
            if(typeof renderToday === 'function') renderToday();
          }
          return;
        }
        var mode = typeof portalStaffLiveTodayEmptyPanelMode === 'function'
          ? portalStaffLiveTodayEmptyPanelMode(sid, { loading: !!(dashboardData && dashboardData.portalIdentityResolved === false) })
          : '';
        if(mode !== 'sync'){
          clearInterval(timer);
          window.__PORTAL_TODAY_SYNC_RETRY__ = false;
          return;
        }
        if(dashboardData && (
          portalNextSessionPreviewHasParticipants(dashboardData.portalTodayNextSessionPreview)
          || dashboardData.portalTodayEmptyPanelMode === 'off'
          || dashboardData.portalTodayEmptyPanelMode === 'off_time_requested'
          || dashboardData.portalTodayEmptyPanelMode === 'complete'
        )){
          clearInterval(timer);
          window.__PORTAL_TODAY_SYNC_RETRY__ = false;
          return;
        }
        if(typeof window.portalRefreshPortalRosterRowsFromSupabase === 'function'){
          var rosterClient = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
          if(rosterClient) void window.portalRefreshPortalRosterRowsFromSupabase(rosterClient);
        }
        if(typeof window.portalRebootstrapSessionsForPinnedStaff === 'function') window.portalRebootstrapSessionsForPinnedStaff();
        else if(typeof window.portalBootstrapFromMachineFallback === 'function'){
          const sid = String(
          (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
          || STAFF_DASHBOARD_ID
          || ''
        ).trim().toLowerCase();
          let retryIso = '';
          try{
            const retryAnchor = typeof portalResolveTodaySectionCalendarDate === 'function'
              ? portalResolveTodaySectionCalendarDate()
              : null;
            if(retryAnchor && typeof portalIsoYmdFromDate === 'function'){
              retryIso = portalIsoYmdFromDate(retryAnchor);
            }
          }catch(_){}
          const retryFbOk = !sid || typeof portalStaffMachineBundleFallbackAllowed !== 'function'
            || !retryIso
            || portalStaffMachineBundleFallbackAllowed(sid, retryIso);
          if(retryFbOk){
          const fb = sid ? window.portalBootstrapFromMachineFallback(sid) : null;
          if(fb && fb.boot && Array.isArray(fb.boot.sessionsModel) && fb.boot.sessionsModel.length){
            sessionsModel = fb.boot.sessionsModel;
            if(fb.boot.clientNotesById) clientNotesById = Object.assign({}, clientNotesById || {}, fb.boot.clientNotesById);
          }
          }
        }
        if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
        if(typeof renderToday === 'function') renderToday();
      }, 2000);
    }
    try{ window.portalStaffScheduleTodaySyncRetry = portalStaffScheduleTodaySyncRetry; }catch(_){}
    try{
      window.addEventListener('portal:lead-programme-wide-ready', function(){
        try{
          if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
          if(typeof renderToday === 'function') renderToday();
          if(typeof renderLists === 'function') renderLists();
          if(typeof renderMiniCounts === 'function') renderMiniCounts();
        }catch(_){}
      });
    }catch(_){}

    /** Paint TODAY from cached Supabase auth + local roster bundle before async profile bootstrap finishes. */
    function portalReadPersistedAuthUserLite(){
      try{
        if(typeof localStorage === 'undefined') return null;
        for(var i = 0; i < localStorage.length; i++){
          var k = localStorage.key(i);
          if(!k || !/^sb-.*-auth-token/i.test(k)) continue;
          var raw = localStorage.getItem(k);
          if(!raw) continue;
          var data = JSON.parse(raw);
          var user = (data && data.user) || (data && data.currentSession && data.currentSession.user);
          if(user && user.id) return user;
        }
      }catch(_){}
      return null;
    }
    function portalCanonicalStaffKeyLite(raw){
      var k = String(raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
      if(!k) return '';
      if(k === 'luliya' || k === 'aida' || k === 'stf021') return 'lulia';
      if(typeof window.portalCanonicalStaffRosterKey === 'function'){
        return window.portalCanonicalStaffRosterKey(k) || k;
      }
      return k;
    }
    function portalBootstrapRosterHitFromAuthUser(user, profileForRoster){
      if(typeof window.portalBootstrapStaffRosterFromProfile === 'function'){
        var delegated = window.portalBootstrapStaffRosterFromProfile(profileForRoster, user);
        if(delegated && delegated.boot){
          return { staffId: portalCanonicalStaffKeyLite(delegated.staffId), boot: delegated.boot };
        }
      }
      var Adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
      var source = typeof window.portalResolveStaffDashboardSource === 'function'
        ? window.portalResolveStaffDashboardSource()
        : window.STAFF_DASHBOARD_SOURCE;
      if(!Adapter || !source || !user) return null;
      var email = String(user.email || '');
      var keys = [];
      var seen = Object.create(null);
      function pushKey(v){
        var k = String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '')
          .trim();
        if(!k || seen[k]) return;
        if(k === 'luliya' || k === 'aida') k = 'lulia';
        seen[k] = true;
        keys.push(k);
        if(/^stf\d{3}$/.test(k)){
          var map = {
            stf001: 'sandra', stf002: 'roberto', stf003: 'dan', stf004: 'angel',
            stf005: 'youssef', stf006: 'john', stf007: 'bismark', stf008: 'giuseppe',
            stf009: 'godsway', stf010: 'javier', stf011: 'aurora', stf012: 'berta',
            stf013: 'victor', stf014: 'carlos', stf015: 'alex', stf017: 'javi',
            stf018: 'raul', stf019: 'sevitha', stf020: 'teflon', stf021: 'lulia',
            stf022: 'andres'
          };
          if(map[k] && !seen[map[k]]){ seen[map[k]] = true; keys.push(map[k]); }
        }
      }
      pushKey(profileForRoster && profileForRoster.username);
      pushKey(profileForRoster && profileForRoster.full_name);
      pushKey(String((profileForRoster && profileForRoster.full_name) || '').split(/\s+/)[0]);
      pushKey(email.split('@')[0]);
      if(typeof window.portalPrimaryStaffRosterKey === 'function'){
        pushKey(window.portalPrimaryStaffRosterKey(profileForRoster || {}, user));
      }
      if(typeof window.portalInferStaffKey === 'function') pushKey(window.portalInferStaffKey(profileForRoster, email));
      function portalStaffBootstrapHitForKey(staffKey){
        var boot = Adapter.bootstrap({ source: source, staffId: staffKey });
        if(!boot || !Array.isArray(boot.sessionsModel)) return null;
        var canonical = portalCanonicalStaffKeyLite(staffKey);
        var profiles = source.staffProfiles && typeof source.staffProfiles === 'object' ? source.staffProfiles : {};
        if(!boot.sessionsModel.length && !profiles[canonical] && !profiles[staffKey]) return null;
        return { staffId: canonical || staffKey, boot: boot };
      }
      var i;
      var profileOnlyHit = null;
      for(i = 0; i < keys.length; i++){
        var hit = portalStaffBootstrapHitForKey(keys[i]);
        if(!hit) continue;
        if(hit.boot.sessionsModel.length) return hit;
        if(!profileOnlyHit) profileOnlyHit = hit;
      }
      return profileOnlyHit;
    }
    function portalStaffApplyOptimisticRosterHit(hit, profileForRoster, user){
      if(!hit || !hit.boot || !dashboardData) return false;
      var sid = portalCanonicalStaffKeyLite(hit.staffId);
      if(!sid) return false;
      STAFF_DASHBOARD_ID = sid;
      try{ window.STAFF_DASHBOARD_ID = sid; }catch(_){}
      __spreadsheetBoot = hit.boot;
      sessionsModel = hit.boot.sessionsModel || [];
      clientNotesById = hit.boot.clientNotesById || {};
      try{ portalStaffMarkRosterHydrated(); }catch(_){}
      if(typeof portalStaffUpdateSessionsModelGuard === 'function') portalStaffUpdateSessionsModelGuard(sid, sessionsModel);
      portalApplyClientsInfoToNotes();
      if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
      if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
      var nm = typeof window.portalStaffTopbarDisplayName === 'function'
        ? window.portalStaffTopbarDisplayName(profileForRoster, user, sid)
        : String(profileForRoster.full_name || profileForRoster.username || '').trim();
      if(nm) dashboardData.staffName = nm;
      dashboardData.portalIdentityResolved = true;
      dashboardData.week = typeof buildWeekRows === 'function' ? buildWeekRows(sid) : dashboardData.week;
      if(typeof window.portalApplyTermCalendarForStaff === 'function') window.portalApplyTermCalendarForStaff(sid);
      if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
      if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(sid);
      if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
      try{ window.dispatchEvent(new CustomEvent('portal:staff-identity-resolved')); }catch(_){}
      try{
        if(typeof renderHeader === 'function') renderHeader();
        if(typeof renderToday === 'function') renderToday();
      }catch(_){}
      if(window.__PORTAL_STAFF_ROSTER_HYDRATED__){
        try{ portalStaffMarkInitialTodayScheduleSettled(); }catch(_){}
      }else{
        try{ portalStaffEnsureInitialTodayScheduleSettledSoon(4000); }catch(_){}
      }
      if(typeof portalStaffKickScheduleOverridesHydrate === 'function'){
        void portalStaffKickScheduleOverridesHydrate();
      }
      return true;
    }
    function portalStaffResolveIdentityEarlyFromSession(){
      if(!dashboardData || dashboardData.portalIdentityResolved !== false) return false;
      var box = window.__PORTAL_SUPABASE__;
      var session = box && box.session;
      var user = session && session.user;
      if(!user) return false;
      var p = box.staff_profile || {};
      var profileForRoster = (p && p.id) ? p : {
        username: String(user.email || '').split('@')[0],
        full_name: String((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '').trim()
      };
      if(STAFF_DASHBOARD_ID && window.__PORTAL_STAFF_ROSTER_HYDRATED__){
        var sidReady = portalCanonicalStaffKeyLite(STAFF_DASHBOARD_ID);
        var nmReady = typeof window.portalStaffTopbarDisplayName === 'function'
          ? window.portalStaffTopbarDisplayName(profileForRoster, user, sidReady)
          : String(profileForRoster.full_name || profileForRoster.username || '').trim();
        if(nmReady) dashboardData.staffName = nmReady;
        dashboardData.portalIdentityResolved = true;
        try{ window.dispatchEvent(new CustomEvent('portal:staff-identity-resolved')); }catch(_){}
        try{
          if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
          if(typeof renderHeader === 'function') renderHeader();
          if(typeof renderToday === 'function') renderToday();
        }catch(_){}
        return true;
      }
      var hit = portalBootstrapRosterHitFromAuthUser(user, profileForRoster);
      if(hit && hit.boot){
        var authPrimary = typeof window.portalPrimaryStaffRosterKey === 'function'
          ? portalCanonicalStaffKeyLite(window.portalPrimaryStaffRosterKey(profileForRoster, user))
          : '';
        var hitSid = portalCanonicalStaffKeyLite(hit.staffId);
        if(authPrimary && typeof portalStaffRosterKeysCross === 'function' && portalStaffRosterKeysCross(authPrimary, hitSid)){
          hit = null;
        }else{
          return portalStaffApplyOptimisticRosterHit(hit, profileForRoster, user);
        }
      }
      var nm = typeof window.portalStaffTopbarDisplayName === 'function'
        ? window.portalStaffTopbarDisplayName(profileForRoster, user, '')
        : String(profileForRoster.full_name || profileForRoster.username || '').trim();
      if(nm) dashboardData.staffName = nm;
      dashboardData.portalIdentityResolved = true;
      try{ window.dispatchEvent(new CustomEvent('portal:staff-identity-resolved')); }catch(_){}
      try{
        if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
        if(typeof renderHeader === 'function') renderHeader();
        if(typeof renderToday === 'function') renderToday();
      }catch(_){}
      return true;
    }
    try{ window.portalStaffResolveIdentityEarlyFromSession = portalStaffResolveIdentityEarlyFromSession; }catch(_){}
    function portalTryOptimisticRosterFromPersistedAuth(){
      if(STAFF_DASHBOARD_ID || portalStaffDashIsEditorPreviewMode()) return false;
      if(typeof window !== 'undefined' && window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active) return false;
      var user = portalReadPersistedAuthUserLite();
      if(!user) return false;
      var profileForRoster = {
        username: String(user.email || '').split('@')[0],
        full_name: String((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '').trim()
      };
      var hit = portalBootstrapRosterHitFromAuthUser(user, profileForRoster);
      if(!hit || !hit.boot) return false;
      var sid = portalCanonicalStaffKeyLite(hit.staffId);
      if(!sid) return false;
      var authPrimary = typeof window.portalPrimaryStaffRosterKey === 'function'
        ? portalCanonicalStaffKeyLite(window.portalPrimaryStaffRosterKey(profileForRoster, user))
        : '';
      if(authPrimary && typeof portalStaffRosterKeysCross === 'function' && portalStaffRosterKeysCross(authPrimary, sid)) return false;
      return portalStaffApplyOptimisticRosterHit(hit, profileForRoster, user);
    }
    try{ window.portalTryOptimisticRosterFromPersistedAuth = portalTryOptimisticRosterFromPersistedAuth; }catch(_){}

    /** Staff/lead topbar brand orbits use F-02-1 crest. Dock centre uses FOOTERLOGO.png. */
    const PORTAL_STAFF_TOPBAR_LOGO_IDLE_URL = '/portal/F-02-1.png';
    const PORTAL_STAFF_TOPBAR_LOGO_CLEAR_URL = '/portal/F-02-1.png';
    const PORTAL_STAFF_TOPBAR_LOGO_REMINDER_URL = '/portal/F-02-1.png';
    const PORTAL_STAFF_TOPBAR_LOGO_ANNOUNCEMENT_URL = '/portal/F-02-1.png';
    const PORTAL_STAFF_TOPBAR_LOGO_BOTH_URL = '/portal/F-02-1.png';
    const PORTAL_DEFAULT_TOPBAR_AVATAR_URL = PORTAL_STAFF_TOPBAR_LOGO_CLEAR_URL;
    const PORTAL_ANNOUNCEMENT_TOPBAR_AVATAR_URL = PORTAL_STAFF_TOPBAR_LOGO_ANNOUNCEMENT_URL;
    const PORTAL_REMINDER_TOPBAR_AVATAR_URL = PORTAL_STAFF_TOPBAR_LOGO_REMINDER_URL;
    try{ window.__PORTAL_DEFAULT_TOPBAR_AVATAR__ = PORTAL_DEFAULT_TOPBAR_AVATAR_URL; }catch(_){}
    try{ window.__PORTAL_ANNOUNCEMENT_TOPBAR_AVATAR__ = PORTAL_ANNOUNCEMENT_TOPBAR_AVATAR_URL; }catch(_){}
    try{ window.__PORTAL_REMINDER_TOPBAR_AVATAR__ = PORTAL_REMINDER_TOPBAR_AVATAR_URL; }catch(_){}

    __postFbLand = portalCapturePostFeedbackLanding();
    if(__postFbLand.flagged && PORTAL_WEEK_REVIEW_VALID_DAYS.has(__postFbLand.reviewDay)){
      DEMO_VIEW_DAY = __postFbLand.reviewDay;
      __postFbLand.appliedReviewDay = true;
    }

    /**
     * When true, each load clears the sample “new” announcement ack so it stays unsigned (walkthrough).
     * Only runs if PORTAL_STAFF_INCLUDE_NEW_ANNOUNCEMENT_IN_NOTICES is true.
     */
    const PORTAL_STAFF_ANNOUNCEMENT_DEMO_RESET_EVERY_LOAD = false;
    /**
     * Set true to push PORTAL_STAFF_DEMO_NEW_ANNOUNCEMENT into dashboardData.notices as a pending item.
     * Keep false to preview only signed rows in Alerts/Notifications (quick menu + sheet).
     */
    const PORTAL_STAFF_INCLUDE_NEW_ANNOUNCEMENT_IN_NOTICES = false;
    /**
     * When true, seeds PORTAL_STAFF_DEMO_ARCHIVE_SIGNED_ANNOUNCEMENTS into the signed log (localStorage) if missing.
     */
    const PORTAL_STAFF_SEED_SIGNED_ARCHIVE_ANNOUNCEMENTS = false;
    /** Template for a future “new” notice from your CMS/API — same shape as production items. */
    const PORTAL_STAFF_DEMO_NEW_ANNOUNCEMENT = {
      type: 'announcement',
      title: 'New announcement',
      text: 'Read this update carefully, tick the confirmation, then sign. After you sign, the header follows reminders (feedback, venue, overrides, etc.) when applicable.',
      href: '#portal-staff-sample-announcement-new'
    };
    /** Sample signed log entries (notices feed does not need to list these; they are merged into ack for UI preview). */
    const PORTAL_STAFF_DEMO_ARCHIVE_SIGNED_ANNOUNCEMENTS = [
      {
        type: 'announcement',
        title: 'Pool safety — spring checklist',
        text: 'Briefing covers ratios, rescue equipment checks, and incident reporting. All staff must confirm they have read this before sessions.',
        href: '#portal-announcement-signed-pool-safety'
      },
      {
        type: 'announcement',
        title: 'Bank holiday — revised hours',
        text: 'Opening and closing times change on the dates listed on the club calendar. Please check your roster for the correct venue windows.',
        href: '#portal-announcement-signed-holiday-hours'
      }
    ];
    const PORTAL_DEMO_ANNOUNCEMENTS = PORTAL_STAFF_INCLUDE_NEW_ANNOUNCEMENT_IN_NOTICES ? [ PORTAL_STAFF_DEMO_NEW_ANNOUNCEMENT ] : [];
    var dashboardData = {
      staffName: '',
      portalIdentityResolved: false,
      portalFeedbackReconciled: false,
      portalFeedbackServerSynced: false,
      portalFeedbackPipelineReady: false,
      portalAnnouncementAcksMerged: false,
      avatarFile: (__spreadsheetBoot && __spreadsheetBoot.avatarFile) ? __spreadsheetBoot.avatarFile : '',
      /* Role training row colour: swimming | climbing | support | admin (support tint) | lead | manager | fitness */
      staffRoleTrack: (__spreadsheetBoot && __spreadsheetBoot.staffRoleTrack) ? __spreadsheetBoot.staffRoleTrack : 'swimming',
      dateLabel: getDemoDateLabel(DEMO_VIEW_DAY),
      dateTopbar: getDemoDateTopbar(DEMO_VIEW_DAY),
      setupPending: false,
      splitDay: false,
      venue: 'Acton',
      morning: { venue: 'Acton', time: '8.30 to 12.30 pm' },
      afternoon: { venue: 'Acton', time: '4.30 to 6.30 pm' },
      notices: PORTAL_DEMO_ANNOUNCEMENTS.concat([{ type: 'training', title: 'Reminders', opensSetup: true }]),
      portalRemindersFromAdmin: [],
      today: [],
      tomorrow: [],
      nextSessionCalendarDate: null,
      portalTodaySectionHeading: '',
      portalTodaySectionMode: 'today',
      portalTodayNextSessionPreview: null,
      week: [],
      /** Term grid: months/range filled from term_from_timetable.js; sample feedback only for demo usernames (see portalApplyTermCalendarForStaff). */
      termName: 'Summer Term 2026',
      termCalendarYear: 2026,
      termCalendarMonths: [3, 4, 5, 6],
      termCalendarFirstDom: { 3: 13 },
      termCalendarMonth: 4,
      termWorkedWeekdays: [],
      termHalfTermWeekStarts: [],
      termFeedbackByDate: {},
      termShiftEndByDate: {},
      termDemoNow: null
    };
    window.dashboardData = dashboardData;
    (function portalIdentityResolveInEditorPreview(){
      try{
        if(typeof portalStaffDashIsEditorPreviewMode !== 'function' || !portalStaffDashIsEditorPreviewMode()) return;
        if(!window.dashboardData) return;
        var nm = (__spreadsheetBoot && __spreadsheetBoot.staffName) ? String(__spreadsheetBoot.staffName).trim() : "";
        window.dashboardData.staffName = nm || "\u2026";
        window.dashboardData.portalIdentityResolved = true;
      }catch(_){}
    })();

    const PORTAL_ANNOUNCEMENT_ACK_STORAGE = 'portalAnnouncementAckMap_v1';
    let portalAnnouncementLockRequired = false;
    /** 'signedLog' | 'newNotice' (signable pending or informational calendar). */
    let portalAnnouncementsSheetEntry = '';
    function portalOpenAnnouncementsSheet(entry){
      portalAnnouncementsSheetEntry = entry === 'signedLog' ? 'signedLog' : 'newNotice';
      openSheet('announcementsSheet');
    }
    function portalAnnouncementAckMapLoad(){
      try{
        const raw = localStorage.getItem(PORTAL_ANNOUNCEMENT_ACK_STORAGE);
        if(!raw) return {};
        const o = JSON.parse(raw);
        return o && typeof o === 'object' ? o : {};
      }catch(_){ return {}; }
    }
    function portalAnnouncementAckMapSave(map){
      try{ localStorage.setItem(PORTAL_ANNOUNCEMENT_ACK_STORAGE, JSON.stringify(map || {})); }catch(_){}
    }
    function portalAnnouncementSignatureKey(item){
      if(!item || typeof item !== 'object') return '';
      if(
        typeof portalSignableItemIsCalendar202627 === 'function' &&
        portalSignableItemIsCalendar202627(item) &&
        typeof portalCalendar202627SignatureKey === 'function'
      ){
        return portalCalendar202627SignatureKey(item);
      }
      if(item.portalAnnouncementId) return 'portal-ann:' + String(item.portalAnnouncementId);
      if(item.portalContractId) return 'portal-ann:contract:' + String(item.portalContractId);
      if(item.portalAnnouncementId) return 'portal-ann:' + String(item.portalAnnouncementId);
      const t = String(item.title || '').trim().toLowerCase();
      const x = String(item.text || '').trim().toLowerCase();
      const h = String(item.href || '').trim().toLowerCase();
      return [t, x, h].join('||');
    }
    function portalAnnouncementHideDelayMs(src){
      if(!src || typeof src !== 'object') return null;
      var amt = parseInt(String(src.hideAfterAckAmount != null ? src.hideAfterAckAmount : src.hide_after_ack_amount || ''), 10);
      var unit = String(src.hideAfterAckUnit || src.hide_after_ack_unit || '').trim().toLowerCase();
      if(!amt || amt < 1) return null;
      if(unit === 'minutes') return amt * 60 * 1000;
      if(unit === 'hours') return amt * 60 * 60 * 1000;
      if(unit === 'days') return amt * 24 * 60 * 60 * 1000;
      return null;
    }
    function portalAnnouncementAckPastHideWindow(ackRec){
      var delay = portalAnnouncementHideDelayMs(ackRec);
      if(!delay) return false;
      var signedAt = Number(ackRec && ackRec.signedAt || 0);
      if(!signedAt) return false;
      return Date.now() >= signedAt + delay;
    }
    function portalPruneExpiredAnnouncementAcks(){
      /* Keep ack rows permanently so a signed announcement never returns as unsigned. */
    }
    async function portalHydrateAnnouncementsFromSupabase(){
      try{
        const box = typeof window !== 'undefined' ? window.__PORTAL_SUPABASE__ : null;
        const client = box && box.client;
        if(!client || !dashboardData || !Array.isArray(dashboardData.notices)){
          return;
        }
        const res = await client
          .from('portal_staff_announcements')
          .select('id,title,body,message_type,priority,audience_scope,delivery_scope,target_user_id,target_staff_role,created_at,ends_at,reminder_category,hide_after_ack_amount,hide_after_ack_unit,on_ack_action')
          .order('created_at', { ascending: false })
          .limit(50);
        if(res.error){
          try{ console.warn('[portal] portal_staff_announcements', res.error); }catch(_){}
          return;
        }
        if(!Array.isArray(res.data)) return;
        const prof = box && box.staff_profile;
        if(prof && prof.id && client && prof.profile_last_confirmed_at === undefined){
          try{
            const pr = await client
              .from('staff_profiles')
              .select('profile_last_confirmed_at')
              .eq('id', prof.id)
              .maybeSingle();
            if(!pr.error && pr.data){
              prof.profile_last_confirmed_at = pr.data.profile_last_confirmed_at;
            }
          }catch(_pr){}
        }
        const workerInboxCtx = {
          authUserId: (box.session && box.session.user && box.session.user.id) || (prof && prof.id) || '',
          appRole: prof && prof.app_role,
          staffRole: prof && prof.staff_role
        };
        if(typeof portalWorkerHasPortalPushSubscription === 'function'){
          workerInboxCtx.hasPortalPushSubscription = await portalWorkerHasPortalPushSubscription(client, workerInboxCtx.authUserId);
        }
        const inboxRows = typeof portalStaffAnnouncementRowVisibleOnWorkerInbox === 'function'
          ? res.data.filter(function(row){ return portalStaffAnnouncementRowVisibleOnWorkerInbox(row, workerInboxCtx); })
          : res.data;
        const now = Date.now();
        const annLiveFrom =
          typeof portalAnnouncementCreatedOnOrAfterLive === 'function'
            ? portalAnnouncementCreatedOnOrAfterLive
            : function(iso){ return String(iso || '').slice(0, 10) >= '2026-06-02'; };
        const visible = inboxRows.filter(function(row){
          if(!row || !row.id) return false;
          if(row.ends_at){
            const t = Date.parse(row.ends_at);
            if(Number.isFinite(t) && t < now) return false;
          }
          const typ = String(row.message_type || '').toLowerCase().trim();
          if(typ === 'announcement' && !annLiveFrom(row.created_at)) return false;
          return true;
        });
        dashboardData.portalLiveAnnouncementIdSet = {};
        visible.forEach(function(row){
          var rowTyp = String(row.message_type || '').toLowerCase().trim();
          if(rowTyp === 'announcement' || rowTyp === 'contract_signing'){
            dashboardData.portalLiveAnnouncementIdSet[String(row.id)] = true;
          }
        });
        dashboardData.portalLiveReminderIdSet = {};
        const completedContractIds = {};
        const completedContractAnnIds = {};
        try{
          const uid = workerInboxCtx.authUserId;
          if(uid){
            const cr = await client
              .from('employment_contracts')
              .select('id,announcement_id,status')
              .eq('user_id', uid)
              .eq('status', 'completed');
            if(!cr.error && Array.isArray(cr.data)){
              cr.data.forEach(function(c){
                if(c && c.id) completedContractIds[String(c.id)] = true;
                if(c && c.announcement_id) completedContractAnnIds[String(c.announcement_id)] = true;
              });
            }
          }
        }catch(_cc){}
        const preserved = dashboardData.notices.filter(function(n){
          if(!n || typeof n !== 'object') return false;
          var nTyp = String(n.type || '').trim();
          if(nTyp === 'contract'){
            var cid = String(n.portalContractId || '').trim();
            if(cid && completedContractIds[cid]) return false;
            var annId = String(n.portalAnnouncementId || '').trim();
            if(annId && completedContractAnnIds[annId]) return false;
            return true;
          }
          return nTyp !== 'announcement' || !n.portalAnnouncementId;
        });
        const existing = {};
        preserved.forEach(function(n){
          if(n && n.portalAnnouncementId) existing[String(n.portalAnnouncementId)] = true;
        });
        const annInjected = [];
        const remList = [];
        const remSeen = {};
        visible.forEach(function(row){
          const id = String(row.id || '');
          if(!id) return;
          const typ = String(row.message_type || '').toLowerCase().trim();
          if(typ === 'reminder'){
            if(remSeen[id]) return;
            remSeen[id] = true;
            let cat = String(row.reminder_category || 'notes').toLowerCase();
            if(cat !== 'training' && cat !== 'timesheet' && cat !== 'notes') cat = 'notes';
            remList.push({
              portalAdminReminderId: id,
              category: cat,
              title: String(row.title || 'Reminder').trim() || 'Reminder',
              body: String(row.body || '').trim(),
              created_at: row.created_at,
              onAckAction: String(row.on_ack_action || '').trim()
            });
            dashboardData.portalLiveReminderIdSet[id] = true;
            return;
          }
          if(typ === 'contract_signing'){
            if(existing[id]) return;
            var contractId = '';
            try{
              var parsed = JSON.parse(String(row.body || '{}'));
              contractId = String(parsed.contract_id || parsed.contractId || '').trim();
            }catch(_c){}
            if((contractId && completedContractIds[contractId]) || completedContractAnnIds[id]){
              try{
                var ackDone = portalAnnouncementAckMapLoad();
                var canonKey = 'portal-ann:' + id;
                if(!ackDone[canonKey]){
                  ackDone[canonKey] = {
                    title: portalFixMojibakeText(String(row.title || 'Employment contract signed').trim() || 'Employment contract signed'),
                    text: String(parsed && parsed.reference ? parsed.reference : '').trim(),
                    href: 'my_documents.html?category=documents&from=staff',
                    signedAt: Date.now(),
                    portalAnnouncementId: id,
                    portalContractId: contractId || ''
                  };
                  if(contractId) ackDone['portal-ann:contract:' + contractId] = ackDone[canonKey];
                  portalAnnouncementAckMapSave(ackDone);
                  if(typeof portalPersistAnnouncementAckToSupabase === 'function'){
                    void portalPersistAnnouncementAckToSupabase({ portalAnnouncementId: id, title: ackDone[canonKey].title, text: ackDone[canonKey].text, href: ackDone[canonKey].href });
                  }
                }
              }catch(_ackFix){}
              existing[id] = true;
              return;
            }
            existing[id] = true;
            annInjected.push({
              type: 'contract',
              title: portalFixMojibakeText(String(row.title || 'Sign employment contract').trim() || 'Sign employment contract'),
              text: 'Review and sign your employment contract. Your signed PDF will be saved in My Documents.',
              href: 'contract_sign.html?contract_id=' + encodeURIComponent(contractId),
              portalAnnouncementId: id,
              portalContractId: contractId
            });
            return;
          }
          if(existing[id]) return;
          if(String(row.on_ack_action || '').trim() === 'annual_profile'){
            if(
              typeof portalAnnualProfileCampaignComplete === 'function' &&
              portalAnnualProfileCampaignComplete(prof && prof.profile_last_confirmed_at)
            ){
              return;
            }
          }
          existing[id] = true;
          annInjected.push({
            type: 'announcement',
            title: String(row.title || 'Announcement').trim() || 'Announcement',
            text: String(row.body || '').trim(),
            href: '#portal-ann-' + id,
            portalAnnouncementId: id,
            hideAfterAckAmount: row.hide_after_ack_amount,
            hideAfterAckUnit: row.hide_after_ack_unit,
            onAckAction: String(row.on_ack_action || '').trim()
          });
        });
        if(!Array.isArray(dashboardData.portalRemindersFromAdmin)) dashboardData.portalRemindersFromAdmin = [];
        dashboardData.portalRemindersFromAdmin = remList;
        if(annInjected.length){
          dashboardData.notices = annInjected.concat(preserved);
        }
        if(typeof portalReconcileAnnouncementAckKeys === 'function'){
          portalReconcileAnnouncementAckKeys(
            dashboardData.notices || [],
            portalAnnouncementAckMapLoad,
            portalAnnouncementAckMapSave
          );
        }
        const annIds = visible
          .filter(function(row){
            var rowTyp = String(row.message_type || '').toLowerCase().trim();
            return rowTyp === 'announcement' || rowTyp === 'contract_signing';
          })
          .map(function(row){ return String(row.id || ''); })
          .filter(Boolean);
        const remIds = remList.map(function(r){ return String(r && r.portalAdminReminderId || '').trim(); }).filter(Boolean);
        const remMetaById = {};
        remList.forEach(function(r){
          const id = String(r && r.portalAdminReminderId || '').trim();
          if(!id) return;
          remMetaById[id] = { title: r.title, body: r.body };
        });
        if(remIds.length && typeof portalMergeReminderAcksFromSupabase === 'function'){
          await portalMergeReminderAcksFromSupabase(
            remIds,
            portalReminderAckMapLoad,
            portalReminderAckMapSave,
            remMetaById
          );
        }
        if(remList.length && typeof portalBackfillReminderAckMapFromAdminList === 'function'){
          portalBackfillReminderAckMapFromAdminList(remList, portalReminderAckMapLoad, portalReminderAckMapSave);
        }
        if(annIds.length && typeof portalMergeAnnouncementAcksFromSupabase === 'function'){
          await portalMergeAnnouncementAcksFromSupabase(
            annIds,
            portalAnnouncementAckMapLoad,
            portalAnnouncementAckMapSave,
            portalAnnouncementSignatureKey
          );
          const ackPatch = portalAnnouncementAckMapLoad();
          let ackChanged = false;
          annIds.forEach(function(id){
            const key = 'portal-ann:' + id;
            const notice = (dashboardData.notices || []).find(function(n){
              return n && String(n.portalAnnouncementId || '') === id;
            });
            if(notice && ackPatch[key]){
              ackPatch[key].title = String(notice.title || ackPatch[key].title || 'Announcement').trim();
              ackPatch[key].text = String(notice.text || ackPatch[key].text || '').trim();
              ackPatch[key].href = String(notice.href || ackPatch[key].href || '').trim();
              ackChanged = true;
            }
          });
          if(ackChanged) portalAnnouncementAckMapSave(ackPatch);
        }
        if(typeof portalPrunePreLaunchAnnouncementAcks === 'function'){
          portalPrunePreLaunchAnnouncementAcks(
            portalAnnouncementAckMapLoad,
            portalAnnouncementAckMapSave,
            dashboardData.portalLiveAnnouncementIdSet || {}
          );
        }
        if(typeof portalPruneStaleSignedAnnouncementAcks === 'function'){
          portalPruneStaleSignedAnnouncementAcks(
            portalAnnouncementAckMapLoad,
            portalAnnouncementAckMapSave,
            dashboardData.portalLiveAnnouncementIdSet || {}
          );
        }
        if(typeof portalPruneSupersededPortalReadyAnnouncementAcks === 'function'){
          portalPruneSupersededPortalReadyAnnouncementAcks(
            portalAnnouncementAckMapLoad,
            portalAnnouncementAckMapSave,
            dashboardData.portalLiveAnnouncementIdSet || {}
          );
        }
        if(typeof portalPruneStaleReminderAcks === 'function'){
          portalPruneStaleReminderAcks(
            portalReminderAckMapLoad,
            portalReminderAckMapSave,
            dashboardData.portalLiveReminderIdSet || {}
          );
        }
        dashboardData.portalAnnouncementAcksMerged = true;
        if(typeof portalSyncAnnouncementsAndRemindersUi === 'function'){
          portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
        }
      }catch(_){
      }finally{
        if(dashboardData) dashboardData.portalAnnouncementAcksMerged = true;
      }
    }
    try{ window.portalHydrateAnnouncementsFromSupabase = portalHydrateAnnouncementsFromSupabase; }catch(_){}
    window.addEventListener('portal:annual-profile-complete', function(){
      try{
        if(typeof portalHydrateAnnouncementsFromSupabase === 'function'){
          void portalHydrateAnnouncementsFromSupabase();
        }
        if(typeof portalSyncAnnouncementsAndRemindersUi === 'function'){
          portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
        }
        if(typeof portalSyncAnnualProfileQuickMenuGroup === 'function'){
          portalSyncAnnualProfileQuickMenuGroup();
        }
      }catch(_){}
    });
    let _portalStaffDemoAnnouncementAckClearedForSession = false;
    function portalResetStaffDemoAnnouncementAckIfFlagged(){
      if(!PORTAL_STAFF_ANNOUNCEMENT_DEMO_RESET_EVERY_LOAD) return;
      if(!PORTAL_STAFF_INCLUDE_NEW_ANNOUNCEMENT_IN_NOTICES) return;
      if(_portalStaffDemoAnnouncementAckClearedForSession) return;
      _portalStaffDemoAnnouncementAckClearedForSession = true;
      try{
        const key = portalAnnouncementSignatureKey(PORTAL_STAFF_DEMO_NEW_ANNOUNCEMENT);
        if(!key) return;
        const ack = portalAnnouncementAckMapLoad();
        if(ack[key]){
          delete ack[key];
          portalAnnouncementAckMapSave(ack);
        }
      }catch(_){}
    }
    /** Removes older demo announcement keys from ack so the signed log matches the current preview set. */
    function portalPruneLegacyStaffDemoAnnouncementAckKeys(){
      try{
        const ack = portalAnnouncementAckMapLoad();
        let changed = false;
        Object.keys(ack).forEach(function(k){
          const low = String(k || '').toLowerCase();
          if(
            low.indexOf('#portal-staff-demo-') !== -1 ||
            low.indexOf('demo archive') !== -1 ||
            low.indexOf('demo — new announcement') !== -1 ||
            low.indexOf('demo - new announcement') !== -1
          ){
            delete ack[k];
            changed = true;
          }
        });
        if(changed) portalAnnouncementAckMapSave(ack);
      }catch(_){}
    }
    /** Removes test / demo signed announcements from local ack (legacy pool/holiday demo keys only). */
    function portalPruneTestAnnouncementAckKeys(){
      try{
        const ack = portalAnnouncementAckMapLoad();
        let changed = false;
        Object.keys(ack).forEach(function(k){
          const rec = ack[k];
          if(!rec || typeof rec !== 'object') return;
          if(typeof portalAnnouncementAckIsArchivedSigned === 'function' && portalAnnouncementAckIsArchivedSigned(rec, k)) return;
          const title = String(rec.title || '').trim().toLowerCase();
          const href = String(rec.href || '').trim().toLowerCase();
          const keyLow = String(k || '').toLowerCase();
          if(title === 'ase'){
            delete ack[k];
            changed = true;
            return;
          }
          if(
            href.indexOf('portal-announcement-signed-pool') !== -1 ||
            href.indexOf('portal-announcement-signed-holiday') !== -1 ||
            keyLow.indexOf('portal-announcement-signed-pool') !== -1 ||
            keyLow.indexOf('portal-announcement-signed-holiday') !== -1 ||
            keyLow.indexOf('#portal-staff-demo-') !== -1
          ){
            delete ack[k];
            changed = true;
          }
        });
        if(changed) portalAnnouncementAckMapSave(ack);
      }catch(_){}
    }
    /** Ensures sample signed announcements exist in the signed map (idempotent). */
    function portalSeedDemoSignedAnnouncementArchivesIfNeeded(){
      try{
        if(!PORTAL_STAFF_SEED_SIGNED_ARCHIVE_ANNOUNCEMENTS) return;
        if(!Array.isArray(PORTAL_STAFF_DEMO_ARCHIVE_SIGNED_ANNOUNCEMENTS) || !PORTAL_STAFF_DEMO_ARCHIVE_SIGNED_ANNOUNCEMENTS.length) return;
        const ack = portalAnnouncementAckMapLoad();
        let changed = false;
        const basePast = 9 * 24 * 60 * 60 * 1000;
        for(let i = 0; i < PORTAL_STAFF_DEMO_ARCHIVE_SIGNED_ANNOUNCEMENTS.length; i++){
          const item = PORTAL_STAFF_DEMO_ARCHIVE_SIGNED_ANNOUNCEMENTS[i];
          const key = typeof portalAnnouncementSignatureKey === 'function' ? portalAnnouncementSignatureKey(item) : '';
          if(!key || ack[key]) continue;
          ack[key] = {
            title: String(item.title || 'Announcement').trim() || 'Announcement',
            text: String(item.text || '').trim(),
            href: String(item.href || '').trim(),
            signedAt: Date.now() - basePast - (i + 1) * (24 * 60 * 60 * 1000)
          };
          changed = true;
        }
        if(changed) portalAnnouncementAckMapSave(ack);
      }catch(_){}
    }
    function portalAnnouncementItemsFromNotices(){
      const raw = (dashboardData && Array.isArray(dashboardData.notices)) ? dashboardData.notices : [];
      return raw.filter(function(n){
        if(!n || typeof n !== 'object') return false;
        const typ = String(n.type || 'announcement').trim() || 'announcement';
        return typ === 'announcement' || typ === 'contract';
      });
    }
    function portalReminderAsSignableNotice(r){
      if(!r || !r.portalAdminReminderId) return null;
      return {
        type: 'reminder',
        title: String(r.title || 'Reminder').trim() || 'Reminder',
        text: String(r.body || '').trim(),
        href: '#portal-rem-' + String(r.portalAdminReminderId),
        portalAdminReminderId: String(r.portalAdminReminderId),
        reminderCategory: r.category,
        created_at: r.created_at,
        onAckAction: String(r.onAckAction || r.on_ack_action || '').trim()
      };
    }
    function portalSignableSignatureKey(item){
      if(!item || typeof item !== 'object') return '';
      if(String(item.type || '') === 'reminder' || item.portalAdminReminderId){
        return portalReminderSignatureKey(item);
      }
      return portalAnnouncementSignatureKey(item);
    }
    function portalSignableItemIsReminder(item){
      return !!(item && (String(item.type || '') === 'reminder' || item.portalAdminReminderId));
    }
    function portalMountCalendar202627AnnouncementCard(host, item){
      if(!host || !item) return;
      const t = portalFixMojibakeText(String(item.title || 'Day Centre Calendar 2026/27').trim() || 'Day Centre Calendar 2026/27');
      const txt = String(item.text || '').trim() || 'Term dates and calendar for the 2026/27 academic year.';
      const bodyHtml = typeof portalFormatSignableMessageHtml === 'function'
        ? portalFormatSignableMessageHtml(txt)
        : ('<p class="announcement-message-p">' + escapeHtml(txt) + '</p>');
      host.innerHTML =
        '<article class="announcement-lock-card announcement-lock-card--calendar-2026-27 announcement-lock-card--calendar-info">' +
          '<div class="announcement-lock-head"><strong>' + escapeHtml(t) + '</strong>' +
          '<span class="announcement-lock-badge announcement-lock-badge--announcement">Calendar</span></div>' +
          '<div class="announcement-lock-copy announcement-message-block">' + bodyHtml + '</div>' +
          '<div class="portal-calendar-2026-27-preview" id="portalCalendar202627PreviewHost">' +
            '<p class="alerts-sheet-placeholder" style="margin:0;padding:12px;">Loading calendar…</p>' +
          '</div>' +
          '<div class="announcement-lock-actions announcement-lock-actions--calendar">' +
            '<button type="button" class="announcement-download-btn" id="calendar202627DownloadBtn">Download PDF to My Documents</button>' +
            '<p class="announcement-download-hint" id="calendar202627DownloadStatus" hidden></p>' +
            '<p class="announcement-message-p" style="margin:0;font-size:13px;color:var(--muted,#728290);">Optional — save a copy to My Documents for your records.</p>' +
          '</div>' +
        '</article>';
      if(typeof portalLoadCalendar202627Into === 'function'){
        global.requestAnimationFrame(function(){
          const hostEl = document.getElementById('portalCalendar202627PreviewHost');
          if(hostEl) void portalLoadCalendar202627Into(hostEl);
        });
      }
    }
    function portalActiveAnnouncementItems(){
      if(dashboardData && !dashboardData.portalIdentityResolved) return [];
      if(dashboardData && dashboardData.portalAnnouncementAcksMerged === false) return [];
      const annAck = portalAnnouncementAckMapLoad();
      const remAck = portalReminderAckMapLoad();
      const items = [];
      portalAnnouncementItemsFromNotices().forEach(function(n){
        if(
          typeof portalSignableItemIsCalendar202627 === 'function' &&
          portalSignableItemIsCalendar202627(n)
        ){
          return;
        }
        const k = portalAnnouncementSignatureKey(n);
        const contractKey = n && n.portalContractId ? ('portal-ann:contract:' + String(n.portalContractId)) : '';
        const acked = (!!k && !!annAck[k]) || (!!contractKey && !!annAck[contractKey]);
        if(!acked){
          if(
            typeof portalSignableItemIsAnnualProfile === 'function' &&
            portalSignableItemIsAnnualProfile(n)
          ){
            const box = typeof window !== 'undefined' ? window.__PORTAL_SUPABASE__ : null;
            const p = box && box.staff_profile;
            if(
              typeof portalAnnualProfileCampaignComplete === 'function' &&
              portalAnnualProfileCampaignComplete(p && p.profile_last_confirmed_at)
            ){
              return;
            }
          }
          items.push(Object.assign({}, n));
        }
      });
      const rems = dashboardData && Array.isArray(dashboardData.portalRemindersFromAdmin) ? dashboardData.portalRemindersFromAdmin : [];
      rems.forEach(function(r){
        const n = portalReminderAsSignableNotice(r);
        if(!n) return;
        const k = portalReminderSignatureKey(n);
        if(!!k && !remAck[k]) items.push(n);
      });
      items.sort(function(a, b){
        const ta = Date.parse(a.created_at || '');
        const tb = Date.parse(b.created_at || '');
        if(Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
        return 0;
      });
      return items;
    }
    function portalAnnouncementPendingItem(){
      const list = portalActiveAnnouncementItems();
      return list.length ? list[0] : null;
    }
    window.portalActiveAnnouncementItems = portalActiveAnnouncementItems;
    window.portalAnnouncementPendingItem = portalAnnouncementPendingItem;
    window.portalMountCalendar202627AnnouncementCard = portalMountCalendar202627AnnouncementCard;
    function portalAnnouncementLockActive(){
      const annOpen = !!document.getElementById('announcementsSheet')?.classList.contains('open');
      return !!(portalAnnouncementLockRequired && annOpen && portalAnnouncementPendingItem());
    }
    function portalLiveAnnouncementIdSet(){
      const map = dashboardData && dashboardData.portalLiveAnnouncementIdSet;
      return map && typeof map === 'object' ? map : {};
    }
    function portalAnnouncementHistoryRows(){
      const ack = portalAnnouncementAckMapLoad();
      const liveSet = portalLiveAnnouncementIdSet();
      const out = [];
      Object.keys(ack).forEach(function(k){
        const rec = ack[k];
        if(!rec || typeof rec !== 'object') return;
        if(typeof portalAnnouncementAckShouldShowInSignedHistory === 'function'){
          if(!portalAnnouncementAckShouldShowInSignedHistory(rec, k, liveSet, portalAnnouncementAckPastHideWindow)) return;
        }else if(typeof portalAnnouncementAckIsArchivedSigned === 'function'){
          if(!portalAnnouncementAckIsArchivedSigned(rec, k)) return;
          if(typeof portalAnnouncementAckPastHideWindow === 'function' && portalAnnouncementAckPastHideWindow(rec)) return;
          if(typeof portalAnnouncementAckRecordIsLive === 'function' && !portalAnnouncementAckRecordIsLive(rec, k, liveSet)) return;
        }
        out.push({
          key: k,
          title: String(rec.title || 'Announcement').trim() || 'Announcement',
          text: String(rec.text || '').trim(),
          href: String(rec.href || '').trim(),
          signedAt: Number(rec.signedAt || 0)
        });
      });
      out.sort(function(a,b){ return b.signedAt - a.signedAt; });
      return out;
    }
    function portalSignedMessageHistoryRows(){
      const ann = portalAnnouncementHistoryRows().map(function(r){
        return Object.assign({ kind: 'announcement' }, r);
      });
      const remAck = portalReminderAckMapLoad();
      const rem = [];
      const remLive = dashboardData && Array.isArray(dashboardData.portalRemindersFromAdmin)
        ? dashboardData.portalRemindersFromAdmin
        : [];
      const remLiveSet = dashboardData && dashboardData.portalLiveReminderIdSet && typeof dashboardData.portalLiveReminderIdSet === 'object'
        ? dashboardData.portalLiveReminderIdSet
        : {};
      Object.keys(remAck).forEach(function(k){
        const rec = remAck[k];
        if(!rec || typeof rec !== 'object') return;
        if(String(k || '').indexOf('portal-rem:') !== 0) return;
        const remId = String(rec.portalAdminReminderId || k.slice('portal-rem:'.length) || '').trim();
        if(dashboardData && dashboardData.portalAnnouncementAcksMerged && remId && !remLiveSet[remId]) return;
        let text = String(rec.text || '').trim();
        let title = String(rec.title || 'Reminder').trim() || 'Reminder';
        if(!text || title === 'Reminder'){
          const remId = String(rec.portalAdminReminderId || k.slice('portal-rem:'.length) || '').trim();
          const live = remLive.find(function(r){ return String(r && r.portalAdminReminderId || '') === remId; });
          if(live){
            if(!text) text = String(live.body || live.text || '').trim();
            if(title === 'Reminder') title = String(live.title || title).trim() || title;
          }
        }
        rem.push({
          key: k,
          kind: 'reminder',
          title: title,
          text: text,
          signedAt: Number(rec.signedAt || 0)
        });
      });
      return ann.concat(rem).sort(function(a, b){ return b.signedAt - a.signedAt; });
    }
    function portalAnnouncementHistoryDateLabel(ms){
      if(!Number.isFinite(ms) || ms <= 0) return '';
      try{
        const d = new Date(ms);
        return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }catch(_){ return ''; }
    }
    function portalAnnouncementHistoryHeadingLines(titleRaw){
      const raw = String(titleRaw || '').trim() || 'Announcement';
      if(/safeguarding\s*reminder/i.test(raw) && /attendance\s*notes/i.test(raw)){
        return { line1: 'Safeguarding reminder', line2: 'Attendance notes' };
      }
      const parts = raw.split(/\s*-\s*/).map(function(x){ return String(x || '').trim(); }).filter(Boolean);
      if(parts.length >= 2){
        return { line1: parts[0], line2: parts.slice(1).join(' - ') };
      }
      return { line1: raw, line2: '' };
    }
    function portalFixMojibakeText(text){
      return String(text || '')
        .replace(/\uFFFD/g, '\u2014')
        .replace(/\s+\?\s+/g, ' \u2014 ');
    }
    async function portalLoadContractAnnouncementPreview(contractId){
      const host = document.getElementById('contractAnnPreview');
      if(!host || !contractId) return;
      host.innerHTML = '<p class="alerts-sheet-placeholder" style="margin:0;padding:1rem;">Loading contract…</p>';
      try{
        if(!window.ContractCore){
          await new Promise(function(resolve, reject){
            var s = document.createElement('script');
            s.src = 'portal/contract-core.js?v=20260628-app-submit-fix';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        const C = window.ContractCore;
        const box = window.__PORTAL_SUPABASE__;
        if(!C || !box || !box.client) throw new Error('Not signed in');
        const { data, error } = await box.client
          .from('employment_contracts')
          .select('template_data,director_signature,form_payload,status')
          .eq('id', String(contractId))
          .eq('user_id', box.session.user.id)
          .maybeSingle();
        if(error || !data) throw new Error('Could not load contract');
        if(C.loadLogo && !C.logoDataUrl){
          const logo = await C.loadLogo();
          if(logo) C.logoDataUrl = logo;
        }
        const td = data.template_data || {};
        const kind = td.CONTRACT_KIND || (data.form_payload && data.form_payload.contractKind) || 'zero_hours';
        const filled = C.fillTemplate(td, kind);
        host.innerHTML = C.renderContractHtml(filled, false, {
          directorSignatureDataUrl: data.director_signature
        }, kind);
      }catch(_e){
        host.innerHTML = '<p class="alerts-sheet-placeholder" style="margin:0;padding:1rem;">Open the button below to review the full contract.</p>';
      }
    }
    function portalEnsureAnnouncementDemoSeed(){
      if(PORTAL_STAFF_ANNOUNCEMENT_DEMO_RESET_EVERY_LOAD) return;
      try{
        if(localStorage.getItem('portalAnnouncementDemoSeed_v1') === '1') return;
      }catch(_){}
      const all = portalAnnouncementItemsFromNotices();
      if(!all.length) return;
      const ack = portalAnnouncementAckMapLoad();
      const doneCandidate = all[1] || all[0];
      const key = portalAnnouncementSignatureKey(doneCandidate);
      if(key && !ack[key]){
        ack[key] = {
          title: doneCandidate.title || 'Announcement',
          text: doneCandidate.text || '',
          href: doneCandidate.href || '',
          signedAt: Date.now() - (36 * 60 * 60 * 1000)
        };
        portalAnnouncementAckMapSave(ack);
      }
      try{ localStorage.setItem('portalAnnouncementDemoSeed_v1', '1'); }catch(_){}
    }
    function renderAnnouncementsSheetContent(){
      const hostPending = document.getElementById('announcementPendingHost');
      const hostHistory = document.getElementById('announcementHistoryHost');
      if(!hostPending || !hostHistory) return;
      const signedLogView = portalAnnouncementsSheetEntry === 'signedLog';
      const pending = signedLogView ? null : portalAnnouncementPendingItem();
      if(signedLogView){
        hostPending.innerHTML = '';
        portalAnnouncementLockRequired = false;
        hostHistory.hidden = false;
        hostHistory.setAttribute('aria-hidden', 'false');
        const rows = portalSignedMessageHistoryRows();
        if(!rows.length){
          hostHistory.innerHTML = '<article class="announcement-history-card"><p class="alerts-sheet-placeholder" style="margin:0;">No signed announcements or reminders yet.</p></article>';
        }else{
          hostHistory.innerHTML =
            '<article class="announcement-history-card">' +
              '<p class="announcement-history-head">Signed Announcements/Reminders</p>' +
              rows.map(function(r, i){
                const dt = portalAnnouncementHistoryDateLabel(r.signedAt);
                const lines = portalAnnouncementHistoryHeadingLines(r.title);
                const kind = String(r.kind || 'announcement') === 'reminder' ? 'reminder' : 'announcement';
                const link = '';
                const histBody = typeof portalFormatSignableMessageHtml === 'function'
                  ? portalFormatSignableMessageHtml(r.text || 'No details captured.')
                  : ('<p class="announcement-message-p">' + escapeHtml(r.text || 'No details captured.') + '</p>');
                return '<div class="announcement-history-item announcement-history-item--' + kind + (i === 0 ? ' is-open' : '') + '">' +
                  '<button type="button" class="announcement-history-toggle" data-announcement-toggle><span class="announcement-history-title"><span class="announcement-history-kind">' + escapeHtml(kind === 'reminder' ? 'Reminder' : 'Announcement') + '</span><span class="announcement-history-title-line">' + escapeHtml(lines.line1) + '</span>' + (lines.line2 ? '<span class="announcement-history-title-line">' + escapeHtml(lines.line2) + '</span>' : '') + '</span><span class="announcement-history-date">' + escapeHtml(dt) + '</span></button>' +
                  '<div class="announcement-history-body announcement-message-block">' + histBody + link + '</div>' +
                '</div>';
              }).join('') +
            '</article>';
        }
        try{
          const bodyEl = document.getElementById('announcementsSheetBody');
          if(bodyEl) bodyEl.scrollTop = 0;
        }catch(_){}
      }else if(pending){
        portalAnnouncementLockRequired = true;
        const isReminder = portalSignableItemIsReminder(pending);
        const kindLabel = isReminder ? 'Reminder' : 'Announcement';
        const t = portalFixMojibakeText(String(pending.title || kindLabel).trim() || kindLabel);
        const txt = String(pending.text || '').trim() || (isReminder ? 'Please read this reminder carefully.' : 'Please read this update carefully.');
        const confirmLabel = isReminder
          ? 'I have read and understood this reminder.'
          : 'I have read and understood this announcement.';
        const signKey = portalSignableSignatureKey(pending);
        const signBtnLabel = 'Sign and submit';
        const bodyHtml = typeof portalFormatSignableMessageHtml === 'function'
          ? portalFormatSignableMessageHtml(txt)
          : ('<p class="announcement-message-p">' + escapeHtml(txt) + '</p>');
        if(String(pending.type || '') === 'contract' && pending.portalContractId){
          const signHref = 'contract_sign.html?contract_id=' + encodeURIComponent(String(pending.portalContractId));
          hostPending.innerHTML =
            '<article class="announcement-lock-card">' +
              '<div class="announcement-lock-head"><strong>' + escapeHtml(t) + '</strong></div>' +
              '<p class="announcement-message-p">Review your employment contract below, then sign to save a PDF in My Documents.</p>' +
              '<div id="contractAnnPreview" class="contract-preview-shell" style="margin:0.75rem 0;"></div>' +
              '<div class="announcement-lock-actions">' +
                '<a href="' + signHref + '" class="announcement-sign-btn" style="display:inline-block;text-align:center;text-decoration:none;line-height:1.2;padding:12px 16px;">Sign contract</a>' +
              '</div>' +
            '</article>';
          portalLoadContractAnnouncementPreview(String(pending.portalContractId));
        }else if(
          typeof portalSignableItemIsAnnualProfile === 'function' &&
          portalSignableItemIsAnnualProfile(pending)
        ){
          hostPending.innerHTML =
            '<article class="announcement-lock-card announcement-lock-card--annual-profile">' +
              '<div class="announcement-lock-head"><strong>' + escapeHtml(t) + '</strong>' +
              '<span class="announcement-lock-badge announcement-lock-badge--announcement">Profile</span></div>' +
              '<div class="announcement-lock-copy announcement-message-block">' + bodyHtml + '</div>' +
              '<p class="announcement-message-p" style="margin:0 0 12px;font-size:13px;color:var(--muted,#728290);">This notice clears automatically when you submit the annual profile form.</p>' +
              '<div class="announcement-lock-actions">' +
                '<button type="button" class="announcement-sign-btn" id="annualProfileAnnOpenBtn">Open annual profile</button>' +
              '</div>' +
            '</article>';
        }else{
        hostPending.innerHTML =
          '<article class="announcement-lock-card announcement-lock-card--' + (isReminder ? 'reminder' : 'announcement') + '">' +
            '<div class="announcement-lock-head"><strong>' + escapeHtml(t) + '</strong>' +
            '<span class="announcement-lock-badge announcement-lock-badge--' + (isReminder ? 'reminder' : 'announcement') + '">' + escapeHtml(kindLabel) + '</span></div>' +
            '<div class="announcement-lock-copy announcement-message-block">' + bodyHtml + '</div>' +
            '<div class="announcement-lock-actions">' +
              '<label class="announcement-lock-check"><input type="checkbox" id="announcementReadConfirm" name="announcementReadConfirm"> ' + escapeHtml(confirmLabel) + '</label>' +
              '<button type="button" class="announcement-sign-btn" id="announcementSignBtn" disabled data-announcement-sign-key="' + escapeHtml(signKey) + '">' + escapeHtml(signBtnLabel) + '</button>' +
            '</div>' +
          '</article>';
        }
        hostHistory.innerHTML = '';
        hostHistory.hidden = true;
        hostHistory.setAttribute('aria-hidden', 'true');
      }else{
        hostPending.innerHTML = '';
        portalAnnouncementLockRequired = false;
        hostHistory.hidden = false;
        hostHistory.setAttribute('aria-hidden', 'false');
        const rows = portalSignedMessageHistoryRows();
        if(!rows.length){
          hostHistory.innerHTML = '<article class="announcement-history-card"><p class="alerts-sheet-placeholder" style="margin:0;">No signed announcements or reminders yet.</p></article>';
        }else{
          hostHistory.innerHTML =
            '<article class="announcement-history-card">' +
              '<p class="announcement-history-head">Signed Announcements/Reminders</p>' +
              rows.map(function(r, i){
                const dt = portalAnnouncementHistoryDateLabel(r.signedAt);
                const lines = portalAnnouncementHistoryHeadingLines(r.title);
                const kind = String(r.kind || 'announcement') === 'reminder' ? 'reminder' : 'announcement';
                const link = '';
                const histBody = typeof portalFormatSignableMessageHtml === 'function'
                  ? portalFormatSignableMessageHtml(r.text || 'No details captured.')
                  : ('<p class="announcement-message-p">' + escapeHtml(r.text || 'No details captured.') + '</p>');
                return '<div class="announcement-history-item announcement-history-item--' + kind + (i === 0 ? ' is-open' : '') + '">' +
                  '<button type="button" class="announcement-history-toggle" data-announcement-toggle><span class="announcement-history-title"><span class="announcement-history-kind">' + escapeHtml(kind === 'reminder' ? 'Reminder' : 'Announcement') + '</span><span class="announcement-history-title-line">' + escapeHtml(lines.line1) + '</span>' + (lines.line2 ? '<span class="announcement-history-title-line">' + escapeHtml(lines.line2) + '</span>' : '') + '</span><span class="announcement-history-date">' + escapeHtml(dt) + '</span></button>' +
                  '<div class="announcement-history-body announcement-message-block">' + histBody + link + '</div>' +
                '</div>';
              }).join('') +
            '</article>';
        }
        try{
          const bodyEl = document.getElementById('announcementsSheetBody');
          if(bodyEl) bodyEl.scrollTop = 0;
        }catch(_){}
      }
      syncAnnouncementsSheetBackBtn();
      if(typeof syncDockNavContext === 'function') syncDockNavContext();
    }

    function syncAnnouncementsSheetBackBtn(){
      const btn = document.getElementById('announcementsSheetBackBtn');
      if(!btn) return;
      const annOpen = !!document.getElementById('announcementsSheet')?.classList.contains('open');
      const signedLogView = portalAnnouncementsSheetEntry === 'signedLog';
      const lockActive = !!(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive());
      const show = annOpen && (signedLogView || !lockActive);
      btn.hidden = !show;
      btn.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    /** Halo colours from quick-menu override kinds (absent = green orbit). */
    function portalRosterOverrideHaloScan(st){
      const out = { newShift: false, trial: false, makeup: false, undo: false, absent: false, cancelled: false, training: false, shadowing: false, meeting: false, other: false };
      const dayGroups = Array.isArray(st && st.rosterOverrideDayGroups) ? st.rosterOverrideDayGroups : [];
      for(let g = 0; g < dayGroups.length; g++){
        const items = Array.isArray(dayGroups[g] && dayGroups[g].items) ? dayGroups[g].items : [];
        for(let i = 0; i < items.length; i++){
          const k = String(items[i] && items[i].kind || '').trim();
          if(!k) continue;
          if(k === 'absent'){ out.absent = true; continue; }
          if(k === 'training'){ out.training = true; continue; }
          if(k === 'shadowing'){ out.shadowing = true; continue; }
          if(k === 'meeting'){ out.meeting = true; continue; }
          if(k === 'cancelled' || k === 'shift_cancelled'){ out.cancelled = true; continue; }
          if(k === 'new_shift' || k === 'roster_day') out.newShift = true;
          else if(k === 'trial' || k === 'new_participant') out.trial = true;
          else if(k === 'makeup') out.makeup = true;
          else if(k === 'reverted') out.undo = true;
          else if(k === 'slot_opened'){ /* cards only */ }
          else out.other = true;
        }
      }
      return out;
    }
    function portalScheduleHaloActive(scan){
      if(!scan) return false;
      return !!(scan.newShift || scan.trial || scan.makeup || scan.undo || scan.absent || scan.cancelled || scan.training || scan.shadowing || scan.meeting || scan.other);
    }
    function portalScheduleHaloMode(scan){
      if(!portalScheduleHaloActive(scan)) return '';
      if(scan.makeup && !scan.trial && !scan.undo && !scan.training) return 'schedule-makeup';
      const ns = !!(scan.newShift || scan.other);
      if(scan.absent && !scan.trial && !scan.makeup && !scan.undo && !ns && !scan.cancelled && !scan.training) return 'schedule-absent';
      if(scan.cancelled && !scan.trial && !scan.makeup && !scan.undo && !ns && !scan.absent && !scan.training) return 'schedule-cancelled';
      if(scan.training && !scan.trial && !scan.makeup && !scan.undo && !ns && !scan.absent && !scan.cancelled && !scan.shadowing && !scan.meeting) return 'schedule-training';
      if(scan.shadowing && !scan.trial && !scan.makeup && !scan.undo && !ns && !scan.absent && !scan.cancelled && !scan.training && !scan.meeting) return 'schedule-shadowing';
      if(scan.meeting && !scan.trial && !scan.makeup && !scan.undo && !ns && !scan.absent && !scan.cancelled && !scan.training && !scan.shadowing) return 'schedule-meeting';
      if(scan.undo && !scan.trial && !scan.makeup && !ns && !scan.absent && !scan.cancelled && !scan.training) return 'schedule-undo';
      if(scan.makeup && !scan.trial && !ns && !scan.undo && !scan.absent && !scan.cancelled && !scan.training) return 'schedule-makeup';
      if(scan.trial && !ns && !scan.makeup && !scan.undo && !scan.absent && !scan.cancelled && !scan.training) return 'schedule-trial-only';
      if(scan.trial && ns) return 'schedule-trial';
      if(ns) return 'schedule';
      if(scan.trial) return 'schedule-trial-only';
      if(scan.makeup) return 'schedule-makeup';
      if(scan.absent) return 'schedule-absent';
      if(scan.cancelled) return 'schedule-cancelled';
      if(scan.training) return 'schedule-training';
      if(scan.undo) return 'schedule-undo';
      return 'schedule';
    }
    function portalRosterOverrideAttentionHasTrial(st){
      const scan = portalRosterOverrideHaloScan(st);
      return !!scan.trial;
    }
    function portalNotificationAlertFlags(st){
      const shot = typeof window !== 'undefined' ? String(window.__PORTAL_GUIDE_HALO_SHOT__ || '').trim().toLowerCase() : '';
      if(shot && portalStaffIsDemoAccount()){
        if(shot === 'gold' || shot === 'orange' || shot === 'reminder' || shot === 'feedback'){
          return { chat: false, announcement: false, feedback: true };
        }
        if(shot === 'red' || shot === 'announcement'){
          return { chat: false, announcement: true, feedback: false };
        }
        if(shot === 'blue' || shot === 'chat'){
          return { chat: true, announcement: false, feedback: false };
        }
        if(shot === 'both' || shot === 'ann-fb'){
          return { chat: false, announcement: true, feedback: true };
        }
        if(shot === 'chat-fb'){
          return { chat: true, announcement: false, feedback: true };
        }
        if(shot === 'chat-ann'){
          return { chat: true, announcement: true, feedback: false };
        }
        if(shot === 'green' || shot === 'schedule'){
          return { chat: false, announcement: false, feedback: false, schedule: true };
        }
        if(shot === 'triple' || shot === 'multi' || shot === 'all'){
          return { chat: true, announcement: true, feedback: true, schedule: false };
        }
      }
      const state = st || (typeof portalReminderState === 'function' ? portalReminderState() : null);
      const hasFeedback = !!(state && state.sessionFeedbackNeed);
      const hasReminderOther = !!(state && (state.venueOpenNeed || state.venueCloseNeed || state.setupPending));
      const haloScan = portalRosterOverrideHaloScan(state);
      let scheduleMode = portalScheduleHaloMode(haloScan);
      const hasShadowing = !!haloScan.shadowing;
      if(!scheduleMode && portalStaffHasUpcomingShadowingHostAlert(
        typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '',
        dashboardData && dashboardData.staffName
      )){
        scheduleMode = 'schedule';
      }
      const dmUnread = (parseInt(window.__PORTAL_STAFF_DM_UNREAD_COUNT__, 10) || 0) > 0 || !!window.__PORTAL_STAFF_DM_HAS_UNREAD__;
      return {
        chat: false,
        announcement: portalActiveAnnouncementItems().length > 0,
        feedback: hasFeedback || hasReminderOther,
        schedule: !!scheduleMode,
        scheduleMode: scheduleMode,
        scheduleTrial: scheduleMode === 'schedule-trial' || scheduleMode === 'schedule-trial-only',
        shadowing: hasShadowing
      };
    }
    function portalNotificationAlertState(st){
      const f = portalNotificationAlertFlags(st);
      const orange = f.feedback;
      const green = f.scheduleMode;
      const sh = f.shadowing;
      const sk = f.scheduleTrial ? '-trial' : '';
      if(sh && !f.chat && !f.announcement){
        if(orange && green) return 'reminder-schedule-shadowing' + sk;
        if(orange && !green) return 'reminder-shadowing';
        if(green && !orange) return 'schedule-shadowing' + sk;
        if(!orange && !green) return 'schedule-shadowing-only';
      }
      if(f.chat && f.announcement && orange && green) return 'quad' + sk;
      if(f.chat && f.announcement && green) return 'chat-ann-schedule' + sk;
      if(f.chat && orange && green) return 'chat-fb-schedule' + sk;
      if(f.announcement && orange && green) return 'both-schedule' + sk;
      if(f.chat && f.announcement && orange) return 'triple';
      if(f.chat && f.announcement) return 'chat-ann';
      if(f.chat && orange) return 'chat-fb';
      if(f.announcement && orange) return 'both';
      if(f.chat && green) return 'chat-schedule' + sk;
      if(f.announcement && green) return 'announcement-schedule' + sk;
      if(orange && green) return 'reminder-schedule' + sk;
      if(f.chat) return 'chat';
      if(f.announcement) return 'announcement';
      if(orange) return 'reminder';
      if(green && !f.chat && !f.announcement && !orange) return green;
      if(green) return 'schedule' + sk;
      return 'none';
    }
    function portalApplyPortalOrbitAlertClasses(el, st){
      if(!el) return;
      const f = portalNotificationAlertFlags(st);
      const orange = f.feedback;
      const active = !!(f.chat || f.announcement || orange || f.schedule);
      const orbitClasses = [
        'avatar-wrap--portal-orbit-idle',
        'avatar-wrap--portal-alert',
        'avatar-wrap--portal-alert-reminder',
        'avatar-wrap--portal-alert-both',
        'avatar-wrap--portal-alert-chat',
        'avatar-wrap--portal-alert-chat-ann',
        'avatar-wrap--portal-alert-chat-fb',
        'avatar-wrap--portal-alert-triple',
        'avatar-wrap--portal-alert-schedule',
        'avatar-wrap--portal-alert-schedule-trial',
        'avatar-wrap--portal-alert-schedule-trial-only',
        'avatar-wrap--portal-alert-schedule-makeup',
        'avatar-wrap--portal-alert-schedule-absent',
        'avatar-wrap--portal-alert-schedule-undo',
        'avatar-wrap--portal-alert-schedule-cancelled',
        'avatar-wrap--portal-alert-schedule-training',
        'avatar-wrap--portal-alert-schedule-shadowing',
        'avatar-wrap--portal-alert-schedule-shadowing-only',
        'avatar-wrap--portal-alert-schedule-meeting',
        'avatar-wrap--portal-alert-reminder-shadowing',
        'avatar-wrap--portal-alert-reminder-schedule-shadowing',
        'avatar-wrap--portal-alert-schedule-shadowing-trial',
        'avatar-wrap--portal-alert-reminder-schedule-shadowing-trial',
        'avatar-wrap--portal-alert-chat-schedule',
        'avatar-wrap--portal-alert-chat-schedule-trial',
        'avatar-wrap--portal-alert-announcement-schedule',
        'avatar-wrap--portal-alert-announcement-schedule-trial',
        'avatar-wrap--portal-alert-reminder-schedule',
        'avatar-wrap--portal-alert-reminder-schedule-trial',
        'avatar-wrap--portal-alert-both-schedule',
        'avatar-wrap--portal-alert-both-schedule-trial',
        'avatar-wrap--portal-alert-chat-ann-schedule',
        'avatar-wrap--portal-alert-chat-ann-schedule-trial',
        'avatar-wrap--portal-alert-chat-fb-schedule',
        'avatar-wrap--portal-alert-chat-fb-schedule-trial',
        'avatar-wrap--portal-alert-quad',
        'avatar-wrap--portal-alert-quad-trial'
      ];
      const dockClasses = [
        'dock-nav-item--portal-attention',
        'dock-nav-item--portal-attention-chat',
        'dock-nav-item--portal-attention-announcement',
        'dock-nav-item--portal-attention-feedback',
        'dock-nav-item--portal-attention-chat-ann',
        'dock-nav-item--portal-attention-chat-fb',
        'dock-nav-item--portal-attention-ann-fb',
        'dock-nav-item--portal-attention-triple'
      ];
      const isDock = el.classList && el.classList.contains('dock-nav-item--dashboard');
      (isDock ? dockClasses : orbitClasses).forEach(function(c){ el.classList.remove(c); });
      /* Footer centre logo stays static (white); alert orbits/pulse are header-only. */
      if(isDock) return;
      el.classList.toggle('avatar-wrap--portal-orbit-idle', !active);
      if(!active) return;
      const mode = portalNotificationAlertState(st);
      const modeClass = {
        'quad-trial': 'avatar-wrap--portal-alert-quad-trial',
        quad: 'avatar-wrap--portal-alert-quad',
        'chat-ann-schedule-trial': 'avatar-wrap--portal-alert-chat-ann-schedule-trial',
        'chat-ann-schedule': 'avatar-wrap--portal-alert-chat-ann-schedule',
        'chat-fb-schedule-trial': 'avatar-wrap--portal-alert-chat-fb-schedule-trial',
        'chat-fb-schedule': 'avatar-wrap--portal-alert-chat-fb-schedule',
        'both-schedule-trial': 'avatar-wrap--portal-alert-both-schedule-trial',
        'both-schedule': 'avatar-wrap--portal-alert-both-schedule',
        triple: 'avatar-wrap--portal-alert-triple',
        'chat-ann': 'avatar-wrap--portal-alert-chat-ann',
        'chat-fb': 'avatar-wrap--portal-alert-chat-fb',
        both: 'avatar-wrap--portal-alert-both',
        'chat-schedule-trial': 'avatar-wrap--portal-alert-chat-schedule-trial',
        'chat-schedule': 'avatar-wrap--portal-alert-chat-schedule',
        'announcement-schedule-trial': 'avatar-wrap--portal-alert-announcement-schedule-trial',
        'announcement-schedule': 'avatar-wrap--portal-alert-announcement-schedule',
        'reminder-schedule-trial': 'avatar-wrap--portal-alert-reminder-schedule-trial',
        'reminder-schedule': 'avatar-wrap--portal-alert-reminder-schedule',
        chat: 'avatar-wrap--portal-alert-chat',
        announcement: 'avatar-wrap--portal-alert',
        reminder: 'avatar-wrap--portal-alert-reminder',
        'schedule-trial': 'avatar-wrap--portal-alert-schedule-trial',
        'schedule-trial-only': 'avatar-wrap--portal-alert-schedule-trial-only',
        'schedule-makeup': 'avatar-wrap--portal-alert-schedule-makeup',
        'schedule-absent': 'avatar-wrap--portal-alert-schedule-absent',
        'schedule-undo': 'avatar-wrap--portal-alert-schedule-undo',
        'schedule-cancelled': 'avatar-wrap--portal-alert-schedule-cancelled',
        'schedule-training': 'avatar-wrap--portal-alert-schedule-training',
        'schedule-shadowing': 'avatar-wrap--portal-alert-schedule-shadowing',
        'schedule-shadowing-only': 'avatar-wrap--portal-alert-schedule-shadowing-only',
        'schedule-meeting': 'avatar-wrap--portal-alert-schedule-meeting',
        'reminder-shadowing': 'avatar-wrap--portal-alert-reminder-shadowing',
        'reminder-schedule-shadowing': 'avatar-wrap--portal-alert-reminder-schedule-shadowing',
        'reminder-schedule-shadowing-trial': 'avatar-wrap--portal-alert-reminder-schedule-shadowing-trial',
        'schedule-shadowing-trial': 'avatar-wrap--portal-alert-schedule-shadowing-trial',
        schedule: 'avatar-wrap--portal-alert-schedule'
      }[mode];
      if(modeClass) el.classList.add(modeClass);
    }
    function portalHasActiveAnnouncementOrReminder(st){
      return portalNotificationAlertState(st) !== 'none';
    }
    function portalTopbarAvatarIsStaffBrandUrl(url){
      const s = String(url || '');
      if(!s) return false;
      if(s === PORTAL_DEFAULT_TOPBAR_AVATAR_URL) return true;
      if(s === PORTAL_ANNOUNCEMENT_TOPBAR_AVATAR_URL) return true;
      if(s === PORTAL_REMINDER_TOPBAR_AVATAR_URL) return true;
      if(/ANNOUNCEMENTES_LOGO\.png(\?|#|$)/i.test(s)) return true;
      if(/logoNaranja\.png(\?|#|$)/i.test(s)) return true;
      if(/logoamarillo\.png(\?|#|$)/i.test(s)) return true;
      if(/logoazul\.png(\?|#|$)/i.test(s)) return true;
      if(/F-02-1\.png(\?|#|$)/i.test(s)) return true;
      if(/portal_crest\.svg(\?|#|$)/i.test(s)) return true;
      if(/F-06-1\.png(\?|#|$)/i.test(s)) return true;
      if(/F-07-1\.png(\?|#|$)/i.test(s)) return true;
      return false;
    }
    /** Topbar image tracks alert mode: yellow idle/both, red announcement, orange reminder, blue clear (PNGs in `working_ui/`). */
    function portalTopbarAvatarDisplayUrl(st){
      try{
        if(dashboardData && !dashboardData.portalIdentityResolved) return PORTAL_STAFF_TOPBAR_LOGO_IDLE_URL;
      }catch(_){ /* ignore */ }
      var mode = 'none';
      try{ mode = portalNotificationAlertState(st); }catch(_){ mode = 'none'; }
      if(mode === 'schedule' || mode === 'schedule-trial' || mode === 'schedule-trial-only' || mode === 'schedule-makeup' || mode === 'schedule-absent' || mode === 'schedule-undo' || mode === 'schedule-cancelled' || mode === 'schedule-training') return PORTAL_STAFF_TOPBAR_LOGO_CLEAR_URL;
      if(mode === 'triple' || mode === 'chat-ann' || mode === 'chat-fb' || mode === 'both' || mode === 'quad' || mode === 'quad-trial' || mode.indexOf('-schedule') >= 0) return PORTAL_STAFF_TOPBAR_LOGO_BOTH_URL;
      if(mode === 'announcement' || mode === 'announcement-schedule') return PORTAL_STAFF_TOPBAR_LOGO_ANNOUNCEMENT_URL;
      if(mode === 'chat' || mode === 'chat-schedule') return PORTAL_STAFF_TOPBAR_LOGO_CLEAR_URL;
      if(mode === 'reminder' || mode === 'reminder-schedule') return PORTAL_STAFF_TOPBAR_LOGO_REMINDER_URL;
      return PORTAL_STAFF_TOPBAR_LOGO_CLEAR_URL;
    }
    function syncPortalHeaderAlertChrome(st){
      const wrap = document.getElementById('avatarWrap');
      if(!wrap) return;
      if(dashboardData && !dashboardData.portalIdentityResolved){
        portalApplyPortalOrbitAlertClasses(wrap, st);
        const avEarly = document.getElementById('avatar');
        const avImgEarly = avEarly && avEarly.querySelector('img');
        if(avEarly && avImgEarly){
          avImgEarly.src = PORTAL_STAFF_TOPBAR_LOGO_IDLE_URL;
          avEarly.classList.add('avatar--brand-default');
        }
        return;
      }
      portalApplyPortalOrbitAlertClasses(wrap, st);
      const av = document.getElementById('avatar');
      const avImg = av && av.querySelector('img');
      const targetSrc = typeof portalTopbarAvatarDisplayUrl === 'function' ? portalTopbarAvatarDisplayUrl(st) : PORTAL_DEFAULT_TOPBAR_AVATAR_URL;
      if(av && avImg && targetSrc){
        let same = false;
        try{
          const cur = avImg.getAttribute('src') || '';
          same = new URL(cur, window.location.href).href === new URL(targetSrc, window.location.href).href;
        }catch(_){
          same = (avImg.getAttribute('src') || '') === targetSrc;
        }
        if(!same) avImg.src = targetSrc;
        av.classList.toggle('avatar--brand-default', portalTopbarAvatarIsStaffBrandUrl(targetSrc));
      }
      try{
        if(typeof portalResyncPlannerToolsAfterIdentity === 'function') portalResyncPlannerToolsAfterIdentity();
      }catch(_){}
    }

    (function portalNextSessionHelpers(){
      function portalIsRealClientSession(s, sessionDateIsoForOpen){
        var status = (typeof sessionModelStatus === 'function') ? sessionModelStatus(s) : '';
        if(status === 'Available') return false;
        if(status === 'Closed'){
          var iso = String(sessionDateIsoForOpen || '').trim();
          if(iso && typeof portalSessionHasSlotOpenOverride === 'function' && portalSessionHasSlotOpenOverride(s, iso)) return true;
          return false;
        }
        var man = String(s && s.override || '').trim().toUpperCase();
        if(man === 'CLOSED'){
          var iso2 = String(sessionDateIsoForOpen || '').trim();
          if(iso2 && typeof portalSessionHasSlotOpenOverride === 'function' && portalSessionHasSlotOpenOverride(s, iso2)) return true;
          return false;
        }
        var cid = String((s && s.clientId) || '').trim();
        if(!cid) return false;
        return true;
      }
      function portalParseTimeSortVal(start){
        var parts = String(start || '00:00').split(':');
        return Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
      }
      function portalFormatRange(start, end){
        function part(t){
          var p = String(t || '').split(':');
          var h = Number(p[0] || 0), m = Number(p[1] || 0);
          h = h % 12; if(h === 0) h = 12;
          if(m === 0) return String(h);
          if(m === 30) return h + '.30';
          return h + '.' + String(m).padStart(2, '0');
        }
        return part(start) + ' to ' + part(end);
      }
      function portalNextSessionCandidateRows(staffId, weekdayName, isoYmd){
        var id = String(staffId || '').trim().toLowerCase();
        var iso = String(isoYmd || '').trim().slice(0, 10);
        var wname = String(weekdayName || '').trim();
        if(!id || !iso || !wname) return [];
        var isReal = function(s){
          return portalIsRealClientSession(s, iso);
        };
        var rows = typeof portalBaseClientSessionsForCalendarDate === 'function'
          ? portalBaseClientSessionsForCalendarDate(wname, iso, id, isReal)
          : [];
        if(typeof portalStaffDashboardOmitSpreadsheetSession !== 'function') return rows;
        return rows.filter(function(s){
          return !portalStaffDashboardOmitSpreadsheetSession(s, wname);
        });
      }
      function portalFindNextSessionCalendarInfo(staffId, fromNow, model){
        var id = String(staffId || '').trim().toLowerCase();
        var start = new Date(fromNow.getFullYear(), fromNow.getMonth(), fromNow.getDate());
        var viewFrom = '';
        var viewTo = '';
        try{
          viewFrom = String(
            (typeof dashboardData !== 'undefined' && dashboardData.termDashboardCalendarFrom)
              || (window.PortalTermCalendarDashboard && PortalTermCalendarDashboard.fromIso && PortalTermCalendarDashboard.fromIso())
              || (typeof portalTermSummerRosterFromIso === 'function' ? portalTermSummerRosterFromIso() : '')
          ).trim().slice(0, 10);
          viewTo = String(
            (typeof dashboardData !== 'undefined' && dashboardData.termDashboardCalendarTo)
              || (window.PortalTermCalendarDashboard && PortalTermCalendarDashboard.toIso && PortalTermCalendarDashboard.toIso())
              || '2026-07-17'
          ).trim().slice(0, 10);
        }catch(_){}
        // Scan forward to the genuine next working day, not just tomorrow: a worker
        // whose tomorrow is off (or whose tomorrow was fully reassigned to a cover)
        // should see the participants of their actual next session (e.g. Tuesday).
        for(var i = 1; i <= 30; i++){
          var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          var wname = d.toLocaleDateString('en-GB', { weekday: 'long' });
          var iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(d) : '';
          if(viewFrom && iso && iso < viewFrom) continue;
          if(viewTo && iso && iso > viewTo) break;
          if(iso && typeof portalTermDayIsOffForStaffOnIso === 'function' && portalTermDayIsOffForStaffOnIso(iso, id)) continue;
          if(portalNextSessionCandidateRows(id, wname, iso).length) return { date: d, weekdayName: wname };
          try{
            var builtRows = typeof portalBuildTodayRowsForIso === 'function' ? portalBuildTodayRowsForIso(iso) : [];
            if(builtRows.length) return { date: d, weekdayName: wname };
          }catch(_built){}
        }
        return null;
      }
      function portalBuildNextSessionRows(staffId, fromNow, model, notes){
        var info = portalFindNextSessionCalendarInfo(staffId, fromNow, model);
        if(!info) return [];
        var w = info.weekdayName;
        var id = String(staffId || '').trim().toLowerCase();
        var sessionDateIso = info && info.date && typeof portalIsoYmdFromDate === 'function'
          ? portalIsoYmdFromDate(info.date)
          : '';
        var nextSessionsAfterFilter = portalNextSessionCandidateRows(id, w, sessionDateIso);
        var nextSessionRows = nextSessionsAfterFilter
          .sort(function(a, b){ return portalParseTimeSortVal(a.start) - portalParseTimeSortVal(b.start); })
          .map(function(s){
            var sessionDateIso = info && info.date && typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(info.date) : '';
            var baseForOv = s.__portalBaseSession || s;
            var ov = (s && s.__portalScheduleOverride)
              || (sessionDateIso && typeof portalTodayScheduleOverrideForSession === 'function'
                ? portalTodayScheduleOverrideForSession(baseForOv, sessionDateIso)
                : null);
            var effClientId = String(s.clientId || '').trim().toLowerCase();
            var nameFromReplace = '';
            if(ov && ov.override_type === 'client_replace_in_slot' && ov.payload){
              var rep = portalOverrideReplacementClientId(ov.payload);
              if(rep){
                effClientId = rep;
                nameFromReplace = portalOverrideReplacementClientName(ov.payload);
              }
            }
            var c = (notes || {})[effClientId] || (nameFromReplace ? { name: nameFromReplace, avatarFile: '' } : {});
            var slotRaw = String(s.timeSlotLabel || '').trim();
            var slot = typeof stripMeridiemFromSlotLabel === 'function' ? stripMeridiemFromSlotLabel(slotRaw) : slotRaw;
            var activity = String(s.activity || s.rosterService || 'Swimming').trim();
            var rosterAreaRaw = String(s.rosterArea != null ? s.rosterArea : '').trim();
            var areaNote = rosterAreaLabelForSession(s, activity, portalStaffIsSupportWorkerForAreaNotes()) || '';
            if(/day\s*centre/i.test(activity) && rosterAreaRaw && rosterAreaRaw.toLowerCase() !== 'day centre'){
              areaNote = rosterAreaRaw + ' / Day Centre';
            } else if(areaNote && activity && areaNote.toLowerCase() !== activity.toLowerCase() && areaNote.indexOf(' / ') < 0){
              areaNote = areaNote + ' / ' + activity;
            }
            var manualOv = String(s && s.override || '').trim().toUpperCase();
            var hasAdminAbsence = !!(ov && ov.override_type === 'client_absence_announced');
            var hasAdminCancelled = !!(ov && ov.override_type === 'slot_clear_client' && ov.payload && ov.payload.cancelled_by_admin);
            if(hasAdminCancelled && sessionDateIso && typeof portalStaffHasRequestedTimeOffOnDate === 'function'
              && portalStaffHasRequestedTimeOffOnDate(sessionDateIso, id)){
              hasAdminCancelled = false;
            }
            var hasReplaceRow = !!(ov && ov.override_type === 'client_replace_in_slot') || manualOv === 'REPLACED';
            var futureOverrideLabel = '';
            var futureOverrideTone = '';
            if(hasAdminAbsence){
              futureOverrideTone = 'absent-green';
              futureOverrideLabel = '';
            } else if(hasAdminCancelled){
              futureOverrideTone = 'cancelled-green';
              futureOverrideLabel = '';
            } else if(hasReplaceRow && info && info.date){
              var d0 = info.date;
              var sessionEndTs = typeof buildSessionEndMsForCalendarDate === 'function'
                ? buildSessionEndMsForCalendarDate(d0.getFullYear(), d0.getMonth(), d0.getDate(), s.end)
                : null;
              var sk = (sessionDateIso && typeof portalSessionReviewKeyForModelRow === 'function')
                ? portalSessionReviewKeyForModelRow(s, w, sessionDateIso)
                : (sessionDateIso ? sessionDateIso + '|' + String(s.start || '') + '|' + effClientId : '');
              var fbItem = { sessionEndTs: sessionEndTs, sessionKey: sk, __portalBaseSession: s, dayCentre: portalRosterSessionIsDayCentre(s) };
              var rec = (typeof getSessionReviewRecord === 'function' ? getSessionReviewRecord(fbItem) : null) || {};
              if(typeof isSessionEndedForFeedback === 'function' && !isSessionEndedForFeedback(fbItem)){
                if(ov && portalOverrideIsTrial(ov)){
                  futureOverrideTone = 'trial';
                  futureOverrideLabel = 'Trial';
                } else {
                  futureOverrideTone = 'pink';
                  futureOverrideLabel = 'Make Up';
                }
              } else if(typeof isSessionEndedForFeedback === 'function' && isSessionEndedForFeedback(fbItem)){
                if(!rec.feedbackDone && !rec.absent && !rec.cancelled){
                  futureOverrideTone = 'pending-feedback';
                } else if(rec.feedbackDone || rec.absent){
                  futureOverrideTone = 'done';
                }
              }
            } else {
              var ovMeta = null;
              try{
                if(info && info.date && typeof portalIsoYmdFromDate === 'function' && typeof portalFutureOverrideMetaForDate === 'function'){
                  ovMeta = portalFutureOverrideMetaForDate(portalIsoYmdFromDate(info.date), id);
                  if(ovMeta && ovMeta.priority < 2) ovMeta = null;
                }
              }catch(_){}
              if(ovMeta && String(ovMeta.type || '') === 'client_absence_announced' && !hasAdminAbsence){
                ovMeta = null;
              }
              if(ovMeta && String(ovMeta.type || '') === 'slot_clear_client_cancelled' && !hasAdminCancelled){
                ovMeta = null;
              }
              if(ovMeta && String(ovMeta.type || '') === 'client_replace_in_slot' && !hasReplaceRow){
                ovMeta = null;
              }
              if(ovMeta){
                futureOverrideLabel = String(ovMeta.label || '').trim();
                futureOverrideTone = String(ovMeta.tone || '').trim();
              }
            }
            var displayName = c.name || nameFromReplace || (s.status === 'closed' ? 'Closed' : 'NO PARTICIPANT');
            var photoUrl = typeof resolveParticipantPhotoUrl === 'function'
              ? resolveParticipantPhotoUrl(displayName, effClientId)
              : '';
            if(!photoUrl && c.avatarFile) photoUrl = String(c.avatarFile).trim();
            if(!photoUrl) photoUrl = clientPhotoUrl(displayName) || '';
            return {
              time: slot || portalFormatRange(s.start, s.end),
              timeSlotLabel: slot,
              start: s.start,
              clientId: effClientId,
              name: displayName,
              venue: s.venue || '—',
              avatarFile: photoUrl,
              areaNote: String(areaNote).trim(),
              activity: activity,
              futureOverrideLabel: futureOverrideLabel,
              futureOverrideTone: futureOverrideTone
            };
          });
        return typeof portalDedupeParticipantListEntries === 'function'
          ? portalDedupeParticipantListEntries(nextSessionRows)
          : nextSessionRows;
      }
      window.__portalSyncNextSessionFromModel = function(){
        var id = portalAuthStaffRosterId();
        var info = portalFindNextSessionCalendarInfo(id, new Date(), sessionsModel);
        dashboardData.nextSessionCalendarDate = info ? info.date : null;
        dashboardData.tomorrow = portalBuildNextSessionRows(id, new Date(), sessionsModel, clientNotesById);
      };
      window.__portalIsRealClientSession = portalIsRealClientSession;
      window.portalFindNextSessionCalendarInfo = portalFindNextSessionCalendarInfo;
    })();

    /** Usernames that see sample term colours / demo TERM state (`demo` only; everyone else uses rota + timetable). */
    window.PORTAL_TERM_UI_DEMO_USERNAMES = ['teflon'];
    const PORTAL_TERM_DEMO_FEEDBACK_BY_DATE = {
      '2026-05-05': 'complete',
      '2026-05-07': 'late',
      '2026-05-12': 'complete',
      '2026-05-15': 'late',
      '2026-06-02': 'complete',
      '2026-06-05': 'late'
    };
    function portalWorkedWeekdaysFromSessions(model, staffKey){
      const id = String(staffKey || '').trim().toLowerCase();
      const map = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      const seen = new Set();
      (model || []).forEach(function (s) {
        if(String(s.staffId || '').toLowerCase() !== id) return;
        const d = String(s.day || '').trim();
        if(Object.prototype.hasOwnProperty.call(map, d)) seen.add(map[d]);
      });
      return Array.from(seen).sort(function (a, b) { return a - b; });
    }
    window.portalApplyTermCalendarForStaff = function(staffId){
      const id = String(staffId || '').trim().toLowerCase();
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const ptd = window.PortalTermCalendarDashboard;
      if(ptd && typeof ptd.applyView === 'function'){
        ptd.applyView(dashboardData);
      } else if(t && typeof t === 'object'){
        if(t.termName) dashboardData.termName = t.termName;
        dashboardData.termCalendarYear = 2026;
        dashboardData.termCalendarMonths = [5, 6];
        dashboardData.termCalendarFirstDom = {};
        dashboardData.termDashboardCalendarFrom = '2026-06-01';
        dashboardData.termDashboardCalendarTo = '2026-07-17';
        dashboardData.termHalfTermWeekStarts = [];
      } else {
        dashboardData.termName = 'Summer Term 2026';
        dashboardData.termCalendarYear = 2026;
        dashboardData.termCalendarMonths = [5, 6];
        dashboardData.termCalendarFirstDom = {};
        dashboardData.termDashboardCalendarFrom = '2026-06-01';
        dashboardData.termDashboardCalendarTo = '2026-07-17';
        dashboardData.termHalfTermWeekStarts = [];
      }
      const demoList = window.PORTAL_TERM_UI_DEMO_USERNAMES || [];
      const demo = Array.isArray(demoList) && demoList.indexOf(id) !== -1;
      window.__PORTAL_TERM_DEMO_VISUALS__ = demo;
      if(demo){
        // Demo only: follow Youssef's roster weekdays so every orange day has real sessions to open.
        let demoWorked = portalWorkedWeekdaysFromSessions(typeof sessionsModel !== 'undefined' ? sessionsModel : [], id);
        if(!demoWorked.length) demoWorked = [1, 2, 3, 4, 5];
        dashboardData.termWorkedWeekdays = demoWorked;
        dashboardData.termHalfTermWeekStarts = [];
        dashboardData.termFeedbackByDate = Object.assign({}, PORTAL_TERM_DEMO_FEEDBACK_BY_DATE);
        // Pretend "now" is 8 Jun 2026 so May worked days are in the past → orange (review needed).
        dashboardData.termDemoNow = '2026-06-08T20:00:00';
        // Show the calendar from early May so there are several past review-needed (orange) days to test.
        dashboardData.termCalendarMonths = [4, 5];
        dashboardData.termDashboardCalendarFrom = '2026-05-04';
        dashboardData.termDashboardCalendarTo = '2026-06-30';
        // Recompute the orange/late map over the May→June range now that it is set.
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function'){
          try{ rebuildTermShiftAndFeedbackFromSessionModel(); }catch(_e){}
        }
      } else {
        let worked = [];
        if(ptd && typeof ptd.workedWeekdaysForStaff === 'function'){
          worked = ptd.workedWeekdaysForStaff(id);
        }
        if(!worked.length && t && typeof t === 'object'){
          const dashMap = t.termStaffWeekdayIndicesDashboardByProfileKey;
          const baseMap = t.termStaffWeekdayIndicesByProfileKey;
          if(dashMap && Array.isArray(dashMap[id]) && dashMap[id].length){
            worked = dashMap[id].slice();
          } else if(baseMap && Array.isArray(baseMap[id]) && baseMap[id].length){
            worked = baseMap[id].slice();
          }
        }
        if(!worked.length){
          worked = portalWorkedWeekdaysFromSessions(typeof sessionsModel !== 'undefined' ? sessionsModel : [], id);
        }
        dashboardData.termWorkedWeekdays = worked.sort(function(a, b){ return a - b; });
        dashboardData.termFeedbackByDate = {};
        dashboardData.termShiftEndByDate = {};
        dashboardData.termDemoNow = null;
      }
      const extraDates = (id === 'javier' || id === 'youssef') ? [] : portalTermStaffExtraCalendarDates(id);
      if(extraDates.length){
        const months = new Set((dashboardData.termCalendarMonths || []).map(Number));
        extraDates.forEach(function(iso){
          const m = parseInt(String(iso).slice(5, 7), 10) - 1;
          if(Number.isFinite(m) && m >= 0 && m <= 11) months.add(m);
        });
        dashboardData.termCalendarMonths = Array.from(months).sort(function(a, b){ return a - b; });
      }
    };
    if(STAFF_DASHBOARD_ID && typeof window.portalApplyTermCalendarForStaff === 'function'){
      window.portalApplyTermCalendarForStaff(STAFF_DASHBOARD_ID);
    }
    if(portalStaffDashIsEditorPreviewMode()){
      portalStaffMarkInitialTodayScheduleSettled();
    }

    /** Model sessions for the demo view day and staff (same source as Today). */
    function getSessionsModelRowsForViewDay(){
      const viewDay = String(DEMO_VIEW_DAY).trim();
      const staffId = String(STAFF_DASHBOARD_ID).trim().toLowerCase();
      return sessionsModel.filter(s =>
        String(s.staffId).toLowerCase() === staffId &&
        String(s.day).trim() === viewDay
      );
    }

    function sessionCountsByVenueForViewDay(){
      const map = {};
      getSessionsModelRowsForViewDay().forEach(s => {
        const v = String(s.venue || '—').trim();
        map[v] = (map[v] || 0) + 1;
      });
      return map;
    }

    function portalParseHmToMinutes(hm){
      const s = String(hm || '').trim();
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      if(!m) return null;
      const h = Number(m[1]);
      const mi = Number(m[2]);
      if(!Number.isFinite(h) || !Number.isFinite(mi)) return null;
      if(h < 0 || h > 23 || mi < 0 || mi > 59) return null;
      return h * 60 + mi;
    }

    function venueForVenueQuickMenuByTime(){
      try{
        const rows = getSessionsModelRowsForViewDay()
          .map(function(s){
            const venue = String((s && (s.venue || s.rosterArea || s.area)) || '').trim();
            const startM = portalParseHmToMinutes(s && s.start);
            const endM = portalParseHmToMinutes(s && s.end);
            return { venue, startM, endM };
          })
          .filter(function(r){
            return !!r.venue && r.startM != null;
          })
          .sort(function(a, b){ return a.startM - b.startM; });
        if(!rows.length) return '';

        const now = new Date();
        const nowM = now.getHours() * 60 + now.getMinutes();

        // 1) A session currently in progress wins outright.
        for(let i = 0; i < rows.length; i++){
          const r = rows[i];
          const endM = r.endM != null ? r.endM : (r.startM + 60);
          if(nowM >= r.startM && nowM <= endM) return r.venue;
        }

        // 2) Otherwise pick the session closest in time to "now" so the venue
        //    always matches where the worker actually is/just was/heads next.
        let best = null;
        let bestDist = Infinity;
        for(let i = 0; i < rows.length; i++){
          const r = rows[i];
          const endM = r.endM != null ? r.endM : (r.startM + 60);
          const dist = nowM < r.startM ? (r.startM - nowM) : (nowM - endM);
          if(dist < bestDist){
            bestDist = dist;
            best = r;
          }
        }
        return (best && best.venue) || rows[0].venue || '';
      }catch(_){
        return '';
      }
    }

    /** Venue names only (no counts); split day → "Acton · Westway". */
    function formatTodayVenueOnlyLabel(){
      const timedVenue = venueForVenueQuickMenuByTime();
      if(timedVenue) return timedVenue;
      if(dashboardData.splitDay){
        const m = String((dashboardData.morning && dashboardData.morning.venue) || '').trim();
        const a = String((dashboardData.afternoon && dashboardData.afternoon.venue) || '').trim();
        const labels = [];
        const seen = new Set();
        [m, a].forEach(ven => {
          if(!ven || seen.has(ven)) return;
          seen.add(ven);
          labels.push(ven);
        });
        return labels.length ? labels.join(' · ') : '—';
      }
      return String(dashboardData.venue || '—').trim();
    }

    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    const SETUP_ROLE_CLASSES = ['setup-row--role-swimming','setup-row--role-climbing','setup-row--role-support','setup-row--role-lead'];
    const QUICK_MENU_ROLE_TRAINING_CLASSES = ['menu-btn--training-role-swimming','menu-btn--training-role-climbing','menu-btn--training-role-support','menu-btn--training-role-lead'];
    function applySetupRoleTrainingRow(){
      const link = document.getElementById('setupRoleTrainingLink');
      const qRole = document.getElementById('quickMenuRoleTraining');
      const raw = String(dashboardData.staffRoleTrack || 'swimming').toLowerCase().replace(/[\s_-]+/g,'');
      let cls = 'setup-row--role-swimming';
      if(raw === 'climbing') cls = 'setup-row--role-climbing';
      else if(raw === 'support' || raw === 'supportlead' || raw === 'supportstaff' || raw === 'admin') cls = 'setup-row--role-support';
      else if(raw === 'lead' || raw === 'manager') cls = 'setup-row--role-lead';
      else if(raw === 'fitness') cls = 'setup-row--role-swimming';
      else if(raw === 'swimming') cls = 'setup-row--role-swimming';
      if(link){
        SETUP_ROLE_CLASSES.forEach(c => link.classList.remove(c));
        link.classList.add(cls);
      }
      if(qRole && !qRole.classList.contains('menu-btn--portal-pending')){
        QUICK_MENU_ROLE_TRAINING_CLASSES.forEach(c => qRole.classList.remove(c));
        const suffix = cls.replace(/^setup-row--/,'');
        qRole.classList.add('menu-btn--training-' + suffix);
      }
    }

    /** Scale topbar display name to fit profile card / name band. */
    function portalFitTopbarName(){
      const h1 = document.getElementById('staffName');
      const givenEl = document.getElementById('staffNameGiven');
      const surEl = document.getElementById('staffNameSurname');
      if(!h1 || !givenEl) return;
      const inProfileCard = !!document.getElementById('topbarProfileCard');
      const minPx = inProfileCard ? 10 : 12;
      const maxPx = inProfileCard ? 15 : 17;
      h1.style.fontSize = '';
      givenEl.style.fontSize = '';
      const avail = Math.max(0, h1.clientWidth - 6);
      if(avail < 12) return;
      let chosen = minPx;
      for(let fs = maxPx; fs >= minPx; fs--){
        h1.style.fontSize = fs + 'px';
        let w = givenEl.scrollWidth;
        if(surEl && !surEl.hasAttribute('hidden') && String(surEl.textContent || '').trim()){
          w = Math.max(w, surEl.scrollWidth);
        }
        if(w <= avail){
          chosen = fs;
          break;
        }
      }
      h1.style.fontSize = chosen + 'px';
    }
    window.portalFitTopbarName = portalFitTopbarName;

    function portalEnsureTopbarNameFitListeners(){
      if(window.__portalTopbarNameFitInit) return;
      window.__portalTopbarNameFitInit = true;
      window.addEventListener('resize', function(){
        if(typeof portalFitTopbarName === 'function') portalFitTopbarName();
      });
      const lead = document.querySelector('.topbar-lead');
      if(lead && typeof ResizeObserver !== 'undefined'){
        try{
          new ResizeObserver(function(){
            if(typeof portalFitTopbarName === 'function') portalFitTopbarName();
          }).observe(lead);
        }catch(_){ /* ignore */ }
      }
    }
    window.portalEnsureTopbarNameFitListeners = portalEnsureTopbarNameFitListeners;
