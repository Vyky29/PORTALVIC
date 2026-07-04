    function portalStaffCanBrowseAllParticipants(){
      return false;
    }
    function portalNewParticipantsPack(){
      const P = window.PortalParticipantsSheet;
      if(!P || typeof P.collectNewParticipantIds !== 'function'){
        return { ids: [], scheduleByClientId: Object.create(null) };
      }
      return P.collectNewParticipantIds(typeof P.buildContext === 'function' ? P.buildContext() : undefined);
    }
    function portalParticipantsSheetRefreshTabs(){
      const P = window.PortalParticipantsSheet;
      if(!P || typeof P.applyTabVisibility !== 'function') return portalNewParticipantsPack();
      const pack = P.applyTabVisibility();
      const newBtn = document.getElementById('clientsTabNew');
      const myBtn = document.getElementById('clientsTabMy');
      if(newBtn && newBtn.classList.contains('is-active')) renderClientsSheetList('new');
      else if(myBtn && myBtn.classList.contains('is-active')) renderClientsSheetList('my');
      return pack;
    }
    function portalApplyClientsDirectoryAccess(){
      portalParticipantsSheetRefreshTabs();
      const tools = document.getElementById('clientsAllToolsWrap');
      if(tools){
        tools.hidden = true;
        const si = document.getElementById('clientsDirectorySearch');
        if(si) si.value = '';
        const sug = document.getElementById('clientsDirectorySuggest');
        if(sug){
          sug.hidden = true;
          sug.innerHTML = '';
        }
      }
    }
    function portalClientNoteForParticipantsSheet(clientId){
      const P = window.PortalParticipantsSheet;
      if(P && typeof P.clientNoteForSheet === 'function'){
        return P.clientNoteForSheet(clientId, typeof P.buildContext === 'function' ? P.buildContext() : undefined);
      }
      return clientNotesById[clientId] || null;
    }
    function getAssignedClientIdsForStaff(){
      const sid = String(STAFF_DASHBOARD_ID).toLowerCase();
      const seen = new Set();
      const out = [];
      function pushClient(cid){
        if(!cid || CLIENT_LIST_PSEUDO_IDS.includes(cid) || seen.has(cid)) return;
        seen.add(cid);
        out.push(cid);
      }
      sessionsModel.forEach(s => {
        if(String(s.staffId).toLowerCase() !== sid) return;
        const st = sessionModelStatus(s);
        if(st === 'Closed' || st === 'Available' || st === 'Home' || st === 'Manager') return;
        pushClient(s.clientId);
      });
      function pushDashboardRow(row){
        if(!row) return;
        const rowStaff = String(row.staffId || row.instructorId || row.staff || '').trim().toLowerCase();
        if(rowStaff && rowStaff !== sid) return;
        pushClient(row.clientId);
      }
      (dashboardData.today || []).forEach(pushDashboardRow);
      (dashboardData.tomorrow || []).forEach(pushDashboardRow);
      out.sort((a, b) => {
        const na = (clientNotesById[a] && clientNotesById[a].name) || a;
        const nb = (clientNotesById[b] && clientNotesById[b].name) || b;
        return na.localeCompare(nb, 'en');
      });
      return out;
    }
    function getAllClientIdsCatalog(){
      let ids = Object.keys(clientNotesById).filter(id => !CLIENT_LIST_PSEUDO_IDS.includes(id));
      if(typeof window.portalFilterParticipantCatalogIds === 'function'){
        ids = window.portalFilterParticipantCatalogIds(ids, clientNotesById);
      }
      return ids.sort((a, b) => clientNotesById[a].name.localeCompare(clientNotesById[b].name, 'en'));
    }
    const CLIENT_DIRECTORY_PREP_LINE = 'Preparation view before session';
    const CLIENT_NEW_PARTICIPANTS_PREP_LINE = 'New participant — for the term or a single trial session';

    function clientsGridMedicalIconSvg(){
      return '<svg class="clients-grid-med-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><title>Medical condition</title><path d="M9 2h6a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1z"/></svg>';
    }
    function participantCatalogIdScore(clientId){
      let s = 0;
      const c = clientNotesById[clientId];
      if(!c) return s;
      if(resolveParticipantPhotoUrl(c.name, clientId)) s += 4;
      if(String(c.generalInfoSheet || '').trim()) s += 2;
      if(c.hasMedicalAlert) s += 1;
      s += Math.min(sessionsModel.filter(x => x.clientId === clientId).length, 5);
      return s;
    }
    /** One tile per participant display name (roster spelling variants collapse to the richest record). */
    function dedupeClientIdsByDisplayName(ids){
      if(typeof window.portalDedupeParticipantClientIds === 'function'){
        return window.portalDedupeParticipantClientIds(ids, {
          clientNotesById,
          photoUrl: (name, id) => resolveParticipantPhotoUrl(name, id),
          score: participantCatalogIdScore
        });
      }
      return ids;
    }
    /** Shared row: avatar + name; medical icon anchored bottom-right of the tile. */
    function clientsParticipantRowInnerHtml(clientId, c, scheduleIso, scheduleLabelOpts){
      const name = escapeHtml(c.name);
      const avatar = '<span class="clients-grid-avatar" aria-hidden="true">' + clientAvatarInner(c.name, clientId) + '</span>';
      const medInner = c.hasMedicalAlert ? clientsGridMedicalIconSvg() : '';
      const medSlot = '<span class="clients-grid-med' + (medInner ? '' : ' clients-grid-med--empty') + '"' + (medInner ? '' : ' aria-hidden="true"') + '>' + medInner + '</span>';
      const medSr = c.hasMedicalAlert ? '<span class="topbar-sr-only">Medical information on file.</span>' : '';
      let schedHtml = '';
      const P = window.PortalParticipantsSheet;
      if(scheduleIso && P && typeof P.formatScheduleLabel === 'function'){
        const lbl = P.formatScheduleLabel(scheduleIso, scheduleLabelOpts || null);
        if(lbl) schedHtml = '<span class="clients-grid-sched">' + escapeHtml(lbl) + '</span>';
      }
      const nameCol = '<span class="clients-grid-name-col"><span class="clients-grid-name">' + name + '</span>' + schedHtml + '</span>';
      return avatar + nameCol + medSlot + medSr;
    }

    function renderClientsSheetList(mode, filterQuery){
      const grid = document.getElementById('clientsListGrid');
      if(!grid) return;
      const isAll = mode === 'all';
      const isNew = mode === 'new';
      const q = String(filterQuery || '').trim().toLowerCase();
      const newPack = portalNewParticipantsPack();
      const newSet = new Set(newPack.ids);
      const scheduleBy = newPack.scheduleByClientId || Object.create(null);
      let ids;
      if(isAll) ids = getAllClientIdsCatalog();
      else if(isNew) ids = newPack.ids.slice();
      else ids = getAssignedClientIdsForStaff().filter(id => !newSet.has(id));
      ids = dedupeClientIdsByDisplayName(ids);
      ids.sort((a, b) => {
        const na = (clientNotesById[a] && clientNotesById[a].name) || a;
        const nb = (clientNotesById[b] && clientNotesById[b].name) || b;
        return na.localeCompare(nb, 'en');
      });
      if(isAll && q){
        ids = ids.filter(id => {
          const n = (clientNotesById[id] && clientNotesById[id].name) || '';
          return n.toLowerCase().startsWith(q);
        });
      }
      grid.setAttribute('aria-labelledby', isNew ? 'clientsTabNew' : 'clientsTabMy');
      if(!ids.length){
        grid.style.removeProperty('display');
        let emptyMsg;
        if(isAll && q){
          emptyMsg = `No participants whose name starts with “${escapeHtml(q)}”.`;
        } else if(isAll){
          emptyMsg = 'No participants in the directory.';
        } else if(isNew){
          emptyMsg = 'No new participants scheduled for you on the selected days.';
        } else {
          emptyMsg = 'No participants assigned to you on the term rota yet.';
        }
        grid.innerHTML = `<div class="clients-grid-empty" role="status">${emptyMsg}</div>`;
        return;
      }
      if(isAll && q){
        grid.style.display = 'none';
        grid.innerHTML = '';
        return;
      }
      grid.style.removeProperty('display');
      const P = window.PortalParticipantsSheet;
      grid.innerHTML = ids.map(clientId => {
        const c = (isNew || !clientNotesById[clientId])
          ? portalClientNoteForParticipantsSheet(clientId)
          : clientNotesById[clientId];
        if(!c) return '';
        const gAttr = clientGenderDataAttr(c);
        const myCls = (!isAll && !isNew) ? ' clients-grid-card--my' : '';
        const listMode = isAll ? 'all' : (isNew ? 'new' : 'my');
        const schedIso = isNew ? scheduleBy[clientId] : '';
        const schedOpts = isNew && P && typeof P.newParticipantScheduleLabelOpts === 'function'
          ? P.newParticipantScheduleLabelOpts(clientId, typeof P.buildContext === 'function' ? P.buildContext() : undefined)
          : null;
        return `<button type="button" class="clients-grid-card${myCls}" data-client-id="${escapeHtml(clientId)}" data-list-mode="${listMode}"${gAttr}>${clientsParticipantRowInnerHtml(clientId, c, schedIso, schedOpts)}</button>`;
      }).join('');
    }
    function getClientsDirectoryQuery(){
      const el = document.getElementById('clientsDirectorySearch');
      return el ? String(el.value || '').trim() : '';
    }
    function renderClientsDirectorySuggest(qRaw){
      const box = document.getElementById('clientsDirectorySuggest');
      if(!box) return;
      const q = String(qRaw || '').trim().toLowerCase();
      if(!q){
        box.hidden = true;
        box.innerHTML = '';
        return;
      }
      const ids = dedupeClientIdsByDisplayName(getAllClientIdsCatalog()).filter(id => {
        const n = (clientNotesById[id] && clientNotesById[id].name) || '';
        return n.toLowerCase().startsWith(q);
      }).slice(0, 14);
      if(!ids.length){
        box.hidden = true;
        box.innerHTML = '';
        return;
      }
      box.hidden = false;
      box.innerHTML = ids.map((clientId, i) => {
        const c = clientNotesById[clientId];
        if(!c) return '';
        const gAttr = clientGenderDataAttr(c);
        return `<button type="button" role="option" class="clients-suggest-option" id="clientsSuggestOpt-${i}" data-client-id="${escapeHtml(clientId)}"${gAttr}>${clientsParticipantRowInnerHtml(clientId, c)}</button>`;
      }).join('');
    }
    function refreshClientsAllTabUI(){
      const allBtn = document.getElementById('clientsTabAll');
      if(!allBtn || !allBtn.classList.contains('is-active')) return;
      const q = getClientsDirectoryQuery();
      renderClientsDirectorySuggest(q);
      renderClientsSheetList('all', q);
    }
    function pickClientFromDirectorySearch(clientId){
      const search = document.getElementById('clientsDirectorySearch');
      const sug = document.getElementById('clientsDirectorySuggest');
      if(search) search.value = '';
      if(sug){
        sug.hidden = true;
        sug.innerHTML = '';
      }
      renderClientsSheetList('all', '');
      const item = buildClientDirectorySheetItem(clientId, CLIENT_DIRECTORY_PREP_LINE);
      if(item){
        item.directoryProfile = true;
        openClient(item);
      }
    }
    function setClientsSheetTab(mode){
      const myBtn = document.getElementById('clientsTabMy');
      const newBtn = document.getElementById('clientsTabNew');
      const allBtn = document.getElementById('clientsTabAll');
      if(mode === 'all') mode = 'my';
      let isMy = mode === 'my';
      let isNew = mode === 'new';
      if(isNew && newBtn && newBtn.hidden){ isNew = false; isMy = true; }
      const tools = document.getElementById('clientsAllToolsWrap');
      if(tools){
        tools.hidden = true;
        const si = document.getElementById('clientsDirectorySearch');
        if(si) si.value = '';
        const sug = document.getElementById('clientsDirectorySuggest');
        if(sug){
          sug.hidden = true;
          sug.innerHTML = '';
        }
      }
      if(myBtn){
        myBtn.classList.toggle('is-active', isMy);
        myBtn.setAttribute('aria-selected', isMy ? 'true' : 'false');
      }
      if(newBtn){
        newBtn.classList.toggle('is-active', isNew);
        newBtn.setAttribute('aria-selected', isNew ? 'true' : 'false');
      }
      if(allBtn){
        allBtn.classList.remove('is-active');
        allBtn.setAttribute('aria-selected', 'false');
      }
      const grid = document.getElementById('clientsListGrid');
      if(grid) grid.setAttribute('aria-labelledby', isNew ? 'clientsTabNew' : 'clientsTabMy');
      if(isMy) renderClientsSheetList('my');
      else if(isNew) renderClientsSheetList('new');
      else refreshClientsAllTabUI();
    }

    const POOL_TIER_META = {
      fish: {
        label: 'Teaching pool',
        svg: '<svg class="session-pool-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="13" cy="12" rx="7" ry="4"/><path d="M6 12H2"/><path d="M6 12c0-1 1.2-2.2 3-2.7"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/></svg>'
      },
      shark: {
        label: 'Main pool',
        svg: '<svg class="session-pool-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill="currentColor" d="M22 12L10 4v4.5c-4 .3-7 2.5-8 5.5 1 3 4 5.2 8 5.5V20l12-8z"/></svg>'
      },
      dolphin: {
        label: 'Lanes',
        svg: '<svg class="session-pool-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 12h16M4 16h16"/></svg>'
      },
      small: {
        label: 'Small pool',
        svg: '<svg class="session-pool-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8" ry="5"/></svg>'
      }
    };

    function normalizeVenueKey(v){
      return String(v || '').trim().toLowerCase();
    }
    function normalizeActivityKey(a){
      return String(a || '').trim().toLowerCase().replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    /** Client sheet service row: roster labels → one programme button (e.g. Aquatic Activity → Swimming). */
    function canonicalServiceActivityForSheet(raw){
      const k = normalizeActivityKey(raw);
      if(k === 'swimming' || k === 'swimming activity' || k === 'aquatic activity' || k === 'aquatic activities' || k === 'multi activity')
        return 'Swimming';
      if(k === 'climbing') return 'Climbing';
      if(k === 'fitness') return 'Fitness';
      const t = String(raw || '').trim();
      if(!t) return 'Swimming';
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
    /** Roster `service` column: pool placement (not programme name). */
    function parseRosterPoolServiceString(serviceStr){
      const raw = String(serviceStr || '').trim();
      if(!raw) return null;
      const compact = raw.replace(/\s+/g, ' ').trim();
      const low = compact.toLowerCase();
      if(low === 'teaching pool') return 'Teaching Pool';
      if(low === 'small pool') return 'Small Pool';
      if(low === 'big pool') return 'Big Pool';
      const m = compact.match(/^\s*lane\s*\(\s*(se|de)\s*\)\s*$/i);
      if(m) return 'Lane (' + m[1].toUpperCase() + ')';
      return null;
    }
    function inferLaneBracketFromClientNotes(c){
      if(!c) return null;
      const blob = [c.generalLead, c.specialty, c.poolNotes].filter(Boolean).join(' ').toLowerCase();
      if(/\blane\s*\(\s*se\s*\)|\(\s*se\s*\)/i.test(blob)) return 'SE';
      if(/\blane\s*\(\s*de\s*\)|\(\s*de\s*\)|\bdeep\s+end\b/i.test(blob)) return 'DE';
      return null;
    }
    /** Sunday SwimFarm aquatic: 9–9.30 = Small Pool; 2–3 block = Big Pool (never Teaching Pool). */
    function portalCorrectSundaySwimFarmPoolArea(sessionRow, viewDay){
      const day = String(viewDay || (sessionRow && sessionRow.day) || '').trim().toLowerCase();
      if(day !== 'sunday') return null;
      if(normalizeVenueKey(sessionRow && sessionRow.venue) !== 'swimfarm') return null;
      const act = normalizeActivityKey(sessionRow && (sessionRow.activity || sessionRow.rosterService || sessionRow.service));
      if(act !== 'aquatic activity' && act !== 'aquatic activities') return null;
      const slot = String(sessionRow && (sessionRow.timeSlotLabel || sessionRow.time_slot) || '').trim().toLowerCase();
      if(slot === '9 to 9.30') return 'Small Pool';
      if(slot === '2 to 2.30' || slot === '2.30 to 3') return 'Big Pool';
      return null;
    }
    /** Per-session pool from roster `area` column (wins over global client notes). */
    function inferPoolTierFromRosterArea(sessionRow, viewDay){
      const corrected = portalCorrectSundaySwimFarmPoolArea(sessionRow, viewDay);
      if(corrected){
        if(corrected === 'Small Pool') return 'small';
        if(corrected === 'Big Pool') return 'shark';
      }
      const area = String(sessionRow && (sessionRow.rosterArea != null ? sessionRow.rosterArea : sessionRow.area) || '').trim().toLowerCase();
      if(area === 'teaching pool') return 'fish';
      if(area === 'small pool') return 'small';
      if(area === 'big pool') return 'shark';
      if(/^lane\s*\(\s*se\s*\)$/i.test(area)) return 'dolphin';
      if(/^lane\s*\(\s*de\s*\)$/i.test(area)) return 'dolphin';
      return null;
    }
    function rosterAreaToPoolLabel(sessionRow, viewDay){
      const corrected = portalCorrectSundaySwimFarmPoolArea(sessionRow, viewDay);
      if(corrected) return corrected;
      const raw = String(sessionRow && (sessionRow.rosterArea != null ? sessionRow.rosterArea : sessionRow.area) || '').trim();
      if(!raw) return null;
      const low = raw.toLowerCase();
      if(low === 'teaching pool') return 'Teaching Pool';
      if(low === 'small pool') return 'Small Pool';
      if(low === 'big pool') return 'Big Pool';
      const laneM = raw.match(/^lane\s*\(\s*(se|de)\s*\)$/i);
      if(laneM) return 'Lane (' + laneM[1].toUpperCase() + ')';
      if(/pool|lane/i.test(raw)) return raw;
      return null;
    }
    function splitPoolLabelTwoLines(label){
      const s = String(label || '').trim();
      if(!s) return { line1: '', line2: '' };
      const laneM = s.match(/^Lane\s*\(\s*(SE|DE)\s*\)$/i);
      if(laneM) return { line1: 'Lane', line2: '(' + laneM[1].toUpperCase() + ')' };
      const idx = s.toLowerCase().lastIndexOf(' pool');
      if(idx > 0) return { line1: s.slice(0, idx).trim(), line2: 'Pool' };
      return { line1: s, line2: '' };
    }
    function mapPoolTierToLocationLabel(tier, clientNotes, sessionRow, viewDay){
      if(tier === 'fish') return 'Teaching Pool';
      if(tier === 'small') return 'Small Pool';
      if(tier === 'shark') return 'Big Pool';
      if(tier === 'dolphin'){
        const fromArea = sessionRow && typeof rosterAreaToPoolLabel === 'function'
          ? rosterAreaToPoolLabel(sessionRow, viewDay)
          : null;
        if(fromArea && /^lane\s*\(/i.test(fromArea)) return fromArea;
        return 'Lane (' + (inferLaneBracketFromClientNotes(clientNotes) || 'SE') + ')';
      }
      return null;
    }
    function resolvePoolLocationLabelFromSession(s, activity, clientNotes, viewDay){
      const fromSvc = parseRosterPoolServiceString(s && s.service);
      if(fromSvc) return fromSvc;
      const fromArea = rosterAreaToPoolLabel(s, viewDay);
      if(fromArea) return fromArea;
      if(!shouldShowPoolSymbolForSession(s, activity, viewDay) || !isPoolTierActivity(activity)) return null;
      const tier = resolvePoolTier(s, activity, clientNotes, viewDay);
      return tier ? mapPoolTierToLocationLabel(tier, clientNotes, s, viewDay) : null;
    }
    /** Activities that can carry a pool-tier glyph when venue/day rules match. */
    function isPoolTierActivity(activity){
      const k = normalizeActivityKey(activity);
      return k === 'swimming' || k === 'swimming activity' || k === 'aquatic activity' || k === 'aquatic activities' || k === 'multi activity';
    }
    /**
     * Today third column: pool placement from roster `service` or pool programme at these venues.
     */
    function shouldShowPoolSymbolForSession(sessionRow, activity, viewDay){
      if(parseRosterPoolServiceString(sessionRow && sessionRow.service)) return true;
      const venue = normalizeVenueKey(sessionRow.venue);
      const day = String(viewDay || '').trim().toLowerCase();
      const act = normalizeActivityKey(activity);
      const poolVenue = venue === 'acton' || venue === 'swimfarm' || venue === 'northolt';
      if(poolVenue && isPoolTierActivity(activity)) return true;
      if(day === 'sunday' && venue === 'westway' && (act === 'aquatic activity' || act === 'multi activity' || act === 'swimming activity')) return true;
      return false;
    }
    /**
     * Pool tier: session.poolTier wins; else optional c.poolTier; else keywords in notes (EN/ES).
     * Refine keyword rules when rota copy is final.
     */
    function inferPoolTierFromNotes(c){
      if(!c) return null;
      if(c.poolTier){
        const t = String(c.poolTier).toLowerCase();
        if(POOL_TIER_META[t]) return t;
      }
      const blob = [c.generalLead, c.specialty, c.specialtyFitness, c.specialtyClimbing, c.poolNotes].filter(Boolean).join(' ').toLowerCase();
      if(/\b(teaching\s+pool|shallow|piscina\s+de\s+enseñanza|piscina\s+pequeña|poca\s+profundidad)\b/.test(blob)) return 'fish';
      if(/\bteaching\b/.test(blob)) return 'fish';
      if(/\bsmall\s+pool\b/.test(blob)) return 'small';
      if(/\b(main\s+pool|big\s+pool|deeper|deep\s+end|piscina\s+principal|fondo|profunda)\b/.test(blob)) return 'shark';
      if(/\blane\b/.test(blob) && /\bdeep\b/.test(blob)) return 'shark';
      if(/\b(lanes|lane\s+swim|in\s+lanes|carril|carriles|calles)\b/.test(blob)) return 'dolphin';
      return null;
    }
    function resolvePoolTier(sessionRow, activity, clientNotes, viewDay){
      if(!shouldShowPoolSymbolForSession(sessionRow, activity, viewDay)) return null;
      if(!isPoolTierActivity(activity)) return null;
      if(sessionRow.poolTier){
        const t = String(sessionRow.poolTier).toLowerCase();
        if(POOL_TIER_META[t]) return t;
      }
      const fromArea = inferPoolTierFromRosterArea(sessionRow, viewDay);
      if(fromArea) return fromArea;
      const sundayFallback = portalCorrectSundaySwimFarmPoolArea(sessionRow, viewDay);
      if(sundayFallback === 'Big Pool') return 'shark';
      if(sundayFallback === 'Small Pool') return 'small';
      return inferPoolTierFromNotes(clientNotes) || 'fish';
    }

    function portalCalendarDateIsTodayLocal(isoYmd){
      try{
        return String(isoYmd || '').trim() === portalIsoYmdFromDate(new Date());
      }catch(_){
        return false;
      }
    }
    /** ISO (YYYY-MM-DD) for the dashboard “selected day” anchor — URL date lock + DEMO_VIEW_DAY, not device-only. */
    function portalSelectedViewCalendarIsoYmd(){
      try{
        const viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : (typeof window !== 'undefined' && window.DEMO_VIEW_DAY) || '').trim();
        if(!viewDay || typeof getViewAnchorCalendarDate !== 'function' || typeof portalIsoYmdFromDate !== 'function') return '';
        const anchor = getViewAnchorCalendarDate(viewDay);
        if(!anchor || isNaN(anchor.getTime())) return '';
        return portalIsoYmdFromDate(anchor);
      }catch(_){ return ''; }
    }
    /** True when `isoYmd` is the calendar date currently shown in the selected-day session list (Today / Week / Term). */
    function portalCalendarDateIsSelectedDashboardDay(isoYmd){
      const iso = String(isoYmd || '').trim();
      const sel = portalSelectedViewCalendarIsoYmd();
      return !!iso && !!sel && iso === sel;
    }
    function portalTodayItemShowsAdminShiftBadge(item){
      return !!(item && item.scheduleAdminAdjusted && !item.portalOverrideAlertPill && !item.portalOverrideHideAdminBadge);
    }
    function portalTodayItemShowsShadowingHostAlert(item){
      return !!(item && item.portalShadowingHostAlert && Array.isArray(item.portalShadowingHostLabels) && item.portalShadowingHostLabels.length);
    }
    function portalTodayItemUsesAdminShiftCardStyle(item){
      if(portalTodayItemShowsShadowingHostAlert(item)) return false;
      if(portalTodayItemShowsAdminShiftBadge(item)) return true;
      if(typeof portalSessionItemRosterTimeUpdated === 'function' && portalSessionItemRosterTimeUpdated(item)) return true;
      return false;
    }
    function portalShadowingHostBadgeHtml(labels){
      if(!Array.isArray(labels) || !labels.length) return '';
      return labels.map(function(lab){
        const esc = escapeHtml(String(lab || '').trim());
        if(!esc) return '';
        return '<span class="portal-sched-ov-badge override--shadowing-host" title="A colleague is shadowing your session">' + esc + '</span>';
      }).join('');
    }
    function portalTodaySessionOverrideCardClass(item){
      const t = String(item && item.portalOverrideCardTone || '').trim().toLowerCase();
      if(t === 'green') return ' session-card--ov-green';
      if(t === 'yellow') return ' session-card--ov-yellow';
      if(t === 'training') return ' session-card--ov-training';
      if(t === 'shadowing') return ' session-card--ov-shadowing';
      if(t === 'meeting') return ' session-card--ov-meeting';
      if(t === 'pink') return ' session-card--ov-pink';
      if(t === 'trial' || t === 'purple') return ' session-card--ov-trial';
      if(t === 'blue') return ' session-card--ov-blue';
      if(t === 'red') return ' session-card--ov-red';
      return '';
    }
    function portalOverrideTypeClass(overrideType){
      const t = String(overrideType || '').trim();
      if(t === 'client_absence_announced') return 'override--absent';
      if(t === 'slot_close') return 'override--closed';
      if(t === 'slot_open') return 'override--slot-open';
      if(t === 'client_replace_in_slot' || t === 'replace_participant') return 'override--replace';
      if(t === 'instructor_reassign') return 'override--instructor';
      if(t === 'slot_update') return 'override--updated';
      return '';
    }
    function portalTodayItemOverrideClass(item){
      const pill = String(item && item.portalOverrideAlertPill || '').trim().toUpperCase();
      if(pill === 'ABSENT') return 'override--absent';
      if(pill === 'CANCELLED') return 'override--portal-cancelled';
      const type = item && item.__portalScheduleOverride ? String(item.__portalScheduleOverride.override_type || '').trim() : '';
      if(type === 'slot_clear_client' && item && item.__portalScheduleOverride && item.__portalScheduleOverride.payload && item.__portalScheduleOverride.payload.cancelled_by_admin) return 'override--portal-cancelled';
      if(item && item.portalOverrideTrialTag) return 'override--trial';
      if(type === 'client_replace_in_slot' && item && item.__portalScheduleOverride && portalOverrideIsTrial(item.__portalScheduleOverride)) return 'override--trial';
      if(type) return portalOverrideTypeClass(type);
      const manual = String(item && item.__portalBaseSession && item.__portalBaseSession.override || '').trim().toUpperCase();
      if(manual === 'CANCELLED') return 'override--portal-cancelled';
      if(manual === 'ABSENT') return 'override--absent';
      if(manual === 'CLOSED') return 'override--closed';
      if(manual === 'REPLACED') return 'override--replace';
      if(manual === 'REASSIGNED') return 'override--instructor';
      return '';
    }
    function portalOverrideIsTrial(ov){
      if(!ov) return false;
      var p = ov.payload || {};
      if(typeof p === 'string'){
        try{ p = JSON.parse(p); }catch(_){ p = {}; }
      }
      if(p.is_trial === true || String(p.booking_kind || '').trim().toLowerCase() === 'trial') return true;
      return String(p.session_kind || '').trim().toLowerCase() === 'trial';
    }
    function portalRosterParticipantNameLooksTrial(name){
      var lab = String(name || '').trim();
      return /\(\s*trial\b/i.test(lab) || /\btrial\s+\d{1,2}[\/\.-]\d{1,2}/i.test(lab);
    }
    function portalParticipantDisplayName(raw){
      var s = String(raw || '').trim();
      if(!s) return s;
      var stripped = s.replace(/\s*\(\s*trial[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
      return stripped || s;
    }
    function portalTodayClientNotesForSession(s){
      const cid = String(s && s.clientId || '').trim();
      const low = cid.toLowerCase();
      try{
        const mapped = (typeof clientNotesById !== 'undefined' && clientNotesById)
          ? (clientNotesById[cid] || clientNotesById[low])
          : null;
        if(mapped && String(mapped.name || '').trim()) return mapped;
      }catch(_){}
      const disp = portalParticipantDisplayName(String(s && (s.clientDisplay || s.clientName || cid) || '').trim());
      return {
        name: disp || 'Participant',
        generalLead: '',
        specialty: '',
        specialtyClimbing: '',
        specialtyFitness: '',
        generalInfoSheet: ''
      };
    }
    function portalOverrideReplacementClientId(payload){
      if(!payload) return '';
      if(typeof payload === 'string'){
        try{ payload = JSON.parse(payload); }catch(_){ return ''; }
      }
      if(typeof payload !== 'object') return '';
      const toId = payload.to_client_id != null ? String(payload.to_client_id).trim().toLowerCase() : '';
      if(toId) return toId;
      const repId = payload.replacement_client_id != null ? String(payload.replacement_client_id).trim().toLowerCase() : '';
      if(repId) return repId;
      return '';
    }
    function portalOverrideReplacementClientName(payload){
      if(!payload) return '';
      if(typeof payload === 'string'){
        try{ payload = JSON.parse(payload); }catch(_){ return ''; }
      }
      if(typeof payload !== 'object') return '';
      const toName = payload.to_client_name != null ? String(payload.to_client_name).trim() : '';
      if(toName) return toName;
      const repName = payload.replacement_client_name != null ? String(payload.replacement_client_name).trim() : '';
      if(repName) return repName;
      return '';
    }
    /**
     * For client_replace_in_slot, the name shown to staff must be the replacement participant
     * (payload / notes), not anchor_client_id (regular slot client on the spreadsheet).
     */
    function portalOverrideReplaceParticipantDisplayName(row){
      const t = String(row && row.override_type || '').trim();
      if(t !== 'client_replace_in_slot') return '';
      let nm = '';
      try{
        nm = portalOverrideReplacementClientName(row && row.payload) || '';
      }catch(_){}
      if(!nm){
        let slug = '';
        try{
          slug = portalOverrideReplacementClientId(row && row.payload) || '';
        }catch(_){}
        if(slug){
          try{
            const low = portalNormKeyStr(slug);
            const c = (typeof clientNotesById !== 'undefined' && clientNotesById)
              ? (clientNotesById[slug] || clientNotesById[low])
              : null;
            if(c && c.name) nm = String(c.name).trim();
          }catch(_){}
        }
      }
      return String(nm == null ? '' : nm).trim();
    }
    function isSessionStartedForItem(item){
      if(STAFF_DASH_FORCE_SESSIONS_ENDED) return true;
      try{
        if(portalStaffIsDemoAccount() && item && item.sessionKey && window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__ && window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__.has(item.sessionKey)){
          return false;
        }
      }catch(_e){}
      const t = item && item.sessionStartTs;
      if(t == null) return false;
      return Date.now() >= t;
    }
    function portalSessionItemRosterTimeUpdated(item){
      if(!item) return false;
      if(!!item.portalRosterTimeUpdated) return true;
      const ovType = item && item.__portalScheduleOverride ? String(item.__portalScheduleOverride.override_type || '').trim() : '';
      if(ovType === 'slot_update') return true;
      return String(item.portalOverrideAlertPill || '').trim().toUpperCase() === 'UPDATED';
    }

    function portalSessionAddSplitNames(raw){
      return String(raw || '').split(/[,;|/]+/).map(function(p){ return p.trim(); }).filter(Boolean);
    }
    function portalSessionAddPeopleChips(kind, payload, ov, sessionDateIso){
      payload = payload && typeof payload === 'object' ? payload : {};
      const trainer = String(payload.trainer || '').trim();
      if(kind === 'training'){
        return portalSessionAddSplitNames(trainer).map(function(n){ return 'with ' + n; });
      }
      if(kind === 'shadowing'){
        const label = portalSessionAddShadowingChipLabel(payload, ov, sessionDateIso);
        return label ? [label] : [];
      }
      if(kind === 'meeting'){
        return [];
      }
      return [];
    }
    function portalShadowingHostDisplayName(staffId){
      const k = String(staffId || '').trim().toLowerCase();
      if(!k) return '';
      try{
        if(typeof window.portalStaffDisplayName === 'function'){
          const dn = String(window.portalStaffDisplayName(k) || '').trim();
          if(dn) return dn.indexOf(' ') >= 0 ? dn : (dn.split(/\s+/).filter(Boolean)[0] || dn);
        }
        const src = typeof window !== 'undefined' ? window.STAFF_DASHBOARD_SOURCE : null;
        const prof = src && src.staffProfiles ? (src.staffProfiles[k] || src.staffProfiles[staffId]) : null;
        const nm = prof && String(prof.staffName || prof.name || '').trim();
        if(nm) return nm.indexOf(' ') >= 0 ? nm : (nm.split(/\s+/).filter(Boolean)[0] || nm);
      }catch(_){}
      return k.charAt(0).toUpperCase() + k.slice(1);
    }
    function portalShadowingParticipantForSessionAdd(ov, sessionDateIso){
      const iso = normaliseIsoDate(sessionDateIso);
      if(!ov || !iso) return '';
      let pl = ov.payload;
      try{ if(typeof pl === 'string') pl = JSON.parse(pl); }catch(_){ pl = ov.payload; }
      pl = pl && typeof pl === 'object' ? pl : {};
      const fromPayload = String(pl.participant || pl.client_name || pl.client || '').trim();
      if(fromPayload) return portalParticipantDisplayName(fromPayload);
      const trainer = String(pl.trainer || '').trim();
      if(!trainer) return '';
      const dayWord = typeof portalWeekdayLongEnGB === 'function'
        ? portalWeekdayLongEnGB(new Date(iso + 'T12:00:00'))
        : '';
      if(!dayWord) return '';
      const ovStart = portalHmFromDbTime(ov.anchor_start) || '';
      const ovEnd = portalHmFromDbTime(ov.anchor_end) || ovStart;
      const isReal = function(s){
        const st = String(s && s.status || '').toLowerCase();
        if(st === 'closed' || st === 'available') return false;
        const cid = String(s && s.clientId || '').toLowerCase();
        if(!cid || cid === 'closed' || cid === 'available') return false;
        const nm = String(s && (s.clientDisplay || s.clientName || '') || '').trim().toLowerCase();
        if(/no\s*participant/.test(nm) || /no\s*client/.test(nm)) return false;
        return true;
      };
      let found = '';
      (sessionsModel || []).forEach(function(s){
        if(found || !s || !isReal(s)) return;
        if(String(s.day || '').trim() !== dayWord) return;
        if(typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'
          && !portalSessionSpreadsheetRowMatchesCalendarDate(s, iso, dayWord)) return;
        if(ovStart && s.start && !portalHmRangeOverlaps(ovStart, ovEnd, s.start, s.end)) return;
        const hostId = String(s.staffId || '').trim();
        const hostName = portalShadowingHostDisplayName(hostId);
        if(!portalStaffNameMatchesShadowHost(trainer, hostId, hostName)) return;
        const nm = portalParticipantDisplayName(String(s.clientDisplay || s.clientName || s.clientId || '').trim());
        if(nm) found = nm;
      });
      return found;
    }
    function portalSessionAddShadowingChipLabel(payload, ov, sessionDateIso){
      payload = payload && typeof payload === 'object' ? payload : {};
      const hosts = portalSessionAddSplitNames(String(payload.trainer || '').trim());
      const host = hosts[0] || '';
      const participant = portalShadowingParticipantForSessionAdd(ov, sessionDateIso);
      const participantLabel = participant ? String(participant).trim().toUpperCase() : '';
      if(host && participantLabel) return host + ' / ' + participantLabel;
      if(hosts.length > 1) return hosts.join(' / ');
      return host || participant || '';
    }
    function portalKnownMeetingGroupKeys(){
      return {
        swimminginstructors: 'Swimming Instructors',
        climbinginstructors: 'Climbing Instructors',
        supportstaff: 'Support Staff',
        poolleads: 'Leads',
        leads: 'Leads',
        allceos: 'All CEOs (group)',
        ceopsliaison: 'CEO & Ops liaison (group)'
      };
    }
    function portalNormMeetingGroupKey(label){
      return String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    function portalLooksLikeMeetingGroupLabel(label){
      const t = String(label || '').trim();
      if(!t) return false;
      if(portalKnownMeetingGroupKeys()[portalNormMeetingGroupKey(t)]) return true;
      return /\b(instructors?|staff|leads?)\b/i.test(t) && t.split(/\s+/).filter(Boolean).length >= 2;
    }
    function portalSessionAddMeetingDetail(payload){
      payload = payload && typeof payload === 'object' ? payload : {};
      const known = portalKnownMeetingGroupKeys();
      let group = String(payload.group || payload.audience || payload.team || payload.audience_group || payload.staff_group || '').trim();
      let directors = [];
      const rawAtt = payload.attendees != null ? payload.attendees : payload.participants;
      if(Array.isArray(rawAtt)){
        directors = rawAtt.map(function(x){ return String(x || '').trim(); }).filter(Boolean);
      } else if(rawAtt){
        directors = portalSessionAddSplitNames(rawAtt);
      }
      if(group){
        const canon = known[portalNormMeetingGroupKey(group)];
        if(canon) group = canon;
      }
      if(!group && directors.length){
        const first = directors[0];
        const nk = portalNormMeetingGroupKey(first);
        if(known[nk]){
          group = known[nk];
          directors = directors.slice(1);
        } else if(portalLooksLikeMeetingGroupLabel(first)){
          group = first;
          directors = directors.slice(1);
        }
      }
      if(!directors.length && payload.trainer){
        directors = portalSessionAddSplitNames(payload.trainer);
      }
      return { group: group, directors: directors };
    }
    function portalTodayMeetingDetailFromItem(item){
      if(!item) return null;
      const detail = item.portalSessionAddMeetingDetail;
      if(detail && (detail.group || (detail.directors && detail.directors.length))) return detail;
      if(String(item.clientId || '').trim().toLowerCase() === 'meeting' && Array.isArray(item.portalSessionAddChips) && item.portalSessionAddChips.length){
        return portalSessionAddMeetingDetail({ attendees: item.portalSessionAddChips });
      }
      return null;
    }
    function portalSessionStackedChipsRowsHtml(detail, tone){
      detail = detail || {};
      const group = String(detail.group || '').trim();
      const directors = Array.isArray(detail.directors)
        ? detail.directors.map(function(n){ return String(n || '').trim(); }).filter(Boolean)
        : [];
      const mod = tone === 'training' ? 'training' : 'meeting';
      const cls = 'portal-session-slot-chip portal-session-slot-chip--' + mod;
      let out = '';
      if(group){
        const g = escapeHtml(group);
        out += '<div class="session-meeting-chip-row"><span class="' + cls + '" aria-label="' + g + '"><span>' + g + '</span></span></div>';
      }
      if(directors.length){
        out += '<div class="session-meeting-chip-row session-meeting-chip-row--directors">';
        directors.forEach(function(n){
          const esc = escapeHtml(n);
          if(esc) out += '<span class="' + cls + '" aria-label="' + esc + '"><span>' + esc + '</span></span>';
        });
        out += '</div>';
      }
      return out;
    }
    function portalMeetingSessionChipsRowsHtml(detail){
      return portalSessionStackedChipsRowsHtml(detail, 'meeting');
    }
    function portalSessionAddTrainingDetail(payload, staffRoleTrack){
      const detail = portalSessionAddMeetingDetail(payload);
      if(detail.group || !detail.directors.length) return detail;
      const track = String(staffRoleTrack || '').toLowerCase().replace(/[\s_-]+/g, '');
      const groupByTrack = {
        swimming: 'Swimming Instructors',
        swimminglead: 'Swimming Instructors',
        lead: 'Leads',
        climbing: 'Climbing Instructors',
        support: 'Support Staff',
        supportlead: 'Support Staff'
      };
      const inferred = groupByTrack[track];
      if(inferred) return { group: inferred, directors: detail.directors };
      return detail;
    }
    function portalTodayStackedPeopleDetailFromItem(item){
      if(!item) return null;
      const cid = String(item.clientId || '').trim().toLowerCase();
      if(cid !== 'meeting' && cid !== 'training') return null;
      const detail = item.portalSessionAddMeetingDetail;
      if(detail && (detail.group || (detail.directors && detail.directors.length))) return detail;
      if(cid === 'meeting' && Array.isArray(item.portalSessionAddChips) && item.portalSessionAddChips.length){
        return portalSessionAddMeetingDetail({ attendees: item.portalSessionAddChips });
      }
      if(cid === 'training'){
        if(Array.isArray(item.portalSessionAddChips) && item.portalSessionAddChips.length){
          const names = item.portalSessionAddChips.map(function(c){
            return String(c || '').replace(/^with\s+/i, '').trim();
          }).filter(Boolean);
          return portalSessionAddTrainingDetail({ trainer: names.join(', ') }, staffRoleTrackForTodayBuild());
        }
        const pl = item.__portalScheduleOverride && item.__portalScheduleOverride.payload;
        if(pl) return portalSessionAddTrainingDetail(pl, staffRoleTrackForTodayBuild());
      }
      return null;
    }
    function todaySessionStackedPeopleChipsRowHtml(item){
      if(String(item && item.portalOverrideAlertPill || '').trim().toUpperCase() === 'COMPLETED') return '';
      const cid = String(item && item.clientId || '').trim().toLowerCase();
      if(cid !== 'meeting' && cid !== 'training') return '';
      const detail = portalTodayStackedPeopleDetailFromItem(item);
      if(!detail || (!detail.group && !(detail.directors && detail.directors.length))) return '';
      const rows = portalSessionStackedChipsRowsHtml(detail, 'training');
      if(!rows) return '';
      return '<div class="session-chips-below-name session-chips-below-name--meeting-stack">' + rows + '</div>';
    }
    function todaySessionMeetingChipsRowHtml(item){
      return todaySessionStackedPeopleChipsRowHtml(item);
    }
    function portalStaffNormRosterKey(v){
      return String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    function portalStaffProfileFirstName(rawKey){
      const k = String(rawKey || '').trim().toLowerCase();
      if(!k) return '';
      try{
        const src = typeof window !== 'undefined' ? window.STAFF_DASHBOARD_SOURCE : null;
        const prof = src && src.staffProfiles ? (src.staffProfiles[k] || src.staffProfiles[rawKey]) : null;
        const nm = prof && String(prof.staffName || prof.name || '').trim();
        if(nm){
          const first = nm.split(/\s+/).filter(Boolean)[0];
          if(first) return first;
        }
      }catch(_){}
      return k.charAt(0).toUpperCase() + k.slice(1);
    }
    function portalStaffNameMatchesShadowHost(trainerName, staffId, staffDisplayName){
      const t = portalStaffNormRosterKey(trainerName);
      if(!t) return false;
      const sid = portalStaffNormRosterKey(staffId);
      let canonical = sid;
      if(typeof window.portalCanonicalStaffRosterKey === 'function'){
        canonical = portalStaffNormRosterKey(window.portalCanonicalStaffRosterKey(staffId));
      }
      if(t === sid || t === canonical) return true;
      const dn = String(staffDisplayName || '').trim();
      if(!dn) return false;
      const parts = dn.split(/\s+/).filter(Boolean);
      const first = parts[0] || '';
      if(portalStaffNormRosterKey(first) === t) return true;
      if(portalStaffNormRosterKey(dn) === t) return true;
      const raw = String(trainerName || '').trim().toLowerCase();
      if(raw && dn.toLowerCase().indexOf(raw) >= 0) return true;
      return first && raw === first.toLowerCase();
    }
    function portalHmRangeOverlaps(aStart, aEnd, bStart, bEnd){
      function toMin(hm){
        const t = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(hm) : String(hm || '').trim();
        if(!t) return null;
        const p = t.split(':');
        const h = Number(p[0]), m = Number(p[1] || 0);
        if(!Number.isFinite(h)) return null;
        return h * 60 + m;
      }
      const as = toMin(aStart), ae = toMin(aEnd || aStart), bs = toMin(bStart), be = toMin(bEnd || bStart);
      if(as == null || bs == null) return true;
      const aEndMin = ae == null ? as : ae;
      const bEndMin = be == null ? bs : be;
      return as < bEndMin && bs < aEndMin;
    }
    function portalShadowingVenuesMatch(ovVenue, sessionVenue){
      const o = String(ovVenue || '').trim().toLowerCase();
      const s = String(sessionVenue || '').trim().toLowerCase();
      if(!o || !s) return true;
      return o === s;
    }
    function portalShadowingRowAppliesToHostSession(row, staffId, staffDisplayName, sessionStart, sessionEnd, sessionVenue){
      if(!row || String(row.status || 'active') !== 'active') return false;
      if(String(row.override_type || '').trim() !== 'session_add') return false;
      let pl = row.payload;
      try{ if(typeof pl === 'string') pl = JSON.parse(pl); }catch(_){ pl = row.payload; }
      if(String(pl && pl.kind || '').trim().toLowerCase() !== 'shadowing') return false;
      const trainer = String(pl && pl.trainer || '').trim();
      const hosts = portalSessionAddSplitNames(trainer);
      const hostMatch = hosts.length
        ? hosts.some(function(h){ return portalStaffNameMatchesShadowHost(h, staffId, staffDisplayName); })
        : portalStaffNameMatchesShadowHost(trainer, staffId, staffDisplayName);
      if(!hostMatch) return false;
      if(!portalShadowingVenuesMatch(row.anchor_venue, sessionVenue)) return false;
      const ovStart = portalHmFromDbTime(row.anchor_start) || '';
      const ovEnd = portalHmFromDbTime(row.anchor_end) || ovStart;
      if(sessionStart && ovStart && !portalHmRangeOverlaps(sessionStart, sessionEnd, ovStart, ovEnd)) return false;
      return true;
    }
    function portalShadowingHostAlertTimeSlotLabel(row, staffId, staffDisplayName){
      const sid = String(staffId || '').trim().toLowerCase();
      const iso = normaliseIsoDate(row && row.session_date);
      if(!sid || !iso) return '';
      const dayWord = typeof portalWeekdayLongEnGB === 'function'
        ? portalWeekdayLongEnGB(new Date(iso + 'T12:00:00'))
        : '';
      if(!dayWord) return '';
      const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
      const isReal = function(s){
        if(baseReal) return baseReal(s, iso);
        const st = String(s && s.status || '').toLowerCase();
        if(st === 'closed' || st === 'available') return false;
        const cid = String(s && s.clientId || '').toLowerCase();
        return Boolean(cid && cid !== 'closed' && cid !== 'available');
      };
      const sessions = typeof portalBaseClientSessionsForCalendarDate === 'function'
        ? portalBaseClientSessionsForCalendarDate(dayWord, iso, sid, isReal)
        : [];
      const ovStart = portalHmFromDbTime(row && row.anchor_start) || '';
      const ovEnd = portalHmFromDbTime(row && row.anchor_end) || ovStart;
      const ovLo = portalHmToMinutes(ovStart);
      const ovHi = portalHmToMinutes(ovEnd || ovStart);
      let minBand = Infinity;
      let maxBand = -Infinity;
      for(let i = 0; i < sessions.length; i++){
        const s = sessions[i];
        if(!s) continue;
        const base = s.__portalBaseSession || s;
        const start = String(base.start || s.start || '').trim();
        const end = String(base.end || s.end || start).trim();
        const venue = String(base.sessionVenue || s.sessionVenue || base.venue || s.venue || '').trim();
        if(!start) continue;
        if(!portalShadowingRowAppliesToHostSession(row, sid, staffDisplayName, start, end, venue)) continue;
        const sLo = portalHmToMinutes(start);
        const sHi = portalHmToMinutes(end || start);
        if(!Number.isFinite(sLo) || !Number.isFinite(sHi)) continue;
        const bandLo = Number.isFinite(ovLo) ? Math.max(sLo, ovLo) : sLo;
        const bandHi = Number.isFinite(ovHi) ? Math.min(sHi, ovHi) : sHi;
        if(bandLo > bandHi) continue;
        if(bandLo < minBand) minBand = bandLo;
        if(bandHi > maxBand) maxBand = bandHi;
      }
      if(Number.isFinite(minBand) && Number.isFinite(maxBand) && maxBand >= minBand){
        const pad = function(n){ return String(n).padStart(2, '0'); };
        const hm = function(total){
          const m = Math.max(0, Math.round(total));
          return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
        };
        return portalFormatRosterBandLabel(hm(minBand), hm(maxBand));
      }
      if(typeof rosterSlotTimeLabel === 'function'){
        return rosterSlotTimeLabel({ start: ovStart, end: ovEnd });
      }
      return ovStart && ovEnd ? (ovStart + ' to ' + ovEnd) : (ovStart || ovEnd || '');
    }
    function portalShadowingObserverChipsForHost(sessionDateIso, staffId, staffDisplayName, startHm, endHm, sessionVenue){
      const iso = normaliseIsoDate(sessionDateIso);
      if(!iso || !staffId) return [];
      const out = [];
      const seen = Object.create(null);
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(normaliseIsoDate(ov.session_date) !== iso) return;
        if(String(ov.status || 'active') !== 'active') return;
        if(String(ov.override_type || '').trim() !== 'session_add') return;
        let pl = ov.payload;
        try{ if(typeof pl === 'string') pl = JSON.parse(pl); }catch(_){ pl = ov.payload; }
        const kind = String(pl && pl.kind || '').trim().toLowerCase();
        if(kind !== 'shadowing') return;
        const trainer = String(pl && pl.trainer || '').trim();
        const hosts = portalSessionAddSplitNames(trainer);
        const hostMatch = hosts.length
          ? hosts.some(function(h){ return portalStaffNameMatchesShadowHost(h, staffId, staffDisplayName); })
          : portalStaffNameMatchesShadowHost(trainer, staffId, staffDisplayName);
        if(!hostMatch) return;
        if(!portalShadowingVenuesMatch(ov.anchor_venue, sessionVenue)) return;
        const ovStart = portalHmFromDbTime(ov.anchor_start) || '';
        const ovEnd = portalHmFromDbTime(ov.anchor_end) || ovStart;
        if(startHm && ovStart && !portalHmRangeOverlaps(startHm, endHm, ovStart, ovEnd)) return;
        const shadowerKey = portalStaffNormRosterKey(ov.anchor_staff_id);
        if(!shadowerKey || seen[shadowerKey]) return;
        seen[shadowerKey] = true;
        const label = portalStaffProfileFirstName(ov.anchor_staff_id) + ' shadowing you';
        out.push(label);
      });
      return out;
    }
    function portalShadowingHostLabelsForDay(sessionDateIso, staffId, staffDisplayName){
      const sid = String(staffId || '').trim().toLowerCase();
      const iso = normaliseIsoDate(sessionDateIso);
      if(!sid || !iso) return [];
      const dayWord = typeof portalWeekdayLongEnGB === 'function'
        ? portalWeekdayLongEnGB(new Date(iso + 'T12:00:00'))
        : '';
      if(!dayWord) return [];
      const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
      const isReal = function(s){
        if(baseReal) return baseReal(s, iso);
        const st = String(s && s.status || '').toLowerCase();
        if(st === 'closed' || st === 'available') return false;
        const cid = String(s && s.clientId || '').toLowerCase();
        return Boolean(cid && cid !== 'closed' && cid !== 'available');
      };
      const sessions = typeof portalBaseClientSessionsForCalendarDate === 'function'
        ? portalBaseClientSessionsForCalendarDate(dayWord, iso, sid, isReal)
        : [];
      const dn = String(staffDisplayName || '').trim();
      const out = [];
      const seen = Object.create(null);
      for(let i = 0; i < sessions.length; i++){
        const s = sessions[i];
        if(!s) continue;
        const base = s.__portalBaseSession || s;
        const start = String(base.start || s.start || '').trim();
        const end = String(base.end || s.end || start).trim();
        const venue = String(base.sessionVenue || s.sessionVenue || base.venue || s.venue || '').trim();
        if(!start) continue;
        const labels = portalShadowingObserverChipsForHost(iso, sid, dn, start, end, venue);
        for(let j = 0; j < labels.length; j++){
          const lab = labels[j];
          if(!lab || seen[lab]) continue;
          seen[lab] = true;
          out.push(lab);
        }
      }
      return out;
    }
    function portalShadowingHostAlertActiveOnDate(sessionDateIso, staffId, staffDisplayName){
      return portalShadowingHostLabelsForDay(sessionDateIso, staffId, staffDisplayName).length > 0;
    }
    function portalShadowingHostOverrideDismissKey(row, staffId){
      const sid = portalNormKeyStr(staffId);
      const oid = String(row && row.id || '').trim();
      const iso = normaliseIsoDate(row && row.session_date);
      return 'shadow-host|' + sid + '|' + (oid || iso);
    }
    function portalShadowingHostOverrideRowsForStaff(staffId, staffDisplayName){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sid) return [];
      const out = [];
      const list = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
      for(let i = 0; i < list.length; i++){
        const r = list[i];
        if(!r || String(r.status || 'active') !== 'active') continue;
        if(String(r.override_type || '').trim() !== 'session_add') continue;
        let pl = r.payload;
        try{ if(typeof pl === 'string') pl = JSON.parse(pl); }catch(_){ pl = r.payload; }
        if(String(pl && pl.kind || '').trim().toLowerCase() !== 'shadowing') continue;
        if(portalStaffKeysMatch(r.anchor_staff_id, sid)) continue;
        const trainer = String(pl && pl.trainer || '').trim();
        const hosts = portalSessionAddSplitNames(trainer);
        const hostMatch = hosts.length
          ? hosts.some(function(h){ return portalStaffNameMatchesShadowHost(h, sid, staffDisplayName); })
          : portalStaffNameMatchesShadowHost(trainer, sid, staffDisplayName);
        if(!hostMatch) continue;
        const iso = normaliseIsoDate(r.session_date);
        if(!iso || typeof portalOverrideRowIsWithinReminderHorizonSessionDate !== 'function' || !portalOverrideRowIsWithinReminderHorizonSessionDate(iso)) continue;
        out.push(r);
      }
      return out;
    }
    function portalShadowingHostQuickMenuCard(row, staffId, staffDisplayName){
      const iso = normaliseIsoDate(row && row.session_date);
      if(!iso) return null;
      const shadowerName = typeof portalStaffProfileFirstName === 'function'
        ? portalStaffProfileFirstName(row.anchor_staff_id)
        : String(row.anchor_staff_id || '').trim();
      const datePart = typeof portalOverrideCardDateParenLabel === 'function'
        ? portalOverrideCardDateParenLabel(iso)
        : '';
      const subParts = [];
      if(shadowerName) subParts.push(shadowerName + ' shadowing you');
      const timeLabel = portalShadowingHostAlertTimeSlotLabel(row, sid, staffDisplayName);
      if(timeLabel) subParts.push(timeLabel);
      let pl = null;
      try{
        pl = row && row.payload && typeof row.payload === 'object' ? row.payload : JSON.parse(String(row && row.payload || ''));
      }catch(_){ pl = null; }
      const locRaw = String(pl && pl.location || '').trim().toLowerCase();
      const locLabel = locRaw === 'both' ? 'Room & Pool'
        : (locRaw === 'pool' ? 'Pool' : (locRaw === 'room' ? 'Room' : ''));
      if(locLabel) subParts.push(locLabel);
      const host = portalShadowingTrainerDisplayName(pl && pl.trainer);
      if(host) subParts.push(host);
      const sid = portalNormKeyStr(staffId);
      return {
        id: portalShadowingHostOverrideDismissKey(row, sid),
        iso: iso,
        title: 'Schedule change' + (datePart ? (' ' + datePart) : ''),
        sub: subParts.join(' · '),
        kind: 'roster_day'
      };
    }
    function portalShadowingHostQuickMenuItemsForAttention(staffId, staffDisplayName, dismissed, seen){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sid) return [];
      const out = [];
      const rows = portalShadowingHostOverrideRowsForStaff(sid, staffDisplayName);
      for(let i = 0; i < rows.length; i++){
        const r = rows[i];
        const card = portalShadowingHostQuickMenuCard(r, sid, staffDisplayName);
        if(!card || !card.id || dismissed[card.id] || seen[card.id]) continue;
        seen[card.id] = true;
        out.push(Object.assign({}, card, { _sort: new Date(r.created_at || 0).getTime() || 0 }));
      }
      return out;
    }
    function portalStaffHasUpcomingShadowingHostAlert(staffId, staffDisplayName){
      const dismissed = {};
      const dk = typeof portalQuickMenuLoadDismissedOverrideKeys === 'function' ? portalQuickMenuLoadDismissedOverrideKeys() : [];
      for(let d = 0; d < dk.length; d++) dismissed[dk[d]] = true;
      const sid = String(staffId || '').trim().toLowerCase();
      const rows = portalShadowingHostOverrideRowsForStaff(sid, staffDisplayName);
      for(let i = 0; i < rows.length; i++){
        const card = portalShadowingHostQuickMenuCard(rows[i], sid, staffDisplayName);
        if(card && card.id && !dismissed[card.id]) return true;
      }
      return false;
    }
    function portalAttachShadowingObserverChips(items, sessionDateIso, staffId, staffDisplayName){
      if(!Array.isArray(items) || !items.length) return items || [];
      const sid = String(staffId || '').trim().toLowerCase();
      const dn = String(staffDisplayName || '').trim();
      if(!sid) return items;
      const skipIds = { shadowing: 1, training: 1, meeting: 1 };
      return items.map(function(it){
        if(!it || it.kind !== 'client') return it;
        const cid = String(it.clientId || '').trim().toLowerCase();
        if(skipIds[cid]) return it;
        const base = it.__portalBaseSession || {};
        const labels = portalShadowingObserverChipsForHost(
          sessionDateIso,
          sid,
          dn,
          base.start,
          base.end,
          base.sessionVenue || it.sessionVenue || base.venue || it.venue
        );
        if(!labels.length) return it;
        return Object.assign({}, it, {
          portalShadowingHostAlert: true,
          portalShadowingHostLabels: labels
        });
      });
    }
    function portalSessionAddAreaNoteLabel(locRaw){
      if(locRaw === 'pool') return 'Teaching Pool';
      if(locRaw === 'room') return 'Hub Room';
      if(locRaw === 'both') return 'Hub Room';
      return '';
    }
    function portalPlainSessionSlotChipsHtml(chips, tone){
      if(!Array.isArray(chips) || !chips.length) return '';
      const t = String(tone || '').trim().toLowerCase();
      const cls = t === 'training' ? 'portal-session-slot-chip--training'
        : (t === 'shadowing' ? 'portal-session-slot-chip--shadowing'
        : (t === 'meeting' ? 'portal-session-slot-chip--meeting' : 'portal-session-slot-chip--plain'));
      return chips.map(function(tx){
        const esc = escapeHtml(String(tx || '').trim());
        if(!esc) return '';
        return '<span class="portal-session-slot-chip '+cls+'" aria-label="' + esc + '"><span>' + esc + '</span></span>';
      }).join('');
    }

    /** Status chips below participant name (override context + feedback + slot time change). */
    function portalTodayFeedbackLifecycleChipHtml(item){
      if(!item || item.kind !== 'client' || !item.sessionKey || item.noSessionFeedbackRequired || item.portalOverrideSuppressReviewOrange) return '';
      if(typeof portalStaffFeedbackPipelineReady === 'function' && !portalStaffFeedbackPipelineReady()) return '';
      const r = (typeof getEffectiveSessionReviewRecord === 'function' ? getEffectiveSessionReviewRecord(item) : getSessionReviewRecord(item)) || {};
      if(r.absent){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--absent" aria-label="Absent recorded"><span>Absent</span></span>';
      }
      if(r.cancelled){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--cancelled" aria-label="Cancelled"><span>Cancelled</span></span>';
      }
      if(r.feedbackDone){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--submitted" aria-label="Feedback submitted"><span>Submitted</span></span>';
      }
      if(isSessionStartedForItem(item)){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--pending" aria-label="Feedback pending"><span>Pending</span></span>';
      }
      return '';
    }
    function todaySessionChipBelowNameHtml(item){
      if(!item) return '';
      const pillText = String(item.portalOverrideAlertPill || '').trim();
      const pillNorm = pillText.toUpperCase();
      const sym = String(item.portalOverrideSymbolText || '').trim();
      const symNorm = sym.toLowerCase().replace(/\s+/g, ' ').trim();
      const isMakeUpSym = symNorm === 'make up session' || symNorm === 'make up';
      const isTrialSym = symNorm === 'trial';
      const chips = [];
      const push = function(html){ if(html) chips.push(html); };

      if(pillNorm === 'ABSENT' || pillNorm === 'ABSENT\nTODAY'){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--absent" aria-label="Absent"><span>Absent</span></span>';
      }
      if(pillNorm === 'CANCELLED'){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--cancelled" aria-label="Cancelled"><span>Cancelled</span></span>';
      }
      if(pillNorm === 'COMPLETED'){
        return '<span class="portal-session-slot-chip portal-session-slot-chip--submitted" aria-label="Completed"><span>Completed</span></span>';
      }

      const lifecycleChip = portalTodayFeedbackLifecycleChipHtml(item);
      if(lifecycleChip) return lifecycleChip;

      if(typeof portalTodayItemShowsShadowingHostAlert === 'function' && portalTodayItemShowsShadowingHostAlert(item)){
        push(portalShadowingHostBadgeHtml(item.portalShadowingHostLabels));
      } else if(String(item.clientId || '').trim().toLowerCase() !== 'meeting' && Array.isArray(item.portalSessionAddChips) && item.portalSessionAddChips.length){
        push(portalPlainSessionSlotChipsHtml(item.portalSessionAddChips, item.portalOverrideCardTone));
      } else if(!!item.portalOverrideTrialTag || isTrialSym){
        push('<span class="portal-session-slot-chip portal-session-slot-chip--trial" aria-label="Trial/New Participant"><span>Trial/New Participant</span></span>');
      } else if(isMakeUpSym || !!item.portalOverrideMakeUpTag){
        push('<span class="portal-session-slot-chip portal-session-slot-chip--makeup" aria-label="Make up"><span>Make up</span></span>');
      } else if(pillText && pillNorm !== 'UPDATED'){
        const display = escapeHtml(pillText).replace(/\n/g, ' ');
        push('<span class="portal-session-slot-chip" aria-label="' + display + '"><span>' + display + '</span></span>');
      } else if(sym && !isMakeUpSym){
        const tx = escapeHtml(sym);
        push('<span class="portal-session-slot-chip portal-session-slot-chip--plain" aria-label="' + tx + '"><span>' + tx + '</span></span>');
      }

      if(item.kind === 'client' && item.sessionKey && !item.noSessionFeedbackRequired && !item.portalOverrideSuppressReviewOrange){
        const ended = isSessionEndedForFeedback(item);
        const started = isSessionStartedForItem(item);
        const timeUpdated = portalSessionItemRosterTimeUpdated(item);
        if(timeUpdated && !started && !ended){
          push(portalSessionUpdatedChipHtml());
        }
      }

      if(!chips.length && item.scheduleAdminAdjusted && !item.portalOverrideAlertPill && !item.portalOverrideHideAdminBadge){
        push(portalSessionUpdatedChipHtml());
      }
      return chips.join('');
    }

    /** @deprecated use todaySessionChipBelowNameHtml */
    function todaySessionScheduleOverrideBelowNameHtml(item){
      return todaySessionChipBelowNameHtml(item);
    }

    /** @deprecated use todaySessionChipBelowNameHtml */
    function todaySessionFeedbackStatusChipHtml(item){
      return '';
    }

    /** Override detail column (legacy); schedule chips now live below the name. */
    function todaySessionOverrideDetailHtml(item){
      const pillText = String(item && item.portalOverrideAlertPill || '').trim();
      const pillNorm = pillText.toUpperCase();
      const isAbsentPill = pillNorm === 'ABSENT' || pillNorm === 'ABSENT\nTODAY';
      if(isAbsentPill){
        return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--absent" aria-label="Absent"><span>ABSENT</span></span>';
      }
      if(pillNorm === 'CANCELLED'){
        return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--cancelled" aria-label="Cancelled"><span>CANCELLED</span></span>';
      }
      if(pillNorm === 'COMPLETED'){
        return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--completed" aria-label="Completed"><span>COMPLETED</span></span>';
      }
      if(pillNorm === 'UPDATED'){
        return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--updated" aria-label="Updated"><span>UPDATED</span></span>';
      }
      if(pillText){
        const display = escapeHtml(pillText).replace(/\n/g, ' ');
        return `<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol" aria-label="${display}"><span>${display}</span></span>`;
      }
      const sym = String(item.portalOverrideSymbolText || '').trim();
      const symNorm = sym.toLowerCase().replace(/\s+/g, ' ').trim();
      const isMakeUpSym = symNorm === 'make up session' || symNorm === 'make up';
      if(sym){
        if(isTrialSym){
          return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--trial" aria-label="Trial"><span>TRIAL</span></span>';
        }
        if(isMakeUpSym){
          return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--makeup" aria-label="Make up"><span>MAKE UP</span></span>';
        } else {
        const tx = escapeHtml(sym);
        return `<span class="session-ov-symbol-text" aria-label="${tx}">${tx}</span>`;
        }
      }
      if(!!item.portalOverrideTrialTag){
        return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--trial" aria-label="Trial"><span>TRIAL</span></span>';
      }
      if(!!item.portalOverrideMakeUpTag){
        return '<span class="portal-ov-alert-pill portal-ov-alert-pill--symbol portal-ov-alert-pill--makeup" aria-label="Make up"><span>MAKE UP</span></span>';
      }
      return '<span class="session-pool-na" aria-hidden="true">—</span>';
    }

    function portalManagerDutyAreaLabel(item){
      if(!item || item.kind !== 'manager') return '';
      return 'Day Centre';
    }
    /** Pool/room details column — always visible on the right. */
    function todaySessionThirdRowInnerHtml(item){
      if(item.kind === 'closed') return '';
      if(item.kind === 'home'){
        return todaySessionPoolColumnHtml(Object.assign({}, item, {
          areaLabel: 'Home',
          poolLocationLabel: 'Home',
          showPoolSymbol: true
        }));
      }
      if(item.kind === 'manager'){
        return todaySessionPoolColumnHtml(Object.assign({}, item, {
          areaLabel: portalManagerDutyAreaLabel(item),
          poolLocationLabel: portalManagerDutyAreaLabel(item),
          showPoolSymbol: true
        }));
      }
      return todaySessionPoolColumnHtml(item);
    }
    function todaySessionSingleLineNoteText(item){
      const label = item && item.areaLabel != null && String(item.areaLabel).trim()
        ? String(item.areaLabel).trim()
        : (item && item.poolLocationLabel ? String(item.poolLocationLabel).trim() : '');
      return label;
    }
    function portalTodaySessionVenueLabel(item){
      const v = item && item.sessionVenue != null ? String(item.sessionVenue).trim() : '';
      return v || '—';
    }
    /** Pool note stays in the right column; overrides moved below the name. */
    function portalTodaySessionOverrideMovesPoolToCenter(item){
      return false;
    }
    /** Pool / room label HTML (right column when no override; under name when override splits layout). */
    function todaySessionPoolColumnHtml(item){
      if(!item || item.kind === 'closed'){
        return '<span class="session-pool-na" aria-hidden="true">—</span>';
      }
      const label = typeof portalResolveAreaNoteLabelFromItem === 'function'
        ? portalResolveAreaNoteLabelFromItem(item)
        : (item.areaLabel != null && String(item.areaLabel).trim()
          ? String(item.areaLabel).trim()
          : (item.poolLocationLabel ? String(item.poolLocationLabel).trim() : ''));
      if(label && typeof portalAreaNoteTodayColumnHtml === 'function'){
        const icon = portalAreaNoteTodayColumnHtml(label);
        if(icon) return icon;
      } else if(label && typeof portalAreaNoteIconHtml === 'function'){
        const icon = portalAreaNoteIconHtml(label, { showLabel: false, venueSessionCard: true });
        if(icon) return icon;
      }
      return '<span class="session-pool-na" aria-hidden="true">—</span>';
    }
    function todaySessionCardInnerHtml(item){
      const timeRaw = String(item.time || '').trim();
      const time = escapeHtml(typeof stripMeridiemFromSlotLabel === 'function' ? stripMeridiemFromSlotLabel(timeRaw) : timeRaw);
      const hideDutyVenue = item && (item.kind === 'home' || item.kind === 'manager' || item.kind === 'admin');
      const venueLine = hideDutyVenue ? '' : escapeHtml(portalTodaySessionVenueLabel(item));
      const timeStack = hideDutyVenue
        ? `<div class="session-line session-line--time session-line--time-stack session-line--time-duty"><span class="session-slot-time">${time}</span></div>`
        : `<div class="session-line session-line--time session-line--time-stack"><span class="session-slot-time">${time}</span><span class="session-line-venue">${venueLine}</span></div>`;
      const nameCore = item.kind === 'closed'
        ? '<span class="session-meta-name">Closed</span>'
        : (item.kind === 'home'
          ? `<span class="session-meta-name session-meta-name--home"><span>${escapeHtml(item.name)}</span></span>`
          : `<span class="session-meta-name">${escapeHtml(item.name)}</span>`);
      const meetingChipsRow = todaySessionStackedPeopleChipsRowHtml(item);
      const chip = meetingChipsRow ? '' : todaySessionChipBelowNameHtml(item);
      const chipParts = chip ? (chip.match(/portal-session-slot-chip|portal-sched-ov-badge/g) || []).length : 0;
      const chipsWrapCls = chipParts > 1 ? ' session-chips-below-name--wrap' : '';
      const chipsRow = meetingChipsRow || (chip ? '<div class="session-chips-below-name' + chipsWrapCls + '">' + chip + '</div>' : '');
      const namePart = `<span class="session-name-stack">${nameCore}${chipsRow}</span>`;
      const rightColInner = `<span class="session-right-note">${todaySessionThirdRowInnerHtml(item)}</span>`;
      return `<div class="session-card-body">${timeStack}<div class="session-line session-line--name">${namePart}</div><div class="session-line session-line--symbol">${rightColInner}</div></div>`;
    }

    function staffRoleTrackForTodayBuild(){
      try{
        const t = dashboardData && dashboardData.staffRoleTrack;
        if(t) return t;
      }catch(_){}
      return (__spreadsheetBoot && __spreadsheetBoot.staffRoleTrack) ? __spreadsheetBoot.staffRoleTrack : 'swimming';
    }
    function portalStaffIsSupportWorkerForAreaNotes(){
      const rt = String(staffRoleTrackForTodayBuild() || 'swimming').toLowerCase().replace(/[\s_-]+/g,'');
      return rt === 'support' || rt === 'supportlead';
    }
    function poolTierForAreaNoteRow(s, activity, clientNotes, viewDay, hidePoolNotes){
      return hidePoolNotes ? null : resolvePoolTier(s, activity, clientNotes, viewDay);
    }
    function portalFormatRosterBandLabel(start, end){
      function tok(hm){
        const bits = String(hm || '').split(':');
        let h = Number(bits[0]);
        const m = Number(bits[1] || 0);
        if(Number.isNaN(h)) return '';
        if(h >= 13 && h <= 23) h -= 12;
        if(h === 0) h = 12;
        if(m === 0) return String(h);
        if(m === 30) return h + '.30';
        if(m === 15) return h + '.15';
        if(m === 45) return h + '.45';
        return h + '.' + String(m).padStart(2, '0');
      }
      const a = tok(start);
      const b = tok(end);
      if(!a || !b) return '';
      return a + ' to ' + b;
    }
    function rosterSlotTimeLabel(s){
      const rawSlot = String(s && s.timeSlotLabel || '').trim();
      if(rawSlot){
        const loose = portalNormSlotLabelLoose(rawSlot);
        if(loose){
          const fromRoster = loose.replace(/(\d):(\d{2})/g, '$1.$2');
          return typeof stripMeridiemFromSlotLabel === 'function' ? stripMeridiemFromSlotLabel(fromRoster) : fromRoster;
        }
      }
      const start = String(s && s.start || '').trim();
      const end = String(s && s.end || '').trim();
      let out = '';
      if(/^\d{1,2}:\d{2}$/.test(start) && /^\d{1,2}:\d{2}$/.test(end)){
        const fromBounds = portalFormatRosterBandLabel(start, end);
        if(fromBounds) out = fromBounds;
      }
      if(!out && rawSlot) out = rawSlot;
      if(!out) out = formatSlotRange(s && s.start, s && s.end);
      return typeof stripMeridiemFromSlotLabel === 'function' ? stripMeridiemFromSlotLabel(out) : out;
    }
    /** Support workers: roster room (Hub Room, Room 2). Swimming instructors: roster pool area or activity fallback. */
    function rosterAreaLabelForSession(s, activity, supportWorkerMode, viewDay){
      let a = String(s.rosterArea != null ? s.rosterArea : '').trim();
      const sundayPool = portalCorrectSundaySwimFarmPoolArea(s, viewDay);
      if(sundayPool && (!a || /^teaching pool$/i.test(a))) a = sundayPool;
      if(!a){
        if(supportWorkerMode) return '';
        a = String(activity || '').trim();
      }
      if(typeof portalApplySessionAreaNoteOverrides === 'function'){
        const overridden = portalApplySessionAreaNoteOverrides({
          rosterArea: a,
          activity: activity,
          rosterService: s && s.rosterService,
          clientId: s && s.clientId,
          name: s && (s.clientDisplay || s.clientName)
        });
        if(overridden) return overridden;
      }
      return a;
    }
    function clientGeneralBodyFromNotes(c, s){
      const sheet = c && c.generalInfoSheet != null ? String(c.generalInfoSheet).trim() : '';
      if(sheet) return sheet;
      return `${s.venue || ''} pool · ${c.generalLead || ''}`.trim();
    }
    /** Make-up: pool / area notes follow the anchor slot (original client), not the replacement name. */
    function clientGeneralBodyForMakeupSession(anchorNotes, repNotes, s, activity, viewDay, supportHidePoolNote){
      const anchorSheet = anchorNotes && anchorNotes.generalInfoSheet != null ? String(anchorNotes.generalInfoSheet).trim() : '';
      if(anchorSheet) return anchorSheet;
      let poolLocationLabel = resolvePoolLocationLabelFromSession(s, activity, anchorNotes || {}, viewDay);
      if(supportHidePoolNote) poolLocationLabel = null;
      const areaLabel = rosterAreaLabelForSession(s, activity, supportHidePoolNote, viewDay);
      const venue = String(s && s.venue || '').trim();
      const bits = [];
      if(poolLocationLabel) bits.push(poolLocationLabel);
      if(areaLabel) bits.push(areaLabel);
      if(bits.length) return bits.join(' · ');
      const lead = anchorNotes && anchorNotes.generalLead ? String(anchorNotes.generalLead).trim() : '';
      if(lead) return `${venue ? venue + ' · ' : ''}${lead}`.trim();
      const repLead = repNotes && repNotes.generalLead ? String(repNotes.generalLead).trim() : '';
      if(repLead) return `${venue ? venue + ' pool · ' : ''}${repLead}`.trim();
      return venue ? `${venue} · Pool session` : 'Pool session';
    }
    function resolveClientGeneralInfoText(item){
      const cid = item && item.clientId ? String(item.clientId).trim() : '';
      const c = cid && typeof clientNotesById !== 'undefined' ? clientNotesById[cid] : null;
      const name = (item && item.name) || (c && c.name) || cid;
      if(typeof portalParticipantGeneralInfoText === 'function'){
        const live = portalParticipantGeneralInfoText(cid, name);
        if(live) return String(live).trim();
      }
      if(c && c.generalInfoSheet) return String(c.generalInfoSheet).trim();
      try{
        const Adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
        if(Adapter && typeof Adapter.lookupClientInfoText === 'function'){
          const live = Adapter.lookupClientInfoText(cid, name);
          if(live) return live;
        }
      }catch(_){}
      if(item && item.general) return String(item.general).trim();
      if(c && c.generalLead) return String(c.generalLead).trim();
      return '';
    }
    function portalApplyClientsInfoToNotes(){
      try{
        const Adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
        if(Adapter && typeof Adapter.applyClientsInfoMerge === 'function' && clientNotesById){
          Adapter.applyClientsInfoMerge(clientNotesById);
        }
        if(typeof portalApplyParticipantGeneralInfoToNotes === 'function' && clientNotesById){
          portalApplyParticipantGeneralInfoToNotes(clientNotesById);
        }
      }catch(_){}
    }

    function portalNormKeyStr(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
    /** Match roster keys across aliases (luliya/lulia/aida, javi/javier). */
    function portalCanonicalStaffKeyForMatch(v){
      var k = portalNormKeyStr(v);
      if(!k) return '';
      if(k === 'luliya' || k === 'lulya' || k === 'aida' || k === 'stf021') return 'lulia';
      if(k === 'javiermarquez') return 'javier';
      if(k === 'javiarranz' || k === 'javiarranzescorial' || k === 'palankas' || k === 'palankasarranz') return 'javi';
      if(typeof window.portalCanonicalStaffRosterKey === 'function'){
        var canon = String(window.portalCanonicalStaffRosterKey(k) || '').trim().toLowerCase();
        if(canon) return canon;
      }
      return k;
    }
    function portalStaffKeysMatch(a, b){
      var ca = portalCanonicalStaffKeyForMatch(a);
      var cb = portalCanonicalStaffKeyForMatch(b);
      if(!ca || !cb) return false;
      return ca === cb;
    }
    /** instructor_reassign: live MADRE DAN vs override anchor AURORA (same SwimFarm lane). */
    function portalOverrideAnchorStaffKeysMatch(anchorStaffId, sessionStaffId){
      if(portalStaffKeysMatch(anchorStaffId, sessionStaffId)) return true;
      const a = portalNormKeyStr(anchorStaffId);
      const s = portalNormKeyStr(sessionStaffId);
      if(!a || !s) return false;
      return (a === 'aurora' || a === 'dan') && (s === 'aurora' || s === 'dan');
    }
    function portalOverrideAnchorMatchesRosterInstructors(anchorStaffId, instructors){
      if(typeof portalStaffMatchesStatusInstructor === 'function' && portalStaffMatchesStatusInstructor(anchorStaffId, instructors)) return true;
      const a = portalNormKeyStr(anchorStaffId);
      if(a === 'aurora' || a === 'dan'){
        if(typeof portalStaffMatchesStatusInstructor === 'function'){
          if(portalStaffMatchesStatusInstructor('aurora', instructors)) return true;
          if(portalStaffMatchesStatusInstructor('dan', instructors)) return true;
        }
      }
      return false;
    }
    try{ window.portalCanonicalStaffKeyForMatch = portalCanonicalStaffKeyForMatch; }catch(_){}
    try{ window.portalStaffKeysMatch = portalStaffKeysMatch; }catch(_){}
    function portalCanonicalRosterClientId(clientId){
      const raw = portalNormKeyStr(clientId);
      if(!raw) return '';
      try{
        const A = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
        if(A && typeof A.canonicalParticipantClientId === 'function'){
          const canon = A.canonicalParticipantClientId(raw);
          if(canon) return portalNormKeyStr(canon);
        }
      }catch(_){}
      return raw;
    }
    function portalRosterClientIdsMatch(a, b){
      const ca = portalCanonicalRosterClientId(a);
      const cb = portalCanonicalRosterClientId(b);
      return !!(ca && cb && ca === cb);
    }
    function portalScheduleOverrideAnchorIsOpenSlot(slug){
      const s = String(slug || '').trim().toLowerCase();
      return !s || s === 'available' || s === 'closed' || s === 'noclient' || s === 'no_client' || s === 'no client';
    }
    function portalScheduleOverrideMatchesSessionWindow(r, s, sessionDateIso){
      if(!r || !s) return false;
      const iso = normaliseIsoDate(sessionDateIso);
      const rowIso = normaliseIsoDate(r.session_date);
      if(!iso || !rowIso || rowIso !== iso) return false;
      if(!portalStaffKeysMatch(r.anchor_staff_id, s.staffId)) return false;
      if(portalNormKeyStr(r.anchor_venue) !== portalNormKeyStr(s.venue)) return false;
      const ot = String(r.override_type || '').trim();
      return portalScheduleOverrideAnchorTimesMatchSession(r, s, ot);
    }
    function portalClientNotesLookup(clientId){
      const cid = portalNormKeyStr(clientId);
      if(!cid) return null;
      const canon = portalCanonicalRosterClientId(cid);
      try{
        if(typeof clientNotesById !== 'undefined' && clientNotesById){
          if(clientNotesById[cid]) return clientNotesById[cid];
          if(canon && clientNotesById[canon]) return clientNotesById[canon];
        }
      }catch(_){}
      return null;
    }
    function portalHmToMinutes(hm){
      const m = String(hm || '').match(/^(\d{1,2}):(\d{2})/);
      if(!m) return NaN;
      return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
    }
    function portalSessionTimeWindowsOverlap(rStart, rEnd, sStart, sEnd){
      const lo1 = portalHmToMinutes(portalHmFromDbTime(rStart));
      const hi1 = portalHmToMinutes(portalHmFromDbTime(rEnd) || portalHmFromDbTime(rStart));
      const lo2 = portalHmToMinutes(sStart);
      const hi2 = portalHmToMinutes(sEnd || sStart);
      if(!Number.isFinite(lo1) || !Number.isFinite(hi1) || !Number.isFinite(lo2) || !Number.isFinite(hi2)) return false;
      return lo1 < hi2 && lo2 < hi1;
    }
    function portalScheduleOverrideAnchorTimesMatchSession(r, s, overrideType){
      const ot = overrideType ? String(overrideType || '').trim() : String(r && r.override_type || '').trim();
      if(ot === 'client_absence_announced' || ot === 'client_replace_in_slot'){
        if(portalTimeAnchorsMatch(r.anchor_start, s.start) && portalTimeAnchorsMatch(r.anchor_end, s.end)) return true;
        if(portalSessionTimeWindowsOverlap(r.anchor_start, r.anchor_end, s.start, s.end)) return true;
        return portalOverrideSlotLabelMatchesRow(r, s);
      }
      if(!portalTimeAnchorsMatch(r.anchor_start, s.start)) return false;
      return portalTimeAnchorsMatch(r.anchor_end, s.end);
    }
    /** MakeUp anchored on an open / cleared slot (e.g. after admin cancel → available). */
    function portalOpenSlotMakeupOverrideForSession(s, sessionDateIso){
      const iso = normaliseIsoDate(sessionDateIso);
      if(!iso || !s) return null;
      const all = portalScheduleOverrideRowsAll().filter(function(r){
        if(String(r.status || 'active') !== 'active') return false;
        if(String(r.override_type || '').trim() !== 'client_replace_in_slot') return false;
        if(!portalScheduleOverrideAnchorIsOpenSlot(r.anchor_client_id)) return false;
        return portalScheduleOverrideMatchesSessionWindow(r, s, iso);
      });
      all.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
      return all[0] || null;
    }
    function portalTryMakeupTodayCardFromOpenSlot(s, sessionDateKey, anchorDayWord, anchor, viewDay, supportHidePoolNote){
      const makeupOv = portalOpenSlotMakeupOverrideForSession(s, sessionDateKey);
      if(!makeupOv) return null;
      return portalBuildMakeupTodayCardFromOverride(s, makeupOv, sessionDateKey, anchorDayWord, anchor, supportHidePoolNote);
    }
    function portalHmFromDbTime(t){
      const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
      if(!m) return '';
      return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + String(parseInt(m[2], 10)).padStart(2, '0');
    }
    function portalCanonicalHmToken(input){
      const raw = String(input == null ? '' : input).trim();
      if(!raw) return '';
      const m = raw.match(/^(\d{1,2})(?:(?:[:.])(\d{1,2}))?(?::(\d{1,2}))?$/);
      if(!m) return '';
      const hh = parseInt(m[1], 10);
      if(!Number.isFinite(hh) || hh < 0 || hh > 23) return '';
      const mmRaw = m[2] != null && m[2] !== '' ? m[2] : '00';
      const mm = parseInt(mmRaw, 10);
      if(!Number.isFinite(mm) || mm < 0 || mm > 59) return '';
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }
    function normaliseTimeForOverrideMatch(value){
      const raw = String(value == null ? '' : value).trim();
      if(!raw) return [];
      const out = [];
      const seen = Object.create(null);
      const add = function(v){
        const t = portalCanonicalHmToken(v);
        if(!t || seen[t]) return;
        seen[t] = true;
        out.push(t);
      };
      add(raw);
      const withMinutes = raw.match(/\b\d{1,2}(?::|\.)\d{1,2}(?::\d{1,2})?\b/g) || [];
      for(let i = 0; i < withMinutes.length; i++) add(withMinutes[i]);
      const rangeParts = raw.split(/\bto\b|[–—-]/i);
      for(let i = 0; i < rangeParts.length; i++){
        const p = String(rangeParts[i] || '').trim();
        if(!p) continue;
        add(p);
        // Only treat a bare number as an hour-only token (e.g. "3" in "3 to 4").
        // For a full clock value like "15:00:00" / "10:00" the minute/second
        // groups ("00") must NOT be promoted to hour tokens — that produced a
        // bogus "00:00" that made every on-the-hour slot match every other one,
        // so an open-slot trial/makeup leaked onto all of a worker's sessions.
        if(p.indexOf(':') === -1 && p.indexOf('.') === -1){
          const hoursOnly = p.match(/\b\d{1,2}\b/g) || [];
          for(let j = 0; j < hoursOnly.length; j++) add(hoursOnly[j]);
        }
      }
      return out;
    }
    function portalTimeAnchorsMatch(dbT, sheetT){
      const left = normaliseTimeForOverrideMatch(dbT);
      const right = normaliseTimeForOverrideMatch(sheetT);
      if(!left.length || !right.length) return false;
      for(let i = 0; i < left.length; i++){
        if(right.indexOf(left[i]) !== -1) return true;
      }
      return false;
    }
    function portalNormSlotLabelLoose(str){
      const raw = String(str == null ? '' : str).trim();
      let t = typeof stripMeridiemFromSlotLabel === 'function' ? stripMeridiemFromSlotLabel(raw) : raw;
      t = t.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[·•|:\-–—]\s*/i, '');
      function portalNormSlotLabelTimeToken(part){
        const p = String(part || '').trim().toLowerCase();
        if(!p) return '';
        const mDot = p.match(/^(\d{1,2})\.(\d{2})$/);
        if(mDot){
          let h = parseInt(mDot[1], 10);
          const mm = mDot[2];
          if(h >= 13 && h <= 23) h -= 12;
          if(h === 0) h = 12;
          return h + '.' + mm;
        }
        const mHm = p.match(/^(\d{1,2}):(\d{2})$/);
        if(mHm){
          let h = parseInt(mHm[1], 10);
          const mm = mHm[2];
          if(h >= 13 && h <= 23) h -= 12;
          if(h === 0) h = 12;
          return h + '.' + mm;
        }
        const mHour = p.match(/^(\d{1,2})$/);
        if(mHour){
          let h = parseInt(mHour[1], 10);
          if(h >= 13 && h <= 23) h -= 12;
          if(h === 0) h = 12;
          return String(h);
        }
        return p;
      }
      const parts = t.split(/\s+to\s+/i);
      if(parts.length >= 2){
        t = portalNormSlotLabelTimeToken(parts[0]) + ' to ' + portalNormSlotLabelTimeToken(parts.slice(1).join(' to '));
      }
      return t.toLowerCase().replace(/\s+/g, ' ').trim();
    }
    function portalOverrideSlotLabelMatchesRow(r, s){
      const lab = String(r.anchor_time_slot_label == null ? '' : r.anchor_time_slot_label).trim();
      if(!lab) return true;
      const sLab = typeof rosterSlotTimeLabel === 'function' ? rosterSlotTimeLabel(s) : '';
      const a = portalNormSlotLabelLoose(lab);
      const b = portalNormSlotLabelLoose(sLab);
      if(a === b) return true;
      const startA = a.split(/\s+to\s+/)[0];
      const startB = b.split(/\s+to\s+/)[0];
      return !!(startA && startB && startA === startB);
    }
    function portalScheduleOverrideRowsAll(){ return Array.isArray(window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__) ? window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__ : []; }
    /** Spreadsheet / rota row is a closed block (hidden from staff unless a matching slot_open override exists). */
    function portalSpreadsheetSlotClosedLike(s){
      if(!s) return false;
      const st = typeof sessionModelStatus === 'function' ? sessionModelStatus(s) : '';
      const man = String(s && s.override || '').trim().toUpperCase();
      return st === 'Closed' || man === 'CLOSED';
    }
    function portalSlotOpenOverrideMatchesSessionRow(r, s, sessionDateIso){
      if(!r || !s) return false;
      if(String(r.status || 'active') !== 'active') return false;
      if(String(r.override_type || '').trim() !== 'slot_open') return false;
      const rowIso = normaliseIsoDate(r.session_date);
      const iso = normaliseIsoDate(sessionDateIso);
      if(!rowIso || !iso || rowIso !== iso) return false;
      if(!portalStaffKeysMatch(r.anchor_staff_id, s.staffId)) return false;
      if(portalNormKeyStr(r.anchor_venue) !== portalNormKeyStr(s.venue)) return false;
      if(!portalRosterClientIdsMatch(r.anchor_client_id, s.clientId)) return false;
      if(!portalTimeAnchorsMatch(r.anchor_start, s.start)) return false;
      if(!portalTimeAnchorsMatch(r.anchor_end, s.end)) return false;
      return portalOverrideSlotLabelMatchesRow(r, s);
    }
    function portalSessionHasSlotOpenOverride(s, sessionDateIso){
      return !!portalFindSlotOpenOverrideForSession(s, sessionDateIso);
    }
    function portalFindSlotOpenOverrideForSession(s, sessionDateIso){
      const all = portalScheduleOverrideRowsAll();
      for(let i = 0; i < all.length; i++){
        if(portalSlotOpenOverrideMatchesSessionRow(all[i], s, sessionDateIso)) return all[i];
      }
      return null;
    }
    /**
     * Calendar YYYY-MM-DD only (local calendar for Date values — no UTC slice).
     * Accepts: YYYY-MM-DD, ISO strings starting with YYYY-MM-DD, DD/MM/YYYY, parseable date strings, Date, finite epoch ms.
     */
    function normaliseIsoDate(value){
      if(value == null || value === '') return '';
      if(value instanceof Date){
        if(isNaN(value.getTime())) return '';
        return typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(value) : '';
      }
      if(typeof value === 'number' && Number.isFinite(value)){
        const d = new Date(value);
        if(isNaN(d.getTime())) return '';
        return typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(d) : '';
      }
      const s = String(value).trim();
      if(!s) return '';
      if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const mDmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if(mDmy){
        const da = parseInt(mDmy[1], 10), mo = parseInt(mDmy[2], 10), yr = parseInt(mDmy[3], 10);
        if(mo < 1 || mo > 12 || da < 1 || da > 31) return '';
        const dt = new Date(yr, mo - 1, da);
        if(dt.getFullYear() !== yr || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return '';
        return typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(dt) : '';
      }
      const hasTimeOrZone = /[Tt]|\d{4}-\d{2}-\d{2}\s+\d/.test(s) || /[Zz]|[+-]\d{2}:?\d{2}$/.test(s);
      if(hasTimeOrZone || s.length > 10){
        const parsed = new Date(s.indexOf(' ') > 0 && s.indexOf('T') < 0 ? s.replace(' ', 'T') : s);
        if(!isNaN(parsed.getTime()) && typeof portalIsoYmdFromDate === 'function') return portalIsoYmdFromDate(parsed);
      }
      if(typeof portalParseIsoDateLocal === 'function'){
        const pl = portalParseIsoDateLocal(s);
        if(pl && !isNaN(pl.getTime()) && typeof portalIsoYmdFromDate === 'function') return portalIsoYmdFromDate(pl);
      }
      return '';
    }
    function portalNormalizeScheduleOverrideSessionDate(v){
      return normaliseIsoDate(v);
    }
    /** True when this override row concerns the logged-in staff (anchor or cover on reassign). */
    function portalScheduleOverrideRowAppliesToLoggedInStaff(row){
      if(!row || typeof row !== 'object') return false;
      if(String(row.status || 'active') !== 'active') return false;
      const t = String(row.override_type || '').trim();
      if(!t || t === 'override_void') return false;
      const me = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      if(!me) return false;
      const anchor = portalNormKeyStr(row.anchor_staff_id);
      if(t === 'instructor_reassign'){
        let payload = row.payload;
        if(typeof payload === 'string'){
          try{ payload = JSON.parse(payload); }catch(_){ payload = null; }
        }
        if(!payload || typeof payload !== 'object') payload = {};
        const cover = portalNormKeyStr(payload.covering_staff_id);
        if(anchor === me || (!!cover && cover === me)) return true;
      }else if(anchor === me){
        // The worker was anchored on this slot but a cover instructor took over the
        // whole slot (instructor_reassign me -> cover). They are not working it, so
        // absence/replace/other cards for that slot must not reach them.
        if(portalLoggedInStaffReassignedOffSlotForRow(row)) return false;
        return true;
      }
      if(typeof window.portalLeadOverrideRowAppliesToLeadScope === 'function'
        && window.portalLeadOverrideRowAppliesToLeadScope(row)){
        // Programme leads do NOT need a per-session card for every instructor
        // cover in their programme — the "Team on shift today" bar already shows
        // who is covering. Suppress instructor_reassign here so a Sunday with a
        // couple of cover instructors does not flood the lead's Admin changes
        // list with one "Schedule change - <participant>" card per slot. Other
        // change types (absences, trials, cancellations, new participants…) in
        // their scope still surface as before.
        if(t === 'instructor_reassign') return false;
        return true;
      }
      return false;
    }
    /** Same as applies-to-staff but ignores row status (for undo payloads where status is already cancelled). */
    function portalScheduleOverrideRowConcernedStaffIgnoringStatus(row){
      if(!row || typeof row !== 'object') return false;
      const t = String(row.override_type || '').trim();
      if(!t || t === 'override_void') return false;
      const me = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      if(!me) return false;
      const anchor = portalNormKeyStr(row.anchor_staff_id);
      if(t === 'instructor_reassign'){
        let pl = row.payload;
        if(typeof pl === 'string'){
          try{ pl = JSON.parse(pl); }catch(_){ pl = null; }
        }
        if(!pl || typeof pl !== 'object') pl = {};
        const cover = portalNormKeyStr(pl.covering_staff_id);
        return anchor === me || (!!cover && cover === me);
      }
      return anchor === me;
    }
    /** Overrides that mean the shipped bundle/timetable is stale for this staff+day (not per-client absences). */
    function portalStaffMachineBundleBlockedByScheduleOverrideOnDate(staffId, iso){
      const sid = portalNormKeyStr(staffId);
      const dateIso = normaliseIsoDate(iso);
      if(!sid || !dateIso) return false;
      const P = window.PortalParticipantsSheet;
      const all = portalScheduleOverrideRowsAll();
      for(let i = 0; i < all.length; i++){
        const r = all[i];
        if(String(r.status || 'active') !== 'active') continue;
        if(normaliseIsoDate(r.session_date) !== dateIso) continue;
        const t = String(r.override_type || '').trim();
        if(!t || t === 'override_void') continue;
        const anchor = portalNormKeyStr(r.anchor_staff_id);
        if(t === 'instructor_reassign'){
          let pl = r.payload;
          if(typeof pl === 'string'){
            try{ pl = JSON.parse(pl); }catch(_){ pl = null; }
          }
          if(!pl || typeof pl !== 'object') pl = {};
          const cover = portalNormKeyStr(pl.covering_staff_id);
          if(anchor === sid && cover && cover !== sid) return true;
          continue;
        }
        if(anchor !== sid) continue;
        if(t === 'session_add') return true;
        if(t === 'slot_update'){
          if(P && typeof P.overrideIsNewShiftDayUpdate === 'function' && P.overrideIsNewShiftDayUpdate(r)) return true;
          let pl = r.payload;
          if(typeof pl === 'string'){
            try{ pl = JSON.parse(pl); }catch(_){ pl = null; }
          }
          if(pl && typeof pl === 'object'){
            const movedVenue = portalNormKeyStr(pl.moved_to_venue || pl.to_venue || pl.new_venue);
            const anchorVenue = portalNormKeyStr(r.anchor_venue);
            if(movedVenue && anchorVenue && movedVenue !== anchorVenue) return true;
          }
          continue;
        }
      }
      return false;
    }
    /** @deprecated use portalStaffMachineBundleBlockedByScheduleOverrideOnDate */
    function portalStaffHasAdminScheduleOverrideOnDate(staffId, iso){
      return portalStaffMachineBundleBlockedByScheduleOverrideOnDate(staffId, iso);
    }
    /** Shipped bundle/timetable must not replace Supabase roster when admin overrides apply. */
    function portalStaffMachineBundleFallbackAllowed(staffId, iso){
      if(typeof portalStaffMachineBundleBlockedByScheduleOverrideOnDate === 'function'
        && portalStaffMachineBundleBlockedByScheduleOverrideOnDate(staffId, iso)) return false;
      return true;
    }
    try{ window.portalStaffMachineBundleBlockedByScheduleOverrideOnDate = portalStaffMachineBundleBlockedByScheduleOverrideOnDate; }catch(_){}
    try{ window.portalStaffHasAdminScheduleOverrideOnDate = portalStaffHasAdminScheduleOverrideOnDate; }catch(_){}
    try{ window.portalStaffMachineBundleFallbackAllowed = portalStaffMachineBundleFallbackAllowed; }catch(_){}
    /** Ephemeral “admin undid this override” rows for quick menu / dashboard (sessionStorage). */
    const PORTAL_STAFF_OVERRIDE_REVERT_QUEUE_KEY = 'portalStaffOverrideRevertQueue_v1';
    function portalStaffRevertQueueLoad(){
      try{
        const raw = sessionStorage.getItem(PORTAL_STAFF_OVERRIDE_REVERT_QUEUE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      }catch(_){
        return [];
      }
    }
    function portalStaffRevertQueueSave(list){
      try{ sessionStorage.setItem(PORTAL_STAFF_OVERRIDE_REVERT_QUEUE_KEY, JSON.stringify(list || [])); }catch(_){}
    }
    function portalStaffRevertQueueRemoveByRevertId(revertId){
      const rid = String(revertId || '').trim();
      if(!rid) return;
      try{
        const list = portalStaffRevertQueueLoad();
        const next = list.filter(function(x){ return !x || String(x.revertId || '') !== rid; });
        if(next.length !== list.length) portalStaffRevertQueueSave(next);
      }catch(_){}
    }
    function portalOverrideUndoPreviousTypeLabel(overrideType){
      const x = String(overrideType || '').trim();
      if(x === 'client_replace_in_slot') return 'Was: make-up session';
      if(x === 'client_absence_announced') return 'Was: absent participant';
      if(x === 'slot_close') return 'Was: cancelled session';
      if(x === 'slot_open') return 'Was: slot reopened';
      if(x === 'slot_clear_client') return 'Was: client cleared from slot';
      if(x === 'instructor_reassign') return 'Was: cover / instructor change';
      return 'Was: schedule change';
    }
    /**
     * Admin “Undo change” sets override status active → cancelled. Staff: enqueue a quick-menu card,
     * vibrate + optional Notification, same dismiss + navigate-to-day as other roster tiles.
     */
    window.portalHandleScheduleOverrideUndoFromRealtimePayload = function portalHandleScheduleOverrideUndoFromRealtimePayload(payload){
      try{
        if(!payload || String(payload.eventType || '').toUpperCase() !== 'UPDATE') return;
        const oldR = payload.old;
        const newR = payload.new;
        if(!oldR || !newR) return;
        if(String(oldR.status || '') !== 'active' || String(newR.status || '') !== 'cancelled') return;
        if(typeof portalScheduleOverrideRowConcernedStaffIgnoringStatus !== 'function' || !portalScheduleOverrideRowConcernedStaffIgnoringStatus(oldR)) return;
        const iso = normaliseIsoDate(oldR.session_date);
        if(!iso || typeof portalOverrideRowIsWithinReminderHorizonSessionDate !== 'function' || !portalOverrideRowIsWithinReminderHorizonSessionDate(iso)) return;
        const uuid = String(oldR.id || '').trim();
        if(!uuid) return;
        const rid = 'revert:' + uuid;
        let qList = portalStaffRevertQueueLoad();
        if(qList.some(function(x){ return x && String(x.revertId || '') === rid; })) return;
        const t0 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(oldR.anchor_start) : String(oldR.anchor_start || '').trim();
        const t1 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(oldR.anchor_end) : String(oldR.anchor_end || '').trim();
        const venue = String(oldR.anchor_venue || '').trim();
        const slot = t0 && t1 ? (t0 + ' – ' + t1) : (t0 || t1 || '');
        const clientName = typeof portalClientDisplayNameForOverride === 'function'
          ? portalClientDisplayNameForOverride(oldR)
          : '';
        const clientShort = clientName || (typeof portalClientFirstNameTokenForOverride === 'function'
          ? portalClientFirstNameTokenForOverride(oldR)
          : '');
        const title = clientShort ? ('CHANGE UNDONE - ' + clientShort) : 'CHANGE UNDONE';
        const sub = typeof portalOverrideRevertCardSubLabel === 'function'
          ? portalOverrideRevertCardSubLabel(iso)
          : 'Goes back to normal';
        qList.push({
          revertId: rid,
          iso: iso,
          title: title,
          sub: sub,
          _sort: Date.now()
        });
        while(qList.length > 30) qList.shift();
        portalStaffRevertQueueSave(qList);
        portalStaffNotifyOsWhiteTile(
          'Schedule change undone',
          'This slot is back to normal on your roster.' + (iso ? (' Date: ' + iso + '.') : ''),
          'clubsensational-portal-roster-undo-' + uuid
        );
        try{ sessionStorage.setItem('portalOvUndoPushLast', uuid); }catch(_){}
      }catch(_){}
    };
    /** Local window: from today through today+N (inclusive). Quick menu, avatar, and push. */
    const PORTAL_ROSTER_OVERRIDE_REMINDER_HORIZON_DAYS = 14;
    /** Human-readable label for `YYYY-MM-DD` (en-GB, matches dashboard calendar). */
    function portalOverrideSessionDateDisplayLabel(iso){
      const rowIso = normaliseIsoDate(iso);
      if(!rowIso) return '';
      const parts = rowIso.split('-');
      if(parts.length !== 3) return rowIso;
      const y = Number(parts[0]), mo = Number(parts[1]) - 1, da = Number(parts[2]);
      const d = new Date(y, mo, da);
      if(isNaN(d.getTime())) return rowIso;
      try{
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }catch(_){
        return rowIso;
      }
    }
    function portalOverrideOrdinalDaySuffix(day){
      const n = Number(day);
      if(!n || n < 1 || n > 31) return String(day || '');
      const mod100 = n % 100;
      if(mod100 >= 11 && mod100 <= 13) return n + 'TH';
      const mod10 = n % 10;
      if(mod10 === 1) return n + 'ST';
      if(mod10 === 2) return n + 'ND';
      if(mod10 === 3) return n + 'RD';
      return n + 'TH';
    }
    /** Compact parenthetical date for override card titles, e.g. `(18th/Jun)`. */
    function portalOverrideCardDateParenLabel(iso){
      const rowIso = normaliseIsoDate(iso);
      if(!rowIso) return '';
      const parts = rowIso.split('-');
      if(parts.length !== 3) return '';
      const y = Number(parts[0]), mo = Number(parts[1]) - 1, da = Number(parts[2]);
      const d = new Date(y, mo, da);
      if(isNaN(d.getTime())) return '';
      let mon = '';
      try{
        mon = d.toLocaleDateString('en-GB', { month: 'short' });
      }catch(_){
        return '';
      }
      if(!mon) return '';
      const ord = portalOverrideOrdinalDaySuffix(da);
      const ordSuffix = ord ? ord.replace(/^\d+/, '').toLowerCase() : '';
      return '(' + da + ordSuffix + '/' + mon + ')';
    }
    function portalOverrideQuickMenuViewDayFromRow(row){
      const iso = normaliseIsoDate(row && row.session_date);
      if(!iso) return '';
      try{
        return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      }catch(_){
        return '';
      }
    }
    /** Roster area note for staff (Hub Room, Teaching Pool, …) — not admin override reason. */
    function portalOverrideQuickMenuAreaNoteLabel(row){
      const viewDay = portalOverrideQuickMenuViewDayFromRow(row);
      const base = typeof portalFindSpreadsheetSessionMatchingOverride === 'function'
        ? portalFindSpreadsheetSessionMatchingOverride(row, viewDay)
        : null;
      const session = base || (typeof portalSyntheticSessionFromOverride === 'function'
        ? portalSyntheticSessionFromOverride(row, viewDay)
        : null);
      if(!session) return '';
      const activity = String(session.activity || 'Swimming').trim();
      const supportHide = typeof portalStaffIsSupportWorkerForAreaNotes === 'function'
        ? portalStaffIsSupportWorkerForAreaNotes()
        : false;
      return String(rosterAreaLabelForSession(session, activity, supportHide, viewDay) || '').trim();
    }
    function portalOverrideQuickMenuServiceLabel(row){
      let pl = null;
      try{
        pl = row && row.payload && typeof row.payload === 'object' ? row.payload : JSON.parse(String(row && row.payload || ''));
      }catch(_){ pl = null; }
      return String(pl && (pl.service_booked || pl.service || pl.programme || pl.activity) || '').trim();
    }
    function portalOverrideQuickMenuTimeSlotLabel(row){
      let pl = null;
      try{
        pl = row && row.payload && typeof row.payload === 'object' ? row.payload : JSON.parse(String(row && row.payload || ''));
      }catch(_){ pl = null; }
      const ovType = String(row && row.override_type || '').trim();
      if(ovType === 'session_add'){
        const addKind = String(pl && pl.kind || '').trim().toLowerCase();
        if(addKind === 'shadowing' || addKind === 'training' || addKind === 'meeting'){
          if(typeof window.portalStaffSessionAddBandLabel === 'function'){
            const band = window.portalStaffSessionAddBandLabel(row, { kind: addKind, buffer: addKind !== 'shadowing' });
            if(band) return band;
          }
        }
      }
      if(ovType === 'slot_update' || (pl && pl._portal_roster_day_group)){
        if(typeof window.portalStaffOverrideShiftSlotLabel === 'function'){
          const shiftLab = window.portalStaffOverrideShiftSlotLabel(row);
          if(shiftLab) return shiftLab;
        }
      }
      const lab = String(row && row.anchor_time_slot_label || '').trim();
      const t0 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(row && row.anchor_start) : String(row && row.anchor_start || '').trim();
      const t1 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(row && row.anchor_end) : String(row && row.anchor_end || '').trim();
      if(typeof rosterSlotTimeLabel === 'function'){
        const fromRoster = rosterSlotTimeLabel({ start: t0, end: t1, timeSlotLabel: lab });
        if(fromRoster) return fromRoster;
      }
      if(lab) return lab.replace(/(\d):(\d{2})/g, '$1.$2');
      if(t0 && t1) return t0 + ' to ' + t1;
      return t0 || t1 || '';
    }
    function portalOverrideQuickMenuDetailSub(row, opts){
      opts = opts || {};
      const parts = [];
      if(opts.includeService){
        const svc = portalOverrideQuickMenuServiceLabel(row);
        if(svc) parts.push(svc);
      }
      const slot = portalOverrideQuickMenuTimeSlotLabel(row);
      if(slot) parts.push(slot);
      if(opts.includeNote !== false){
        const areaNote = portalOverrideQuickMenuAreaNoteLabel(row);
        if(areaNote) parts.push(areaNote);
      }
      if(opts.includeVenue !== false){
        const venue = String(row && row.anchor_venue || '').trim();
        if(venue) parts.push(venue);
      }
      return parts.join(' · ');
    }
    /** Revert subtitle, e.g. `28th Jun, goes back to normal`. */
    function portalOverrideRevertCardSubLabel(iso){
      const rowIso = normaliseIsoDate(iso);
      if(!rowIso) return 'Goes back to normal';
      const parts = rowIso.split('-');
      if(parts.length !== 3) return 'Goes back to normal';
      const y = Number(parts[0]), mo = Number(parts[1]) - 1, da = Number(parts[2]);
      const d = new Date(y, mo, da);
      if(isNaN(d.getTime())) return 'Goes back to normal';
      let mon = '';
      try{
        mon = d.toLocaleDateString('en-GB', { month: 'short' });
      }catch(_){
        return 'Goes back to normal';
      }
      if(!mon) return 'Goes back to normal';
      const ord = portalOverrideOrdinalDaySuffix(da);
      const ordSuffix = ord ? ord.replace(/^\d+/, '').toLowerCase() : '';
      return da + ordSuffix + ' ' + mon + ', goes back to normal';
    }
    /** Short date for revert contexts with weekday, e.g. `Sat 28th Jun`. */
    function portalOverrideRevertCardDateLabel(iso){
      const rowIso = normaliseIsoDate(iso);
      if(!rowIso) return '';
      const parts = rowIso.split('-');
      if(parts.length !== 3) return rowIso;
      const y = Number(parts[0]), mo = Number(parts[1]) - 1, da = Number(parts[2]);
      const d = new Date(y, mo, da);
      if(isNaN(d.getTime())) return rowIso;
      let wd = '';
      let mon = '';
      try{
        wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
        mon = d.toLocaleDateString('en-GB', { month: 'short' });
      }catch(_){
        return rowIso;
      }
      if(!wd || !mon) return rowIso;
      const ord = portalOverrideOrdinalDaySuffix(da);
      const dayOrd = ord ? (String(da) + ord.replace(/^\d+/, '').toLowerCase()) : String(da);
      return wd + ' ' + dayOrd + ' ' + mon;
    }
    /** Uppercase ordinal date for New shift quick-menu titles, e.g. `18TH JUNE`. */
    function portalOverrideNewShiftCardDateLabel(iso){
      const rowIso = normaliseIsoDate(iso);
      if(!rowIso) return '';
      const parts = rowIso.split('-');
      if(parts.length !== 3) return '';
      const y = Number(parts[0]), mo = Number(parts[1]) - 1, da = Number(parts[2]);
      const d = new Date(y, mo, da);
      if(isNaN(d.getTime())) return '';
      let month = '';
      try{
        month = d.toLocaleDateString('en-GB', { month: 'long' }).toUpperCase();
      }catch(_){
        month = '';
      }
      if(!month) return '';
      return portalOverrideOrdinalDaySuffix(da) + ' ' + month;
    }
    /** Overrides that count for avatar (orange = reminders), quick menu, vibration, and Notification: session date within the local horizon. Dock quick-menu icon has no highlight state. */
    function portalOverrideRowIsWithinReminderHorizonSessionDate(iso){
      const rowIso = normaliseIsoDate(iso);
      if(!rowIso) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(today) : '';
      if(!todayStr || rowIso < todayStr) return false;
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + PORTAL_ROSTER_OVERRIDE_REMINDER_HORIZON_DAYS);
      const endStr = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(end) : '';
      return !!endStr && rowIso <= endStr;
    }
    const PORTAL_QM_OVERRIDE_DISMISSED_KEY = 'portalQmOverrideDismissed_v1';
    function portalScheduleOverrideRowDismissKey(row){
      const id = String(row && row.id || '').trim();
      if(id) return id;
      const iso = normaliseIsoDate(row && row.session_date);
      const a = portalNormKeyStr(row && row.anchor_staff_id);
      const c = portalNormKeyStr(row && row.anchor_client_id);
      const v = portalNormKeyStr(row && row.anchor_venue);
      const s = String(row && row.anchor_start != null ? row.anchor_start : '');
      const e = String(row && row.anchor_end != null ? row.anchor_end : '');
      const t = String(row && row.override_type || '');
      const lab = String(row && row.anchor_time_slot_label != null ? row.anchor_time_slot_label : '');
      return 'ov:' + [iso, a, c, v, s, e, t, lab].join('|');
    }
    function portalQuickMenuLoadDismissedOverrideKeys(){
      try{
        const raw = localStorage.getItem(PORTAL_QM_OVERRIDE_DISMISSED_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.map(function(x){ return String(x || '').trim(); }).filter(Boolean) : [];
      }catch(_){
        return [];
      }
    }
    window.portalQuickMenuDismissOverrideById = function portalQuickMenuDismissOverrideById(overrideKey){
      const sid = String(overrideKey || '').trim();
      if(!sid) return;
      const cur = portalQuickMenuLoadDismissedOverrideKeys();
      if(cur.indexOf(sid) >= 0) return;
      cur.push(sid);
      try{
        while(cur.length > 220) cur.shift();
        localStorage.setItem(PORTAL_QM_OVERRIDE_DISMISSED_KEY, JSON.stringify(cur));
      }catch(_){}
      if(sid.indexOf('revert:') === 0) portalStaffRevertQueueRemoveByRevertId(sid);
      /* Dismissing changes the override/shadowing attention set — bust the reminder-state cache
         so the avatar halo + quick-menu refresh immediately (not only after the next interaction). */
      if(typeof window.portalInvalidateReminderStateCache === 'function') window.portalInvalidateReminderStateCache();
      try{ window.__PORTAL_PENDING_OVERRIDE_DAYS__ = null; }catch(_inv){}
    };
    function portalQuickMenuDismissOverrideFromEl(el){
      if(!el) return;
      const dismissAllRaw = el.getAttribute('data-portal-override-dismiss-all');
      if(dismissAllRaw){
        try{
          const arr = JSON.parse(dismissAllRaw);
          if(Array.isArray(arr) && arr.length){
            for(let i = 0; i < arr.length; i++){
              if(typeof window.portalQuickMenuDismissOverrideById === 'function'){
                window.portalQuickMenuDismissOverrideById(arr[i]);
              }
            }
            return;
          }
        }catch(_){}
      }
      const oid = el.getAttribute('data-portal-override-id') || '';
      if(oid && typeof window.portalQuickMenuDismissOverrideById === 'function'){
        window.portalQuickMenuDismissOverrideById(oid);
      }
    }
    function portalOverrideAttentionButtonAttrs(item){
      const id = escapeHtml(String(item && item.id || ''));
      const iso = escapeHtml(String(item && item.iso || ''));
      let attrs = ' data-action="open-roster-override-attention" data-portal-override-id="' + id + '" data-portal-override-nav-iso="' + iso + '"';
      if(item && Array.isArray(item._cancelledDismissIds) && item._cancelledDismissIds.length){
        attrs += ' data-portal-override-dismiss-all="' + escapeHtml(JSON.stringify(item._cancelledDismissIds)) + '"';
      }else if(item && Array.isArray(item._shadowingDismissIds) && item._shadowingDismissIds.length){
        attrs += ' data-portal-override-dismiss-all="' + escapeHtml(JSON.stringify(item._shadowingDismissIds)) + '"';
      }
      return attrs;
    }
    function portalOverrideCoverPayload(row){
      let pl = row && row.payload;
      if(typeof pl === 'string'){
        try{ pl = JSON.parse(pl); }catch(_){ pl = null; }
      }
      return pl && typeof pl === 'object' ? pl : null;
    }
    function portalOverrideIsInstructorCoverForLoggedInStaff(row){
      if(String(row && row.override_type || '').trim() !== 'instructor_reassign') return false;
      if(typeof portalScheduleOverrideRowAppliesToLoggedInStaff === 'function'
        && !portalScheduleOverrideRowAppliesToLoggedInStaff(row)) return false;
      const me = portalCanonicalStaffKeyForMatch(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      const pl = portalOverrideCoverPayload(row);
      const cover = portalCanonicalStaffKeyForMatch(pl && pl.covering_staff_id);
      return !!(me && cover && cover === me);
    }
    /** Logged-in staff covers at least one session on this calendar date (spreadsheet instructor change). */
    function portalStaffHasInstructorCoverOnCalendarDate(isoYmd, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = portalCanonicalStaffKeyForMatch(staffId);
      if(!iso || !sid) return false;
      const list = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
      for(let i = 0; i < list.length; i++){
        const row = list[i];
        if(!row || String(row.status || 'active') !== 'active') continue;
        if(String(row.override_type || '').trim() !== 'instructor_reassign') continue;
        if(normaliseIsoDate(row.session_date) !== iso) continue;
        const pl = portalOverrideCoverPayload(row);
        const cover = portalCanonicalStaffKeyForMatch(pl && pl.covering_staff_id);
        if(cover && cover === sid) return true;
      }
      return false;
    }
    /** ISO dates in view where staff covers via instructor_reassign (off-roster weekdays). */
    function portalStaffInstructorCoverCalendarIsoKeys(staffId, viewFrom, viewTo){
      const sid = portalCanonicalStaffKeyForMatch(staffId);
      if(!sid) return [];
      const from = normaliseIsoDate(viewFrom);
      const to = normaliseIsoDate(viewTo);
      const seen = Object.create(null);
      const out = [];
      const list = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
      for(let i = 0; i < list.length; i++){
        const row = list[i];
        if(!row || String(row.status || 'active') !== 'active') continue;
        if(String(row.override_type || '').trim() !== 'instructor_reassign') continue;
        const iso = normaliseIsoDate(row.session_date);
        if(!iso) continue;
        if(from && iso < from) continue;
        if(to && iso > to) continue;
        const pl = portalOverrideCoverPayload(row);
        const cover = portalCanonicalStaffKeyForMatch(pl && pl.covering_staff_id);
        if(!cover || cover !== sid || seen[iso]) continue;
        seen[iso] = true;
        out.push(iso);
      }
      return out;
    }
    try{ window.portalStaffHasInstructorCoverOnCalendarDate = portalStaffHasInstructorCoverOnCalendarDate; }catch(_){}
    try{ window.portalStaffInstructorCoverCalendarIsoKeys = portalStaffInstructorCoverCalendarIsoKeys; }catch(_){}
    /** Admin-added shift on a calendar date (new shift slot_update or session_add) — off-rota weekdays. */
    function portalStaffHasAdminAddedShiftOnCalendarDate(isoYmd, staffId){
      const iso = normaliseIsoDate(isoYmd);
      if(!iso) return false;
      const normStaffKey = function(v){ return String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); };
      const sidNorm = normStaffKey(staffId);
      if(!sidNorm) return false;
      const list = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
      const P = window.PortalParticipantsSheet;
      for(let i = 0; i < list.length; i++){
        const row = list[i];
        if(!row || String(row.status || 'active') !== 'active') continue;
        if(normaliseIsoDate(row.session_date) !== iso) continue;
        if(!portalStaffKeysMatch(row.anchor_staff_id, staffId)) continue;
        const t = String(row.override_type || '').trim();
        if(t === 'session_add') return true;
        if(t === 'slot_update' && P && typeof P.overrideIsNewShiftDayUpdate === 'function' && P.overrideIsNewShiftDayUpdate(row)) return true;
      }
      return false;
    }
    try{ window.portalStaffHasAdminAddedShiftOnCalendarDate = portalStaffHasAdminAddedShiftOnCalendarDate; }catch(_){}
    /** Cover instructor cannot take a client session that overlaps their own open / NO PARTICIPANT roster block. */
    function portalStaffRosterOpenSlotOverlapsWindow(staffId, sessionDateKey, anchorDayWord, winStart, winEnd){
      const sid = String(staffId || '').trim().toLowerCase();
      const iso = normaliseIsoDate(sessionDateKey);
      const dayWord = String(anchorDayWord || '').trim();
      if(!sid || !iso || !winStart) return false;
      const winEndHm = winEnd || winStart;
      const model = Array.isArray(sessionsModel) ? sessionsModel : [];
      for(let i = 0; i < model.length; i++){
        const s = model[i];
        if(!s) continue;
        if(String(s.staffId || '').trim().toLowerCase() !== sid) continue;
        if(typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'){
          if(!portalSessionSpreadsheetRowMatchesCalendarDate(s, iso, dayWord)) continue;
        }else if(String(s.day || '').trim() !== dayWord){
          continue;
        }
        if(sessionModelStatus(s) !== 'Available') continue;
        const st = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(s.start) : String(s.start || '').trim();
        const en = typeof portalCanonicalHmToken === 'function' ? portalCanonicalHmToken(s.end) : String(s.end || s.start || '').trim();
        if(st && portalHmRangeOverlaps(st, en || st, winStart, winEndHm)) return true;
      }
      return false;
    }
    try{ window.portalStaffRosterOpenSlotOverlapsWindow = portalStaffRosterOpenSlotOverlapsWindow; }catch(_){}
    /** Logged-in staff was replaced by a cover instructor for this slot (their shift is off). */
    function portalOverrideIsInstructorReplacedOffRow(row){
      if(String(row && row.override_type || '').trim() !== 'instructor_reassign') return false;
      const me = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      if(!me) return false;
      const anchor = portalNormKeyStr(row && row.anchor_staff_id);
      if(anchor !== me) return false;
      const pl = portalOverrideCoverPayload(row);
      const cover = portalNormKeyStr(pl && pl.covering_staff_id);
      return !!(cover && cover !== me);
    }
    function portalOverrideInstructorReplacedDayDismissKey(row){
      const iso = normaliseIsoDate(row && row.session_date);
      const sid = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      if(!iso || !sid) return '';
      return 'shift-cancelled|' + sid + '|' + iso;
    }
    function portalOverrideInstructorCoverNewShiftDismissKey(row){
      const iso = normaliseIsoDate(row && row.session_date);
      const sid = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      if(!iso || !sid) return '';
      return 'cover-new-shift|' + sid + '|' + iso;
    }
    function portalOverrideQuickMenuKind(row){
      const P = window.PortalParticipantsSheet;
      if(P && typeof P.overrideIsTermNewParticipant === 'function' && P.overrideIsTermNewParticipant(row)) return 'new_participant';
      if(portalOverrideIsInstructorCoverForLoggedInStaff(row)) return 'new_shift';
      if(P && typeof P.overrideIsRosterDayGroupRow === 'function' && P.overrideIsRosterDayGroupRow(row)){
        if(P.overrideRosterDayGroupIsNewShift && P.overrideRosterDayGroupIsNewShift(row)) return 'new_shift';
        return 'roster_day';
      }
      if(P && typeof P.overrideIsNewShiftDayUpdate === 'function' && P.overrideIsNewShiftDayUpdate(row)) return 'new_shift';
      const t = String(row && row.override_type || '').trim();
      if(t === 'client_absence_announced') return 'absent';
      if(t === 'client_replace_in_slot') return portalOverrideIsTrial(row) ? 'trial' : 'makeup';
      if(t === 'slot_open') return 'slot_opened';
      if(t === 'slot_clear_client'){
        let pl = null;
        try{
          pl = row && row.payload && typeof row.payload === 'object' ? row.payload : JSON.parse(String(row && row.payload || ''));
        }catch(_){ pl = null; }
        if(pl && pl.cancelled_by_admin) return 'cancelled';
        if(pl && pl.client_move) return 'client_moved';
      }
      if(portalOverrideIsInstructorReplacedOffRow(row)) return 'shift_cancelled';
      if(t === 'session_add'){
        const sk = String(row.payload && row.payload.kind || '').trim().toLowerCase();
        if(sk === 'shadowing') return 'shadowing';
        if(sk === 'meeting') return 'meeting';
        return 'training';
      }
      return 'other';
    }
    function portalShadowingTrainerDisplayName(trainerRaw){
      const parts = portalSessionAddSplitNames(String(trainerRaw || '').trim());
      const raw = parts[0] || '';
      if(!raw) return '';
      const words = raw.split(/\s+/).filter(Boolean);
      if(words.length > 1) return words[0];
      const fromProfile = typeof portalStaffProfileFirstName === 'function'
        ? portalStaffProfileFirstName(raw)
        : '';
      return fromProfile || raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    function portalSessionAddQuickMenuSub(row){
      const parts = [];
      const slot = typeof portalOverrideQuickMenuTimeSlotLabel === 'function'
        ? portalOverrideQuickMenuTimeSlotLabel(row)
        : '';
      if(slot) parts.push(slot);
      let pl = null;
      try{
        pl = row && row.payload && typeof row.payload === 'object' ? row.payload : JSON.parse(String(row && row.payload || ''));
      }catch(_){ pl = null; }
      const locRaw = String(pl && pl.location || '').trim().toLowerCase();
      const locLabel = locRaw === 'both' ? 'Room & Pool'
        : (locRaw === 'pool' ? 'Pool' : (locRaw === 'room' ? 'Room' : ''));
      if(locLabel) parts.push(locLabel);
      const kind = String(pl && pl.kind || '').trim().toLowerCase();
      if(kind === 'shadowing'){
        const host = portalShadowingTrainerDisplayName(pl && pl.trainer);
        if(host) parts.push(host);
      } else {
        const venue = String(row && row.anchor_venue || '').trim();
        if(venue) parts.push(venue);
      }
      return parts.join(' · ');
    }
    /** First name (or first token) for quick-menu titles such as "Absent - Mary". */
    function portalClientFirstNameTokenForOverride(row){
      const cid = String(row && row.anchor_client_id || '').trim();
      if(!cid) return '';
      let full = '';
      try{
        const low = portalNormKeyStr(cid);
        const c = (typeof clientNotesById !== 'undefined' && clientNotesById)
          ? (clientNotesById[cid] || clientNotesById[low])
          : null;
        full = (c && c.name) ? String(c.name).trim() : '';
      }catch(_){}
      if(!full) return '';
      const parts = full.split(/\s+/).filter(Boolean);
      return parts[0] || full;
    }
    /** Full display name from roster notes when available (for cancelled-session lines). */
    function portalClientDisplayNameForOverride(row){
      const cid = String(row && row.anchor_client_id || '').trim();
      if(!cid) return '';
      try{
        const low = portalNormKeyStr(cid);
        const c = (typeof clientNotesById !== 'undefined' && clientNotesById)
          ? (clientNotesById[cid] || clientNotesById[low])
          : null;
        if(c && c.name) return String(c.name).trim();
      }catch(_){}
      return '';
    }
    function portalScheduleOverrideRowQuickMenuCard(row){
      const kind = portalOverrideQuickMenuKind(row);
      const t0 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(row && row.anchor_start) : String(row && row.anchor_start || '').trim();
      const t1 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(row && row.anchor_end) : String(row && row.anchor_end || '').trim();
      const venue = String(row && row.anchor_venue || '').trim();
      const slot = t0 && t1 ? (t0 + ' – ' + t1) : (t0 || t1 || '');
      let title;
      let sub;
      if(kind === 'slot_opened'){
        title = 'Slot reopened';
        const subParts = [];
        if(slot) subParts.push(slot);
        if(venue) subParts.push(venue);
        sub = subParts.length ? subParts.join(' · ') : 'This block is open on your roster for this date.';
        return {
          id: portalScheduleOverrideRowDismissKey(row),
          iso: normaliseIsoDate(row && row.session_date),
          title: title,
          sub: sub,
          kind: kind
        };
      }
      if(kind === 'new_participant'){
        let pl = null;
        try{
          pl = row && row.payload && typeof row.payload === 'object' ? row.payload : JSON.parse(String(row && row.payload || ''));
        }catch(_){ pl = null; }
        const who = String(pl && pl.to_client_name || '').trim()
          || portalClientFirstNameTokenForOverride(row);
        title = who ? ('New participant — ' + who) : 'New participant for the term';
        sub = 'On your roster for the term. You will see them on their session days.';
        const P = window.PortalParticipantsSheet;
        const dismissId = P && typeof P.scheduleOverrideAttentionDismissKey === 'function'
          ? P.scheduleOverrideAttentionDismissKey(row)
          : '';
        return {
          id: dismissId || portalScheduleOverrideRowDismissKey(row),
          iso: normaliseIsoDate(row && row.session_date),
          title: title,
          sub: sub,
          kind: kind
        };
      }
      if(kind === 'new_shift' || kind === 'roster_day'){
        const isoNav = normaliseIsoDate(row && row.session_date);
        const venue = String(row && row.anchor_venue || '').trim();
        const datePart = isoNav && typeof portalOverrideCardDateParenLabel === 'function'
          ? portalOverrideCardDateParenLabel(isoNav)
          : '';
        if(kind === 'new_shift'){
          const isCover = portalOverrideIsInstructorCoverForLoggedInStaff(row);
          if(isCover){
            const nm = portalClientFirstNameTokenForOverride(row);
            title = nm
              ? ('Schedule change - ' + nm + (datePart ? (' ' + datePart) : ''))
              : ('Schedule change' + (datePart ? (' ' + datePart) : ''));
            sub = typeof portalOverrideQuickMenuDetailSub === 'function'
              ? portalOverrideQuickMenuDetailSub(row, { includeService: false, includeVenue: true, includeNote: true })
              : '';
          }else{
            title = 'NEW SHIFT' + (venue ? (' - ' + venue) : '') + (datePart ? (' ' + datePart) : '');
            sub = typeof portalOverrideQuickMenuDetailSub === 'function'
              ? portalOverrideQuickMenuDetailSub(row, { includeService: true, includeVenue: false, includeNote: false })
              : '';
            if(typeof window.portalStaffPayrollShiftBandLabel === 'function'){
              const staffForBand = String(row && row.anchor_staff_id || (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '') || '').trim();
              const band = window.portalStaffPayrollShiftBandLabel(staffForBand, isoNav, venue);
              if(band){
                const svc = typeof portalOverrideQuickMenuServiceLabel === 'function' ? portalOverrideQuickMenuServiceLabel(row) : '';
                sub = [svc, band].filter(Boolean).join(' · ');
              }
            }
          }
        }else{
          title = 'Schedule change' + (datePart ? (' ' + datePart) : '');
          sub = typeof portalOverrideQuickMenuDetailSub === 'function'
            ? portalOverrideQuickMenuDetailSub(row, { includeService: true, includeVenue: true, includeNote: false })
            : '';
        }
        const P = window.PortalParticipantsSheet;
        const coverDismiss = portalOverrideIsInstructorCoverForLoggedInStaff(row)
          ? portalOverrideInstructorCoverNewShiftDismissKey(row)
          : '';
        const dismissId = coverDismiss
          || (P && typeof P.scheduleOverrideAttentionDismissKey === 'function'
            ? P.scheduleOverrideAttentionDismissKey(row)
            : '');
        return {
          id: dismissId || portalScheduleOverrideRowDismissKey(row),
          iso: isoNav,
          venue: venue,
          title: title,
          sub: sub,
          kind: kind
        };
      }
      if(kind === 'training' || kind === 'shadowing' || kind === 'meeting'){
        const isoNav = normaliseIsoDate(row && row.session_date);
        const datePart = isoNav && typeof portalOverrideCardDateParenLabel === 'function'
          ? portalOverrideCardDateParenLabel(isoNav)
          : '';
        const venue = String(row && row.anchor_venue || '').trim();
        const baseTitle = kind === 'shadowing' ? 'SHADOWING' : (kind === 'meeting' ? 'MEETING' : 'TRAINING');
        title = baseTitle + (venue ? (' - ' + venue) : '') + (datePart ? (' ' + datePart) : '');
        sub = typeof portalSessionAddQuickMenuSub === 'function' ? portalSessionAddQuickMenuSub(row) : '';
        return {
          id: portalScheduleOverrideRowDismissKey(row),
          iso: isoNav,
          venue: venue,
          title: title,
          sub: sub,
          kind: kind
        };
      }
      if(kind === 'shift_cancelled'){
        const isoNav = normaliseIsoDate(row && row.session_date);
        const dayLabel = isoNav && typeof portalOverrideSessionDateDisplayLabel === 'function'
          ? portalOverrideSessionDateDisplayLabel(isoNav)
          : isoNav;
        const todayIso = typeof portalLondonTodayIso === 'function' ? portalLondonTodayIso() : '';
        const futureShift = !!(isoNav && todayIso && isoNav > todayIso);
        const sub = dayLabel
          ? ('Your shift on ' + dayLabel + (futureShift ? ' will be covered.' : ' was covered.'))
          : (futureShift
            ? 'Your shift will be covered by another instructor.'
            : 'Your shift was covered by another instructor.');
        return {
          id: portalOverrideInstructorReplacedDayDismissKey(row),
          iso: isoNav,
          title: 'Session Cancelled',
          sub: sub,
          kind: kind
        };
      }
      if(kind === 'cancelled'){
        const nm = portalClientDisplayNameForOverride(row) || portalClientFirstNameTokenForOverride(row);
        const isoNav = normaliseIsoDate(row && row.session_date);
        const datePart = isoNav && typeof portalOverrideCardDateParenLabel === 'function'
          ? portalOverrideCardDateParenLabel(isoNav)
          : '';
        title = nm ? ('CANCELLED - ' + nm + (datePart ? (' ' + datePart) : '')) : ('CANCELLED' + (datePart ? (' ' + datePart) : ''));
        sub = typeof portalOverrideQuickMenuDetailSub === 'function'
          ? portalOverrideQuickMenuDetailSub(row, { includeService: false, includeVenue: true, includeNote: true })
          : '';
      } else {
        const nameBit = (kind === 'makeup' || kind === 'trial' || kind === 'client_moved')
          ? (portalOverrideReplaceParticipantDisplayName(row) || portalClientFirstNameTokenForOverride(row))
          : portalClientFirstNameTokenForOverride(row);
        const isoNav = normaliseIsoDate(row && row.session_date);
        const datePart = isoNav && typeof portalOverrideCardDateParenLabel === 'function'
          ? portalOverrideCardDateParenLabel(isoNav)
          : '';
        let baseTitle = 'Schedule change';
        if(kind === 'absent') baseTitle = 'ABSENT';
        else if(kind === 'trial') baseTitle = 'TRIAL/NEW';
        else if(kind === 'makeup') baseTitle = 'MAKE UP';
        else if(kind === 'client_moved') baseTitle = 'CHANGED';
        title = nameBit
          ? (baseTitle + ' - ' + nameBit + (datePart ? (' ' + datePart) : ''))
          : (baseTitle + (datePart ? (' ' + datePart) : ''));
        sub = typeof portalOverrideQuickMenuDetailSub === 'function'
          ? portalOverrideQuickMenuDetailSub(row, { includeService: false, includeVenue: true, includeNote: true })
          : '';
      }
      return {
        id: portalScheduleOverrideRowDismissKey(row),
        iso: normaliseIsoDate(row && row.session_date),
        title: title,
        sub: sub,
        kind: kind
      };
    }
    function portalOverrideAbsentQuickMenuSlotKey(row){
      const iso = normaliseIsoDate(row && row.session_date);
      const t0 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(row && row.anchor_start) : String(row && row.anchor_start || '').trim();
      const t1 = typeof portalHmFromDbTime === 'function' ? portalHmFromDbTime(row && row.anchor_end) : String(row && row.anchor_end || '').trim();
      const venue = String(row && row.anchor_venue || '').trim().toLowerCase();
      const slot = t0 && t1 ? (t0 + ' – ' + t1) : (t0 || t1 || '');
      return [iso, slot.toLowerCase(), venue].join('|');
    }
    function portalOverrideQuickMenuSlotKeyFromItem(it){
      return String(it && it.sub || '').trim().toLowerCase();
    }
    function portalOverrideQuickMenuTitleHasName(title, baseTitle){
      const t = String(title || '').trim();
      const base = String(baseTitle || '').trim();
      return t.length > base.length && t.indexOf(base + ' - ') === 0;
    }
    /** One absent card per slot — prefer "Absent - Amar" over generic "Absent". */
    function portalDedupeAbsentOverrideQuickMenuItems(items){
      if(!items || !items.length) return items || [];
      const absentBySlot = Object.create(null);
      const rest = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        if(String(it && it.kind || '') !== 'absent'){
          rest.push(it);
          continue;
        }
        const slot = portalOverrideQuickMenuSlotKeyFromItem(it);
        const named = portalOverrideQuickMenuTitleHasName(it.title, 'Absent');
        const prev = absentBySlot[slot];
        if(!prev){
          absentBySlot[slot] = it;
          continue;
        }
        const prevNamed = portalOverrideQuickMenuTitleHasName(prev.title, 'Absent');
        if(named && !prevNamed) absentBySlot[slot] = it;
      }
      return rest.concat(Object.keys(absentBySlot).map(function(k){ return absentBySlot[k]; }));
    }
    /** One schedule-change card per slot — prefer "Schedule change - Rayyan" over bare "Schedule change". */
    function portalDedupeScheduleChangeOverrideQuickMenuItems(items){
      if(!items || !items.length) return items || [];
      const changeBySlot = Object.create(null);
      const rest = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        if(String(it && it.kind || '') !== 'other'){
          rest.push(it);
          continue;
        }
        const title = String(it && it.title || '').trim();
        if(title.indexOf('Schedule change') !== 0){
          rest.push(it);
          continue;
        }
        const slot = portalOverrideQuickMenuSlotKeyFromItem(it);
        const named = portalOverrideQuickMenuTitleHasName(title, 'Schedule change');
        const prev = changeBySlot[slot];
        if(!prev){
          changeBySlot[slot] = it;
          continue;
        }
        const prevNamed = portalOverrideQuickMenuTitleHasName(prev.title, 'Schedule change');
        if(named && !prevNamed) changeBySlot[slot] = it;
      }
      return rest.concat(Object.keys(changeBySlot).map(function(k){ return changeBySlot[k]; }));
    }
    /** When a day has a grouped roster card, hide per-client schedule-change noise for that day. */
    function portalHideScheduleChangesWhenRosterDayGrouped(items){
      if(!items || !items.length) return items || [];
      if(!items.some(function(it){
        const k = String(it && it.kind || '');
        return k === 'new_shift' || k === 'roster_day';
      })) return items;
      return items.filter(function(it){ return String(it && it.kind || '') !== 'other'; });
    }
    function portalRefreshShadowingOverrideCardSub(item, count){
      if(!item) return item;
      const iso = String(item.iso || '').trim();
      const staffId = typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '';
      let band = '';
      if(iso && staffId && typeof window.portalStaffSessionAddBandLabel === 'function'){
        band = window.portalStaffSessionAddBandLabel({
          session_date: iso,
          anchor_staff_id: staffId,
          anchor_venue: item.venue || '',
          override_type: 'session_add',
          payload: { kind: 'shadowing' }
        }, { kind: 'shadowing', buffer: false }) || '';
      }
      const subParts = [];
      if(count > 1) subParts.push(count + ' shifts');
      if(band) subParts.push(band);
      const baseSub = String(item.sub || '').trim();
      if(baseSub){
        baseSub.split(' · ').forEach(function(part){
          const p = String(part || '').trim();
          if(!p) return;
          if(/^\d+\s+shifts$/i.test(p)) return;
          if(/\d/.test(p) && /\bto\b/i.test(p)) return;
          subParts.push(p);
        });
      }
      return Object.assign({}, item, { sub: subParts.filter(Boolean).join(' · ') });
    }
    /** One shadowing card per day/venue — title shows session count when &gt; 1. */
    function portalCollapseShadowingOverrideQuickMenuItems(items){
      if(!items || !items.length) return items || [];
      const byKey = Object.create(null);
      const rest = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        if(String(it && it.kind || '') !== 'shadowing'){
          rest.push(it);
          continue;
        }
        const iso = String(it.iso || '').trim();
        const venue = String(it.venue || '').trim().toLowerCase();
        const key = iso + '\0' + venue;
        const prev = byKey[key];
        if(!prev){
          byKey[key] = { item: it, count: 1, dismissIds: [String(it.id || '').trim()].filter(Boolean) };
          continue;
        }
        prev.count += 1;
        const did = String(it.id || '').trim();
        if(did) prev.dismissIds.push(did);
      }
      Object.keys(byKey).sort().forEach(function(k){
        const pack = byKey[k];
        const it = pack.item;
        const n = pack.count;
        let title = String(it.title || 'SHADOWING').trim();
        if(n > 1 && title.indexOf('(' + n + ')') < 0){
          title = title.replace(/^SHADOWING\b/, 'SHADOWING (' + n + ')');
        }
        const subParts = [];
        if(n > 1) subParts.push(n + ' shifts');
        const baseSub = String(it.sub || '').trim();
        if(baseSub) subParts.push(baseSub);
        rest.push(portalRefreshShadowingOverrideCardSub(Object.assign({}, it, {
          title: title,
          sub: subParts.join(' · '),
          _shadowingCount: n,
          _shadowingDismissIds: pack.dismissIds.slice()
        }), n));
      });
      return rest;
    }
    function portalRefreshNewShiftOverrideCardSub(item){
      if(!item || !item.iso) return item;
      const iso = String(item.iso || '').trim();
      const staffId = typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '';
      let slot = '';
      if(typeof window.portalStaffPayrollShiftBandLabel === 'function'){
        slot = window.portalStaffPayrollShiftBandLabel(staffId, iso, item.venue || '') || '';
      }
      if(!slot && typeof window.portalStaffDayShiftLabelsByVenue === 'function' && staffId){
        const labels = window.portalStaffDayShiftLabelsByVenue(staffId, iso);
        const venueKey = typeof portalNormKeyStr === 'function'
          ? portalNormKeyStr(item.venue || '')
          : String(item.venue || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
        slot = labels[venueKey] || labels._ || '';
      }
      if(!slot) return item;
      const subRaw = String(item.sub || '').trim();
      const parts = subRaw ? subRaw.split(' · ') : [];
      let svc = '';
      const extras = [];
      parts.forEach(function(p){
        const bit = String(p || '').trim();
        if(!bit) return;
        if(/\d/.test(bit) && /\bto\b/i.test(bit)) return;
        if(!svc && !/\d/.test(bit)) svc = bit;
        else extras.push(bit);
      });
      const newSub = [svc, slot].concat(extras).filter(Boolean).join(' · ');
      return Object.assign({}, item, { sub: newSub || slot });
    }
    /** One New shift card per calendar day (instructor cover / spreadsheet day group). */
    function portalCollapseNewShiftOverrideQuickMenuItems(items){
      if(!items || !items.length) return items || [];
      const byIso = Object.create(null);
      const rest = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        const kind = String(it && it.kind || '');
        if(kind !== 'new_shift' && kind !== 'roster_day'){
          rest.push(it);
          continue;
        }
        const iso = String(it.iso || '').trim();
        if(!iso){
          rest.push(it);
          continue;
        }
        const venue = String(it.venue || '').trim().toLowerCase();
        const dayKey = iso + '\0' + venue;
        const prev = byIso[dayKey];
        if(!prev){
          byIso[dayKey] = it;
          continue;
        }
        if(kind === 'new_shift' && String(prev.kind || '') !== 'new_shift') byIso[dayKey] = it;
      }
      return rest.concat(Object.keys(byIso).sort().map(function(k){
        return portalRefreshNewShiftOverrideCardSub(byIso[k]);
      }));
    }
    /** One Session Cancelled card per day when the logged-in instructor was replaced by cover. */
    function portalCollapseShiftCancelledOverrideQuickMenuItems(items){
      if(!items || !items.length) return items || [];
      const byKey = Object.create(null);
      const rest = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        if(String(it && it.kind || '') !== 'shift_cancelled'){
          rest.push(it);
          continue;
        }
        const key = String(it.id || it.iso || '').trim();
        if(!key){
          rest.push(it);
          continue;
        }
        if(!byKey[key]) byKey[key] = it;
      }
      return rest.concat(Object.keys(byKey).map(function(k){ return byKey[k]; }));
    }
    /** Hide per-client schedule noise when a day-level Session Cancelled card exists. */
    function portalHideScheduleChangesWhenShiftCancelled(items){
      if(!items || !items.length) return items || [];
      const cancelledIsos = Object.create(null);
      items.forEach(function(it){
        if(String(it && it.kind || '') === 'shift_cancelled'){
          cancelledIsos[String(it.iso || '').trim()] = true;
        }
      });
      if(!Object.keys(cancelledIsos).length) return items;
      return items.filter(function(it){
        const iso = String(it && it.iso || '').trim();
        if(cancelledIsos[iso] && String(it.kind || '') !== 'shift_cancelled') return false;
        return true;
      });
    }
    /** One summary card per day for client session cancellations (not per participant). */
    function portalCollapseCancelledOverrideQuickMenuItems(items, dayIso){
      if(!items || !items.length) return items || [];
      const cancelled = [];
      const rest = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        if(String(it && it.kind || '') === 'cancelled') cancelled.push(it);
        else rest.push(it);
      }
      if(!cancelled.length) return items;
      const iso = String(dayIso || (cancelled[0] && cancelled[0].iso) || '').trim();
      const dismissIds = cancelled.map(function(it){ return String(it && it.id || '').trim(); }).filter(Boolean);
      rest.push({
        id: 'cancelled-day:' + iso,
        iso: iso,
        title: 'Sessions Cancelled = ' + cancelled.length,
        sub: '',
        kind: 'cancelled',
        _cancelledDismissIds: dismissIds
      });
      return rest;
    }
    function portalFinalizeOverrideQuickMenuItems(items, dayIso){
      let out = portalDedupeAbsentOverrideQuickMenuItems(items || []);
      out = portalDedupeScheduleChangeOverrideQuickMenuItems(out);
      out = portalCollapseNewShiftOverrideQuickMenuItems(out);
      out = portalCollapseShadowingOverrideQuickMenuItems(out);
      out = portalCollapseShiftCancelledOverrideQuickMenuItems(out);
      out = portalCollapseCancelledOverrideQuickMenuItems(out, dayIso);
      out = portalHideScheduleChangesWhenShiftCancelled(out);
      out = portalHideScheduleChangesWhenRosterDayGrouped(out);
      return out;
    }
    function portalStaffRosterOverrideAttentionState(){
      const empty = { need: false, primaryIso: '', count: 0, rosterOverrideDayGroups: [] };
      try{
        const dismissed = {};
        const dk = portalQuickMenuLoadDismissedOverrideKeys();
        for(let d = 0; d < dk.length; d++) dismissed[dk[d]] = true;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(today) : '';
        if(!todayStr) return empty;
        let list = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
        const P = window.PortalParticipantsSheet;
        if(P && typeof P.collapseScheduleOverrideRowsForAttention === 'function'){
          list = P.collapseScheduleOverrideRowsForAttention(list, P.buildContext ? P.buildContext() : undefined);
        }
        const namedAbsentSlots = Object.create(null);
        for(let ni = 0; ni < list.length; ni++){
          const nr = list[ni];
          if(!nr || String(nr.override_type || '') !== 'client_absence_announced') continue;
          if(!portalScheduleOverrideRowAppliesToLoggedInStaff(nr)) continue;
          const niso = normaliseIsoDate(nr.session_date);
          if(!niso || typeof portalOverrideRowIsWithinReminderHorizonSessionDate !== 'function' || !portalOverrideRowIsWithinReminderHorizonSessionDate(niso)) continue;
          if(!String(nr.anchor_client_id || '').trim()) continue;
          const nslot = portalOverrideAbsentQuickMenuSlotKey(nr);
          if(nslot) namedAbsentSlots[nslot] = true;
        }
        const byIso = {};
        const seen = {};
        for(let i = 0; i < list.length; i++){
          const r = list[i];
          if(!r || !portalScheduleOverrideRowAppliesToLoggedInStaff(r)) continue;
          const iso = normaliseIsoDate(r.session_date);
          if(!iso || typeof portalOverrideRowIsWithinReminderHorizonSessionDate !== 'function' || !portalOverrideRowIsWithinReminderHorizonSessionDate(iso)) continue;
          if(String(r.override_type || '') === 'slot_open') continue;
          if(String(r.override_type || '') === 'client_absence_announced'){
            const slotKey = portalOverrideAbsentQuickMenuSlotKey(r);
            const hasClient = !!String(r.anchor_client_id || '').trim();
            if(!hasClient && slotKey && namedAbsentSlots[slotKey]) continue;
          }
          const card = portalScheduleOverrideRowQuickMenuCard(r);
          if(!card.id || dismissed[card.id]) continue;
          if(seen[card.id]) continue;
          seen[card.id] = true;
          const rowMs = new Date(r.created_at || 0).getTime() || 0;
          const pack = { id: card.id, iso: card.iso, title: card.title, sub: card.sub, kind: card.kind, _sort: rowMs };
          if(!byIso[iso]) byIso[iso] = [];
          byIso[iso].push(pack);
        }
        const qList = portalStaffRevertQueueLoad();
        for(let qi = 0; qi < qList.length; qi++){
          const q = qList[qi];
          if(!q || !q.revertId || !q.iso) continue;
          const rid = String(q.revertId);
          if(dismissed[rid]) continue;
          if(seen[rid]) continue;
          const qiso = normaliseIsoDate(q.iso);
          if(!qiso || typeof portalOverrideRowIsWithinReminderHorizonSessionDate !== 'function' || !portalOverrideRowIsWithinReminderHorizonSessionDate(qiso)) continue;
          seen[rid] = true;
          if(!byIso[qiso]) byIso[qiso] = [];
          byIso[qiso].push({
            id: rid,
            iso: qiso,
            title: String(q.title || 'CHANGE UNDONE'),
            sub: String(q.sub || 'Goes back to normal'),
            kind: 'reverted',
            _sort: Number(q._sort) || Date.now()
          });
        }
        const hostItems = portalShadowingHostQuickMenuItemsForAttention(
          typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '',
          dashboardData && dashboardData.staffName,
          dismissed,
          seen
        );
        for(let hi = 0; hi < hostItems.length; hi++){
          const pack = hostItems[hi];
          const iso = pack.iso;
          if(!byIso[iso]) byIso[iso] = [];
          byIso[iso].push(pack);
        }
        const isos = Object.keys(byIso).sort();
        const rosterOverrideDayGroups = [];
        let n = 0;
        for(let g = 0; g < isos.length; g++){
          const iso = isos[g];
          const items = byIso[iso];
          items.sort(function(a, b){ return (b._sort || 0) - (a._sort || 0); });
          for(let a = 0; a < items.length; a++) delete items[a]._sort;
          const dedupedItems = portalFinalizeOverrideQuickMenuItems(items, iso);
          n += dedupedItems.length;
          rosterOverrideDayGroups.push({
            iso: iso,
            label: typeof portalOverrideSessionDateDisplayLabel === 'function' ? portalOverrideSessionDateDisplayLabel(iso) : iso,
            items: dedupedItems
          });
        }
        if(!n) return empty;
        const firstIso = (rosterOverrideDayGroups[0] && rosterOverrideDayGroups[0].iso) || '';
        return {
          need: true,
          primaryIso: firstIso,
          count: n,
          rosterOverrideDayGroups: rosterOverrideDayGroups
        };
      }catch(_){
        return empty;
      }
    }
    function portalScheduleOverrideAbsentLooseMatchesSession(r, s, iso){
      if(!r || !s || !iso) return false;
      if(String(r.status || 'active') !== 'active') return false;
      if(String(r.override_type || '').trim() !== 'client_absence_announced') return false;
      const rowIso = normaliseIsoDate(r.session_date);
      if(!rowIso || rowIso !== iso) return false;
      if(!portalOverrideAnchorStaffKeysMatch(r.anchor_staff_id, s.staffId)) return false;
      if(!portalRosterClientIdsMatch(r.anchor_client_id, s.clientId)) return false;
      if(portalScheduleOverrideAnchorTimesMatchSession(r, s, 'client_absence_announced')) return true;
      return portalOverrideSlotLabelMatchesRow(r, s);
    }
    function portalScheduleOverridesMatchingSession(s, sessionDateIso, overrideType){
      if(!s) return [];
      const iso = normaliseIsoDate(sessionDateIso);
      if(!iso) return [];
      const wantType = overrideType ? String(overrideType || '').trim() : '';
      function rowMatchesSession(r, requireSlotLabel){
        if(String(r.status || 'active') !== 'active') return false;
        const rowIso = normaliseIsoDate(r.session_date);
        if(!rowIso || rowIso !== iso) return false;
        if(!portalOverrideAnchorStaffKeysMatch(r.anchor_staff_id, s.staffId)) return false;
        if(portalNormKeyStr(r.anchor_venue) !== portalNormKeyStr(s.venue)) return false;
        const rowOvType = wantType || String(r.override_type || '').trim();
        const openMakeupAnchor = rowOvType === 'client_replace_in_slot' && portalScheduleOverrideAnchorIsOpenSlot(r.anchor_client_id);
        if(!openMakeupAnchor && !portalRosterClientIdsMatch(r.anchor_client_id, s.clientId)) return false;
        if(!portalScheduleOverrideAnchorTimesMatchSession(r, s, wantType || String(r.override_type || '').trim())) return false;
        if(requireSlotLabel && !portalOverrideSlotLabelMatchesRow(r, s)) return false;
        if(String(r.override_type || '').trim() === 'override_void') return false;
        if(wantType && String(r.override_type || '').trim() !== wantType) return false;
        return true;
      }
      const all = portalScheduleOverrideRowsAll();
      let rows = all.filter(function(r){ return rowMatchesSession(r, true); });
      if(!rows.length){
        const loose = all.filter(function(r){ return rowMatchesSession(r, false); });
        if(loose.length === 1) rows = loose;
        else if(loose.length > 1){
          loose.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
          rows = [loose[0]];
        }
      }
      if(!rows.length && wantType === 'client_absence_announced'){
        const absentLoose = all.filter(function(r){ return portalScheduleOverrideAbsentLooseMatchesSession(r, s, iso); });
        if(absentLoose.length === 1) rows = absentLoose;
        else if(absentLoose.length > 1){
          absentLoose.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
          rows = [absentLoose[0]];
        }
      }
      rows.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
      return rows;
    }
    /** True when the staff that owns this roster slot has been reassigned OFF it (a cover took over),
     *  even if a higher-priority override (e.g. a client absence) also matches the same slot. */
    function portalSessionStaffReassignedOff(s, sessionDateIso){
      const who = portalNormKeyStr(s && s.staffId);
      if(!who) return false;
      const rows = typeof portalScheduleOverridesMatchingSession === 'function'
        ? portalScheduleOverridesMatchingSession(s, sessionDateIso, 'instructor_reassign')
        : [];
      for(let i = 0; i < rows.length; i++){
        const pl = portalOverrideCoverPayload(rows[i]);
        const cover = portalNormKeyStr(pl && pl.covering_staff_id);
        if(cover && cover !== who) return true;
      }
      return false;
    }
    try{ window.portalSessionStaffReassignedOff = portalSessionStaffReassignedOff; }catch(_){}
    /** True when the logged-in worker was reassigned OFF the slot this override row points at —
     *  so absence/replace/other cards anchored to them must not surface (the cover handles it). */
    function portalLoggedInStaffReassignedOffSlotForRow(row){
      const me = portalNormKeyStr(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '');
      if(!me || !row) return false;
      if(!portalStaffKeysMatch(row.anchor_staff_id, me)) return false;
      const iso = normaliseIsoDate(row.session_date);
      if(!iso) return false;
      const startTok = portalCanonicalHmToken(row.anchor_start);
      const venue = portalNormKeyStr(row.anchor_venue);
      const all = portalScheduleOverrideRowsAll();
      for(let i = 0; i < all.length; i++){
        const r = all[i];
        if(String(r.status || 'active') !== 'active') continue;
        if(String(r.override_type || '').trim() !== 'instructor_reassign') continue;
        if(normaliseIsoDate(r.session_date) !== iso) continue;
        if(!portalStaffKeysMatch(r.anchor_staff_id, me)) continue;
        const pl = portalOverrideCoverPayload(r);
        const cover = portalNormKeyStr(pl && pl.covering_staff_id);
        if(!cover || cover === me) continue;
        const rStart = portalCanonicalHmToken(r.anchor_start);
        if(startTok && rStart && startTok !== rStart) continue;
        const rVenue = portalNormKeyStr(r.anchor_venue);
        if(venue && rVenue && venue !== rVenue) continue;
        return true;
      }
      return false;
    }
    try{ window.portalLoggedInStaffReassignedOffSlotForRow = portalLoggedInStaffReassignedOffSlotForRow; }catch(_){}
    function portalScheduleOverrideForSessionByType(s, sessionDateIso, overrideType){
      const rows = portalScheduleOverridesMatchingSession(s, sessionDateIso, overrideType);
      if(rows.length || overrideType !== 'client_replace_in_slot') return rows[0] || null;
      const iso = normaliseIsoDate(sessionDateIso);
      if(!iso || !s) return null;
      const all = portalScheduleOverrideRowsAll().filter(function(r){
        if(String(r.status || 'active') !== 'active') return false;
        if(String(r.override_type || '').trim() !== 'client_replace_in_slot') return false;
        if(!portalScheduleOverrideAnchorIsOpenSlot(r.anchor_client_id)) return false;
        return portalScheduleOverrideMatchesSessionWindow(r, s, iso);
      });
      all.sort(function(a, b){ return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
      return all[0] || null;
    }
    function portalPickScheduleOverrideForSession(s, sessionDateIso){
      const rows = portalScheduleOverridesMatchingSession(s, sessionDateIso, null);
      const replaceOv = portalScheduleOverrideForSessionByType(s, sessionDateIso, 'client_replace_in_slot');
      if(!rows.length) return replaceOv || null;
      const typePri = {
        client_replace_in_slot: 30,
        slot_update: 25,
        client_absence_announced: 20,
        instructor_reassign: 15,
        slot_open: 10,
        slot_clear_client: 10,
        slot_close: 5
      };
      rows.sort(function(a, b){
        const pa = typePri[String(a.override_type || '').trim()] || 0;
        const pb = typePri[String(b.override_type || '').trim()] || 0;
        if(pb !== pa) return pb - pa;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      const picked = rows[0] || null;
      if(replaceOv){
        const pickedType = String(picked && picked.override_type || '').trim();
        if(!picked || pickedType === 'slot_clear_client' || pickedType === 'client_absence_announced'){
          return replaceOv;
        }
      }
      return picked;
    }
    /** Same resolver Today uses (`portalPickScheduleOverrideForSession` + `__PORTAL_SCHEDULE_OVERRIDE_ROWS__`). */
    function portalTodayScheduleOverrideForSession(s, sessionDateIso){
      return portalPickScheduleOverrideForSession(s, sessionDateIso);
    }
    /** Make-up replace on this roster anchor when loose window match missed the primary resolver. */
    function portalReplaceOverrideForSessionAnchor(s, sessionDateIso){
      const iso = normaliseIsoDate(sessionDateIso);
      if(!iso || !s) return null;
      const sid = portalNormKeyStr(s.staffId);
      const all = portalScheduleOverrideRowsAll();
      let best = null;
      for(let i = 0; i < all.length; i++){
        const r = all[i];
        if(String(r.status || 'active') !== 'active') continue;
        if(String(r.override_type || '').trim() !== 'client_replace_in_slot') continue;
        if(normaliseIsoDate(r.session_date) !== iso) continue;
        if(!portalStaffKeysMatch(r.anchor_staff_id, sid)) continue;
        if(!portalRosterClientIdsMatch(r.anchor_client_id, s.clientId)) continue;
        if(!portalScheduleOverrideMatchesSessionWindow(r, s, iso)) continue;
        if(!best || new Date(r.created_at || 0) > new Date(best.created_at || 0)) best = r;
      }
      return best;
    }
    /** Active MakeUp replace on this roster anchor (replacement ≠ anchor client). */
    function portalReplaceMakeupOverrideForSession(s, sessionDateIso){
      if(!s || !sessionDateIso) return null;
      const iso = normaliseIsoDate(sessionDateIso);
      if(!iso) return null;
      let ov = typeof portalScheduleOverrideForSessionByType === 'function'
        ? portalScheduleOverrideForSessionByType(s, iso, 'client_replace_in_slot')
        : null;
      if(!ov && typeof portalReplaceOverrideForSessionAnchor === 'function'){
        ov = portalReplaceOverrideForSessionAnchor(s, iso);
      }
      if(!ov || portalOverrideIsTrial(ov)) return null;
      const repId = portalOverrideReplacementClientId(ov.payload);
      const anchorId = String(s.clientId || '').trim().toLowerCase();
      if(!repId || !anchorId || repId === anchorId) return null;
      return ov;
    }
    function portalRosterSessionSupersededByMakeupReplace(s, sessionDateIso){
      return !!portalReplaceMakeupOverrideForSession(s, sessionDateIso);
    }
    function portalBuildAdminAbsentSessionItem(s, sessionDateKey, viewDay, anchor, absentOv, supportHidePoolNote){
      if(!s || !absentOv) return null;
      const activity = (s.activity || 'Swimming').trim();
      const time = rosterSlotTimeLabel(s);
      const baseId = String(s.clientId || '').trim().toLowerCase();
      const cAbs = portalClientNotesLookup(baseId) || clientNotesById[baseId];
      if(!cAbs) return null;
      const showSpec = !isBespokeActivity(activity);
      let poolLocationAbs = resolvePoolLocationLabelFromSession(s, activity, cAbs, viewDay);
      if(supportHidePoolNote) poolLocationAbs = null;
      const areaAbs = rosterAreaLabelForSession(s, activity, supportHidePoolNote);
      const _rowTs = portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor);
      const sessionVenue = String(s.venue || '').trim() || '—';
      return {
        time,
        kind: 'client',
        clientId: baseId,
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
        sessionKey: `${sessionDateKey}|${s.start}|${baseId}`,
        sessionStartTs: _rowTs.sessionStartTs,
        sessionEndTs: _rowTs.sessionEndTs,
        noSessionFeedbackRequired: true,
        actionsDisabled: true,
        detailsOpenAllowed: true,
        portalOverrideSuppressReviewOrange: true,
        portalOverrideCardTone: 'green',
        portalOverrideAlertPill: 'ABSENT',
        __portalBaseSession: s,
        sessionVenue,
        scheduleAdminAdjusted: true,
        __portalScheduleOverride: absentOv
      };
    }
    /** When admin marks absent + make-up on the same slot, show both cards (Aqsa green + replacement pink). */
    function portalInjectAbsentCardsAlongsideMakeup(items, sessionDateKey, viewDay, anchor, supportHidePoolNote){
      if(!Array.isArray(items) || !items.length) return items || [];
      const seen = Object.create(null);
      items.forEach(function(it){
        if(it && it.clientId && it.portalOverrideAlertPill === 'ABSENT'){
          seen[String(it.clientId).toLowerCase()] = true;
        }
      });
      const out = [];
      items.forEach(function(it){
        if(it && it.portalOverrideMakeUpTag){
          const base = it.__portalBaseSession;
          const origId = base ? String(base.clientId || '').trim().toLowerCase() : '';
          if(base && origId && !seen[origId]){
            const absentOv = portalScheduleOverrideForSessionByType(base, sessionDateKey, 'client_absence_announced');
            if(absentOv){
              const absentItem = portalBuildAdminAbsentSessionItem(base, sessionDateKey, viewDay, anchor, absentOv, supportHidePoolNote);
              if(absentItem){
                seen[origId] = true;
                out.push(absentItem);
              }
            }
          }
        }
        out.push(it);
      });
      return out;
    }
    function portalSessionHasReplaceMakeupOverride(s, sessionDateIso){
      return !!portalScheduleOverrideForSessionByType(s, sessionDateIso, 'client_replace_in_slot');
    }
    function portalTodayCardUsesReplaceOverride(it){
      if(!it || it.kind !== 'client') return false;
      if(it.portalOverrideTrialTag || it.portalOverrideMakeUpTag) return true;
      const ov = it.__portalScheduleOverride;
      return !!(ov && String(ov.override_type || '').trim() === 'client_replace_in_slot');
    }
    /** Make-up Today rows must resolve feedback against the replacement client, not the cleared roster anchor. */
    function portalReviewSessionForItem(item){
      if(!item) return null;
      if(portalTodayCardUsesReplaceOverride(item)){
        const base = item.__portalBaseSession || {};
        const repId = String(item.clientId || '').trim().toLowerCase();
        if(!repId) return base;
        return Object.assign({}, base, { clientId: repId });
      }
      return item.__portalBaseSession || null;
    }
    function portalOverridePayloadObject(ov){
      let p = ov && ov.payload;
      if(typeof p === 'string'){
        try{ p = JSON.parse(p); }catch(_){ p = {}; }
      }
      return p && typeof p === 'object' ? p : {};
    }
    /** Summer Term 2+ dated views must not pick undated weekday snapshots from another week. */
    function portalSpreadsheetSessionMatchesOverrideIso(s, iso){
      const rowIso = normaliseIsoDate(s && (s.session_date || s.sessionDate));
      if(!iso) return true;
      if(rowIso) return rowIso === iso;
      if(typeof portalCalendarIsoUsesSummerDatedRosterOnly === 'function' && portalCalendarIsoUsesSummerDatedRosterOnly(iso)) return false;
      return true;
    }
    function portalSyntheticSessionFromOverride(ov, viewDay){
      if(!ov) return null;
      const vw = String(viewDay || '').trim();
      const iso = normaliseIsoDate(ov.session_date);
      const pl = portalOverridePayloadObject(ov);
      const area = String(pl.area || pl.roster_area || '').trim();
      return {
        staffId: String(ov.anchor_staff_id || '').trim().toLowerCase(),
        day: vw,
        start: portalHmFromDbTime(ov.anchor_start) || '09:00',
        end: portalHmFromDbTime(ov.anchor_end) || portalHmFromDbTime(ov.anchor_start) || '10:00',
        venue: String(ov.anchor_venue || '').trim(),
        clientId: portalScheduleOverrideAnchorIsOpenSlot(ov.anchor_client_id)
          ? 'available'
          : String(ov.anchor_client_id || '').trim().toLowerCase(),
        activity: String(pl.service || pl.activity || 'Swimming').trim() || 'Swimming',
        rosterService: String(pl.service || 'Aquatic Activity').trim(),
        rosterArea: area,
        status: 'scheduled',
        session_date: iso || '',
        timeSlotLabel: String(ov.anchor_time_slot_label || '').trim()
      };
    }
    function portalResolveMakeupOverrideBaseSession(ov, viewDay){
      if(!ov) return null;
      const found = portalFindSpreadsheetSessionMatchingOverride(ov, viewDay);
      if(found) return found;
      return portalSyntheticSessionFromOverride(ov, viewDay);
    }
    /** Ensure MakeUp replace cards stay pink with anchor pool/area even when loose matching missed flags. */
    function portalUpgradeTodayMakeupReplacePresentation(items, sessionDateKey, viewDay, supportHidePoolNote){
      if(!Array.isArray(items) || !items.length) return items || [];
      const iso = normaliseIsoDate(sessionDateKey);
      if(!iso) return items;
      return items.map(function(it){
        if(!it || it.kind !== 'client') return it;
        let ov = it.__portalScheduleOverride;
        const base = it.__portalBaseSession;
        if((!ov || String(ov.override_type || '').trim() !== 'client_replace_in_slot') && base){
          ov = (typeof portalReplaceOverrideForSessionAnchor === 'function'
            ? portalReplaceOverrideForSessionAnchor(base, iso)
            : null)
            || (typeof portalScheduleOverrideForSessionByType === 'function'
              ? portalScheduleOverrideForSessionByType(base, iso, 'client_replace_in_slot')
              : null)
            || ov;
        }
        if(!ov || String(ov.override_type || '').trim() !== 'client_replace_in_slot') return it;
        if(portalOverrideIsTrial(ov)) return it;
        const repId = portalOverrideReplacementClientId(ov.payload);
        const repName = portalOverrideReplacementClientName(ov.payload);
        let anchorBase = base;
        if(!anchorBase || (!anchorBase.rosterArea && !anchorBase.area)){
          anchorBase = portalResolveMakeupOverrideBaseSession(ov, viewDay) || anchorBase;
        }
        const activity = String((anchorBase && anchorBase.activity) || it.activity || 'Swimming').trim();
        const anchorNotes = anchorBase
          ? (portalClientNotesLookup(String(anchorBase.clientId || '').trim().toLowerCase()) || { name: '' })
          : { name: '' };
        const repNotes = portalClientNotesLookup(repId) || (repName ? { name: repName } : null);
        let poolLocationLabel = resolvePoolLocationLabelFromSession(anchorBase || base || {}, activity, anchorNotes, viewDay);
        if(supportHidePoolNote) poolLocationLabel = null;
        const areaLabel = rosterAreaLabelForSession(anchorBase || base || {}, activity, supportHidePoolNote, viewDay);
        const poolTier = poolTierForAreaNoteRow(anchorBase || base || {}, activity, anchorNotes, viewDay, supportHidePoolNote);
        return Object.assign({}, it, {
          clientId: repId || it.clientId,
          name: portalParticipantDisplayName((repNotes && repNotes.name) || repName || it.name || repId),
          activity: activity,
          areaLabel: areaLabel,
          poolLocationLabel: poolLocationLabel,
          poolTier: poolTier,
          showPoolSymbol: !!(poolLocationLabel || areaLabel),
          general: clientGeneralBodyForMakeupSession(anchorNotes, repNotes, anchorBase || base || {}, activity, viewDay, supportHidePoolNote),
          portalOverrideMakeUpTag: true,
          portalOverrideTrialTag: false,
          portalOverrideCardTone: 'pink',
          portalOverrideSymbolText: 'Make Up',
          scheduleAdminAdjusted: true,
          __portalScheduleOverride: ov,
          __portalBaseSession: anchorBase || base || it.__portalBaseSession
        });
      });
    }
    function portalMinuteIntervalsFullyCover(lo, hi, intervals){
      if(!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return false;
      if(!Array.isArray(intervals) || !intervals.length) return false;
      const sorted = intervals.slice().sort(function(a, b){ return a[0] - b[0]; });
      let cursor = lo;
      for(let i = 0; i < sorted.length; i++){
        const a = sorted[i][0];
        const b = sorted[i][1];
        if(b <= cursor) continue;
        if(a > cursor) return false;
        cursor = Math.max(cursor, b);
        if(cursor >= hi) return true;
      }
      return cursor >= hi;
    }
    function portalAnchorSessionFullyCoveredByMakeupReplaces(base, iso, staffId){
      if(!base || !iso || !staffId) return false;
      const anchorId = String(base.clientId || '').trim().toLowerCase();
      if(!anchorId || portalScheduleOverrideAnchorIsOpenSlot(anchorId)) return false;
      const rowStart = portalHmToMinutes(base.start);
      const rowEnd = portalHmToMinutes(base.end || base.start);
      if(!Number.isFinite(rowStart) || !Number.isFinite(rowEnd) || rowEnd <= rowStart) return false;
      const sid = portalNormKeyStr(staffId);
      const venue = portalNormKeyStr(base.venue);
      const intervals = [];
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(String(ov.status || 'active') !== 'active') return;
        if(String(ov.override_type || '').trim() !== 'client_replace_in_slot') return;
        if(normaliseIsoDate(ov.session_date) !== iso) return;
        if(!portalStaffKeysMatch(ov.anchor_staff_id, sid)) return;
        if(portalOverrideIsTrial(ov)) return;
        const repId = portalOverrideReplacementClientId(ov.payload);
        const ovAnchorId = String(ov.anchor_client_id || '').trim().toLowerCase();
        if(!repId || !ovAnchorId || repId === ovAnchorId || portalScheduleOverrideAnchorIsOpenSlot(ovAnchorId)) return;
        if(!portalRosterClientIdsMatch(ovAnchorId, anchorId)) return;
        if(portalNormKeyStr(ov.anchor_venue) !== venue) return;
        const lo = portalHmToMinutes(portalHmFromDbTime(ov.anchor_start));
        const hi = portalHmToMinutes(portalHmFromDbTime(ov.anchor_end) || portalHmFromDbTime(ov.anchor_start));
        if(!Number.isFinite(lo) || !Number.isFinite(hi)) return;
        const clippedLo = Math.max(lo, rowStart);
        const clippedHi = Math.min(hi, rowEnd);
        if(clippedHi > clippedLo) intervals.push([clippedLo, clippedHi]);
      });
      return portalMinuteIntervalsFullyCover(rowStart, rowEnd, intervals);
    }
    function portalSuppressAnchorClientWhenMakeupReplaced(items, sessionDateKey, staffId){
      if(!Array.isArray(items) || !items.length) return items || [];
      const iso = normaliseIsoDate(sessionDateKey);
      const sid = portalNormKeyStr(staffId || (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : ''));
      function slotKey(it){
        const base = it && it.__portalBaseSession ? it.__portalBaseSession : {};
        const skParts = String(it && it.sessionKey || '').split('|');
        const start = portalCanonicalHmToken(base.start || skParts[1] || '');
        const end = portalCanonicalHmToken(base.end || '');
        const staff = portalNormKeyStr(base.staffId || sid);
        const venue = portalNormKeyStr(it && it.sessionVenue != null ? it.sessionVenue : base.venue);
        return [start, end, staff, venue].join('|');
      }
      const replacedAnchors = Object.create(null);
      function markReplaced(it){
        if(!it || !it.__portalBaseSession) return;
        const anchorId = String(it.__portalBaseSession.clientId || '').trim().toLowerCase();
        if(!anchorId || portalScheduleOverrideAnchorIsOpenSlot(anchorId)) return;
        replacedAnchors[slotKey(it) + '|' + anchorId] = true;
      }
      items.forEach(function(it){
        if(it && it.portalOverrideMakeUpTag) markReplaced(it);
      });
      if(iso && sid){
        portalScheduleOverrideRowsAll().forEach(function(ov){
          if(String(ov.status || 'active') !== 'active') return;
          if(String(ov.override_type || '').trim() !== 'client_replace_in_slot') return;
          if(normaliseIsoDate(ov.session_date) !== iso) return;
          if(!portalStaffKeysMatch(ov.anchor_staff_id, sid)) return;
          if(portalOverrideIsTrial(ov)) return;
          const repId = portalOverrideReplacementClientId(ov.payload);
          const anchorId = String(ov.anchor_client_id || '').trim().toLowerCase();
          if(!repId || !anchorId || repId === anchorId || portalScheduleOverrideAnchorIsOpenSlot(anchorId)) return;
          const start = portalCanonicalHmToken(portalHmFromDbTime(ov.anchor_start));
          const end = portalCanonicalHmToken(portalHmFromDbTime(ov.anchor_end));
          const venue = portalNormKeyStr(ov.anchor_venue);
          replacedAnchors[[start, end, sid, venue].join('|') + '|' + anchorId] = true;
        });
      }
      if(!Object.keys(replacedAnchors).length) return items;
      return items.filter(function(it){
        if(!it || it.kind !== 'client') return true;
        if(it.portalOverrideMakeUpTag) return true;
        if(String(it.portalOverrideAlertPill || '').trim().toUpperCase() === 'ABSENT') return true;
        const base = it.__portalBaseSession;
        if(!base) return true;
        const anchorId = String(base.clientId || it.clientId || '').trim().toLowerCase();
        if(!anchorId) return true;
        if(replacedAnchors[slotKey(it) + '|' + anchorId]) return false;
        return !portalAnchorSessionFullyCoveredByMakeupReplaces(base, iso, sid);
      });
    }
    function portalBuildMakeupTodayCardFromOverride(base, ov, sessionDateKey, anchorDayWord, anchor, supportHidePoolNote){
      if(!base || !ov) return null;
      const s = Object.assign({}, base, { __portalBaseSession: base });
      const activity = (s.activity || 'Swimming').trim();
      const time = rosterSlotTimeLabel(s);
      const effClientId = portalOverrideReplacementClientId(ov.payload) || String(s.clientId || '').trim().toLowerCase();
      const nameFromReplace = portalOverrideReplacementClientName(ov.payload);
      const c = portalClientNotesLookup(effClientId) || clientNotesById[effClientId]
        || (nameFromReplace || effClientId ? {
          name: nameFromReplace || effClientId,
          generalLead: '',
          specialty: '',
          specialtyClimbing: '',
          specialtyFitness: '',
          generalInfoSheet: ''
        } : null);
      if(!c) return null;
      const anchorNotes = portalClientNotesLookup(String(base.clientId || '').trim().toLowerCase()) || { name: '' };
      let poolLocationLabel = resolvePoolLocationLabelFromSession(s, activity, anchorNotes, anchorDayWord);
      if(supportHidePoolNote) poolLocationLabel = null;
      const areaLabel = rosterAreaLabelForSession(s, activity, supportHidePoolNote, anchorDayWord);
      const poolTier = poolTierForAreaNoteRow(s, activity, anchorNotes, anchorDayWord, supportHidePoolNote);
      const showPoolSymbol = !!(poolLocationLabel || areaLabel);
      const showSpec = !isBespokeActivity(activity);
      const sessionKey = portalBuildSessionReviewKey(sessionDateKey, s, anchorDayWord, effClientId);
      const rowTs = portalSessionRowTimestamps(sessionDateKey, s.start, s.end, anchor);
      const isTrial = portalOverrideIsTrial(ov);
      const makeUpPink = !isTrial && !isSessionEndedForFeedback({ sessionEndTs: rowTs.sessionEndTs, sessionKey });
      const slotWasUpdated = typeof portalSessionRosterTimeWasUpdated === 'function'
        && portalSessionRosterTimeWasUpdated(s, sessionDateKey);
      const isMakeUpCard = !isTrial;
      return {
        time,
        kind: 'client',
        clientId: effClientId,
        name: c.name || nameFromReplace || effClientId,
        activity,
        areaLabel,
        poolLocationLabel,
        poolTier,
        showPoolSymbol,
        showSpecialty: showSpec,
        specialtyLabel: specialtyInfoTitle(activity),
        general: clientGeneralBodyForMakeupSession(anchorNotes, c, s, activity, anchorDayWord, supportHidePoolNote),
        specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
        openSheet: true,
        sessionKey,
        sessionStartTs: rowTs.sessionStartTs,
        sessionEndTs: rowTs.sessionEndTs,
        scheduleAdminAdjusted: true,
        portalOverrideMakeUpTag: !isTrial,
        portalOverrideTrialTag: isTrial,
        portalOverrideCardTone: isMakeUpCard ? 'pink' : (slotWasUpdated ? 'yellow' : (isTrial ? 'trial' : '')),
        portalOverrideSymbolText: isTrial ? 'Trial' : (isMakeUpCard ? 'Make Up' : ''),
        portalOverrideHideAdminBadge: false,
        portalOverrideAlertPill: slotWasUpdated ? 'UPDATED' : '',
        portalRosterTimeUpdated: !!slotWasUpdated,
        sessionVenue: String(s.venue || '').trim() || '—',
        __portalBaseSession: base,
        __portalScheduleOverride: ov
      };
    }
    /** Make-up overrides on closed / cleared slots still need their own Today card (independent of other cancels). */
    function portalInjectOrphanMakeupOverrideCards(items, sessionDateKey, anchorDayWord, anchor, supportHidePoolNote, staffId){
      if(!Array.isArray(items)) return items || [];
      const iso = normaliseIsoDate(sessionDateKey);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!iso || !sid) return items;
      const seenOvIds = Object.create(null);
      const seenRepKeys = Object.create(null);
      items.forEach(function(it){
        const ov = it && it.__portalScheduleOverride;
        if(ov && ov.id) seenOvIds[String(ov.id)] = true;
        if(portalTodayCardUsesReplaceOverride(it)){
          const repId = String(it.clientId || '').trim().toLowerCase();
          const base = it.__portalBaseSession;
          const start = base ? portalCanonicalHmToken(base.start) : (String(it.sessionKey || '').split('|')[1] || '');
          if(repId && start) seenRepKeys[repId + '|' + start] = true;
        }
      });
      const out = items.slice();
      portalScheduleOverrideRowsAll().forEach(function(ov){
        if(!ov || String(ov.status || 'active') !== 'active') return;
        if(String(ov.override_type || '').trim() !== 'client_replace_in_slot') return;
        if(normaliseIsoDate(ov.session_date) !== iso) return;
        if(!portalStaffKeysMatch(ov.anchor_staff_id, sid)) return;
        if(ov.id && seenOvIds[String(ov.id)]) return;
        const repId = portalOverrideReplacementClientId(ov.payload);
        if(!repId) return;
        const base = portalResolveMakeupOverrideBaseSession(ov, anchorDayWord);
        if(!base) return;
        const startTok = portalCanonicalHmToken(base.start) || portalCanonicalHmToken(ov.anchor_start);
        if(seenRepKeys[repId + '|' + startTok]) return;
        const card = portalBuildMakeupTodayCardFromOverride(base, ov, sessionDateKey, anchorDayWord, anchor, supportHidePoolNote);
        if(!card) return;
        if(ov.id) seenOvIds[String(ov.id)] = true;
        seenRepKeys[repId + '|' + startTok] = true;
        out.push(card);
      });
      return out;
    }
    /** If override matching missed during map, align Today cards with quick-menu absent alerts and status export. */
    function portalUpgradeTodayItemsWithAbsentOverrides(items, sessionDateKey){
      if(!Array.isArray(items) || !items.length) return items || [];
      const iso = normaliseIsoDate(sessionDateKey);
      if(!iso) return items;
      const sid = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim().toLowerCase();
      return items.map(function(it){
        if(!it || it.kind !== 'client' || String(it.portalOverrideAlertPill || '').trim().toUpperCase() === 'ABSENT') return it;
        const base = it.__portalBaseSession;
        if(!base) return it;
        const replaceOv = typeof portalScheduleOverrideForSessionByType === 'function'
          ? portalScheduleOverrideForSessionByType(base, iso, 'client_replace_in_slot')
          : null;
        const replaceOvLoose = replaceOv || (typeof portalReplaceOverrideForSessionAnchor === 'function'
          ? portalReplaceOverrideForSessionAnchor(base, iso)
          : null);
        if(replaceOvLoose && !portalOverrideIsTrial(replaceOvLoose)){
          const repId = portalOverrideReplacementClientId(replaceOvLoose.payload);
          const repName = portalOverrideReplacementClientName(replaceOvLoose.payload);
          const anchorId = String(base.clientId || '').trim().toLowerCase();
          const curId = String(it.clientId || '').trim().toLowerCase();
          if(repId && anchorId && curId === anchorId && !it.portalOverrideMakeUpTag){
            const repNotes = portalClientNotesLookup(repId) || (repName ? { name: repName } : null);
            const anchorNotes = portalClientNotesLookup(anchorId) || { name: '' };
            const activity = String(base.activity || it.activity || 'Swimming').trim();
            let poolLocationLabel = resolvePoolLocationLabelFromSession(base, activity, anchorNotes, base.day || '');
            const supportHide = typeof portalStaffIsSupportWorkerForAreaNotes === 'function' && portalStaffIsSupportWorkerForAreaNotes();
            if(supportHide) poolLocationLabel = null;
            const areaLabel = rosterAreaLabelForSession(base, activity, supportHide, base.day || '');
            const poolTier = poolTierForAreaNoteRow(base, activity, anchorNotes, base.day || '', supportHide);
            return Object.assign({}, it, {
              clientId: repId,
              name: portalParticipantDisplayName((repNotes && repNotes.name) || repName || repId),
              activity: activity,
              areaLabel: areaLabel,
              poolLocationLabel: poolLocationLabel,
              poolTier: poolTier,
              showPoolSymbol: !!(poolLocationLabel || areaLabel),
              general: clientGeneralBodyForMakeupSession(anchorNotes, repNotes, base, activity, base.day || '', supportHide),
              noSessionFeedbackRequired: false,
              actionsDisabled: false,
              detailsOpenAllowed: true,
              portalOverrideSuppressReviewOrange: false,
              portalOverrideMakeUpTag: true,
              portalOverrideTrialTag: false,
              portalOverrideCardTone: 'pink',
              portalOverrideSymbolText: 'Make Up',
              portalOverrideAlertPill: '',
              scheduleAdminAdjusted: true,
              __portalScheduleOverride: replaceOvLoose
            });
          }
          return it;
        }
        const absentOv = typeof portalScheduleOverrideForSessionByType === 'function'
          ? portalScheduleOverrideForSessionByType(base, iso, 'client_absence_announced')
          : null;
        let statusAbsent = false;
        if(typeof portalRosterSessionFeedbackResolvedFlags === 'function'){
          const fl = portalRosterSessionFeedbackResolvedFlags(base, iso, sid);
          statusAbsent = !!(fl && fl.absent);
        }
        if(!absentOv && !statusAbsent) return it;
        const gen = String(it.general || '').trim();
        const general = gen.indexOf('Absent.') === 0 ? gen : ('Absent. ' + gen).trim();
        return Object.assign({}, it, {
          noSessionFeedbackRequired: true,
          actionsDisabled: true,
          detailsOpenAllowed: true,
          portalOverrideSuppressReviewOrange: true,
          portalOverrideCardTone: 'green',
          portalOverrideAlertPill: 'ABSENT',
          scheduleAdminAdjusted: !!absentOv,
          __portalScheduleOverride: absentOv || it.__portalScheduleOverride || null,
          general: general,
          portalOverrideMakeUpTag: false,
          portalOverrideSymbolText: '',
          portalOverrideHideAdminBadge: !absentOv
        });
      });
    }
    function portalClientSlugFromName(nameRaw){
      return String(nameRaw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }
    function portalNormTimeSlotLabel(value){
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, ' to ')
        .replace(/(\d)\.(\d)/g, '$1:$2');
    }
    function portalParseTimeSlotBounds(timeSlot, day){
      try{
        const adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
        if(adapter && typeof adapter.parseTimeSlot === 'function'){
          return adapter.parseTimeSlot(timeSlot, day);
        }
        if(typeof window !== 'undefined' && typeof window.parseTimeSlot === 'function'){
          return window.parseTimeSlot(timeSlot, day);
        }
      }catch(_){}
      return { start: '09:00', end: '10:00' };
    }
    /** True when this session time differs from the machine roster (term slot update or slot_update override). */
    function portalSessionRosterTimeWasUpdated(s, sessionDateIso){
      if(!s) return false;
      const iso = normaliseIsoDate(sessionDateIso);
      const ov = typeof portalTodayScheduleOverrideForSession === 'function'
        ? portalTodayScheduleOverrideForSession(s, iso)
        : null;
      if(ov && String(ov.override_type || '').trim() === 'slot_update'){
        const P = window.PortalParticipantsSheet;
        if(P && typeof P.overrideIsTermNewParticipant === 'function' && P.overrideIsTermNewParticipant(ov)
          && typeof P.overrideShouldShowOnCalendarDate === 'function' && !P.overrideShouldShowOnCalendarDate(ov, iso)){
          return false;
        }
        return true;
      }
      if(s.portalRosterTimeUpdated) return true;
      const machine = (typeof window !== 'undefined' && window.__STAFF_DASHBOARD_MACHINE_ROWS__) || [];
      if(!machine.length || !iso) return false;
      const cid = String(s.clientId || '').trim().toLowerCase();
      const sid = portalNormKeyStr(s.staffId);
      const day = String(s.day || '').trim();
      const curStart = portalCanonicalHmToken(s.start);
      const curSlot = portalNormTimeSlotLabel(s.timeSlotLabel || '');
      if(!curStart || !cid || !sid) return false;
      for(let i = 0; i < machine.length; i++){
        const m = machine[i];
        if(!m) continue;
        const mCid = portalClientSlugFromName(m.client_name);
        if(mCid !== cid) continue;
        const mIso = normaliseIsoDate(m.session_date);
        if(mIso){
          if(mIso !== iso) continue;
        }else if(String(m.day || '').trim() !== day){
          continue;
        }
        const mStaff = portalNormKeyStr(String(m.instructors || '').split(/[,/&]|\band\b/i)[0]);
        if(mStaff && mStaff !== sid) continue;
        const mSlot = portalNormTimeSlotLabel(m.time_slot || '');
        const mStart = portalCanonicalHmToken(portalParseTimeSlotBounds(String(m.time_slot || ''), m.day || day).start);
        const sameSlot = curSlot && mSlot ? curSlot === mSlot : !!(mStart && curStart && mStart === curStart);
        if(!sameSlot) continue;
        if(mStart && curStart && mStart !== curStart) return true;
        return false;
      }
      return false;
    }
    function portalFindSpreadsheetSessionMatchingOverride(ov, viewDay){
      const list = Array.isArray(sessionsModel) ? sessionsModel : [];
      const aid = portalNormKeyStr(ov && ov.anchor_staff_id);
      const vw = String(viewDay || '').trim();
      const iso = normaliseIsoDate(ov && ov.session_date);
      for(let i = 0; i < list.length; i++){
        const s = list[i];
        if(!s) continue;
        if(!portalOverrideAnchorStaffKeysMatch(aid, s.staffId)) continue;
        if(String(s.day || '').trim() !== vw) continue;
        if(!portalSpreadsheetSessionMatchesOverrideIso(s, iso)) continue;
        if(portalNormKeyStr(s.venue) !== portalNormKeyStr(ov.anchor_venue)) continue;
        if(!portalRosterClientIdsMatch(s.clientId, ov.anchor_client_id)) continue;
        if(!portalTimeAnchorsMatch(ov.anchor_start, s.start)) continue;
        if(!portalTimeAnchorsMatch(ov.anchor_end, s.end)) continue;
        if(!portalOverrideSlotLabelMatchesRow(ov, s)) continue;
        return s;
      }
      if(portalScheduleOverrideAnchorIsOpenSlot(ov && ov.anchor_client_id)){
        for(let k = 0; k < list.length; k++){
          const s2 = list[k];
          if(!s2) continue;
          if(!portalOverrideAnchorStaffKeysMatch(aid, s2.staffId)) continue;
          if(String(s2.day || '').trim() !== vw) continue;
          if(!portalSpreadsheetSessionMatchesOverrideIso(s2, iso)) continue;
          if(portalNormKeyStr(s2.venue) !== portalNormKeyStr(ov.anchor_venue)) continue;
          if(!portalTimeAnchorsMatch(ov.anchor_start, s2.start)) continue;
          if(!portalTimeAnchorsMatch(ov.anchor_end, s2.end)) continue;
          if(!portalOverrideSlotLabelMatchesRow(ov, s2)) continue;
          return s2;
        }
      }
      const srcRows = (window.STAFF_DASHBOARD_SOURCE && window.STAFF_DASHBOARD_SOURCE.rows) || [];
      const adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
      for(let j = 0; j < srcRows.length; j++){
        const row = srcRows[j];
        if(!row) continue;
        if(String(row.day || '').trim() !== vw) continue;
        if(!portalOverrideAnchorMatchesRosterInstructors(aid, row.instructors)) continue;
        const rowIso = normaliseIsoDate(row.session_date || row.sessionDate);
        if(iso){
          if(rowIso && rowIso !== iso) continue;
          if(!rowIso && typeof portalCalendarIsoUsesSummerDatedRosterOnly === 'function' && portalCalendarIsoUsesSummerDatedRosterOnly(iso)) continue;
        }
        const clientId = adapter && typeof adapter.canonicalParticipantClientId === 'function'
          ? adapter.canonicalParticipantClientId(row.client_name)
          : portalSlugifyClientKey(row.client_name);
        if(!portalRosterClientIdsMatch(clientId, ov.anchor_client_id)) continue;
        if(portalNormKeyStr(row.venue) !== portalNormKeyStr(ov.anchor_venue)) continue;
        const start = portalHmFromDbTime(ov.anchor_start) || '09:00';
        const end = portalHmFromDbTime(ov.anchor_end) || portalHmFromDbTime(ov.anchor_start) || '10:00';
        return {
          staffId: String(ov.anchor_staff_id || '').trim().toLowerCase(),
          day: vw,
          start: start,
          end: end,
          venue: String(row.venue || ov.anchor_venue || '').trim(),
          clientId: String(clientId || '').trim().toLowerCase(),
          activity: String(row.service || 'Swimming').trim(),
          rosterService: String(row.service || '').trim(),
          rosterArea: row.area != null ? String(row.area).trim() : '',
          timeSlotLabel: String(row.time_slot || ov.anchor_time_slot_label || '').trim(),
          session_date: iso || rowIso || '',
          status: 'scheduled'
        };
      }
      if(portalScheduleOverrideAnchorIsOpenSlot(ov && ov.anchor_client_id)){
        for(let j2 = 0; j2 < srcRows.length; j2++){
          const row2 = srcRows[j2];
          if(!row2) continue;
          if(String(row2.day || '').trim() !== vw) continue;
          if(!portalOverrideAnchorMatchesRosterInstructors(aid, row2.instructors)) continue;
          const rowIso2 = normaliseIsoDate(row2.session_date || row2.sessionDate);
          if(iso){
            if(rowIso2 && rowIso2 !== iso) continue;
            if(!rowIso2 && typeof portalCalendarIsoUsesSummerDatedRosterOnly === 'function' && portalCalendarIsoUsesSummerDatedRosterOnly(iso)) continue;
          }
          if(portalNormKeyStr(row2.venue) !== portalNormKeyStr(ov.anchor_venue)) continue;
          const start2 = portalHmFromDbTime(ov.anchor_start) || '09:00';
          const end2 = portalHmFromDbTime(ov.anchor_end) || portalHmFromDbTime(ov.anchor_start) || '10:00';
          const tStart = portalParseTimeSlotBounds(String(row2.time_slot || ''), row2.day || vw);
          if(!portalTimeAnchorsMatch(ov.anchor_start, tStart.start || start2)) continue;
          if(!portalTimeAnchorsMatch(ov.anchor_end, tStart.end || end2)) continue;
          const clientId2 = adapter && typeof adapter.canonicalParticipantClientId === 'function'
            ? adapter.canonicalParticipantClientId(row2.client_name)
            : portalSlugifyClientKey(row2.client_name);
          if(portalScheduleOverrideAnchorIsOpenSlot(clientId2)) continue;
          return {
            staffId: String(ov.anchor_staff_id || '').trim().toLowerCase(),
            day: vw,
            start: start2,
            end: end2,
            venue: String(row2.venue || ov.anchor_venue || '').trim(),
            clientId: String(clientId2 || '').trim().toLowerCase(),
            activity: String(row2.service || 'Swimming').trim(),
            rosterService: String(row2.service || '').trim(),
            rosterArea: row2.area != null ? String(row2.area).trim() : '',
            timeSlotLabel: String(row2.time_slot || ov.anchor_time_slot_label || '').trim(),
            session_date: iso || rowIso2 || '',
            status: 'scheduled'
          };
        }
      }
      return null;
    }
    function portalIsoYmdFromDate(d){
      const pad = function(n){ return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function portalRosterHasDatedRowsForIso(isoYmd){
      const iso = normaliseIsoDate(isoYmd);
      if(!iso) return false;
      const model = (typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : [];
      return model.some(function(row){
        return normaliseIsoDate(row && (row.session_date || row.sessionDate)) === iso;
      });
    }
    /** This staff has at least one roster row keyed to this calendar date (not other instructors). */
    function portalStaffHasDatedRowsForIso(isoYmd, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!iso || !sid) return false;
      const model = (typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : [];
      return model.some(function(row){
        return String(row.staffId || '').toLowerCase() === sid
          && normaliseIsoDate(row && (row.session_date || row.sessionDate)) === iso;
      });
    }
    function portalStaffHasDatedWeekdaySnapshots(staffId, weekdayLong, minSessionDateIso){
      const sid = String(staffId || '').trim().toLowerCase();
      const w = String(weekdayLong || '').trim();
      if(!sid || !w) return false;
      const floor = minSessionDateIso ? normaliseIsoDate(minSessionDateIso) : '';
      const model = (typeof sessionsModel !== 'undefined' && Array.isArray(sessionsModel)) ? sessionsModel : [];
      return model.some(function(row){
        if(String(row.staffId || '').toLowerCase() !== sid) return false;
        if(String(row.day || '').trim() !== w) return false;
        const ri = normaliseIsoDate(row && (row.session_date || row.sessionDate));
        if(!ri) return false;
        if(floor && ri < floor) return false;
        return true;
      });
    }
    /** From Summer Term 2 (1 Jun): roster rows must match that calendar date — no May weekday snap. */
    function portalTermSummerRosterFromIso(){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      return String((t && t.termResumeDate) || (t && t.termDashboardCalendarFrom) || '2026-06-01').trim().slice(0, 10);
    }
    function portalCalendarIsoUsesSummerDatedRosterOnly(isoYmd){
      const iso = normaliseIsoDate(isoYmd);
      const floor = portalTermSummerRosterFromIso();
      return !!(iso && floor && /^\d{4}-\d{2}-\d{2}$/.test(floor) && iso >= floor);
    }
    /** Summer Term 2+: weekdays off pool rota (e.g. Roberto no Saturdays from 1 Jun). */
    function portalTermStaffOffWeekdayOnDate(isoYmd, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!iso || !sid) return false;
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffOffWeekdaysRangeByProfileKey;
      const cfg = map && map[sid];
      if(!cfg || typeof cfg !== 'object') return false;
      const from = normaliseIsoDate(cfg.from);
      const to = normaliseIsoDate(cfg.to);
      if(from && iso < from) return false;
      if(to && iso > to) return false;
      const wd = new Date(iso + 'T12:00:00').getDay();
      const drop = Array.isArray(cfg.weekdays) ? cfg.weekdays.map(Number) : [];
      return drop.indexOf(wd) >= 0;
    }
    const CALENDAR_WEEK_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    function mondayStartOfWeekLocal(d){
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const offsetFromMon = (t.getDay() + 6) % 7;
      t.setDate(t.getDate() - offsetFromMon);
      t.setHours(0, 0, 0, 0);
      return t;
    }
    /** Local midnight for this weekday within the current Mon–Sun week. */
    function calendarDateForWeekListDay(dayName){
      const ix = CALENDAR_WEEK_ORDER.indexOf(String(dayName || '').trim());
      if(ix < 0) return null;
      const mon = mondayStartOfWeekLocal(new Date());
      const cell = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + ix);
      cell.setHours(0, 0, 0, 0);
      return cell;
    }
    /** Client sessions assigned to this staff on this calendar day. */
    var __portalAchievementsOrgSessionsCache = { sourceRef: null, model: [] };
    /** All staff sessions from roster bundle — CEO/lead photo picker must not use only the signed-in worker's model. */
    function portalAchievementsMergedOrgSessionsModel(){
      try{
        var source = typeof window.portalResolveStaffDashboardSource === 'function'
          ? window.portalResolveStaffDashboardSource()
          : (window.STAFF_DASHBOARD_SOURCE || null);
        if(!source || !source.staffProfiles){
          return Array.isArray(sessionsModel) ? sessionsModel : [];
        }
        if(__portalAchievementsOrgSessionsCache.sourceRef === source
          && Array.isArray(__portalAchievementsOrgSessionsCache.model)
          && __portalAchievementsOrgSessionsCache.model.length){
          return __portalAchievementsOrgSessionsCache.model;
        }
        var Adapter = typeof StaffDashboardSpreadsheetAdapter !== 'undefined' ? StaffDashboardSpreadsheetAdapter : null;
        if(!Adapter){
          return Array.isArray(sessionsModel) ? sessionsModel : [];
        }
        var merged = [];
        var seen = Object.create(null);
        Object.keys(source.staffProfiles).forEach(function(staffKey){
          if(String(staffKey || '').trim().toLowerCase() === 'teflon') return;
          var boot = null;
          try{
            boot = Adapter.bootstrap({ source: source, staffId: staffKey });
          }catch(_bootErr){
            boot = null;
          }
          if(!boot || !Array.isArray(boot.sessionsModel)) return;
          boot.sessionsModel.forEach(function(s){
            if(!s) return;
            var st = typeof sessionModelStatus === 'function' ? sessionModelStatus(s) : '';
            if(st === 'Closed' || st === 'Available') return;
            var cid = String(s.clientId || '').trim().toLowerCase();
            if(!cid || cid === 'closed' || cid === 'available') return;
            var dedupe = [
              cid,
              normaliseIsoDate(s.session_date || s.sessionDate),
              String(s.day || ''),
              String(s.start || ''),
              String(s.staffId || '')
            ].join('|');
            if(seen[dedupe]) return;
            seen[dedupe] = true;
            merged.push(s);
          });
        });
        __portalAchievementsOrgSessionsCache = { sourceRef: source, model: merged };
        return merged;
      }catch(_){
        return Array.isArray(sessionsModel) ? sessionsModel : [];
      }
    }
    try{ window.portalAchievementsMergedOrgSessionsModel = portalAchievementsMergedOrgSessionsModel; }catch(_){}

    /** Lead / CEO photo picker: every participant with a session on the selected calendar day (all staff). */
    function portalAchievementsListOrgClientsForSelectedDay(){
      try{
        var model = portalAchievementsMergedOrgSessionsModel();
        if(!model.length) model = Array.isArray(sessionsModel) ? sessionsModel : [];
        if(!model.length) return [];
        var viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
        var anchor = typeof getViewAnchorCalendarDate === 'function' ? getViewAnchorCalendarDate(viewDay) : new Date();
        if(!anchor || isNaN(anchor.getTime())) anchor = new Date();
        var sessionDateKey = typeof portalIsoYmdFromDate === 'function'
          ? portalIsoYmdFromDate(anchor)
          : anchor.getFullYear() + '-' + String(anchor.getMonth() + 1).padStart(2, '0') + '-' + String(anchor.getDate()).padStart(2, '0');
        var anchorDayWord = anchor.toLocaleDateString('en-GB', { weekday: 'long' });
        var seen = Object.create(null);
        var out = [];
        model.forEach(function(s){
          if(!s) return;
          var st = typeof sessionModelStatus === 'function' ? sessionModelStatus(s) : '';
          if(st === 'Closed' || st === 'Available') return;
          if(typeof portalSessionSpreadsheetRowMatchesCalendarDate === 'function'){
            if(!portalSessionSpreadsheetRowMatchesCalendarDate(s, sessionDateKey, anchorDayWord)) return;
          } else if(normaliseIsoDate(s.session_date || s.sessionDate) !== sessionDateKey){
            return;
          }
          var cid = String(s.clientId || '').trim().toLowerCase();
          if(!cid || cid === 'closed' || cid === 'available' || seen[cid]) return;
          var notes = (typeof clientNotesById !== 'undefined' && clientNotesById) ? clientNotesById[cid] : null;
          var nm = String(s.clientName || s.clientDisplay || (notes && notes.name) || '').trim();
          if(!nm) return;
          seen[cid] = true;
          var sk = typeof portalBuildSessionReviewKey === 'function'
            ? portalBuildSessionReviewKey(sessionDateKey, s, anchorDayWord, cid)
            : (sessionDateKey + '|' + String(s.start || '') + '|' + cid);
          out.push({ clientId: cid, clientName: nm, portalSessionKey: sk });
        });
        out.sort(function(a, b){
          return a.clientName.localeCompare(b.clientName, 'en', { sensitivity: 'base' });
        });
        return out;
      }catch(_){
        return [];
      }
    }
    function portalAchievementsLeadPhotoAccessActive(){
      if(typeof portalStaffHasLeadPhotoInboxAccess === 'function' && portalStaffHasLeadPhotoInboxAccess()) return true;
      if(typeof portalStaffIsProgrammeLeadTopbar === 'function' && portalStaffIsProgrammeLeadTopbar()) return true;
      if(typeof portalStaffIsCeoTopbarFullAccess === 'function' && portalStaffIsCeoTopbarFullAccess()) return true;
      return false;
    }
    /** CEO only: org-wide participant list for photos. MA leads (John/Berta) use Today cards like instructors. */
    function portalAchievementsListUsesOrgWideToday(){
      return !!(typeof portalStaffIsCeoTopbarFullAccess === 'function' && portalStaffIsCeoTopbarFullAccess());
    }
    /** Same participant rows as Today on the dashboard (that calendar day only). */
    function portalAchievementsListTodayParticipants(){
      if(portalAchievementsListUsesOrgWideToday()){
        var org = portalAchievementsListOrgClientsForSelectedDay();
        if(org.length) return org;
      }
      var today = [];
      if(typeof dashboardData !== 'undefined' && dashboardData && Array.isArray(dashboardData.today)){
        today = dashboardData.today;
      } else if(typeof buildSelectedDayViewFromLauraModel === 'function'){
        today = buildSelectedDayViewFromLauraModel() || [];
      }
      var seen = Object.create(null);
      var out = [];
      today.forEach(function(item){
        if(!item || String(item.kind || '') !== 'client') return;
        if(item.openSheet === false) return;
        var cid = String(item.clientId || '').trim().toLowerCase();
        var nm = String(item.name || '').trim();
        if(!nm) return;
        var mergeKey = cid;
        if(typeof window.portalCanonicalParticipantClientId === 'function'){
          mergeKey = window.portalCanonicalParticipantClientId(nm) || window.portalCanonicalParticipantClientId(cid) || cid;
        } else if(window.PortalParticipantIdentity && typeof window.PortalParticipantIdentity.canonicalClientId === 'function'){
          mergeKey = window.PortalParticipantIdentity.canonicalClientId(nm) || window.PortalParticipantIdentity.canonicalClientId(cid) || cid;
        }
        if(!mergeKey || mergeKey === 'closed' || mergeKey === 'available' || seen[mergeKey]) return;
        seen[mergeKey] = true;
        out.push({
          clientId: cid || mergeKey,
          clientName: nm,
          portalSessionKey: item.sessionKey || null
        });
      });
      out.sort(function(a, b){
        return a.clientName.localeCompare(b.clientName, 'en', { sensitivity: 'base' });
      });
      return out;
    }
    try{ window.portalAchievementsListTodayParticipants = portalAchievementsListTodayParticipants; }catch(_){}
