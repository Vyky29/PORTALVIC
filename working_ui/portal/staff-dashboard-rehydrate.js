(function () {
      var DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      function portalStaffFastBootEnabled(){
        try{
          if(typeof window !== 'undefined' && window.PORTAL_STAFF_APP) return true;
          if(typeof window.portalStaffIsHandheldDevice === 'function' && window.portalStaffIsHandheldDevice()) return true;
        }catch(_){}
        return false;
      }
      /** Unblock halo / Outstanding feedback tile if heavy rehydrate is superseded or slow. */
      function portalStaffScheduleFeedbackPipelineFallback(){
        try{
          if(typeof window.__PORTAL_FB_PIPELINE_FALLBACK__ === 'number' && window.__PORTAL_FB_PIPELINE_FALLBACK__){
            clearTimeout(window.__PORTAL_FB_PIPELINE_FALLBACK__);
          }
          window.__PORTAL_FB_PIPELINE_FALLBACK__ = setTimeout(function(){
            window.__PORTAL_FB_PIPELINE_FALLBACK__ = 0;
            if(typeof portalStaffFeedbackPipelineReady === 'function' && portalStaffFeedbackPipelineReady()) return;
            if(!dashboardData || !dashboardData.portalIdentityResolved) return;
            if(typeof portalStaffFinishFeedbackPipelineReady === 'function'){
              portalStaffFinishFeedbackPipelineReady({ serverSynced: false });
            }else if(typeof syncPortalReminderChrome === 'function'){
              syncPortalReminderChrome();
            }
          }, portalStaffFastBootEnabled() ? 5500 : 9000);
        }catch(_){}
      }
      var WEEK_ORDER_MON_SUN = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
      function dayNameFromDate(d){ return DAY_NAMES[d.getDay()]; }
      function parseTimeSortVal(start){
        var parts = String(start || "00:00").split(":");
        var h = Number(parts[0] || 0), m = Number(parts[1] || 0);
        return h * 60 + m;
      }
      function formatRange(start, end){
        function part(t){
          var p = String(t || "").split(":");
          var h = Number(p[0] || 0), m = Number(p[1] || 0);
          var suffix = h >= 12 ? "pm" : "am";
          h = h % 12; if (h === 0) h = 12;
          return m === 0 ? String(h) : (h + "." + String(m).padStart(2, "0"));
        }
        return part(start) + " to " + part(end) + " " + (Number(String(end || "").split(":")[0] || 0) >= 12 ? "pm" : "am");
      }
      function weekServiceCat(s){
        var svc = String(s.rosterService || "").trim();
        var act = String(s.activity || "").trim();
        var blob = (svc + " " + act).toLowerCase();
        if (/bespoke/i.test(blob)) return "Bespoke Programme";
        if (/multi[-\s]?activity/i.test(blob)) return "Multi-Activity";
        if (/climb/i.test(blob)) return "Climbing Activity";
        if (/physical|fitness|gym/i.test(blob)) return "Physical Activities";
        if (/aquatic|swim|pool|lane|teaching|\(se\)|\(de\)/i.test(blob)) return "Aquatic Activities";
        var t = (svc || act || "").trim();
        if (!t) return "Session";
        return t.replace(/\s+session(s)?\s*$/i, "").trim() || "Session";
      }
      function buildWeekRows(staffId){
        var sid = String(staffId || "").trim().toLowerCase();
        var baseReal = typeof window.__portalIsRealClientSession === "function" ? window.__portalIsRealClientSession : null;
        return WEEK_ORDER_MON_SUN.map(function (day) {
          if (typeof portalWeekListDayIsOff === "function" && portalWeekListDayIsOff(day, sid)) {
            return { day: day, segments: [{ count: 0, venue: "", serviceLabel: "" }] };
          }
          var bucket = {};
          var seenCount = Object.create(null);
          var cell = typeof calendarDateForWeekListDay === "function" ? calendarDateForWeekListDay(day) : null;
          var iso = cell && typeof portalIsoYmdFromDate === "function" ? portalIsoYmdFromDate(cell) : "";
          var isReal = function (s) {
            if (baseReal) return baseReal(s, iso);
            var st = String(s.status || "").toLowerCase();
            if (st === "closed" || st === "available") return false;
            var cid = String(s.clientId || "").toLowerCase();
            return Boolean(cid && cid !== "closed" && cid !== "available");
          };
          var sessions =
            typeof portalBaseClientSessionsForCalendarDate === "function" && iso
              ? portalBaseClientSessionsForCalendarDate(day, iso, sid, isReal)
              : [];
          sessions.forEach(function (s) {
            if (typeof window.portalWeekStripSessionShouldCount === "function" && !window.portalWeekStripSessionShouldCount(s, day, sid)) return;
            var venue = String(s.venue || "—");
            var lab = weekServiceCat(s);
            if (day === "Sunday" && lab === "Aquatic Activities") {
              var cidAqu = String(s.clientId || "").trim().toLowerCase();
              if (cidAqu && sessions.some(function (o) {
                return o !== s
                  && String(o.clientId || "").trim().toLowerCase() === cidAqu
                  && weekServiceCat(o) === "Multi-Activity";
              })) return;
            }
            var countKey = typeof window.portalWeekStripSessionCountKey === "function"
              ? window.portalWeekStripSessionCountKey(s, day, sid)
              : (lab + "\0" + venue + "\0" + String(s.clientId || "").trim().toLowerCase());
            if (!countKey) return;
            if (seenCount[countKey]) return;
            seenCount[countKey] = true;
            var key = venue + "\0" + lab;
            if (!bucket[key]) bucket[key] = { count: 0, venue: venue, serviceLabel: lab };
            bucket[key].count += 1;
          });
          if (typeof window.portalWeekStripAddSyntheticCoverCounts === "function") {
            window.portalWeekStripAddSyntheticCoverCounts(day, sid, bucket, weekServiceCat, seenCount);
          }
          var segments = Object.keys(bucket).map(function (k) { return bucket[k]; });
          if (!segments.length) segments = [{ count: 0, venue: "", serviceLabel: "" }];
          return { day: day, segments: segments };
        });
      }

      function portalLocalCanonicalStaffKey(raw) {
        var k = String(raw || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "")
          .trim();
        if (!k) return "";
        if (typeof window.portalCanonicalStaffRosterKey === "function") {
          return window.portalCanonicalStaffRosterKey(k) || k;
        }
        if (k === "luliya" || k === "aida" || k === "stf021") return "lulia";
        return k;
      }
      var _rehydrateRun = 0;
      var _staffRehydratePromise = null;
      var _staffRosterHydratedOk = false;
      function portalRebootstrapSessionsForPinnedStaff() {
        var sid = portalLocalCanonicalStaffKey(
          (typeof portalAuthStaffRosterId === "function" ? portalAuthStaffRosterId() : "") || STAFF_DASHBOARD_ID
        );
        if (!String(sid || "").trim()) return;
        var priorModel = Array.isArray(sessionsModel) ? sessionsModel.slice() : [];
        var Adapter = typeof StaffDashboardSpreadsheetAdapter !== "undefined" ? StaffDashboardSpreadsheetAdapter : null;
        var source =
          typeof window.portalResolveStaffDashboardSource === "function"
            ? window.portalResolveStaffDashboardSource()
            : window.STAFF_DASHBOARD_SOURCE;
        if (!Adapter || !source || !sid) return;
        var boot = Adapter.bootstrap({ source: source, staffId: sid });
        if (!boot || !Array.isArray(boot.sessionsModel) || !boot.sessionsModel.length) {
          if (typeof window.portalBootstrapFromMachineFallback === "function") {
            var fbIso = "";
            try {
              var fbAnchor = typeof portalResolveTodaySectionCalendarDate === "function"
                ? portalResolveTodaySectionCalendarDate()
                : null;
              if (fbAnchor && typeof portalIsoYmdFromDate === "function") {
                fbIso = portalIsoYmdFromDate(fbAnchor);
              }
            } catch (_) {}
            var fbOk = typeof portalStaffMachineBundleFallbackAllowed !== "function"
              || !fbIso
              || portalStaffMachineBundleFallbackAllowed(sid, fbIso);
            if (fbOk) {
              var fb = window.portalBootstrapFromMachineFallback(sid);
              if (fb && fb.boot && Array.isArray(fb.boot.sessionsModel) && fb.boot.sessionsModel.length) {
                boot = fb.boot;
              }
            }
          }
        }
        if (!boot || !Array.isArray(boot.sessionsModel) || !boot.sessionsModel.length) return;
        if (typeof portalStaffSessionsModelWouldDropToday === "function"
          && portalStaffSessionsModelWouldDropToday(sid, priorModel, boot.sessionsModel)) {
          console.debug("staff_dashboard: skip rebootstrap that would drop today sessions", sid);
          return;
        }
        __spreadsheetBoot = boot;
        STAFF_DASHBOARD_ID = sid;
        try { window.STAFF_DASHBOARD_ID = sid; } catch (_) {}
        sessionsModel = boot.sessionsModel;
        clientNotesById = boot.clientNotesById || clientNotesById;
        _staffRosterHydratedOk = true;
        portalStaffMarkRosterHydrated();
        if(sid === 'teflon' && typeof portalApplyTeflonGuideDemoRoster === 'function') portalApplyTeflonGuideDemoRoster();
        portalApplyClientsInfoToNotes();
        portalSyncTodaySectionDisplay(sessionsModel);
        if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
        dashboardData.week = buildWeekRows(sid);
        if (typeof window.portalApplyTermCalendarForStaff === "function") window.portalApplyTermCalendarForStaff(sid);
        if (typeof rebuildTermShiftAndFeedbackFromSessionModel === "function") {
          rebuildTermShiftAndFeedbackFromSessionModel();
        }
        if (typeof renderToday === "function") renderToday();
        if (typeof renderLists === "function") renderLists();
        if (typeof renderMiniCounts === "function") renderMiniCounts();
      }
      window.portalRebootstrapSessionsForPinnedStaff = portalRebootstrapSessionsForPinnedStaff;
      function portalStaffKeyForRotaFromProfile(p){
        var sess = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session;
        var user = sess && sess.user ? sess.user : null;
        if (typeof window.portalBootstrapStaffRosterFromProfile === "function") {
          var hit = window.portalBootstrapStaffRosterFromProfile(p || {}, user);
          return hit && hit.staffId ? hit.staffId : "";
        }
        var email = user && user.email ? String(user.email) : "";
        if (typeof window.portalInferStaffKey === "function") {
          return window.portalInferStaffKey(p, email);
        }
        return "";
      }
      function portalStaffBootstrapRosterFromSession(profileForRoster, user) {
        if (typeof window.portalBootstrapStaffRosterFromProfile === "function") {
          return window.portalBootstrapStaffRosterFromProfile(profileForRoster, user);
        }
        var Adapter = typeof StaffDashboardSpreadsheetAdapter !== "undefined" ? StaffDashboardSpreadsheetAdapter : null;
        var source =
          typeof window.portalResolveStaffDashboardSource === "function"
            ? window.portalResolveStaffDashboardSource()
            : window.STAFF_DASHBOARD_SOURCE;
        if (!Adapter || !source || !user) return null;
        var email = String(user.email || "");
        var keys = [];
        var seen = Object.create(null);
        function pushKey(v) {
          var k = String(v || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "")
            .trim();
          if (!k || seen[k]) return;
          if (k === "luliya" || k === "aida") k = "lulia";
          seen[k] = true;
          keys.push(k);
          if (/^stf\d{3}$/.test(k)) {
            var map = {
              stf001: "sandra", stf002: "roberto", stf003: "dan", stf004: "angel",
              stf005: "youssef", stf006: "john", stf007: "bismark", stf008: "giuseppe",
              stf009: "godsway", stf010: "javier", stf011: "aurora", stf012: "berta",
              stf013: "victor", stf014: "carlos", stf015: "alex", stf017: "javi",
              stf018: "raul", stf019: "sevitha", stf020: "teflon", stf021: "lulia",
              stf022: "andres",
            };
            if (map[k] && !seen[map[k]]) { seen[map[k]] = true; keys.push(map[k]); }
          }
        }
        pushKey(profileForRoster && profileForRoster.username);
        pushKey(profileForRoster && profileForRoster.full_name);
        pushKey(String((profileForRoster && profileForRoster.full_name) || "").split(/\s+/)[0]);
        pushKey(email.split("@")[0]);
        if (typeof window.portalInferStaffKey === "function") pushKey(window.portalInferStaffKey(profileForRoster, email));
        function portalStaffBootstrapHitForKey(staffKey) {
          var boot = Adapter.bootstrap({ source: source, staffId: staffKey });
          if (!boot || !Array.isArray(boot.sessionsModel)) return null;
          var canonical = portalLocalCanonicalStaffKey(staffKey);
          var profiles = source.staffProfiles && typeof source.staffProfiles === "object" ? source.staffProfiles : {};
          if (!boot.sessionsModel.length && !profiles[canonical] && !profiles[staffKey]) return null;
          return { staffId: canonical || staffKey, boot: boot };
        }
        var i;
        var profileOnlyHit = null;
        for (i = 0; i < keys.length; i++) {
          var hit = portalStaffBootstrapHitForKey(keys[i]);
          if (!hit) continue;
          if (hit.boot.sessionsModel.length) return hit;
          if (!profileOnlyHit) profileOnlyHit = hit;
        }
        return profileOnlyHit;
      }
      function portalStaffApplyIdentityResolved(profileForRoster, p, session) {
        if (!dashboardData) return;
        const ghost =
          window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active
            ? window.__PORTAL_GHOST_VIEW__
            : null;
        if (ghost) {
          dashboardData.staffName = String(
            ghost.displayName ||
              (profileForRoster && (profileForRoster.full_name || profileForRoster.username)) ||
              ghost.rosterKey ||
              ""
          ).trim();
        } else {
          dashboardData.staffName =
            typeof window.portalTopbarDisplayNameFromAuth === "function"
              ? window.portalTopbarDisplayNameFromAuth(p || profileForRoster, session)
              : String(
                  (profileForRoster && (profileForRoster.full_name || profileForRoster.username)) ||
                    (p && (p.full_name || p.username)) ||
                    ""
                ).trim();
        }
        dashboardData.portalIdentityResolved = true;
        try {
          window.dispatchEvent(new CustomEvent("portal:staff-identity-resolved"));
        } catch (_) {}
        portalStaffScheduleFeedbackPipelineFallback();
        try {
          if (typeof portalSyncTodaySectionDisplay === "function") portalSyncTodaySectionDisplay();
          if (typeof renderHeader === "function") renderHeader();
          if (typeof renderToday === "function") renderToday();
        } catch (_) {}
        if (
          dashboardData.portalAnnouncementAcksMerged &&
          typeof portalSyncAnnouncementsAndRemindersUi === "function"
        ) {
          portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
        } else if (typeof portalHydrateAnnouncementsFromSupabase === "function") {
          void portalHydrateAnnouncementsFromSupabase();
        }
      }
      function portalStaffFinishIdentityUi(profileForRoster, p, session) {
        portalStaffApplyIdentityResolved(profileForRoster, p, session);
        var sid = "";
        try{
          if(typeof portalAuthStaffRosterId === "function") sid = String(portalAuthStaffRosterId() || "").trim().toLowerCase();
        }catch(_){}
        if(!sid) sid = String(STAFF_DASHBOARD_ID || "").trim().toLowerCase();
        if(!sid){
          var recovered = portalStaffKeyForRotaFromProfile(profileForRoster || p || {});
          if(recovered) sid = portalLocalCanonicalStaffKey(recovered);
        }
        if(sid){
          if(!String(STAFF_DASHBOARD_ID || "").trim()){
            STAFF_DASHBOARD_ID = sid;
            try { window.STAFF_DASHBOARD_ID = sid; } catch (_) {}
          }
          if(typeof window.portalApplyTermCalendarForStaff === "function") window.portalApplyTermCalendarForStaff(sid);
          if(typeof buildWeekRows === "function") dashboardData.week = buildWeekRows(sid);
          if(typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
          if(typeof portalRefreshNextSessionPreview === "function") portalRefreshNextSessionPreview(sid);
          if(typeof renderTermCalendarGrid === "function") renderTermCalendarGrid();
        }
        if(typeof portalSyncTodaySectionDisplay === 'function') portalSyncTodaySectionDisplay();
        if (typeof renderHeader === "function") renderHeader();
        if (typeof renderToday === "function") renderToday();
        if (typeof renderMiniCounts === "function") renderMiniCounts();
        if (typeof renderLists === "function") renderLists();
        if (typeof window.portalInductionRefreshDashboard === "function") {
          if (typeof window.portalEnsureDashboardLazyScripts === "function") {
            void window.portalEnsureDashboardLazyScripts().then(function () {
              void window.portalInductionRefreshDashboard();
            });
          } else {
            void window.portalInductionRefreshDashboard();
          }
        } else if (typeof window.portalInductionSyncQuickMenu === "function") {
          if (typeof window.portalEnsureDashboardLazyScripts === "function") {
            void window.portalEnsureDashboardLazyScripts().then(function () {
              window.portalInductionSyncQuickMenu();
            });
          } else {
            window.portalInductionSyncQuickMenu();
          }
        }
        if(typeof window.portalStaffKickScheduleOverridesHydrate === "function"){
          /* Force after identity: early hydrate may have run without auth and left
             NEED_AUTH_RETRY set — cover staff + absences only land once session exists. */
          void window.portalStaffKickScheduleOverridesHydrate({ force: true, timeoutMs: 6000 });
        }else{
          try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
        }
      }
      async function rehydrateFromProfile(){
        if (_staffRehydratePromise) return _staffRehydratePromise;
        _staffRehydratePromise = Promise.race([
          rehydrateFromProfileOnce(),
          new Promise(function(resolve){
            setTimeout(function(){
              try{
                if(dashboardData && dashboardData.portalIdentityResolved === false){
                  portalStaffFinishIdentityUi(
                    (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile) || {},
                    window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile,
                    window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session
                  );
                }
              }catch(_){}
              resolve();
            }, typeof window !== 'undefined' && window.PORTAL_STAFF_APP ? 9000 : 18000);
          }),
        ]);
        try {
          return await _staffRehydratePromise;
        } finally {
          _staffRehydratePromise = null;
        }
      }
      async function rehydrateFromProfileOnce(){
        var runId = ++_rehydrateRun;
        if(!window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__){
          try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = false; }catch(_){}
        }
        var keepTodayPaint =
          !!(typeof dashboardData !== 'undefined' && dashboardData && dashboardData.portalIdentityResolved === true)
          || !!(typeof dashboardData !== 'undefined' && dashboardData && Array.isArray(dashboardData.today) && dashboardData.today.length)
          || !!(typeof window !== 'undefined' && window.__PORTAL_STAFF_ROSTER_HYDRATED__);
        if(!keepTodayPaint) portalStaffMarkInitialTodayScheduleUnsettled();
        try {
        try {
          if (window.__PORTAL_GHOST_VERIFY_PROMISE__) {
            await Promise.race([
              window.__PORTAL_GHOST_VERIFY_PROMISE__,
              new Promise(function (r) { setTimeout(r, 6000); }),
            ]);
          }
        } catch (_ghostWait) {}
        var p = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
        var session = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session;
        var user = session && session.user ? session.user : null;
        var profileForRoster = p || {};
        if(user){
          var authPrimary = typeof window.portalPrimaryStaffRosterKey === 'function'
            ? portalLocalCanonicalStaffKey(window.portalPrimaryStaffRosterKey(p || profileForRoster, user))
            : '';
          var curSid = portalLocalCanonicalStaffKey(STAFF_DASHBOARD_ID);
          if(authPrimary && curSid && typeof window.portalStaffRosterKeysCross === 'function'
            && window.portalStaffRosterKeysCross(authPrimary, curSid)){
            STAFF_DASHBOARD_ID = '';
            try { window.STAFF_DASHBOARD_ID = ''; } catch (_) {}
            _staffRosterHydratedOk = false;
            try { window.__PORTAL_STAFF_ROSTER_HYDRATED__ = false; } catch (_) {}
            __spreadsheetBoot = null;
            sessionsModel = [];
            clientNotesById = {};
            if(typeof window.portalClearNextSessionPreviewCache === 'function') window.portalClearNextSessionPreviewCache();
          }
        }
        if (
          user &&
          typeof window.portalStaffShouldIgnoreTeflonPreview === "function" &&
          window.portalStaffShouldIgnoreTeflonPreview(p || profileForRoster, user)
        ) {
          if (typeof window.portalStaffClearTeflonPreviewFromUrl === "function") {
            window.portalStaffClearTeflonPreviewFromUrl();
          }
          STAFF_DASHBOARD_ID = "";
          try { window.STAFF_DASHBOARD_ID = ""; } catch (_) {}
          _staffRosterHydratedOk = false;
          try { window.__PORTAL_STAFF_ROSTER_HYDRATED__ = false; } catch (_) {}
          __spreadsheetBoot = null;
          sessionsModel = [];
          clientNotesById = {};
        }
        if (!p && user) {
          profileForRoster = {
            username: String(user.email || "").split("@")[0],
            full_name: String((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || "").trim(),
          };
        }
        if (!user) {
          portalStaffFinishIdentityUi(profileForRoster, p, session);
          return;
        }
        if (window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.error) {
          portalStaffFinishIdentityUi(profileForRoster, p, session);
          return;
        }
        var rosterHit = null;
        if (window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active) {
          var ghost = window.__PORTAL_GHOST_VIEW__;
          var ghostAdapter = typeof StaffDashboardSpreadsheetAdapter !== "undefined" ? StaffDashboardSpreadsheetAdapter : null;
          var ghostSource =
            typeof window.portalResolveStaffDashboardSource === "function"
              ? window.portalResolveStaffDashboardSource()
              : window.STAFF_DASHBOARD_SOURCE;
          var ghostKey = portalLocalCanonicalStaffKey(String(ghost.rosterKey || "").trim().toLowerCase());
          if (ghostAdapter && ghostSource && ghostKey) {
            var ghostBoot = ghostAdapter.bootstrap({ source: ghostSource, staffId: ghostKey });
            if (ghostBoot) {
              rosterHit = { staffId: ghostKey, boot: ghostBoot };
              profileForRoster = {
                username: ghostKey,
                full_name: String(ghost.displayName || ghostKey).trim(),
              };
            }
          }
        }
        if (!rosterHit) rosterHit = portalStaffBootstrapRosterFromSession(profileForRoster, user);
        if (!rosterHit || !rosterHit.boot) {
          console.warn(
            "staff_dashboard: roster bootstrap failed",
            profileForRoster && profileForRoster.username,
            profileForRoster && profileForRoster.full_name,
            user && user.email
          );
          var recoveredStaffId = portalStaffKeyForRotaFromProfile(profileForRoster || p || {});
          if (recoveredStaffId) {
            recoveredStaffId = portalLocalCanonicalStaffKey(recoveredStaffId);
            STAFF_DASHBOARD_ID = recoveredStaffId;
            try { window.STAFF_DASHBOARD_ID = recoveredStaffId; } catch (_) {}
            dashboardData.week = buildWeekRows(recoveredStaffId);
            if (typeof window.portalApplyTermCalendarForStaff === "function") {
              window.portalApplyTermCalendarForStaff(recoveredStaffId);
            }
          }
          portalStaffFinishIdentityUi(profileForRoster, p, session);
          return;
        }
        var staffId = portalLocalCanonicalStaffKey(rosterHit.staffId);
        var boot = rosterHit.boot;
        var newSessions = boot.sessionsModel || [];
        if (!newSessions.length) {
          if (typeof window.portalBootstrapFromMachineFallback === "function") {
            var bootIso = "";
            try {
              var bootAnchor = typeof portalResolveTodaySectionCalendarDate === "function"
                ? portalResolveTodaySectionCalendarDate()
                : null;
              if (bootAnchor && typeof portalIsoYmdFromDate === "function") {
                bootIso = portalIsoYmdFromDate(bootAnchor);
              }
            } catch (_) {}
            var bootFbOk = typeof portalStaffMachineBundleFallbackAllowed !== "function"
              || !bootIso
              || portalStaffMachineBundleFallbackAllowed(staffId, bootIso);
            if (bootFbOk) {
              var machineHit = window.portalBootstrapFromMachineFallback(staffId);
              if (machineHit && machineHit.boot && Array.isArray(machineHit.boot.sessionsModel) && machineHit.boot.sessionsModel.length) {
                boot = machineHit.boot;
                newSessions = boot.sessionsModel;
              }
            }
          }
        }
        if (!newSessions.length) {
          if (_staffRosterHydratedOk && Array.isArray(sessionsModel) && sessionsModel.length) {
            var prevSid = portalLocalCanonicalStaffKey(STAFF_DASHBOARD_ID);
            var authSid =
              typeof window.portalPrimaryStaffRosterKey === "function" && user
                ? portalLocalCanonicalStaffKey(window.portalPrimaryStaffRosterKey(p || profileForRoster, user))
                : "";
            var shouldKeepRoster = !!(prevSid && prevSid === staffId && (!authSid || authSid === staffId));
            if (!shouldKeepRoster && prevSid
              && typeof portalStaffTodayScheduleCardsStillExpected === "function"
              && portalStaffTodayScheduleCardsStillExpected(prevSid, sessionsModel)) {
              shouldKeepRoster = true;
            }
            if (shouldKeepRoster) {
              console.debug("staff_dashboard: keep roster (empty re-bootstrap)", staffId);
              portalStaffFinishIdentityUi(profileForRoster, p, session);
              return;
            }
          }
          __spreadsheetBoot = boot;
          STAFF_DASHBOARD_ID = staffId;
          try { window.STAFF_DASHBOARD_ID = staffId; } catch (_) {}
          sessionsModel = [];
          clientNotesById = boot.clientNotesById || {};
          if(staffId === 'teflon' && typeof portalApplyTeflonGuideDemoRoster === 'function'){
            portalApplyTeflonGuideDemoRoster();
            if(typeof portalSeedTeflonGuideDemoReviewState === 'function') portalSeedTeflonGuideDemoReviewState();
          }
          portalApplyClientsInfoToNotes();
          _staffRosterHydratedOk = true;
          portalStaffMarkRosterHydrated();
          dashboardData.week = buildWeekRows(staffId);
          if (typeof window.portalApplyTermCalendarForStaff === "function") {
            window.portalApplyTermCalendarForStaff(staffId);
          }
          portalStaffFinishIdentityUi(profileForRoster, p, session);
          return;
        }
        if (runId !== _rehydrateRun) {
          if(dashboardData && dashboardData.portalIdentityResolved === false && STAFF_DASHBOARD_ID){
            try{ portalStaffApplyIdentityResolved(profileForRoster, p, session); }catch(_){}
          }
          return;
        }

        var priorModelForGuard = Array.isArray(sessionsModel) ? sessionsModel.slice() : [];
        if (typeof portalStaffSessionsModelWouldDropToday === "function"
          && portalStaffSessionsModelWouldDropToday(staffId, priorModelForGuard, newSessions)) {
          console.debug("staff_dashboard: keep roster (rehydrate would drop today sessions)", staffId);
          newSessions = priorModelForGuard;
        }

        __spreadsheetBoot = boot;
        STAFF_DASHBOARD_ID = staffId;
        try { window.STAFF_DASHBOARD_ID = staffId; } catch (_) {}
        sessionsModel = newSessions;
        if(typeof portalStaffUpdateSessionsModelGuard === 'function') portalStaffUpdateSessionsModelGuard(staffId, sessionsModel);
        _staffRosterHydratedOk = true;
        portalStaffMarkRosterHydrated();
        clientNotesById = boot.clientNotesById || {};
        if(staffId === 'teflon' && typeof portalApplyTeflonGuideDemoRoster === 'function'){
          portalApplyTeflonGuideDemoRoster();
          if(typeof portalSeedTeflonGuideDemoReviewState === 'function') portalSeedTeflonGuideDemoReviewState();
        }
        portalApplyClientsInfoToNotes();
        portalStaffApplyIdentityResolved(profileForRoster, p, session);
        var postFbDay = "";
        try{
          if(typeof __postFbLand !== "undefined" && __postFbLand && __postFbLand.appliedReviewDay){
            postFbDay = String(__postFbLand.reviewDay || "").trim();
          }else if(typeof __postFbLand !== "undefined" && __postFbLand && __postFbLand.flagged){
            var _rdFb = String(__postFbLand.reviewDay || "").trim();
            if(_rdFb && typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== "undefined" && PORTAL_WEEK_REVIEW_VALID_DAYS.has(_rdFb)) postFbDay = _rdFb;
          }
        }catch(_){}
        var lockDay = "";
        try{
          lockDay = String((typeof window !== "undefined" && window.__PORTAL_REVIEW_DAY_URL_LOCK) ? window.__PORTAL_REVIEW_DAY_URL_LOCK : "").trim();
        }catch(_){}
        if(!lockDay){
          try{
            lockDay = String(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== "undefined" ? __PORTAL_REVIEW_DAY_URL_LOCK : "").trim();
          }catch(_){}
        }
        var _portalStickyReviewDayLoad = false;
        try{ _portalStickyReviewDayLoad = !!(typeof window !== "undefined" && window.__PORTAL_STICKY_REVIEW_DAY_LOAD__); }catch(_){}
        if(lockDay && typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== "undefined" && PORTAL_WEEK_REVIEW_VALID_DAYS.has(lockDay)){
          DEMO_VIEW_DAY = lockDay;
          try{ window.DEMO_VIEW_DAY = DEMO_VIEW_DAY; }catch(_){}
        }else if(postFbDay && typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== "undefined" && PORTAL_WEEK_REVIEW_VALID_DAYS.has(postFbDay)){
          DEMO_VIEW_DAY = postFbDay;
        }else if(!_portalStickyReviewDayLoad && typeof portalStaffIsDemoAccount === "function" && portalStaffIsDemoAccount()){
          if(typeof portalApplyTeflonGuideDemoViewDefaults === "function") portalApplyTeflonGuideDemoViewDefaults();
          if(typeof portalSeedTeflonGuideDemoReviewState === "function") portalSeedTeflonGuideDemoReviewState();
        }else if(!_portalStickyReviewDayLoad){
          DEMO_VIEW_DAY = typeof window.portalWeekdayLongEnGB === "function"
            ? window.portalWeekdayLongEnGB(new Date())
            : dayNameFromDate(new Date());
        }

        if(typeof portalSyncSwimmingInstructorQuickMenus === 'function'){
          void portalSyncSwimmingInstructorQuickMenus().then(function(){
            if(typeof portalSyncTopbarRoleTools === 'function') portalSyncTopbarRoleTools({ isLead: false });
          });
        }else if(typeof portalSyncTopbarRoleTools === 'function'){
          portalSyncTopbarRoleTools({ isLead: false });
        }
        try{
          if(typeof portalSyncTopbarRoleTools === 'function'){
            portalSyncTopbarRoleTools({ isLead: false });
          }
        }catch(_tb){}
        if(typeof portalSyncOnboardingQuickMenu === 'function'){
          if(typeof window.portalEnsureDashboardLazyScripts === 'function'){
            if(portalStaffFastBootEnabled()){
              void window.portalEnsureDashboardLazyScripts().then(function(){
                try{ portalSyncOnboardingQuickMenu(); }catch(_){}
              });
            }else{
              try{
                await Promise.race([
                  window.portalEnsureDashboardLazyScripts(),
                  new Promise(function(r){ setTimeout(r, 2500); }),
                ]);
              }catch(_lazy){}
              void portalSyncOnboardingQuickMenu();
            }
          }else{
            void portalSyncOnboardingQuickMenu();
          }
        }
        if(typeof window.portalSyncServiceLeadsQuickMenu === 'function'){
          window.portalSyncServiceLeadsQuickMenu();
        }
        if(typeof window.portalSyncLeadTeamShiftUi === 'function'){
          window.portalSyncLeadTeamShiftUi();
        }
        dashboardData.avatarFile = boot.avatarFile || dashboardData.avatarFile || "";
        if (typeof window.portalSyncTopbarStaffPhoto === "function") {
          window.portalSyncTopbarStaffPhoto();
        }
        dashboardData.staffRoleTrack = boot.staffRoleTrack || dashboardData.staffRoleTrack || "swimming";
        if(typeof getDemoDateLabel === "function" && typeof getDemoDateTopbar === "function"){
          dashboardData.dateLabel = getDemoDateLabel(DEMO_VIEW_DAY);
          dashboardData.dateTopbar = getDemoDateTopbar(DEMO_VIEW_DAY);
        }else{
          var now = new Date();
          var pad = function(n){ return String(n).padStart(2, "0"); };
          dashboardData.dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
          var weekdayTop = now.toLocaleDateString("en-GB", { weekday: "long" });
          dashboardData.dateTopbar = weekdayTop + "\n" + pad(now.getDate()) + "/" + pad(now.getMonth() + 1) + "/" + now.getFullYear();
        }
        if(typeof hydrateSessionReviewMapFromStorage === "function") hydrateSessionReviewMapFromStorage(staffId);
        if(typeof portalSeedTeflonGuideDemoReviewState === "function") portalSeedTeflonGuideDemoReviewState();
        if(typeof portalEnrichClientNotesFromPortalFeedback === "function"){
          portalEnrichClientNotesFromPortalFeedback();
        }
        /* Do not finish the feedback pipeline here on warm export cache alone.
           Day Centre / shared slots need portalMergeServerReviewStateForDashboard
           (portalServerResolvedRosterKeys) before Pending/Submitted colours are safe —
           otherwise Emanuel-style cards flash orange then turn green late. */
        portalSyncTodaySectionDisplay(sessionsModel);
        if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
        if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(staffId);
        dashboardData.week = buildWeekRows(staffId);
        (function(){
          if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
        })();
        portalStaffApplyIdentityResolved(profileForRoster, p, session);
        if(portalStaffFastBootEnabled()){
          portalStaffFinishIdentityUi(profileForRoster, p, session);
        }
        if(typeof portalHydrateAnnouncementsFromSupabase === 'function'){
          if(portalStaffFastBootEnabled()){
            void portalHydrateAnnouncementsFromSupabase().then(function(){
              if(typeof portalSyncAnnouncementsAndRemindersUi === 'function'){
                portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
              }
            });
          }else{
            await Promise.race([
              portalHydrateAnnouncementsFromSupabase(),
              new Promise(function(r){ setTimeout(r, 5000); }),
            ]);
            if(typeof portalSyncAnnouncementsAndRemindersUi === 'function'){
              portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
            }
          }
        }else if(typeof portalSyncAnnouncementsAndRemindersUi === 'function'){
          portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
        }
        if(!portalStaffFastBootEnabled() && typeof window.portalApplyScheduleOverridesToSessionsModelSafe === "function"){
          try{
            if (runId !== _rehydrateRun) return;
            var priorOverrideModel = Array.isArray(sessionsModel) ? sessionsModel.slice() : [];
            var overrideModel = await Promise.race([
              window.portalApplyScheduleOverridesToSessionsModelSafe(),
              new Promise(function(r){ setTimeout(r, 6000); }),
            ]);
            if(Array.isArray(overrideModel)){
              if(typeof portalStaffSessionsModelWouldDropToday === "function"
                && portalStaffSessionsModelWouldDropToday(staffId, priorOverrideModel, overrideModel)){
                console.debug("staff_dashboard: keep roster (overrides would drop today sessions)", staffId);
              }else{
                sessionsModel = overrideModel;
                if(typeof portalStaffUpdateSessionsModelGuard === 'function') portalStaffUpdateSessionsModelGuard(staffId, sessionsModel);
              }
            }
          }catch(_e){}
        }
        if (runId !== _rehydrateRun) return;
        portalSyncTodaySectionDisplay(sessionsModel);
        if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
        if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(staffId);
        dashboardData.week = buildWeekRows(staffId);
        (function(){
          if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
        })();

        var _portalSkipPostFbDayReset = false;
        try{ _portalSkipPostFbDayReset = !!(typeof window !== "undefined" && window.__PORTAL_STICKY_REVIEW_DAY_LOAD__); }catch(_){}
        if(typeof portalMaybeResetDemoViewDayAfterFeedbackPostLoad === "function" && !_portalSkipPostFbDayReset){
          portalMaybeResetDemoViewDayAfterFeedbackPostLoad();
        }
        dashboardData.week = buildWeekRows(staffId);

        if (typeof window.portalApplyTermCalendarForStaff === "function") window.portalApplyTermCalendarForStaff(staffId);
        portalSyncTodaySectionDisplay(sessionsModel);
        if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
        if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(staffId);
        if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();

        try{
          const lockDay = String(window.__PORTAL_REVIEW_DAY_URL_LOCK || '').trim();
          if(lockDay && PORTAL_WEEK_REVIEW_VALID_DAYS.has(lockDay)){
            DEMO_VIEW_DAY = lockDay;
            window.DEMO_VIEW_DAY = lockDay;
            if(typeof getDemoDateLabel === "function" && typeof getDemoDateTopbar === "function"){
              dashboardData.dateLabel = getDemoDateLabel(DEMO_VIEW_DAY);
              dashboardData.dateTopbar = getDemoDateTopbar(DEMO_VIEW_DAY);
            }
            portalSyncTodaySectionDisplay();
            if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
            dashboardData.week = buildWeekRows(staffId);
            (function(){
              if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(staffId);
              if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
            })();
          }
        }catch(_){}

        async function _finishStaffRehydrateUiNow(){
          portalStaffMarkInitialTodayScheduleSettled();
          if (typeof renderHeader === "function") renderHeader();
          if (typeof renderToday === "function") renderToday();
          if (typeof renderMiniCounts === "function") renderMiniCounts();
          if (typeof renderLists === "function") renderLists();
          if(typeof portalRefreshDashboardParticipantPhotos === "function"){
            portalRefreshDashboardParticipantPhotos(document, {
              resolvePhotoUrl: resolveParticipantPhotoUrl,
              escapeHtml: escapeHtml
            });
          }

          if(typeof window.portalApplyAfterIncidentReturnFromUrl === "function"){
            window.portalApplyAfterIncidentReturnFromUrl();
          }
          if(typeof window.portalApplyAfterQuickToolReturnFromUrl === "function"){
            window.portalApplyAfterQuickToolReturnFromUrl();
          }
          if(typeof window.portalApplyAfterSessionFeedbackReturnFromUrl === "function"){
            await window.portalApplyAfterSessionFeedbackReturnFromUrl();
          }
          if(typeof window.portalApplyAfterVenueReturnFromUrl === "function"){
            window.portalApplyAfterVenueReturnFromUrl();
          }
          try{
            /* chat removed */
          }catch(_incomingPoll){}
        }
        function _finishStaffRehydrateUi(){
          var delay = portalStaffFastBootEnabled() ? 220 : 48;
          if(typeof portalScheduleDashboardUiFinish === "function"){
            portalScheduleDashboardUiFinish(_finishStaffRehydrateUiNow, delay);
            return;
          }
          _finishStaffRehydrateUiNow();
        }
        function _portalStaffRebuildAfterOverridesFetch(staffId){
          if(typeof buildSelectedDayViewFromLauraModel !== "function") return;
          var sid = String(staffId || (typeof window.portalAuthStaffRosterId === 'function' ? window.portalAuthStaffRosterId() : STAFF_DASHBOARD_ID) || '').trim().toLowerCase();
          try{ if(typeof window !== 'undefined') delete window.__PORTAL_TERM_REBUILD_LAST_SIG__; }catch(_sig){}
          portalSyncTodaySectionDisplay();
          if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
          if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(sid);
          dashboardData.week = buildWeekRows(sid);
          if (typeof window.portalApplyTermCalendarForStaff === "function") window.portalApplyTermCalendarForStaff(sid);
          if (typeof rebuildTermShiftAndFeedbackFromSessionModel === "function") rebuildTermShiftAndFeedbackFromSessionModel();
          if (typeof renderToday === "function") renderToday();
          if (typeof renderMiniCounts === "function") renderMiniCounts();
          if (typeof renderTermCalendarGrid === "function") renderTermCalendarGrid();
          try{
            var lockDay3 = String(window.__PORTAL_REVIEW_DAY_URL_LOCK || '').trim();
            if(lockDay3 && typeof PORTAL_WEEK_REVIEW_VALID_DAYS !== "undefined" && PORTAL_WEEK_REVIEW_VALID_DAYS.has(lockDay3)){
              DEMO_VIEW_DAY = lockDay3;
              window.DEMO_VIEW_DAY = lockDay3;
              if(typeof getDemoDateLabel === "function" && typeof getDemoDateTopbar === "function"){
                dashboardData.dateLabel = getDemoDateLabel(DEMO_VIEW_DAY);
                dashboardData.dateTopbar = getDemoDateTopbar(DEMO_VIEW_DAY);
              }
              portalSyncTodaySectionDisplay();
              if (typeof window.__portalSyncNextSessionFromModel === "function") window.__portalSyncNextSessionFromModel();
              dashboardData.week = buildWeekRows(staffId);
              (function(){
                if(typeof portalRefreshNextSessionPreview === 'function') portalRefreshNextSessionPreview(staffId);
                if(typeof portalApplyTodayVenueMeta === 'function') portalApplyTodayVenueMeta();
              })();
            }
          }catch(_){}
        }
        window.__PORTAL_STAFF_REMOTE_OVERRIDE_REFRESH__ = async function portalStaffRemoteOverrideRefreshFromRealtime(payload){
          try{
            var hidAt = Number(window.__PORTAL_STAFF_HIDDEN_AT__ || 0);
            var hasExplicitRow = !!(payload && (payload.new || payload.old));
            try{
              if(payload && typeof window.portalHandleScheduleOverrideUndoFromRealtimePayload === "function"){
                window.portalHandleScheduleOverrideUndoFromRealtimePayload(payload);
              }
            }catch(_undo){}
            if(typeof window.portalRefreshScheduleOverridesCache === "function"){
              await window.portalRefreshScheduleOverridesCache();
            }
            _portalStaffRebuildAfterOverridesFetch(staffId);
            try{
              if(typeof portalMergeServerReviewStateForDashboard === "function"){
                await portalMergeServerReviewStateForDashboard();
              }
            }catch(_e){}
            _finishStaffRehydrateUi();
            try{
              if(payload && typeof window.portalMaybeNotifyScheduleOverrideFromPayload === "function"){
                window.portalMaybeNotifyScheduleOverrideFromPayload(payload);
              }
            }catch(_n){}
            if(!hasExplicitRow && hidAt > 0){
              try{
                var since = hidAt - 10000;
                var rows = window.__PORTAL_SCHEDULE_OVERRIDE_ROWS__ || [];
                var sorted = rows.slice().sort(function(a, b){
                  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                });
                for(var ri = 0; ri < sorted.length; ri++){
                  var rRow = sorted[ri];
                  if(new Date(rRow.created_at || 0).getTime() < since) continue;
                  if(typeof window.portalMaybeNotifyScheduleOverrideFromPayload === "function"){
                    window.portalMaybeNotifyScheduleOverrideFromPayload({ new: rRow });
                  }
                }
              }catch(_cup){}
              try{
                window.__PORTAL_STAFF_HIDDEN_AT__ = 0;
              }catch(_z){}
            }
          }catch(e){
            console.warn("[portal] remote override refresh (staff)", e);
          }
        };
        if(typeof window.portalInitScheduleOverrideRealtimeForStaff === "function"){
          window.portalInitScheduleOverrideRealtimeForStaff();
        }
        if(typeof window.portalInitStaffAnnouncementsRealtime === "function"){
          window.portalInitStaffAnnouncementsRealtime();
        }
        if(typeof window.portalRefreshPortalRosterRowsFromSupabase === "function"){
          var rosterClient = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
          if(rosterClient) void window.portalRefreshPortalRosterRowsFromSupabase(rosterClient);
        }
        if(typeof window.portalInitStaffDmRealtime === "function"){
          if(!(window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active) && !window.__PORTAL_HIDE_CHAT_UI__){
            window.portalInitStaffDmRealtime();
          }
        }
        if(typeof window.portalInitStaffDmUnreadPoll === "function"){
          if(!window.__PORTAL_HIDE_CHAT_UI__){
            window.portalInitStaffDmUnreadPoll();
          }
        }
        if(typeof window.portalStaffDmSyncUnreadChrome === "function"){
          if(!window.__PORTAL_HIDE_CHAT_UI__){
            void window.portalStaffDmSyncUnreadChrome();
          }
        }
        async function portalStaffRunHeavyRehydrateNetworkTasks(){
          var staleRun = false;
          try{
            if (runId !== _rehydrateRun) {
              staleRun = true;
              return;
            }
            if(typeof window.portalApplyScheduleOverridesToSessionsModelSafe === "function"){
              try{
                if (runId !== _rehydrateRun) { staleRun = true; return; }
                var priorOverrideModelFast = Array.isArray(sessionsModel) ? sessionsModel.slice() : [];
                var overrideModelFast = await window.portalApplyScheduleOverridesToSessionsModelSafe();
                if(typeof portalStaffSessionsModelWouldDropToday === "function"
                  && portalStaffSessionsModelWouldDropToday(staffId, priorOverrideModelFast, overrideModelFast)){
                  console.debug("staff_dashboard: keep roster (overrides would drop today sessions)", staffId);
                }else{
                  sessionsModel = overrideModelFast;
                  if(typeof portalStaffUpdateSessionsModelGuard === 'function') portalStaffUpdateSessionsModelGuard(staffId, sessionsModel);
                }
              }catch(_ovFast){}
            }
            if(typeof window.portalEnsureStaffFeedbackData === "function"){
              await Promise.race([
                window.portalEnsureStaffFeedbackData(),
                new Promise(function(r){ setTimeout(r, 4500); })
              ]);
            }
            if(typeof portalMarkFeedbackReconciledFromExports === "function"){
              portalMarkFeedbackReconciledFromExports(true);
            }
            if(typeof portalMergeServerReviewStateForDashboard === "function"){
              /* Wait for the real merge (not a short race) so Day Centre shared keys
                 land before Pending/Submitted colours unlock. Hard-cap at 12s. */
              var mergeP = portalMergeServerReviewStateForDashboard({ skipRender: true });
              await Promise.race([
                mergeP,
                new Promise(function(r){ setTimeout(r, 12000); })
              ]);
            }
          }catch(_preUiMerge){}
          finally {
            if(
              !staleRun
              && typeof portalStaffFinishFeedbackPipelineReady === 'function'
              && !portalStaffFeedbackPipelineReady()
            ){
              portalStaffFinishFeedbackPipelineReady({ serverSynced: false });
            }
          }
          try{
            if(!window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__){
              try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = false; }catch(_){}
              if(typeof portalClearNextSessionPreviewCache === 'function') portalClearNextSessionPreviewCache();
            }
            if(typeof window.portalRefreshScheduleOverridesCache === 'function'){
              await Promise.race([
                window.portalRefreshScheduleOverridesCache({ termCalendar: false }),
                new Promise(function(r){ setTimeout(r, 4000); })
              ]);
              if(runId !== _rehydrateRun) return;
              try{
                if(!window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__
                  && !window.__PORTAL_SCHEDULE_OVERRIDES_NEED_AUTH_RETRY__){
                  window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true;
                }
              }catch(_){}
              _portalStaffRebuildAfterOverridesFetch(staffId);
            }else{
              try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
            }
          }catch(_preOvUi){
            try{
              if(!window.__PORTAL_SCHEDULE_OVERRIDES_NEED_AUTH_RETRY__){
                window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true;
              }
            }catch(_){}
          }
          if (runId === _rehydrateRun) _finishStaffRehydrateUi();
        }
        if(portalStaffFastBootEnabled()){
          void portalStaffRunHeavyRehydrateNetworkTasks();
        }else{
          try{
            if(typeof window.portalEnsureStaffFeedbackData === "function"){
              await Promise.race([
                window.portalEnsureStaffFeedbackData(),
                new Promise(function(r){ setTimeout(r, 4500); })
              ]);
            }
            if(typeof portalMarkFeedbackReconciledFromExports === "function"){
              portalMarkFeedbackReconciledFromExports(true);
            }
            if(typeof portalMergeServerReviewStateForDashboard === "function"){
              await portalMergeServerReviewStateForDashboard({ skipRender: true });
            }
          }catch(_preUiMerge){}
          if(typeof portalStaffFinishFeedbackPipelineReady === 'function' && !portalStaffFeedbackPipelineReady()){
            portalStaffFinishFeedbackPipelineReady({ serverSynced: false });
          }
          try{
            if(!window.__PORTAL_STAFF_INITIAL_TODAY_SETTLED__){
              try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = false; }catch(_){}
              if(typeof portalClearNextSessionPreviewCache === 'function') portalClearNextSessionPreviewCache();
            }
            if(typeof window.portalRefreshScheduleOverridesCache === 'function'){
              await Promise.race([
                window.portalRefreshScheduleOverridesCache({ termCalendar: false }),
                new Promise(function(r){ setTimeout(r, 4000); })
              ]);
              if(runId !== _rehydrateRun) return;
              try{
                if(!window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__
                  && !window.__PORTAL_SCHEDULE_OVERRIDES_NEED_AUTH_RETRY__){
                  window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true;
                }
              }catch(_){}
              _portalStaffRebuildAfterOverridesFetch(staffId);
            }else{
              try{ window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true; }catch(_){}
            }
          }catch(_preOvUi){
            try{
              if(!window.__PORTAL_SCHEDULE_OVERRIDES_NEED_AUTH_RETRY__){
                window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__ = true;
              }
            }catch(_){}
          }
          _finishStaffRehydrateUi();
        }
        function portalStaffRunBackgroundRosterRefresh(){
          void (async function portalStaffBackgroundRosterRefresh(){
          try{
            if (runId !== _rehydrateRun) return;
            if(typeof window.portalRefreshScheduleOverridesCache === "function"){
              await window.portalRefreshScheduleOverridesCache({ termCalendar: false });
              if (runId !== _rehydrateRun) return;
              _portalStaffRebuildAfterOverridesFetch(staffId);
            }
            if(typeof portalMergeServerReviewStateForDashboard === "function"){
              await portalMergeServerReviewStateForDashboard({ skipRender: true });
            }
            if (runId !== _rehydrateRun) return;
            _finishStaffRehydrateUi();
            if(typeof window.portalRefreshScheduleOverridesCache === "function"){
              await window.portalRefreshScheduleOverridesCache({ termCalendar: true });
              if (runId !== _rehydrateRun) return;
              _portalStaffRebuildAfterOverridesFetch(staffId);
              _finishStaffRehydrateUi();
            }
          }catch(e){
            console.warn("[portal] staff background roster refresh", e);
            if (runId === _rehydrateRun) _finishStaffRehydrateUi();
          }
          })();
        }
        if(!portalStaffFastBootEnabled()){
          void portalStaffRunBackgroundRosterRefresh();
        }
        } catch (reErr) {
          console.warn("staff_dashboard: rehydrateFromProfile", reErr);
          try {
            portalStaffFinishIdentityUi(
              (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile) || {},
              window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile,
              window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session
            );
          } catch (_) {}
        }
      }

      window.__PORTAL_STAFF_REHYDRATE__ = rehydrateFromProfile;
      try{ window.portalStaffFinishIdentityUi = portalStaffFinishIdentityUi; }catch(_){}
      window.addEventListener("portal:supabase-ready", function(){
        try{
          if(typeof window.portalStaffResolveIdentityEarlyFromSession === 'function'){
            window.portalStaffResolveIdentityEarlyFromSession();
          }
        }catch(_){}
        rehydrateFromProfile();
      });
      window.addEventListener("portal:ghost-ready", function () {
        if (window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active) {
          void rehydrateFromProfile();
        }
      });
      var _portalSourceUpdatedT = 0;
      window.addEventListener("portal:staff-dashboard-source-updated", function(){
        /* Bursts of source-update events (roster + machine bundle + exports all
           land within a few ms on load) each triggered a full ~200ms rebootstrap,
           which is what filled the console with "handler took 200ms" [Violation]
           perf notices. The rebootstrap re-derives everything from the current
           source, so coalescing the burst into a single run is safe and just
           removes the redundant repeat passes. */
        if(_portalSourceUpdatedT) clearTimeout(_portalSourceUpdatedT);
        _portalSourceUpdatedT = setTimeout(function(){
          _portalSourceUpdatedT = 0;
          try{ portalRebootstrapSessionsForPinnedStaff(); }catch(_){}
        }, 120);
      });
      var _portalFeedbackReadyMergeT = 0;
      window.addEventListener("portal:feedback-data-ready", function(){
        try{
          if(_portalFeedbackReadyMergeT) clearTimeout(_portalFeedbackReadyMergeT);
          _portalFeedbackReadyMergeT = setTimeout(function(){
            _portalFeedbackReadyMergeT = 0;
            if(typeof portalStaffFeedbackPipelineReady === 'function'
              && portalStaffFeedbackPipelineReady()
              && window.__PORTAL_EXPORT_REVIEW_SEEDED__){
              return;
            }
            if(typeof portalMarkFeedbackReconciledFromExports === "function"){
              portalMarkFeedbackReconciledFromExports(true);
            }
            if(typeof portalMergeServerReviewStateForDashboard === "function"){
              void portalMergeServerReviewStateForDashboard().then(function(){
                if(typeof portalStaffRefreshFeedbackDependentUi === "function") portalStaffRefreshFeedbackDependentUi();
              });
            }else if(typeof portalStaffRefreshFeedbackDependentUi === "function"){
              portalStaffRefreshFeedbackDependentUi();
            }
          }, 64);
        }catch(_fbReady){}
      });
      setTimeout(function () {
        if (!_staffRosterHydratedOk) void rehydrateFromProfile();
      }, 1200);
      setTimeout(function () {
        if (!dashboardData || dashboardData.portalIdentityResolved !== false) return;
        try {
          portalStaffFinishIdentityUi(
            (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile) || {},
            window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile,
            window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session
          );
        } catch (_) {}
      }, typeof window !== 'undefined' && window.PORTAL_STAFF_APP ? 5000 : 12000);
    })();
