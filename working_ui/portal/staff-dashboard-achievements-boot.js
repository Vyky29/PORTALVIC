(function portalAchievementsBootstrap(){
      function whenLazyReady(fn){
        if(window.__PORTAL_DASHBOARD_LAZY_READY__) return fn();
        if(typeof window.portalEnsureDashboardLazyScripts === 'function'){
          void window.portalEnsureDashboardLazyScripts().then(fn).catch(fn);
          return;
        }
        window.addEventListener('portal:dashboard-lazy-ready', fn, { once: true });
      }
      function mountSheet(){
        var mount = document.getElementById('portalAchievementsSheetMount');
        if(!mount || !window.PortalParticipantAchievements) return;
        if(document.getElementById('achievementsSheet')) return;
        mount.insertAdjacentHTML('beforeend', window.PortalParticipantAchievements.sheetHtml());
        window.PortalParticipantAchievements.bindSheet();
      }
      function configure(){
        if(!window.PortalParticipantAchievements) return;
        window.PortalParticipantAchievements.configure({
          esc: function(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
          getClient: function(){ return window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client; },
          getTodayParticipants: function(){
            return typeof window.portalAchievementsListTodayParticipants === 'function'
              ? window.portalAchievementsListTodayParticipants()
              : [];
          },
          getWorkingDateIso: function(){
            try{
              if(typeof portalResolveTodaySectionCalendarDate === 'function'){
                var td = portalResolveTodaySectionCalendarDate();
                if(td && !isNaN(td.getTime()) && typeof portalIsoYmdFromDate === 'function'){
                  return portalIsoYmdFromDate(td);
                }
              }
              var viewDay = String(typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '').trim();
              var anchor = typeof getViewAnchorCalendarDate === 'function' ? getViewAnchorCalendarDate(viewDay) : new Date();
              return typeof normaliseIsoDate === 'function' ? normaliseIsoDate(anchor) : new Date().toISOString().slice(0,10);
            }catch(_){ return new Date().toISOString().slice(0,10); }
          },
          isLeadInboxMode: function(){
            if (typeof portalStaffHasLeadPhotoInboxAccess === 'function' && portalStaffHasLeadPhotoInboxAccess()) {
              return true;
            }
            try {
              var box = window.__PORTAL_SUPABASE__ || {};
              var prof = box.staff_profile;
              var em = String((box.session && box.session.user && box.session.user.email) || '').trim();
              if (typeof portalCanAccessCeoDashboard === 'function' && portalCanAccessCeoDashboard(prof, em)) {
                return true;
              }
              if (typeof portalInferStaffKey === 'function') {
                var execKey = String(portalInferStaffKey(prof, em) || '').trim().toLowerCase();
                if (execKey === 'victor' || execKey === 'javi' || execKey === 'raul') return true;
              }
              if (String((prof && prof.app_role) || '').trim().toLowerCase() === 'ceo') return true;
              var keys = { berta: 1, john: 1, michelle: 1 };
              var sid = String(window.STAFF_DASHBOARD_ID || (window.dashboardData && window.dashboardData.staffId) || '').trim().toLowerCase();
              if (keys[sid]) return true;
              var box = window.__PORTAL_SUPABASE__ || {};
              var em = String((box.session && box.session.user && box.session.user.email) || '').trim().toLowerCase();
              if (em.indexOf('traperocasado') >= 0 || em.indexOf('johnnyosti') >= 0 || em.indexOf('john.osti') >= 0) return true;
              if (em.indexOf('michelle@youtimecounselling') >= 0) return true;
            } catch (_) {}
            return false;
          },
          resolveParticipantPhotoUrl: function(name, clientId){
            if(typeof resolveParticipantPhotoUrl === 'function') return resolveParticipantPhotoUrl(name, clientId) || '';
            if(typeof clientPhotoUrl === 'function') return clientPhotoUrl(name) || '';
            return '';
          }
        });
      }
      function bindQuickMenu(){
        var btn = document.getElementById('quickMenuParticipantAchievements');
        if(!btn || btn.getAttribute('data-achievements-bound') === '1') return;
        btn.setAttribute('data-achievements-bound','1');
        btn.addEventListener('click', function(){
          mountSheet();
          configure();
          if(typeof openSheet === 'function') openSheet('achievementsSheet');
        });
      }
      function syncTopbarForPhotos(){
        var leadPhoto = typeof portalStaffHasLeadPhotoInboxAccess === 'function' && portalStaffHasLeadPhotoInboxAccess();
        if(typeof window.portalInitTopbarToolsGrid === 'function') window.portalInitTopbarToolsGrid({ isLead: !!leadPhoto });
        if(typeof portalSyncTopbarRoleTools === 'function') portalSyncTopbarRoleTools({ isLead: !!leadPhoto });
      }
      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', function(){
          whenLazyReady(function(){
          mountSheet(); configure(); bindQuickMenu();
          syncTopbarForPhotos();
          if(typeof portalApplyClientsDirectoryAccess === 'function') portalApplyClientsDirectoryAccess();
          });
        });
      }else{
        whenLazyReady(function(){
        mountSheet(); configure(); bindQuickMenu();
        syncTopbarForPhotos();
        if(typeof portalApplyClientsDirectoryAccess === 'function') portalApplyClientsDirectoryAccess();
        });
      }
      window.addEventListener('portal:supabase-ready', function(){
        configure();
        syncTopbarForPhotos();
        if (window.PortalParticipantAchievements && typeof window.PortalParticipantAchievements.refreshLeadInboxUi === 'function') {
          var sheet = document.getElementById('achievementsSheet');
          if (sheet && sheet.classList.contains('open')) {
            window.PortalParticipantAchievements.refreshLeadInboxUi({ full: true });
            if (typeof window.PortalParticipantAchievements.openSheet === 'function') {
              window.PortalParticipantAchievements.openSheet();
            }
          }
        }
      });
    })();
