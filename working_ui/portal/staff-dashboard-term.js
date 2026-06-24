    /**
     * Term rebuild uses one roster row + session key; the Today list and localStorage can differ slightly
     * in time string (9:00 vs 09:00) or client id (replace / base). Merge review flags from all plausible keys.
     */
    function portalGetMergedSessionReviewRecordForRoster(s, dayWord, sessionDateIso){
      const out = { feedbackDone: false, incident: false, absent: false, cancelled: false };
      if(!s || !sessionDateIso) return out;
      const staffIdEarly = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      const exemptEarly = typeof portalRosterSessionFeedbackResolvedFlags === 'function'
        ? portalRosterSessionFeedbackResolvedFlags(s, sessionDateIso, staffIdEarly)
        : null;
      if(exemptEarly){
        if(exemptEarly.absent){
          out.absent = true;
          out.feedbackDone = false;
        }else if(exemptEarly.cancelled){
          out.cancelled = true;
        }else if(exemptEarly.feedbackDone){
          const makeupPending = typeof portalOpenSlotMakeupOverrideForSession === 'function'
            && portalOpenSlotMakeupOverrideForSession(s, sessionDateIso);
          if(!makeupPending){
            out.feedbackDone = true;
          }
        }
        if(exemptEarly.incident) out.incident = true;
        if(out.absent || out.cancelled || out.feedbackDone) return out;
      }
      if(typeof portalTermStaffDayExplicitlyForceComplete === 'function'
        && portalTermStaffDayExplicitlyForceComplete(sessionDateIso, staffIdEarly)){
        out.feedbackDone = true;
        return out;
      }
      const add = function(rec){
        if(!rec) return;
        if(rec.feedbackDone) out.feedbackDone = true;
        if(rec.incident) out.incident = true;
        if(rec.absent) out.absent = true;
        if(rec.cancelled) out.cancelled = true;
      };
      const keySeen = Object.create(null);
      const tryKey = function(k){
        if(!k || keySeen[k]) return;
        keySeen[k] = true;
        add(getSessionReviewRecord({ sessionKey: k }) || null);
      };
      if(!portalStaffInGhostView()){
      if(typeof portalSessionReviewKeyForModelRow === 'function'){
        tryKey(portalSessionReviewKeyForModelRow(s, dayWord, sessionDateIso));
      }
      const activityMerge = String(s && (s.activity || s.rosterService || 'Swimming') || '').trim();
      const areaSuffix = typeof portalSessionFeedbackUnitSuffix === 'function'
        ? portalSessionFeedbackUnitSuffix(s, activityMerge, portalStaffIsSupportWorkerForAreaNotes())
        : '';
      const cid = typeof portalEffectiveClientIdForReview === 'function'
        ? portalEffectiveClientIdForReview(s, sessionDateIso)
        : String(s && s.clientId || '').trim().toLowerCase();
      const tCanon = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(s && s.start) : '';
      const tRaw = String(s && s.start != null ? s.start : '').trim();
      if(areaSuffix && cid && tCanon) tryKey(String(sessionDateIso) + '|' + tCanon + '|' + cid + areaSuffix);
      if(areaSuffix && cid && tRaw && tRaw !== tCanon) tryKey(String(sessionDateIso) + '|' + tRaw + '|' + cid + areaSuffix);
      if(cid && tCanon) tryKey(String(sessionDateIso) + '|' + tCanon + '|' + cid);
      if(cid && tRaw && tRaw !== tCanon) tryKey(String(sessionDateIso) + '|' + tRaw + '|' + cid);
      if(cid && typeof portalStaffLeadIsAquaticActivity === 'function' && portalStaffLeadIsAquaticActivity(activityMerge)){
        tryKey(String(sessionDateIso) + '|' + cid + '|aquatic');
        if(tCanon) tryKey(String(sessionDateIso) + '|' + cid + '|' + tCanon + '|aquatic');
      }
      if(cid && (typeof portalStaffLeadReviewKeyAllowsDateClientOnlyAlias !== 'function'
        || portalStaffLeadReviewKeyAllowsDateClientOnlyAlias(s, sessionDateIso, dayWord))){
        tryKey(String(sessionDateIso) + '||' + cid);
      }
      const scid0 = String(s && s.clientId || '').trim().toLowerCase();
      if(scid0 && scid0 !== cid){
        if(tCanon) tryKey(String(sessionDateIso) + '|' + tCanon + '|' + scid0);
        if(tRaw && tRaw !== tCanon) tryKey(String(sessionDateIso) + '|' + tRaw + '|' + scid0);
      }
      try{
        const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
        const note = notes[cid] || notes[scid0] || null;
        const nameSlug = typeof portalSlugifyClientKey === 'function'
          ? portalSlugifyClientKey(note && note.name ? note.name : '')
          : '';
        if(nameSlug && nameSlug !== cid && nameSlug !== scid0){
          if(tCanon) tryKey(String(sessionDateIso) + '|' + tCanon + '|' + nameSlug);
          if(tRaw && tRaw !== tCanon) tryKey(String(sessionDateIso) + '|' + tRaw + '|' + nameSlug);
        }
      }catch(_){}
      const baseB = s.__portalBaseSession;
      const scid = typeof portalNormKeyStr === 'function' ? portalNormKeyStr(s && s.clientId) : String(s && s.clientId || '').trim().toLowerCase();
      if(baseB){
        const bC = typeof portalNormKeyStr === 'function' ? portalNormKeyStr(baseB.clientId) : String(baseB.clientId || '').trim().toLowerCase();
        if(bC && bC !== scid){
          if(tCanon) tryKey(String(sessionDateIso) + '|' + tCanon + '|' + bC);
          if(tRaw && tRaw !== tCanon) tryKey(String(sessionDateIso) + '|' + tRaw + '|' + bC);
        }
      }
      if(!out.absent){
        const aliasProbe = { kind: 'client', sessionKey: '', __portalBaseSession: s, clientId: cid };
        if(typeof portalSessionReviewKeyForModelRow === 'function'){
          aliasProbe.sessionKey = portalSessionReviewKeyForModelRow(s, dayWord, sessionDateIso);
        }
        const aliasList = typeof portalCollectItemSessionReviewKeyAliases === 'function'
          ? portalCollectItemSessionReviewKeyAliases(aliasProbe, sessionDateIso, dayWord)
          : [];
        if(portalReviewAbsentFromServerQuickMarkKeys(aliasList)) out.absent = true;
        else if(portalReviewAbsentInMemoryForAliases(aliasList)) out.absent = true;
      }
      }
      if(!out.absent && portalStaffInGhostView()){
        const ghostCid = typeof portalEffectiveClientIdForReview === 'function'
          ? portalEffectiveClientIdForReview(s, sessionDateIso)
          : String(s && s.clientId || '').trim().toLowerCase();
        const aliasProbeGhost = { kind: 'client', sessionKey: '', __portalBaseSession: s, clientId: ghostCid };
        if(typeof portalSessionReviewKeyForModelRow === 'function'){
          aliasProbeGhost.sessionKey = portalSessionReviewKeyForModelRow(s, dayWord, sessionDateIso);
        }
        const aliasListGhost = typeof portalCollectItemSessionReviewKeyAliases === 'function'
          ? portalCollectItemSessionReviewKeyAliases(aliasProbeGhost, sessionDateIso, dayWord)
          : [];
        if(portalReviewAbsentFromServerQuickMarkKeys(aliasListGhost)) out.absent = true;
        else if(portalReviewAbsentInMemoryForAliases(aliasListGhost)) out.absent = true;
      }
      if(!out.absent && !out.cancelled && !out.feedbackDone){
        const dayWordFlags = dayWord;
        const pseudoItem = {
          kind: 'client',
          sessionKey: typeof portalSessionReviewKeyForModelRow === 'function'
            ? portalSessionReviewKeyForModelRow(s, dayWordFlags, sessionDateIso)
            : '',
          __portalBaseSession: s,
          clientId: typeof portalEffectiveClientIdForReview === 'function'
            ? portalEffectiveClientIdForReview(s, sessionDateIso)
            : String(s && s.clientId || '').trim().toLowerCase()
        };
        if(portalReviewAbsentResolvedForItem(pseudoItem, sessionDateIso)){
          out.absent = true;
          out.feedbackDone = false;
        }
      }
      const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      const fromBundle = (!portalTermIsCatchUpFeedbackDate(sessionDateIso, staffId)
        && typeof portalRosterReviewStateFromStatusBundle === 'function')
        ? portalRosterReviewStateFromStatusBundle(s, sessionDateIso, staffId)
        : null;
      if(fromBundle){
        if(fromBundle.absent){
          out.absent = true;
          out.feedbackDone = false;
        }else if(fromBundle.cancelled){
          out.cancelled = true;
        }else if(fromBundle.feedbackDone){
          out.feedbackDone = true;
        }
        /* Stale status export rows must not wipe Supabase/local review memory. */
        if(fromBundle.incident) out.incident = true;
      }
      if(!out.feedbackDone && !out.absent && !out.cancelled){
        const serverTruthDay = portalIsServerTruthFeedbackDay(sessionDateIso);
        const serverSyncedMerge = !!(dashboardData && dashboardData.portalFeedbackServerSynced);
        if(!(serverTruthDay && serverSyncedMerge)){
        const bridgeMerge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
        const notesMerge = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
        if(bridgeMerge && typeof bridgeMerge.sessionComplete === 'function'
          && bridgeMerge.sessionComplete(sessionDateIso, staffId, s, notesMerge, out)){
          const flags = typeof portalReviewFlagsForResolvedSession === 'function'
            ? portalReviewFlagsForResolvedSession(sessionDateIso, staffId, s)
            : null;
          if(flags){
            if(flags.absent) out.absent = true;
            else if(flags.feedbackDone) out.feedbackDone = true;
          }else{
            out.feedbackDone = true;
          }
        }
        }
      }
      if(!out.feedbackDone && !out.absent && !out.cancelled){
        const pseudoResolved = {
          kind: 'client',
          sessionKey: typeof portalSessionReviewKeyForModelRow === 'function'
            ? portalSessionReviewKeyForModelRow(s, dayWord, sessionDateIso)
            : '',
          __portalBaseSession: s,
          clientId: typeof portalEffectiveClientIdForReview === 'function'
            ? portalEffectiveClientIdForReview(s, sessionDateIso)
            : String(s && s.clientId || '').trim().toLowerCase()
        };
        if(typeof portalReviewFeedbackResolvedForItem === 'function'
          && portalReviewFeedbackResolvedForItem(pseudoResolved, sessionDateIso)){
          out.feedbackDone = true;
        }
      }
      return out;
    }
    /**
     * Single source of truth for staff feedback UI: Today list for a calendar day (buildSelectedDayViewFromLauraModel).
     * Each instructor only sees their own shifts; Giuseppe's 12:30 slot never resolves Javier's 1:15 slot.
     */
    function portalTodayListItemsForCalendarDay(isoYmd, dayWord, opts){
      opts = opts || {};
      const iso = String(isoYmd || '').trim();
      const dw = String(dayWord || '').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dw)) return [];
      if(!opts.allowDuringRebuild && typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__) return [];
      if(typeof buildSelectedDayViewFromLauraModel !== 'function') return [];
      const prevDateLock = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '');
      const prevDayLock = String(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DAY_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DAY_URL_LOCK) || '');
      const prevDemo = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '');
      try{
        portalSetReviewDateUrlLock(iso);
        if(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined') __PORTAL_REVIEW_DAY_URL_LOCK = dw;
        try{ if(typeof window !== 'undefined') window.__PORTAL_REVIEW_DAY_URL_LOCK = dw; }catch(_){ }
        DEMO_VIEW_DAY = dw;
        try{ if(typeof window !== 'undefined') window.DEMO_VIEW_DAY = dw; }catch(_){ }
        return buildSelectedDayViewFromLauraModel() || [];
      } finally {
        if(/^\d{4}-\d{2}-\d{2}$/.test(prevDateLock)) portalSetReviewDateUrlLock(prevDateLock);
        else if(typeof portalClearReviewDateUrlLock === 'function') portalClearReviewDateUrlLock();
        try{
          if(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined') __PORTAL_REVIEW_DAY_URL_LOCK = prevDayLock;
          if(typeof window !== 'undefined') window.__PORTAL_REVIEW_DAY_URL_LOCK = prevDayLock;
        }catch(_){ }
        try{
          DEMO_VIEW_DAY = prevDemo;
          if(typeof window !== 'undefined') window.DEMO_VIEW_DAY = prevDemo;
        }catch(_){ }
      }
    }
    /**
     * Pending feedback count for a calendar day — same rules as the Today/Week session cards.
     */
    function portalCountPendingSessionReviewsForCalendarDay(isoYmd, dayWord, opts){
      opts = opts || {};
      try{
        if(typeof portalStaffFeedbackPipelineReady === 'function' && !portalStaffFeedbackPipelineReady()) return 0;
        if(!opts.allowDuringRebuild && typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__) return 0;
        if(typeof isSessionEndedForFeedback !== 'function') return 0;
        const list = portalTodayListItemsForCalendarDay(isoYmd, dayWord, opts);
        let pending = 0;
        for(let i = 0; i < list.length; i++){
          const item = list[i];
          if(!item || !item.sessionKey) continue;
          if(item.kind === 'closed' || item.kind === 'available') continue;
          if(item.noSessionFeedbackRequired) continue;
          const started = typeof isSessionStartedForItem === 'function' && isSessionStartedForItem(item);
          if(!started && !isSessionEndedForFeedback(item)) continue;
          const r = typeof getEffectiveSessionReviewRecord === 'function'
            ? (getEffectiveSessionReviewRecord(item) || {})
            : (getSessionReviewRecord(item) || {});
          if(r.feedbackDone || r.absent || r.cancelled) continue;
          pending++;
        }
        return pending;
      }catch(e){
        return 0;
      }
    }
    /** Authoritative pending check for term calendar vs Today list (must agree before a day goes green). */
    function portalTermCalendarDayStillHasPendingFeedback(isoYmd, dayWord){
      try{
        if(typeof portalCountPendingSessionReviewsForCalendarDay !== 'function') return false;
        return portalCountPendingSessionReviewsForCalendarDay(isoYmd, dayWord) > 0;
      }catch(_){
        return false;
      }
    }
    /**
     * Term calendar cell colour for one day — derived only from the Today list (never from export aggregates alone).
     */
    function portalTermFeedbackStateFromTodayList(isoKey, dayWord, opts){
      opts = opts || {};
      const key = String(isoKey || '').trim().slice(0, 10);
      const dw = String(dayWord || '').trim();
      const staffId = String(opts.staffId != null ? opts.staffId : (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '')).trim().toLowerCase();
      const maxEndMs = opts.maxEndMs;
      const relFb = Array.isArray(opts.relFb) ? opts.relFb : [];
      const relAll = Array.isArray(opts.relAll) ? opts.relAll : relFb;
      const cur = opts.cur;
      const todayKey = opts.todayKey || portalTermLocalYmdFromMs(termCalendarNowMs());
      const catchUpDay = !!opts.catchUpDay;
      const allowRebuild = !!(typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__);

      if(key > todayKey) return 'future';
      if(typeof portalTermDateForcedComplete === 'function' && portalTermDateForcedComplete(key, staffId)) return 'complete';

      if(relFb.length && cur){
        let allCancelled = true;
        let anyApplicable = false;
        for(let i = 0; i < relFb.length; i++){
          const s = relFb[i];
          if(typeof portalRosterSessionFeedbackExempt === 'function'
            && portalRosterSessionFeedbackExempt(s, key, staffId)) continue;
          anyApplicable = true;
          const item = typeof portalMinimalReviewItemFromRosterRow === 'function'
            ? portalMinimalReviewItemFromRosterRow(s, dw, key, cur)
            : null;
          if(!item || !item.sessionKey) continue;
          const r = typeof getEffectiveSessionReviewRecord === 'function'
            ? (getEffectiveSessionReviewRecord(item) || {})
            : {};
          if(!r.cancelled){ allCancelled = false; break; }
        }
        if(anyApplicable && allCancelled) return 'cancelled';
      }

      if(key === todayKey && relFb.length && cur){
        let minStart = Infinity;
        relFb.forEach(function(s){
          if(typeof portalRosterSessionFeedbackExempt === 'function'
            && portalRosterSessionFeedbackExempt(s, key, staffId)) return;
          const sm = buildSessionStartMsForCalendarDate(cur.getFullYear(), cur.getMonth(), cur.getDate(), s.start);
          if(Number.isFinite(sm) && sm < minStart) minStart = sm;
        });
        if(minStart !== Infinity && termCalendarNowMs() < minStart) return 'pending';
      }

      const pending = (typeof portalCountPendingSessionReviewsForCalendarDay === 'function'
        && PORTAL_WEEK_REVIEW_VALID_DAYS.has(dw))
        ? portalCountPendingSessionReviewsForCalendarDay(key, dw, allowRebuild ? { allowDuringRebuild: true } : undefined)
        : 0;

      const stillRunning = typeof portalTermCalendarDayHasNotEndedClientSession === 'function'
        && portalTermCalendarDayHasNotEndedClientSession(key, dw, staffId, relFb.length ? relFb : relAll, cur);

      if(pending > 0){
        if(key <= todayKey || catchUpDay) return 'late';
        return 'pending';
      }
      if(stillRunning) return 'pending';

      if(typeof portalTermFeedbackAssumeComplete === 'function' && portalTermFeedbackAssumeComplete(key, staffId)) return 'complete';
      if(typeof portalTermTodayListClientFeedbackAllResolved === 'function'
        && portalTermTodayListClientFeedbackAllResolved(key, dw, allowRebuild ? { allowDuringRebuild: true } : undefined)){
        return 'complete';
      }
      const relPick = relFb.length ? relFb : relAll;
      if(Array.isArray(relPick) && relPick.length
        && typeof portalTermRosterHasRealClientSessions === 'function'
        && portalTermRosterHasRealClientSessions(relPick, key)){
        if(key <= todayKey || catchUpDay) return 'late';
        return 'pending';
      }
      if(Array.isArray(relPick) && relPick.length) return 'complete';
      return 'pending';
    }
    /** Minimal Today-list item for one roster row (fallback when full list not built). */
    function portalMinimalReviewItemFromRosterRow(s, dayWord, isoKey, curDate){
      if(!s || !isoKey) return null;
      const cur = curDate && !isNaN(curDate.getTime()) ? curDate : new Date(String(isoKey).slice(0, 10) + 'T12:00:00');
      const y = cur.getFullYear();
      const mo = cur.getMonth();
      const da = cur.getDate();
      const sessionStartTs = buildSessionStartMsForCalendarDate(y, mo, da, s.start);
      const sessionEndTs = buildSessionEndMsForCalendarDate(y, mo, da, s.end);
      const effClientId = typeof portalEffectiveClientIdForReview === 'function'
        ? portalEffectiveClientIdForReview(s, isoKey)
        : String(s.clientId || '').trim().toLowerCase();
      const dw = String(dayWord || '').trim() || cur.toLocaleDateString('en-GB', { weekday: 'long' });
      const sessionKey = typeof portalBuildSessionReviewKey === 'function'
        ? portalBuildSessionReviewKey(isoKey, s, dw, effClientId)
        : `${isoKey}|${s.start}|${effClientId}`;
      const st = typeof sessionModelStatus === 'function' ? sessionModelStatus(s) : '';
      const adminAbsentOv = typeof portalScheduleOverrideForSessionByType === 'function'
        ? portalScheduleOverrideForSessionByType(s, isoKey, 'client_absence_announced')
        : null;
      const replaceOvSameSlot = typeof portalScheduleOverrideForSessionByType === 'function'
        ? portalScheduleOverrideForSessionByType(s, isoKey, 'client_replace_in_slot')
        : null;
      const item = {
        kind: 'client',
        sessionKey: sessionKey,
        sessionStartTs: sessionStartTs,
        sessionEndTs: sessionEndTs,
        __portalBaseSession: s,
        clientId: effClientId,
        noSessionFeedbackRequired: false
      };
      if(st === 'Absent' || (adminAbsentOv && !replaceOvSameSlot)){
        item.noSessionFeedbackRequired = true;
        item.portalOverrideAlertPill = 'ABSENT';
        item.portalOverrideSuppressReviewOrange = true;
        item.__portalScheduleOverride = adminAbsentOv || null;
      }
      return item;
    }
    /** Ended-session pending for a day — delegates to Today list (single source of truth). */
    function portalRosterEndedFeedbackPendingCount(isoKey, dayWord, staffId, sessions, curDate){
      const key = String(isoKey || '').trim().slice(0, 10);
      const dw = String(dayWord || '').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(key) || !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dw)) return 0;
      const allowRebuild = !!(typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__);
      return typeof portalCountPendingSessionReviewsForCalendarDay === 'function'
        ? portalCountPendingSessionReviewsForCalendarDay(key, dw, allowRebuild ? { allowDuringRebuild: true } : undefined)
        : 0;
    }
    /** Same rule as orange "review needed" rows: ended client sessions without register/feedback complete (see collectSessionReviewPendingStats). */
    function hasPendingReviews(){
      try{
        if(typeof collectSessionReviewPendingStats !== 'function') return false;
        return collectSessionReviewPendingStats().pending.length > 0;
      }catch(e){ return false; }
    }

    var __postFbLand = { flagged: false, reviewDay: '', appliedReviewDay: false };
    function portalCapturePostFeedbackLanding(){
      const out = { flagged: false, reviewDay: '', appliedReviewDay: false };
      try{
        const u = new URL(location.href.split('#')[0]);
        if(u.searchParams.get('portalPostFeedback') === '1'){
          out.flagged = true;
          const capDate = String(u.searchParams.get('portalReviewDate') || '').trim();
          const capParsed = portalParseIsoDateLocal(capDate);
          if(capParsed){
            const isoCap = `${capParsed.getFullYear()}-${String(capParsed.getMonth() + 1).padStart(2, '0')}-${String(capParsed.getDate()).padStart(2, '0')}`;
            portalSetReviewDateUrlLock(isoCap);
            out.reviewDay = capParsed.toLocaleDateString('en-GB', { weekday: 'long' });
            if(PORTAL_WEEK_REVIEW_VALID_DAYS.has(String(out.reviewDay).trim())){
              try{
                var _rdCap = String(out.reviewDay).trim();
                __PORTAL_REVIEW_DAY_URL_LOCK = _rdCap;
                window.__PORTAL_REVIEW_DAY_URL_LOCK = _rdCap;
              }catch(_){}
            }
          }else{
            out.reviewDay = String(u.searchParams.get('portalReviewDay') || '').trim();
            if(PORTAL_WEEK_REVIEW_VALID_DAYS.has(String(out.reviewDay).trim())){
              try{
                var _rdCap2 = String(out.reviewDay).trim();
                __PORTAL_REVIEW_DAY_URL_LOCK = _rdCap2;
                window.__PORTAL_REVIEW_DAY_URL_LOCK = _rdCap2;
              }catch(_){}
            }
          }
          u.searchParams.delete('portalPostFeedback');
          u.searchParams.delete('portalReviewDay');
          u.searchParams.delete('portalReviewDate');
          const qs = u.searchParams.toString();
          history.replaceState({}, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
          try{ sessionStorage.removeItem('__portal_feedback_staff_rota_key_v1'); }catch(_){}
          try{ sessionStorage.removeItem('__portal_feedback_land_v1'); }catch(_){}
          return out;
        }
      }catch(_){}
      try{
        const raw = sessionStorage.getItem('__portal_feedback_land_v1');
        if(raw){
          const o = JSON.parse(raw);
          const rd = String(o && o.reviewDay || '').trim();
          if(PORTAL_WEEK_REVIEW_VALID_DAYS.has(rd)){
            out.flagged = true;
            out.reviewDay = rd;
            portalClearReviewDateUrlLock();
            try{
              __PORTAL_REVIEW_DAY_URL_LOCK = rd;
              window.__PORTAL_REVIEW_DAY_URL_LOCK = rd;
            }catch(_){}
          }
          sessionStorage.removeItem('__portal_feedback_land_v1');
        }
      }catch(_){}
      return out;
    }
    function portalMaybeResetDemoViewDayAfterFeedbackPostLoad(){
      try{
        if(typeof window !== 'undefined' && window.__PORTAL_STICKY_REVIEW_DAY_LOAD__) return;
      }catch(_){}
      try{
        var _ul = String((typeof window !== 'undefined' && window.__PORTAL_REVIEW_DAY_URL_LOCK) ? window.__PORTAL_REVIEW_DAY_URL_LOCK : (typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DAY_URL_LOCK : '')).trim();
        if(_ul && PORTAL_WEEK_REVIEW_VALID_DAYS.has(_ul)) return;
      }catch(_){}
      if(!__postFbLand.appliedReviewDay) return;
      const stats = collectSessionReviewPendingStats();
      if(stats.pending.length > 0) return;
      __postFbLand.appliedReviewDay = false;
      __postFbLand.reviewDay = '';
      portalClearReviewDateUrlLock();
      __PORTAL_REVIEW_DAY_URL_LOCK = '';
      try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_){}
      try{ portalSyncReviewNavigationQueryToHistory(); }catch(_){}
      DEMO_VIEW_DAY = portalWeekdayLongEnGB(new Date());
      dashboardData.dateLabel = getDemoDateLabel(DEMO_VIEW_DAY);
      dashboardData.dateTopbar = getDemoDateTopbar(DEMO_VIEW_DAY);
      hydrateSessionReviewMapFromStorage();
      portalSyncTodaySectionDisplay();
      if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
      (function(){
        if(typeof portalRefreshNextSessionPreview === 'function' && STAFF_DASHBOARD_ID){
          portalRefreshNextSessionPreview(STAFF_DASHBOARD_ID);
        }
        if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
      })();
    }

    /**
     * After session_feedback submit: URL has portalAfterFeedback=1&portalReviewOrigin=…
     * Keeps user on This Week or Term when reviews remain; otherwise normal today dashboard.
     */
    function portalApplyAfterIncidentReturnFromUrl(){
      try{
        const u = new URL(location.href.split('#')[0]);
        if(u.searchParams.get('portalAfterIncident') !== '1') return false;
        const targetSessionKey = String(u.searchParams.get('sessionKey') || '').trim();
        u.searchParams.delete('portalAfterIncident');
        const qs = u.searchParams.toString();
        history.replaceState({}, '', u.pathname + (qs ? '?' + qs : '') + (location.hash || ''));
        if(targetSessionKey){
          const list = Array.isArray(dashboardData && dashboardData.today) ? dashboardData.today : [];
          const target = list.find(function(it){
            return it && String(it.sessionKey || '').trim() === targetSessionKey;
          });
          if(target && typeof openClient === 'function'){
            openClient(target);
            try{
              const esc = targetSessionKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              const el = document.querySelector('.session-card[data-session-key="' + esc + '"]');
              if(el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }catch(_){}
          }
        }
        return true;
      }catch(_){
        return false;
      }
    }
    try{ window.portalApplyAfterIncidentReturnFromUrl = portalApplyAfterIncidentReturnFromUrl; }catch(_){}

    function portalApplyAfterSessionFeedbackReturnFromUrl(){
      try{
        const u = new URL(location.href.split('#')[0]);
        if(u.searchParams.get('portalAfterFeedback') !== '1') return false;
        const originRaw = String(u.searchParams.get('portalReviewOrigin') || 'dashboard').trim();
        const origin = (originRaw === 'this_week' || originRaw === 'term') ? originRaw : 'dashboard';
        const reviewIso = String(u.searchParams.get('portalReviewDate') || '').trim();
        const reviewDayParam = String(u.searchParams.get('portalReviewDay') || '').trim();
        u.searchParams.delete('portalAfterFeedback');
        u.searchParams.delete('portalReviewOrigin');
        const qs = u.searchParams.toString();
        history.replaceState({}, '', u.pathname + (qs ? '?' + qs : '') + (location.hash || ''));
        if(typeof hydrateSessionReviewMapFromStorage === 'function') hydrateSessionReviewMapFromStorage();
        const termWithLocks = origin === 'term'
          && /^\d{4}-\d{2}-\d{2}$/.test(reviewIso)
          && PORTAL_WEEK_REVIEW_VALID_DAYS.has(reviewDayParam);
        if(termWithLocks){
          try{
            portalSetReviewDateUrlLock(reviewIso);
            __PORTAL_REVIEW_DAY_URL_LOCK = reviewDayParam;
            if(typeof window !== 'undefined') window.__PORTAL_REVIEW_DAY_URL_LOCK = reviewDayParam;
            if(typeof window !== 'undefined') window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = true;
            DEMO_VIEW_DAY = reviewDayParam;
            if(typeof window !== 'undefined') window.DEMO_VIEW_DAY = DEMO_VIEW_DAY;
            if(typeof window.dashboardData !== 'undefined' && window.dashboardData){
              const dd = window.dashboardData;
              if(typeof getDemoDateLabel === 'function') dd.dateLabel = getDemoDateLabel(reviewDayParam);
              if(typeof getDemoDateTopbar === 'function') dd.dateTopbar = getDemoDateTopbar(reviewDayParam);
              if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
              else if(typeof buildSelectedDayViewFromLauraModel === 'function') dd.today = buildSelectedDayViewFromLauraModel();
              if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
              (function(){
                const dw = String(DEMO_VIEW_DAY || '').trim() || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
                dd.venueMeta = dd.today && dd.today.length
                  ? `${dd.today.length} sessions`
                  : ('No participants — ' + dw);
              })();
              const staffId0 = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
              if(staffId0 && typeof buildWeekRows === 'function') dd.week = buildWeekRows(staffId0);
            }
            if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
            const pendingThisDay = typeof portalCountPendingSessionReviewsForCalendarDay === 'function'
              ? portalCountPendingSessionReviewsForCalendarDay(reviewIso, reviewDayParam)
              : 0;
            if(typeof renderHeader === 'function') renderHeader();
            if(typeof renderToday === 'function') renderToday();
            if(typeof renderMiniCounts === 'function') renderMiniCounts();
            if(typeof renderLists === 'function') renderLists();
            if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid();
            if(pendingThisDay > 0){
              portalSetReviewFlowOrigin('term');
              try{ portalSyncReviewNavigationQueryToHistory(); }catch(_e){ }
              try{
                document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }catch(_e2){ }
              return true;
            }
            if(typeof portalClearReviewDateUrlLock === 'function') portalClearReviewDateUrlLock();
            __PORTAL_REVIEW_DAY_URL_LOCK = '';
            try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_e3){ }
            try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = false; }catch(_e4){ }
            if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
            const nextNeed = typeof portalOldestIsoDateNeedingTermFeedback === 'function' ? String(portalOldestIsoDateNeedingTermFeedback() || '').trim() : '';
            if(nextNeed && typeof portalOpenTermSheetAndFocusOldestFeedbackDay === 'function'){
              portalOpenTermSheetAndFocusOldestFeedbackDay();
            } else if(typeof portalExitHistoricalReviewToLiveTodayMode === 'function'){
              portalExitHistoricalReviewToLiveTodayMode(true);
              try{
                document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }catch(_e5){ }
            }
            return true;
          }catch(eTerm){
            console.warn('[portal] term feedback return branch', eTerm);
          }
        }
        portalClearReviewDateUrlLock();
        __PORTAL_REVIEW_DAY_URL_LOCK = '';
        try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_){}
        try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = false; }catch(_){}
        try{ portalSyncReviewNavigationQueryToHistory(); }catch(_){}
        const todayWord = typeof portalWeekdayLongEnGB === 'function' ? portalWeekdayLongEnGB(new Date()) : 'Monday';
        DEMO_VIEW_DAY = todayWord;
        try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
        if(typeof window.dashboardData !== 'undefined' && window.dashboardData){
          const dd = window.dashboardData;
          const liveHdr = typeof portalLiveHeaderWeekday === 'function' ? portalLiveHeaderWeekday() : todayWord;
          dd.dateLabel = typeof getDemoDateLabel === 'function' ? getDemoDateLabel(liveHdr) : dd.dateLabel;
          dd.dateTopbar = typeof portalFormatTopbarDateFromDate === 'function' ? portalFormatTopbarDateFromDate(new Date()) : dd.dateTopbar;
          if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
          else dd.today = typeof buildSelectedDayViewFromLauraModel === 'function' ? buildSelectedDayViewFromLauraModel() : dd.today;
          if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
          (function(){
            const dw = String(DEMO_VIEW_DAY || '').trim() || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
            dd.venueMeta = dd.today && dd.today.length
              ? `${dd.today.length} sessions`
              : ('No participants — ' + dw);
          })();
          const staffIdFb = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
          if(staffIdFb && typeof buildWeekRows === 'function') dd.week = buildWeekRows(staffIdFb);
        }
        if(typeof renderHeader === 'function') renderHeader();
        if(typeof renderToday === 'function') renderToday();
        if(typeof renderMiniCounts === 'function') renderMiniCounts();
        if(typeof renderLists === 'function') renderLists();
        if(origin === 'term'){
          portalSetReviewFlowOrigin('term');
          if(typeof openSheet === 'function') openSheet('termSheet');
          return true;
        }
        portalSetReviewFlowOrigin('dashboard');
        const pendingAfter = (typeof collectSessionReviewPendingStats === 'function') ? collectSessionReviewPendingStats().pending.length : 0;
        if(origin === 'this_week' && pendingAfter > 0){
          document.getElementById('weekList')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }else{
          document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return true;
      }catch(_){
        return false;
      }
    }
    try{ window.portalApplyAfterSessionFeedbackReturnFromUrl = portalApplyAfterSessionFeedbackReturnFromUrl; }catch(_){}

    function portalApplyAfterVenueReturnFromUrl(){
      return false;
    }
    try{ window.portalApplyAfterVenueReturnFromUrl = portalApplyAfterVenueReturnFromUrl; }catch(_){}

    function portalApplyAfterQuickToolReturnFromUrl(){
      try{
        const u = new URL(location.href.split('#')[0]);
        if(u.searchParams.get('portalReturnToToday') !== '1') return false;
        u.searchParams.delete('portalReturnToToday');
        const qs = u.searchParams.toString();
        history.replaceState({}, '', u.pathname + (qs ? '?' + qs : '') + (location.hash || ''));
        if(typeof portalExitHistoricalReviewToLiveTodayMode === 'function'){
          portalExitHistoricalReviewToLiveTodayMode(true);
        }
        document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return true;
      }catch(_){
        return false;
      }
    }
    try{ window.portalApplyAfterQuickToolReturnFromUrl = portalApplyAfterQuickToolReturnFromUrl; }catch(_){}

    /**
     * After marking absence from the client sheet: return to the same review day while feedback still
     * owes on that calendar day; otherwise next term day needing review, or live dashboard home.
     */
    function portalApplyAfterInSheetQuickAbsence(item){
      try{
        if(!item || !item.sessionKey) return;
        try{ if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true }); }catch(_){}
        if(typeof hydrateSessionReviewMapFromStorage === 'function') hydrateSessionReviewMapFromStorage();
        const originRaw = typeof portalGetReviewFlowOrigin === 'function' ? portalGetReviewFlowOrigin() : 'dashboard';
        const origin = (originRaw === 'this_week' || originRaw === 'term') ? originRaw : 'dashboard';
        const skRaw = String(item.sessionKey || '').trim();
        const dateFromKey = (skRaw.split('|')[0] || '').trim();
        const reviewIso = /^\d{4}-\d{2}-\d{2}$/.test(dateFromKey) ? dateFromKey : '';
        const reviewDayParam = (typeof portalWeekdayLongFromSessionDateKey === 'function'
          ? portalWeekdayLongFromSessionDateKey(item.sessionKey) : '') || String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        const termWithLocks = origin === 'term'
          && /^\d{4}-\d{2}-\d{2}$/.test(reviewIso)
          && typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== 'undefined'
          && PORTAL_WEEK_REVIEW_VALID_DAYS.has(reviewDayParam);
        const staffIdRef = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        const buildTodayFn = typeof buildSelectedDayViewFromLauraModel === 'function' ? buildSelectedDayViewFromLauraModel : null;
        function rerenderCore(){
          if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
          if(typeof renderHeader === 'function') renderHeader();
          if(typeof renderToday === 'function') renderToday();
          if(typeof renderMiniCounts === 'function') renderMiniCounts();
          if(typeof renderLists === 'function') renderLists();
          if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid();
        }
        if(termWithLocks && buildTodayFn){
          try{
            portalSetReviewDateUrlLock(reviewIso);
            __PORTAL_REVIEW_DAY_URL_LOCK = reviewDayParam;
            try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = reviewDayParam; }catch(_){}
            try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = true; }catch(_){}
            DEMO_VIEW_DAY = reviewDayParam;
            try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
            if(typeof window.dashboardData !== 'undefined' && window.dashboardData){
              const dd = window.dashboardData;
              if(typeof getDemoDateLabel === 'function') dd.dateLabel = getDemoDateLabel(reviewDayParam);
              if(typeof getDemoDateTopbar === 'function') dd.dateTopbar = getDemoDateTopbar(reviewDayParam);
              dd.today = buildTodayFn();
              if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
              (function(){
                const dw = String(DEMO_VIEW_DAY || '').trim() || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
                dd.venueMeta = dd.today && dd.today.length ? `${dd.today.length} sessions` : ('No participants — ' + dw);
              })();
              if(staffIdRef && typeof buildWeekRows === 'function') dd.week = buildWeekRows(staffIdRef);
            }
            rerenderCore();
            const pendingThisDay = (typeof collectSessionReviewPendingStats === 'function') ? collectSessionReviewPendingStats().pending.length : 0;
            if(pendingThisDay > 0){
              portalSetReviewFlowOrigin('term');
              try{ portalSyncReviewNavigationQueryToHistory(); }catch(_){}
              try{ document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(_){}
              return;
            }
            if(typeof portalClearReviewDateUrlLock === 'function') portalClearReviewDateUrlLock();
            __PORTAL_REVIEW_DAY_URL_LOCK = '';
            try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = ''; }catch(_){}
            try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = false; }catch(_){}
            if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
            const nextNeed = typeof portalOldestIsoDateNeedingTermFeedback === 'function' ? String(portalOldestIsoDateNeedingTermFeedback() || '').trim() : '';
            if(nextNeed && typeof portalOpenTermSheetAndFocusOldestFeedbackDay === 'function'){
              portalOpenTermSheetAndFocusOldestFeedbackDay();
            } else if(typeof portalExitHistoricalReviewToLiveTodayMode === 'function'){
              portalExitHistoricalReviewToLiveTodayMode(true);
              try{ document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(_){}
            }
            return;
          }catch(eTerm){
            console.warn('[portal] term absence navigate', eTerm);
            try{ rerenderCore(); }catch(_){}
            return;
          }
        }
        if(origin === 'this_week' && buildTodayFn){
          if(typeof window.dashboardData !== 'undefined' && window.dashboardData){
            const dd = window.dashboardData;
            dd.today = buildTodayFn();
            if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
            (function(){
              const dw = String(DEMO_VIEW_DAY || '').trim() || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
              dd.venueMeta = dd.today && dd.today.length ? `${dd.today.length} sessions` : ('No participants — ' + dw);
            })();
            if(staffIdRef && typeof buildWeekRows === 'function') dd.week = buildWeekRows(staffIdRef);
          }
          rerenderCore();
          portalSetReviewFlowOrigin('this_week');
          const pendingAfter = (typeof collectSessionReviewPendingStats === 'function') ? collectSessionReviewPendingStats().pending.length : 0;
          if(pendingAfter > 0){
            try{ document.getElementById('weekList')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(_){}
          } else {
            if(typeof portalExitHistoricalReviewToLiveTodayMode === 'function') portalExitHistoricalReviewToLiveTodayMode(true);
            try{ document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(_){}
          }
          return;
        }
        const historical = typeof portalStaffIsHistoricalReviewDayMode === 'function' && portalStaffIsHistoricalReviewDayMode();
        if(historical && buildTodayFn && /^\d{4}-\d{2}-\d{2}$/.test(reviewIso) && typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== 'undefined' && PORTAL_WEEK_REVIEW_VALID_DAYS.has(reviewDayParam)){
          try{
            portalSetReviewDateUrlLock(reviewIso);
            __PORTAL_REVIEW_DAY_URL_LOCK = reviewDayParam;
            try{ window.__PORTAL_REVIEW_DAY_URL_LOCK = reviewDayParam; }catch(_){}
            try{ window.__PORTAL_STICKY_REVIEW_DAY_LOAD__ = true; }catch(_){}
            DEMO_VIEW_DAY = reviewDayParam;
            try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
            if(typeof window.dashboardData !== 'undefined' && window.dashboardData){
              const dd = window.dashboardData;
              if(typeof getDemoDateLabel === 'function') dd.dateLabel = getDemoDateLabel(reviewDayParam);
              if(typeof getDemoDateTopbar === 'function') dd.dateTopbar = getDemoDateTopbar(reviewDayParam);
              dd.today = buildTodayFn();
              if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
              (function(){
                const dw = String(DEMO_VIEW_DAY || '').trim() || new Date().toLocaleDateString('en-GB', { weekday: 'long' });
                dd.venueMeta = dd.today && dd.today.length ? `${dd.today.length} sessions` : ('No participants — ' + dw);
              })();
              if(staffIdRef && typeof buildWeekRows === 'function') dd.week = buildWeekRows(staffIdRef);
            }
            rerenderCore();
            const pendingThisDay = (typeof collectSessionReviewPendingStats === 'function') ? collectSessionReviewPendingStats().pending.length : 0;
            if(pendingThisDay > 0){
              portalSetReviewFlowOrigin('dashboard');
              try{ portalSyncReviewNavigationQueryToHistory(); }catch(_){}
              try{ document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(_){}
              return;
            }
          }catch(eDash){
            console.warn('[portal] dashboard historical absence navigate', eDash);
          }
        }
        if(typeof portalExitHistoricalReviewToLiveTodayMode === 'function'){
          portalExitHistoricalReviewToLiveTodayMode(true);
        } else if(typeof window.dashboardData !== 'undefined' && window.dashboardData && buildTodayFn){
          const dd = window.dashboardData;
          dd.today = buildTodayFn();
          if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
          rerenderCore();
        }
        portalSetReviewFlowOrigin('dashboard');
        try{ document.getElementById('portalTodaySection')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(_){}
      }catch(_){}
    }
    try{ window.portalApplyAfterInSheetQuickAbsence = portalApplyAfterInSheetQuickAbsence; }catch(_){}

    const PORTAL_IS_LEAD_APP = false;

    function portalVenueScheduleCtx(){
      const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
      return {
        viewDay: viewDay,
        viewDateIso: typeof portalViewCalendarDateKey === 'function' ? portalViewCalendarDateKey() : '',
        sessionsModel: sessionsModel || [],
        hasShiftToday: portalStaffHasVenueShiftOnView(STAFF_DASHBOARD_ID),
        parseStartMin: portalParseRosterStartMin
      };
    }
    function portalParseRosterStartMin(t){
      const raw = String(t || '').trim();
      if(!raw) return null;
      const hm = raw.match(/^(\d{1,2})(?:[:.](\d{2}))?/);
      if(!hm) return null;
      let h = Number(hm[1]);
      const m = Number(hm[2] || 0);
      if(!Number.isFinite(h) || !Number.isFinite(m)) return null;
      if(h <= 7 && !/[ap]m/i.test(raw)) h += 12;
      return h * 60 + m;
    }

    function portalStaffHasVenueShiftOnView(staffId){
      try{
        const id = String(staffId || '').trim().toLowerCase();
        if(!id) return false;
        const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        if(!viewDay) return false;
        const rows = (sessionsModel || []).filter(function(s){
          return String(s && s.staffId || '').trim().toLowerCase() === id &&
            String(s && s.day || '').trim() === viewDay;
        });
        return rows.length > 0;
      }catch(_){
        return false;
      }
    }
    function portalCanOpenVenueReportNormally(){
      const id = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      if(!id) return false;
      const sched = typeof window !== 'undefined' ? window.PortalVenueReportSchedule : null;
      if(!sched || typeof sched.portalVenueReportScopeApplies !== 'function') return false;
      return sched.portalVenueReportScopeApplies(id, portalVenueScheduleCtx());
    }

    function portalMinutesNow(){
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
    function formatPortalHm12(mins){
      const h24 = Math.floor(mins / 60);
      const mi = mins % 60;
      const h12 = ((h24 + 11) % 12) + 1;
      const ampm = h24 >= 12 ? 'pm' : 'am';
      if(mi === 0) return `${h12}${ampm}`;
      return `${h12}:${String(mi).padStart(2, '0')}${ampm}`;
    }
    function formatPortalRange(a, b){
      return `${formatPortalHm12(a)}–${formatPortalHm12(b)}`;
    }
    function portalVenueTimeWindowsForUser(){
      const id = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const sched = typeof window !== 'undefined' ? window.PortalVenueReportSchedule : null;
      if(!sched || typeof sched.portalVenueTimeWindowsForStaff !== 'function') return null;
      return sched.portalVenueTimeWindowsForStaff(id, portalVenueScheduleCtx());
    }
    function portalViewCalendarDateKey(){
      try{
        const dayName = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        if(!dayName) return getLocalDateKey();
        const d = getViewAnchorCalendarDate(dayName);
        if(!d || isNaN(d.getTime())) return getLocalDateKey();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }catch(_){
        return getLocalDateKey();
      }
    }
    function portalVenueClockAppliesToCurrentView(){
      try{
        const dayName = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        if(!dayName) return false;
        const anchor = getViewAnchorCalendarDate(dayName);
        const now = new Date();
        const a0 = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).getTime();
        const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return a0 === t0;
      }catch(_){
        return false;
      }
    }
    function portalNormalizeVenueTokenForPool(s){
      if(!s) return '';
      const v = String(s.venue != null ? s.venue : '').trim().toLowerCase();
      if(v) return v.replace(/\s+/g, ' ').trim();
      const a = String(s.rosterArea != null ? s.rosterArea : '').trim().toLowerCase();
      return a.replace(/\s+/g, ' ').trim();
    }
    /** When Aurora, Dan & Roberto all have Sunday roster, same single venue, identical slot pattern → one shared done flag. */
    function portalPoolSundaySharedSignature(viewDay){
      try{
        const d = String(viewDay || '').trim();
        if(d !== 'Sunday') return '';
        const poolIds = PORTAL_VENUE_SUNDAY_POOL;
        const sigs = [];
        for(let i = 0; i < poolIds.length; i++){
          const pid = poolIds[i];
          const rows = (sessionsModel || []).filter(function(s){
            return String(s.staffId || '').trim().toLowerCase() === pid && String(s.day || '').trim() === d;
          });
          if(!rows.length) return '';
          const venueToks = [];
          for(let j = 0; j < rows.length; j++){
            const tok = portalNormalizeVenueTokenForPool(rows[j]);
            if(tok) venueToks.push(tok);
          }
          const uq = [];
          venueToks.forEach(function(t){ if(uq.indexOf(t) < 0) uq.push(t); });
          if(uq.length !== 1) return '';
          const slots = rows.slice().sort(function(a, b){
            return Number(normalizeTimeForSort(a.start)) - Number(normalizeTimeForSort(b.start));
          }).map(function(r){
            return String(r.start || '').trim() + '-' + String(r.end || '').trim();
          }).join('|');
          sigs.push(uq[0] + '#' + slots);
        }
        if(sigs.length !== poolIds.length) return '';
        const head = sigs[0];
        for(let k = 1; k < sigs.length; k++){
          if(sigs[k] !== head) return '';
        }
        return head;
      }catch(_){
        return '';
      }
    }
    function portalVenueLocalKey(kind){
      const id = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const dateKey = portalViewCalendarDateKey();
      const w = portalVenueTimeWindowsForUser();
      const sched = typeof window !== 'undefined' ? window.PortalVenueReportSchedule : null;
      const slug = sched && typeof sched.portalVenueLocalScopeSlug === 'function'
        ? sched.portalVenueLocalScopeSlug(w)
        : String(w && w.label || id).replace(/[^a-z0-9]+/gi, '_').slice(0, 64);
      return 'portalVenue_' + kind + '_' + dateKey + '_' + slug;
    }
    function portalVenueFlagIsDone(kind){
      try{ return localStorage.getItem(portalVenueLocalKey(kind)) === '1'; }catch(e){ return false; }
    }
    function portalSetVenueFlag(kind){
      try{ localStorage.setItem(portalVenueLocalKey(kind), '1'); }catch(e){}
    }
    function portalTodayShiftSessions(){
      return (dashboardData.today || []).filter(it =>
        it && (it.kind === 'client' || it.kind === 'available') &&
        it.sessionStartTs != null && it.sessionEndTs != null
      );
    }
    /** Feedback reminders/notifications only after the full today shift (+15 min), not between back-to-back sessions. Orange cards still use isSessionEndedForFeedback per session. */
    function portalStaffTodayShiftEndedForFeedbackReminders(){
      try{
        const SHIFT_FEEDBACK_GRACE_MS = 15 * 60 * 1000;
        const todayKey = getLocalDateKey();
        const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        const dayWord = typeof portalWeekdayLongEnGB === 'function'
          ? portalWeekdayLongEnGB(new Date())
          : new Date().toLocaleDateString('en-GB', { weekday: 'long' });
        const todayRows = (dashboardData && dashboardData.today) || [];
        const shift = typeof portalTodayShiftSessions === 'function' ? portalTodayShiftSessions() : [];
        const hasWorkToday = todayRows.some(function(it){
          return it && it.kind === 'client' && !it.noSessionFeedbackRequired;
        }) || shift.some(function(it){
          return it && (it.kind === 'client' || it.kind === 'available') && !it.noSessionFeedbackRequired;
        });
        if(!hasWorkToday) return true;
        if(staffId && typeof portalTermCalendarDayHasNotEndedClientSession === 'function'
          && portalTermCalendarDayHasNotEndedClientSession(todayKey, dayWord, staffId)){
          return false;
        }
        let dayShiftEndMs = NaN;
        function scanEnd(item){
          if(!item || item.noSessionFeedbackRequired) return;
          if(item.kind !== 'client' && item.kind !== 'available') return;
          const t = item.sessionEndTs;
          if(typeof t === 'number' && Number.isFinite(t)){
            if(!Number.isFinite(dayShiftEndMs) || t > dayShiftEndMs) dayShiftEndMs = t;
          }
        }
        todayRows.forEach(scanEnd);
        if(!Number.isFinite(dayShiftEndMs)) shift.forEach(scanEnd);
        if(!Number.isFinite(dayShiftEndMs)) return true;
        return Date.now() >= (dayShiftEndMs + SHIFT_FEEDBACK_GRACE_MS);
      }catch(_){ return true; }
    }
    try{ window.portalStaffTodayShiftEndedForFeedbackReminders = portalStaffTodayShiftEndedForFeedbackReminders; }catch(_){}
    function portalVenueReportScopeApplies(){
      const id = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const sched = typeof window !== 'undefined' ? window.PortalVenueReportSchedule : null;
      if(!sched || typeof sched.portalVenueReportScopeApplies !== 'function') return false;
      return sched.portalVenueReportScopeApplies(id, portalVenueScheduleCtx());
    }
    /** Pool Sunday: skip opening reminder when first slot starts at or after 9:30 (legacy pool co-leads). */
    function portalPoolStaffSkipVenueOpeningRow(){
      const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
      if(viewDay !== 'Sunday') return false;
      const w = portalVenueTimeWindowsForUser();
      if(!w || !w.opening) return false;
      const list = (dashboardData.today || []).filter(function(it){
        return it && (it.kind === 'client' || it.kind === 'available') && typeof it.sessionStartTs === 'number';
      });
      if(!list.length) return false;
      let minTs = list[0].sessionStartTs;
      for(let i = 1; i < list.length; i++){
        if(list[i].sessionStartTs < minTs) minTs = list[i].sessionStartTs;
      }
      const d = new Date(minTs);
      return d.getHours() * 60 + d.getMinutes() >= 9 * 60 + 30;
    }
    /** Pool Sunday: skip closing when last block is the short ~2:00–2:30pm slot. */
    function portalPoolStaffSkipVenueClosingRow(){
      const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
      if(viewDay !== 'Sunday') return false;
      const w = portalVenueTimeWindowsForUser();
      if(!w || !w.closing) return false;
      const list = (dashboardData.today || []).filter(function(it){
        return it && (it.kind === 'client' || it.kind === 'available') &&
          typeof it.sessionEndTs === 'number' && typeof it.sessionStartTs === 'number';
      });
      if(!list.length) return false;
      let last = list[0];
      for(let i = 1; i < list.length; i++){
        if(list[i].sessionEndTs > last.sessionEndTs) last = list[i];
      }
      const ss = new Date(last.sessionStartTs);
      const es = new Date(last.sessionEndTs);
      const sm = ss.getHours() * 60 + ss.getMinutes();
      const em = es.getHours() * 60 + es.getMinutes();
      return sm >= 13 * 60 + 45 && em <= 14 * 60 + 45;
    }
    function portalFeedbackReminderDayInScope(isoYmd){
      try{
        const ptd = window.PortalTermCalendarDashboard;
        const todayKey = portalTermLocalYmdFromMs(termCalendarNowMs());
        const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        if(ptd && typeof ptd.feedbackReminderDayInScope === 'function'){
          return ptd.feedbackReminderDayInScope(isoYmd, todayKey, staffId);
        }
      }catch(_){}
      const key = String(isoYmd || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
      const staffIdFb = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      if(staffIdFb && typeof portalTermStaffExtraCalendarDates === 'function'
        && portalTermStaffExtraCalendarDates(staffIdFb).indexOf(key) >= 0){
        const todayKey = portalTermLocalYmdFromMs(termCalendarNowMs());
        return key <= todayKey;
      }
      const fromIso = (window.PortalTermCalendarDashboard && typeof window.PortalTermCalendarDashboard.feedbackReminderFromIso === 'function')
        ? window.PortalTermCalendarDashboard.feedbackReminderFromIso()
        : '2026-06-01';
      const todayKey = portalTermLocalYmdFromMs(termCalendarNowMs());
      return key >= fromIso && key <= todayKey;
    }
    function portalTermCalendarDayCountsForOutstanding(iso, fbMap){
      const st = fbMap && fbMap[String(iso || '').trim().slice(0, 10)];
      return st === 'pending' || st === 'late';
    }
    var _portalOutstandingFbCountCache = { key: '', n: 0, at: 0 };
    var _portalReminderStateCache = null;
    var _portalReminderStateCacheKey = '';
    function portalReminderStateFingerprint(){
      var fbMap = dashboardData && dashboardData.termFeedbackByDate;
      var fbKeys = fbMap && typeof fbMap === 'object' ? Object.keys(fbMap).length : 0;
      return [
        dashboardData && dashboardData.portalIdentityResolved ? '1' : '0',
        dashboardData && dashboardData.portalFeedbackPipelineReady ? '1' : '0',
        String(STAFF_DASHBOARD_ID || ''),
        String(Array.isArray(sessionsModel) ? sessionsModel.length : 0),
        String(fbKeys),
        String(dashboardData && dashboardData.portalFeedbackServerSynced ? '1' : '0'),
      ].join('|');
    }
    function portalInvalidateReminderStateCache(){
      _portalReminderStateCache = null;
      _portalReminderStateCacheKey = '';
      _portalOutstandingFbCountCache = { key: '', n: 0, at: 0 };
    }
    window.portalInvalidateReminderStateCache = portalInvalidateReminderStateCache;
    function portalOutstandingSessionFeedbackCountAcrossTerm(){
      try{
        var fp = typeof portalReminderStateFingerprint === 'function' ? portalReminderStateFingerprint() : '';
        var now = Date.now();
        if(
          _portalOutstandingFbCountCache.key === fp
          && now - _portalOutstandingFbCountCache.at < 20000
        ){
          return _portalOutstandingFbCountCache.n;
        }
        if(typeof portalStaffFeedbackPipelineReady === 'function' && !portalStaffFeedbackPipelineReady()) return 0;
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function'){
          rebuildTermShiftAndFeedbackFromSessionModel();
        }
        const fbMap = (dashboardData && dashboardData.termFeedbackByDate) ? dashboardData.termFeedbackByDate : {};
        const t = window.PORTAL_TERM_FROM_TIMETABLE;
        const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
        const worked = Array.isArray(dashboardData.termWorkedWeekdays) ? dashboardData.termWorkedWeekdays.map(Number) : [];
        if(!t || !t.firstDate || !t.lastDate || !staffId || !worked.length) return 0;
        const baseRealFb = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
        const nowMs = termCalendarNowMs();
        const todayKey = portalTermLocalYmdFromMs(nowMs);
        const fromIso = (window.PortalTermCalendarDashboard && typeof window.PortalTermCalendarDashboard.feedbackReminderFromIso === 'function')
          ? window.PortalTermCalendarDashboard.feedbackReminderFromIso()
          : String(dashboardData.termDashboardCalendarFrom || t.termResumeDate || '2026-06-01').slice(0, 10);
        let count = 0;
        const loopStart = (fromIso && fromIso > String(t.firstDate || '').slice(0, 10)) ? fromIso : String(t.firstDate).slice(0, 10);
        const cur = new Date(String(loopStart) + 'T12:00:00');
        const last = new Date(String(t.lastDate) + 'T12:00:00');
        while(cur.getTime() <= last.getTime()){
          const w = cur.getDay();
          if(!worked.includes(w)){
            cur.setDate(cur.getDate() + 1);
            continue;
          }
          const dayWord = cur.toLocaleDateString('en-GB', { weekday: 'long' });
          const key = termCalendarDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate());
          if(!portalFeedbackReminderDayInScope(key)){
            cur.setDate(cur.getDate() + 1);
            continue;
          }
          if(typeof getTermFeedbackStateForDay === 'function'){
            const calSt = getTermFeedbackStateForDay(cur.getFullYear(), cur.getMonth(), cur.getDate());
            if(calSt === 'complete' || calSt === 'cancelled'){
              cur.setDate(cur.getDate() + 1);
              continue;
            }
          }
          /* Same source of truth as term calendar green cells — do not nag when the day is complete. */
          if(!portalTermCalendarDayCountsForOutstanding(key, fbMap)){
            cur.setDate(cur.getDate() + 1);
            continue;
          }
          const isReal = function(s){
            if(baseRealFb) return baseRealFb(s, key);
            const st = String(s.status || '').toLowerCase();
            if(st === 'closed' || st === 'available') return false;
            const cid = String(s.clientId || '').toLowerCase();
            return Boolean(cid && cid !== 'closed' && cid !== 'available');
          };
          const relFb = typeof portalTermFeedbackSessionsForDate === 'function'
            ? portalTermFeedbackSessionsForDate(dayWord, key, staffId, isReal)
            : [];
          if(typeof portalTermDayFeedbackOutstandingResolved === 'function'
            && portalTermDayFeedbackOutstandingResolved(key, dayWord, staffId, relFb, cur)){
            cur.setDate(cur.getDate() + 1);
            continue;
          }
          let dayCount = 0;
          /* Feedback reminders fire only after the whole shift has ended (+15 min grace). */
          const SHIFT_FEEDBACK_GRACE_MS = 15 * 60 * 1000;
          let dayShiftEndMs = NaN;
          for(let i = 0; i < relFb.length; i++){
            const em = buildSessionEndMsForCalendarDate(cur.getFullYear(), cur.getMonth(), cur.getDate(), relFb[i].end);
            if(Number.isFinite(em) && (!Number.isFinite(dayShiftEndMs) || em > dayShiftEndMs)) dayShiftEndMs = em;
          }
          const dayShiftEnded = Number.isFinite(dayShiftEndMs) && nowMs >= (dayShiftEndMs + SHIFT_FEEDBACK_GRACE_MS);
          if(dayShiftEnded && typeof portalCountPendingSessionReviewsForCalendarDay === 'function'){
            dayCount = portalCountPendingSessionReviewsForCalendarDay(key, dayWord);
          }
          count += dayCount;
          cur.setDate(cur.getDate() + 1);
        }
        /* Catch-up May days (before feedbackReminderFromIso) only appear via extra / catch-up calendar dates. */
        (function(){
          const preTermKeys = [];
          const seenPre = Object.create(null);
          function addPreTerm(iso){
            const k = String(iso || '').trim().slice(0, 10);
            if(!/^\d{4}-\d{2}-\d{2}$/.test(k) || seenPre[k]) return;
            seenPre[k] = true;
            preTermKeys.push(k);
          }
          if(typeof portalTermStaffExtraCalendarDates === 'function'){
            portalTermStaffExtraCalendarDates(staffId).forEach(addPreTerm);
          }
          if(typeof portalTermStaffCatchUpFeedbackDates === 'function'){
            portalTermStaffCatchUpFeedbackDates(staffId).forEach(addPreTerm);
          }
          const fromFloor = String(fromIso || '').slice(0, 10);
          preTermKeys.forEach(function(key){
            if(!key || (fromFloor && key >= fromFloor)) return;
            if(typeof portalTermDateForcedComplete === 'function' && portalTermDateForcedComplete(key, staffId)) return;
            if(!portalFeedbackReminderDayInScope(key)) return;
            if(!portalTermCalendarDayCountsForOutstanding(key, fbMap)) return;
            const curExtra = new Date(String(key) + 'T12:00:00');
            const dayWord = curExtra.toLocaleDateString('en-GB', { weekday: 'long' });
            const isReal = function(s){
              if(baseRealFb) return baseRealFb(s, key);
              const st = String(s.status || '').toLowerCase();
              if(st === 'closed' || st === 'available') return false;
              const cid = String(s.clientId || '').toLowerCase();
              return Boolean(cid && cid !== 'closed' && cid !== 'available');
            };
            const relFb = typeof portalTermFeedbackSessionsForDate === 'function'
              ? portalTermFeedbackSessionsForDate(dayWord, key, staffId, isReal)
              : [];
            let dayCount = 0;
            const SHIFT_FEEDBACK_GRACE_MS = 15 * 60 * 1000;
            let dayShiftEndMs = NaN;
            for(let i = 0; i < relFb.length; i++){
              const em = buildSessionEndMsForCalendarDate(curExtra.getFullYear(), curExtra.getMonth(), curExtra.getDate(), relFb[i].end);
              if(Number.isFinite(em) && (!Number.isFinite(dayShiftEndMs) || em > dayShiftEndMs)) dayShiftEndMs = em;
            }
            const dayShiftEnded = Number.isFinite(dayShiftEndMs) && nowMs >= (dayShiftEndMs + SHIFT_FEEDBACK_GRACE_MS);
            if(dayShiftEnded && typeof portalCountPendingSessionReviewsForCalendarDay === 'function'){
              dayCount = portalCountPendingSessionReviewsForCalendarDay(key, dayWord);
            }
            count += dayCount;
          });
        })();
        var result = Math.max(0, count);
        _portalOutstandingFbCountCache = { key: fp, n: result, at: Date.now() };
        return result;
      }catch(_){ return 0; }
    }
    function portalReminderState(){
      var fp = typeof portalReminderStateFingerprint === 'function' ? portalReminderStateFingerprint() : '';
      if(_portalReminderStateCache && _portalReminderStateCacheKey === fp){
        return _portalReminderStateCache;
      }
      var st = portalReminderStateUncached();
      _portalReminderStateCache = st;
      _portalReminderStateCacheKey = fp;
      return st;
    }
    function portalReminderStateUncached(){
      if(!dashboardData || !dashboardData.portalIdentityResolved){
        return {
          setupPending: false,
          sessionFeedbackNeed: false,
          sessionFeedbackCount: 0,
          sessionFeedbackTodayNeed: false,
          sessionFeedbackLoading: true,
          safeguardingFeedbackPolicyActive: false,
          safeguardingFeedbackPolicyUnread: false,
          termIncomplete: false,
          termLate: false,
          venueOpenNeed: false,
          venueCloseNeed: false,
          rosterOverrideNeed: false,
          rosterOverridePrimaryIso: '',
          rosterOverrideCount: 0,
          rosterOverrideDayGroups: []
        };
      }
      if(!portalStaffFeedbackPipelineReady()){
        return {
          setupPending: !!dashboardData.setupPending,
          sessionFeedbackNeed: false,
          sessionFeedbackCount: 0,
          sessionFeedbackTodayNeed: false,
          sessionFeedbackLoading: true,
          safeguardingFeedbackPolicyActive: true,
          safeguardingFeedbackPolicyUnread: typeof portalSafeguardingFeedbackPolicyIsRead === 'function' ? !portalSafeguardingFeedbackPolicyIsRead() : false,
          termIncomplete: false,
          termLate: false,
          venueOpenNeed: false,
          venueCloseNeed: false,
          rosterOverrideNeed: false,
          rosterOverridePrimaryIso: '',
          rosterOverrideCount: 0,
          rosterOverrideDayGroups: []
        };
      }
      try{
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
      }catch(e){}
      const setupPending = !!dashboardData.setupPending;
      const stats = collectSessionReviewPendingStats();
      let termIncomplete = false;
      let termLate = false;
      const fbMap = dashboardData.termFeedbackByDate;
      if(fbMap && typeof fbMap === 'object'){
        const keys = Object.keys(fbMap);
        for(let i = 0; i < keys.length; i++){
          const k = keys[i];
          if(typeof portalFeedbackReminderDayInScope === 'function' && !portalFeedbackReminderDayInScope(k)) continue;
          const v = fbMap[k];
          if(v === 'late' || v === 'pending'){
            termIncomplete = true;
            if(v === 'late') termLate = true;
          }
        }
      }
      const termFbCount = typeof portalOutstandingSessionFeedbackCountAcrossTerm === 'function'
        ? portalOutstandingSessionFeedbackCountAcrossTerm()
        : 0;
      const shiftEndedForReminders = typeof portalStaffTodayShiftEndedForFeedbackReminders === 'function'
        ? portalStaffTodayShiftEndedForFeedbackReminders()
        : true;
      const sessionFeedbackCount = shiftEndedForReminders
        ? Math.max(termFbCount, stats.pending.length)
        : termFbCount;
      const sessionFeedbackTodayNeed = sessionFeedbackCount > 0;
      const sessionFeedbackNeed = sessionFeedbackCount > 0;
      if(!sessionFeedbackNeed){
        termIncomplete = false;
        termLate = false;
      }
      const venueScope = portalVenueReportScopeApplies();
      const shift = portalTodayShiftSessions();
      let venueOpenNeed = false;
      let venueCloseNeed = false;
      if(venueScope && portalVenueClockAppliesToCurrentView()){
        const openDone = portalVenueFlagIsDone('open');
        const closeDone = portalVenueFlagIsDone('close');
        const w = portalVenueTimeWindowsForUser();
        const m = portalMinutesNow();
        if(w){
          if(w.openEnd != null) venueOpenNeed = !openDone && m > w.openEnd;
          if(typeof portalPoolStaffSkipVenueOpeningRow === 'function' && portalPoolStaffSkipVenueOpeningRow()) venueOpenNeed = false;
          if(w.closeEnd != null) venueCloseNeed = !closeDone && m > w.closeEnd;
          if(typeof portalPoolStaffSkipVenueClosingRow === 'function' && portalPoolStaffSkipVenueClosingRow()) venueCloseNeed = false;
          if(!w.opening) venueOpenNeed = false;
          if(!w.closing) venueCloseNeed = false;
        }
      }
      const rosterAttention = typeof portalStaffRosterOverrideAttentionState === 'function'
        ? portalStaffRosterOverrideAttentionState()
        : { need: false, primaryIso: '', count: 0, rosterOverrideDayGroups: [] };
      return {
        setupPending,
        sessionFeedbackNeed,
        sessionFeedbackCount,
        sessionFeedbackTodayNeed: sessionFeedbackTodayNeed,
        sessionFeedbackLoading: false,
        safeguardingFeedbackPolicyActive: true,
        safeguardingFeedbackPolicyUnread: typeof portalSafeguardingFeedbackPolicyIsRead === 'function' ? !portalSafeguardingFeedbackPolicyIsRead() : true,
        termIncomplete,
        termLate,
        venueOpenNeed,
        venueCloseNeed,
        rosterOverrideNeed: !!rosterAttention.need,
        rosterOverridePrimaryIso: rosterAttention.primaryIso || '',
        rosterOverrideCount: rosterAttention.count || 0,
        rosterOverrideDayGroups: Array.isArray(rosterAttention.rosterOverrideDayGroups) ? rosterAttention.rosterOverrideDayGroups : []
      };
    }
    window.portalReminderState = portalReminderState;
    function portalReminderOperationalAny(){
      const st = portalReminderState();
      return !!(st.sessionFeedbackNeed || st.venueOpenNeed || st.venueCloseNeed || st.rosterOverrideNeed);
    }
    const PORTAL_REMINDER_NOTIFY_STORAGE = 'portalReminderLastNotify_v1';
    function portalMinutesUntilLocalMidnight(){
      const n = new Date();
      const e = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
      return Math.max(0, (e - n) / 60000);
    }
    /** 0 = informational … 3 = highest (clock after sessions end, hours since session end, time to midnight). */
    function portalReminderUrgencyLevel(st){
      let level = 0;
      const clock = getSessionReviewReminderClockTier();
      const minsToMid = portalMinutesUntilLocalMidnight();
      if(st.sessionFeedbackNeed){
        const stats = collectSessionReviewPendingStats();
        let l = clock;
        if(stats.pending.length){
          let hoursMax = 0;
          for(let i = 0; i < stats.pending.length; i++){
            const p = stats.pending[i];
            const t = p.sessionEndTs;
            if(typeof t === 'number') hoursMax = Math.max(hoursMax, (Date.now() - t) / 3600000);
          }
          const timeLevel = hoursMax >= 10 ? 3 : hoursMax >= 5 ? 2 : hoursMax >= 2 ? 1 : 0;
          l = Math.max(clock, timeLevel);
          if(minsToMid <= 30) l = Math.max(l, 3);
          else if(minsToMid <= 90) l = Math.max(l, 2);
          else if(minsToMid <= 180) l = Math.max(l, 1);
        } else if(st.termLate){
          l = Math.max(clock, 2);
          if(minsToMid <= 90) l = Math.max(l, 3);
          else if(minsToMid <= 180) l = Math.max(l, 2);
        } else if(st.termIncomplete){
          l = Math.max(clock, 1);
          if(minsToMid <= 120) l = Math.max(l, 2);
        }
        level = Math.min(3, l);
      }
      if(st.venueOpenNeed || st.venueCloseNeed){
        const v = Math.min(3, Math.max(1, clock));
        level = Math.max(level, v);
        if(minsToMid <= 60) level = Math.max(level, Math.min(3, v + 1));
      }
      if(st.rosterOverrideNeed){
        level = Math.max(level, Math.min(3, 2));
      }
      return level;
    }
    function portalReminderNotificationBody(st){
      const parts = [];
      if(st.sessionFeedbackNeed){
        const n = Math.max(0, Number(st.sessionFeedbackCount) || 0);
        if(n > 0) parts.push('Incomplete sessions (x' + n + ').');
      }
      if(st.venueOpenNeed) parts.push('Venue Report — opening still incomplete (late).');
      if(st.venueCloseNeed) parts.push('Venue Report — closing still incomplete (late).');
      if(st.rosterOverrideNeed) parts.push('Upcoming schedule changes (Quick menu).');
      return parts.join(' ');
    }
    function portalReminderVibrateForLevel(level){
      try{
        if(!navigator.vibrate) return;
        const patterns = {
          0: [100],
          1: [180, 70, 180],
          2: [220, 55, 220, 55, 220],
          3: [280, 45, 280, 45, 280, 45, 360]
        };
        navigator.vibrate(patterns[level] != null ? patterns[level] : patterns[3]);
      }catch(e){}
    }
    /**
     * In-browser reminder notifications (session feedback + venue only while tab open / background).
     * Roster overrides: Realtime → portalMaybeNotifyScheduleOverrideFromPayload → header OS banner + vibrate (not this function).
     */
    function portalMaybeNotifyReminders(st){
      try{
        if(typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        if(!st) return;
        if(dashboardData && !portalStaffFeedbackPipelineReady()) return;
        if(!(st.sessionFeedbackNeed || st.venueOpenNeed || st.venueCloseNeed)) return;
        const tabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
        const suppressFeedbackPush = tabVisible && !!st.sessionFeedbackNeed;
        if(suppressFeedbackPush && !st.venueOpenNeed && !st.venueCloseNeed) return;
        const level = typeof portalReminderUrgencyLevel === 'function' ? portalReminderUrgencyLevel(st) : 0;
        const bodyParts = [];
        if(st.sessionFeedbackNeed && !suppressFeedbackPush){
          const n = Math.max(0, Number(st.sessionFeedbackCount) || 0);
          if(n > 0) bodyParts.push('Incomplete sessions (x' + n + ').');
        }
        if(st.venueOpenNeed) bodyParts.push('Venue Report — opening still incomplete (late).');
        if(st.venueCloseNeed) bodyParts.push('Venue Report — closing still incomplete (late).');
        const body = bodyParts.join(' ').trim();
        if(!body) return;
        const title = level >= 3
          ? 'Urgent: same-day register (safeguarding)'
          : level >= 2
            ? 'Action required: register / feedback (safeguarding)'
            : level >= 1
              ? "Reminder: complete today's tasks"
              : 'Portal reminder';
        const intervals = [42 * 60 * 1000, 22 * 60 * 1000, 11 * 60 * 1000, 5 * 60 * 1000];
        const minGap = intervals[level] != null ? intervals[level] : intervals[0];
        let last = { t: 0, level: -1, body: '' };
        try{
          const raw = localStorage.getItem(PORTAL_REMINDER_NOTIFY_STORAGE);
          if(raw) last = JSON.parse(raw);
        }catch(_e){}
        const now = Date.now();
        const escalated = level > (Number(last.level) || -1);
        if(!escalated && (now - (Number(last.t) || 0) < minGap) && String(last.body || '') === body) return;
        const icon = '/portal/app-icon/icon-192.png?v=20260624-push-icon';
        try{
          const n = new Notification(title, {
            body: body,
            tag: 'clubsensational-portal-reminder',
            renotify: true,
            requireInteraction: level >= 2,
            icon: icon,
            badge: icon
          });
          n.addEventListener('click', function portalReminderNotifClick(){
            try{ window.focus(); }catch(_err){}
          });
        }catch(_e){ return; }
        if(typeof portalReminderVibrateForLevel === 'function') portalReminderVibrateForLevel(level);
        try{
          localStorage.setItem(PORTAL_REMINDER_NOTIFY_STORAGE, JSON.stringify({ t: now, level: level, body: body }));
        }catch(_e){}
      }catch(_e){}
    }
    function buildPortalOperationalReminderRowsHtml(st){
      if(!st) return '';
      const rows = [];
      const dayGroups = Array.isArray(st.rosterOverrideDayGroups) ? st.rosterOverrideDayGroups : [];
      function pushOverrideSetupRow(item){
        const title = escapeHtml(String(item.title || 'Schedule change'));
        const subRaw = String(item.sub || '').trim();
        const sub = subRaw ? escapeHtml(subRaw) : '';
        const k = String(item.kind || 'other');
        const rowTone = k === 'reverted' ? 'setup-row--qm-ov-reverted' : ((k === 'new_shift' || k === 'roster_day') ? 'setup-row--qm-ov-new-shift' : (k === 'new_participant' ? 'setup-row--qm-ov-new-participant' : (k === 'absent' ? 'setup-row--qm-ov-absent' : (k === 'makeup' ? 'setup-row--qm-ov-makeup' : ((k === 'cancelled' || k === 'shift_cancelled') ? 'setup-row--qm-ov-cancelled' : (k === 'slot_opened' ? 'setup-row--qm-ov-slot-opened' : 'setup-row--qm-ov-other'))))));
        const subHtml = sub ? ('<span class="setup-row-sub">' + sub + '</span>') : '';
        rows.push(
          '<button type="button" class="setup-row setup-row--portal-op ' + rowTone + ' setup-row--portal-register-note"' + portalOverrideAttentionButtonAttrs(item) + ' aria-label="' + title + '">' +
          '<span class="setup-row-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg></span>' +
          '<span class="setup-row-text"><strong>' + title + '</strong>' + subHtml + '</span>' +
          '<span class="setup-row-chev" aria-hidden="true">›</span></button>'
        );
      }
      let scheduleChangesHeaderShown = false;
      for(let gi = 0; gi < dayGroups.length; gi++){
        const grp = dayGroups[gi];
        const items = Array.isArray(grp && grp.items) ? grp.items : [];
        if(!items.length) continue;
        const allNewShift = items.every(function(it){
          const k = String(it && it.kind || '');
          return k === 'new_shift' || k === 'roster_day';
        });
        if(allNewShift){
          if(!scheduleChangesHeaderShown){
            rows.push('<div class="portal-qm-override-day-label portal-op-reminder-day-label">Schedule changes</div>');
            scheduleChangesHeaderShown = true;
          }
        }else{
          const lab = String(grp && grp.label || grp && grp.iso || '').trim();
          if(lab) rows.push('<div class="portal-qm-override-day-label portal-op-reminder-day-label">' + escapeHtml(lab) + '</div>');
        }
        for(let ri = 0; ri < items.length; ri++) pushOverrideSetupRow(items[ri]);
      }
      const inductionIcon =
        '<span class="setup-row-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg></span>';
      if(st.sessionFeedbackNeed){
        const nDisp = Math.max(0, Number(st.sessionFeedbackCount) || 0);
        const title = 'Incomplete sessions (x' + nDisp + ')';
        const sub = '';
        rows.push(
          '<button type="button" class="setup-row setup-row--feedback-incomplete setup-row--portal-op setup-row--portal-register-note" data-action="open-pending-feedback" aria-label="Open first client who still needs session feedback">' +
          inductionIcon +
          '<span class="setup-row-text"><strong>' + escapeHtml(title) + '</strong>' +
          '<span class="setup-row-sub">' + escapeHtml(sub) + '</span></span>' +
          '<span class="setup-row-chev" aria-hidden="true">›</span></button>'
        );
      }
      if(st.venueOpenNeed){
        rows.push(
          '<div class="setup-row setup-row--work-venue setup-row--portal-op" role="group">' +
          '<span class="setup-row-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22V10l8-4 8 4v12"/><path d="M9 22v-6h6v6"/></svg></span>' +
          '<span class="setup-row-text"><strong>Venue Report</strong><span class="setup-row-sub">Opening check still incomplete (late).</span></span>' +
          '<button type="button" class="portal-venue-mark-btn" data-portal-venue-mark="open">Done</button></div>'
        );
      }
      if(st.venueCloseNeed){
        rows.push(
          '<div class="setup-row setup-row--work-venue setup-row--portal-op" role="group">' +
          '<span class="setup-row-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22V10l8-4 8 4v12"/><path d="M9 22v-6h6v6"/></svg></span>' +
          '<span class="setup-row-text"><strong>Venue Report</strong><span class="setup-row-sub">Closing check still incomplete (late).</span></span>' +
          '<button type="button" class="portal-venue-mark-btn" data-portal-venue-mark="close">Done</button></div>'
        );
      }
      return rows.join('');
    }
    const PORTAL_REMINDER_ACK_STORAGE = typeof window !== 'undefined' && window.PORTAL_REMINDER_ACK_STORAGE
      ? window.PORTAL_REMINDER_ACK_STORAGE
      : 'portalReminderAckMap_v1';
    function portalReminderAckMapLoad(){
      try{
        const raw = localStorage.getItem(PORTAL_REMINDER_ACK_STORAGE);
        if(!raw) return {};
        const o = JSON.parse(raw);
        return o && typeof o === 'object' ? o : {};
      }catch(_){ return {}; }
    }
    function portalReminderAckMapSave(map){
      try{ localStorage.setItem(PORTAL_REMINDER_ACK_STORAGE, JSON.stringify(map || {})); }catch(_){}
    }
    function portalReminderIsAcked(item){
      const key = typeof portalReminderSignatureKey === 'function' ? portalReminderSignatureKey(item) : '';
      if(!key) return false;
      return !!portalReminderAckMapLoad()[key];
    }
    /** Admin-published reminders — signed via announcements sheet (not quick-menu list). */
    function portalBuildAdminReminderSectionHtml(){
      return '';
    }
    const PORTAL_SAFEGUARDING_FEEDBACK_POLICY_READ_KEY = 'portalSafeguardingFeedbackPolicyRead_v1';
    function portalSafeguardingFeedbackPolicyIsRead(){
      try{ return !!localStorage.getItem(PORTAL_SAFEGUARDING_FEEDBACK_POLICY_READ_KEY); }catch(_){ return false; }
    }
    function portalMarkSafeguardingFeedbackPolicyRead(){
      try{ localStorage.setItem(PORTAL_SAFEGUARDING_FEEDBACK_POLICY_READ_KEY, String(Date.now())); }catch(_){}
      if(typeof syncPortalSafeguardingFeedbackPolicySlot === 'function') syncPortalSafeguardingFeedbackPolicySlot();
      if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
    }
    function portalBuildSafeguardingFeedbackPolicyReminderHtml(){
      // "Same-day session feedback" sign card removed by request; only the Outstanding feedbacks tile remains.
      return '';
      if(!dashboardData || !dashboardData.portalIdentityResolved) return '';
      const read = typeof portalSafeguardingFeedbackPolicyIsRead === 'function' && portalSafeguardingFeedbackPolicyIsRead();
      const shieldIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
      const tone = read
        ? ' menu-btn--qm-safeguarding-feedback-policy--read'
        : ' menu-btn--qm-safeguarding-feedback-policy--unread menu-btn--portal-pulse';
      return '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-safeguarding-feedback-policy' + tone + '" id="portalSafeguardingFeedbackPolicyBtn" data-action="open-safeguarding-feedback-policy" aria-label="Same-day session feedback — open to read">' +
        '<div class="menu-btn-icon" aria-hidden="true">' + shieldIcon + '</div>' +
        '<div class="menu-btn-copy"><strong>Same-day session feedback</strong></div>' +
        '<span class="menu-btn-chev" aria-hidden="true">›</span></button>';
    }
    function syncPortalSafeguardingFeedbackPolicySlot(){
      const slot = document.getElementById('portalQuickMenuSafeguardingPolicySlot');
      if(!slot) return false;
      const html = typeof portalBuildSafeguardingFeedbackPolicyReminderHtml === 'function' ? portalBuildSafeguardingFeedbackPolicyReminderHtml() : '';
      if(html){
        slot.innerHTML = html;
        slot.hidden = false;
        return true;
      }
      slot.innerHTML = '';
      slot.hidden = true;
      return false;
    }
    function portalBuildOutstandingFeedbackQuickMenuHtml(st){
      if(!dashboardData || !dashboardData.portalIdentityResolved) return '';
      const fbIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg>';
      if(typeof portalStaffFeedbackPipelineReady === 'function' && !portalStaffFeedbackPipelineReady()){
        return '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-outstanding-feedback menu-btn--qm-outstanding-feedback--syncing" disabled aria-busy="true" aria-label="Updating feedback status">' +
          '<div class="menu-btn-icon" aria-hidden="true">' + fbIcon + '</div>' +
          '<div class="menu-btn-copy"><strong>Checking feedback status</strong><span class="menu-btn-sub">One moment…</span></div>' +
          '<span class="menu-btn-chev" aria-hidden="true">›</span></button>';
      }
      if(!st) st = typeof portalReminderState === 'function' ? portalReminderState() : {};
      const need = !!(st.sessionFeedbackNeed);
      const n = need ? Math.max(0, Number(st.sessionFeedbackCount) || 0) : 0;
      const tone = need ? ' menu-btn--qm-outstanding-feedback--need menu-btn--portal-pulse' : ' menu-btn--qm-outstanding-feedback--complete';
      const title = need ? 'Outstanding feedbacks x' + String(n) : 'Outstanding feedbacks = 0';
      const sub = need ? 'Complete session feedback' : 'All caught up through today';
      const aria = need
        ? 'Outstanding feedback — ' + n + ' incomplete sessions, tap to open'
        : 'Outstanding feedbacks — none pending through today, tap to review sessions';
      return '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-outstanding-feedback' + tone + '" id="portalOutstandingFeedbackBtn" data-action="open-pending-feedback" aria-label="' + escapeHtml(aria) + '">' +
        '<div class="menu-btn-icon" aria-hidden="true">' + fbIcon + '</div>' +
        '<div class="menu-btn-copy"><strong>' + escapeHtml(title) + '</strong><span class="menu-btn-sub">' + escapeHtml(sub) + '</span></div>' +
        '<span class="menu-btn-chev" aria-hidden="true">›</span></button>';
    }
    function syncPortalOutstandingFeedbackSlot(){
      const slot = document.getElementById('portalQuickMenuOutstandingFeedbackSlot');
      if(!slot) return false;
      const st = typeof portalReminderState === 'function' ? portalReminderState() : {};
      const html = typeof portalBuildOutstandingFeedbackQuickMenuHtml === 'function' ? portalBuildOutstandingFeedbackQuickMenuHtml(st) : '';
      if(html){
        slot.innerHTML = html;
        slot.hidden = false;
        return true;
      }
      slot.innerHTML = '';
      slot.hidden = true;
      return false;
    }
    function renderSafeguardingFeedbackPolicySheet(){
      const host = document.getElementById('safeguardingFeedbackPolicySheetBody');
      if(!host) return;
      const read = typeof portalSafeguardingFeedbackPolicyIsRead === 'function' && portalSafeguardingFeedbackPolicyIsRead();
      const bodyCopy =
        '<p>Session register and session feedback are <strong>mandatory for safeguarding</strong>. You must complete both on the <strong>same day</strong> as each session you deliver.</p>' +
        '<p>This applies to every client session on your timetable, including when a participant is absent or a session is shortened. Late completion may be flagged for follow-up.</p>' +
        '<p>If you have outstanding sessions, tap <strong>Outstanding feedbacks</strong> under Feedbacks to open them from your dashboard.</p>';
      if(read){
        host.innerHTML =
          '<article class="announcement-lock-card">' +
            '<p class="announcement-lock-copy" style="margin:0 0 12px">' + bodyCopy + '</p>' +
            '<p class="muted" style="margin:0;font-size:13px">You confirmed you read this reminder.</p>' +
          '</article>';
        return;
      }
      host.innerHTML =
        '<article class="announcement-lock-card">' +
          '<p class="announcement-lock-copy" style="margin:0 0 16px">' + bodyCopy + '</p>' +
          '<div class="announcement-lock-actions">' +
            '<label class="announcement-lock-check"><input type="checkbox" id="safeguardingPolicyReadConfirm" name="safeguardingPolicyReadConfirm"> I have read and understood this reminder.</label>' +
            '<button type="button" class="announcement-sign-btn" id="portalSafeguardingPolicyAckBtn" disabled>I understand</button>' +
          '</div>' +
        '</article>';
    }
    /** Logo-lite Reminders: feedback tiles only (schedule overrides live at top of menu). */
    function buildPortalQuickMenuLogoLiteRemindersHtml(st){
      if(!st) return '';
      const fbHtml = typeof buildPortalQuickMenuReminderCardsHtml === 'function' ? buildPortalQuickMenuReminderCardsHtml(st) : '';
      const chunks = [];
      if(fbHtml){
        chunks.push(
          '<section class="portal-qm-chunk portal-qm-chunk--feedbacks" aria-label="Feedbacks">' +
          '<div class="portal-qm-reminder-stack portal-qm-reminder-stack--feedbacks">' + fbHtml + '</div>' +
          '</section>'
        );
      }
      const adminRem = typeof portalBuildAdminReminderSectionHtml === 'function' ? portalBuildAdminReminderSectionHtml() : '';
      if(adminRem) chunks.push(adminRem);
      if(!chunks.length) return '';
      return '<div class="portal-qm-reminder-root">' + chunks.join('') + '</div>';
    }
    function syncPortalScheduleOverridesTopSlot(st){
      const host = document.getElementById('portalQuickMenuScheduleOverridesTop');
      const notifGrp = document.getElementById('portalQuickMenuNotificationsGroup');
      const adminTitleEl = document.getElementById('portalQuickMenuAdminChangesHeading');
      const guideGrp = document.getElementById('portalQuickMenuGuideGroup');
      const guideGrid = document.getElementById('portalQuickMenuGuideGrid');
      if(!host || !notifGrp) return false;
      if(!st) st = typeof portalReminderState === 'function' ? portalReminderState() : {};
      const logoLite = typeof portalQuickMenuEntryMode !== 'undefined' && portalQuickMenuEntryMode === 'logo-lite';
      const ovHtml = typeof portalBuildQuickMenuOverrideStackHtml === 'function' ? portalBuildQuickMenuOverrideStackHtml(st) : '';
      const hasOv = !!ovHtml;

      if(logoLite && hasOv){
        host.innerHTML = ovHtml;
        host.hidden = false;
        if(adminTitleEl) adminTitleEl.hidden = false;
        if(guideGrp) guideGrp.hidden = true;
        if(guideGrid) guideGrid.hidden = true;
        return true;
      }

      host.innerHTML = '';
      host.hidden = true;
      if(adminTitleEl) adminTitleEl.hidden = true;
      if(logoLite && guideGrp){
        guideGrp.hidden = true;
      }else if(guideGrp){
        guideGrp.hidden = true;
        if(guideGrid) guideGrid.hidden = true;
      }
      return false;
    }
    /** Quick-menu halo tile class per admin override kind (pink MakeUp, green Absent, red Cancelled, …). */
    function portalQuickMenuOverrideKindMenuClass(kind){
      const k = String(kind || 'other').trim();
      if(k === 'absent') return 'menu-btn--qm-ov-absent';
      if(k === 'trial') return 'menu-btn--qm-ov-trial';
      if(k === 'makeup') return 'menu-btn--qm-ov-makeup';
      if(k === 'cancelled' || k === 'shift_cancelled') return 'menu-btn--qm-ov-cancelled';
      if(k === 'slot_opened') return 'menu-btn--qm-ov-slot-opened';
      if(k === 'reverted') return 'menu-btn--qm-ov-reverted';
      if(k === 'new_shift' || k === 'roster_day') return 'menu-btn--qm-ov-new-shift';
      if(k === 'new_participant') return 'menu-btn--qm-ov-new-participant';
      if(k === 'training') return 'menu-btn--qm-ov-training';
      if(k === 'shadowing') return 'menu-btn--qm-ov-shadowing';
      if(k === 'meeting') return 'menu-btn--qm-ov-meeting';
      return 'menu-btn--qm-ov-other';
    }
    function portalQuickMenuOverrideCancelledInlineStyle(kind){
      const k = String(kind || '').trim();
      if(k !== 'cancelled' && k !== 'shift_cancelled') return '';
      return ' style="background:linear-gradient(180deg,#d6d6dc 0%,#bfc0c8 100%);background-color:#bfc0c8;color:#173247;border:2px solid rgba(82,82,91,.58);box-shadow:0 6px 18px rgba(82,82,91,.28)"';
    }
    function portalBuildQuickMenuOverrideStackHtml(st){
      const dayGroups = Array.isArray(st.rosterOverrideDayGroups) ? st.rosterOverrideDayGroups : [];
      if(!dayGroups.length) return '';
      const logoLite = typeof portalQuickMenuEntryMode !== 'undefined' && portalQuickMenuEntryMode === 'logo-lite';
      const calIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>';
      function oneBtn(item){
        const title = escapeHtml(String(item.title || 'Schedule change'));
        const subRaw = String(item.sub || '').trim();
        const sub = subRaw ? escapeHtml(subRaw) : '';
        const tone = portalQuickMenuOverrideKindMenuClass(item && item.kind) + ' menu-btn--portal-pulse';
        const subHtml = sub ? ('<span class="menu-btn-sub">' + sub + '</span>') : '';
        return '<button type="button" class="menu-btn notice menu-btn--qm-tile ' + tone + '"' + portalQuickMenuOverrideCancelledInlineStyle(item && item.kind) + portalOverrideAttentionButtonAttrs(item) + ' aria-label="' + title + '">' +
          '<div class="menu-btn-icon" aria-hidden="true">' + calIcon + '</div>' +
          '<div class="menu-btn-copy"><strong>' + title + '</strong>' + subHtml + '</div>' +
          '<span class="menu-btn-chev" aria-hidden="true">›</span></button>';
      }
      let html = '<div class="portal-qm-override-stack">';
      if(logoLite){
        const flatItems = [];
        for(let g = 0; g < dayGroups.length; g++){
          const items = Array.isArray(dayGroups[g] && dayGroups[g].items) ? dayGroups[g].items : [];
          for(let i = 0; i < items.length; i++) flatItems.push(items[i]);
        }
        flatItems.sort(function(a, b){
          const ai = String(a && a.iso || '');
          const bi = String(b && b.iso || '');
          return ai < bi ? -1 : (ai > bi ? 1 : 0);
        });
        html += '<div class="portal-qm-override-day" role="group" aria-label="Schedule changes">' +
          flatItems.map(oneBtn).join('') + '</div>';
      }else{
        for(let g = 0; g < dayGroups.length; g++){
          const grp = dayGroups[g];
          const items = Array.isArray(grp && grp.items) ? grp.items : [];
          if(!items.length) continue;
          const allNewShift = items.every(function(it){
            const k = String(it && it.kind || '');
            return k === 'new_shift' || k === 'roster_day';
          });
          const labRaw = allNewShift
            ? 'Schedule changes'
            : String(grp && grp.label || grp && grp.iso || '').trim();
          const labEsc = escapeHtml(labRaw);
          html += '<div class="portal-qm-override-day" role="group" aria-label="' + labEsc + '">' +
            (labRaw ? ('<div class="portal-qm-override-day-label">' + labEsc + '</div>') : '') +
            items.map(oneBtn).join('') + '</div>';
        }
      }
      html += '</div>';
      return html;
    }
    function syncPortalReminderChrome(){
      try{
        const st = typeof portalReminderState === 'function' ? portalReminderState() : {};
      const opHost = document.getElementById('portalOperationalReminderList');
        if(opHost){
          const opHtml = typeof buildPortalOperationalReminderRowsHtml === 'function' ? buildPortalOperationalReminderRowsHtml(st) : '';
          opHost.innerHTML = opHtml;
          opHost.hidden = !opHtml;
        }
        if(typeof syncPortalSafeguardingFeedbackPolicySlot === 'function') syncPortalSafeguardingFeedbackPolicySlot();
        if(typeof syncPortalOutstandingFeedbackSlot === 'function') syncPortalOutstandingFeedbackSlot();
        if(typeof syncPortalWellbeingReviewReminderSlot === 'function') syncPortalWellbeingReviewReminderSlot();
        if(typeof syncPortalScheduleOverridesTopSlot === 'function') syncPortalScheduleOverridesTopSlot(st);
        const qg = document.getElementById('portalQuickMenuReminderGroup');
        const qh = document.getElementById('portalQuickMenuReminderBannerHost');
        if(qg && qh){
          const remRoot = typeof buildPortalQuickMenuLogoLiteRemindersHtml === 'function' ? buildPortalQuickMenuLogoLiteRemindersHtml(st) : '';
          if(remRoot){
            qh.innerHTML = remRoot;
            qg.hidden = false;
          }else{
            qh.innerHTML = '';
            qg.hidden = true;
          }
        }
        const tn = document.getElementById('trainingNotice');
      if(tn){
          /* Pulse only for feedback / venue / induction — overrides use colour in the quick menu; this row is not animated for overrides. */
          const pulse = !!(st.safeguardingFeedbackPolicyUnread || st.sessionFeedbackNeed || st.venueOpenNeed || st.venueCloseNeed || st.setupPending);
          const urg = typeof portalReminderUrgencyLevel === 'function' ? portalReminderUrgencyLevel(st) : 0;
        tn.classList.toggle('notice--reminder-pulse', pulse);
        tn.classList.toggle('notice--reminder-urgent', pulse && urg >= 1);
        for(let u = 0; u <= 3; u++){
          tn.classList.toggle('notice--reminder-urgency-' + u, pulse && urg === u);
        }
        const strong = tn.querySelector('.txt strong');
          const span = tn.querySelector('.txt span');
          if(strong && span){
            strong.textContent = 'Reminder';
          let sub = 'Tasks';
          if(st.sessionFeedbackLoading){
            sub = 'Checking feedback status…';
          }else if(st.sessionFeedbackNeed){
              sub = (Number(st.sessionFeedbackCount) || 0) <= 1
              ? 'Complete your Session Feedback'
              : 'Complete your Session Feedbacks';
            }else if(st.safeguardingFeedbackPolicyUnread){
              sub = 'Same-day session feedback — tap to read';
            }else if(st.rosterOverrideNeed){
              sub = 'Upcoming schedule changes — open the quick menu';
            }else if(st.venueOpenNeed || st.venueCloseNeed){
            const bits = [];
            if(st.venueOpenNeed) bits.push('opening venue report');
            if(st.venueCloseNeed) bits.push('closing venue report');
            sub = bits.join(' · ');
            }else if(st.setupPending){
            sub = 'Pending inductions';
          }
            span.textContent = sub;
          tn.setAttribute('aria-label', 'Open reminders: ' + sub);
          }
        }
        if(typeof syncPortalHeaderAlertChrome === 'function') syncPortalHeaderAlertChrome(st);
      if(typeof syncPortalQuickMenuNotificationsGroupVisibility === 'function') syncPortalQuickMenuNotificationsGroupVisibility();
      if(typeof syncDockQuickMenuAttention === 'function') syncDockQuickMenuAttention();
        if(typeof syncPortalIosAlertPreviewStack === 'function') syncPortalIosAlertPreviewStack();
        if(typeof portalMaybeNotifyReminders === 'function') portalMaybeNotifyReminders(st);
        if(typeof window.portalSyncLeadTeamShiftUi === 'function') window.portalSyncLeadTeamShiftUi();
      }catch(_){}
    }

    function sessionRegisterReminderDisplayTier(stats){
      if(!stats || !stats.pending.length) return 0;
      const clockTier = getSessionReviewReminderClockTier();
      const dayKey = getLocalDateKey();
      const state = loadSessionReviewReminderDayState(dayKey);
      if(clockTier > 0 && clockTier > state.maxTierShown){
        state.maxTierShown = clockTier;
        saveSessionReviewReminderDayState(dayKey, state);
      }
      return state.maxTierShown;
    }
    function getSessionRegisterReminderSetupCopy(stats){
      if(!stats || !stats.pending.length) return null;
      const displayTier = sessionRegisterReminderDisplayTier(stats);
      const n = stats.pending.length;
      const title = 'Incomplete sessions (x' + n + ')';
      return { title, sub: '', displayTier };
    }
    function buildPortalQuickMenuReminderCardsHtml(st){
      if(!st) st = {};
      const parts = [];
      const fbIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg>';
      const venIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22V10l8-4 8 4v12"/><path d="M9 22v-6h6v6"/></svg>';
      if(st.venueOpenNeed){
        parts.push(
          '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-reminder-venue" data-action="open-setup-reminder-sheet" aria-label="Venue opening check incomplete">' +
          '<div class="menu-btn-icon" aria-hidden="true">' + venIcon + '</div>' +
          '<div class="menu-btn-copy"><strong>Venue report</strong><span class="menu-btn-sub">Opening check incomplete (late)</span></div>' +
          '<span class="menu-btn-chev" aria-hidden="true">›</span></button>'
        );
      }
      if(st.venueCloseNeed){
        parts.push(
          '<button type="button" class="menu-btn notice menu-btn--qm-tile menu-btn--qm-reminder-venue" data-action="open-setup-reminder-sheet" aria-label="Venue closing check incomplete">' +
          '<div class="menu-btn-icon" aria-hidden="true">' + venIcon + '</div>' +
          '<div class="menu-btn-copy"><strong>Venue report</strong><span class="menu-btn-sub">Closing check incomplete (late)</span></div>' +
          '<span class="menu-btn-chev" aria-hidden="true">›</span></button>'
        );
      }
      return parts.join('');
    }
    function syncSessionReviewReminderBanner(){
      const host = document.getElementById('sessionReviewReminderHost');
      if(host) host.innerHTML = '';
    }
    function sessionReviewRowClass(item){
      if(!item || item.kind !== 'client' || !item.sessionKey) return '';
      if(item.noSessionFeedbackRequired) return '';
      if(item.portalOverrideSuppressReviewOrange) return '';
      const isoGate = portalSessionDateIsoFromItemSessionKey(item);
      if(isoGate && typeof portalStaffFeedbackReviewUiReady === 'function' && !portalStaffFeedbackReviewUiReady(isoGate)){
        return '';
      }
      const r = getEffectiveSessionReviewRecord(item) || {};
      if(r.absent) return 'session-card--review-done';
      if(r.cancelled) return 'session-card--review-done';
      if(r.feedbackDone) return 'session-card--review-done';
      if(r.incident) return 'session-card--review-incident';
      const ended = typeof isSessionEndedForFeedback === 'function' && isSessionEndedForFeedback(item);
      if(ended && !r.feedbackDone && !r.absent && !r.cancelled) return 'session-card--review-needed';
      if(isSessionStartedForItem(item)){
        if(!r.feedbackDone && !r.absent && !r.cancelled) return 'session-card--review-needed';
        return '';
      }
      return '';
    }
    /** Day Centre participants: their feedback turns orange / "ready to judge" 30 min BEFORE the
     *  session ends (e.g. ends 3:00pm → judgeable from 2:30pm). Every other service stays gated on
     *  the real end time. Detected from the roster row service ("Day Centre"). */
    const DAY_CENTRE_FEEDBACK_LEAD_MS = 30 * 60 * 1000;
    function portalRosterSessionIsDayCentre(s){
      if(!s) return false;
      if(/day\s*centre/i.test(String(s.rosterService || ''))) return true;
      if(/day\s*centre/i.test(String(s.service || ''))) return true;
      if(/day\s*centre/i.test(String(s.activity || ''))) return true;
      if(String(s.feedbackUnitKey || '').indexOf('day_centre') >= 0) return true;
      return false;
    }
    /** 2:1 / 3:1 Bespoke SwimFarm Hub — shared feedback across co-instructors (e.g. Tinashe). */
    function portalRosterSessionIsBespokeShared(s){
      if(!s) return false;
      if(String(s.feedbackUnitKey || '').indexOf('bespoke_shared') >= 0) return true;
      if(!/bespoke/i.test(String(s.activity || s.rosterService || s.service || ''))) return false;
      if(String(s.venue || '').trim().toLowerCase() !== 'swimfarm') return false;
      const inst = String(s.instructors || s.staffNames || '').trim();
      if(inst){
        const n = inst.split(/[,/&+]+|\s+and\s+/gi).filter(function(p){ return String(p || '').trim(); }).length;
        if(n >= 2) return true;
      }
      const cid = String(s.clientId || '').trim().toLowerCase();
      return cid === 'tinashe';
    }
    function portalFeedbackItemIsDayCentre(item){
      if(!item) return false;
      if(item.dayCentre === true || item.isDayCentre === true) return true;
      if(/day\s*centre/i.test(String(item.service || ''))) return true;
      return portalRosterSessionIsDayCentre(item.__portalBaseSession);
    }
    function isSessionEndedForFeedback(item){
      if(STAFF_DASH_FORCE_SESSIONS_ENDED) return true;
      try{
        if(portalStaffIsDemoAccount() && item && item.sessionKey && window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__ && window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__.has(item.sessionKey)){
          return false;
        }
      }catch(_e){}
      const t = item && item.sessionEndTs;
      if(t == null){
        try{
          const iso = typeof portalSessionDateIsoFromItemSessionKey === 'function'
            ? portalSessionDateIsoFromItemSessionKey(item)
            : String(item && item.sessionKey || '').split('|')[0].trim();
          const todayKey = typeof portalTermLocalYmdFromMs === 'function'
            ? portalTermLocalYmdFromMs(Date.now())
            : '';
          if(/^\d{4}-\d{2}-\d{2}$/.test(iso) && todayKey && iso < todayKey) return true;
        }catch(_){}
        return false;
      }
      const lead = portalFeedbackItemIsDayCentre(item) ? DAY_CENTRE_FEEDBACK_LEAD_MS : 0;
      return Date.now() >= (t - lead);
    }
    /**
     * True when this weekday (current week strip) still has a replace / make-up slot
     * whose end time is in the future — week row may use pink + “Make Up” tag.
     */
    function portalWeekDayHasReplaceMakeUpPinkActive(dayName){
      try{
        const cell = typeof calendarDateForWeekListDay === 'function' ? calendarDateForWeekListDay(dayName) : null;
        if(!cell) return false;
        const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(cell) : '';
        const sessions = typeof weekListClientSessionsForDay === 'function' ? weekListClientSessionsForDay(dayName) : [];
        for(let i = 0; i < sessions.length; i++){
          const s = sessions[i];
          if(!s) continue;
          const manualOv = String(s.override || '').trim().toUpperCase();
          const ov = typeof portalTodayScheduleOverrideForSession === 'function' ? portalTodayScheduleOverrideForSession(s, iso) : null;
          const hasReplace = (ov && ov.override_type === 'client_replace_in_slot') || manualOv === 'REPLACED';
          if(!hasReplace) continue;
          const syn = weekListSyntheticFeedbackItem(s, cell);
          if(!isSessionEndedForFeedback({ sessionEndTs: syn.sessionEndTs, sessionKey: syn.sessionKey })) return true;
        }
      }catch(_){}
      return false;
    }
    /** Term grid: today’s cell shows make-up pink while a replace slot on that calendar day has not ended yet. */
    function termWorkedDayHasReplaceMakeUpPink(year, monthIndex, day){
      try{
        const dt = new Date(year, monthIndex, day);
        const isoKey = termCalendarDateKey(year, monthIndex, day);
        const dayWord = dt.toLocaleDateString('en-GB', { weekday: 'long' });
        const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
        const baseRealTm = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
        const isReal = function(s){
          if(baseRealTm) return baseRealTm(s, isoKey);
          const st = String(s.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(s.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const list = Array.isArray(sessionsModel) ? sessionsModel : [];
        for(let i = 0; i < list.length; i++){
          const s = list[i];
          if(!s || String(s.staffId || '').toLowerCase() !== staffId) continue;
          if(String(s.day || '').trim() !== dayWord) continue;
          if(!isReal(s)) continue;
          const manualOv = String(s.override || '').trim().toUpperCase();
          const ov = typeof portalTodayScheduleOverrideForSession === 'function' ? portalTodayScheduleOverrideForSession(s, isoKey) : null;
          const hasReplace = (ov && ov.override_type === 'client_replace_in_slot') || manualOv === 'REPLACED';
          if(!hasReplace) continue;
          const syn = weekListSyntheticFeedbackItem(s, dt);
          if(!isSessionEndedForFeedback({ sessionEndTs: syn.sessionEndTs, sessionKey: syn.sessionKey })) return true;
        }
      }catch(_){}
      return false;
    }

    let currentOpenClientItem = null;

    function portalRosterDutySlotLabel(s){
      if(!s) return '';
      const cid = String(s.clientId || '').trim().toLowerCase();
      const statusLow = String(s.status || '').trim().toLowerCase();
      if(cid === 'home' || statusLow === 'home') return 'HOME';
      if(cid === 'manager' || statusLow === 'manager') return 'MANAGER';
      const areaUp = String(s.rosterArea || s.area || '').trim().toUpperCase();
      if(areaUp === 'HOME') return 'HOME';
      return '';
    }
    function portalSessionIsRosterDutySlot(s){
      return !!portalRosterDutySlotLabel(s);
    }
    function sessionModelStatus(s){
      const statusLow = String(s && s.status || '').trim().toLowerCase();
      const clientIdLow = String(s && s.clientId || '').trim().toLowerCase();
      const nameBlob = String((s && (s.clientName || s.client || s.name)) || '').trim().toLowerCase();
      if(statusLow === 'closed' || clientIdLow === 'closed') return 'Closed';
      if(statusLow === 'home' || clientIdLow === 'home' || nameBlob === 'home' || nameBlob === 'casa') return 'Home';
      if(statusLow === 'manager' || clientIdLow === 'manager' || nameBlob === 'manager') return 'Manager';
      if(
        statusLow === 'available' || statusLow === 'no client' || statusLow === 'no_client' ||
        clientIdLow === 'available' || clientIdLow === 'no client' || clientIdLow === 'no_client' || clientIdLow === 'noclient' ||
        (!clientIdLow && /^no\s*client$/.test(nameBlob))
      ) return 'Available';
      if(s.status){
        const low = String(s.status).trim().toLowerCase();
        if(low === 'scheduled') return 'Scheduled';
        return String(s.status).trim();
      }
      return 'Scheduled';
    }

    function specialtyInfoTitle(activity){
      const a = String(activity || 'Swimming').trim().toLowerCase();
      if(a === 'bespoke') return '';
      if(a === 'climbing') return 'Climbing information';
      if(a === 'fitness') return 'Fitness information';
      return 'Swimming information';
    }
    function activityButtonCaption(activity){
      const raw = String(activity || 'Swimming').trim();
      if(!raw) return 'Activity';
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    function activityIconSvg(activity){
      const iconClass = 'client-info-icon';
      const a = String(activity || 'swimming').trim().toLowerCase();
      if(a === 'climbing'){
        return `<svg class="${iconClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l5-8 4 5 5-12"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="14" cy="5" r="1.8" fill="currentColor" stroke="none"/><circle cx="18" cy="10" r="1.8" fill="currentColor" stroke="none"/></svg>`;
      }
      if(a === 'fitness'){
        return `<svg class="${iconClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 9h11"/><rect x="3" y="6" width="3.5" height="12" rx="1"/><rect x="17.5" y="6" width="3.5" height="12" rx="1"/></svg>`;
      }
      return `<svg class="${iconClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/><path d="M2 16c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/></svg>`;
    }
    function isBespokeActivity(activity){
      return String(activity || '').trim().toLowerCase() === 'bespoke';
    }
    function pickSpecialtyBody(c, activity){
      if(!c) return '';
      const a = String(activity || 'Swimming').trim().toLowerCase();
      if(a === 'climbing' && c.specialtyClimbing) return c.specialtyClimbing;
      if(a === 'fitness' && c.specialtyFitness) return c.specialtyFitness;
      return c.specialty || '';
    }
    function escapeHtml(str){
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
    }

    /**
     * Turns prose like "1. Age: … 2. Medical: …" into readable rows (bold label + value).
     * If the pattern does not match, returns an escaped paragraph with line breaks preserved.
     */
    function formatPortalClientInfoProseHtml(raw, emptyLabel){
      const emptyMsg = emptyLabel != null ? String(emptyLabel) : 'No general information available.';
      const t = String(raw == null ? '' : raw).trim();
      if(!t) return '<p class="client-general-fallback">' + escapeHtml(emptyMsg) + '</p>';
      let chunks = [];
      if(/\n\s*\d+\.\s+/.test(t)){
        chunks = t.split(/\n(?=\s*\d+\.\s+)/).map(s => s.trim()).filter(Boolean);
      }
      if(chunks.length < 2){
        chunks = t.split(/\s(?=\d+\.\s+)/).map(s => s.trim()).filter(Boolean);
      }
      const rowRe = /^(\d+)\.\s*([^:]+):\s*(.*)$/s;
      if(chunks.length >= 2){
        const rows = [];
        for(let i = 0; i < chunks.length; i++){
          const m = chunks[i].match(rowRe);
          if(!m){
            rows.length = 0;
            break;
          }
          const label = escapeHtml(m[2].trim());
          const val = escapeHtml(m[3].trim());
          rows.push(
            '<div class="client-general-info-row" role="listitem">' +
            '<div class="client-general-info-row__label">' + label + '</div>' +
            '<div class="client-general-info-row__value">' + val + '</div>' +
            '</div>'
          );
        }
        if(rows.length >= 2){
          return '<div class="client-general-info-list" role="list">' + rows.join('') + '</div>';
        }
      }
      return '<p class="client-general-fallback">' + escapeHtml(t).replace(/\n/g, '<br>') + '</p>';
    }
    function setClientInfoFormattedBody(elementId, raw, emptyLabel){
      const el = document.getElementById(elementId);
      if(el) el.innerHTML = formatPortalClientInfoProseHtml(raw, emptyLabel);
    }

    const CLIENT_LIST_PSEUDO_IDS = ['closed', 'available', 'home', 'manager'];
    function clientGenderDataAttr(c){
      const g = c && String(c.gender || '').trim().toLowerCase();
      if(g === 'm' || g === 'male') return ' data-gender="m"';
      if(g === 'f' || g === 'female') return ' data-gender="f"';
      return '';
    }
    function clientInitials(name){
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return '?';
      if(parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    /**
     * Participant recognition photos. We share centres with other providers and
     * their clients, so instructors get a real face on the participant avatar.
     * Add more by mapping the participant's display name (case-insensitive,
     * spaces collapsed) to an image under working_ui/portal/participants/.
     */
    function clientPhotoUrl(name){
      if(typeof portalParticipantPhotoUrl === 'function') return portalParticipantPhotoUrl(name) || '';
      return '';
    }
    function resolveParticipantPhotoUrl(name, clientId){
      const c = clientId && clientNotesById[clientId];
      const fromNote = c && c.avatarFile ? String(c.avatarFile).trim() : '';
      let url = '';
      if(typeof portalParticipantStorageAvatarUrl === 'function'){
        url = portalParticipantStorageAvatarUrl(clientId, name) || '';
      }
      if(!url && typeof portalParticipantPhotoPathCandidates === 'function'){
        const candidates = portalParticipantPhotoPathCandidates(name, fromNote, clientId);
        url = candidates.length ? candidates[0] : '';
      }else if(!url && fromNote){
        url = fromNote;
      }else if(!url){
        url = clientPhotoUrl(name);
      }
      if(typeof portalNormalizeParticipantPhotoUrl === 'function') return portalNormalizeParticipantPhotoUrl(url) || '';
      return url || '';
    }
    function clientPhotoSlotPlaceholderHtml(name){
      name = String(name || '').trim();
      if(typeof portalParticipantInitials === 'function'){
        var init = escapeHtml(portalParticipantInitials(name));
        var gCls = typeof portalParticipantGenderClass === 'function'
          ? portalParticipantGenderClass(name, 'client-photo-slot--')
          : '';
        return '<span class="client-photo-slot-initials' + gCls + '">' + init + '</span>';
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    }
    function syncClientPhotoSlot(name, clientId){
      const slot = document.getElementById('clientPhotoSlot');
      if(!slot) return;
      const c = clientId && clientNotesById[clientId];
      const displayName = String((c && c.name) || name || '').trim();
      const url = resolveParticipantPhotoUrl(displayName, clientId);
      if(url){
        const norm = typeof portalNormalizeParticipantPhotoUrl === 'function'
          ? portalNormalizeParticipantPhotoUrl(url)
          : url;
        const existing = slot.querySelector('img');
        const existingSrc = existing ? String(existing.getAttribute('src') || existing.src || '') : '';
        if(existing && existingSrc && (existingSrc === norm || existingSrc.endsWith(norm) || norm.endsWith(existingSrc.split('?')[0]))){
          slot.classList.add('client-photo-slot--has-photo');
          return;
        }
        slot.classList.add('client-photo-slot--has-photo');
        slot.classList.remove('client-photo-slot--m', 'client-photo-slot--f');
        slot.setAttribute('data-participant-name', displayName);
        slot.innerHTML = '<img class="portal-screenshot-protected" src="' + escapeHtml(url) + '" alt="" loading="eager" fetchpriority="low" decoding="async" draggable="false" onerror="portalClientPhotoSlotFallback(this)">';
      } else {
        slot.classList.remove('client-photo-slot--has-photo');
        slot.classList.remove('client-photo-slot--m', 'client-photo-slot--f');
        const g = typeof portalParticipantGender === 'function' ? portalParticipantGender(displayName) : '';
        if(g === 'm') slot.classList.add('client-photo-slot--m');
        else if(g === 'f') slot.classList.add('client-photo-slot--f');
        slot.setAttribute('data-participant-name', displayName);
        slot.innerHTML = clientPhotoSlotPlaceholderHtml(displayName);
      }
    }
    window.portalClientPhotoSlotFallback = function(img){
      const slot = img && img.parentElement;
      if(!slot) return;
      slot.classList.remove('client-photo-slot--has-photo');
      const nm = String(slot.getAttribute('data-participant-name') || '').trim();
      slot.classList.remove('client-photo-slot--m', 'client-photo-slot--f');
      const g = typeof portalParticipantGender === 'function' ? portalParticipantGender(nm) : '';
      if(g === 'm') slot.classList.add('client-photo-slot--m');
      else if(g === 'f') slot.classList.add('client-photo-slot--f');
      slot.innerHTML = clientPhotoSlotPlaceholderHtml(nm);
    };
    /** Avatar inner HTML: initials always present; photo overlays them when on file. */
    function clientAvatarInner(name, clientId){
      const initials = escapeHtml(clientInitials(name));
      const url = resolveParticipantPhotoUrl(name, clientId);
      if(!url) return initials;
      var loadAttr = typeof portalParticipantPhotoLoadingAttr === 'function'
        ? portalParticipantPhotoLoadingAttr()
        : ' loading="eager" fetchpriority="low"';
      return initials + '<img class="clients-grid-avatar-img portal-screenshot-protected" src="' + escapeHtml(url) + '" alt=""' + loadAttr + ' decoding="async" draggable="false" onerror="this.remove()">';
    }
    /** Topbar: first token = given name line; remaining tokens = surname line. */
    function splitStaffTopbarName(fullName){
      const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return { given: '', surname: '' };
      if(parts.length === 1) return { given: parts[0], surname: '' };
      return { given: parts[0], surname: parts.slice(1).join(' ') };
    }
    function getPrimaryActivityForClient(clientId){
      const sid = String(STAFF_DASHBOARD_ID).toLowerCase();
      const row = sessionsModel.find(s =>
        String(s.staffId).toLowerCase() === sid &&
        s.clientId === clientId &&
        sessionModelStatus(s) === 'Scheduled'
      );
      return row ? String(row.activity || 'Swimming').trim() : 'Swimming';
    }
    /** Distinct activities on the schedule (same staff + client), without Bespoke on the service row */
    function getDistinctScheduledActivitiesForClient(clientId){
      if(!clientId || CLIENT_LIST_PSEUDO_IDS.includes(clientId)) return [];
      const sid = String(STAFF_DASHBOARD_ID).toLowerCase();
      const seen = new Set();
      const out = [];
      sessionsModel.forEach(s => {
        if(String(s.staffId).toLowerCase() !== sid) return;
        if(s.clientId !== clientId) return;
        if(sessionModelStatus(s) !== 'Scheduled') return;
        const raw = String(s.activity || 'Swimming').trim();
        if(isBespokeActivity(raw)) return;
        const canon = canonicalServiceActivityForSheet(raw);
        const key = canon.toLowerCase();
        if(seen.has(key)) return;
        seen.add(key);
        out.push(canon);
      });
      const rank = { swimming: 0, climbing: 1, fitness: 2 };
      out.sort((a, b) => {
        const ra = rank[a.toLowerCase()];
        const rb = rank[b.toLowerCase()];
        const ha = ra !== undefined;
        const hb = rb !== undefined;
        if(ha && hb) return ra - rb;
        if(ha) return -1;
        if(hb) return 1;
        return activityButtonCaption(a).localeCompare(activityButtonCaption(b), 'en');
      });
      return out;
    }
    function buildClientDirectorySheetItem(clientId, subtitleLine){
      const c = clientNotesById[clientId];
      if(!c) return null;
      const activity = getPrimaryActivityForClient(clientId);
      const showSpec = !isBespokeActivity(activity);
      const sheet = c.generalInfoSheet != null ? String(c.generalInfoSheet).trim() : '';
      const generalBody = sheet || String(c.generalLead || '').trim();
      return {
        kind: 'client',
        clientId,
        name: c.name,
        time: subtitleLine || 'Participant profile',
        general: generalBody,
        specialty: showSpec ? pickSpecialtyBody(c, activity) : (c.specialty || ''),
        activity,
        poolTier: null,
        showSpecialty: showSpec,
        specialtyLabel: specialtyInfoTitle(activity),
        openSheet: true
      };
    }
    const PORTAL_PARTICIPANTS_ALL_VIEWER_KEYS = new Set([
      'raul', 'victor', 'javier', 'javi', 'berta', 'john'
    ]);
    function portalStaffParticipantAccessKey(){
      const id = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const nm = String((window.dashboardData && window.dashboardData.staffName) || '').trim().toLowerCase();
      const first = nm.split(/\s+/).filter(Boolean)[0] || '';
      return id || first;
    }
