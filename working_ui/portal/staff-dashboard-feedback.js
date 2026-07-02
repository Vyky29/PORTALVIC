    const STAFF_DASH_FORCE_SESSIONS_ENDED = false;
    /**
     * Term calendar colour intro (blue / green / orange):
     * With `portalStaffIsDemoAccount()` + term demo visuals: single “Understood” + demo tag.
     * Otherwise: same note on first two visits to this sheet, then hide.
     */
    const STAFF_DASH_TERM_COLOR_INTRO_DEMO = true;
    /** On-screen reminders when same-day reviews are incomplete (local time): 19:30, 21:30, 23:30 */
    /** true = hide the “View” row (mobile/desktop toggle) in Quick menu → Settings when the dashboard is production-ready. */
    const STAFF_DASH_HIDE_DEV_VIEW_TOGGLE = false;
    const SESSION_REVIEW_REMINDER_STORAGE = 'staffSessionReviewReminder_v1';
    /** Persisted register/feedback flags so returning from session_feedback.html keeps row colours. */
    const PORTAL_SESSION_REVIEW_MAP_STORAGE = 'portalSessionReviewMap_v1';
    /** Same folder as auth-handler on the CDN; used to pull server-side review keys onto this device. */
    const PORTAL_SUPABASE_CLIENT_MODULE = '/portal/supabase-client.js?v=20260704-peer-shared-feedback';
    /**
     * Web Push (app closed / phone locked): VAPID **public** key only — generate pair with `npx web-push generate-vapid-keys`,
     * put public key here (or `window.__PORTAL_VAPID_PUBLIC_KEY__` on the host page); private key lives in Supabase Edge secrets only.
     */
    const PORTAL_VAPID_PUBLIC_KEY = (typeof window !== 'undefined' && window.__PORTAL_VAPID_PUBLIC_KEY__)
      ? String(window.__PORTAL_VAPID_PUBLIC_KEY__).trim()
      : '';
    /** If nothing was saved for ~25 minutes on any session, assume idle rather than “still working”. */
    const SESSION_REVIEW_RECENT_ACTIVITY_MS = 25 * 60 * 1000;
    const TERM_COLOR_INTRO_STORAGE_DEMO = 'staffTermCalColorIntroDemoAck_v1';
    const TERM_COLOR_INTRO_STORAGE_COUNT = 'staffTermCalColorIntroDismissCount_v1';
    const TERM_COLOR_INTRO_BODY_MAIN =
      'Blue: before your last session ends, or within 3 hours after shift end while feedback is still due.\n\n'
      + 'Orange: after shift end + 3 hours if any register/feedback is still incomplete (same cue as Today / This week) — tap the day to complete reviews.\n\n'
      + 'Green: all feedback for that day is done.\n\n'
      + 'Purple: every session that day is marked cancelled.\n\n'
      + 'Reminders from 30 minutes after shift end; admins are notified if register/feedback is not completed on time.';
    /** Session review row colours (green/orange/red/purple); flags also in localStorage (see PORTAL_SESSION_REVIEW_MAP_STORAGE). */
    const sessionReviewMapMemory = {};
    /** Last time a review was touched (Quick actions); used for reminder tone. */
    const sessionReviewActivityTs = {};

    function portalStaffInGhostView(){
      return !!(typeof window !== 'undefined' && window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active);
    }
    function portalSessionReviewMapStorageKey(staffId){
      const sid = String(
        staffId != null ? staffId : (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '')
      ).trim().toLowerCase();
      return sid ? (PORTAL_SESSION_REVIEW_MAP_STORAGE + ':' + sid) : PORTAL_SESSION_REVIEW_MAP_STORAGE;
    }
    function portalClearSessionReviewMapMemory(){
      Object.keys(sessionReviewMapMemory).forEach(function(k){ delete sessionReviewMapMemory[k]; });
      Object.keys(sessionReviewActivityTs).forEach(function(k){ delete sessionReviewActivityTs[k]; });
    }
    function hydrateSessionReviewMapFromStorage(staffIdOverride){
      portalClearSessionReviewMapMemory();
      try{
        const storageKey = portalSessionReviewMapStorageKey(staffIdOverride);
        let raw = localStorage.getItem(storageKey);
        if(!raw && staffIdOverride && !portalStaffInGhostView()){
          const legacy = localStorage.getItem(PORTAL_SESSION_REVIEW_MAP_STORAGE);
          if(legacy){
            raw = legacy;
            try{ localStorage.setItem(storageKey, legacy); }catch(_){}
          }
        }
        if(!raw) return;
        const o = JSON.parse(raw);
        if(!o || typeof o !== 'object') return;
        Object.keys(o).forEach(function(k){
          const v = o[k];
          if(!v || typeof v !== 'object') return;
          sessionReviewMapMemory[k] = {
            feedbackDone: !!v.feedbackDone,
            incident: !!v.incident,
            absent: !!v.absent,
            cancelled: !!v.cancelled
          };
        });
      }catch(e){}
    }
    function persistSessionReviewMap(){
      try{
        localStorage.setItem(portalSessionReviewMapStorageKey(), JSON.stringify(sessionReviewMapMemory));
      }catch(e){}
    }
    /** Roster review keys for Supabase sync (today list + full term window for this staff). */
    function portalPrioritizeRosterReviewKeysForSync(keyList){
      const today = typeof portalLondonTodayIso === 'function' ? portalLondonTodayIso() : '';
      const uniq = [...new Set((keyList || []).map(function(k){
        return String(k || '').trim();
      }).filter(Boolean))];
      uniq.sort(function(a, b){
        const da = String(a.split('|')[0] || '');
        const db = String(b.split('|')[0] || '');
        if(today){
          if(da === today && db !== today) return -1;
          if(db === today && da !== today) return 1;
        }
        return db.localeCompare(da);
      });
      return uniq.slice(0, 800);
    }
    function portalCollectRosterSessionKeysForReviewSync(){
      const keys = new Set();
      try{
        const dd = typeof window !== 'undefined' && window.dashboardData;
        const today = dd && Array.isArray(dd.today) ? dd.today : [];
        for(let i = 0; i < today.length; i++){
          const it = today[i];
          if(!it || it.kind !== 'client') continue;
          const sk = String(it.sessionKey || '').trim();
          if(sk) keys.add(sk);
        }
        const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        if(!staffId || !Array.isArray(sessionsModel)) return portalPrioritizeRosterReviewKeysForSync([...keys]);
        const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
        const isReal = function(s, iso){
          if(baseReal) return baseReal(s, iso);
          const st = String(s.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(s.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const addDay = function(dayWord, sessionDateKey){
          const rel = typeof portalTermFeedbackSessionsForDate === 'function'
            ? portalTermFeedbackSessionsForDate(dayWord, sessionDateKey, staffId, isReal)
            : [];
          for(let j = 0; j < rel.length; j++){
            const s = rel[j];
            const rk = typeof portalSessionReviewKeyForModelRow === 'function'
              ? portalSessionReviewKeyForModelRow(s, dayWord, sessionDateKey)
              : `${sessionDateKey}|${s.start}|${s.clientId}`;
            if(rk) keys.add(rk);
            const cidAlias = typeof portalEffectiveClientIdForReview === 'function'
              ? portalEffectiveClientIdForReview(s, sessionDateKey)
              : String(s.clientId || '').trim().toLowerCase();
            if(cidAlias && !(typeof portalSessionNeedsPerStaffOwnFeedbackOnly === 'function'
              && portalSessionNeedsPerStaffOwnFeedbackOnly(s, sessionDateKey))
              && (typeof portalStaffLeadReviewKeyAllowsDateClientOnlyAlias !== 'function'
              || portalStaffLeadReviewKeyAllowsDateClientOnlyAlias(s, sessionDateKey, dayWord))){
              keys.add(`${sessionDateKey}||${cidAlias}`);
            }
            if(typeof portalRosterSessionIsBespokeShared === 'function' && portalRosterSessionIsBespokeShared(s)){
              const cid = typeof portalEffectiveClientIdForReview === 'function'
                ? portalEffectiveClientIdForReview(s, sessionDateKey)
                : String(s.clientId || '').trim().toLowerCase();
              if(cid){
                keys.add(`${sessionDateKey}|${cid}|bespoke_shared`);
                keys.add(`${sessionDateKey}||${cid}`);
                keys.add(`${sessionDateKey}||${cid}|hub_room`);
              }
            }
            if(typeof portalRosterSessionIsDayCentre === 'function' && portalRosterSessionIsDayCentre(s)){
              const cid = typeof portalEffectiveClientIdForReview === 'function'
                ? portalEffectiveClientIdForReview(s, sessionDateKey)
                : String(s.clientId || '').trim().toLowerCase();
              if(cid){
                keys.add(`${sessionDateKey}|${cid}|day_centre`);
                keys.add(`${sessionDateKey}||${cid}`);
              }
            }
            if(typeof portalStaffFeedbackMergeGroupForTodayItem === 'function'){
              const pseudoItem = {
                kind: 'client',
                clientId: s.clientId,
                activity: s.activity || s.rosterService,
                time: s.timeSlotLabel,
                __portalBaseSession: s
              };
              const mg = portalStaffFeedbackMergeGroupForTodayItem(pseudoItem, dayWord, staffId);
              if(mg) keys.add(`${sessionDateKey}|merge|${mg}`);
            }
          }
        };
        const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        if(viewDay){
          const anchor = typeof getViewAnchorCalendarDate === 'function' ? getViewAnchorCalendarDate(viewDay) : null;
          if(anchor && !isNaN(anchor.getTime())){
            const sessionDateKey = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(anchor.getDate()).padStart(2, '0')}`;
            addDay(viewDay, sessionDateKey);
          }
        }
        const t = window.PORTAL_TERM_FROM_TIMETABLE;
        if(t && t.firstDate && t.lastDate){
          const cur = new Date(String(t.firstDate) + 'T12:00:00');
          const last = new Date(String(t.lastDate) + 'T12:00:00');
          const todayIso = portalTermLocalYmdFromMs(termCalendarNowMs());
          while(cur.getTime() <= last.getTime()){
            const sessionDateKey = termCalendarDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate());
            if(sessionDateKey <= todayIso){
              const dayWord = cur.toLocaleDateString('en-GB', { weekday: 'long' });
              addDay(dayWord, sessionDateKey);
            }
            cur.setDate(cur.getDate() + 1);
          }
        }
      }catch(_){}
      return portalPrioritizeRosterReviewKeysForSync([...keys]);
    }
    function portalSessionIsSundayInstructorCover(s){
      return !!(s && s.__portalSundayInstructorCover);
    }
    /** Sunday SwimFarm hub↔pool pairs (Godsway↔Roberto, Giuseppe↔Javier, John↔Dan): each instructor owns their slots. */
    function portalSessionIsSundaySwimfarmPerStaffFeedback(s, iso){
      if(!s) return false;
      const day = String(s.day || '').trim()
        || (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : '');
      if(day !== 'Sunday') return false;
      if(String(s.venue || '').trim().toLowerCase() !== 'swimfarm') return false;
      const act = String(s.activity || s.rosterService || s.service || '').trim().toLowerCase();
      if(/multi[-\s]?activity/.test(act)) return true;
      if(act.indexOf('climbing') >= 0 || act.indexOf('climb') >= 0) return true;
      if(act.indexOf('aquatic') >= 0 || act.indexOf('swimming') >= 0) return true;
      return false;
    }
    /** Substitute cover, SwimFarm Sunday slots, climbing, Multi-Activity or Aquatic/teaching-pool
        — only this staff's own Supabase rows may mark green. Day Centre and Bespoke shared remain
        the only sessions a co-worker's submission validates. */
    function portalSessionNeedsPerStaffOwnFeedbackOnly(s, iso){
      if(portalSessionIsSundayInstructorCover(s)) return true;
      if(portalSessionIsSundaySwimfarmPerStaffFeedback(s, iso)) return true;
      const act = String((s && (s.activity || s.rosterService || s.service)) || '').toLowerCase();
      if(/day\s*centre/.test(act)) return false;
      if(typeof portalRosterSessionIsBespokeShared === 'function' && portalRosterSessionIsBespokeShared(s)) return false;
      if(act.indexOf('climbing') >= 0 || act.indexOf('climb') >= 0) return true;
      /* A support worker's Multi-Activity submission must not paint the instructor's teaching-pool
         (Aquatic) slot green, and vice-versa — each worker owns their own feedback for these. Only
         Day Centre (anyone with the client during the 11am-4pm window) and Bespoke shared sessions
         are validated by a co-worker's submission. */
      if(/multi[-\s]?activity/.test(act)) return true;
      if(act.indexOf('aquatic') >= 0 || act.indexOf('swimming') >= 0) return true;
      /* Physical Activity (gym / fitness): each instructor owns their own feedback — a co-worker's
         submission for the same participant must not paint another instructor's slot green. */
      if(act.indexOf('physical activit') >= 0 || act.indexOf('fitness') >= 0 || act === 'gym') return true;
      return false;
    }
    function portalAppendPerStaffOwnKeysForDate(keys, iso, staffId){
      if(!staffId || !iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).slice(0, 10))) return;
      const dayWord = new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      const rel = typeof portalTermFeedbackSessionsForDate === 'function'
        ? portalTermFeedbackSessionsForDate(dayWord, iso, staffId, function(s){
            if(!portalSessionNeedsPerStaffOwnFeedbackOnly(s, iso)) return false;
            const st = String(s.status || '').toLowerCase();
            if(st === 'closed' || st === 'available') return false;
            return Boolean(String(s.clientId || '').trim());
          })
        : [];
      rel.forEach(function(s){
        const rk = typeof portalSessionReviewKeyForModelRow === 'function'
          ? portalSessionReviewKeyForModelRow(s, dayWord, iso)
          : '';
        if(rk) keys.add(rk);
      });
    }
    function portalCollectPerStaffOwnFeedbackOnlyKeys(iso){
      const keys = new Set();
      const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      if(!staffId || !iso) return [];
      portalAppendPerStaffOwnKeysForDate(keys, String(iso).slice(0, 10), staffId);
      try{
        const dd = typeof window !== 'undefined' && window.dashboardData;
        const today = dd && Array.isArray(dd.today) ? dd.today : [];
        const wantIso = String(iso).slice(0, 10);
        for(let i = 0; i < today.length; i++){
          const it = today[i];
          const base = it && (it.__portalBaseSession || null);
          const itemIso = String(it.sessionDate || it.iso || wantIso || '').trim().slice(0, 10);
          if(itemIso && itemIso !== wantIso) continue;
          if(!base || !portalSessionNeedsPerStaffOwnFeedbackOnly(base, itemIso || wantIso)) continue;
          const sk = String(it.sessionKey || '').trim();
          if(sk) keys.add(sk);
        }
      }catch(_){}
      return [...keys].slice(0, 200);
    }
    /** All term dates ≤ today (plus catch-up) — peer fan-out must not paint Sunday pairs green on past Sundays. */
    function portalCollectAllPerStaffOwnFeedbackOnlyKeys(catchUpDates){
      const keys = new Set();
      const staffId = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      if(!staffId) return [];
      const dates = new Set();
      const todayIso = typeof portalLondonTodayIso === 'function' ? portalLondonTodayIso() : '';
      if(todayIso) dates.add(todayIso);
      (catchUpDates || []).forEach(function(d){
        const iso = String(d || '').trim().slice(0, 10);
        if(iso) dates.add(iso);
      });
      try{
        const t = window.PORTAL_TERM_FROM_TIMETABLE;
        if(t && t.firstDate && t.lastDate){
          const cur = new Date(String(t.firstDate) + 'T12:00:00');
          const last = new Date(String(t.lastDate) + 'T12:00:00');
          while(cur.getTime() <= last.getTime()){
            const dk = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
            if(!todayIso || dk <= todayIso) dates.add(dk);
            cur.setDate(cur.getDate() + 1);
          }
        }
      }catch(_){}
      dates.forEach(function(iso){
        portalCollectPerStaffOwnFeedbackOnlyKeys(iso).forEach(function(k){ keys.add(k); });
      });
      return [...keys].slice(0, 600);
    }
    function portalTodayItemIsSundayInstructorCover(item){
      const base = item && (item.__portalBaseSession || portalReviewSessionForItem(item));
      return portalSessionIsSundayInstructorCover(base);
    }
    function portalTodayItemNeedsPerStaffOwnFeedbackOnly(item, iso){
      const base = item && (item.__portalBaseSession || portalReviewSessionForItem(item));
      return portalSessionNeedsPerStaffOwnFeedbackOnly(base, iso);
    }
    function portalStaffMatchesStatusInstructor(staffId, instructor){
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      if(bridge && typeof bridge.staffOwnsInstructor === 'function'){
        return bridge.staffOwnsInstructor(staffId, instructor);
      }
      const sidRaw = String(staffId || '').trim().toLowerCase();
      const sid = typeof window.portalCanonicalStaffRosterKey === 'function'
        ? (window.portalCanonicalStaffRosterKey(sidRaw) || sidRaw)
        : (sidRaw === 'luliya' || sidRaw === 'aida' || sidRaw === 'stf021' ? 'lulia' : sidRaw);
      const blob = String(instructor || '').trim();
      if(!sid || !blob) return false;
      const parts = blob.split(/[,/&]+|\s+and\s+/gi);
      for(let i = 0; i < parts.length; i++){
        const pRaw = String(parts[i] || '').trim().toLowerCase();
        if(!pRaw) continue;
        const firstRaw = (pRaw.split(/\s+/)[0] || '').trim();
        const p = pRaw === 'luliya' ? 'lulia' : pRaw;
        const first = firstRaw === 'luliya' ? 'lulia' : firstRaw;
        if(sid === 'javi' && (first === 'javier' || p === 'javier')) continue;
        if(sid === 'javier' && (first === 'javi' || p === 'javi')) continue;
        if(p === sid || first === sid) return true;
        if(sid === 'youssef' && (first === 'yousef' || first === 'yusef' || first === 'yousseff')) return true;
      }
      return false;
    }
    /** Roster instructor column or whoever submitted feedback (matchedFeedbackBy). */
    function portalStaffOwnsFeedbackStatusRow(staffId, st){
      if(!st) return false;
      return portalStaffMatchesStatusInstructor(staffId, st.instructor)
        || portalStaffMatchesStatusInstructor(staffId, st.matchedFeedbackBy);
    }
    function portalSlugifyClientKey(value){
      return String(value || '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }
    function portalStaffOwnsSundayFeedbackMergeSlot(s, weekday, sessionDateIso){
      try{
        const src = typeof window !== 'undefined' ? window.STAFF_DASHBOARD_SOURCE : null;
        const merges = src && Array.isArray(src.sundayFeedbackMerges) ? src.sundayFeedbackMerges : [];
        if(!merges.length || !s) return true;
        const sid = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        const day = String(weekday || s.day || '').trim();
        const slug = portalRosterClientLabelForMatch(s) || portalSlugifyClientKey(s.clientId);
        const ts = String(s.timeSlotLabel || '').trim();
        const svc = String(s.rosterService || s.activity || '').trim();
        const iso = String(
          sessionDateIso || s.session_date || s.sessionDate || ''
        ).trim().slice(0, 10);
        for(let i = 0; i < merges.length; i++){
          const m = merges[i];
          if(m.day && String(m.day).trim() !== day) continue;
          if(portalSlugifyClientKey(m.client_name) !== slug) continue;
          const sub = Array.isArray(m.slots) ? m.slots : [];
          for(let j = 0; j < sub.length; j++){
            const sl = sub[j];
            if(sl.time_slot && String(sl.time_slot).trim() !== ts) continue;
            if(sl.service && String(sl.service).trim() !== svc) continue;
            if(!sid) return true;
            const inst = String(m.instructors || '').trim();
            if(!inst) return true;
            if(typeof window !== 'undefined'
              && typeof window.portalStaffMatchesFeedbackMergeInstructors === 'function'){
              return window.portalStaffMatchesFeedbackMergeInstructors(inst, sid, {
                sessionDateIso: iso,
                clientSlug: slug
              });
            }
            const instU = inst.toUpperCase();
            if(instU.indexOf(sid.toUpperCase()) >= 0) return true;
            if(sid === 'roberto' && instU.indexOf('ROBERTO') >= 0) return true;
            if(sid === 'javier' && instU.indexOf('JAVIER') >= 0) return true;
            return false;
          }
        }
      }catch(_){}
      return true;
    }
    /** Hide merged duplicate slots on Today (e.g. Cyrus Aquatic 4–4.30 when MA pool row covers swimming). */
    function portalStaffDashboardOmitSpreadsheetSession(s, weekday, sessionDateIso){
      try{
        const src = typeof window !== 'undefined' ? window.STAFF_DASHBOARD_SOURCE : null;
        const rules = src && Array.isArray(src.overviewOmitRosterSlots) ? src.overviewOmitRosterSlots : [];
        if(!rules.length || !s) return false;
        const day = String(weekday || s.day || '').trim();
        const slug = portalRosterClientLabelForMatch(s) || portalSlugifyClientKey(s.clientId);
        const ts = String(s.timeSlotLabel || '').trim();
        const svc = String(s.rosterService || s.activity || '').trim();
        const iso = String(
          sessionDateIso || s.session_date || s.sessionDate || ''
        ).trim().slice(0, 10);
        for(let i = 0; i < rules.length; i++){
          const r = rules[i];
          if(r.weekday && String(r.weekday).trim() !== day) continue;
          if(r.client_slug && portalSlugifyClientKey(r.client_slug) !== slug) continue;
          if(r.time_slot && String(r.time_slot).trim() !== ts) continue;
          if(r.service && String(r.service).trim() !== svc) continue;
          if(!portalStaffOwnsSundayFeedbackMergeSlot(s, day, iso)) return false;
          return true;
        }
      }catch(_){}
      return false;
    }
    function portalRosterClientLabelForMatch(s){
      const cid = String(s && s.clientId || '').trim().toLowerCase();
      if(!cid || cid === 'closed' || cid === 'available') return '';
      try{
        const notes = typeof clientNotesById !== 'undefined' ? clientNotesById[cid] : null;
        const name = notes && String(notes.name || '').trim();
        if(name) return portalSlugifyClientKey(name);
      }catch(_){}
      return portalSlugifyClientKey(cid);
    }
    function portalStatusRowMatchesRosterClient(st, s){
      const rosterKey = portalRosterClientLabelForMatch(s);
      const statusKey = portalSlugifyClientKey(st && (st.client || st.clientName));
      if(!rosterKey || !statusKey) return false;
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      if(bridge && typeof bridge.clientSlugTokensEquivalent === 'function'){
        return bridge.clientSlugTokensEquivalent(rosterKey, statusKey);
      }
      return rosterKey === statusKey;
    }
    function portalStatusRowMatchesRosterSession(st, s){
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
      if(bridge && typeof bridge.statusRowMatchesRosterSession === 'function'){
        return bridge.statusRowMatchesRosterSession(st, s, notes);
      }
      return portalStatusRowMatchesRosterClient(st, s);
    }
    function portalStatusRowIsDoneForCalendar(st){
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      if(bridge && typeof bridge.statusRowDone === 'function') return bridge.statusRowDone(st);
      return st && (String(st.overviewStatus || '').trim().toLowerCase() === 'absent' || st.feedbackComplete === true
        || String(st.overviewStatus || '').trim().toLowerCase() === 'feedback_submitted');
    }
    /** Green session row + chip from portal status export (absent / cancelled / submitted). */
    function portalFlagsFromStatusBundleRow(st){
      if(!st || !portalStatusRowIsDoneForCalendar(st)) return null;
      const os = String(st.overviewStatus || '').trim().toLowerCase();
      if(os === 'absent') return { feedbackDone: false, incident: false, absent: true, cancelled: false };
      if(os === 'cancelled') return { feedbackDone: false, incident: false, absent: false, cancelled: true };
      return { feedbackDone: true, incident: false, absent: false, cancelled: false };
    }
    function portalMachineRosterFeedbackFloorIso(){
      try{
        const t = typeof window !== 'undefined' ? window.PORTAL_TERM_FROM_TIMETABLE : null;
        if(t){
          const reminder = String(t.termFeedbackReminderFromIso || '').trim().slice(0, 10);
          if(/^\d{4}-\d{2}-\d{2}$/.test(reminder)) return reminder;
          const v = String(t.termResumeDate || t.termDashboardCalendarFrom || '').trim().slice(0, 10);
          if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        }
      }catch(_){}
      return '2026-06-25';
    }
    function portalTermFeedbackAssumeComplete(isoYmd, staffId){
      const ptd = window.PortalTermCalendarDashboard;
      if(ptd && typeof ptd.feedbackAssumeComplete === 'function'){
        return !!ptd.feedbackAssumeComplete(isoYmd, staffId);
      }
      return false;
    }
    function portalReviewFlagsForResolvedSession(iso, staffId, s){
      const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
      const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
      if(bridge && typeof bridge.reviewFlagsForResolvedSession === 'function'){
        return bridge.reviewFlagsForResolvedSession(iso, staffId, s, notes);
      }
      const absent = bridge && typeof bridge.rosterSessionMarkedAbsent === 'function'
        && bridge.rosterSessionMarkedAbsent(iso, staffId, s, notes);
      return { feedbackDone: !absent, incident: false, absent: !!absent, cancelled: false };
    }
    /** Authoritative completion from SESSION_FEEDBACK_STATUS_PORTAL_SOURCE for one roster row. */
    function portalRosterReviewStateFromStatusBundle(s, sessionDateIso, staffId){
      try{
        const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
        if(bridge && typeof bridge.sessionComplete === 'function'){
          const iso = String(sessionDateIso || '').trim().substring(0, 10);
          const sid = String(staffId || '').trim().toLowerCase();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid || !s) return null;
          const exemptResolved = typeof portalRosterSessionFeedbackResolvedFlags === 'function'
            ? portalRosterSessionFeedbackResolvedFlags(s, iso, sid)
            : null;
          if(exemptResolved) return exemptResolved;
          const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
          const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
          const memOnly = (function(){
            const o = { feedbackDone: false, incident: false, absent: false, cancelled: false };
            const ingest = function(rec){
              if(!rec) return;
              if(rec.feedbackDone) o.feedbackDone = true;
              if(rec.incident) o.incident = true;
              if(rec.absent) o.absent = true;
              if(rec.cancelled) o.cancelled = true;
            };
            const tryK = function(k){
              if(!k) return;
              ingest(getSessionReviewRecord({ sessionKey: k }));
            };
            if(typeof portalSessionReviewKeyForModelRow === 'function'){
              tryK(portalSessionReviewKeyForModelRow(s, dayWord, iso));
            }
            const cid = typeof portalEffectiveClientIdForReview === 'function'
              ? portalEffectiveClientIdForReview(s, iso)
              : String(s && s.clientId || '').trim().toLowerCase();
            const tc = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(s && s.start) : '';
            const tr = String(s && s.start != null ? s.start : '').trim();
            if(cid && tc) tryK(iso + '|' + tc + '|' + cid);
            if(cid && tr && tr !== tc) tryK(iso + '|' + tr + '|' + cid);
            if(cid && !(typeof portalSessionNeedsPerStaffOwnFeedbackOnly === 'function'
              && portalSessionNeedsPerStaffOwnFeedbackOnly(s, iso))
              && (typeof portalStaffLeadReviewKeyAllowsDateClientOnlyAlias !== 'function'
              || portalStaffLeadReviewKeyAllowsDateClientOnlyAlias(s, iso, dayWord))){
              tryK(iso + '||' + cid);
            }
            return o;
          })();
          if(memOnly.absent || memOnly.cancelled){
            return {
              feedbackDone: false,
              incident: !!memOnly.incident,
              absent: !!memOnly.absent,
              cancelled: !!memOnly.cancelled
            };
          }
          if(memOnly.feedbackDone){
            if(dashboardData && dashboardData.portalFeedbackServerSynced){
              if(!portalIsServerTruthFeedbackDay(iso)){
                if(typeof portalTermFeedbackAssumeComplete === 'function'
                  && portalTermFeedbackAssumeComplete(iso, sid)){
                  return portalReviewFlagsForResolvedSession(iso, sid, s);
                }
                if(typeof portalFeedbackReminderDayInScope === 'function'
                  && !portalFeedbackReminderDayInScope(iso)){
                  return portalReviewFlagsForResolvedSession(iso, sid, s);
                }
                const sk = typeof portalSessionReviewKeyForModelRow === 'function'
                  ? portalSessionReviewKeyForModelRow(s, dayWord, iso) : '';
                const pseudo = { sessionKey: sk, __portalBaseSession: s };
                const aliases = typeof portalCollectItemSessionReviewKeyAliases === 'function'
                  ? portalCollectItemSessionReviewKeyAliases(pseudo, iso, dayWord)
                  : (sk ? [sk] : []);
                const needsOwn = portalSessionNeedsPerStaffOwnFeedbackOnly(s, iso);
                const serverOk = typeof portalReviewFeedbackFromServerForAliases === 'function'
                  && portalReviewFeedbackFromServerForAliases(aliases, needsOwn);
                const bridgeOk = bridge.sessionComplete(iso, sid, s, notes, {
                  feedbackDone: false, incident: false, absent: false, cancelled: false
                });
                if(serverOk || bridgeOk){
                  return portalReviewFlagsForResolvedSession(iso, sid, s);
                }
                if(memOnly.feedbackDone){
                  return portalReviewFlagsForResolvedSession(iso, sid, s);
                }
                return {
                  feedbackDone: false,
                  incident: !!memOnly.incident,
                  absent: false,
                  cancelled: false
                };
              }
              /* Today+: Supabase fan-out is authoritative — stale mem must not force green. */
            } else if(bridge.sessionComplete(iso, sid, s, notes, memOnly)){
              return portalReviewFlagsForResolvedSession(iso, sid, s);
            }
          } else if(bridge.sessionComplete(iso, sid, s, notes, memOnly)){
            return portalReviewFlagsForResolvedSession(iso, sid, s);
          }
          const src = window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE;
          if(src && Array.isArray(src.rows)){
            for(let si = 0; si < src.rows.length; si++){
              const stDone = src.rows[si];
              if(String(stDone.date || '').trim().substring(0, 10) !== iso) continue;
              if(!portalStaffOwnsFeedbackStatusRow(sid, stDone)) continue;
              if(bridge.statusRowMatchesRosterSession && !bridge.statusRowMatchesRosterSession(stDone, s, notes)) continue;
              const osDone = String(stDone.overviewStatus || '').trim().toLowerCase();
              if(osDone === 'absent' || osDone === 'cancelled'){
                const doneFlags = portalFlagsFromStatusBundleRow(stDone);
                if(doneFlags) return doneFlags;
                continue;
              }
              if(bridge.statusSlotResolved && bridge.statusSlotResolved(iso, stDone, sid)){
                return portalReviewFlagsForResolvedSession(iso, sid, s);
              }
            }
          }
          const floorIso = portalMachineRosterFeedbackFloorIso();
          if(iso >= floorIso){
            if(typeof portalTermStaffDayExplicitlyForceComplete === 'function'
              && portalTermStaffDayExplicitlyForceComplete(iso, sid)){
              return { feedbackDone: true, incident: false, absent: false, cancelled: false };
            }
            let staffStatusOnDay = 0;
            if(src && Array.isArray(src.rows)){
              src.rows.forEach(function(st){
                if(String(st.date || '').trim().substring(0, 10) !== iso) return;
                if(!portalStaffOwnsFeedbackStatusRow(sid, st)) return;
                staffStatusOnDay++;
              });
            }
            if(!staffStatusOnDay) return null;
            return null;
          }
          return null;
        }
        const src = typeof window !== 'undefined' ? window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE : null;
        if(!src || !Array.isArray(src.rows) || !s) return null;
        const iso = String(sessionDateIso || '').trim().substring(0, 10);
        const sid = String(staffId || '').trim().toLowerCase();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid) return null;
        const exemptResolved = typeof portalRosterSessionFeedbackResolvedFlags === 'function'
          ? portalRosterSessionFeedbackResolvedFlags(s, iso, sid)
          : null;
        if(exemptResolved) return exemptResolved;
        const matches = [];
        src.rows.forEach(function(st){
          if(String(st.date || '').trim().substring(0, 10) !== iso) return;
          if(!portalStaffOwnsFeedbackStatusRow(sid, st)) return;
          if(!portalStatusRowMatchesRosterClient(st, s)) return;
          matches.push(st);
        });
        if(!matches.length) return null;
        const clientKey = portalRosterClientLabelForMatch(s);
        const dayCentre = matches.some(function(st){
          const u = String(st.feedbackUnitKey || '');
          return u.indexOf('day_centre') >= 0 || /day\s*centre/i.test(String(st.service || ''));
        });
        if(dayCentre && clientKey){
          const allDay = src.rows.filter(function(st){
            return String(st.date || '').trim().substring(0, 10) === iso
              && portalStaffOwnsFeedbackStatusRow(sid, st)
              && portalSlugifyClientKey(st.client) === clientKey
              && (String(st.feedbackUnitKey || '').indexOf('day_centre') >= 0 || /day\s*centre/i.test(String(st.service || '')));
          });
          if(allDay.some(portalStatusRowIsDoneForCalendar)) {
            return portalReviewFlagsForResolvedSession(iso, sid, s);
          }
          if(typeof window !== 'undefined' && window.SESSION_FEEDBACK_PORTAL_SOURCE && Array.isArray(window.SESSION_FEEDBACK_PORTAL_SOURCE.rows)){
            const fbHit = window.SESSION_FEEDBACK_PORTAL_SOURCE.rows.find(function(r){
              return String(r.date || '').trim().substring(0, 10) === iso
                && portalSlugifyClientKey(r.clientName) === clientKey;
            });
            if(fbHit) return portalReviewFlagsForResolvedSession(iso, sid, s);
          }
        }
        const bespokeShared = portalRosterSessionIsBespokeShared(s) || matches.some(function(st){
          const u = String(st.feedbackUnitKey || '');
          return u.indexOf('bespoke_shared') >= 0;
        });
        if(bespokeShared && clientKey){
          if(typeof window !== 'undefined' && window.SESSION_FEEDBACK_PORTAL_SOURCE && Array.isArray(window.SESSION_FEEDBACK_PORTAL_SOURCE.rows)){
            const fbShared = window.SESSION_FEEDBACK_PORTAL_SOURCE.rows.find(function(r){
              if(String(r.date || '').trim().substring(0, 10) !== iso) return false;
              const rKey = portalSlugifyClientKey(r.clientName);
              if(rKey !== clientKey && rKey.indexOf(clientKey) < 0 && clientKey.indexOf(rKey) < 0) return false;
              const att = String(r.attendance != null ? r.attendance : '').trim().toLowerCase();
              if(att === 'no' || att === 'n') return false;
              return /bespoke/i.test(String(r.service || ''));
            });
            if(fbShared) return portalReviewFlagsForResolvedSession(iso, sid, s);
          }
          const sharedDone = src.rows.some(function(st){
            if(String(st.date || '').trim().substring(0, 10) !== iso) return false;
            if(!portalStaffOwnsFeedbackStatusRow(sid, st)) return false;
            if(portalSlugifyClientKey(st.client) !== clientKey) return false;
            if(!/bespoke/i.test(String(st.service || ''))) return false;
            return portalStatusRowIsDoneForCalendar(st);
          });
          if(sharedDone) return portalReviewFlagsForResolvedSession(iso, sid, s);
        }
        const mg = matches.map(function(st){ return String(st.feedbackMergeGroup || '').trim(); }).find(Boolean);
        if(mg){
          const groupRowDone = function(st){
            if(bridge && typeof bridge.statusSlotResolved === 'function'){
              return bridge.statusSlotResolved(iso, st, sid);
            }
            return portalStatusRowIsDoneForCalendar(st);
          };
          const groupDone = src.rows.some(function(st){
            return String(st.date || '').trim().substring(0, 10) === iso
              && String(st.feedbackMergeGroup || '').trim() === mg
              && portalStaffOwnsFeedbackStatusRow(sid, st)
              && groupRowDone(st);
          });
          if(groupDone){
            return portalReviewFlagsForResolvedSession(iso, sid, s);
          }
        }
        if(matches.some(function(st){
          if(!portalStatusRowMatchesRosterSession(st, s)) return false;
          /* Per-slot Aquatic / Climbing / Multi-Activity: each worker owns their own feedback.
             A co-instructor's submission (stamped on the participant via matchedFeedbackBy) must
             not complete this worker's slot — defer to the bridge's per-worker resolution. */
          if(bridge && typeof bridge.statusSlotResolved === 'function'){
            return bridge.statusSlotResolved(iso, st, sid);
          }
          return portalStatusRowIsDoneForCalendar(st);
        })){
          return portalReviewFlagsForResolvedSession(iso, sid, s);
        }
        if(matches.some(function(st){ return !portalStatusRowIsDoneForCalendar(st); })){
          return { feedbackDone: false, incident: false, absent: false, cancelled: false };
        }
        return null;
      }catch(_){
        return null;
      }
    }
    function portalLondonTodayIso(){
      try{
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(new Date());
        const y = parts.find(function(p){ return p.type === 'year'; });
        const m = parts.find(function(p){ return p.type === 'month'; });
        const d = parts.find(function(p){ return p.type === 'day'; });
        if(y && m && d) return y.value + '-' + m.value + '-' + d.value;
      }catch(_){}
      return '';
    }
    function portalIsServerTruthFeedbackDay(iso){
      const today = portalLondonTodayIso();
      return !!(iso && today && iso >= today);
    }
    /** Feedback chips stay neutral until export bundle + Supabase sync finish — avoids Pending→green flips. */
    function portalStaffFeedbackPipelineReady(){
      return !!(dashboardData && dashboardData.portalFeedbackPipelineReady);
    }
    window.portalStaffFeedbackPipelineReady = portalStaffFeedbackPipelineReady;
    function portalStaffFinishFeedbackPipelineReady(opts){
      opts = opts && typeof opts === 'object' ? opts : {};
      try{
        if(dashboardData){
          if(opts.serverSynced !== false) dashboardData.portalFeedbackServerSynced = true;
          dashboardData.portalFeedbackReconciled = true;
          dashboardData.portalFeedbackPipelineReady = true;
        }
        if(typeof document !== 'undefined' && document.body){
          document.body.classList.remove('staff-dashboard-feedback-syncing');
        }
        if(typeof portalInvalidateReminderStateCache === 'function') portalInvalidateReminderStateCache();
      }catch(_){}
    }
    function portalStaffRefreshFeedbackDependentUi(){
      try{
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
      }catch(_){}
      if(typeof renderToday === 'function') renderToday();
      if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid();
      if(typeof renderMiniCounts === 'function') renderMiniCounts();
      if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
      else if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
    }
    function portalStaffFeedbackReviewUiReady(iso){
      try{
        const key = String(iso || '').trim().slice(0, 10);
        const today = typeof portalLondonTodayIso === 'function' ? portalLondonTodayIso() : '';
        if(key && today && /^\d{4}-\d{2}-\d{2}$/.test(key) && key < today){
          return true;
        }
      }catch(_){}
      return portalStaffFeedbackPipelineReady();
    }
    function portalApplyGrandfatheredSessionReviewComplete(rec, iso, staffId){
      const out = rec && typeof rec === 'object'
        ? rec
        : { feedbackDone: false, incident: false, absent: false, cancelled: false };
      if(out.feedbackDone || out.absent || out.cancelled) return out;
      const key = String(iso || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!key || !sid) return out;
      if(typeof portalTermStaffDayExplicitlyForceComplete === 'function'
        && portalTermStaffDayExplicitlyForceComplete(key, sid)){
        out.feedbackDone = true;
      }
      return out;
    }
    /** All plausible session review keys for one Today row (aliases for server lookup). */
    function portalCollectItemSessionReviewKeyAliases(item, iso, dayWord){
      const keys = [];
      const seen = Object.create(null);
      const add = function(k){
        k = String(k || '').trim();
        if(!k || seen[k]) return;
        seen[k] = true;
        keys.push(k);
      };
      add(item && item.sessionKey);
      if(item && Array.isArray(item.__portalFeedbackMergeMemberKeys)){
        item.__portalFeedbackMergeMemberKeys.forEach(add);
      }
      const s = portalReviewSessionForItem(item) || (item && item.__portalBaseSession);
      if(!s || !iso) return keys;
      if(typeof portalSessionReviewKeyForModelRow === 'function'){
        add(portalSessionReviewKeyForModelRow(s, dayWord, iso));
      }
      const cid = typeof portalEffectiveClientIdForReview === 'function'
        ? portalEffectiveClientIdForReview(s, iso)
        : String(s.clientId || '').trim().toLowerCase();
      const tCanon = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(s.start) : '';
      const tRaw = String(s.start != null ? s.start : '').trim();
      const activityMerge = String(s.activity || s.rosterService || 'Swimming').trim();
      const areaSuffix = typeof portalSessionFeedbackUnitSuffix === 'function'
        ? portalSessionFeedbackUnitSuffix(s, activityMerge, portalStaffIsSupportWorkerForAreaNotes())
        : '';
      if(areaSuffix && cid && tCanon) add(iso + '|' + tCanon + '|' + cid + areaSuffix);
      if(areaSuffix && cid && tRaw && tRaw !== tCanon) add(iso + '|' + tRaw + '|' + cid + areaSuffix);
      if(cid && tCanon) add(iso + '|' + tCanon + '|' + cid);
      if(cid && tRaw && tRaw !== tCanon) add(iso + '|' + tRaw + '|' + cid);
      if(cid && typeof portalStaffLeadIsAquaticActivity === 'function' && portalStaffLeadIsAquaticActivity(activityMerge)){
        var perSlotAquatic = typeof portalStaffLeadClientNeedsPerSlotAquaticFeedback === 'function'
          && portalStaffLeadClientNeedsPerSlotAquaticFeedback(iso, cid, dayWord);
        if(!perSlotAquatic){
          add(iso + '|' + cid + '|aquatic');
        }
        if(tCanon) add(iso + '|' + cid + '|' + tCanon + '|aquatic');
      }
      if(cid && !(typeof portalSessionNeedsPerStaffOwnFeedbackOnly === 'function'
        && portalSessionNeedsPerStaffOwnFeedbackOnly(s, iso))
        && (typeof portalStaffLeadReviewKeyAllowsDateClientOnlyAlias !== 'function'
        || portalStaffLeadReviewKeyAllowsDateClientOnlyAlias(s, iso, dayWord))){
        add(iso + '||' + cid);
      }
      if(typeof portalRosterSessionIsDayCentre === 'function' && portalRosterSessionIsDayCentre(s) && cid){
        add(iso + '|' + cid + '|day_centre');
      }
      if(typeof portalRosterSessionIsBespokeShared === 'function' && portalRosterSessionIsBespokeShared(s) && cid){
        add(iso + '|' + cid + '|bespoke_shared');
        add(iso + '||' + cid + '|hub_room');
      }
      return keys;
    }
    function portalBridgeSessionFeedbackComplete(iso, staffId, s, mergedRec){
      try{
        const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
        const notes = typeof clientNotesById !== 'undefined' ? clientNotesById : {};
        if(bridge && typeof bridge.sessionComplete === 'function'){
          return bridge.sessionComplete(iso, staffId, s, notes, mergedRec || {});
        }
      }catch(_){}
      return false;
    }
    function portalReviewKeyDateIsoFromSessionKey(key){
      const p = String(key || '').trim().split('|')[0] || '';
      return /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : '';
    }
    function portalReviewKeyTimeTokenFromSessionKey(key){
      const parts = String(key || '').trim().split('|').map(function(p){
        return String(p || '').trim();
      });
      for(let i = 0; i < parts.length; i++){
        const p = parts[i];
        if(/^\d{1,2}:\d{2}$/.test(p)){
          const m = p.match(/^(\d{1,2}):(\d{2})$/);
          if(!m) continue;
          return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];
        }
      }
      return '';
    }
    function portalReviewStoredAbsentKeyIsSharedDayUnit(storedKey){
      const s = String(storedKey || '').trim();
      if(!s) return false;
      if(/\|\|/.test(s)) return true;
      const low = s.toLowerCase();
      return low.indexOf('|day_centre') >= 0 || low.indexOf('|bespoke_shared') >= 0;
    }
    function portalReviewKeyParticipantSlugFromSessionKey(key){
      const parts = String(key || '').trim().split('|').map(function(p){
        return String(p || '').trim().toLowerCase();
      }).filter(Boolean);
      if(!parts.length || !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return '';
      const nonParticipant = {
        aquatic: 1, day_centre: 1, bespoke_shared: 1, swim: 1, merge: 1, hub_room: 1,
        teaching_pool: 1, big_pool: 1, climbing_wall: 1, climbing: 1, multi_activity: 1
      };
      for(let i = 1; i < parts.length; i++){
        const p = parts[i];
        if(!p) continue;
        if(/^\d{1,2}:\d{2}$/.test(p)) continue;
        if(nonParticipant[p]) continue;
        return p.replace(/[^a-z0-9]+/g, '_');
      }
      return '';
    }
    /** Match stored quick-mark key (e.g. date|mario|aquatic) to a Today row alias (e.g. date|18:00|mario). */
    function portalReviewStoredAbsentMatchesSessionKey(storedKey, targetKey){
      const s = String(storedKey || '').trim();
      const t = String(targetKey || '').trim();
      if(!s || !t) return false;
      if(s === t) return true;
      const matcher = typeof window.__PORTAL_REVIEW_KEY_MATCHER__ === 'function'
        ? window.__PORTAL_REVIEW_KEY_MATCHER__
        : null;
      if(matcher){
        try{
          if(matcher(s, t)){
            const stTimeM = portalReviewKeyTimeTokenFromSessionKey(s);
            const ttTimeM = portalReviewKeyTimeTokenFromSessionKey(t);
            if(stTimeM && ttTimeM) return stTimeM === ttTimeM;
            if(!stTimeM && ttTimeM) return portalReviewStoredAbsentKeyIsSharedDayUnit(s);
            return true;
          }
        }catch(_m){}
      }
      const sd = portalReviewKeyDateIsoFromSessionKey(s);
      const td = portalReviewKeyDateIsoFromSessionKey(t);
      if(!sd || sd !== td) return false;
      const ss = portalReviewKeyParticipantSlugFromSessionKey(s);
      const ts = portalReviewKeyParticipantSlugFromSessionKey(t);
      if(!ss || !ts) return false;
      let slugMatch = ss === ts;
      if(!slugMatch){
        const slugEq = typeof window.__PORTAL_CLIENT_SLUG_EQUIV__ === 'function'
          ? window.__PORTAL_CLIENT_SLUG_EQUIV__
          : null;
        if(slugEq){
          try{
            slugMatch = slugEq(ss, ts);
          }catch(_eq){}
        }
      }
      if(!slugMatch) return false;
      const stTime = portalReviewKeyTimeTokenFromSessionKey(s);
      const ttTime = portalReviewKeyTimeTokenFromSessionKey(t);
      if(stTime && ttTime) return stTime === ttTime;
      if(!stTime && ttTime) return portalReviewStoredAbsentKeyIsSharedDayUnit(s);
      return true;
    }
    function portalReviewAbsentInMemoryForAliases(aliases){
      if(!Array.isArray(aliases) || !aliases.length) return false;
      for(let i = 0; i < aliases.length; i++){
        const rec = sessionReviewMapMemory[aliases[i]];
        if(rec && rec.absent) return true;
      }
      const memKeys = Object.keys(sessionReviewMapMemory);
      for(let k = 0; k < memKeys.length; k++){
        const mk = memKeys[k];
        const rec = sessionReviewMapMemory[mk];
        if(!rec || !rec.absent) continue;
        for(let i = 0; i < aliases.length; i++){
          if(portalReviewStoredAbsentMatchesSessionKey(mk, aliases[i])) return true;
        }
      }
      return false;
    }
    function portalReviewAbsentFromServerQuickMarkKeys(aliases){
      if(!dashboardData || !dashboardData.portalServerAbsentQuickMarkKeys) return false;
      try{
        let hit = false;
        dashboardData.portalServerAbsentQuickMarkKeys.forEach(function(fk){
          if(hit) return;
          for(let i = 0; i < aliases.length; i++){
            if(portalReviewStoredAbsentMatchesSessionKey(fk, aliases[i])){
              hit = true;
              return;
            }
          }
        });
        return hit;
      }catch(_){ return false; }
    }
    function portalReviewFeedbackInMemoryForAliases(aliases, needsOwnOnly){
      if(!Array.isArray(aliases) || !aliases.length) return false;
      for(let i = 0; i < aliases.length; i++){
        const rec = sessionReviewMapMemory[aliases[i]];
        if(rec && rec.feedbackDone && !rec.absent && !rec.cancelled) return true;
      }
      if(needsOwnOnly){
        const memKeys = Object.keys(sessionReviewMapMemory);
        for(let k = 0; k < memKeys.length; k++){
          const mk = memKeys[k];
          const rec = sessionReviewMapMemory[mk];
          if(!rec || !rec.feedbackDone || rec.absent || rec.cancelled) continue;
          for(let i = 0; i < aliases.length; i++){
            if(typeof portalReviewStoredAbsentMatchesSessionKey === 'function'
              && portalReviewStoredAbsentMatchesSessionKey(mk, aliases[i])) return true;
          }
        }
        return false;
      }
      const memKeys = Object.keys(sessionReviewMapMemory);
      for(let k = 0; k < memKeys.length; k++){
        const mk = memKeys[k];
        const rec = sessionReviewMapMemory[mk];
        if(!rec || !rec.feedbackDone || rec.absent || rec.cancelled) continue;
        for(let i = 0; i < aliases.length; i++){
          if(portalReviewStoredAbsentMatchesSessionKey(mk, aliases[i])) return true;
        }
      }
      return false;
    }
    function portalReviewFeedbackFromServerForAliases(aliases, needsOwnOnly){
      if(needsOwnOnly){
        const own = dashboardData && dashboardData.portalServerOwnFeedbackKeys;
        if(own){
          for(let i = 0; i < aliases.length; i++){
            if(own.has(aliases[i])) return true;
          }
        }
        const ownPortal = dashboardData && dashboardData.portalServerOwnFeedbackPortalKeys;
        if(ownPortal && ownPortal.size){
          for(const fk of ownPortal){
            for(let i = 0; i < aliases.length; i++){
              const alias = aliases[i];
              if(alias && fk === alias) return true;
              if(typeof portalReviewStoredAbsentMatchesSessionKey === 'function'
                && portalReviewStoredAbsentMatchesSessionKey(fk, alias)){
                return true;
              }
            }
          }
        }
        return false;
      }
      /** @type {string[]} */
      const portalKeysToScan = [];
      const seenPortal = Object.create(null);
      const pushPortalKey = function(pk){
        pk = String(pk || '').trim();
        if(!pk || seenPortal[pk]) return;
        seenPortal[pk] = true;
        portalKeysToScan.push(pk);
      };
      const ownPortal = dashboardData && dashboardData.portalServerOwnFeedbackPortalKeys;
      const submittedPortal = dashboardData && dashboardData.portalServerSubmittedFeedbackPortalKeys;
      if(ownPortal && ownPortal.size) ownPortal.forEach(pushPortalKey);
      if(submittedPortal && submittedPortal.size) submittedPortal.forEach(pushPortalKey);
      const matcher = typeof window.__PORTAL_REVIEW_KEY_MATCHER__ === 'function'
        ? window.__PORTAL_REVIEW_KEY_MATCHER__
        : null;
      for(let p = 0; p < portalKeysToScan.length; p++){
        const fk = portalKeysToScan[p];
        for(let i = 0; i < aliases.length; i++){
          const alias = aliases[i];
          if(alias && fk === alias) return true;
          if(matcher){
            try{
              if(matcher(fk, alias)) return true;
            }catch(_m){}
          }
          if(portalReviewStoredAbsentMatchesSessionKey(fk, alias)) return true;
        }
      }
      const srv = dashboardData && dashboardData.portalServerResolvedRosterKeys;
      if(srv && srv.feedback){
        for(let i = 0; i < aliases.length; i++){
          if(srv.feedback.has(aliases[i])) return true;
        }
      }
      return false;
    }
    function portalReviewFeedbackResolvedForItem(item, iso){
      if(!item || !iso) return false;
      if(item.noSessionFeedbackRequired) return false;
      const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      const aliases = typeof portalCollectItemSessionReviewKeyAliases === 'function'
        ? portalCollectItemSessionReviewKeyAliases(item, iso, dayWord)
        : [String(item.sessionKey || '').trim()].filter(Boolean);
      const needsOwn = typeof portalTodayItemNeedsPerStaffOwnFeedbackOnly === 'function'
        && portalTodayItemNeedsPerStaffOwnFeedbackOnly(item, iso);
      const serverSynced = !!(dashboardData && dashboardData.portalFeedbackServerSynced);
      const pastOwnSlot = needsOwn && !portalIsServerTruthFeedbackDay(iso) && serverSynced;
      if(!pastOwnSlot && portalReviewFeedbackInMemoryForAliases(aliases, needsOwn)) return true;
      if(portalReviewFeedbackFromServerForAliases(aliases, needsOwn)) return true;
      if(!needsOwn){
        const baseS = portalReviewSessionForItem(item) || (item && item.__portalBaseSession);
        const sid = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
        const memRec = getSessionReviewRecord(item) || {};
        if(baseS && sid && portalBridgeSessionFeedbackComplete(iso, sid, baseS, memRec)){
          return true;
        }
      }
      const direct = getSessionReviewRecord(item);
      if(pastOwnSlot) return false;
      return !!(direct && direct.feedbackDone && !direct.absent && !direct.cancelled);
    }
    function portalReviewAbsentResolvedForItem(item, iso){
      if(!item || !iso) return false;
      const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      const aliases = typeof portalCollectItemSessionReviewKeyAliases === 'function'
        ? portalCollectItemSessionReviewKeyAliases(item, iso, dayWord)
        : [String(item.sessionKey || '').trim()].filter(Boolean);
      if(portalReviewAbsentFromServerQuickMarkKeys(aliases)) return true;
      if(portalReviewAbsentInMemoryForAliases(aliases)) return true;
      const direct = getSessionReviewRecord(item);
      return !!(direct && direct.absent);
    }
    /** Today+: green when Supabase (or live feedback cache after export) confirms this session. */
    function portalServerTruthReviewRecordForItem(item, iso){
      const base = { feedbackDone: false, incident: false, absent: false, cancelled: false };
      if(!item || !iso) return base;
      const serverSynced = !!(dashboardData && dashboardData.portalFeedbackServerSynced);
      const srv = dashboardData && dashboardData.portalServerResolvedRosterKeys;
      const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      const aliases = portalCollectItemSessionReviewKeyAliases(item, iso, dayWord);
      const baseS = portalReviewSessionForItem(item);
      let feedbackDone = false;
      let absent = false;
      let cancelled = false;
      if(serverSynced && srv){
        const cidForSlot = baseS && typeof portalEffectiveClientIdForReview === 'function'
          ? portalEffectiveClientIdForReview(baseS, iso)
          : String(baseS && baseS.clientId || item && item.clientId || '').trim().toLowerCase();
        const startHm = baseS && baseS.start != null ? baseS.start : '';
        const needsOwnFeedback = typeof portalTodayItemNeedsPerStaffOwnFeedbackOnly === 'function'
          && portalTodayItemNeedsPerStaffOwnFeedbackOnly(item, iso);
        const ownSrv = dashboardData && dashboardData.portalServerOwnFeedbackKeys;
        for(let i = 0; i < aliases.length; i++){
          const k = aliases[i];
          if(typeof portalStaffLeadFeedbackKeyMatchesAquaticSlot === 'function'
            && !portalStaffLeadFeedbackKeyMatchesAquaticSlot(k, iso, cidForSlot, startHm, dayWord)){
            continue;
          }
          if(needsOwnFeedback && ownSrv){
            if(ownSrv.has(k)) feedbackDone = true;
          }else if(srv.feedback && srv.feedback.has(k)){
            feedbackDone = true;
          }
          if(srv.absent && srv.absent.has(k)) absent = true;
          if(srv.cancelled && srv.cancelled.has(k)) cancelled = true;
        }
      }
      if(!absent && dashboardData && dashboardData.portalServerAbsentQuickMarkKeys){
        try{
          dashboardData.portalServerAbsentQuickMarkKeys.forEach(function(fk){
            if(absent) return;
            for(let ai = 0; ai < aliases.length; ai++){
              if(portalReviewStoredAbsentMatchesSessionKey(fk, aliases[ai])){
                absent = true;
                break;
              }
            }
          });
        }catch(_absFk){}
      }
      if(!absent && portalReviewAbsentInMemoryForAliases(aliases)) absent = true;
      if(item.noSessionFeedbackRequired){
        const pill = String(item.portalOverrideAlertPill || '').trim().toUpperCase();
        if(pill === 'ABSENT') absent = true;
        if(pill === 'CANCELLED') cancelled = true;
      }
      const staffIdSrv = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      const isMakeupCard = portalTodayCardUsesReplaceOverride(item);
      if(baseS && !isMakeupCard && typeof portalRosterSessionFeedbackResolvedFlags === 'function'){
        const ex = portalRosterSessionFeedbackResolvedFlags(baseS, iso, staffIdSrv);
        if(ex){
          if(ex.absent) absent = true;
          if(ex.cancelled) cancelled = true;
          if(ex.feedbackDone && !ex.absent && !ex.cancelled) feedbackDone = true;
        }
      }
      if(absent || cancelled) feedbackDone = false;
      if(!feedbackDone && !absent && !cancelled){
        const needsOwnFb = typeof portalTodayItemNeedsPerStaffOwnFeedbackOnly === 'function'
          && portalTodayItemNeedsPerStaffOwnFeedbackOnly(item, iso);
        if(portalReviewFeedbackFromServerForAliases(aliases, needsOwnFb)) feedbackDone = true;
        else if(portalReviewFeedbackInMemoryForAliases(aliases, needsOwnFb)) feedbackDone = true;
      }
      const mem = getSessionReviewRecord(item) || {};
      return {
        feedbackDone: feedbackDone,
        incident: !!mem.incident,
        absent: absent,
        cancelled: cancelled
      };
    }
    /** Pre-fill review map from portal-import-bundle status (admin overview parity on My Term). */
    function portalSeedReviewDoneFromFeedbackStatusBundle(){
      try{
        const src = typeof window !== 'undefined' ? window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE : null;
        if(!src || !Array.isArray(src.rows) || !src.rows.length) return false;
        const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
        if(!staffId) return false;
        const todayIso = portalLondonTodayIso();
        let changed = false;
        const byDate = Object.create(null);
        const doneMergeGroups = Object.create(null);
        src.rows.forEach(function(st){
          if(!st || !st.date) return;
          const iso = String(st.date).trim().substring(0, 10);
          const done = portalStatusRowIsDoneForCalendar(st);
          const mg = String(st.feedbackMergeGroup || '').trim();
          if(done && mg){
            if(!doneMergeGroups[iso]) doneMergeGroups[iso] = Object.create(null);
            doneMergeGroups[iso][mg] = st;
          }
          if(!portalStaffOwnsFeedbackStatusRow(staffId, st)) return;
          if(!done) return;
          if(!byDate[iso]) byDate[iso] = [];
          byDate[iso].push(st);
        });
        const isosToSeed = Object.create(null);
        Object.keys(byDate).forEach(function(iso){ isosToSeed[iso] = true; });
        Object.keys(doneMergeGroups).forEach(function(iso){ isosToSeed[iso] = true; });
        Object.keys(isosToSeed).forEach(function(iso){
          if(todayIso && iso >= todayIso) return;
          if(typeof portalTermIsCatchUpFeedbackDate === 'function' && portalTermIsCatchUpFeedbackDate(iso, staffId)) return;
          const exportThru = (function(){
            try{
              const meta = window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE && window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE.meta;
              return String(meta && meta.coverageThroughIso || '').trim().substring(0, 10);
            }catch(_){ return ''; }
          })();
          if(exportThru && iso > exportThru) return;
          const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
          const rel = typeof portalTermFeedbackSessionsForDate === 'function'
            ? portalTermFeedbackSessionsForDate(dayWord, iso, staffId, function(s){
                const st = String(s.status || '').toLowerCase();
                if(st === 'closed' || st === 'available') return false;
                return Boolean(String(s.clientId || '').trim());
              })
            : [];
          rel.forEach(function(s){
            const sk = typeof portalSessionReviewKeyForModelRow === 'function'
              ? portalSessionReviewKeyForModelRow(s, dayWord, iso)
              : '';
            if(!sk) return;
            let hit = byDate[iso] && byDate[iso].some(function(st){
              return portalStatusRowMatchesRosterSession(st, s);
            });
            let stRow = hit ? byDate[iso].find(function(st){
              return portalStatusRowMatchesRosterSession(st, s);
            }) : null;
            if(!hit && doneMergeGroups[iso]){
              let mg = '';
              src.rows.forEach(function(st){
                if(String(st.date || '').trim().substring(0, 10) !== iso) return;
                if(!portalStaffOwnsFeedbackStatusRow(staffId, st)) return;
                if(!portalStatusRowMatchesRosterClient(st, s)) return;
                const m = String(st.feedbackMergeGroup || '').trim();
                if(m) mg = m;
              });
              if(mg && doneMergeGroups[iso][mg]){
                const staffInGroup = src.rows.some(function(st){
                  return String(st.date || '').trim().substring(0, 10) === iso
                    && String(st.feedbackMergeGroup || '').trim() === mg
                    && portalStaffOwnsFeedbackStatusRow(staffId, st);
                });
                if(staffInGroup){
                  hit = true;
                  stRow = doneMergeGroups[iso][mg];
                }
              }
            }
            if(!hit) return;
            const prev = sessionReviewMapMemory[sk] || { feedbackDone: false, incident: false, absent: false, cancelled: false };
            const flags = portalFlagsFromStatusBundleRow(stRow)
              || portalReviewFlagsForResolvedSession(iso, staffId, s);
            const next = {
              feedbackDone: !!flags.feedbackDone,
              incident: !!prev.incident,
              absent: !!flags.absent,
              cancelled: !!flags.cancelled
            };
            if(next.feedbackDone !== prev.feedbackDone || next.absent !== prev.absent || next.cancelled !== prev.cancelled){
              sessionReviewMapMemory[sk] = next;
              changed = true;
            }
          });
        });
        if(changed) persistSessionReviewMap();
        return changed;
      }catch(e){
        console.warn('[portal] feedback status seed skipped', e);
        return false;
      }
    }
    /** Pre-fill from submitted session feedback export (covers 11–12 May and rows missing from status bundle). */
    function portalSeedReviewDoneFromSubmittedFeedbackPortal(){
      try{
        const src = typeof window !== 'undefined' ? window.SESSION_FEEDBACK_PORTAL_SOURCE : null;
        if(!src || !Array.isArray(src.rows) || !src.rows.length) return false;
        const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
        if(!staffId) return false;
        let changed = false;
        src.rows.forEach(function(row){
          const iso = String(row.date || '').trim().substring(0, 10);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
          const todayIso = portalLondonTodayIso();
          if(todayIso && iso >= todayIso) return;
          const exportThru = (function(){
            try{
              const meta = window.SESSION_FEEDBACK_PORTAL_SOURCE && window.SESSION_FEEDBACK_PORTAL_SOURCE.meta;
              return String(meta && meta.coverageThroughIso || '').trim().substring(0, 10);
            }catch(_){ return ''; }
          })();
          if(exportThru && iso > exportThru) return;
          const catchUpDay = typeof portalTermIsCatchUpFeedbackDate === 'function'
            && portalTermIsCatchUpFeedbackDate(iso, staffId);
          const instructor = String(row.instructor || row.completedBy || '').trim();
          const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
          const rel = typeof portalTermFeedbackSessionsForDate === 'function'
            ? portalTermFeedbackSessionsForDate(dayWord, iso, staffId, function(s){
                const st = String(s.status || '').toLowerCase();
                if(st === 'closed' || st === 'available') return false;
                return Boolean(String(s.clientId || '').trim());
              })
            : [];
          rel.forEach(function(s){
            if(!portalStatusRowMatchesRosterClient({ clientName: row.clientName }, s)) return;
            const isBespokeShared = typeof portalRosterSessionIsBespokeShared === 'function'
              && portalRosterSessionIsBespokeShared(s);
            if(!isBespokeShared && !portalStaffMatchesStatusInstructor(staffId, instructor)) return;
            if(catchUpDay && !isBespokeShared){
              const att0 = String(row.attendance != null ? row.attendance : '').trim().toLowerCase();
              if(att0 === 'no' || att0 === 'n' || att0 === '0' || att0 === 'false') return;
            }
            const sk = typeof portalSessionReviewKeyForModelRow === 'function'
              ? portalSessionReviewKeyForModelRow(s, dayWord, iso)
              : '';
            if(!sk) return;
            const bridgeSeed = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
            const isAbsent = bridgeSeed && typeof bridgeSeed.submittedRowMarksAbsent === 'function'
              ? bridgeSeed.submittedRowMarksAbsent(row)
              : (function(att){
                att = String(att != null ? att : '').trim().toLowerCase();
                return att === 'no' || att === 'n' || att === '0' || att === 'false';
              })(row.attendance);
            const prev = sessionReviewMapMemory[sk] || { feedbackDone: false, incident: false, absent: false, cancelled: false };
            const next = {
              feedbackDone: !isAbsent,
              incident: !!prev.incident,
              absent: isAbsent,
              cancelled: !!prev.cancelled
            };
            if(next.feedbackDone !== prev.feedbackDone || next.absent !== prev.absent){
              sessionReviewMapMemory[sk] = next;
              changed = true;
            }
          });
        });
        if(changed) persistSessionReviewMap();
        return changed;
      }catch(e){
        console.warn('[portal] submitted feedback seed skipped', e);
        return false;
      }
    }
    function portalSeedAllReviewDoneFromPortalExports(){
      let changed = false;
      try{
        const sid = String(
          (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
          || STAFF_DASHBOARD_ID
          || ''
        ).trim().toLowerCase();
        const resetV = '20260625-aurora-jun23-catchup';
        const machineResetV = '20260702-shared-feedback-jun25-floor';
        if(sid && typeof portalClearMachineRosterCrossInstructorReviewFlags === 'function'){
          let prevMachine = '';
          try{ prevMachine = localStorage.getItem('portalMachineReviewReset_v1') || ''; }catch(_){}
          if(prevMachine !== machineResetV){
            if(portalClearMachineRosterCrossInstructorReviewFlags(sid)) changed = true;
            try{ localStorage.setItem('portalMachineReviewReset_v1', machineResetV); }catch(_){}
          }
        }
        if(sid && typeof portalClearCatchUpExportReviewFlags === 'function'){
          let prev = '';
          try{ prev = localStorage.getItem('portalCatchUpReviewReset_v1') || ''; }catch(_){}
          if(prev !== resetV){
            if(portalClearCatchUpExportReviewFlags(sid)) changed = true;
            try{ localStorage.setItem('portalCatchUpReviewReset_v1', resetV); }catch(_){}
          }
        }
      }catch(_){}
      if(typeof portalSeedReviewDoneFromFeedbackStatusBundle === 'function'){
        if(portalSeedReviewDoneFromFeedbackStatusBundle()) changed = true;
      }
      if(typeof portalSeedReviewDoneFromSubmittedFeedbackPortal === 'function'){
        if(portalSeedReviewDoneFromSubmittedFeedbackPortal()) changed = true;
      }
      return changed;
    }
    /** Seed static export rows into review map (historical days). Does not mark server sync complete. */
    function portalMarkFeedbackReconciledFromExports(force){
      try{
        if(!force && window.__PORTAL_EXPORT_REVIEW_SEEDED__) return;
        if(typeof portalSeedAllReviewDoneFromPortalExports === 'function'){
          portalSeedAllReviewDoneFromPortalExports();
        }
        window.__PORTAL_EXPORT_REVIEW_SEEDED__ = true;
      }catch(_){}
    }
    function portalMarkFeedbackReconciledAfterServerSync(){
      try{
        try{ if(typeof window !== 'undefined') delete window.__PORTAL_TERM_REBUILD_LAST_SIG__; }catch(_sig){}
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function'){
          rebuildTermShiftAndFeedbackFromSessionModel();
        }
        portalStaffFinishFeedbackPipelineReady({ serverSynced: true });
      }catch(_){}
    }
    /** Merge feedback / incident / cancellation rows from Supabase so a second device shows the same greens as the first. */
    async function portalMergeServerReviewStateForDashboard(opts){
      opts = opts && typeof opts === 'object' ? opts : {};
      const skipRender = !!opts.skipRender;
      try{
        const box = window.__PORTAL_SUPABASE__;
        const uid = box && box.session && box.session.user && box.session.user.id ? String(box.session.user.id).trim() : '';
        if(!box || !box.client || !uid) return;
        const mod = await import(PORTAL_SUPABASE_CLIENT_MODULE);
        if(!mod.portalFetchSubmittedReviewSessionKeys || !mod.portalMergeReviewKeysIntoMemoryMap) return;
        const seeded = typeof portalSeedAllReviewDoneFromPortalExports === 'function'
          ? portalSeedAllReviewDoneFromPortalExports()
          : false;
        try{
          if(typeof buildSelectedDayViewFromLauraModel === 'function' && dashboardData){
            dashboardData.today = buildSelectedDayViewFromLauraModel();
          }
        }catch(_preToday){}
        let rosterKeys = typeof portalCollectRosterSessionKeysForReviewSync === 'function' ? portalCollectRosterSessionKeysForReviewSync() : [];
        const staffIdSync = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
        const todayIsoSync = portalLondonTodayIso();
        const catchUpDates = typeof portalTermStaffCatchUpFeedbackDates === 'function'
          ? portalTermStaffCatchUpFeedbackDates(staffIdSync)
          : [];
        const perStaffOwnKeys = typeof portalCollectAllPerStaffOwnFeedbackOnlyKeys === 'function'
          ? portalCollectAllPerStaffOwnFeedbackOnlyKeys(catchUpDates)
          : (typeof portalCollectPerStaffOwnFeedbackOnlyKeys === 'function'
            ? portalCollectPerStaffOwnFeedbackOnlyKeys(todayIsoSync)
            : []);
        const feedbackMergeRules = (function(){
          try{
            const src = typeof window !== 'undefined' ? window.STAFF_DASHBOARD_SOURCE : null;
            return src && Array.isArray(src.sundayFeedbackMerges) ? src.sundayFeedbackMerges : [];
          }catch(_){ return []; }
        })();
        const syncOpts = {
          rosterSessionKeys: rosterKeys,
          catchUpSessionDates: catchUpDates,
          feedbackMergeRules: feedbackMergeRules,
          staffId: staffIdSync,
          perStaffOwnFeedbackOnlyKeys: perStaffOwnKeys
        };
        const keys = await mod.portalFetchSubmittedReviewSessionKeys(box.client, uid, syncOpts);
        if(dashboardData){
          dashboardData.portalServerSubmittedFeedbackKeys = new Set(keys.feedbackKeys || []);
          dashboardData.portalServerSubmittedFeedbackPortalKeys = new Set(keys.feedbackKeys || []);
          dashboardData.portalServerOwnFeedbackKeys = new Set(keys.ownFeedbackKeys || []);
          dashboardData.portalServerOwnFeedbackPortalKeys = new Set(keys.ownFeedbackPortalKeys || []);
          dashboardData.portalPerStaffOwnFeedbackOnlyKeys = new Set(perStaffOwnKeys);
        }
        const mergeFanOutOpts = {
          rosterSessionKeys: rosterKeys,
          feedbackMergeRules: feedbackMergeRules,
          perStaffOwnFeedbackOnlyKeys: perStaffOwnKeys,
          ownFeedbackKeys: keys.ownFeedbackKeys || []
        };
        if(typeof mod.portalFeedbackSubmittedKeyMatchesRosterKey === 'function'){
          window.__PORTAL_REVIEW_KEY_MATCHER__ = mod.portalFeedbackSubmittedKeyMatchesRosterKey;
        }
        if(typeof mod.portalClientSlugTokensEquivalent === 'function'){
          window.__PORTAL_CLIENT_SLUG_EQUIV__ = mod.portalClientSlugTokensEquivalent;
        }
        if(dashboardData){
          dashboardData.portalServerAbsentQuickMarkKeys = new Set(
            (keys.absentKeys || []).map(function(k){ return String(k || '').trim(); }).filter(Boolean)
          );
        }
        if(typeof mod.portalBuildServerResolvedRosterKeySets === 'function' && dashboardData){
          dashboardData.portalServerResolvedRosterKeys = mod.portalBuildServerResolvedRosterKeySets(rosterKeys, keys, mergeFanOutOpts);
        }
        const merged = mod.portalMergeReviewKeysIntoMemoryMap(sessionReviewMapMemory, keys, mergeFanOutOpts);
        try{
          const lateRosterKeys = typeof portalCollectRosterSessionKeysForReviewSync === 'function'
            ? portalCollectRosterSessionKeysForReviewSync()
            : rosterKeys;
          if(lateRosterKeys.length > rosterKeys.length && (keys.absentKeys || []).length
            && typeof mod.portalFanOutFeedbackKeysOntoRosterMemory === 'function'){
            mod.portalFanOutFeedbackKeysOntoRosterMemory(
              sessionReviewMapMemory,
              keys.absentKeys,
              lateRosterKeys,
              Object.assign({ markAbsent: true }, mergeFanOutOpts)
            );
            rosterKeys = lateRosterKeys;
            if(typeof mod.portalBuildServerResolvedRosterKeySets === 'function' && dashboardData){
              dashboardData.portalServerResolvedRosterKeys = mod.portalBuildServerResolvedRosterKeySets(
                lateRosterKeys,
                keys,
                mergeFanOutOpts
              );
            }
          }
        }catch(_lateAbsent){}
        const floorIso = typeof portalMachineRosterFeedbackFloorIso === 'function' ? portalMachineRosterFeedbackFloorIso() : '2026-06-01';
        const reconciled = typeof mod.portalReconcileReviewMemoryWithServer === 'function'
          ? mod.portalReconcileReviewMemoryWithServer(sessionReviewMapMemory, rosterKeys, keys, {
              serverTruthFromIso: floorIso,
              catchUpSessionDates: catchUpDates,
              feedbackMergeRules: feedbackMergeRules,
              perStaffOwnFeedbackOnlyKeys: perStaffOwnKeys,
              ownFeedbackKeys: keys.ownFeedbackKeys || []
            })
          : false;
        if(seeded || merged || reconciled){
          persistSessionReviewMap();
          if(typeof portalEnrichClientNotesFromPortalFeedback === 'function') portalEnrichClientNotesFromPortalFeedback();
        }
        if(typeof portalMarkFeedbackReconciledAfterServerSync === 'function'){
          portalMarkFeedbackReconciledAfterServerSync();
        }
        if(typeof portalStaffRefreshFeedbackDependentUi === 'function'){
          portalStaffRefreshFeedbackDependentUi();
        }
        try{
          if(typeof buildSelectedDayViewFromLauraModel === 'function' && dashboardData){
            dashboardData.today = buildSelectedDayViewFromLauraModel();
          }
          if(!skipRender && typeof renderToday === 'function') renderToday();
        }catch(_rt){}
        if(seeded || merged || reconciled){
          if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
          if(typeof renderClientsSheetList === 'function'){
            const newBtn = document.getElementById('clientsTabNew');
            const myBtn = document.getElementById('clientsTabMy');
            const mode = newBtn && newBtn.classList.contains('is-active') ? 'new'
              : (myBtn && myBtn.classList.contains('is-active') ? 'my' : 'my');
            renderClientsSheetList(mode, '');
          }
        }
      }catch(e){
        console.warn('[portal] server review merge skipped', e);
      }
    }

    function portalFeedbackReturnHtmlFile(){
      return 'staff_dashboard.html';
    }
    function portalFormFromPortalParam(){
      try{
        const qs = new URLSearchParams(String(typeof location !== 'undefined' ? location.search : ''));
        const fp = String(qs.get('from_portal') || '').trim().toLowerCase();
        if(fp === 'lead' || fp === 'lead_report') return fp === 'lead_report' ? 'lead_report' : 'lead';
      }catch(_){}
      try{
        if(typeof portalIsStaffHomeProgrammeLead === 'function'){
          const box = typeof window !== 'undefined' ? window.__PORTAL_SUPABASE__ : null;
          const prof = box && box.staff_profile;
          const email = String((box && box.session && box.session.user && box.session.user.email) || '').trim();
          if(portalIsStaffHomeProgrammeLead(prof, email)) return 'lead';
        }
      }catch(_){}
      return 'staff';
    }
    function portalAppendFromPortalQuery(url){
      const u = String(url || '');
      if(!u) return u;
      const hashIdx = u.indexOf('#');
      const base = hashIdx >= 0 ? u.slice(0, hashIdx) : u;
      const hash = hashIdx >= 0 ? u.slice(hashIdx) : '';
      if(/[?&]from_portal=/.test(base)) return u;
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + 'from_portal=' + encodeURIComponent(portalFormFromPortalParam()) + hash;
    }
    /**
     * Session feedback page (query: sessionKey, name, date, time, service, clientId).
     * Session feedback target: PORTAL_SESSION_FEEDBACK_PAGE_URL if set; otherwise `session_feedback.html` next to this dashboard.
     */
    const PORTAL_SESSION_FEEDBACK_PAGE_URL = 'portal-session-feedback.html';
    function portalSessionFeedbackPageBase(){
      const u = typeof PORTAL_SESSION_FEEDBACK_PAGE_URL === 'string' ? PORTAL_SESSION_FEEDBACK_PAGE_URL.trim() : '';
      return u || 'portal-session-feedback.html';
    }
    const PORTAL_INCIDENT_REPORT_PAGE_URL = 'portal-incident.html';
    const PORTAL_CANCELLATION_REPORT_PAGE_URL = 'cancellation.html';
    function portalIncidentReportPageBase(){
      const u = typeof PORTAL_INCIDENT_REPORT_PAGE_URL === 'string' ? PORTAL_INCIDENT_REPORT_PAGE_URL.trim() : '';
      if(/^https?:\/\//i.test(u)) return u;
      const rel = u || '/incident_portal/';
      try{
        return new URL(rel, (location && location.origin) ? location.origin : ((typeof window !== 'undefined' && window.location && window.location.origin) || '')).href;
      }catch(_){
        return 'portal-incident.html';
      }
    }
    function portalCancellationReportPageBase(){
      const u = typeof PORTAL_CANCELLATION_REPORT_PAGE_URL === 'string' ? PORTAL_CANCELLATION_REPORT_PAGE_URL.trim() : '';
      if(/^https?:\/\//i.test(u)) return u;
      const rel = u || '/cancellation_portal/';
      try{
        return new URL(rel, (location && location.origin) ? location.origin : ((typeof window !== 'undefined' && window.location && window.location.origin) || '')).href;
      }catch(_){
        return 'cancellation.html';
      }
    }
    function portalQuickMenuPortalReturnBaseUrl(){
      try{
        const raw = (typeof location !== 'undefined' && location.href) ? String(location.href).split('#')[0] : '';
        if(!raw) return '';
        const u = new URL(raw);
        u.searchParams.delete('portalReturn');
        u.searchParams.set('portalReturnToToday', '1');
        return u.href;
      }catch(_){
        return '';
      }
    }
    function portalCollectTodayParticipantNames(){
      const out = [];
      const seen = new Set();
      function add(nm){
        const t = String(nm || '').trim();
        if(!t) return;
        const k = t.toLowerCase();
        if(seen.has(k)) return;
        seen.add(k);
        out.push(t);
      }
      try{
        (dashboardData.today || []).forEach(function(it){
          if(!it || it.kind !== 'client') return;
          add(it.name || it.clientName || it.client);
        });
      }catch(_){}
      try{
        if(typeof window.portalLeadPickupRosterNamesForDate === 'function'){
          const iso = typeof portalViewCalendarDateKey === 'function' ? portalViewCalendarDateKey() : '';
          const box = window.__PORTAL_SUPABASE__ || {};
          const prof = box.staff_profile || null;
          const em = box.session && box.session.user && box.session.user.email ? box.session.user.email : '';
          if(iso && prof){
            window.portalLeadPickupRosterNamesForDate(iso, prof, em).forEach(add);
          }
        }
      }catch(_){}
      return out.sort(function(a, b){
        return a.localeCompare(b, 'en', { sensitivity: 'base' });
      });
    }
    function portalAppendStaffMobileVerticalParam(href){
      const raw = String(href || '').trim();
      if(!raw) return raw;
      try{
        const tu = new URL(raw, window.location.href);
        if(!/(portal-venue-review|portal-pickup)/i.test(tu.pathname)) return raw;
        if(tu.searchParams.get('m') !== '1') tu.searchParams.set('m', '1');
        try{ sessionStorage.setItem('staffPortalMobileUx', '1'); }catch(_){}
        return tu.href;
      }catch(_){
        return raw;
      }
    }
    function portalBuildPickupQuickMenuUrl(url){
      const base = String(url || '').trim();
      if(!base) return '';
      try{
        const u = new URL(base, window.location.href);
        const names = portalCollectTodayParticipantNames();
        if(names.length) u.searchParams.set('roster', names.join('|'));
        try{
          const nm = String((window.dashboardData && window.dashboardData.staffName) || '').trim();
          if(nm) u.searchParams.set('staff', nm);
        }catch(_){}
        return portalAppendStaffMobileVerticalParam(u.href);
      }catch(_){
        return portalAppendStaffMobileVerticalParam(base);
      }
    }
    function portalBuildVenueQuickMenuUrl(url, opts){
      opts = opts || {};
      const base = String(url || '').trim();
      if(!base) return '';
      try{
        const u = new URL(base, window.location.href);
        let dateIso = '';
        try{
          dateIso = String(typeof portalViewCalendarDateKey === 'function' ? portalViewCalendarDateKey() : '').trim();
        }catch(_){}
        if(/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) u.searchParams.set('date', dateIso);
        try{
          let vkind = String(opts.kind || '').trim().toLowerCase();
          if(vkind === 'opening') vkind = 'open';
          if(vkind === 'closing') vkind = 'close';
          if(!vkind && typeof portalVenueTimeWindowsForUser === 'function'){
            const vw = portalVenueTimeWindowsForUser();
            if(vw){
              const openDoneV = typeof portalVenueFlagIsDone === 'function' && portalVenueFlagIsDone('open');
              const closeDoneV = typeof portalVenueFlagIsDone === 'function' && portalVenueFlagIsDone('close');
              if(vw.opening && !openDoneV) vkind = 'open';
              else if(vw.closing && !closeDoneV) vkind = 'close';
              else if(vw.closing) vkind = 'close';
              else if(vw.opening) vkind = 'open';
            }
          }
          if(vkind) u.searchParams.set('kind', vkind);
        }catch(_){}
        let venue = '';
        try{
          venue = typeof formatTodayVenueOnlyLabel === 'function' ? String(formatTodayVenueOnlyLabel() || '').trim() : '';
        }catch(_){}
        if(venue && venue !== '—') u.searchParams.set('venue', venue);
        try{
          const nm = String((window.dashboardData && window.dashboardData.staffName) || '').trim();
          if(nm) u.searchParams.set('completedBy', nm);
        }catch(_){}
        try{
          let service = '';
          if(window.dashboardData){
            service = String(window.dashboardData.service || (window.dashboardData.morning && window.dashboardData.morning.service) || '').trim();
          }
          if(service && service !== '—') u.searchParams.set('service', service);
        }catch(_){}
        return portalAppendStaffMobileVerticalParam(u.href);
      }catch(_){
        return portalAppendStaffMobileVerticalParam(base);
      }
    }
    function portalQuickMenuNavigate(url){
      const u = String(url || '').trim();
      if(!u) return;
      let target = u;
      try{
        const tu = new URL(u, typeof window !== 'undefined' && window.location ? window.location.href : undefined);
        const dash = typeof portalQuickMenuPortalReturnBaseUrl === 'function' ? portalQuickMenuPortalReturnBaseUrl() : '';
        if(dash) tu.searchParams.set('portalReturn', dash);
        if(window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active){
          const g = window.__PORTAL_GHOST_VIEW__;
          if(g.rosterKey) tu.searchParams.set('ghostRosterKey', String(g.rosterKey));
          if(g.staffUserId) tu.searchParams.set('ghostStaffUserId', String(g.staffUserId));
          if(g.displayName) tu.searchParams.set('ghostDisplayName', String(g.displayName));
          tu.searchParams.set('ghostView', '1');
        }
        if(/(policies_portal|risk_assessment|ra_portal|risk_assessments_portal)/i.test(tu.pathname) && typeof window !== 'undefined' && window.dashboardData){
          const nm = String(window.dashboardData.staffName || '').trim();
          let role = '';
          try{
            if(window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active){
              const rawRole = String(window.dashboardData.staffRoleTrack || window.dashboardData.staffRole || '').trim();
              role = rawRole ? rawRole.replace(/_/g, ' ') : '';
            }else{
              const p = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
              if(p){
                const ar = String(p.app_role || p.staff_role || '').trim().toLowerCase().replace(/[\s_]+/g,'');
                const map = { staff:'Staff', lead:'Lead', admin:'Admin', ceo:'CEO', support:'Support', manager:'Manager' };
                if(ar) role = map[ar] || (ar.charAt(0).toUpperCase() + ar.slice(1));
              }
            }
          }catch(_){}
          if(!role){
            const rawRole = String(window.dashboardData.staffRoleTrack || window.dashboardData.staffRole || '').trim();
            role = rawRole ? rawRole.replace(/_/g, ' ') : '';
          }
          if(nm) tu.searchParams.set('portalSignerName', nm);
          if(role) tu.searchParams.set('portalSignerRole', role);
        }
        try{
          if(/portal-|cancellation\.html|staff_profile_update/i.test(tu.pathname)) tu.searchParams.set('from_portal', portalFormFromPortalParam());
        }catch(_){}
        try{
          if(/staff_profile_update/i.test(tu.pathname)){
            try{
              if(typeof window.portalPrepareProfileUpdateHandoff === 'function'){
                window.portalPrepareProfileUpdateHandoff();
              }
            }catch(_){}
            const nm = String((window.dashboardData && window.dashboardData.staffName) || '').trim();
            if(nm) tu.searchParams.set('full_name', nm);
            try{
              const prof = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
              if(prof && prof.id) tu.searchParams.set('staff_id', String(prof.id));
            }catch(_){}
            try{
              var bridge = '';
              if(typeof window.portalEnsureBridgeCached === 'function'){
                bridge = String(window.portalEnsureBridgeCached() || '').trim();
              }
              if(!bridge || bridge.length < 16){
                bridge = String(sessionStorage.getItem('portalStaffProfileBridgeSecret_v1') || sessionStorage.getItem('clubsens_portal_bridge_v1') || localStorage.getItem('clubsens_portal_bridge_v1') || '').trim();
              }
              if(bridge && bridge.indexOf('%%') !== 0 && bridge.length >= 16){
                tu.hash = 'portal_bridge=' + encodeURIComponent(bridge);
              }
            }catch(_){}
          }
        }catch(_){}
        target = tu.href;
      }catch(_){
        try{
          const dash = portalQuickMenuPortalReturnBaseUrl();
          if(dash){
            const sep = u.indexOf('?') >= 0 ? '&' : '?';
            target = u + sep + 'portalReturn=' + encodeURIComponent(dash);
          }
        }catch(__){}
      }
      target = typeof portalAppendStaffMobileVerticalParam === 'function'
        ? portalAppendStaffMobileVerticalParam(target)
        : target;
      try{ closeSheet(); }catch(_){}
      try{
        var profileTarget = false;
        try{
          var parsedTarget = new URL(target, window.location.href);
          profileTarget = /staff_profile_update/i.test(parsedTarget.pathname);
        }catch(_){}
        if(profileTarget && typeof window.portalOpenAnnualProfileUpdate === 'function'){
          window.portalOpenAnnualProfileUpdate(target);
          return;
        }
        window.open(target, '_blank', 'noopener,noreferrer');
      }catch(_){
        window.location.href = target;
      }
    }
    /** `return` value: absolute dashboard URL so it works even when feedback lives on another path on the same site. */
    function portalFeedbackReturnParam(){
      try{
        if(typeof location !== 'undefined' && location.href){
          const noHash = location.href.split('#')[0];
          if(noHash) return noHash;
        }
      }catch(e){}
      return portalFeedbackReturnHtmlFile();
    }
    /** Where the user entered session feedback from: drives post-submit return (This Week vs Term vs dashboard). */
    var __PORTAL_REVIEW_FLOW_ORIGIN__ = 'dashboard';
    try{ window.__PORTAL_REVIEW_FLOW_ORIGIN__ = 'dashboard'; }catch(_){}
    function portalGetReviewFlowOrigin(){
      const o = String(typeof __PORTAL_REVIEW_FLOW_ORIGIN__ !== 'undefined' ? __PORTAL_REVIEW_FLOW_ORIGIN__ : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_FLOW_ORIGIN__) || 'dashboard').trim();
      if(o === 'this_week' || o === 'term' || o === 'dashboard') return o;
      return 'dashboard';
    }
    function portalSetReviewFlowOrigin(next){
      const v = String(next || '').trim();
      if(v === 'this_week' || v === 'term' || v === 'dashboard') __PORTAL_REVIEW_FLOW_ORIGIN__ = v;
      else __PORTAL_REVIEW_FLOW_ORIGIN__ = 'dashboard';
      try{ window.__PORTAL_REVIEW_FLOW_ORIGIN__ = __PORTAL_REVIEW_FLOW_ORIGIN__; }catch(_){}
    }
    function portalFeedbackDashboardReturnUrl(){
      try{
        const u = new URL(String(location.href).split('#')[0]);

        const out = new URL(u.origin + u.pathname);

        ['m','elementor-preview','preview'].forEach(function(k){
          const v = u.searchParams.get(k);
          if(v != null && String(v).length) out.searchParams.set(k, v);
        });

        const params = new URLSearchParams(location.search);
        const sk = params.get('sessionKey');

        if(sk){
          const datePart = (sk.split('|')[0] || '').trim();
          if(/^\d{4}-\d{2}-\d{2}$/.test(datePart)){
            out.searchParams.set('portalReviewDate', datePart);
            const p = datePart.split('-').map(Number);
            const d = new Date(p[0], p[1] - 1, p[2]);
            if(!Number.isNaN(d.getTime())){
              out.searchParams.set('portalReviewDay', d.toLocaleDateString('en-GB', { weekday: 'long' }));
            }
          }
          out.searchParams.set('portalPostFeedback', '1');
        }

        const ro = typeof portalGetReviewFlowOrigin === 'function' ? portalGetReviewFlowOrigin() : 'dashboard';
        out.searchParams.set('portalReviewOrigin', (ro === 'this_week' || ro === 'term' || ro === 'dashboard') ? ro : 'dashboard');

        return out.href;

      }catch(e){
        try{
          return new URL('staff_dashboard.html', location.href).pathname;
        }catch(_){
          return 'staff_dashboard.html';
        }
      }
    }
    function portalFeedbackFormServiceLabel(activity){
      const raw = String(activity || '').trim();
      if(!raw) return '';
      const a = raw.toLowerCase();
      if(a.includes('climb')) return 'Climbing Activity';
      if(a.includes('bespoke')) return 'Bespoke Programme';
      if(a.includes('multi-activity') || a.includes('multi activity')) return 'Multi Activity (Splash & Connect)';
      if(a.includes('splash') || a.includes('connect')) return 'Multi Activity (Splash & Connect)';
      if(a.includes('fitfun') || a.includes('active play')) return 'Active Play & Movement (FitFun)';
      if(a.includes('physical')) return 'Physical Activity';
      if(a === 'swim' || a.includes('swimming')) return 'Swimming';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    function portalWeekdayLongFromSessionDateKey(sessionKey){
      const d = String(sessionKey || '').split('|')[0].trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
      const p = d.split('-').map(Number);
      const dt = new Date(p[0], p[1] - 1, p[2]);
      if(Number.isNaN(dt.getTime())) return '';
      return dt.toLocaleDateString('en-GB', { weekday: 'long' });
    }
    const PORTAL_WEEK_REVIEW_VALID_DAYS = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
