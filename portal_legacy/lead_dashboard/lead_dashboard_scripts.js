    /* Demo: “hoy” = día fijo (no reloj del PC). Rota Yusef lunes PM refleja 13/20/27 Apr & 11/18 May 2026; 4 May n/a (sin bloque). */
    let DEMO_VIEW_DAY = 'Monday';
    const STAFF_DASHBOARD_ID = 'yusef';
    const __spreadsheetBoot = (typeof StaffDashboardSpreadsheetAdapter !== 'undefined' && window.STAFF_DASHBOARD_SOURCE)
      ? StaffDashboardSpreadsheetAdapter.bootstrap({ source: window.STAFF_DASHBOARD_SOURCE, staffId: STAFF_DASHBOARD_ID })
      : null;
    let sessionsModel = __spreadsheetBoot ? __spreadsheetBoot.sessionsModel : [];
    let clientNotesById = __spreadsheetBoot ? __spreadsheetBoot.clientNotesById : {};
    if(__spreadsheetBoot && __spreadsheetBoot.defaultViewDay){
      DEMO_VIEW_DAY = __spreadsheetBoot.defaultViewDay;
    }
    if(!__spreadsheetBoot){
      console.warn('staff_dashboard: STAFF_DASHBOARD_SOURCE or adapter missing; sessions/clients empty.');
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
     * false = feedback solo cuando ya pasó la hora de fin del slot (fecha demo + end).
     * true = ignora el reloj (solo para pruebas locales).
     */
    const STAFF_DASH_FORCE_SESSIONS_ENDED = false;
    /** false = quita la pantalla intermedia demo (ir directo a confirmaciones / acción). */
    const STAFF_DASH_DEMO_QUICK_ACTION_GATE = false;
    /** true = en demo se pueden usar las acciones antes de la hora de fin (la pantalla intermedia lo explica). false = producción: respeta fin de sesión para Feedback. */
    const STAFF_DASH_DEMO_BYPASS_SESSION_END = true;
    /**
     * Explicación colores del calendario Term (azul / verde / naranja):
     * true = demo: un solo “Understood” persistido en localStorage.
     * false = producción: misma nota en las 2 primeras visitas a esta hoja; luego no se muestra.
     */
    const STAFF_DASH_TERM_COLOR_INTRO_DEMO = true;
    /** Recordatorios en pantalla si quedan revisiones del día sin completar (hora local): 19:30, 21:30, 23:30 */
    const STAFF_DASH_SESSION_REVIEW_REMINDERS = true;
    /** true = oculta la fila “View” (interruptor móvil/escritorio) en Quick menu → Settings cuando el dashboard esté listo para producción. */
    const STAFF_DASH_HIDE_DEV_VIEW_TOGGLE = false;
    const SESSION_REVIEW_REMINDER_STORAGE = 'staffSessionReviewReminder_v1';
    /** Si no hubo guardado en ~25 min en ninguna sesión, asumimos despiste en lugar de “sigue trabajando” */
    const SESSION_REVIEW_RECENT_ACTIVITY_MS = 25 * 60 * 1000;
    const TERM_COLOR_INTRO_STORAGE_DEMO = 'staffTermCalColorIntroDemoAck_v1';
    const TERM_COLOR_INTRO_STORAGE_COUNT = 'staffTermCalColorIntroDismissCount_v1';
    const TERM_COLOR_INTRO_BODY_MAIN =
      'Shift days stay blue until every register and feedback for that day is complete — then they turn green.\n\n'
      + 'You will get reminders from 30 minutes after your shift ends. If anything is still missing 3 hours after your shift end, '
      + 'the day turns orange and stays orange until you finish the review. Admins are notified when the register/feedback is not completed on time.';
    /** Estados de revisión (verde/naranja/rojo/lila) solo en esta pestaña: se pierden al refrescar o cerrar. */
    const sessionReviewMapMemory = {};
    /** Última vez que se tocó una revisión (Quick actions); para tono del recordatorio */
    const sessionReviewActivityTs = {};
    const DEMO_DATE_BY_DAY = {
      Monday: new Date(2026, 3, 13),
      Tuesday: new Date(2026, 3, 14)
    };
    function getDemoDateLabel(dayName){
      const d = DEMO_DATE_BY_DAY[dayName] || DEMO_DATE_BY_DAY.Monday;
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
      const d = DEMO_DATE_BY_DAY[dayName] || DEMO_DATE_BY_DAY.Monday;
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('en-GB', { month: 'long' });
      return `${dayNum}${dayOrdinalSuffix(dayNum)} ${month} ${d.getFullYear()}`;
    }

    /** Fecha de las sesiones “mañana” respecto al día de vista demo (hoy + 1). */
    function getTomorrowSessionDate(){
      const base = DEMO_DATE_BY_DAY[DEMO_VIEW_DAY] || DEMO_DATE_BY_DAY.Monday;
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      d.setDate(d.getDate() + 1);
      return d;
    }
    function formatTomorrowSessionTitle(){
      const d = getTomorrowSessionDate();
      const w = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const rest = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      return `${w}, ${rest}`;
    }

    /* Sessions + clients: staff_dashboard_spreadsheet_bundle.js (export of machine-readable xlsx). */
    /* Pool icons (Today): Acton + Swimming, or Sunday Westway + Aquatic Activity / Multi-Activity. fish = teaching · shark = main · dolphin = lanes — session.poolTier overrides; else inferred from client notes. */

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
        if(h > 12) h -= 12;
        if(h === 0) h = 12;
        if(m === 0) return String(h);
        if(m === 30) return h + '.30';
        return h + '.' + String(m).padStart(2, '0');
      }
      return part(start) + ' to ' + part(end) + ' ' + meridiemFromHHmm(end);
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
      const base = DEMO_DATE_BY_DAY[dayName] || DEMO_DATE_BY_DAY.Monday;
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      const parts = String(endHm).split(':');
      const H = Number(parts[0]);
      const M = Number(parts[1] || 0);
      d.setHours(H, M, 0, 0);
      return d.getTime();
    }

    function getSessionReviewRecord(item){
      if(!item || !item.sessionKey) return null;
      return sessionReviewMapMemory[item.sessionKey] || null;
    }
    function mergeSessionReview(item, updater){
      if(!item || !item.sessionKey) return;
      const prev = sessionReviewMapMemory[item.sessionKey] || {
        feedbackDone: false,
        incident: false,
        absent: false,
        cancelled: false
      };
      sessionReviewMapMemory[item.sessionKey] = updater(prev);
      sessionReviewActivityTs[item.sessionKey] = Date.now();
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
      const today = dashboardData.today || [];
      const pending = [];
      let eligible = 0;
      for(let i = 0; i < today.length; i++){
        const item = today[i];
        if(!item || !item.sessionKey) continue;
        if(item.kind === 'closed' || item.kind === 'available') continue;
        if(!isSessionEndedForFeedback(item)) continue;
        eligible++;
        const r = getSessionReviewRecord(item) || {};
        if(r.feedbackDone || r.absent || r.cancelled) continue;
        pending.push(item);
      }
      return {
        pending,
        eligible,
        completed: Math.max(0, eligible - pending.length)
      };
    }
    function sessionReviewReminderToneExtra(stats){
      const { pending, completed } = stats;
      if(!pending.length) return '';
      const now = Date.now();
      const pendingTouched = pending.some(p => {
        const ts = sessionReviewActivityTs[p.sessionKey];
        return ts && now - ts < SESSION_REVIEW_RECENT_ACTIVITY_MS;
      });
      const anyRecent = Object.keys(sessionReviewActivityTs).some(k => {
        const ts = sessionReviewActivityTs[k];
        return ts && now - ts < SESSION_REVIEW_RECENT_ACTIVITY_MS;
      });
      if(completed > 0 && pending.length > 0){
        if(anyRecent || pendingTouched){
          return " You're actively updating the register — this is a gentle nudge in case the remaining sessions were missed by mistake.";
        }
        return " Part of your day is already complete on the register; these sessions still need an action (feedback, absence, cancellation or incident) before the day closes.";
      }
      if(anyRecent && pending.length > 0 && !pendingTouched){
        return " If you've paused between sessions, please double-check nothing was skipped.";
      }
      return '';
    }
    function noticeSvgClock(){
      return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    function syncSessionReviewReminderBanner(){
      const host = document.getElementById('sessionReviewReminderHost');
      if(!host) return;
      if(!STAFF_DASH_SESSION_REVIEW_REMINDERS){
        host.innerHTML = '';
        return;
      }
      const stats = collectSessionReviewPendingStats();
      if(!stats.pending.length){
        host.innerHTML = '';
        return;
      }
      const clockTier = getSessionReviewReminderClockTier();
      if(clockTier === 0){
        host.innerHTML = '';
        return;
      }
      const dayKey = getLocalDateKey();
      const state = loadSessionReviewReminderDayState(dayKey);
      if(clockTier > state.maxTierShown){
        state.maxTierShown = clockTier;
        saveSessionReviewReminderDayState(dayKey, state);
      }
      const displayTier = state.maxTierShown;
      const names = stats.pending.map(p => p.name).join(', ');
      const extra = sessionReviewReminderToneExtra(stats);
      let title;
      let body;
      let cls;
      if(displayTier === 1){
        title = 'Session reviews (reminder from 7:30 pm)';
        body = `Please complete Quick actions for today's clients: ${names}. Open each session under Today and use Feedback, Incident or Cancellation so the register is finished for the day.${extra}`;
        cls = 'notice session-review-reminder session-review-reminder--t1';
      } else if(displayTier === 2){
        title = 'Safeguarding & same-day register (from 9:30 pm)';
        body = `Safeguarding and club policy require session registers and feedback to be completed on the same day as delivery. Missing or late registers affect handover, safeguarding oversight and alignment with timesheets. Still outstanding: ${names}. Please complete as soon as you can.${extra}`;
        cls = 'notice session-review-reminder session-review-reminder--t2';
      } else {
        title = 'Final reminder tonight (from 11:30 pm)';
        body = `Last reminder: ${names} still need a completed register action tonight. Please finish before midnight where possible; repeated late completion may be escalated under policy.${extra}`;
        cls = 'notice session-review-reminder session-review-reminder--t3';
      }
      host.innerHTML = `<div class="${cls}" role="status"><div class="icon" aria-hidden="true">${noticeSvgClock()}</div><div class="txt"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div></div>`;
    }
    function sessionReviewRowClass(item){
      if(!item || item.kind === 'closed' || !item.sessionKey) return '';
      const r = getSessionReviewRecord(item);
      if(!r) return '';
      if(r.absent) return 'session-card--review-absent';
      if(r.cancelled) return 'session-card--review-cancelled';
      if(r.incident) return 'session-card--review-incident';
      if(r.feedbackDone) return 'session-card--review-done';
      return '';
    }
    function isSessionEndedForFeedback(item){
      if(STAFF_DASH_FORCE_SESSIONS_ENDED) return true;
      const t = item && item.sessionEndTs;
      if(t == null) return false;
      return Date.now() >= t;
    }

    let currentOpenClientItem = null;

    function sessionModelStatus(s){
      if(s.status) return String(s.status);
      if(s.clientId === 'closed') return 'Closed';
      if(s.clientId === 'available') return 'Available';
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

    const CLIENT_LIST_PSEUDO_IDS = ['closed', 'available'];
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
    /** Topbar: nombre(s) + solo la inicial del primer apellido (p. ej. «Yusef M.»). */
    function formatStaffTopbarName(fullName){
      const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return '';
      if(parts.length === 1) return parts[0];
      if(parts.length === 2){
        const a = parts[0];
        const b = parts[1];
        return a + ' ' + b.charAt(0).toUpperCase() + '.';
      }
      const firstSurname = parts[parts.length - 2];
      const given = parts.slice(0, -2).join(' ');
      return given + ' ' + firstSurname.charAt(0).toUpperCase() + '.';
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
    /** Actividades distintas en la agenda (mismo staff + cliente), sin Bespoke en la fila de servicios */
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
        const key = raw.toLowerCase();
        if(seen.has(key)) return;
        seen.add(key);
        out.push(raw);
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
      return {
        kind: 'client',
        clientId,
        name: c.name,
        time: subtitleLine || 'Client profile',
        general: c.generalLead || '',
        specialty: showSpec ? pickSpecialtyBody(c, activity) : (c.specialty || ''),
        activity,
        poolTier: null,
        showSpecialty: showSpec,
        specialtyLabel: specialtyInfoTitle(activity),
        openSheet: true
      };
    }
    function getAssignedClientIdsForStaff(){
      const sid = String(STAFF_DASHBOARD_ID).toLowerCase();
      const seen = new Set();
      const out = [];
      sessionsModel.forEach(s => {
        if(String(s.staffId).toLowerCase() !== sid) return;
        const cid = s.clientId;
        if(!cid || CLIENT_LIST_PSEUDO_IDS.includes(cid)) return;
        if(sessionModelStatus(s) !== 'Scheduled') return;
        if(seen.has(cid)) return;
        seen.add(cid);
        out.push(cid);
      });
      out.sort((a, b) => {
        const na = (clientNotesById[a] && clientNotesById[a].name) || a;
        const nb = (clientNotesById[b] && clientNotesById[b].name) || b;
        return na.localeCompare(nb, 'en');
      });
      return out;
    }
    function getAllClientIdsCatalog(){
      return Object.keys(clientNotesById)
        .filter(id => !CLIENT_LIST_PSEUDO_IDS.includes(id))
        .sort((a, b) => clientNotesById[a].name.localeCompare(clientNotesById[b].name, 'en'));
    }
    const CLIENT_DIRECTORY_PREP_LINE = 'Preparation view before session';

    function clientsGridMedicalIconSvg(){
      return '<svg class="clients-grid-med-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>';
    }

    function renderClientsSheetList(mode, filterQuery){
      const grid = document.getElementById('clientsListGrid');
      if(!grid) return;
      const isAll = mode === 'all';
      const q = String(filterQuery || '').trim().toLowerCase();
      let ids = isAll ? getAllClientIdsCatalog() : getAssignedClientIdsForStaff();
      if(isAll && q){
        ids = ids.filter(id => {
          const n = (clientNotesById[id] && clientNotesById[id].name) || '';
          return n.toLowerCase().startsWith(q);
        });
      }
      if(!ids.length){
        let emptyMsg;
        if(isAll && q){
          emptyMsg = `No clients whose name starts with “${escapeHtml(q)}”.`;
        } else if(isAll){
          emptyMsg = 'No clients in the directory.';
        } else {
          emptyMsg = 'No clients assigned to you on the term rota yet.';
        }
        grid.innerHTML = `<div class="clients-grid-empty" role="status">${emptyMsg}</div>`;
        return;
      }
      grid.innerHTML = ids.map(clientId => {
        const c = clientNotesById[clientId];
        if(!c) return '';
        const initials = escapeHtml(clientInitials(c.name));
        const name = escapeHtml(c.name);
        const gAttr = clientGenderDataAttr(c);
        const med = c.hasMedicalAlert ? clientsGridMedicalIconSvg() : '';
        const medSr = c.hasMedicalAlert ? '<span class="topbar-sr-only">Medical information on file.</span>' : '';
        return `<button type="button" class="clients-grid-card" data-client-id="${escapeHtml(clientId)}" data-list-mode="${isAll ? 'all' : 'my'}"${gAttr}>
      <span class="clients-grid-avatar" aria-hidden="true">${initials}</span>
      <span class="clients-grid-text">
        <span class="clients-grid-name">${name}</span>
      </span>
      ${medSr}
      <span class="clients-grid-med-slot" aria-hidden="true">${med}</span>
    </button>`;
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
      const ids = getAllClientIdsCatalog().filter(id => {
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
        const initials = escapeHtml(clientInitials(c.name));
        const name = escapeHtml(c.name);
        const gAttr = clientGenderDataAttr(c);
        return `<button type="button" role="option" class="clients-suggest-option" id="clientsSuggestOpt-${i}" data-client-id="${escapeHtml(clientId)}"${gAttr}><span class="clients-grid-avatar" aria-hidden="true">${initials}</span><span class="clients-grid-name">${name}</span></button>`;
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
      const allBtn = document.getElementById('clientsTabAll');
      const isMy = mode === 'my';
      const tools = document.getElementById('clientsAllToolsWrap');
      if(tools){
        tools.hidden = isMy;
        if(isMy){
          const si = document.getElementById('clientsDirectorySearch');
          if(si) si.value = '';
          const sug = document.getElementById('clientsDirectorySuggest');
          if(sug){
            sug.hidden = true;
            sug.innerHTML = '';
          }
        }
      }
      if(myBtn){
        myBtn.classList.toggle('is-active', isMy);
        myBtn.setAttribute('aria-selected', isMy ? 'true' : 'false');
      }
      if(allBtn){
        allBtn.classList.toggle('is-active', !isMy);
        allBtn.setAttribute('aria-selected', isMy ? 'false' : 'true');
      }
      if(isMy) renderClientsSheetList('my');
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
      }
    };

    function normalizeVenueKey(v){
      return String(v || '').trim().toLowerCase();
    }
    function normalizeActivityKey(a){
      return String(a || '').trim().toLowerCase().replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    /** Activities that can carry a pool-tier glyph when venue/day rules match. */
    function isPoolTierActivity(activity){
      const k = normalizeActivityKey(activity);
      return k === 'swimming' || k === 'aquatic activity' || k === 'multi activity';
    }
    /**
     * Pool icon only: Swimming @ Acton, or Sunday @ Westway with Aquatic Activity / Multi-Activity (pool called out in rota notes).
     */
    function shouldShowPoolSymbolForSession(sessionRow, activity, viewDay){
      const venue = normalizeVenueKey(sessionRow.venue);
      const day = String(viewDay || '').trim().toLowerCase();
      const act = normalizeActivityKey(activity);
      if(venue === 'acton' && act === 'swimming') return true;
      if(day === 'sunday' && venue === 'westway' && (act === 'aquatic activity' || act === 'multi activity')) return true;
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
      if(/\b(main\s+pool|deeper|deep\s+end|piscina\s+principal|fondo|profunda)\b/.test(blob)) return 'shark';
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
      return inferPoolTierFromNotes(clientNotes) || 'fish';
    }

    /** Third row: pool glyph only when shouldShowPoolSymbolForSession + tier (see resolvePoolTier); otherwise em dash. */
    function todaySessionThirdRowInnerHtml(item){
      if(item.kind === 'closed'){
        return '<span class="session-pool-na" aria-hidden="true">—</span>';
      }
      if(item.showPoolSymbol && item.poolTier && POOL_TIER_META[item.poolTier]){
        const tier = item.poolTier;
        const meta = POOL_TIER_META[tier];
        return `<span class="session-symbol-pool session-pool--${tier}" title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}">${meta.svg}</span>`;
      }
      return '<span class="session-pool-na" aria-hidden="true">—</span>';
    }
    function todaySessionCardInnerHtml(item){
      const time = escapeHtml(String(item.time || '').trim());
      const namePart = item.kind === 'closed'
        ? '<span class="session-meta-name">Closed</span>'
        : `<span class="session-meta-name">${escapeHtml(item.name)}</span>`;
      return `<div class="session-card-body"><div class="session-line session-line--time">${time}</div><div class="session-line session-line--name">${namePart}</div><div class="session-line session-line--symbol">${todaySessionThirdRowInnerHtml(item)}</div></div>`;
    }

    function buildTodayFromLauraModel(){
      const viewDay = String(DEMO_VIEW_DAY).trim();
      const staffId = String(STAFF_DASHBOARD_ID).trim().toLowerCase();
      return sessionsModel
        .filter(s => String(s.staffId).toLowerCase() === staffId && String(s.day).trim() === viewDay)
        .sort((a, b) => Number(normalizeTimeForSort(a.start)) - Number(normalizeTimeForSort(b.start)))
        .map(s => {
          const st = sessionModelStatus(s);
          const time = formatSlotRange(s.start, s.end);
          const activity = (s.activity || 'Swimming').trim();
          const sessionKey = `${viewDay}|${s.start}|${s.clientId}`;
          const sessionEndTs = buildSessionEndMs(viewDay, s.end);
          if(st === 'Closed'){
            return {
              time,
              kind: 'closed',
              name: 'No client',
              general: 'Closed on the rota — no client is assigned to this block.',
              specialty: '—',
              activity: '',
              poolTier: null,
              showPoolSymbol: false,
              openSheet: false,
              sessionKey,
              sessionEndTs
            };
          }
          if(st === 'Available'){
            const c = clientNotesById.available;
            const poolTier = resolvePoolTier(s, activity, c, viewDay);
            const showPoolSymbol = poolTier !== null;
            const showSpec = !isBespokeActivity(activity);
            return {
              time,
              kind: 'available',
              clientId: s.clientId,
              name: 'Slot available',
              activity,
              poolTier,
              showPoolSymbol,
              showSpecialty: showSpec,
              specialtyLabel: specialtyInfoTitle(activity),
              general: `${s.venue} pool · ${c.generalLead}`,
              specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
              openSheet: true,
              sessionKey,
              sessionEndTs
            };
          }
          const c = clientNotesById[s.clientId];
          if(!c) return null;
          const poolTier = resolvePoolTier(s, activity, c, viewDay);
          const showPoolSymbol = poolTier !== null;
          const showSpec = !isBespokeActivity(activity);
          return {
            time,
            kind: 'client',
            clientId: s.clientId,
            name: c.name,
            activity,
            poolTier,
            showPoolSymbol,
            showSpecialty: showSpec,
            specialtyLabel: specialtyInfoTitle(activity),
            general: `${s.venue} pool · ${c.generalLead}`,
            specialty: showSpec ? pickSpecialtyBody(c, activity) : '',
            openSheet: true,
            sessionKey,
            sessionEndTs
          };
        })
        .filter(Boolean);
    }

    const dashboardData = {
      staffName: (__spreadsheetBoot && __spreadsheetBoot.staffName) ? __spreadsheetBoot.staffName : 'Staff',
      avatarFile: (__spreadsheetBoot && __spreadsheetBoot.avatarFile) ? __spreadsheetBoot.avatarFile : '',
      /* Role training row colour: swimming (azul) | climbing (amarillo) | support | lead | manager (rojo) */
      staffRoleTrack: (__spreadsheetBoot && __spreadsheetBoot.staffRoleTrack) ? __spreadsheetBoot.staffRoleTrack : 'swimming',
      dateLabel: getDemoDateLabel(DEMO_VIEW_DAY),
      dateTopbar: getDemoDateTopbar(DEMO_VIEW_DAY),
      setupPending: true,
      splitDay: false,
      venue: 'Acton',
      morning: { venue: 'Acton', time: '8.30 to 12.30 pm' },
      afternoon: { venue: 'Acton', time: '4.30 to 6.30 pm' },
      notices: [
        { type: 'announcement', title: 'Announcements', text: 'Timetable changes', href: '../../Announcements/announcements.html' },
        { type: 'training', title: 'Reminder', text: 'Pending inductions', opensSetup: true }
      ],
      today: buildTodayFromLauraModel(),
      tomorrow: [
        { time: '9 to 10 am', name: 'Roberto', venue: 'Westway' },
        { time: '10.30 to 11.30 am', name: 'Leo', venue: 'Westway' },
        { time: '2 to 3 pm', name: 'Roberto', venue: 'Acton' },
        { time: '3 to 3.30 pm', name: 'Nina', venue: 'Acton' }
      ],
      week: [
        { day: 'Monday', segments: [{ count: 4, venue: 'Acton', unit: 'slots' }] },
        { day: 'Tuesday', segments: [{ count: 3, venue: 'Acton' }] },
        { day: 'Wednesday', segments: [{ count: 0 }] },
        { day: 'Thursday', segments: [{ count: 3, venue: 'Acton' }, { count: 2, venue: 'Westway' }] },
        { day: 'Friday', segments: [{ count: 4, venue: 'Acton' }] },
        { day: 'Saturday', segments: [{ count: 4, venue: 'Acton' }] },
        { day: 'Sunday', segments: [{ count: 2, venue: 'Westway' }] }
      ],
      /** Calendario Term: meses (0=Ene…11=Dic). Abr=3, May=4, Jun=5, Jul=6 */
      termName: 'Summer Term 2026',
      termCalendarYear: 2026,
      termCalendarMonths: [3, 4, 5, 6],
      /** Opcional: primer día del mes que se muestra (p. ej. abril desde 13). Clave = índice de mes */
      termCalendarFirstDom: { 3: 13 },
      /** Compat: si no hay termCalendarMonths, se usa un solo mes */
      termCalendarMonth: 4,
      /** Días “confirmed” por día de semana (JS: 0=Dom … 6=Sáb; aquí usamos getDay()) */
      termWorkedWeekdays: [1, 2, 4, 5],
      /** Half term: cualquier día YYYY-MM-DD de esa semana (se normaliza a Lun–Dom en rojo) */
      termHalfTermWeekStarts: ['2026-05-25'],
      /**
       * Feedback / register por día (YYYY-MM-DD), solo días trabajados:
       * — Sin entrada o 'pending': azul (pendiente; avisos desde +30 min tras fin de turno).
       * — 'complete': verde (todos los feedbacks de ese día hechos).
       * — 'late': naranja (sigue incompleto tras +3 h del fin de turno; hasta completar review; admin notificado).
       * Si hay termShiftEndByDate[key] y termDemoNow (o Date.now()) > fin+3h y no está 'complete' → 'late' automático.
       */
      termFeedbackByDate: {
        '2026-05-05': 'complete',
        '2026-05-07': 'late',
        '2026-05-12': 'complete',
        '2026-05-15': 'late',
        '2026-06-02': 'complete',
        '2026-06-05': 'late'
      },
      /** Fin de turno (ISO local) para calcular retraso sin estado explícito; opcional */
      termShiftEndByDate: {},
      /** null = ahora real; ISO string para demo / capturas */
      termDemoNow: null
    };

    dashboardData.venueMeta = dashboardData.today.length
      ? `${dashboardData.today.length} sessions`
      : 'No sessions';

    /** Sesiones del modelo para el día de vista demo y staff (misma fuente que Today). */
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

    /** Solo nombres de sede (sin conteos); día partido → "Acton · Westway". */
    function formatTodayVenueOnlyLabel(){
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
      else if(raw === 'support' || raw === 'supportstaff') cls = 'setup-row--role-support';
      else if(raw === 'lead' || raw === 'manager') cls = 'setup-row--role-lead';
      else if(raw === 'swimming') cls = 'setup-row--role-swimming';
      if(link){
        SETUP_ROLE_CLASSES.forEach(c => link.classList.remove(c));
        link.classList.add(cls);
      }
      if(qRole){
        QUICK_MENU_ROLE_TRAINING_CLASSES.forEach(c => qRole.classList.remove(c));
        const suffix = cls.replace(/^setup-row--/,'');
        qRole.classList.add('menu-btn--training-' + suffix);
      }
    }

    function renderHeader(){
      const sn = document.getElementById('staffName');
      if(sn){
        sn.textContent = formatStaffTopbarName(dashboardData.staffName);
        sn.setAttribute('aria-label', dashboardData.staffName);
      }
      const dateStr = dashboardData.dateTopbar;
      const td = document.getElementById('topbarDate');
      if(td) td.textContent = dateStr;
      const tdb = document.getElementById('topbarDateBtn');
      if(tdb) tdb.setAttribute('aria-label', 'Working day: ' + dateStr);
      const av = document.getElementById('avatar');
      const avImg = av && av.querySelector('img');
      if(avImg){
        avImg.alt = dashboardData.staffName;
        if(dashboardData.avatarFile) avImg.src = dashboardData.avatarFile;
      } else if(av){
        av.textContent = clientInitials(dashboardData.staffName);
      }
    }

    function noticeIconSvg(type){
      if(type === 'urgent'){
        return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
      }
      if(type === 'training'){
        return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.3-6.3 4.3 2.3-7-6-4.6h7.6L12 2z"/></svg>';
      }
      return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M11 4.5v15l7-4.2V8.7L11 4.5zM3 9v6h3.5V9H3zm14 .5v7c1.66-.45 3-1.7 3-3.5s-1.34-3.05-3-3.5z"/></svg>';
    }

    function renderNotices(){
      const stack = document.getElementById('noticeStack');
      if(!stack) return;
      stack.innerHTML = '';
      const raw = dashboardData.notices || [];
      const list = raw.filter(n => {
        if(n.opensSetup && !dashboardData.setupPending) return false;
        return true;
      });
      if(!list.length){
        stack.style.display = 'none';
        return;
      }
      stack.style.display = 'flex';
      list.forEach(n => {
        const tag = n.href ? 'a' : 'div';
        const el = document.createElement(tag);
        const typ = n.type || 'announcement';
        el.className = `notice ${typ}`;
        if(n.href){
          el.setAttribute('href', n.href);
          el.setAttribute('aria-label', `${n.title}: ${n.text}`);
        }
        if(typ === 'announcement') el.id = 'announcementNotice';
        else if(n.opensSetup && dashboardData.setupPending){
          el.classList.add('notice--opens-setup');
          el.setAttribute('role', 'button');
          el.setAttribute('tabindex', '0');
          el.setAttribute('aria-label', 'Open setup tasks: ' + n.title);
          el.id = 'trainingNotice';
        }
        const svg = noticeIconSvg(typ);
        el.innerHTML = `<div class="icon" aria-hidden="true">${svg}</div><div class="txt"><strong>${n.title}</strong><span>${n.text}</span></div>`;
        stack.appendChild(el);
      });
    }

    function applyTodayGridSizing(grid, count){
      if(!grid) return;
      if(!count || count < 1){
        grid.style.removeProperty('--today-time-fs');
        grid.style.removeProperty('--today-name-fs');
        grid.style.removeProperty('--today-icon');
        grid.style.removeProperty('--today-row-gap');
        return;
      }
      const n = Math.min(9, count);
      const t = (n - 1) / 8;
      const timeFs = Math.round(11 + (1 - t) * 6);
      const nameFs = Math.min(18, timeFs + 1);
      const iconPx = Math.round(16 + (1 - t) * 12);
      const gapPx = Math.round(3 + (1 - t) * 5);
      grid.style.setProperty('--today-time-fs', timeFs + 'px');
      grid.style.setProperty('--today-name-fs', nameFs + 'px');
      grid.style.setProperty('--today-icon', iconPx + 'px');
      grid.style.setProperty('--today-row-gap', gapPx + 'px');
    }

    function renderToday(){
      const grid = $('#todayGrid');
      if(!grid){
        syncSessionReviewReminderBanner();
        return;
      }
      const count = dashboardData.today.length || 0;
      grid.className = 'today-grid';
      grid.setAttribute('data-session-count', String(count));
      const clientsChip = $('#todayClientsCountChip');
      if(clientsChip){
        const clientLabel = count === 1 ? '1 Client' : `${count} Clients`;
        clientsChip.textContent = clientLabel;
        clientsChip.setAttribute('aria-label', count === 1 ? '1 session today' : `${count} sessions today`);
      }
      const venueBtn = $('#todayVenueChip');
      if(venueBtn){
        const venueOnly = formatTodayVenueOnlyLabel();
        venueBtn.textContent = venueOnly;
        venueBtn.setAttribute('aria-label', 'Venue: ' + venueOnly);
      }
      const fb = document.getElementById('todayGridFallback');
      if(fb) fb.remove();
      grid.innerHTML = '';
      if(!count){
        applyTodayGridSizing(grid, 0);
        const empty = document.createElement('div');
        empty.className = 'session-card session-card--empty';
        empty.setAttribute('role', 'status');
        empty.style.pointerEvents = 'none';
        empty.style.cursor = 'default';
        empty.innerHTML = '<div class="session-cell session-cell--client session-cell--empty-msg">No sessions · Your day is clear</div>';
        grid.appendChild(empty);
        syncSessionReviewReminderBanner();
        return;
      }
      applyTodayGridSizing(grid, count);
      const list = dashboardData.today.slice();
      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'today-grid-rows';
      rowsWrap.setAttribute('role', 'list');
      list.forEach(item => {
        if(item.kind === 'closed'){
          const row = document.createElement('div');
          row.className = 'session-card session-card--closed';
          row.setAttribute('role', 'listitem');
          row.innerHTML = todaySessionCardInnerHtml(item);
          rowsWrap.appendChild(row);
          return;
        }
        const card = document.createElement('button');
        card.type = 'button';
        const reviewCls = sessionReviewRowClass(item);
        card.className = 'session-card' + (item.kind === 'available' ? ' session-card--available' : '') + (reviewCls ? ' ' + reviewCls : '');
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', item.kind === 'available' ? `Slot available, ${item.time}` : `Open notes for ${item.name}, ${item.time}`);
        card.innerHTML = todaySessionCardInnerHtml(item);
        card.addEventListener('click', () => openClient(item));
        rowsWrap.appendChild(card);
      });
      grid.appendChild(rowsWrap);
      syncSessionReviewReminderBanner();
    }

    function formatClientCount(n){
      const num = Number(n);
      if(!Number.isFinite(num) || num < 0) return 'No sessions';
      if(num === 0) return 'No sessions';
      if(num === 1) return '1 Client';
      return num + ' Clients';
    }

    const WEEK_DAY_ICON_ABBR = {
      Monday: 'Mo', Tuesday: 'Tu', Wednesday: 'We', Thursday: 'Th',
      Friday: 'Fr', Saturday: 'Sa', Sunday: 'Su'
    };

    function normalizeWeekRowSegments(item){
      if(item && Array.isArray(item.segments) && item.segments.length)
        return item.segments.map(s => ({
          count: Math.max(0, Number(s.count) || 0),
          venue: s.venue != null ? String(s.venue).trim() : '',
          unit: s.unit === 'slots' ? 'slots' : 'clients'
        }));
      const detail = String(item && item.detail ? item.detail : '').trim();
      if(!detail) return [{ count: 0, venue: '', unit: 'clients' }];
      if(/^0\s+clients?\s*$/i.test(detail)) return [{ count: 0, venue: '', unit: 'clients' }];
      if(/^no\s+sessions?\s*$/i.test(detail) || /^off\s+work\s*$/i.test(detail)) return [{ count: 0, venue: '', unit: 'clients' }];
      const slots = detail.match(/^(\d+)\s+slots?\s*·\s*(.+)$/i);
      if(slots){
        const rest = slots[2].replace(/\s*\([^)]*\)\s*$/,'').trim();
        return [{ count: Number(slots[1]) || 0, venue: rest || slots[2].trim(), unit: 'slots' }];
      }
      const sess = detail.match(/^(\d+)\s+sessions?\s*·\s*(.+)$/i);
      if(sess) return [{ count: Number(sess[1]) || 0, venue: sess[2].trim(), unit: 'clients' }];
      const one = detail.match(/^(\d+)\s+clients?\s*·\s*(.+)$/i);
      if(one) return [{ count: Number(one[1]) || 0, venue: one[2].trim(), unit: 'clients' }];
      return [{ count: 0, venue: '', unit: 'clients' }];
    }

    function weekRowTotalClients(item){
      return normalizeWeekRowSegments(item).reduce((a, s) => a + s.count, 0);
    }

    function weekSegmentUnitLabel(count){
      return count === 1 ? 'Session' : 'Sessions';
    }

    function weekVenuePlaceHtml(venue){
      const t = String(venue || '').trim();
      if(!t) return '—';
      return '(' + escapeHtml(t.toUpperCase()) + ')';
    }

    function renderWeekRowHtml(item){
      const day = String(item.day || '').trim() || '—';
      const abbr = escapeHtml(WEEK_DAY_ICON_ABBR[day] || day.slice(0, 2));
      const segments = normalizeWeekRowSegments(item);
      const parts = [];
      const ariaBits = [];
      segments.forEach((seg, i) => {
        if(seg.count <= 0){
          if(i === 0 && segments.length === 1){
            parts.push('<span class="week-venue-seg week-venue-seg--empty">Off work</span>');
            ariaBits.push('off work');
          }
          return;
        }
        const unitW = weekSegmentUnitLabel(seg.count);
        const place = weekVenuePlaceHtml(seg.venue);
        parts.push(
          (i > 0 ? '<span class="week-venue-sep" aria-hidden="true">·</span>' : '') +
          `<span class="week-venue-seg"><span class="week-venue-count">${seg.count}</span> <span class="week-venue-unit">${unitW}</span> <span class="week-venue-place">${place}</span></span>`
        );
        const ariaVenue = seg.venue ? '(' + String(seg.venue).trim().toUpperCase() + ')' : '—';
        ariaBits.push(`${seg.count} ${unitW} ${ariaVenue}`);
      });
      if(!parts.length){
        parts.push('<span class="week-venue-seg week-venue-seg--empty">Off work</span>');
        ariaBits.push('off work');
      }
      const aria = escapeHtml(`${day}: ${ariaBits.join(', ')}`);
      const tone = weekRowTotalClients(item) > 0 ? 'sessions' : 'empty';
      return `<div class="calendar-day calendar-day--week-row calendar-day--week-row--${tone}" aria-label="${aria}"><span class="week-day-icon" aria-hidden="true">${abbr}</span><div class="week-row-detail">${parts.join('')}</div></div>`;
    }

    function renderMiniCounts(){
      const tomorrowCard = document.querySelector('.section-card--overview .mini-card[data-open="tomorrowSheet"]');
      const weekCard = document.querySelector('.section-card--overview .mini-card[data-open="weekSheet"]');
      const dockClientsBtn = document.getElementById('dockClientsTile');
      if(tomorrowCard){
        const c = formatClientCount(dashboardData.tomorrow.length);
        tomorrowCard.setAttribute('aria-label', 'Open next session list — ' + c);
      }
      if(weekCard){
        const weekTotal = dashboardData.week.reduce((acc, day) => acc + weekRowTotalClients(day), 0);
        weekCard.setAttribute('aria-label', 'Open this week’s sessions by day — ' + formatClientCount(weekTotal));
      }
      if(dockClientsBtn){
        const n = getAssignedClientIdsForStaff().length;
        const detail = n === 0 ? 'no clients assigned this term' : (n === 1 ? '1 client assigned' : n + ' clients assigned');
        dockClientsBtn.setAttribute('aria-label', 'Open my clients — ' + detail);
      }
    }

    function renderTomorrowSheetTitle(){
      const h = document.getElementById('tomorrowSheetTitle');
      if(h) h.textContent = formatTomorrowSessionTitle();
    }

    function formatTermMonthCaption(year, monthIndex){
      const d = new Date(year, monthIndex, 1);
      return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    function parseHalfTermMonday(str){
      const p = String(str).trim().split('-').map(Number);
      if(p.length !== 3 || !p.every(n => Number.isFinite(n))) return null;
      const [yy, mo, d] = p;
      const day = new Date(yy, mo - 1, d);
      day.setHours(0, 0, 0, 0);
      const dow = day.getDay();
      const back = (dow + 6) % 7;
      day.setDate(day.getDate() - back);
      return day;
    }
    function isHalfTermDay(year, monthIndex, day, weekStartStrings){
      if(!Array.isArray(weekStartStrings) || !weekStartStrings.length) return false;
      const cell = new Date(year, monthIndex, day);
      cell.setHours(0, 0, 0, 0);
      const cT = cell.getTime();
      for(let i = 0; i < weekStartStrings.length; i++){
        const mon = parseHalfTermMonday(weekStartStrings[i]);
        if(!mon) continue;
        const weekEnd = new Date(mon);
        weekEnd.setDate(weekEnd.getDate() + 7);
        if(cT >= mon.getTime() && cT < weekEnd.getTime()) return true;
      }
      return false;
    }
    const TERM_FEEDBACK_LATE_AFTER_MS = 3 * 60 * 60 * 1000;
    function termCalendarDateKey(year, monthIndex, day){
      const pad = n => String(n).padStart(2, '0');
      return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
    }
    function termCalendarNowMs(){
      const s = dashboardData.termDemoNow;
      if(s != null && s !== ''){
        const t = new Date(s).getTime();
        if(Number.isFinite(t)) return t;
      }
      return Date.now();
    }
    /**
     * Shift days: blue until all register/feedback for that day is done → green.
     * Reminders from 30 minutes after shift end until the 3-hour deadline (handled by alerts elsewhere).
     * If still incomplete after shift end + 3 hours → orange until review is completed; admin notified.
     */
    function getTermFeedbackStateForDay(year, monthIndex, day){
      const key = termCalendarDateKey(year, monthIndex, day);
      const map = dashboardData.termFeedbackByDate;
      const explicit = map && map[key];
      if(explicit === 'complete') return 'complete';
      if(explicit === 'late') return 'late';
      if(explicit === 'pending') return 'pending';
      const endMap = dashboardData.termShiftEndByDate;
      const endStr = endMap && endMap[key];
      if(endStr){
        const shiftEnd = new Date(endStr);
        if(Number.isFinite(shiftEnd.getTime())){
          const deadline = shiftEnd.getTime() + TERM_FEEDBACK_LATE_AFTER_MS;
          if(termCalendarNowMs() > deadline) return 'late';
        }
      }
      return 'pending';
    }
    function renderTermCalendarGrid(){
      const el = document.getElementById('termGrid');
      if(!el) return;
      const y = Number(dashboardData.termCalendarYear) || 2026;
      let months = Array.isArray(dashboardData.termCalendarMonths) && dashboardData.termCalendarMonths.length
        ? dashboardData.termCalendarMonths.map(Number).filter(m => m >= 0 && m <= 11)
        : null;
      if(!months || !months.length){
        const single = Number(dashboardData.termCalendarMonth);
        months = [Number.isFinite(single) ? single : 4];
      }
      const worked = Array.isArray(dashboardData.termWorkedWeekdays) && dashboardData.termWorkedWeekdays.length
        ? dashboardData.termWorkedWeekdays.map(Number)
        : [1, 2, 4, 5];
      const halfWeeks = Array.isArray(dashboardData.termHalfTermWeekStarts) ? dashboardData.termHalfTermWeekStarts : [];
      const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const blocks = [];
      months.forEach(monthIndex => {
        const monthCaption = formatTermMonthCaption(y, monthIndex);
        const lastDay = new Date(y, monthIndex + 1, 0).getDate();
        const firstDomMap = dashboardData.termCalendarFirstDom;
        let firstDom = 1;
        if(firstDomMap && Object.prototype.hasOwnProperty.call(firstDomMap, monthIndex)){
          const fd = Math.floor(Number(firstDomMap[monthIndex]));
          if(Number.isFinite(fd) && fd > 1) firstDom = Math.min(fd, lastDay);
        }
        const alignFirst = new Date(y, monthIndex, firstDom);
        const startPad = (alignFirst.getDay() + 6) % 7;
        const parts = [];
        parts.push(`<div class="term-cal-month-title">${monthCaption}</div>`);
        parts.push(`<div class="term-cal" role="grid" aria-label="${monthCaption}">`);
        dows.forEach(label => {
          parts.push(`<div class="term-cal-dow" role="columnheader">${label}</div>`);
        });
        for(let i = 0; i < startPad; i++) parts.push('<div class="term-cal-pad" aria-hidden="true"></div>');
        for(let day = firstDom; day <= lastDay; day++){
          const dt = new Date(y, monthIndex, day);
          const w = dt.getDay();
          const half = isHalfTermDay(y, monthIndex, day, halfWeeks);
          const isWorked = worked.includes(w);
          let cls = 'term-cal-day';
          let label;
          if(half){
            cls += ' half-term';
            label = `${day}, half term`;
          } else if(isWorked){
            const fb = getTermFeedbackStateForDay(y, monthIndex, day);
            if(fb === 'complete'){
              cls += ' term-feedback-complete';
              label = `${day}, all feedback complete`;
            } else if(fb === 'late'){
              cls += ' term-feedback-late';
              label = `${day}, feedback overdue, complete review`;
            } else {
              cls += ' active';
              label = `${day}, awaiting feedback`;
            }
          } else {
            label = `${day}, not confirmed`;
          }
          parts.push(`<div class="${cls}" role="gridcell" aria-label="${label}">${day}</div>`);
        }
        const daysShown = lastDay - firstDom + 1;
        const used = startPad + daysShown;
        const endPad = (7 - (used % 7)) % 7;
        for(let i = 0; i < endPad; i++) parts.push('<div class="term-cal-pad" aria-hidden="true"></div>');
        parts.push('</div>');
        blocks.push(`<section class="term-cal-month" aria-label="${monthCaption}">${parts.join('')}</section>`);
      });
      el.innerHTML = blocks.join('');
    }

    function renderQuickMenuSetupVisibility(){
      const pending = !!dashboardData.setupPending;
      document.querySelectorAll('#menuSheet [data-setup-training-item]').forEach(el => {
        el.hidden = !pending;
      });
    }

    function renderLists(){
      renderTomorrowSheetTitle();
      const tl = document.getElementById('tomorrowList');
      const wl = document.getElementById('weekList');
      if(tl){
        const camSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
        const venueChipClass = v => {
          const key = String(v || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
          if(key === 'acton') return 'tomorrow-venue-chip--acton';
          if(key === 'westway') return 'tomorrow-venue-chip--westway';
          if(!key || key === '—') return 'tomorrow-venue-chip--blue';
          const pools = ['tomorrow-venue-chip--blue', 'tomorrow-venue-chip--lilac', 'tomorrow-venue-chip--coral', 'tomorrow-venue-chip--acton'];
          let h = 0;
          for(let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % 997;
          return pools[h % pools.length];
        };
        const normalizeTomorrowRow = item => {
          if(item && item.time != null && item.name != null){
            return {
              time: String(item.time),
              start: item.start != null && item.start !== '' ? String(item.start) : '',
              name: String(item.name),
              venue: item.venue != null ? String(item.venue) : '—',
              avatarFile: item.avatarFile
            };
          }
          const d = String(item && item.detail ? item.detail : '').trim();
          const dot = d.indexOf('·');
          if(dot > 0){
            return {
              time: d.slice(0, dot).trim(),
              start: item && item.start != null && item.start !== '' ? String(item.start) : '',
              name: d.slice(dot + 1).trim(),
              venue: item && item.venue != null ? String(item.venue) : '—',
              avatarFile: item && item.avatarFile
            };
          }
          return { time: '—', start: '', name: d || '—', venue: '—', avatarFile: item && item.avatarFile };
        };
        const tomorrowVenueParenLabel = venue => {
          const s = String(venue || '').trim();
          if(!s || s === '—') return '—';
          return '(' + s.toUpperCase() + ')';
        };
        tl.innerHTML = (dashboardData.tomorrow || []).map(item => {
          const row = normalizeTomorrowRow(item);
          const timeShown = row.start
            ? formatHHmmAsStartLabel(row.start)
            : formatTomorrowListStartTime(row.time);
          const t = escapeHtml(timeShown);
          const n = escapeHtml(row.name);
          const vLbl = tomorrowVenueParenLabel(row.venue);
          const v = escapeHtml(vLbl);
          const vCls = venueChipClass(row.venue);
          const src = row.avatarFile ? String(row.avatarFile).trim() : '';
          const avatar = src
            ? `<div class="calendar-day-avatar"><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"/></div>`
            : `<div class="calendar-day-avatar calendar-day-avatar--empty" title="Photo" aria-label="Client photo placeholder">${camSvg}</div>`;
          const aria = escapeHtml(`${timeShown}, ${row.name}, ${row.venue}`);
          return `<div class="calendar-day calendar-day--tomorrow" aria-label="${aria}">${avatar}<span class="calendar-day-name">${n}</span><div class="tomorrow-venue-block ${vCls}"><span class="tomorrow-venue-block-venue">${v}</span><span class="tomorrow-venue-block-time">${t}</span></div></div>`;
        }).join('');
      }
      if(wl) wl.innerHTML = (dashboardData.week || []).map(renderWeekRowHtml).join('');
      const termTitle = document.getElementById('termSheetTitle');
      if(termTitle) termTitle.textContent = dashboardData.termName || 'Summer Term 2026';
      renderTermCalendarGrid();
      renderQuickMenuSetupVisibility();
    }

    function safeLsGet(k){
      try{ return localStorage.getItem(k); }catch(err){ return null; }
    }
    function safeLsSet(k, v){
      try{ localStorage.setItem(k, v); }catch(err){}
    }
    function shouldShowTermCalendarColorIntro(){
      if(STAFF_DASH_TERM_COLOR_INTRO_DEMO){
        return safeLsGet(TERM_COLOR_INTRO_STORAGE_DEMO) !== '1';
      }
      const n = parseInt(safeLsGet(TERM_COLOR_INTRO_STORAGE_COUNT) || '0', 10) || 0;
      return n < 2;
    }
    function syncTermCalendarColorIntro(autofocusBtn){
      const layer = document.getElementById('termCalIntroLayer');
      const demoTag = document.getElementById('termCalIntroDemoTag');
      const body = document.getElementById('termCalIntroBody');
      const btn = document.getElementById('termCalIntroUnderstood');
      const sheetBody = document.getElementById('termSheetBody');
      if(!layer || !body) return;
      const show = shouldShowTermCalendarColorIntro();
      if(show){
        layer.hidden = false;
        layer.setAttribute('aria-hidden', 'false');
        if(sheetBody) sheetBody.classList.add('term-sheet-body--intro-open');
        const demoExtra = STAFF_DASH_TERM_COLOR_INTRO_DEMO
          ? '\n\nThis is a demo. Tap Understood to confirm you have read this.'
          : '';
        body.textContent = TERM_COLOR_INTRO_BODY_MAIN + demoExtra;
        if(demoTag) demoTag.hidden = !STAFF_DASH_TERM_COLOR_INTRO_DEMO;
        if(autofocusBtn && btn){
          requestAnimationFrame(() => { try{ btn.focus(); }catch(err){} });
        }
      } else {
        layer.hidden = true;
        layer.setAttribute('aria-hidden', 'true');
        if(demoTag) demoTag.hidden = true;
        if(sheetBody) sheetBody.classList.remove('term-sheet-body--intro-open');
      }
    }
    function dismissTermCalendarColorIntro(){
      if(STAFF_DASH_TERM_COLOR_INTRO_DEMO){
        safeLsSet(TERM_COLOR_INTRO_STORAGE_DEMO, '1');
      } else {
        const n = parseInt(safeLsGet(TERM_COLOR_INTRO_STORAGE_COUNT) || '0', 10) || 0;
        safeLsSet(TERM_COLOR_INTRO_STORAGE_COUNT, String(n + 1));
      }
      syncTermCalendarColorIntro(false);
    }

    let currentSheet = null;
    let backdropEl = null;
    function syncDockNavContext(){
      const clientsOpen = document.getElementById('clientsSheet')?.classList.contains('open');
      const clientEl = document.getElementById('clientSheet');
      const clientDetailOpen = !!(clientEl && clientEl.classList.contains('open'));
      const menuOpen = document.getElementById('menuSheet')?.classList.contains('open');
      document.body.classList.toggle('dock-context-clients', !!(clientsOpen || clientDetailOpen));
      document.body.classList.toggle('dock-context-menu', !!menuOpen);
    }
    function openSheet(id){
      closeSheet();
      currentSheet = document.getElementById(id);
      if(!currentSheet) return;
      if(id === 'setupReminderSheet' && backdropEl){
        backdropEl.classList.add('sheet-backdrop--focus');
      }
      currentSheet.classList.add('open');
      if(backdropEl) backdropEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      if(id === 'setupReminderSheet'){
        const tn = document.getElementById('trainingNotice');
        if(tn) tn.classList.add('notice--selected');
      }
      if(id === 'termSheet'){
        syncTermCalendarColorIntro(true);
      }
      if(id === 'clientsSheet'){
        setClientsSheetTab('my');
      }
      syncDockNavContext();
    }
    function closeSheet(){
      const hadClientOpen = $$('.sheet.open').some(s => s.id === 'clientSheet');
      $$('.sheet.open').forEach(s => s.classList.remove('open'));
      document.getElementById('clientGeneralSheet')?.setAttribute('aria-hidden', 'true');
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'false');
      if(hadClientOpen) currentOpenClientItem = null;
      document.getElementById('clientSheet')?.classList.remove('client-sheet--roster-entry');
      const qaDock = document.getElementById('dockClientQuickActions');
      if(qaDock){
        qaDock.hidden = true;
        qaDock.setAttribute('aria-hidden', 'true');
      }
      if(backdropEl){
        backdropEl.classList.remove('open');
        backdropEl.classList.remove('sheet-backdrop--focus');
      }
      document.body.style.overflow = '';
      currentSheet = null;
      const tn = document.getElementById('trainingNotice');
      if(tn) tn.classList.remove('notice--selected');
      syncDockNavContext();
    }

    function closeClientGeneralSheet(){
      const sheet = document.getElementById('clientGeneralSheet');
      if(!sheet || !sheet.classList.contains('open')) return;
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'false');
      const stillOpen = document.querySelectorAll('.sheet.open').length;
      if(stillOpen === 0 && backdropEl){
        backdropEl.classList.remove('open');
        document.body.style.overflow = '';
      }
      syncDockNavContext();
    }
    function openClientGeneralFullscreen(){
      const sheet = document.getElementById('clientGeneralSheet');
      if(!sheet) return;
      const nameEl = document.getElementById('clientTitle');
      const timeEl = document.getElementById('clientTime');
      const ht = document.getElementById('clientGeneralSheetTitle');
      const sub = document.getElementById('clientGeneralSheetSub');
      if(ht) ht.textContent = nameEl ? nameEl.textContent.trim() : 'Client';
      if(sub) sub.textContent = timeEl ? timeEl.textContent.trim() : '';
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      if(backdropEl) backdropEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'true');
      syncDockNavContext();
    }
    function resetClientInfoPanels(){
      const ps = document.getElementById('clientPanelSpecialty');
      const bg = document.getElementById('clientBtnGeneral');
      closeClientGeneralSheet();
      if(ps) ps.hidden = true;
      if(bg) bg.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('#clientServiceButtonsRow .client-info-btn--service').forEach(b => b.setAttribute('aria-expanded', 'false'));
    }
    function resolveClientServiceActivities(item){
      let list = [];
      if(item && item.clientId && !CLIENT_LIST_PSEUDO_IDS.includes(item.clientId)){
        list = getDistinctScheduledActivitiesForClient(item.clientId);
      }
      if(!list.length && item && item.activity && !isBespokeActivity(item.activity)){
        list = [String(item.activity).trim()];
      }
      return list;
    }
    function renderClientServiceButtons(activities){
      const row = document.getElementById('clientServiceButtonsRow');
      if(!row) return;
      if(!activities || !activities.length){
        row.hidden = true;
        row.innerHTML = '';
        return;
      }
      row.hidden = false;
      row.innerHTML = activities.map(act => {
        const cap = activityButtonCaption(act);
        const titleBit = specialtyInfoTitle(act);
        const ariaLabel = titleBit || `${cap} information`;
        const icon = activityIconSvg(act);
        const enc = encodeURIComponent(act);
        const btn = `<button type="button" class="client-info-btn--icon client-info-btn--service" data-activity="${enc}" aria-expanded="false" aria-controls="clientPanelSpecialty" aria-label="${escapeHtml(ariaLabel)}" title="${escapeHtml(cap)}"><span class="client-info-btn-stack">${icon}<span class="client-info-btn-caption">${escapeHtml(cap)}</span></span></button>`;
        return `<div class="client-info-row client-info-row--service">${btn}</div>`;
      }).join('');
    }
    function toggleClientServicePanel(btn){
      if(!btn || !btn.classList.contains('client-info-btn--service')) return;
      const panel = document.getElementById('clientPanelSpecialty');
      const genBtn = document.getElementById('clientBtnGeneral');
      const genSheet = document.getElementById('clientGeneralSheet');
      if(!panel) return;
      const enc = btn.getAttribute('data-activity');
      let activity = 'Swimming';
      try{
        activity = enc ? decodeURIComponent(enc) : 'Swimming';
      } catch(_){ /* ignore */ }
      const cid = currentOpenClientItem && currentOpenClientItem.clientId;
      const c = cid && clientNotesById[cid] ? clientNotesById[cid] : null;
      const open = btn.getAttribute('aria-expanded') === 'true';
      if(open){
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      const body = pickSpecialtyBody(c, activity) || 'No information for this programme.';
      const bodyEl = document.getElementById('clientSpecialtyBody');
      if(bodyEl) bodyEl.textContent = body;
      if(genSheet && genSheet.classList.contains('open')) closeClientGeneralSheet();
      if(genBtn) genBtn.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('#clientServiceButtonsRow .client-info-btn--service').forEach(b => {
        if(b !== btn) b.setAttribute('aria-expanded', 'false');
      });
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }

    let pendingDemoQuickFn = null;
    function hideDemoQuickOverlay(){
      const ov = document.getElementById('demoQuickActionOverlay');
      if(ov){
        ov.hidden = true;
        ov.setAttribute('aria-hidden', 'true');
      }
      pendingDemoQuickFn = null;
    }
    function showDemoQuickOverlay(fn){
      pendingDemoQuickFn = typeof fn === 'function' ? fn : null;
      if(!STAFF_DASH_DEMO_QUICK_ACTION_GATE){
        const f = pendingDemoQuickFn;
        pendingDemoQuickFn = null;
        if(f) f();
        return;
      }
      const ov = document.getElementById('demoQuickActionOverlay');
      if(!ov){
        const f = pendingDemoQuickFn;
        pendingDemoQuickFn = null;
        if(f) f();
        return;
      }
      ov.hidden = false;
      ov.setAttribute('aria-hidden', 'false');
    }
    function runAfterDemoQuickGate(fn){
      showDemoQuickOverlay(fn);
    }

    function updateClientQuickActions(){
      const fb = document.getElementById('clientQuickFeedback');
      const inc = document.getElementById('clientQuickIncident');
      const can = document.getElementById('clientQuickCancellation');
      const item = currentOpenClientItem;
      if(!fb || !inc || !can) return;
      if(!item || !item.sessionKey){
        fb.disabled = true;
        inc.disabled = true;
        can.disabled = true;
        return;
      }
      const rec = getSessionReviewRecord(item) || { feedbackDone: false, incident: false, absent: false, cancelled: false };
      const ended = isSessionEndedForFeedback(item);
      const terminal = !!(rec.absent || rec.cancelled);
      const bypass = STAFF_DASH_DEMO_BYPASS_SESSION_END;
      fb.disabled = terminal || !!rec.feedbackDone || (!bypass && !ended);
      fb.title = terminal
        ? (rec.absent ? 'Ausencia registrada' : 'Cancelación registrada')
        : (rec.feedbackDone ? 'Feedback ya registrado' : ((!bypass && !ended) ? 'Disponible al terminar la sesión' : 'Marcar feedback como completado'));
      inc.disabled = terminal;
      inc.title = terminal ? 'Sesión cerrada (ausencia o cancelación)' : 'Registrar un incidente (la fila quedará en naranja)';
      can.disabled = terminal;
      can.title = terminal ? 'Ya marcado' : 'Ausencia (rojo) o cancelación (lila)';
    }

    function executeClientQuickFeedback(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      const rec = getSessionReviewRecord(item) || {};
      if(rec.feedbackDone || rec.absent || rec.cancelled) return;
      if(!STAFF_DASH_DEMO_BYPASS_SESSION_END && !isSessionEndedForFeedback(item)) return;
      if(!confirm('¿Marcar el feedback de esta sesión como completado?')) return;
      mergeSessionReview(item, prev => ({ ...prev, feedbackDone: true }));
      closeSheet();
      renderToday();
    }
    function handleClientQuickFeedback(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      const rec = getSessionReviewRecord(item) || {};
      if(rec.feedbackDone || rec.absent || rec.cancelled) return;
      if(!STAFF_DASH_DEMO_BYPASS_SESSION_END && !isSessionEndedForFeedback(item)) return;
      runAfterDemoQuickGate(executeClientQuickFeedback);
    }

    function executeClientQuickIncident(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      const rec = getSessionReviewRecord(item) || {};
      if(rec.absent || rec.cancelled) return;
      if(!confirm('¿Registrar un incidente en esta sesión? La fila quedará en naranja (aunque completes el feedback después).')) return;
      mergeSessionReview(item, prev => ({ ...prev, incident: true }));
      closeSheet();
      renderToday();
    }
    function handleClientQuickIncident(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      const rec = getSessionReviewRecord(item) || {};
      if(rec.absent || rec.cancelled) return;
      runAfterDemoQuickGate(executeClientQuickIncident);
    }

    function executeClientQuickCancellation(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      const rec = getSessionReviewRecord(item) || {};
      if(rec.absent || rec.cancelled) return;
      const absent = confirm('¿El cliente no asistió a la sesión (ausencia)?\n\nAceptar = ausencia (fila roja)\nCancelar = otra opción');
      if(absent){
        mergeSessionReview(item, () => ({ feedbackDone: false, incident: false, absent: true, cancelled: false }));
        closeSheet();
        renderToday();
        return;
      }
      if(!confirm('¿Marcar la sesión como cancelada?\n\nAceptar = cancelada (fila lila)\nCancelar = no cambiar nada')) return;
      mergeSessionReview(item, () => ({ feedbackDone: false, incident: false, absent: false, cancelled: true }));
      closeSheet();
      renderToday();
    }
    function handleClientQuickCancellation(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      const rec = getSessionReviewRecord(item) || {};
      if(rec.absent || rec.cancelled) return;
      runAfterDemoQuickGate(executeClientQuickCancellation);
    }

    function openClient(item){
      if(!item || item.kind === 'closed' || item.openSheet === false) return;
      currentOpenClientItem = item;
      resetClientInfoPanels();
      const gen = item.general || 'No general information available.';
      document.getElementById('clientTitle').textContent = item.name;
      document.getElementById('clientTime').textContent = item.time;
      document.getElementById('clientGeneral').textContent = gen;
      document.getElementById('clientSpecialtyBody').textContent = 'No information for this programme.';
      renderClientServiceButtons(resolveClientServiceActivities(item));
      openSheet('clientSheet');
      const cs = document.getElementById('clientSheet');
      if(cs) cs.classList.toggle('client-sheet--roster-entry', !!item.directoryProfile);
      const qaDock = document.getElementById('dockClientQuickActions');
      if(qaDock){
        const hideQa = !!item.directoryProfile;
        qaDock.hidden = hideQa;
        qaDock.setAttribute('aria-hidden', hideQa ? 'true' : 'false');
      }
      updateClientQuickActions();
      syncDockNavContext();
      if(typeof requestAnimationFrame === 'function'){
        requestAnimationFrame(() => syncDockNavContext());
      }
    }

    backdropEl = document.getElementById('backdrop');
    const demoQuickOverlay = document.getElementById('demoQuickActionOverlay');
    const demoQuickPanel = document.getElementById('demoQuickActionPanel');
    if(demoQuickPanel) demoQuickPanel.addEventListener('click', e => e.stopPropagation());
    if(demoQuickOverlay) demoQuickOverlay.addEventListener('click', () => hideDemoQuickOverlay());
    document.getElementById('demoQuickActionCancel')?.addEventListener('click', hideDemoQuickOverlay);
    document.getElementById('demoQuickActionContinue')?.addEventListener('click', () => {
      const fn = pendingDemoQuickFn;
      pendingDemoQuickFn = null;
      if(demoQuickOverlay){
        demoQuickOverlay.hidden = true;
        demoQuickOverlay.setAttribute('aria-hidden', 'true');
      }
      if(fn) fn();
    });

    const clientBtnGeneral = document.getElementById('clientBtnGeneral');
    if(clientBtnGeneral){
      clientBtnGeneral.addEventListener('click', () => {
        const g = document.getElementById('clientGeneralSheet');
        if(g && g.classList.contains('open')){
          closeClientGeneralSheet();
          return;
        }
        openClientGeneralFullscreen();
      });
    }
    document.getElementById('clientGeneralSheetBack')?.addEventListener('click', closeClientGeneralSheet);
    document.getElementById('clientServiceButtonsRow')?.addEventListener('click', e => {
      const btn = e.target.closest('.client-info-btn--service');
      if(!btn) return;
      toggleClientServicePanel(btn);
    });

    document.getElementById('clientsTabMy')?.addEventListener('click', () => setClientsSheetTab('my'));
    document.getElementById('clientsTabAll')?.addEventListener('click', () => setClientsSheetTab('all'));
    document.getElementById('clientsDirectorySearch')?.addEventListener('input', () => refreshClientsAllTabUI());
    document.getElementById('clientsDirectorySearch')?.addEventListener('keydown', e => {
      if(e.key === 'Escape'){
        const sug = document.getElementById('clientsDirectorySuggest');
        if(sug && !sug.hidden){
          sug.hidden = true;
          e.preventDefault();
        }
      }
    });
    document.getElementById('clientsDirectorySuggest')?.addEventListener('mousedown', e => {
      const opt = e.target.closest('.clients-suggest-option[data-client-id]');
      if(opt){
        e.preventDefault();
        pickClientFromDirectorySearch(opt.getAttribute('data-client-id'));
      }
    });
    document.getElementById('clientsListGrid')?.addEventListener('click', e => {
      const btn = e.target.closest('.clients-grid-card[data-client-id]');
      if(!btn) return;
      const clientId = btn.getAttribute('data-client-id');
      const mode = btn.getAttribute('data-list-mode');
      const sub = mode === 'all' ? CLIENT_DIRECTORY_PREP_LINE : '';
      const item = buildClientDirectorySheetItem(clientId, sub);
      if(!item) return;
      /* Clients overview (My + All): no session context → hide Feedback / Incident / Cancellation */
      item.directoryProfile = true;
      openClient(item);
    });

    const clientQuickFeedback = document.getElementById('clientQuickFeedback');
    const clientQuickIncident = document.getElementById('clientQuickIncident');
    const clientQuickCancellation = document.getElementById('clientQuickCancellation');
    if(clientQuickFeedback) clientQuickFeedback.addEventListener('click', handleClientQuickFeedback);
    if(clientQuickIncident) clientQuickIncident.addEventListener('click', handleClientQuickIncident);
    if(clientQuickCancellation) clientQuickCancellation.addEventListener('click', handleClientQuickCancellation);

    function handleDashboardDockClick(){
      const demoOv = document.getElementById('demoQuickActionOverlay');
      if(demoOv && !demoOv.hidden){
        hideDemoQuickOverlay();
        return;
      }
      const genSh = document.getElementById('clientGeneralSheet');
      if(genSh && genSh.classList.contains('open')){
        closeClientGeneralSheet();
        return;
      }
      const openSheets = $$('.sheet.open');
      if(openSheets.length){
        closeSheet();
        return;
      }
      const appScroll = document.getElementById('appBodyScroll');
      try{
        if(appScroll) appScroll.scrollTo({ top: 0, behavior: 'smooth' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }catch(_){
        if(appScroll) appScroll.scrollTop = 0;
        else window.scrollTo(0, 0);
      }
    }
    function handleQuickMenuDockClick(){
      const demoOv = document.getElementById('demoQuickActionOverlay');
      if(demoOv && !demoOv.hidden){
        hideDemoQuickOverlay();
        return;
      }
      const genSh = document.getElementById('clientGeneralSheet');
      if(genSh && genSh.classList.contains('open')){
        closeClientGeneralSheet();
        return;
      }
      const openSheets = $$('.sheet.open');
      const onlyMenuOpen = openSheets.length === 1 && openSheets[0].id === 'menuSheet';
      if(onlyMenuOpen){
        closeSheet();
        return;
      }
      openSheet('menuSheet');
    }
    document.getElementById('dockDashboardTile')?.addEventListener('click', handleDashboardDockClick);
    document.getElementById('dockQuickMenuTile')?.addEventListener('click', handleQuickMenuDockClick);
    document.getElementById('termCalIntroUnderstood')?.addEventListener('click', dismissTermCalendarColorIntro);

    /* Desde vista móvil (viewport estrecho o simulador), las subpáginas deben abrir en layout móvil (?m=1 + sessionStorage). */
    document.addEventListener('click', e => {
      if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if(!a || a.target === '_blank') return;
      let href = a.getAttribute('href');
      if(!href || /^(?:#|mailto:|tel:)/i.test(href) || /^https?:\/\//i.test(href)) return;
      const pathOnly = href.split('#')[0].split('?')[0].trim();
      if(!/\.html$/i.test(pathOnly)) return;
      if(/^lead_dashboard\.html$/i.test(pathOnly.replace(/^.*\//,''))) return;
      if(!document.body.classList.contains('dev-mobile-preview')) return;
      try{ sessionStorage.setItem('staffPortalMobileUx', '1'); }catch(err){}
      const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
      let base = href.split('#')[0];
      if(/(?:^|[?&])m=1(?:&|$)/.test(base)) return;
      const sep = base.includes('?') ? '&' : '?';
      e.preventDefault();
      window.location.href = base + sep + 'm=1' + hash;
    }, true);

    function onBackdropPointerClose(){
      const genSh = document.getElementById('clientGeneralSheet');
      if(genSh && genSh.classList.contains('open')){
        closeClientGeneralSheet();
        return;
      }
      closeSheet();
    }
    if(backdropEl) backdropEl.addEventListener('click', onBackdropPointerClose);
    document.addEventListener('keydown', e => {
      if(e.key !== 'Escape') return;
      const genSh = document.getElementById('clientGeneralSheet');
      if(genSh && genSh.classList.contains('open')){
        closeClientGeneralSheet();
        e.preventDefault();
        return;
      }
      const termIntro = document.getElementById('termCalIntroLayer');
      if(termIntro && !termIntro.hidden){
        dismissTermCalendarColorIntro();
        e.preventDefault();
        return;
      }
      const dq = document.getElementById('demoQuickActionOverlay');
      if(dq && !dq.hidden){
        hideDemoQuickOverlay();
        e.preventDefault();
        return;
      }
      closeSheet();
    });
    $$('[data-open]').forEach(el => {
      const openId = () => openSheet(el.getAttribute('data-open'));
      el.addEventListener('click', openId);
      el.addEventListener('keydown', e => {
        if(e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openId();
      });
    });

    const menuViewModeToggle = document.getElementById('menuViewModeToggle');
    if(menuViewModeToggle){
      menuViewModeToggle.addEventListener('click', e => {
        e.stopPropagation();
        if(typeof window.staffDevMobileToggle === 'function') window.staffDevMobileToggle(e);
      });
    }

    const noticeStackEl = document.getElementById('noticeStack');
    if(noticeStackEl){
      noticeStackEl.addEventListener('click', e => {
        const row = e.target.closest('.notice--opens-setup');
        if(row) openSheet('setupReminderSheet');
      });
      noticeStackEl.addEventListener('keydown', e => {
        if(e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('.notice--opens-setup');
        if(row){
          e.preventDefault();
          openSheet('setupReminderSheet');
        }
      });
    }

    document.querySelectorAll('#setupReminderSheet a.setup-row').forEach(link => {
      link.addEventListener('click', () => closeSheet());
    });

    dashboardData.today = buildTodayFromLauraModel();
    dashboardData.venueMeta = dashboardData.today.length
      ? `${dashboardData.today.length} sessions`
      : 'No sessions';

    applySetupRoleTrainingRow();
    if(STAFF_DASH_HIDE_DEV_VIEW_TOGGLE) document.body.classList.add('staff-dashboard-ready');
    renderHeader();
    renderNotices();
    renderToday();
    renderMiniCounts();
    renderLists();
    syncSessionReviewReminderBanner();
    setInterval(() => syncSessionReviewReminderBanner(), 60 * 1000);