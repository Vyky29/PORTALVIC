    function renderHeader(){
      const sn = document.getElementById('staffName');
      const givenEl = document.getElementById('staffNameGiven');
      const surEl = document.getElementById('staffNameSurname');
      const pendingIdentity = !dashboardData.portalIdentityResolved;
      const split = pendingIdentity ? { given: '', surname: '' } : splitStaffTopbarName(dashboardData.staffName);
      if(pendingIdentity){
        if(givenEl) givenEl.textContent = '\u2026';
        if(surEl){
          surEl.textContent = '';
          surEl.setAttribute('hidden', 'hidden');
        }
        if(sn) sn.setAttribute('aria-label', 'Loading profile');
      }else{
        const firstName = split.given || String(dashboardData.staffName || '').trim().split(/\s+/).filter(Boolean)[0] || '\u2026';
        if(givenEl) givenEl.textContent = firstName;
        if(surEl){
          surEl.textContent = '';
          surEl.setAttribute('hidden', 'hidden');
        }
        if(sn) sn.setAttribute('aria-label', firstName);
      }
      if(typeof portalApplyClientsDirectoryAccess === 'function') portalApplyClientsDirectoryAccess();
      if(typeof portalApplyTopbarDateDisplayFromDate === 'function'){
        portalApplyTopbarDateDisplayFromDate(
          typeof portalResolveTopbarDisplayDate === 'function' ? portalResolveTopbarDisplayDate() : new Date()
        );
      }else{
        const dateStr = typeof portalFormatTopbarDateFromDate === 'function' ? portalFormatTopbarDateFromDate(new Date()) : dashboardData.dateTopbar;
        const td = document.getElementById('topbarDate');
        if(td) td.textContent = dateStr;
        const tdb = document.getElementById('topbarDateBtn');
        if(tdb) tdb.setAttribute('aria-label', 'Working day: ' + dateStr);
      }
      const av = document.getElementById('avatar');
      if(av){
        let avImg = av.querySelector('img');
        const initialsEl = document.getElementById('avatarInitials');
        if(!avImg){
          avImg = document.createElement('img');
          avImg.alt = '';
          av.insertBefore(avImg, av.firstChild);
        }
        avImg.alt = pendingIdentity ? 'Loading profile' : (dashboardData.staffName || 'Profile');
        avImg.onerror = function(){
          this.style.display = 'none';
          if(av) av.classList.remove('avatar--brand-default');
          if(initialsEl){
            initialsEl.textContent = pendingIdentity ? '\u2026' : clientInitials(dashboardData.staffName);
            initialsEl.hidden = false;
          }
        };
        avImg.onload = function(){
          this.style.display = '';
          if(initialsEl){
            initialsEl.textContent = '';
            initialsEl.hidden = true;
          }
        };
        const avSrc = portalTopbarAvatarDisplayUrl();
        const isBrandDefault = typeof portalTopbarAvatarIsStaffBrandUrl === 'function'
          ? portalTopbarAvatarIsStaffBrandUrl(avSrc)
          : (avSrc === PORTAL_DEFAULT_TOPBAR_AVATAR_URL);
        if(initialsEl && avSrc){
          initialsEl.textContent = '';
          initialsEl.hidden = true;
        }
        if(avSrc){
          av.classList.toggle('avatar--brand-default', isBrandDefault);
          const avNorm = typeof portalNormalizeParticipantPhotoUrl === 'function'
            ? portalNormalizeParticipantPhotoUrl(avSrc)
            : avSrc;
          const curAv = String(avImg.getAttribute('src') || avImg.src || '');
          if(!curAv || (curAv !== avNorm && !curAv.endsWith(avNorm) && !avNorm.endsWith(curAv.split('?')[0]))){
            avImg.src = avSrc;
          }
          avImg.style.display = '';
        } else {
          av.classList.remove('avatar--brand-default');
          avImg.removeAttribute('src');
          avImg.style.display = 'none';
          if(initialsEl){
            initialsEl.textContent = pendingIdentity ? '\u2026' : clientInitials(dashboardData.staffName);
            initialsEl.hidden = false;
          }
        }
      }
      syncPortalHeaderAlertChrome();
      if(typeof portalEnsureTopbarNameFitListeners === 'function') portalEnsureTopbarNameFitListeners();
      if(typeof portalFitTopbarName === 'function'){
        requestAnimationFrame(function(){
          portalFitTopbarName();
          requestAnimationFrame(portalFitTopbarName);
        });
      }
      if(typeof window.portalSyncTopbarStaffPhoto === 'function') window.portalSyncTopbarStaffPhoto();
    }
    window.renderHeader = renderHeader;

    /** Live topbar name: roster spreadsheet label (Javi vs Javier), then auth profile — never email local-part alone for exec accounts. */
    window.portalTopbarDisplayNameFromAuth = function(profile, session){
      try{
        if(typeof window.portalStaffTopbarDisplayName === 'function'){
          var user = session && session.user ? session.user : null;
          var sid = String(typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '').trim();
          return window.portalStaffTopbarDisplayName(profile, user, sid);
        }
        var n = '';
        if(profile) n = String(profile.full_name || profile.username || '').trim();
        if(!n && session && session.user){
          var u = session.user;
          var meta = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name))
            ? String(u.user_metadata.full_name || u.user_metadata.name).trim() : '';
          if(meta) n = meta;
          else if(u.email) n = String(u.email).split('@')[0].trim();
        }
        return n;
      }catch(_){ return ''; }
    };

    function noticeIconSvg(type){
      if(type === 'urgent'){
        return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
      }
      if(type === 'training'){
        return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.3-6.3 4.3 2.3-7-6-4.6h7.6L12 2z"/></svg>';
      }
      return '<svg class="notice-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M11 4.5v15l7-4.2V8.7L11 4.5zM3 9v6h3.5V9H3zm14 .5v7c1.66-.45 3-1.7 3-3.5s-1.34-3.05-3-3.5z"/></svg>';
    }

    function portalOpenLogoLiteQuickMenuFromIosAlertPreview(){
      if(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive()){
        if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
      }
      portalQuickMenuEntryMode = 'logo-lite';
      if(typeof openSheet === 'function') openSheet('menuSheet', { skipReminderSync: false, bypassAnnouncementLock: true });
    }
    function handleHeaderLogoAlertsClick(){
      if(window.__PORTAL_HALO_MENU_OPENING__) return;
      window.__PORTAL_HALO_MENU_OPENING__ = true;
      try{
      if(document.getElementById('internalChatSheet')?.classList.contains('open')){
        if(typeof portalCloseInternalChatReturnToAlertsMenu === 'function'){
          portalCloseInternalChatReturnToAlertsMenu();
        }
        return;
      }
      const menu = document.getElementById('menuSheet');
      const openSheets = $$('.sheet.open');
      const onlyMenuOpen = openSheets.length === 1 && menu && menu.classList.contains('open');
      if(onlyMenuOpen){
        if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
        return;
      }
      portalOpenLogoLiteQuickMenuFromIosAlertPreview();
      }finally{
        setTimeout(function(){ window.__PORTAL_HALO_MENU_OPENING__ = false; }, 500);
      }
    }
    /** In-app blue “pill” preview removed — roster/announcements use OS notifications (white tile) only. */
    function syncPortalIosAlertPreviewStack(){
      const wrap = document.getElementById('portalIosAlertStackWrap');
      const stack = document.getElementById('portalIosAlertStack');
      if(!wrap || !stack) return;
      stack.innerHTML = '';
      wrap.hidden = true;
    }

    function portalSyncAnnualProfileQuickMenuGroup(){
      const profGrp = document.getElementById('portalAnnualProfileQuickGroup');
      if(!profGrp) return;
      const show = typeof portalAnnualProfileQuickMenuShouldShow === 'function'
        ? portalAnnualProfileQuickMenuShouldShow()
        : false;
      if(show){
        if(typeof portalShowAnnualProfileQuickMenu === 'function') portalShowAnnualProfileQuickMenu();
        else {
          profGrp.hidden = false;
          profGrp.setAttribute('aria-hidden', 'false');
        }
      }else{
        if(typeof portalHideAnnualProfileQuickMenu === 'function') portalHideAnnualProfileQuickMenu();
        else {
          profGrp.hidden = true;
          profGrp.setAttribute('aria-hidden', 'true');
        }
      }
    }

    window.portalSyncAnnualProfileQuickMenuGroup = portalSyncAnnualProfileQuickMenuGroup;

    function portalApplyQuickMenuEntryMode(opts){
      opts = opts || {};
      const menu = document.getElementById('menuSheet');
      if(!menu) return;
      const mode = portalQuickMenuEntryMode === 'logo-lite' ? 'logo-lite' : 'full';
      menu.classList.toggle('menu-sheet--logo-lite', mode === 'logo-lite');
      menu.classList.toggle('menu-sheet--full', mode === 'full');
      const titleEl = document.getElementById('portalMenuSheetTitle');
      if(titleEl) titleEl.textContent = mode === 'logo-lite' ? 'Alerts/Notifications' : 'Quick menu';
        if(opts.shellOnly){
        if(mode === 'full'){
          const grp = document.getElementById('portalQuickMenuNotificationsGroup');
          if(grp) grp.hidden = true;
          portalSyncAnnualProfileQuickMenuGroup();
        }
        return;
      }
      if(mode === 'logo-lite'){
        const st = typeof portalReminderState === 'function' ? portalReminderState() : null;
        if(typeof syncPortalScheduleOverridesTopSlot === 'function') syncPortalScheduleOverridesTopSlot(st);
        if(typeof syncPortalQuickMenuNotificationsGroupVisibility === 'function') syncPortalQuickMenuNotificationsGroupVisibility();
      }else{
        const grp = document.getElementById('portalQuickMenuNotificationsGroup');
        if(grp) grp.hidden = true;
        portalSyncAnnualProfileQuickMenuGroup();
        const stFull = typeof portalReminderState === 'function' ? portalReminderState() : null;
        if(typeof syncPortalScheduleOverridesTopSlot === 'function') syncPortalScheduleOverridesTopSlot(stFull);
        if(typeof portalCollapseQuickMenuAccordions === 'function') portalCollapseQuickMenuAccordions();
      }
    }
    function portalDeferQuickMenuHeavySync(opts){
      opts = opts || {};
      var run = function(){
        if(typeof portalApplyQuickMenuEntryMode === 'function') portalApplyQuickMenuEntryMode();
        if(typeof portalSyncQuickMenuGuidePlacement === 'function') portalSyncQuickMenuGuidePlacement();
        if(typeof renderNotices === 'function') renderNotices();
        if(typeof portalSyncExecWorkspaceSwitchSlot === 'function'){
          portalSyncExecWorkspaceSwitchSlot('staff');
        }
        if(typeof portalHydrateAnnouncementsFromSupabase === 'function'){
          void portalHydrateAnnouncementsFromSupabase().then(function(){
            if(typeof window.portalSyncAnnualProfileQuickMenuGroup === 'function'){
              window.portalSyncAnnualProfileQuickMenuGroup();
            }
            if(typeof portalSyncAnnouncementsAndRemindersUi === 'function'){
              portalSyncAnnouncementsAndRemindersUi({ force: true, immediate: true });
            }
          });
        }
        if(!opts.skipReminderSync){
          if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
          else if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
          if(typeof syncPortalQuickMenuNotificationsGroupVisibility === 'function'){
            syncPortalQuickMenuNotificationsGroupVisibility();
          }
          if(typeof syncPortalHeaderAlertChrome === 'function'){
            syncPortalHeaderAlertChrome(typeof portalReminderState === 'function' ? portalReminderState() : null);
          }
          if(typeof portalRefreshQuickMenuAccordion === 'function') portalRefreshQuickMenuAccordion();
        }
      };
      if(typeof requestAnimationFrame === 'function'){
        requestAnimationFrame(function(){ requestAnimationFrame(run); });
      }else{
        setTimeout(run, 0);
      }
    }
    function syncPortalQuickMenuNotificationsGroupVisibility(){
      const grp = document.getElementById('portalQuickMenuNotificationsGroup');
      const grid = document.getElementById('portalQuickMenuNoticesGrid');
      const qg = document.getElementById('portalQuickMenuReminderGroup');
      const policySlot = document.getElementById('portalQuickMenuSafeguardingPolicySlot');
      const outstandingSlot = document.getElementById('portalQuickMenuOutstandingFeedbackSlot');
      const adminHost = document.getElementById('portalQuickMenuScheduleOverridesTop');
      const adminTitle = document.getElementById('portalQuickMenuAdminChangesHeading');
      const leadTeamHost = document.getElementById('portalLeadTeamShiftQuickHost');
      const leadTeamTitle = document.getElementById('portalLeadTeamShiftHeading');
      if(!grp) return;
      if(portalQuickMenuEntryMode !== 'logo-lite'){
        const pendingAnnCount = typeof portalActiveAnnouncementItems === 'function'
          ? portalActiveAnnouncementItems().length
          : 0;
        const hasCalendarAnn = !!(
          typeof portalCalendar202627NoticeItem === 'function' &&
          portalCalendar202627NoticeItem()
        );
        const hasNoticesEarly = !!(grid && grid.childElementCount > 0);
        if(!pendingAnnCount && !hasNoticesEarly && !hasCalendarAnn){
          grp.hidden = true;
          return;
        }
      }
      const wellbeingSlot = document.getElementById('portalQuickMenuWellbeingReviewSlot');
      const hasPolicy = !!(policySlot && !policySlot.hidden);
      const hasOutstanding = !!(outstandingSlot && !outstandingSlot.hidden);
      const hasWellbeing = !!(wellbeingSlot && !wellbeingSlot.hidden);
      const hasBanner = hasPolicy || hasOutstanding || hasWellbeing || !!(qg && !qg.hidden);
      const hasNotices = !!(grid && grid.childElementCount > 0);
      const hasAdminChanges = !!(adminHost && !adminHost.hidden && adminHost.querySelector('.portal-qm-override-stack'));
      const hasLeadTeamShift = !!(leadTeamHost && !leadTeamHost.hidden && leadTeamHost.querySelector('.portal-lead-team-qm-stack'));
      if(adminTitle) adminTitle.hidden = !hasAdminChanges;
      if(leadTeamTitle) leadTeamTitle.hidden = !hasLeadTeamShift;
      grp.hidden = !hasBanner && !hasNotices && !hasAdminChanges && !hasLeadTeamShift;
    }

    function syncDockQuickMenuAttention(){
      const dockHome = document.getElementById('dockDashboardTile');
      if(!dockHome) return;
      if(typeof portalApplyPortalOrbitAlertClasses === 'function'){
        const st = typeof portalReminderState === 'function' ? portalReminderState() : null;
        portalApplyPortalOrbitAlertClasses(dockHome, st);
      }
    }
    function portalSyncAnnouncementBeforeUnloadListener(){
      const need = !!(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive());
      if(need){
        if(!window.__portalAnnouncementBeforeUnloadBound){
          window.addEventListener('beforeunload', portalAnnouncementBeforeUnloadHandler);
          window.__portalAnnouncementBeforeUnloadBound = true;
        }
      }else if(window.__portalAnnouncementBeforeUnloadBound){
        window.removeEventListener('beforeunload', portalAnnouncementBeforeUnloadHandler);
        window.__portalAnnouncementBeforeUnloadBound = false;
      }
    }
    function portalAnnouncementBeforeUnloadHandler(e){
      e.preventDefault();
      e.returnValue = '';
    }

    function renderNotices(){
      const noticesGrid = document.getElementById('portalQuickMenuNoticesGrid');
      if(!noticesGrid) return;
      noticesGrid.innerHTML = '';
      const activeAnnouncementCount = typeof portalActiveAnnouncementItems === 'function'
        ? portalActiveAnnouncementItems().length
        : 0;
      noticesGrid.className = 'menu-grid menu-grid--portal-notices menu-grid--portal-announcements-split';
      const svgAnn = noticeIconSvg('announcement');
      function appendAnnouncementSubcategory(subtitle, btn, variant){
        const wrap = document.createElement('div');
        const variantClass = variant === 'pending'
          ? 'pending'
          : (variant === 'reference' ? 'reference' : 'signed');
        wrap.className = 'portal-quickmenu-announcement-sub portal-quickmenu-announcement-sub--' + variantClass;
        const st = document.createElement('p');
        st.className = 'portal-quickmenu-announcement-subtitle';
        st.textContent = subtitle;
        wrap.appendChild(st);
        wrap.appendChild(btn);
        noticesGrid.appendChild(wrap);
      }
      function buildAnnouncementQuickRow(id, label, ariaLabel, btnClass){
        const isPendingNew = btnClass.indexOf('menu-btn--announcement-attention') !== -1;
        const iconSvg = isPendingNew ? noticeIconSvg('urgent') : svgAnn;
        const blockInner = '<div class="portal-quick-reminder-block"><strong><span class="announcement-title-line announcement-title-line--quick-menu-only">' + escapeHtml(label) + '</span></strong></div>';
        const b = document.createElement('button');
        b.type = 'button';
        b.id = id;
        b.className = 'menu-btn notice announcement menu-btn--qm-tile ' + String(btnClass || '').trim();
        b.setAttribute('aria-label', ariaLabel);
        b.innerHTML = '<div class="menu-btn-icon" aria-hidden="true">' + iconSvg + '</div><div class="menu-btn-copy txt">' + blockInner + '</div><span class="menu-btn-chev" aria-hidden="true">›</span>';
        return b;
      }
      const calendarItem = typeof portalCalendar202627NoticeItem === 'function'
        ? portalCalendar202627NoticeItem()
        : null;
      // Reference (Calendar 2026/27) sits ABOVE the signature/announcement
      // blocks so the always-there term calendar is the first thing in the
      // Alerts/Notifications sheet, before any pending "Need your signature".
      if(calendarItem){
        appendAnnouncementSubcategory(
          'Reference',
          buildAnnouncementQuickRow(
            'portalOpenCalendar202627',
            'Calendar 2026/27',
            'Term dates — Day Centre, after-schools & crash courses',
            'menu-btn--calendar-ref'
          ),
          'reference'
        );
      }
      if(activeAnnouncementCount > 0){
        const annLabel = activeAnnouncementCount > 1
          ? ('New Announcement/Reminder x' + String(activeAnnouncementCount))
          : 'New Announcement/Reminder';
        const annAria = activeAnnouncementCount > 1
          ? (String(activeAnnouncementCount) + ' new announcements or reminders — open to read and sign before continuing')
          : 'New announcement or reminder — open to read and sign before continuing';
        appendAnnouncementSubcategory(
          'Need your signature',
          buildAnnouncementQuickRow(
            'announcementNewNotice',
            annLabel,
            annAria,
            'menu-btn--announcement-attention'
          ),
          'pending'
        );
      }
      const signedHistoryRows = typeof portalSignedMessageHistoryRows === 'function'
        ? portalSignedMessageHistoryRows()
        : (typeof portalAnnouncementHistoryRows === 'function' ? portalAnnouncementHistoryRows() : []);
      if(signedHistoryRows.length > 0){
        appendAnnouncementSubcategory(
          'Previously signed',
          buildAnnouncementQuickRow(
            'announcementSignedLog',
            'Signed Announcements/Reminders',
            'Signed announcements and reminders — open log to read',
            'menu-btn--announcement-signed'
          ),
          'signed'
        );
      }
      if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
      else {
        if(typeof syncPortalQuickMenuNotificationsGroupVisibility === 'function') syncPortalQuickMenuNotificationsGroupVisibility();
        if(typeof syncDockQuickMenuAttention === 'function') syncDockQuickMenuAttention();
      }
    }
    /** Same delivery as roster undo: vibrate + white-tile OS notification once per unsigned announcement key. */
    function portalMaybeNotifyUnsignedAnnouncementPending(){
      try{
        const items = typeof portalActiveAnnouncementItems === 'function' ? portalActiveAnnouncementItems() : [];
        if(!items.length) return;
        const p = items[0];
        const k = typeof portalSignableSignatureKey === 'function'
          ? portalSignableSignatureKey(p)
          : (typeof portalAnnouncementSignatureKey === 'function' ? portalAnnouncementSignatureKey(p) : '');
        if(!k) return;
        let sysDone = {};
        try{ sysDone = JSON.parse(sessionStorage.getItem('portalAnnSystemNotified_v1') || '{}') || {}; }catch(_){ sysDone = {}; }
        if(sysDone[k]) return;
        const lineTitle = String(p && p.title || '').trim() || 'Open the portal to read and sign.';
        const isReminder = typeof portalSignableItemIsReminder === 'function' && portalSignableItemIsReminder(p);
        const title = isReminder ? 'New reminder to sign from Staff' : 'New announcement to sign from Staff';
        const ok = portalStaffNotifyOsWhiteTile(title, lineTitle, 'clubsensational-portal-ann-' + k);
        if(ok){
          sysDone[k] = Date.now();
          try{ sessionStorage.setItem('portalAnnSystemNotified_v1', JSON.stringify(sysDone)); }catch(_){}
        }
      }catch(_){}
    }
    let _portalAnnSyncTimer = null;
    let _portalAnnUiLastFp = '';
    function portalAnnouncementsUiFingerprint(){
      const active = typeof portalActiveAnnouncementItems === 'function' ? portalActiveAnnouncementItems().length : 0;
      const signed = typeof portalSignedMessageHistoryRows === 'function'
        ? portalSignedMessageHistoryRows().length
        : (typeof portalAnnouncementHistoryRows === 'function' ? portalAnnouncementHistoryRows().length : 0);
      const merged = dashboardData && dashboardData.portalAnnouncementAcksMerged ? '1' : '0';
      const cal = typeof portalCalendar202627NoticeItem === 'function' && portalCalendar202627NoticeItem() ? '1' : '0';
      return String(active) + '|' + String(signed) + '|' + merged + '|' + cal;
    }
    function portalSyncAnnouncementsAndRemindersUi(opts){
      opts = opts && typeof opts === 'object' ? opts : {};
      if(_portalAnnSyncTimer) clearTimeout(_portalAnnSyncTimer);
      const delay = opts.immediate ? 0 : 90;
      _portalAnnSyncTimer = setTimeout(function(){
        _portalAnnSyncTimer = null;
        portalSyncAnnouncementsAndRemindersUiCore(opts);
      }, delay);
    }
    function portalSyncAnnouncementsAndRemindersUiCore(opts){
      opts = opts && typeof opts === 'object' ? opts : {};
      const fp = portalAnnouncementsUiFingerprint();
      const fpUnchanged = fp === _portalAnnUiLastFp && !opts.force;
      if(!fpUnchanged){
        if(typeof portalPrunePreLaunchAnnouncementAcks === 'function'){
          const liveSet = portalLiveAnnouncementIdSet();
          if(Object.keys(liveSet).length > 0){
            portalPrunePreLaunchAnnouncementAcks(
              portalAnnouncementAckMapLoad,
              portalAnnouncementAckMapSave,
              liveSet
            );
            if(typeof portalPruneSupersededPortalReadyAnnouncementAcks === 'function'){
              portalPruneSupersededPortalReadyAnnouncementAcks(
                portalAnnouncementAckMapLoad,
                portalAnnouncementAckMapSave,
                liveSet
              );
            }
          }
        }
        if(typeof portalPruneTestAnnouncementAckKeys === 'function') portalPruneTestAnnouncementAckKeys();
        if(typeof portalPruneLegacyStaffDemoAnnouncementAckKeys === 'function') portalPruneLegacyStaffDemoAnnouncementAckKeys();
        if(typeof portalResetStaffDemoAnnouncementAckIfFlagged === 'function') portalResetStaffDemoAnnouncementAckIfFlagged();
        if(typeof portalSeedDemoSignedAnnouncementArchivesIfNeeded === 'function') portalSeedDemoSignedAnnouncementArchivesIfNeeded();
        if(typeof portalEnsureAnnouncementDemoSeed === 'function') portalEnsureAnnouncementDemoSeed();
      }
      const shouldRenderNotices = !fpUnchanged || !!opts.force;
      if(shouldRenderNotices){
        if(!fpUnchanged) _portalAnnUiLastFp = fp;
        if(typeof renderNotices === 'function') renderNotices();
        else if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
        if(typeof syncSessionReviewReminderBanner === 'function') syncSessionReviewReminderBanner();
        if(typeof portalSyncQuickMenuGuidePlacement === 'function') portalSyncQuickMenuGuidePlacement();
      }
      const annSheet = document.getElementById('announcementsSheet');
      if(annSheet && annSheet.classList.contains('open') && typeof renderAnnouncementsSheetContent === 'function'){
        renderAnnouncementsSheetContent();
      }
      if(typeof portalMaybeNotifyUnsignedAnnouncementPending === 'function'){
        if(!dashboardData || dashboardData.portalAnnouncementAcksMerged !== false){
          portalMaybeNotifyUnsignedAnnouncementPending();
        }
      }
    }
    /** @deprecated internal */
    function portalSyncAnnouncementsAndRemindersUiImmediate(opts){
      portalSyncAnnouncementsAndRemindersUiCore(Object.assign({ force: true }, opts || {}));
    }
    window.portalSyncAnnouncementsAndRemindersUi = portalSyncAnnouncementsAndRemindersUi;

    const TODAY_DAY_OFF_ICON =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path><path d="m9 15 6 6M15 15l-6 6"></path></svg>';
    const TODAY_PARTICIPANT_MED_ICON =
      '<svg class="today-participant-chip__med-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M9 2h6a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1z"/></svg>';
    function portalParticipantHasMedicalAlert(clientId, name){
      const id = String(clientId || '').trim();
      if(id && typeof clientNotesById !== 'undefined' && clientNotesById[id]){
        return !!clientNotesById[id].hasMedicalAlert;
      }
      const want = String(name || '').trim().toLowerCase();
      if(!want || typeof clientNotesById === 'undefined') return false;
      const keys = Object.keys(clientNotesById);
      for(let i = 0; i < keys.length; i++){
        const c = clientNotesById[keys[i]];
        if(c && String(c.name || '').trim().toLowerCase() === want) return !!c.hasMedicalAlert;
      }
      return false;
    }
    function portalTodayDayOffPanelHtml(opts){
      opts = opts || {};
      const loading = !!opts.loading;
      const preview = opts.preview;
      const mode = String(opts.mode || '').trim() || (loading ? 'loading' : 'off');
      if(loading || mode === 'loading'){
        return '<div class="today-day-panel today-day-panel--loading" role="status">' +
          '<p class="today-day-panel__loading">Loading your schedule…</p></div>';
      }
      const shiftMeta = mode === 'shift' && typeof portalStaffTodayLeadShiftPanelMeta === 'function'
        ? portalStaffTodayLeadShiftPanelMeta(
          (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
          || (typeof STAFF_DASHBOARD_ID !== 'undefined' ? STAFF_DASHBOARD_ID : '')
        )
        : null;
      const hasNext = !!(preview && (Number(preview.sessionCount) || 0));
      const offRequested = mode === 'off_time_requested';
      let html = '<div class="today-day-panel' + (hasNext ? ' today-day-panel--has-next' : ' today-day-panel--solo') + (offRequested ? ' today-day-panel--off-requested' : '') + (mode === 'shift' ? ' today-day-panel--shift' : '') + '" role="status">';
      html += '<div class="today-day-panel__off">';
      if(mode === 'shift' && shiftMeta){
        html += '<div class="today-day-panel__off-copy">';
        html += '<p class="today-day-panel__off-title">Your shift</p>';
        html += '<p class="today-day-panel__off-sub">' + escapeHtml(
          [shiftMeta.venueLabel, shiftMeta.timeLabel].filter(Boolean).join(' · ')
        ) + '</p></div></div>';
      }else if(mode === 'sync'){
        html += '<div class="today-day-panel__off-copy">';
        html += '<p class="today-day-panel__off-title">Loading sessions</p>';
        html += '<p class="today-day-panel__off-sub">Your roster for today is syncing…</p></div></div>';
      }else if(mode === 'off_time_requested'){
        html += '<span class="today-day-panel__off-icon" aria-hidden="true">' + TODAY_DAY_OFF_ICON + '</span>';
        html += '<div class="today-day-panel__off-copy">';
        html += '<p class="today-day-panel__off-title">Day off (Time Off Requested)</p>';
        html += '<p class="today-day-panel__off-sub">' + (hasNext ? 'No sessions this day — your next session is below' : 'No sessions this day') + '</p></div></div>';
      }else if(mode === 'off'){
        html += '<span class="today-day-panel__off-icon" aria-hidden="true">' + TODAY_DAY_OFF_ICON + '</span>';
        html += '<div class="today-day-panel__off-copy">';
        html += '<p class="today-day-panel__off-title">Day off</p>';
        html += '<p class="today-day-panel__off-sub">' + (hasNext ? 'No sessions today — your next session is below' : 'No sessions today') + '</p></div></div>';
      }else if(mode === 'complete'){
        html += '<span class="today-day-panel__off-icon" aria-hidden="true">' + TODAY_DAY_OFF_ICON + '</span>';
        html += '<div class="today-day-panel__off-copy">';
        html += '<p class="today-day-panel__off-title">All done for today</p>';
        html += '<p class="today-day-panel__off-sub">Your next session is below</p></div></div>';
      }else{
        html += '<div class="today-day-panel__off-copy">';
        html += '<p class="today-day-panel__off-title">No sessions</p>';
        html += '<p class="today-day-panel__off-sub">Nothing scheduled for this day</p></div></div>';
      }
      if(hasNext){
        const chips = Array.isArray(preview.participants) ? preview.participants : [];
        const aria = 'Next session ' + String(preview.weekday || '') + ' ' + String(preview.dateLabel || '');
        html += '<div class="today-day-panel__next">';
        html += '<button type="button" class="today-day-panel__next-open" data-open-next-session="1" aria-label="' + escapeHtml(aria.trim()) + '">';
        html += '<div class="today-day-panel__next-head">';
        html += '<span class="today-day-panel__next-kicker">Next session</span>';
        html += '<span class="today-day-panel__next-date">' + escapeHtml(preview.weekday || '') + ' · ' + escapeHtml(preview.dateLabel || '') + '</span></div>';
        html += '</button>';
        if(chips.length){
          html += typeof portalTodayNextParticipantChipsHtml === 'function'
            ? portalTodayNextParticipantChipsHtml(chips, { escapeHtml: escapeHtml })
            : '';
        }
        html += '</div>';
      }
      html += '</div>';
      return html;
    }
    function portalResolveClientIdForParticipant(clientId, name){
      const id = String(clientId || '').trim();
      if(id && typeof clientNotesById !== 'undefined' && clientNotesById[id]) return id;
      const want = String(name || '').trim().toLowerCase();
      if(!want || typeof clientNotesById === 'undefined') return id;
      const keys = Object.keys(clientNotesById);
      for(let i = 0; i < keys.length; i++){
        const c = clientNotesById[keys[i]];
        if(c && String(c.name || '').trim().toLowerCase() === want) return keys[i];
      }
      return id;
    }
    function openClientFromNextSessionParticipant(clientId, name, timeHint){
      const preview = dashboardData && dashboardData.portalTodayNextSessionPreview;
      let sub = 'Next session participant';
      const hint = String(timeHint || '').trim();
      if(hint){
        const sheetTitle = typeof formatNextSessionSheetTitle === 'function' ? String(formatNextSessionSheetTitle() || '').trim() : '';
        sub = sheetTitle && sheetTitle !== 'No upcoming sessions' ? (sheetTitle + ' · ' + hint) : hint;
      }else if(preview){
        sub = ('Next session · ' + String(preview.weekday || '').trim() + ' ' + String(preview.dateLabel || '').trim()).trim();
      }else if(typeof formatNextSessionSheetTitle === 'function'){
        const sheetTitle = String(formatNextSessionSheetTitle() || '').trim();
        if(sheetTitle && sheetTitle !== 'No upcoming sessions') sub = sheetTitle;
      }
      const resolvedId = portalResolveClientIdForParticipant(clientId, name);
      let item = resolvedId ? buildClientDirectorySheetItem(resolvedId, sub) : null;
      if(!item){
        item = {
          kind: 'client',
          clientId: resolvedId || '',
          name: String(name || '—').trim() || '—',
          time: sub,
          general: '',
          specialty: '',
          activity: '',
          openSheet: true,
          directoryProfile: true
        };
      }else{
        item.directoryProfile = true;
        item.time = sub;
      }
      openClient(item);
    }
    function portalBindTodayDayOffPanel(grid){
      if(!grid) return;
      grid.querySelectorAll('[data-open-next-session="1"]').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(typeof openSheet === 'function') openSheet('tomorrowSheet');
        });
      });
    }
    function portalInitNextSessionParticipantDelegation(){
      if(window.__PORTAL_NEXT_SESSION_PARTICIPANT_BOUND__) return;
      window.__PORTAL_NEXT_SESSION_PARTICIPANT_BOUND__ = true;
      const onParticipantTap = function(ev){
        const el = ev.target.closest('[data-next-session-participant="1"]');
        if(!el) return;
        ev.preventDefault();
        ev.stopPropagation();
        openClientFromNextSessionParticipant(
          el.getAttribute('data-next-session-client') || '',
          el.getAttribute('data-next-session-name') || '',
          el.getAttribute('data-next-session-time') || ''
        );
      };
      const todayGrid = document.getElementById('todayGrid');
      if(todayGrid) todayGrid.addEventListener('click', onParticipantTap);
      const tomorrowList = document.getElementById('tomorrowList');
      if(tomorrowList) tomorrowList.addEventListener('click', onParticipantTap);
    }

    function applyTodayGridSizing(grid, count){
      if(!grid) return;
      if(!count || count < 1){
        grid.classList.remove('today-grid--session-scroll');
        grid.style.removeProperty('--today-rows-fill');
        grid.style.removeProperty('--today-session-count');
        grid.style.removeProperty('--today-row-pad-y');
        grid.style.removeProperty('--today-time-fs');
        grid.style.removeProperty('--today-name-fs');
        grid.style.removeProperty('--today-icon');
        grid.style.removeProperty('--today-area-icon');
        grid.style.removeProperty('--today-area-label-fs');
        grid.style.removeProperty('--today-symbol-col-max');
        grid.style.removeProperty('--today-row-gap');
        return;
      }
      const n = Math.min(9, count);
      const scrollMode = n >= 7;
      grid.classList.toggle('today-grid--session-scroll', scrollMode);
      grid.style.setProperty('--today-rows-fill', n === 1 ? '0.333333' : '1');
      grid.style.setProperty('--today-session-count', String(n));
      const t = (n - 1) / 8;
      let timeFs = Math.round(11 + (1 - t) * 5);
      let nameFs = Math.min(16, timeFs + 1);
      let iconPx = Math.max(28, Math.round(26 + (1 - t) * 10));
      let areaIconPx = Math.max(38, Math.round(34 + (1 - t) * 10));
      let gapPx = n >= 7 ? 2 : (n >= 4 ? 3 : Math.round(4 + (3 - n) * 0.5));
      let padY = n >= 8 ? 2 : (n >= 5 ? 3 : 4);
      if(n >= 5 && n <= 6){
        nameFs = Math.max(13, nameFs);
        iconPx = Math.min(iconPx, 30);
      }
      if(scrollMode){
        timeFs = 12;
        nameFs = 14;
        iconPx = 30;
        areaIconPx = 36;
        gapPx = 4;
        padY = 4;
      }
      const areaM = typeof portalTodayAreaNoteMetrics === 'function'
        ? portalTodayAreaNoteMetrics(n, scrollMode, grid, nameFs)
        : { iconPx, areaIconPx, labelFs: 9, symbolColMax: 72 };
      iconPx = areaM.iconPx;
      areaIconPx = areaM.areaIconPx;
      grid.style.setProperty('--today-time-fs', timeFs + 'px');
      grid.style.setProperty('--today-name-fs', nameFs + 'px');
      grid.style.setProperty('--today-icon', iconPx + 'px');
      grid.style.setProperty('--today-area-icon', areaIconPx + 'px');
      grid.style.setProperty('--today-note-size', areaIconPx + 'px');
      grid.style.setProperty('--today-area-label-fs', areaM.labelFs + 'px');
      grid.style.setProperty('--today-area-stack-gap', (areaM.stackGap != null ? areaM.stackGap : 0) + 'px');
      grid.style.setProperty('--today-area-label-block', (areaM.labelBlock != null ? areaM.labelBlock : 0) + 'px');
      grid.style.setProperty('--today-symbol-col-max', (n >= 5 ? Math.min(areaM.symbolColMax, 62) : areaM.symbolColMax) + 'px');
      grid.style.setProperty('--today-row-gap', gapPx + 'px');
      grid.style.setProperty('--today-row-pad-y', padY + 'px');
    }

    function renderToday(){
      const grid = $('#todayGrid');
      if(!grid){
        if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
        return;
      }
      const todayHeadingLabel = document.getElementById('todayHeadingLabel');
      const todayDateLine = document.getElementById('todayDateLine');
      if(todayHeadingLabel || todayDateLine){
        const todayTitle = portalTodaySectionTitleText();
        if(todayTitle.indexOf('TODAY ') === 0){
          if(todayHeadingLabel) todayHeadingLabel.textContent = 'TODAY';
          if(todayDateLine) todayDateLine.textContent = todayTitle.slice(6).trim();
        }else if(todayTitle === 'TODAY'){
          if(todayHeadingLabel) todayHeadingLabel.textContent = 'TODAY';
          if(todayDateLine) todayDateLine.textContent = '';
        }else{
          if(todayHeadingLabel) todayHeadingLabel.textContent = todayTitle;
          if(todayDateLine) todayDateLine.textContent = '';
        }
      }
      const awaitingInitialToday = typeof portalStaffLiveTodayAwaitingInitialSchedule === 'function'
        && portalStaffLiveTodayAwaitingInitialSchedule();
      let count = awaitingInitialToday ? 0 : Math.min(9, dashboardData.today.length || 0);
      grid.className = 'today-grid';
      grid.setAttribute('data-session-count', String(count));
      if(!count){
        applyTodayGridSizing(grid, 0);
        const preview = dashboardData && dashboardData.portalTodayNextSessionPreview;
        const loading = !!(dashboardData && dashboardData.portalIdentityResolved === false);
        const sid = String(
          (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
          || STAFF_DASHBOARD_ID
          || ''
        ).trim().toLowerCase();
        let panelMode = (dashboardData && dashboardData.portalTodayEmptyPanelMode)
          ? String(dashboardData.portalTodayEmptyPanelMode)
          : '';
        if(!panelMode){
          panelMode = typeof portalStaffLiveTodayEmptyPanelMode === 'function'
            ? portalStaffLiveTodayEmptyPanelMode(sid, { loading: loading })
            : (loading ? 'loading' : 'off');
        }
        const dayOffSig = typeof portalTodayDayOffPanelSignature === 'function'
          ? portalTodayDayOffPanelSignature({
            preview: preview && !loading && panelMode !== 'sync' ? preview : null,
            loading: loading,
            mode: panelMode
          })
          : '';
        if(dayOffSig && grid.getAttribute('data-day-off-sig') === dayOffSig && grid.querySelector('.today-day-panel')){
          grid.classList.add('today-grid--day-off');
          if(typeof portalRefreshTodayNextParticipantPhotos === 'function'){
            portalRefreshTodayNextParticipantPhotos(grid);
          }
          if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
          if(typeof window.portalSyncLeadTeamShiftUi === 'function') window.portalSyncLeadTeamShiftUi();
          return;
        }
        const fb = document.getElementById('todayGridFallback');
        if(fb) fb.remove();
        grid.innerHTML = '';
        grid.classList.add('today-grid--day-off');
        grid.style.setProperty('--today-rows-fill', '1');
        grid.setAttribute('data-day-off-sig', dayOffSig || '');
        grid.innerHTML = portalTodayDayOffPanelHtml({
          preview: preview && !loading && panelMode !== 'sync' ? preview : null,
          loading: loading,
          mode: panelMode
        });
        portalBindTodayDayOffPanel(grid);
        if(panelMode === 'sync' && typeof portalStaffScheduleTodaySyncRetry === 'function'){
          portalStaffScheduleTodaySyncRetry();
        }
        if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
        return;
      }
      const list = dashboardData.today.slice(0, 9);
      const todaySig = typeof portalTodaySessionCardsSignature === 'function'
        ? portalTodaySessionCardsSignature(list, sessionReviewRowClass, function(row){
          return typeof resolveParticipantPhotoUrl === 'function'
            ? resolveParticipantPhotoUrl(row && row.name, row && row.clientId)
            : '';
        })
        : '';
      if(todaySig && grid.getAttribute('data-today-cards-sig') === todaySig && grid.querySelector('.today-grid-rows')){
        applyTodayGridSizing(grid, count);
        if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
        return;
      }
      const fb = document.getElementById('todayGridFallback');
      if(fb) fb.remove();
      grid.innerHTML = '';
      grid.removeAttribute('data-day-off-sig');
      grid.classList.remove('today-grid--day-off');
      applyTodayGridSizing(grid, count);
      grid.setAttribute('data-today-cards-sig', todaySig || '');
      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'today-grid-rows';
      rowsWrap.setAttribute('role', 'list');
      list.forEach(item => {
        const ovTone = typeof portalTodaySessionOverrideCardClass === 'function' ? portalTodaySessionOverrideCardClass(item) : '';
        const ovTypeCls = typeof portalTodayItemOverrideClass === 'function' ? portalTodayItemOverrideClass(item) : '';
        const adminAdjCls = typeof portalTodayItemUsesAdminShiftCardStyle === 'function' && portalTodayItemUsesAdminShiftCardStyle(item) ? ' session-card--admin-adjusted' : '';
        if(item.kind === 'closed' || item.kind === 'available' || item.kind === 'home' || item.kind === 'manager' || item.kind === 'admin' || item.openSheet === false){
          const row = document.createElement('div');
          const rowKindCls = item.kind === 'closed'
            ? 'session-card--closed'
            : (item.kind === 'available'
              ? 'session-card--available'
              : (item.kind === 'home'
                ? 'session-card--home'
                : (item.kind === 'admin'
                  ? 'session-card--admin'
                  : (item.kind === 'manager' ? 'session-card--manager' : ''))));
          row.className = 'session-card' + (rowKindCls ? ' ' + rowKindCls : '') + ovTone + adminAdjCls + (ovTypeCls ? ' ' + ovTypeCls : '');
          row.setAttribute('role', 'listitem');
          row.innerHTML = todaySessionCardInnerHtml(item);
          rowsWrap.appendChild(row);
          return;
        }
        const card = document.createElement('button');
        card.type = 'button';
        const reviewCls = sessionReviewRowClass(item);
        const segCls = (Array.isArray(item.segments) && item.segments.length) ? ' session-card--segments' : '';
        card.className = 'session-card' + (item.kind === 'available' ? ' session-card--available' : '') + ovTone + adminAdjCls + (ovTypeCls ? ' ' + ovTypeCls : '') + (reviewCls ? ' ' + reviewCls : '') + segCls;
        card.setAttribute('role', 'listitem');
        if(item.sessionKey) card.setAttribute('data-session-key', String(item.sessionKey));
        const poolAria = (item.areaLabel && String(item.areaLabel).trim())
          ? `, ${String(item.areaLabel).trim()}`
          : (item.poolLocationLabel ? `, ${item.poolLocationLabel}` : '');
        const venAria = portalTodaySessionVenueLabel(item);
        const venPart = venAria && venAria !== '—' ? `, ${venAria}` : '';
        card.setAttribute('aria-label', item.kind === 'available' ? `NO PARTICIPANT — slot open for new bookings, ${item.time}${venPart}${poolAria}` : `Open notes for ${item.name}, ${item.time}${venPart}${poolAria}${adminAdjCls ? (portalTodayItemShowsShadowingHostAlert(item) ? ', shadowing session' : ', schedule changed by admin') : ''}`);
        card.innerHTML = todaySessionCardInnerHtml(item);
        card.addEventListener('click', () => openClient(item));
        rowsWrap.appendChild(card);
      });
      grid.appendChild(rowsWrap);
      requestAnimationFrame(function(){
        applyTodayGridSizing(grid, count);
        requestAnimationFrame(function(){
          applyTodayGridSizing(grid, count);
          requestAnimationFrame(function(){ applyTodayGridSizing(grid, count); });
        });
      });
      if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
      if(typeof window.portalSyncLeadTeamShiftUi === 'function') window.portalSyncLeadTeamShiftUi();
    }

    function formatClientCount(n){
      const num = Number(n);
      if(!Number.isFinite(num) || num < 0) return 'No sessions';
      if(num === 0) return 'No sessions';
      if(num === 1) return '1 participant';
      return num + ' participants';
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
          unit: s.unit === 'slots' ? 'slots' : 'clients',
          serviceLabel: s.serviceLabel != null ? String(s.serviceLabel).trim() : ''
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

    function isWeekListDayFinished(dayName){
      const ix = CALENDAR_WEEK_ORDER.indexOf(String(dayName || '').trim());
      if(ix < 0) return false;
      const mon = mondayStartOfWeekLocal(new Date());
      const cell = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + ix);
      cell.setHours(0, 0, 0, 0);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return cell.getTime() < today.getTime();
    }
    /** Off-day for a specific calendar ISO (Term grid rules) — use for Next Session search, not week-list weekday snap. */
    function portalTermDayIsOffForStaffOnIso(isoYmd, staffId){
      const iso = normaliseIsoDate(isoYmd);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!iso || !sid || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true;
      if(typeof portalTermStaffExtraCalendarDates === 'function' && portalTermStaffExtraCalendarDates(sid).indexOf(iso) >= 0){
        return false;
      }
      if(typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
        && portalStaffHasInstructorCoverOnCalendarDate(iso, sid)){
        return false;
      }
      const d = new Date(iso + 'T12:00:00');
      if(isNaN(d.getTime())) return true;
      const halfWeeks = Array.isArray(dashboardData.termHalfTermWeekStarts) ? dashboardData.termHalfTermWeekStarts : [];
      if(typeof isHalfTermDay === 'function' && isHalfTermDay(d.getFullYear(), d.getMonth(), d.getDate(), halfWeeks)) return true;
      if(typeof portalTermCalendarDayIsRed === 'function'
        && portalTermCalendarDayIsRed(d.getFullYear(), d.getMonth(), d.getDate(), sid, halfWeeks)) return true;
      if(typeof portalTermStaffOffWeekdayOnDate === 'function' && portalTermStaffOffWeekdayOnDate(iso, sid)) return true;
      if(typeof portalTermStaffAwayOnDate === 'function' && portalTermStaffAwayOnDate(iso, sid)) return true;
      return false;
    }
    /** Break / bank holiday / staff away — same red days as My Term grid; week strip shows Off. */
    function portalWeekListDayIsOff(dayName, staffId){
      const cell = calendarDateForWeekListDay(dayName);
      if(!cell) return true;
      const sid = String(staffId || '').trim().toLowerCase();
      const iso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(cell) : '';
      const halfWeeks = Array.isArray(dashboardData.termHalfTermWeekStarts) ? dashboardData.termHalfTermWeekStarts : [];
      if(iso && sid && typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
        && portalStaffHasInstructorCoverOnCalendarDate(iso, sid)){
        return false;
      }
      if(typeof portalTermCalendarDayIsRed === 'function'
        && portalTermCalendarDayIsRed(cell.getFullYear(), cell.getMonth(), cell.getDate(), sid, halfWeeks)){
        return true;
      }
      if(iso && sid && typeof portalTermStaffAwayOnDate === 'function' && portalTermStaffAwayOnDate(iso, sid)){
        return true;
      }
      return false;
    }
    function weekListDayRelationToToday(dayName){
      const cell = calendarDateForWeekListDay(dayName);
      if(!cell) return 'future';
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      today.setHours(0, 0, 0, 0);
      if(cell.getTime() < today.getTime()) return 'past';
      if(cell.getTime() > today.getTime()) return 'future';
      return 'today';
    }
    function weekListClientSessionsForDay(dayName){
      const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const d = String(dayName || '').trim();
      if(typeof portalWeekListDayIsOff === 'function' && portalWeekListDayIsOff(d, staffId)) return [];
      const cell = calendarDateForWeekListDay(dayName);
      if(!cell) return [];
      const pad = n => String(n).padStart(2, '0');
      const sessionDateIso = `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
      const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
      const isReal = function(s){
        if(baseReal) return baseReal(s, sessionDateIso);
        const st = String(s.status || '').toLowerCase();
        if(st === 'closed' || st === 'available') return false;
        const cid = String(s.clientId || '').toLowerCase();
        return Boolean(cid && cid !== 'closed' && cid !== 'available');
      };
      return typeof portalBaseClientSessionsForCalendarDate === 'function'
        ? portalBaseClientSessionsForCalendarDate(d, sessionDateIso, staffId, isReal)
        : [];
    }
    function weekListSyntheticFeedbackItem(rosterSession, cellDate){
      const y = cellDate.getFullYear();
      const mo = cellDate.getMonth();
      const da = cellDate.getDate();
      const pad = n => String(n).padStart(2, '0');
      const sessionDateKey = `${y}-${pad(mo + 1)}-${pad(da)}`;
      const dayWord = cellDate.toLocaleDateString('en-GB', { weekday: 'long' });
      const sessionKey = typeof portalSessionReviewKeyForModelRow === 'function'
        ? portalSessionReviewKeyForModelRow(rosterSession, dayWord, sessionDateKey)
        : `${sessionDateKey}|${rosterSession.start}|${rosterSession.clientId}`;
      const sessionEndTs = buildSessionEndMsForCalendarDate(y, mo, da, rosterSession.end);
      return {
        sessionKey: sessionKey || `${sessionDateKey}|${rosterSession.start}|${rosterSession.clientId}`,
        sessionEndTs,
        dayCentre: portalRosterSessionIsDayCentre(rosterSession),
        __portalBaseSession: rosterSession
      };
    }
    function weekListHasPendingFeedbackForDay(dayName){
      const cell = calendarDateForWeekListDay(dayName);
      if(!cell) return false;
      if(weekListDayRelationToToday(dayName) === 'future') return false;
      const sessionDateIso = portalIsoYmdFromDate(cell);
      const d = String(dayName || '').trim();
      if(typeof portalCountPendingSessionReviewsForCalendarDay === 'function'){
        try{
          return portalCountPendingSessionReviewsForCalendarDay(sessionDateIso, d) > 0;
        }catch(_){ return false; }
      }
      return false;
    }
    function weekListHasNotEndedClientSession(dayName){
      const cell = calendarDateForWeekListDay(dayName);
      if(!cell) return false;
      const sessions = weekListClientSessionsForDay(dayName);
      for(let i = 0; i < sessions.length; i++){
        const syn = weekListSyntheticFeedbackItem(sessions[i], cell);
        const item = { sessionEndTs: syn.sessionEndTs, sessionKey: syn.sessionKey };
        if(!isSessionEndedForFeedback(item)) return true;
      }
      return false;
    }
    /** Admin override on this calendar day (schedule_overrides rows — incl. cleared slots). */
    function portalStaffAdminUpdatedOnDate(isoYmd, staffId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid) return false;
      if(portalTermStaffAwayDatesFor(sid).indexOf(iso) >= 0) return false;
      const rows = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
      let found = false;
      rows.forEach(function(ov){
        if(!ov || String(ov.status || 'active') !== 'active') return;
        if(normaliseIsoDate(ov.session_date) !== iso) return;
        if(String(ov.anchor_staff_id || '').trim().toLowerCase() !== sid) return;
        const t = String(ov.override_type || '').trim();
        if(t === 'slot_update' || t === 'slot_close' || t === 'instructor_reassign' || t === 'client_cancelled') found = true;
        if(t === 'slot_clear_client' && !(ov.payload && ov.payload.cancelled_by_admin)) found = true;
      });
      return found;
    }
    /** Pending quick-menu override days (same source as yellow cards) — cached for calendar/week pulse. */
    function portalStaffIsProgrammeLead(){
      try{
        return typeof window.portalLeadTeamShiftContext === 'function' && !!window.portalLeadTeamShiftContext();
      }catch(_){
        return false;
      }
    }
    function portalLeadTeamShiftDayWasDismissed(iso){
      try{
        if(typeof window.portalLeadTeamShiftDayDismissed === 'function'){
          return !!window.portalLeadTeamShiftDayDismissed(iso);
        }
        if(typeof window.portalLeadTeamShiftDayDismissKey !== 'function'
          || typeof portalQuickMenuLoadDismissedOverrideKeys !== 'function') return false;
        const key = window.portalLeadTeamShiftDayDismissKey(iso);
        if(!key) return false;
        return portalQuickMenuLoadDismissedOverrideKeys().indexOf(key) >= 0;
      }catch(_){
        return false;
      }
    }
    function portalRefreshPendingOverrideDaysCache(){
      const byIso = Object.create(null);
      const dismissed = Object.create(null);
      try{
        const dk = typeof portalQuickMenuLoadDismissedOverrideKeys === 'function' ? portalQuickMenuLoadDismissedOverrideKeys() : [];
        for(let d = 0; d < dk.length; d++) dismissed[dk[d]] = true;
      }catch(_){}
      function mergePack(into, add){
        if(!into || !add) return;
        if(add.hasNewShift) into.hasNewShift = true;
        if(add.hasUpdated) into.hasUpdated = true;
        if(add.hasShadowing) into.hasShadowing = true;
        if(add.hasTraining) into.hasTraining = true;
        if(add.hasMeeting) into.hasMeeting = true;
      }
      function packFromRow(row){
        const pack = { hasNewShift: false, hasUpdated: false, hasShadowing: false, hasTraining: false, hasMeeting: false };
        const t = String(row && row.override_type || '').trim();
        const P = window.PortalParticipantsSheet;
        if(t === 'session_add'){
          const kind = String(row.payload && row.payload.kind || '').trim().toLowerCase();
          if(kind === 'shadowing') pack.hasShadowing = true;
          else if(kind === 'training') pack.hasTraining = true;
          else if(kind === 'meeting') pack.hasMeeting = true;
          else pack.hasUpdated = true;
        }else if(t === 'slot_update'){
          if(P && typeof P.overrideIsNewShiftDayUpdate === 'function' && P.overrideIsNewShiftDayUpdate(row)){
            pack.hasNewShift = true;
            pack.hasUpdated = true;
          }else{
            pack.hasUpdated = true;
          }
        }else if(t === 'instructor_reassign'){
          if(portalStaffIsProgrammeLead()){
            if(typeof portalOverrideIsInstructorCoverForLoggedInStaff === 'function'
              && portalOverrideIsInstructorCoverForLoggedInStaff(row)){
              pack.hasNewShift = true;
            }
          }else{
            if(typeof portalOverrideIsInstructorCoverForLoggedInStaff === 'function'
              && portalOverrideIsInstructorCoverForLoggedInStaff(row)){
              pack.hasNewShift = true;
            }
            pack.hasUpdated = true;
          }
        }else if(t === 'client_replace_in_slot' || t === 'client_absence_announced'
          || t === 'slot_close' || t === 'slot_open' || t === 'slot_clear_client'){
          pack.hasUpdated = true;
        }
        return pack;
      }
      try{
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(today) : '';
        const rows = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
        for(let ri = 0; ri < rows.length; ri++){
          const row = rows[ri];
          if(!row || !portalScheduleOverrideRowAppliesToLoggedInStaff(row)) continue;
          if(String(row.status || 'active') !== 'active') continue;
          const iso = normaliseIsoDate(row.session_date);
          if(!iso || (todayStr && iso < todayStr)) continue;
          const dismissKey = typeof portalScheduleOverrideRowDismissKey === 'function'
            ? portalScheduleOverrideRowDismissKey(row)
            : '';
          if(dismissKey && dismissed[dismissKey]) continue;
          const P = window.PortalParticipantsSheet;
          if(P && typeof P.scheduleOverrideAttentionDismissKey === 'function'){
            const altDismiss = P.scheduleOverrideAttentionDismissKey(row);
            if(altDismiss && dismissed[altDismiss]) continue;
          }
          const pack = byIso[iso] || {
            hasNewShift: false,
            hasUpdated: false,
            hasShadowing: false,
            hasTraining: false,
            hasMeeting: false
          };
          mergePack(pack, packFromRow(row));
          byIso[iso] = pack;
        }
      }catch(_scan){}
      try{
        const att = typeof portalStaffRosterOverrideAttentionState === 'function'
          ? portalStaffRosterOverrideAttentionState()
          : null;
        const groups = att && Array.isArray(att.rosterOverrideDayGroups) ? att.rosterOverrideDayGroups : [];
        for(let g = 0; g < groups.length; g++){
          const grp = groups[g];
          const iso = normaliseIsoDate(grp && grp.iso);
          if(!iso) continue;
          const pack = byIso[iso] || {
            hasNewShift: false,
            hasUpdated: false,
            hasShadowing: false,
            hasTraining: false,
            hasMeeting: false
          };
          const items = Array.isArray(grp.items) ? grp.items : [];
          for(let i = 0; i < items.length; i++){
            const k = String(items[i] && items[i].kind || '').trim();
            if(k === 'new_shift' || k === 'roster_day'){
              pack.hasNewShift = true;
              pack.hasUpdated = true;
            }else if(k === 'shadowing'){
              pack.hasShadowing = true;
            }else if(k === 'training'){
              pack.hasTraining = true;
            }else if(k === 'meeting'){
              pack.hasMeeting = true;
            }else if(k === 'other' || k === 'absent' || k === 'makeup' || k === 'trial' || k === 'cancelled' || k === 'shift_cancelled' || k === 'client_moved' || k === 'reverted' || k === 'slot_opened'){
              pack.hasUpdated = true;
            }
          }
          byIso[iso] = pack;
        }
      }catch(_){}
      if(portalStaffIsProgrammeLead()){
        Object.keys(byIso).forEach(function(iso){
          if(portalLeadTeamShiftDayWasDismissed(iso)) delete byIso[iso];
        });
      }
      try{ window.__PORTAL_PENDING_OVERRIDE_DAYS__ = byIso; }catch(_e){}
      return byIso;
    }
    function portalPendingOverrideFlagsForDate(isoYmd){
      const iso = normaliseIsoDate(isoYmd);
      if(!iso) return null;
      const map = window.__PORTAL_PENDING_OVERRIDE_DAYS__;
      if(!map || typeof map !== 'object'){
        portalRefreshPendingOverrideDaysCache();
      }
      const pack = window.__PORTAL_PENDING_OVERRIDE_DAYS__ && window.__PORTAL_PENDING_OVERRIDE_DAYS__[iso];
      return pack || null;
    }
    function portalPendingOverrideDaysSignature(){
      try{
        const map = window.__PORTAL_PENDING_OVERRIDE_DAYS__ || portalRefreshPendingOverrideDaysCache();
        return Object.keys(map).sort().map(function(iso){
          const p = map[iso] || {};
          return iso + ':' + (p.hasNewShift ? 'n' : '') + (p.hasUpdated ? 'u' : '') + (p.hasShadowing ? 's' : '') + (p.hasTraining ? 't' : '') + (p.hasMeeting ? 'm' : '');
        }).join(';');
      }catch(_){
        return '';
      }
    }
    function portalRefreshScheduleOverrideDayChrome(opts){
      opts = opts && typeof opts === 'object' ? opts : {};
      if(window.__PORTAL_OVERRIDE_DAY_CHROME_BUSY__) return;
      portalRefreshPendingOverrideDaysCache();
      const sig = portalPendingOverrideDaysSignature();
      const prev = window.__PORTAL_OVERRIDE_DAY_CHROME_SIG__ || '';
      if(sig === prev && !opts.force) return;
      try{ window.__PORTAL_OVERRIDE_DAY_CHROME_BUSY__ = true; }catch(_){}
      try{ window.__PORTAL_OVERRIDE_DAY_CHROME_SIG__ = sig; }catch(_){}
      try{
        const wl = document.getElementById('weekList');
        if(wl && typeof renderWeekRowHtml === 'function'){
          wl.innerHTML = (dashboardData.week || []).map(renderWeekRowHtml).join('');
        }
        const termOpen = !!(document.getElementById('termSheet') && document.getElementById('termSheet').classList.contains('open'));
        if(typeof renderTermCalendarGrid === 'function'){
          renderTermCalendarGrid(termOpen || opts.forceTerm ? { force: true } : {});
        }
        if(typeof renderMiniCounts === 'function') renderMiniCounts();
      }finally{
        try{ window.__PORTAL_OVERRIDE_DAY_CHROME_BUSY__ = false; }catch(_){}
      }
    }
    try{
      window.portalRefreshPendingOverrideDaysCache = portalRefreshPendingOverrideDaysCache;
      window.portalPendingOverrideDaysSignature = portalPendingOverrideDaysSignature;
      window.portalRefreshScheduleOverrideDayChrome = portalRefreshScheduleOverrideDayChrome;
    }catch(_ex){}
    /** Pulse class for term-calendar days OFF the staff base rota that still have a pending override (shadowing / new shift / change). */
    function portalTermOverridePulseClassFromDayFlags(flags){
      if(!flags) return '';
      if(flags.hasTraining) return 'term-cal-day--ov-pulse-training';
      if(flags.hasShadowing) return 'term-cal-day--ov-pulse-shadowing';
      if(flags.hasNewShift || flags.hasUpdated || flags.hasMakeUp || flags.hasTrial
        || flags.hasAbsentAnnounced || flags.hasCancelled || flags.hasMeeting
        || flags.hasShadowingHost){
        return 'term-cal-day--ov-pulse-admin-shift';
      }
      return '';
    }
    function portalTermWorkedDayOverridePulseClass(dayFlags, adminScheduleAdjusted){
      const fromFlags = portalTermOverridePulseClassFromDayFlags(dayFlags);
      if(fromFlags) return fromFlags;
      if(adminScheduleAdjusted) return 'term-cal-day--ov-pulse-admin-shift';
      return '';
    }
    function portalTermOverridePulseClassForNonWorkedDay(isoKey, adminScheduleAdjusted, dayWord){
      let flags = null;
      try{
        flags = typeof portalDayOverrideBadgeFlags === 'function'
          ? portalDayOverrideBadgeFlags(String(dayWord || '').trim(), isoKey)
          : null;
      }catch(_){ flags = null; }
      const fromFlags = portalTermOverridePulseClassFromDayFlags(flags);
      if(fromFlags) return fromFlags;
      let pend = null;
      try{
        pend = typeof portalPendingOverrideFlagsForDate === 'function'
          ? portalPendingOverrideFlagsForDate(isoKey)
          : null;
      }catch(_){ pend = null; }
      if(pend) return portalTermOverridePulseClassFromDayFlags(pend);
      return adminScheduleAdjusted ? 'term-cal-day--ov-pulse-admin-shift' : '';
    }
    function portalDayOverrideBadgeFlags(dayName, sessionDateIso){
      const out = { hasMakeUp: false, hasTrial: false, hasAbsentAnnounced: false, hasCancelled: false, hasUpdated: false, hasNewShift: false, hasTraining: false, hasShadowing: false, hasMeeting: false, hasShadowingHost: false, shadowingHostLabels: [] };
      try{
        const sid = String(
          (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
          || STAFF_DASHBOARD_ID
          || ''
        ).trim().toLowerCase();
        const d = String(dayName || '').trim();
        const iso = String(sessionDateIso || '').trim();
        if(!sid || !d || !iso) return out;
        const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
        const isReal = function(s){
          if(baseReal) return baseReal(s, iso);
          const st = String(s.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(s.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const sessions = typeof portalBaseClientSessionsForCalendarDate === 'function'
          ? portalBaseClientSessionsForCalendarDate(d, iso, sid, isReal)
          : [];
        for(let i = 0; i < sessions.length; i++){
          const s = sessions[i];
          if(!s) continue;
          const baseSession = s.__portalBaseSession || s;
          const manualOv = String(baseSession.override || '').trim().toUpperCase();
          if(manualOv === 'REPLACED') out.hasMakeUp = true;
          const ov = typeof portalTodayScheduleOverrideForSession === 'function' ? portalTodayScheduleOverrideForSession(baseSession, iso) : null;
          const t = String(ov && ov.override_type || '').trim();
          if(t === 'client_replace_in_slot'){
            if(portalOverrideIsTrial(ov)) out.hasTrial = true;
            else out.hasMakeUp = true;
          }
          if(t === 'client_absence_announced') out.hasAbsentAnnounced = true;
          if(t === 'slot_clear_client'){
            if(ov && ov.payload && ov.payload.cancelled_by_admin
              && !(typeof portalStaffHasRequestedTimeOffOnDate === 'function'
                && portalStaffHasRequestedTimeOffOnDate(iso, sid))){
              out.hasCancelled = true;
            }else{
              out.hasUpdated = true;
            }
          }
          if(t === 'slot_close') out.hasUpdated = true;
          if(t === 'slot_update'){
            const P = window.PortalParticipantsSheet;
            if(P && typeof P.overrideIsNewShiftDayUpdate === 'function' && P.overrideIsNewShiftDayUpdate(ov)){
              out.hasNewShift = true;
              out.hasUpdated = true;
            }else if(!P || typeof P.overrideIsTermNewParticipant !== 'function' || !P.overrideIsTermNewParticipant(ov)
              || (typeof P.overrideShouldShowOnCalendarDate === 'function' && P.overrideShouldShowOnCalendarDate(ov, iso))){
              out.hasUpdated = true;
            }
          }
          if(typeof portalSessionRosterTimeWasUpdated === 'function' && portalSessionRosterTimeWasUpdated(baseSession, iso)) out.hasUpdated = true;
          if(out.hasMakeUp && out.hasTrial && out.hasAbsentAnnounced && out.hasCancelled && out.hasUpdated) break;
        }
        (typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : []).forEach(function(ov){
          if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(iso)) return;
          if(String(ov.status || 'active') !== 'active') return;
          if(String(ov.anchor_staff_id || '').trim().toLowerCase() !== sid) return;
          const t = String(ov.override_type || '').trim();
          if(t === 'slot_update' || t === 'slot_close') out.hasUpdated = true;
          if(t === 'instructor_reassign'){
            if(portalStaffIsProgrammeLead()){
              if(typeof portalOverrideIsInstructorCoverForLoggedInStaff === 'function'
                && portalOverrideIsInstructorCoverForLoggedInStaff(ov)){
                out.hasNewShift = true;
              }
            }else{
              out.hasUpdated = true;
              if(typeof portalOverrideIsInstructorCoverForLoggedInStaff === 'function'
                && portalOverrideIsInstructorCoverForLoggedInStaff(ov)){
                out.hasNewShift = true;
              }
            }
          }
          if(t === 'slot_clear_client' && !(ov.payload && ov.payload.cancelled_by_admin)) out.hasUpdated = true;
          const P = window.PortalParticipantsSheet;
          if(t === 'slot_update' && P && typeof P.overrideIsNewShiftDayUpdate === 'function' && P.overrideIsNewShiftDayUpdate(ov)){
            out.hasNewShift = true;
            out.hasUpdated = true;
          }
        });
        const normStaffKeyOv = function(v){ return String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); };
        const sidNormOv = normStaffKeyOv(sid);
        (typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : []).forEach(function(ov){
          if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(iso)) return;
          if(String(ov.status || 'active') !== 'active') return;
          if(ov.override_type !== 'session_add') return;
          if(normStaffKeyOv(ov.anchor_staff_id) !== sidNormOv) return;
          const kind = String(ov.payload && ov.payload.kind || '').trim().toLowerCase();
          if(kind === 'training') out.hasTraining = true;
          else if(kind === 'shadowing') out.hasShadowing = true;
          else if(kind === 'meeting') out.hasMeeting = true;
        });
        const hostLabels = typeof portalShadowingHostLabelsForDay === 'function'
          ? portalShadowingHostLabelsForDay(iso, sid, dashboardData && dashboardData.staffName)
          : [];
        if(hostLabels.length){
          out.hasShadowingHost = true;
          out.shadowingHostLabels = hostLabels;
        }
        if(!out.hasUpdated && portalStaffAdminUpdatedOnDate(iso, sid)) out.hasUpdated = true;
        const pending = portalPendingOverrideFlagsForDate(iso);
        if(pending){
          if(pending.hasNewShift){
            out.hasNewShift = true;
            out.hasUpdated = true;
          }
          if(pending.hasUpdated) out.hasUpdated = true;
          if(pending.hasShadowing) out.hasShadowing = true;
          if(pending.hasTraining) out.hasTraining = true;
          if(pending.hasMeeting) out.hasMeeting = true;
        }
        if(portalStaffIsProgrammeLead() && portalLeadTeamShiftDayWasDismissed(iso)){
          out.hasMakeUp = false;
          out.hasTrial = false;
          out.hasAbsentAnnounced = false;
          out.hasCancelled = false;
          out.hasUpdated = false;
          out.hasNewShift = false;
          out.hasTraining = false;
          out.hasShadowing = false;
          out.hasMeeting = false;
          out.hasShadowingHost = false;
          out.shadowingHostLabels = [];
        }
      }catch(_){ }
      return out;
    }
    /** Term grid: override hints are cell-level glow/pulse only — no text chips inside date squares. */
    function portalTermBadgeHtmlForFlags(_flags){
      return '';
    }
    function portalFutureOverrideMetaForDate(sessionDateIso, staffId){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sessionDateIso || !sid) return null;
      const rows = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
      let best = null;
      const scoreForType = function(t){
        if(t === 'client_replace_in_slot') return 30;
        if(t === 'client_absence_announced') return 20;
        if(t === 'instructor_reassign') return 20;
        if(t === 'slot_open') return 18;
        if(t === 'slot_close') return 20;
        if(t === 'slot_clear_client') return 10;
        return 0;
      };
      rows.forEach(function(ov){
        if(!ov) return;
        if(String(ov.status || 'active') !== 'active') return;
        if(normaliseIsoDate(ov.session_date) !== normaliseIsoDate(sessionDateIso)) return;
        const t = String(ov.override_type || '').trim();
        const tEff = (t === 'slot_clear_client' && ov.payload && ov.payload.cancelled_by_admin) ? 'slot_clear_client_cancelled' : t;
        if(!tEff || tEff === 'override_void') return;
        const anchorSid = String(ov.anchor_staff_id || '').trim().toLowerCase();
        const coverSid = String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase();
        const applies = tEff === 'instructor_reassign'
          ? (anchorSid === sid || coverSid === sid)
          : (anchorSid === sid);
        if(!applies) return;
        const sc = scoreForType(tEff === 'slot_clear_client_cancelled' ? 'slot_close' : tEff);
        if(sc <= 0) return;
        if(!best || sc > best.score || (sc === best.score && new Date(ov.created_at || 0) > new Date(best.created_at || 0))){
          best = { score: sc, type: tEff, created_at: ov.created_at || null, ov: ov };
        }
      });
      if(!best) return null;
      if(best.type === 'slot_clear_client_cancelled'
        && typeof portalStaffHasRequestedTimeOffOnDate === 'function'
        && portalStaffHasRequestedTimeOffOnDate(sessionDateIso, sid)){
        return null;
      }
      if(best.type === 'client_replace_in_slot'){
        if(portalOverrideIsTrial(best.ov)){
          return { tone: 'trial', label: 'Trial', priority: 3, type: best.type };
        }
        return { tone: 'pink', label: 'Make Up', priority: 3, type: best.type };
      }
      if(best.type === 'slot_clear_client'){
        return { tone: 'clear', label: 'NO PARTICIPANT', priority: 1, type: best.type };
      }
      if(best.type === 'slot_clear_client_cancelled'){
        return { tone: 'admin', label: 'Cancelled', priority: 2, type: best.type };
      }
      if(best.type === 'client_absence_announced'){
        return { tone: 'admin', label: 'Absent notified', priority: 2, type: best.type };
      }
      if(best.type === 'instructor_reassign'){
        return { tone: 'admin', label: 'Staff cover', priority: 2, type: best.type };
      }
      if(best.type === 'slot_open'){
        return { tone: 'admin', label: 'Slot reopened', priority: 2, type: best.type };
      }
      if(best.type === 'slot_close'){
        return { tone: 'admin', label: 'Closed', priority: 2, type: best.type };
      }
      return null;
    }
    /** Company-wide closed day (term break, bank holiday, half-term) — applies to everyone, not just one staff rota. */
    function portalWeekDayCompanyClosed(dayName){
      const cell = calendarDateForWeekListDay(dayName);
      if(!cell) return false;
      const halfWeeks = Array.isArray(dashboardData.termHalfTermWeekStarts) ? dashboardData.termHalfTermWeekStarts : [];
      return typeof isHalfTermDay === 'function'
        && isHalfTermDay(cell.getFullYear(), cell.getMonth(), cell.getDate(), halfWeeks);
    }
    function weekRowVisualKind(item){
      if(typeof portalWeekDayCompanyClosed === 'function' && portalWeekDayCompanyClosed(item.day)){
        return 'closed';
      }
      const rel = weekListDayRelationToToday(item.day);
      const cell = calendarDateForWeekListDay(item.day);
      const iso = cell ? portalIsoYmdFromDate(cell) : '';
      const sid = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const offRequested = iso && typeof portalStaffDayOffIsTimeOffRequested === 'function'
        && portalStaffDayOffIsTimeOffRequested(iso, sid);
      if(typeof portalWeekListDayIsOff === 'function' && portalWeekListDayIsOff(item.day, sid)){
        return offRequested ? 'off-requested' : 'off';
      }
      const dayFlags = portalDayOverrideBadgeFlags(item.day, iso);
      if(weekRowTotalClients(item) <= 0){
        // Paid cancellation: the client's session was cancelled by admin but the staff
        // is still paid (and rostered). Show a green "worked" row + the Cancelled chip
        // instead of a red day off. A genuine unavailability day already returned above.
        if(dayFlags.hasCancelled) return rel === 'past' ? 'work-done' : 'work';
        return offRequested ? 'off-requested' : 'off';
      }
      if(weekListHasPendingFeedbackForDay(item.day)) return 'work-feedback';
      if(dayFlags.hasMakeUp) return 'work-ov-pink';
      if(rel === 'past') return 'work-done';
      const sessions = weekListClientSessionsForDay(item.day);
      if(sessions.length && !weekListHasNotEndedClientSession(item.day)) return 'work-done';
      if(weekListClientSessionsForDay(item.day).length === 0) return 'work';
      if(weekListHasNotEndedClientSession(item.day)) return 'work';
      return 'work-done';
    }

    function weekSegmentUnitLabel(count){
      return count === 1 ? 'Session' : 'Sessions';
    }

    /** Label after count in “This week” rows (no trailing “Session(s)” for known programmes). */
    function weekActivityDisplayPhrase(serviceLabel, count){
      const lab = String(serviceLabel || '').trim();
      const c = Math.max(0, Number(count) || 0);
      if(!lab) return weekSegmentUnitLabel(c);
      if(lab === 'Climbing Activity' && c !== 1) return 'Climbing Activities';
      return lab;
    }

    function weekVenuePlaceHtml(venue){
      const t = String(venue || '').trim();
      if(!t) return '—';
      return '(' + escapeHtml(t.toUpperCase()) + ')';
    }

    function renderWeekRowHtml(item){
      const day = String(item.day || '').trim() || '—';
      const abbr = escapeHtml(WEEK_DAY_ICON_ABBR[day] || day.slice(0, 2));
      if(typeof portalWeekDayCompanyClosed === 'function' && portalWeekDayCompanyClosed(day)){
        const ariaClosed = escapeHtml(`${day}: Closed — club closed for everyone`);
        return `<div class="calendar-day calendar-day--week-row calendar-day--week-row--closed" aria-label="${ariaClosed}"><span class="week-day-icon" aria-hidden="true">${abbr}</span><div class="week-row-detail"><span class="week-venue-seg week-venue-seg--closed">Closed</span></div></div>`;
      }
      const segments = normalizeWeekRowSegments(item);
      const parts = [];
      const ariaBits = [];
      const cell = calendarDateForWeekListDay(day);
      const iso = cell ? portalIsoYmdFromDate(cell) : '';
      const weekRowSid = String(
        (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
        || STAFF_DASHBOARD_ID
        || ''
      ).trim().toLowerCase();
      const isOffRequested = iso && typeof portalStaffDayOffIsTimeOffRequested === 'function'
        && portalStaffDayOffIsTimeOffRequested(iso, weekRowSid);
      const offEmptyLabel = isOffRequested ? 'Off · requested' : 'Off';
      const offAriaLabel = isOffRequested ? 'off, time off requested' : 'off';
      const dayFlags = portalDayOverrideBadgeFlags(day, iso);
      segments.forEach((seg, i) => {
        if(seg.count <= 0){
          if(i === 0 && segments.length === 1){
            parts.push('<span class="week-venue-seg week-venue-seg--empty">' + offEmptyLabel + '</span>');
            ariaBits.push(offAriaLabel);
          }
          return;
        }
        const svc = String(seg.serviceLabel || '').trim();
        const unitPhrase = escapeHtml(weekActivityDisplayPhrase(svc, seg.count));
        const place = weekVenuePlaceHtml(seg.venue);
        parts.push(
          `<span class="week-venue-seg"><span class="week-venue-count">${seg.count}</span> <span class="week-venue-unit">${unitPhrase}</span> <span class="week-venue-place">${place}</span></span>`
        );
        const ariaVenue = seg.venue ? '(' + String(seg.venue).trim().toUpperCase() + ')' : '—';
        const ariaPhrase = weekActivityDisplayPhrase(svc, seg.count);
        ariaBits.push(`${seg.count} ${ariaPhrase} ${ariaVenue}`);
      });
      if(!parts.length){
        parts.push('<span class="week-venue-seg week-venue-seg--empty">' + offEmptyLabel + '</span>');
        ariaBits.push(offAriaLabel);
      }
      const tone = weekRowVisualKind(item);
      const weekStaffId = String(
        (typeof portalAuthStaffRosterId === 'function' ? portalAuthStaffRosterId() : '')
        || STAFF_DASHBOARD_ID
        || ''
      ).trim().toLowerCase();
      const dayUpdated = dayFlags.hasUpdated || dayFlags.hasNewShift
        || (iso && typeof portalStaffAdminUpdatedOnDate === 'function' && portalStaffAdminUpdatedOnDate(iso, weekStaffId));
      if(dayFlags.hasMakeUp || dayFlags.hasTrial || dayFlags.hasAbsentAnnounced || dayFlags.hasCancelled || dayUpdated || dayFlags.hasTraining || dayFlags.hasShadowing || dayFlags.hasMeeting){
        const badgeParts = [];
        if(dayFlags.hasTrial){
          badgeParts.push('<span class="week-override-tag week-override-tag--trial">' + escapeHtml('Trial') + '</span>');
          ariaBits.push('Trial');
        }
        if(dayFlags.hasMakeUp){
          badgeParts.push('<span class="week-override-tag week-override-tag--pink">' + escapeHtml('Make Up') + '</span>');
          ariaBits.push('Make Up');
        }
        if(dayUpdated){
          badgeParts.push('<span class="week-override-tag week-override-tag--updated">' + escapeHtml('Updated') + '</span>');
          ariaBits.push('Updated');
        }
        if(dayFlags.hasTraining){
          badgeParts.push('<span class="week-override-tag week-override-tag--training">' + escapeHtml('Training') + '</span>');
          ariaBits.push('Training');
        }
        if(dayFlags.hasShadowing){
          badgeParts.push('<span class="week-override-tag week-override-tag--shadowing">' + escapeHtml('Shadowing') + '</span>');
          ariaBits.push('Shadowing');
        }
        if(dayFlags.hasMeeting){
          badgeParts.push('<span class="week-override-tag week-override-tag--meeting">' + escapeHtml('Meeting') + '</span>');
          ariaBits.push('Meeting');
        }
        if(dayFlags.hasAbsentAnnounced){
          badgeParts.push('<span class="week-override-tag week-override-tag--absents">' + escapeHtml('Absents') + '</span>');
          ariaBits.push('Absents');
        }
        if(dayFlags.hasCancelled){
          badgeParts.push('<span class="week-override-tag week-override-tag--cancelled">' + escapeHtml('Cancelled') + '</span>');
          ariaBits.push('Cancelled');
        }
        parts.push('<span class="week-override-badges-row">' + badgeParts.join('') + '</span>');
      }
      const ariaExtra = tone === 'work-feedback' ? ' — session feedback still needed' : '';
      const aria = escapeHtml(`${day}: ${ariaBits.join(', ')}${ariaExtra}`);
      const tc = weekRowTotalClients(item);
      const weekGo = tc > 0
        ? ' role="button" tabindex="0" data-action="week-review-day" data-week-day="' + escapeHtml(day) + '"'
          + (iso ? ' data-week-iso="' + escapeHtml(iso) + '"' : '')
        : '';
      const updatedPulseCls = dayUpdated ? ' calendar-day--week-row--updated-pulse' : '';
      return `<div class="calendar-day calendar-day--week-row calendar-day--week-row--${tone}${updatedPulseCls}"${weekGo} aria-label="${aria}"><span class="week-day-icon" aria-hidden="true">${abbr}</span><div class="week-row-detail">${parts.join('')}</div></div>`;
    }

    function portalNextSessionMiniCardPulseIso(rows){
      try{
        const preview = typeof dashboardData !== 'undefined' ? dashboardData && dashboardData.portalTodayNextSessionPreview : null;
        if(preview && preview.iso) return String(preview.iso).trim().slice(0, 10);
        const ns = typeof dashboardData !== 'undefined' ? dashboardData && dashboardData.nextSessionCalendarDate : null;
        if(ns && typeof portalIsoYmdFromDate === 'function'){
          const fromDate = ns instanceof Date ? ns : null;
          if(fromDate && !isNaN(fromDate.getTime())) return portalIsoYmdFromDate(fromDate);
        }
      }catch(_){}
      return '';
    }
    try{ window.portalNextSessionMiniCardPulseIso = portalNextSessionMiniCardPulseIso; }catch(_){}
    function renderMiniCounts(){
      const tomorrowCard = document.querySelector('.section-card--overview .mini-card[data-open="tomorrowSheet"]');
      const weekCard = document.querySelector('.section-card--overview .mini-card[data-open="weekSheet"]');
      if(tomorrowCard){
        const c = formatClientCount(dashboardData.tomorrow.length);
        tomorrowCard.setAttribute('aria-label', 'Open next session list — ' + c);
        const nextRows = Array.isArray(dashboardData.tomorrow) ? dashboardData.tomorrow : [];
        if(typeof portalApplyNextSessionMiniCardPulse === 'function'){
          portalApplyNextSessionMiniCardPulse(tomorrowCard, nextRows);
        }
      }
      const termCard = document.querySelector('.section-card--overview .mini-card[data-open="termSheet"]');
      if(termCard && typeof portalApplyTermMiniCardPulse === 'function'){
        portalApplyTermMiniCardPulse(termCard, null);
      }
      if(weekCard){
        const weekTotal = dashboardData.week.reduce((acc, day) => acc + weekRowTotalClients(day), 0);
        weekCard.setAttribute('aria-label', 'Open this week’s sessions by day — ' + formatClientCount(weekTotal));
      }
    }

    function renderTomorrowSheetTitle(){
      const h = document.getElementById('tomorrowSheetTitle');
      if(h) h.textContent = formatNextSessionSheetTitle();
    }
    function formatWeekCommencingTitle(){
      const mon = mondayStartOfWeekLocal(new Date());
      const num = typeof portalFormatPortalDateDdMmYyyy === 'function' ? portalFormatPortalDateDdMmYyyy(mon) : '';
      return num ? `Week (${num})` : 'This week';
    }
    function renderWeekSheetTitle(){
      const caption = formatWeekCommencingTitle();
      const h = document.querySelector('#weekSheet h3');
      if(h) h.textContent = caption;
      const mini = document.querySelector('.mini-card[data-open="weekSheet"] .title');
      if(mini) mini.textContent = caption;
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
    function portalTermBreakIsoRange(){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const from = String((t && t.termBreakFrom) || '2026-05-23').trim().slice(0, 10);
      const to = String((t && t.termBreakTo) || '2026-05-31').trim().slice(0, 10);
      return { from, to };
    }
    function portalTermClosedDates(){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const raw = t && t.termClosedDates;
      if(!Array.isArray(raw)) return [];
      return raw.map(function(d){ return String(d || '').trim().slice(0, 10); }).filter(Boolean);
    }
    function portalTermStaffForcedCompleteDates(staffId){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffFeedbackCompleteDatesByProfileKey;
      const id = String(staffId || '').trim().toLowerCase();
      const raw = map && map[id];
      if(!Array.isArray(raw)) return [];
      return raw.map(function(d){ return String(d || '').trim().slice(0, 10); }).filter(Boolean);
    }
    /** Admin-flagged outstanding days: force orange even when assume-complete-through would green them. */
    function portalTermStaffForcedPendingDates(staffId){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffTimesheetFeedbackPendingDatesByProfileKey;
      const id = String(staffId || '').trim().toLowerCase();
      const raw = map && map[id];
      if(!Array.isArray(raw)) return [];
      return raw.map(function(d){ return String(d || '').trim().slice(0, 10); }).filter(Boolean);
    }
    function portalTermStaffDayExplicitlyPending(isoYmd, staffId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      return portalTermStaffForcedPendingDates(staffId).indexOf(iso) >= 0;
    }
    function portalRosterRowAppliesToStaffId(row, staffId){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sid || !row) return false;
      const raw = String(row.instructors || '');
      const parts = raw.split(/[,/&]|\band\b/gi);
      for(let i = 0; i < parts.length; i++){
        const tok = String(parts[i] || '').trim().toLowerCase();
        if(!tok) continue;
        const first = tok.split(/\s+/)[0] || tok;
        if(first === sid || tok === sid) return true;
        if((sid === 'lulia' || sid === 'luliya' || sid === 'aida') && (first === 'lulia' || first === 'luliya' || first === 'aida')) return true;
      }
      return String(raw || '').trim().toLowerCase() === sid;
    }
    function portalTermStaffExtraCalendarDates(staffId){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffExtraCalendarDatesByProfileKey;
      const keys = typeof portalTermStaffProfileLookupKeys === 'function'
        ? portalTermStaffProfileLookupKeys(staffId)
        : [String(staffId || '').trim().toLowerCase()];
      const extra = new Set();
      keys.forEach(function(k){
        const raw = map && map[k];
        (Array.isArray(raw) ? raw : []).forEach(function(d){
          const iso = String(d || '').trim().slice(0, 10);
          if(iso) extra.add(iso);
        });
      });
      const shiftDates = portalTermStaffShiftDatesFor(staffId);
      const shiftSet = shiftDates ? new Set(shiftDates) : null;
      const cache = Array.isArray(window.PORTAL_ROSTER_ROWS_CACHE) ? window.PORTAL_ROSTER_ROWS_CACHE : [];
      keys.forEach(function(id){
        cache.forEach(function(row){
          if(String(row.status || 'active') !== 'active') return;
          if(!portalRosterRowAppliesToStaffId(row, id)) return;
          const nm = String(row.client_name || '').trim().toLowerCase();
          if(!nm || nm === 'no client' || nm === 'closed') return;
          const iso = normaliseIsoDate(row.session_date);
          if(!iso) return;
          if(shiftSet && shiftSet.has(iso)) return;
          extra.add(iso);
        });
      });
      return Array.from(extra).sort();
    }
    function portalTermStaffCatchUpFeedbackDates(staffId){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffCatchUpFeedbackDatesByProfileKey;
      const id = String(staffId || '').trim().toLowerCase();
      const raw = map && map[id];
      if(!Array.isArray(raw)) return [];
      return raw.map(function(d){ return String(d || '').trim().slice(0, 10); }).filter(Boolean);
    }
    function portalTermCatchUpClientMarkedDone(isoYmd, staffId, clientId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      const cid = String(clientId || '').trim().toLowerCase();
      if(!iso || !sid || !cid) return false;
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffCatchUpFeedbackDoneClientsByDateByProfileKey;
      const dayMap = map && map[sid];
      const raw = dayMap && dayMap[iso];
      if(!Array.isArray(raw)) return false;
      return raw.some(function(c){ return String(c || '').trim().toLowerCase() === cid; });
    }
    function portalTermStaffLateSubmissionBypass(staffId){
      const id = String(staffId || '').trim().toLowerCase();
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const list = t && t.termStaffLateSubmissionBypassProfileKeys;
      if(!Array.isArray(list) || !id) return false;
      return list.some(function(k){ return String(k || '').trim().toLowerCase() === id; });
    }
    function portalTermIsCatchUpFeedbackDate(isoYmd, staffId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      return portalTermStaffLateSubmissionBypass(staffId)
        && portalTermStaffCatchUpFeedbackDates(staffId).indexOf(iso) >= 0;
    }
    function portalClearMachineRosterCrossInstructorReviewFlags(staffId){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sid) return false;
      const floor = portalMachineRosterFeedbackFloorIso();
      let changed = false;
      Object.keys(sessionReviewMapMemory || {}).forEach(function(sk){
        const iso = String(sk || '').split('|')[0];
        if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < floor) return;
        const prev = sessionReviewMapMemory[sk];
        if(prev && prev.feedbackDone && !prev.incident && !prev.absent && !prev.cancelled){
          sessionReviewMapMemory[sk] = Object.assign({}, prev, { feedbackDone: false });
          changed = true;
        }
      });
      if(changed && typeof persistSessionReviewMap === 'function') persistSessionReviewMap();
      return changed;
    }
    function portalClearCatchUpExportReviewFlags(staffId){
      const sid = String(staffId || '').trim().toLowerCase();
      if(!portalTermStaffLateSubmissionBypass(sid)) return false;
      const extras = portalTermStaffCatchUpFeedbackDates(sid);
      if(!extras.length) return false;
      let changed = false;
      extras.forEach(function(iso){
        if(portalTermStaffForcedCompleteDates(sid).indexOf(iso) >= 0) return;
        const dayWord = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
        const rel = typeof portalTermFeedbackSessionsForDate === 'function'
          ? portalTermFeedbackSessionsForDate(dayWord, iso, sid, function(s){
              const st = String(s.status || '').toLowerCase();
              if(st === 'closed' || st === 'available') return false;
              return Boolean(String(s.clientId || '').trim());
            })
          : [];
        rel.forEach(function(s){
          const cid = typeof portalEffectiveClientIdForReview === 'function'
            ? portalEffectiveClientIdForReview(s, iso)
            : String(s && s.clientId || '').trim().toLowerCase();
          if(portalTermCatchUpClientMarkedDone(iso, sid, cid)) return;
          const sk = typeof portalSessionReviewKeyForModelRow === 'function'
            ? portalSessionReviewKeyForModelRow(s, dayWord, iso)
            : '';
          if(!sk) return;
          const prev = sessionReviewMapMemory[sk];
          if(prev && prev.feedbackDone && !prev.incident && !prev.absent && !prev.cancelled){
            sessionReviewMapMemory[sk] = Object.assign({}, prev, { feedbackDone: false });
            changed = true;
          }
        });
      });
      if(changed && typeof persistSessionReviewMap === 'function') persistSessionReviewMap();
      return changed;
    }
    function portalTermStaffDayExplicitlyForceComplete(isoYmd, staffId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      return portalTermStaffForcedCompleteDates(staffId).indexOf(iso) >= 0;
    }
    function portalTermDateForcedComplete(isoYmd, staffId){
      return portalTermStaffDayExplicitlyForceComplete(isoYmd, staffId);
    }
    function portalTermStaffProfileLookupKeys(staffId){
      const id = String(staffId || '').trim().toLowerCase();
      if(!id) return [];
      const keys = [id];
      const canon = typeof portalCanonicalStaffKeyForMatch === 'function'
        ? portalCanonicalStaffKeyForMatch(id)
        : id;
      if(canon && keys.indexOf(canon) < 0) keys.push(canon);
      if(canon === 'lulia' || id === 'luliya' || id === 'lulia' || id === 'aida'){
        if(keys.indexOf('luliya') < 0) keys.push('luliya');
        if(keys.indexOf('lulia') < 0) keys.push('lulia');
      }
      return keys;
    }
    try{ window.portalTermStaffProfileLookupKeys = portalTermStaffProfileLookupKeys; }catch(_){}
    function portalTermStaffAwayDatesFor(staffId){
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const map = t && t.termStaffAwayDatesByProfileKey;
      if(!map || typeof map !== 'object') return [];
      const keys = typeof portalTermStaffProfileLookupKeys === 'function'
        ? portalTermStaffProfileLookupKeys(staffId)
        : [String(staffId || '').trim().toLowerCase()];
      const seen = Object.create(null);
      const out = [];
      keys.forEach(function(k){
        const raw = map[k];
        if(!Array.isArray(raw)) return;
        raw.forEach(function(d){
          const iso = String(d || '').trim().slice(0, 10);
          if(iso && !seen[iso]){ seen[iso] = true; out.push(iso); }
        });
      });
      // Union validated staff-requested days off from staff_unavailability
      // (self-read via RLS; populated when admin validates a Session Disruption
      // report). Only applies to the logged-in owner's own card so a lead viewing
      // a teammate never inherits the viewer's days off.
      try{
        const dbDates = window.__PORTAL_STAFF_AWAY_DATES_DB__;
        if(Array.isArray(dbDates) && dbDates.length){
          const ownerId = String(window.__PORTAL_STAFF_AWAY_OWNER_ID__ || '').trim().toLowerCase();
          const ownerKeys = ownerId
            ? (typeof portalTermStaffProfileLookupKeys === 'function'
                ? portalTermStaffProfileLookupKeys(ownerId)
                : [ownerId])
            : [];
          const isOwner = ownerKeys.some(function(k){ return keys.indexOf(k) >= 0; });
          if(isOwner){
            dbDates.forEach(function(d){
              const iso = String(d || '').trim().slice(0, 10);
              if(iso && !seen[iso]){ seen[iso] = true; out.push(iso); }
            });
          }
        }
      }catch(_dbAway){}
      return out.sort();
    }
    /** Day off / time off requested by staff (term timetable away list only — not admin overrides). */
    function portalStaffHasRequestedTimeOffOnDate(isoYmd, staffId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid) return false;
      return portalTermStaffAwayDatesFor(sid).indexOf(iso) >= 0;
    }
    /** Explicit staff away dates — show “Time Off Requested” copy and term pulse border. */
    function portalStaffDayOffIsTimeOffRequested(isoYmd, staffId){
      return portalStaffHasRequestedTimeOffOnDate(isoYmd, staffId);
    }
    /** Admin schedule change (override / shift removed) — not staff-requested time off. */
    function portalStaffTermAdminScheduleAdjustedOnDate(isoYmd, staffId){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid) return false;
      if(portalStaffAdminUpdatedOnDate(iso, sid)) return true;
      if(portalTermStaffAwayDatesFor(sid).indexOf(iso) >= 0) return false;
      return typeof portalTermStaffRemovedFromBaselineShiftOnDate === 'function'
        && portalTermStaffRemovedFromBaselineShiftOnDate(iso, sid);
    }
    function portalSessionUpdatedChipHtml(){
      return '<span class="portal-session-slot-chip portal-session-slot-chip--updated" aria-label="Updated by admin"><span>Updated by admin</span></span>';
    }
    function portalTermCalendarToIso(){
      const ptd = window.PortalTermCalendarDashboard;
      return String(
        (dashboardData && dashboardData.termDashboardCalendarTo)
          || (ptd && typeof ptd.toIso === 'function' && ptd.toIso())
          || (window.PORTAL_TERM_FROM_TIMETABLE && window.PORTAL_TERM_FROM_TIMETABLE.termDashboardCalendarTo)
          || '2026-07-17'
      ).trim().slice(0, 10);
    }
    /** Term grid red: after term end (e.g. Jul 18+), half-term, staff off, away / cover. */
    function portalTermCalendarDayIsRed(year, monthIndex, day, staffId, weekStartStrings){
      const iso = termCalendarDateKey(year, monthIndex, day);
      const sid = String(staffId || '').trim().toLowerCase();
      if(sid && typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
        && portalStaffHasInstructorCoverOnCalendarDate(iso, sid)){
        return false;
      }
      const extraRed = isHalfTermDay(year, monthIndex, day, weekStartStrings)
        || Boolean(staffId && portalTermStaffOffWeekdayOnDate(iso, staffId))
        || Boolean(staffId && portalTermStaffAwayOnDate(iso, staffId));
      const ptd = window.PortalTermCalendarDashboard;
      if(ptd && typeof ptd.dayIsRed === 'function'){
        const dt = new Date(year, monthIndex, day);
        let worked = [];
        if(Array.isArray(dashboardData.termWorkedWeekdays)){
          worked = dashboardData.termWorkedWeekdays.length
            ? dashboardData.termWorkedWeekdays.map(Number)
            : [];
        } else {
          worked = [1, 2, 4, 5];
        }
        const red = ptd.dayIsRed(iso, dt.getDay(), staffId, worked, extraRed);
        if(red) return true;
        if(staffId && worked.indexOf(dt.getDay()) >= 0 && typeof portalStaffRosterAppliesOnCalendarDate === 'function'){
          const dayWord = dt.toLocaleDateString('en-GB', { weekday: 'long' });
          if(!portalStaffRosterAppliesOnCalendarDate(iso, dayWord, staffId)){
            if(typeof portalTermExportCountsAsWorkedDay === 'function'
              && portalTermExportCountsAsWorkedDay(iso, staffId, dayWord)) return false;
            return true;
          }
        }
        return false;
      }
      const toIso = portalTermCalendarToIso();
      if(toIso && iso > toIso) return true;
      return extraRed;
    }
    function portalTermStaffAwayOnDate(iso, staffId){
      const key = String(iso || '').trim().slice(0, 10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
      if(portalTermStaffAwayDatesFor(staffId).indexOf(key) !== -1) return true;
      const sid = String(staffId || '').trim().toLowerCase();
      const dayWord = new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      const isReal = function(s){
        const st = String(s.status || '').toLowerCase();
        if(st === 'closed' || st === 'available') return false;
        const cid = String(s.clientId || '').toLowerCase();
        return Boolean(cid && cid !== 'closed' && cid !== 'available');
      };
      const modelRows = (sessionsModel || []).filter(function(s){
        if(String(s.staffId || '').toLowerCase() !== sid) return false;
        if(String(s.day || '').trim() !== dayWord) return false;
        if(!isReal(s)) return false;
        return typeof portalSessionSpreadsheetRowMatchesCalendarDate !== 'function'
          || portalSessionSpreadsheetRowMatchesCalendarDate(s, key, dayWord);
      });
      if(!modelRows.length) return false;
      return modelRows.every(function(s){
        const ov = typeof portalTodayScheduleOverrideForSession === 'function'
          ? portalTodayScheduleOverrideForSession(s, key)
          : null;
        const cov = ov && ov.override_type === 'instructor_reassign'
          ? String(ov.payload && ov.payload.covering_staff_id || '').trim().toLowerCase()
          : '';
        return Boolean(cov && cov !== sid);
      });
    }
    /** Original term shift removed (intense red) vs ad-hoc cover day off (normal red). */
    function portalTermStaffRemovedFromBaselineShiftOnDate(isoYmd, staffId){
      const ptd = window.PortalTermCalendarDashboard;
      if(!ptd || typeof ptd.staffRemovedFromBaselineShiftOnDate !== 'function') return false;
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid) return false;
      const halfWeeks = dashboardData.termHalfTermWeekStarts || [];
      return ptd.staffRemovedFromBaselineShiftOnDate(iso, sid, {
        rosterApplies: function(key, id){
          const dayWord = new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
          return typeof portalStaffRosterAppliesOnCalendarDate === 'function'
            && portalStaffRosterAppliesOnCalendarDate(key, dayWord, id);
        },
        hasInstructorCover: function(key, id){
          return typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
            && portalStaffHasInstructorCoverOnCalendarDate(key, id);
        },
        dayIsRed: function(key, id){
          const d = new Date(key + 'T12:00:00');
          return typeof portalTermCalendarDayIsRed === 'function'
            && portalTermCalendarDayIsRed(d.getFullYear(), d.getMonth(), d.getDate(), id, halfWeeks);
        }
      });
    }
    function portalComputeTermOverviewPulseFlags(staffId){
      const out = { baselineRemoved: false, outstanding: false, dayOff: false };
      const sid = String(staffId || '').trim().toLowerCase();
      if(!sid) return out;
      const y = Number(dashboardData.termCalendarYear) || new Date().getFullYear();
      const months = Array.isArray(dashboardData.termCalendarMonths) ? dashboardData.termCalendarMonths : [5, 6];
      const halfWeeks = dashboardData.termHalfTermWeekStarts || [];
      const firstDomMap = dashboardData.termCalendarFirstDom || {};
      const todayKey = portalTermLocalYmdFromMs(termCalendarNowMs());
      const ptd = window.PortalTermCalendarDashboard;
      months.forEach(function(monthIndex){
        const lastDay = new Date(y, monthIndex + 1, 0).getDate();
        let firstDom = 1;
        if(Object.prototype.hasOwnProperty.call(firstDomMap, monthIndex)){
          const fd = Math.floor(Number(firstDomMap[monthIndex]));
          if(Number.isFinite(fd) && fd > 1) firstDom = Math.min(fd, lastDay);
        }
        for(let day = firstDom; day <= lastDay; day++){
          const iso = termCalendarDateKey(y, monthIndex, day);
          if(ptd && typeof ptd.staffDateInView === 'function' && !ptd.staffDateInView(iso, sid)) continue;
          if(portalTermStaffAwayDatesFor(sid).indexOf(iso) >= 0){
            const hadBaseline = ptd && typeof ptd.staffHadBaselineShiftOnDate === 'function'
              && ptd.staffHadBaselineShiftOnDate(iso, sid);
            if(hadBaseline) out.baselineRemoved = true;
            else out.dayOff = true;
          }
          const fb = getTermFeedbackStateForDay(y, monthIndex, day);
          if(fb === 'late' && iso <= todayKey) out.outstanding = true;
        }
      });
      return out;
    }
    function isHalfTermDay(year, monthIndex, day, weekStartStrings){
      const iso = termCalendarDateKey(year, monthIndex, day);
      if(portalTermClosedDates().indexOf(iso) !== -1) return true;
      const br = portalTermBreakIsoRange();
      if(br.from && br.to && iso >= br.from && iso <= br.to) return true;
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
    function termCalendarDateKey(year, monthIndex, day){
      const pad = n => String(n).padStart(2, '0');
      return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
    }
    /** Local calendar YYYY-MM-DD for an instant (same clock as termCalendarNowMs / demo). */
    function portalTermLocalYmdFromMs(ms){
      const d = new Date(ms);
      return termCalendarDateKey(d.getFullYear(), d.getMonth(), d.getDate());
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
     * Per calendar day on My Term: blue (pending) while no session that needs feedback has ended yet;
     * orange (late) once at least one such session has ended and something is still incomplete;
     * green only when every required session for that day is done (or absent/cancelled as handled in rebuild).
     */
    function portalTermCurrentWeekMondayIso(){
      const mon = mondayStartOfWeekLocal(new Date(termCalendarNowMs()));
      return portalTermLocalYmdFromDate(mon);
    }
    function portalTermLocalYmdFromDate(d){
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    function portalTermIsBeforeCurrentWeek(iso){
      const key = String(iso || '').trim();
      const mon = portalTermCurrentWeekMondayIso();
      return /^\d{4}-\d{2}-\d{2}$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(mon) && key < mon;
    }
    function getTermFeedbackStateForDay(year, monthIndex, day){
      const key = termCalendarDateKey(year, monthIndex, day);
      const todayKey = portalTermLocalYmdFromMs(termCalendarNowMs());
      if(key > todayKey) return 'pending';
      const map = dashboardData.termFeedbackByDate;
      const explicit = map && map[key];
      const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      /* Admin-flagged outstanding day (e.g. Youssef 24 Jun PM swim slots) stays orange even when
         the assume-complete-through window or forced-complete map would otherwise green it. */
      if(staffId && key <= todayKey && portalTermStaffDayExplicitlyPending(key, staffId)) return 'late';
      if(staffId && typeof portalTermFeedbackAssumeComplete === 'function'
        && portalTermFeedbackAssumeComplete(key, staffId)) return 'complete';
      /* Grandfather / forced-complete (Jun 1–7, Javier May catch-up) wins over stale fbMap late. */
      if(staffId && portalTermDateForcedComplete(key, staffId)) return 'complete';
      if(staffId && portalTermIsCatchUpFeedbackDate(key, staffId)){
        const dayWordCatch = new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
        const curCatch = new Date(key + 'T12:00:00');
        const isRealCatch = function(sess){
          const st = String(sess.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(sess.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const relCatch = typeof portalTermFeedbackSessionsForDate === 'function'
          ? portalTermFeedbackSessionsForDate(dayWordCatch, key, staffId, isRealCatch)
          : [];
        if(relCatch.length && typeof portalTermDayAllSessionsComplete === 'function'
          && portalTermDayAllSessionsComplete(dayWordCatch, key, staffId, relCatch, curCatch)){
          return 'complete';
        }
        if(key <= todayKey) return 'late';
        return 'pending';
      }
      if(explicit === 'complete') return 'complete';
      if(staffId && typeof portalStaffHasRequestedTimeOffOnDate === 'function'
        && portalStaffHasRequestedTimeOffOnDate(key, staffId)) return 'pending';
      if(explicit === 'cancelled') return 'cancelled';
      if(explicit === 'late') return 'late';
      const dayWord = new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      if(staffId && portalTermStaffOffWeekdayOnDate(key, staffId)) return 'pending';
      if(staffId && portalTermIsBeforeCurrentWeek(key) && key <= todayKey){
        const cur = new Date(key + 'T12:00:00');
        const isReal = function(sess){
          const st = String(sess.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(sess.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const relAll = typeof portalBaseClientSessionsForCalendarDate === 'function'
          ? portalBaseClientSessionsForCalendarDate(dayWord, key, staffId, isReal)
          : [];
        const relFb = typeof portalTermFeedbackSessionsForDate === 'function'
          ? portalTermFeedbackSessionsForDate(dayWord, key, staffId, isReal)
          : relAll;
        const rel = relFb.length ? relFb : relAll;
        if(typeof portalTermDayAllSessionsComplete === 'function'
          && portalTermDayAllSessionsComplete(dayWord, key, staffId, rel, cur)){
          return 'complete';
        }
      }
      if(explicit === 'pending') return 'pending';
      return 'pending';
    }
    /** Export says complete and this day counts as worked (not a stray Saturday before Summer Term 2). */
    function portalTermExportCountsAsWorkedDay(iso, staffId, weekdayLong){
      if(portalTermDateForcedComplete(iso, staffId)) return true;
      if(typeof portalTermExportMarksDayComplete !== 'function'
        || !portalTermExportMarksDayComplete(iso, staffId)){
        return false;
      }
      if(portalStaffClientSessionsOnCalendarDate(iso, weekdayLong, staffId)) return true;
      if(portalStaffHasDatedRowsForIso(iso, staffId)) return true;
      /* Only Summer Term 2 off-Saturdays (1 Jun–17 Jul) skip export-only; May Saturdays keep green. */
      if(portalTermStaffOffWeekdayOnDate(iso, staffId)) return false;
      return true;
    }
    /** Legacy export helper — not used for Term/Week cell colours (Today list is authoritative). */
    function portalTermExportMarksDayComplete(iso, staffId){
      try{
        if(portalTermIsCatchUpFeedbackDate(iso, staffId)) return false;
        const dayWord = new Date(String(iso || '').trim().slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
        if(typeof portalTermCalendarDayHasNotEndedClientSession === 'function'
          && portalTermCalendarDayHasNotEndedClientSession(iso, dayWord, staffId)){
          return false;
        }
        const bridge = typeof window !== 'undefined' ? window.PortalStaffFeedbackBridge : null;
        if(bridge && typeof bridge.exportMarksDayComplete === 'function'){
          return bridge.exportMarksDayComplete(iso, staffId);
        }
      }catch(_){}
      return false;
    }
    /** Before this calendar week: green only when Today list says no pending (not export-only). */
    function portalTermApplyHistoricalDayGreen(iso, staffId, dayWord, key, relAll, relFb, cur, fbMap){
      if(portalTermIsCatchUpFeedbackDate(iso, staffId)) return;
      if(!portalTermIsBeforeCurrentWeek(iso)) return;
      if(portalTermStaffOffWeekdayOnDate(iso, staffId)) return;
      const rel = relFb.length ? relFb : relAll;
      if(typeof portalTermDayAllSessionsComplete === 'function'
        && portalTermDayAllSessionsComplete(dayWord, key, staffId, rel, cur)){
        fbMap[key] = 'complete';
      }
    }
    /** True while a real client session on this calendar day has not reached its feedback end time (matches Today blue). */
    function portalTermCalendarDayHasNotEndedClientSession(isoKey, dayWord, staffId, sessionsOpt, curDateOpt){
      const iso = String(isoKey || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid) return false;
      const cur = curDateOpt || new Date(iso + 'T12:00:00');
      const dw = String(dayWord || '').trim() || cur.toLocaleDateString('en-GB', { weekday: 'long' });
      let list = Array.isArray(sessionsOpt) ? sessionsOpt : [];
      if(!list.length){
        const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
        const isReal = function(s){
          if(baseReal) return baseReal(s, iso);
          const st = String(s.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(s.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        list = typeof portalTermFeedbackSessionsForDate === 'function'
          ? portalTermFeedbackSessionsForDate(dw, iso, sid, isReal)
          : (typeof portalBaseClientSessionsForCalendarDate === 'function'
            ? portalBaseClientSessionsForCalendarDate(dw, iso, sid, isReal)
            : []);
      }
      if(!list.length) return false;
      const nowMs = termCalendarNowMs();
      const y = cur.getFullYear();
      const mo = cur.getMonth();
      const da = cur.getDate();
      for(let i = 0; i < list.length; i++){
        const s = list[i];
        if(typeof portalRosterSessionFeedbackExempt === 'function'
          && portalRosterSessionFeedbackExempt(s, iso, staffId)) continue;
        const cid = String(s && s.clientId || '').toLowerCase();
        if(!cid || cid === 'closed' || cid === 'available') continue;
        const endMs = buildSessionEndMsForCalendarDate(y, mo, da, s.end);
        if(!Number.isFinite(endMs)) continue;
        const lead = typeof portalRosterSessionIsDayCentre === 'function' && portalRosterSessionIsDayCentre(s)
          ? DAY_CENTRE_FEEDBACK_LEAD_MS : 0;
        if(nowMs < (endMs - lead)) return true;
      }
      return false;
    }
    function portalTermClampCompleteIfSessionsStillRunning(isoKey, dayWord, staffId, sessions, curDate, fbMap){
      const key = String(isoKey || '').trim().slice(0, 10);
      if(!key || !fbMap || fbMap[key] !== 'complete') return;
      if(typeof portalTermCalendarDayHasNotEndedClientSession === 'function'
        && portalTermCalendarDayHasNotEndedClientSession(key, dayWord, staffId, sessions, curDate)){
        fbMap[key] = 'pending';
      }
    }
    /** True when Today list shows no pending feedback for this instructor's day. */
    function portalTermDayFeedbackOutstandingResolved(isoKey, dayWord, staffId, sessionsOpt, curDateOpt){
      const iso = String(isoKey || '').trim().slice(0, 10);
      const sid = String(staffId || '').trim().toLowerCase();
      const dw = String(dayWord || '').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !sid || portalTermIsCatchUpFeedbackDate(iso, sid)) return false;
      if(typeof portalCountPendingSessionReviewsForCalendarDay !== 'function'
        || !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dw)) return false;
      const allowRebuild = !!(typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__);
      const pendingN = portalCountPendingSessionReviewsForCalendarDay(iso, dw, allowRebuild ? { allowDuringRebuild: true } : undefined);
      if(pendingN > 0) return false;
      return !(typeof portalTermCalendarDayHasNotEndedClientSession === 'function'
        && portalTermCalendarDayHasNotEndedClientSession(iso, dw, sid, sessionsOpt, curDateOpt));
    }
    /** Roster rows that need participant feedback (not HOME/MANAGER/closed/available). */
    function portalTermRosterHasRealClientSessions(sessions, isoYmd){
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const rel = Array.isArray(sessions) ? sessions : [];
      const baseReal = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
      for(let i = 0; i < rel.length; i++){
        const s = rel[i];
        if(!s) continue;
        if(baseReal) { if(baseReal(s, iso)) return true; continue; }
        const st = String(s.status || '').toLowerCase();
        if(st === 'closed' || st === 'available' || st === 'home' || st === 'manager') continue;
        const cid = String(s.clientId || '').toLowerCase();
        if(cid && cid !== 'closed' && cid !== 'available' && cid !== 'home' && cid !== 'manager') return true;
      }
      return false;
    }
    /** True when every feedback-eligible Today card for this calendar day is done (same rules as session card colours). */
    function portalTermTodayListClientFeedbackAllResolved(isoYmd, dayWord, opts){
      opts = opts || {};
      const iso = String(isoYmd || '').trim().slice(0, 10);
      const dw = String(dayWord || '').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dw)) return false;
      if(typeof portalTodayListItemsForCalendarDay !== 'function') return false;
      const list = portalTodayListItemsForCalendarDay(iso, dw, opts);
      let accountable = 0;
      for(let i = 0; i < list.length; i++){
        const item = list[i];
        if(!item || !item.sessionKey) continue;
        if(item.kind === 'closed' || item.kind === 'available' || item.kind === 'home' || item.kind === 'manager' || item.kind === 'admin') continue;
        /* A client session known Absent/Cancelled (e.g. Bespoke shared Tinashe resolved by a
           co-instructor) is flagged noSessionFeedbackRequired. It is a RESOLVED accountable
           session — count it as handled instead of skipping, otherwise an all-absent day has
           accountable=0 → "not all resolved" → the term cell stays orange while the halo (which
           only checks the pending count) is already green. */
        if(item.noSessionFeedbackRequired){
          const rr = typeof getEffectiveSessionReviewRecord === 'function'
            ? (getEffectiveSessionReviewRecord(item) || {})
            : {};
          const pill = String(item.portalOverrideAlertPill || '').trim().toUpperCase();
          if(rr.absent || rr.cancelled || rr.feedbackDone || pill === 'ABSENT' || pill === 'CANCELLED'){
            accountable++;
          }
          continue;
        }
        const started = typeof isSessionStartedForItem === 'function' && isSessionStartedForItem(item);
        const ended = typeof isSessionEndedForFeedback === 'function' && isSessionEndedForFeedback(item);
        if(!started && !ended) continue;
        accountable++;
        const r = typeof getEffectiveSessionReviewRecord === 'function'
          ? (getEffectiveSessionReviewRecord(item) || {})
          : (typeof getSessionReviewRecord === 'function' ? (getSessionReviewRecord(item) || {}) : {});
        if(!r.feedbackDone && !r.absent && !r.cancelled) return false;
      }
      return accountable > 0;
    }
    /** All countable Today-list sessions resolved for this instructor's day. */
    function portalTermDayAllSessionsComplete(dayWord, isoKey, staffId, sessions, curDate){
      const iso = String(isoKey || '').trim().slice(0, 10);
      const dw = String(dayWord || '').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dw)) return false;
      const allowRebuild = !!(typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__);
      const pending = typeof portalCountPendingSessionReviewsForCalendarDay === 'function'
        ? portalCountPendingSessionReviewsForCalendarDay(iso, dw, allowRebuild ? { allowDuringRebuild: true } : undefined)
        : 0;
      if(pending > 0) return false;
      if(typeof portalTermCalendarDayHasNotEndedClientSession === 'function'
        && portalTermCalendarDayHasNotEndedClientSession(iso, dw, staffId, sessions, curDate)){
        return false;
      }
      if(staffId && typeof portalTermStaffDayExplicitlyPending === 'function'
        && portalTermStaffDayExplicitlyPending(iso, staffId)) return false;
      if(typeof portalTermFeedbackAssumeComplete === 'function' && portalTermFeedbackAssumeComplete(iso, staffId)) return true;
      if(typeof portalTermTodayListClientFeedbackAllResolved === 'function'
        && portalTermTodayListClientFeedbackAllResolved(iso, dw, allowRebuild ? { allowDuringRebuild: true } : undefined)){
        return true;
      }
      const rel = Array.isArray(sessions) ? sessions : [];
      if(typeof portalTermRosterHasRealClientSessions === 'function' && portalTermRosterHasRealClientSessions(rel, iso)) return false;
      return rel.length > 0;
    }
    function portalTermResolveDayFeedbackState(dayWord, isoKey, staffId, relPick, curDate, catchUpDay){
      const key = String(isoKey || '').trim().slice(0, 10);
      const list = Array.isArray(relPick) ? relPick : [];
      let maxEnd = 0;
      if(curDate && list.length){
        list.forEach(function(s){
          const ms = buildSessionEndMsForCalendarDate(curDate.getFullYear(), curDate.getMonth(), curDate.getDate(), s.end);
          if(ms > maxEnd) maxEnd = ms;
        });
      }
      return typeof portalTermFeedbackStateFromTodayList === 'function'
        ? portalTermFeedbackStateFromTodayList(key, dayWord, {
          staffId: staffId,
          maxEndMs: maxEnd,
          relAll: list,
          relFb: list,
          cur: curDate,
          catchUpDay: !!catchUpDay
        })
        : 'pending';
    }
    function portalTermRebuildInputSignature(){
      const sid = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      let ovPart = '0';
      try{
        const rows = typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : [];
        ovPart = String(rows.length);
        rows.forEach(function(r){
          ovPart += '|' + String(r && r.id || '') + ':' + String(r && (r.updated_at || r.created_at) || '');
        });
      }catch(_){}
      let revPart = '0';
      try{
        Object.keys(sessionReviewMapMemory || {}).forEach(function(k){
          const r = sessionReviewMapMemory[k];
          if(!r) return;
          revPart += ';' + k + ':' + (r.feedbackDone ? '1' : '0') + (r.absent ? 'a' : '') + (r.cancelled ? 'c' : '');
        });
      }catch(_){}
      let srvPart = '0';
      try{
        if(dashboardData && dashboardData.portalFeedbackServerSynced) srvPart = '1';
        const srv = dashboardData && dashboardData.portalServerResolvedRosterKeys;
        if(srv && srv.feedback) srvPart += ':' + srv.feedback.size;
        /* Co-instructor ABSENT quick marks (e.g. Bespoke shared Tinashe) resolve a day even when
           no feedback row / own memory changed. Without them here the rebuild is skipped and the
           term cell stays orange after the peer absent sync arrives. */
        if(srv && srv.absent) srvPart += ':a' + srv.absent.size;
        const apk = dashboardData && dashboardData.portalServerAbsentQuickMarkKeys;
        if(apk && typeof apk.size === 'number') srvPart += ':q' + apk.size;
      }catch(_){}
      let ovHydrated = '0';
      try{
        if(typeof window !== 'undefined' && window.__PORTAL_SCHEDULE_OVERRIDES_HYDRATED__) ovHydrated = '1';
      }catch(_){}
      return [
        sid,
        String((sessionsModel || []).length),
        ovPart,
        revPart,
        srvPart,
        ovHydrated,
        String(dashboardData.termDashboardCalendarFrom || ''),
        String(dashboardData.termDashboardCalendarTo || '')
      ].join('\0');
    }
    function rebuildTermShiftAndFeedbackFromSessionModel(){
      if(typeof window !== 'undefined' && window.__PORTAL_TERM_REBUILD_IN_PROGRESS__) return;
      const t = window.PORTAL_TERM_FROM_TIMETABLE;
      const staffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      if(!t || !t.firstDate || !t.lastDate || !staffId) return;
      const rebuildSig = portalTermRebuildInputSignature();
      if(typeof window !== 'undefined'
        && window.__PORTAL_TERM_REBUILD_LAST_SIG__ === rebuildSig
        && dashboardData.termFeedbackByDate
        && Object.keys(dashboardData.termFeedbackByDate).length){
        return;
      }
      try{ if(typeof window !== 'undefined') window.__PORTAL_TERM_REBUILD_IN_PROGRESS__ = true; }catch(_){}
      try{
      const worked = Array.isArray(dashboardData.termWorkedWeekdays) ? dashboardData.termWorkedWeekdays.map(Number) : [];
      if(!worked.length) return;
      const baseRealTerm = typeof window.__portalIsRealClientSession === 'function' ? window.__portalIsRealClientSession : null;
      const endMap = {};
      const fbMap = {};
      const viewFrom = dashboardData.termDashboardCalendarFrom
        || (window.PortalTermCalendarDashboard && PortalTermCalendarDashboard.fromIso())
        || String(t.termResumeDate || '2026-06-01').slice(0, 10);
      const viewTo = dashboardData.termDashboardCalendarTo
        || (window.PortalTermCalendarDashboard && PortalTermCalendarDashboard.toIso())
        || String(t.lastDate || '2026-07-17').slice(0, 10);
      const cur = new Date(String(viewFrom) + 'T12:00:00');
      const last = new Date(String(viewTo) + 'T12:00:00');
      while(cur.getTime() <= last.getTime()){
        const w = cur.getDay();
        if(!worked.includes(w)){
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        const dayWord = cur.toLocaleDateString('en-GB', { weekday: 'long' });
        const key = termCalendarDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate());
        if(portalTermDateForcedComplete(key, staffId)){
          fbMap[key] = 'complete';
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        if(portalTermStaffAwayOnDate(key, staffId) || portalTermStaffOffWeekdayOnDate(key, staffId)){
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        const isReal = function(s){
          if(baseRealTerm) return baseRealTerm(s, key);
          const st = String(s.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(s.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const relAll = typeof portalBaseClientSessionsForCalendarDate === 'function'
          ? portalBaseClientSessionsForCalendarDate(dayWord, key, staffId, isReal)
          : (sessionsModel || []).filter(s =>
            String(s.staffId || '').toLowerCase() === staffId &&
            String(s.day || '').trim() === dayWord &&
            isReal(s) &&
            (typeof portalSessionSpreadsheetRowMatchesCalendarDate !== 'function'
              || portalSessionSpreadsheetRowMatchesCalendarDate(s, key, dayWord))
          );
        const relFb = typeof portalTermFeedbackSessionsForDate === 'function'
          ? portalTermFeedbackSessionsForDate(dayWord, key, staffId, isReal)
          : relAll;
        const todayKey = portalTermLocalYmdFromMs(termCalendarNowMs());
        if(key > todayKey){
          if(relAll.length){
            let maxEndFut = 0;
            relAll.forEach(function(s){
              const ms = buildSessionEndMsForCalendarDate(cur.getFullYear(), cur.getMonth(), cur.getDate(), s.end);
              if(ms > maxEndFut) maxEndFut = ms;
            });
            if(maxEndFut > 0) endMap[key] = new Date(maxEndFut).toISOString();
          }
          fbMap[key] = 'future';
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        if(!relAll.length){
          if(key <= todayKey && typeof portalTermFeedbackStateFromTodayList === 'function'){
            fbMap[key] = portalTermFeedbackStateFromTodayList(key, dayWord, {
              staffId: staffId,
              maxEndMs: 0,
              relAll: [],
              relFb: [],
              cur: cur,
              todayKey: todayKey,
              catchUpDay: portalTermIsCatchUpFeedbackDate(key, staffId)
            });
          }
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        let maxEnd = 0;
        relAll.forEach(s => {
          const ms = buildSessionEndMsForCalendarDate(cur.getFullYear(), cur.getMonth(), cur.getDate(), s.end);
          if(ms > maxEnd) maxEnd = ms;
        });
        if(maxEnd <= 0){
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        endMap[key] = new Date(maxEnd).toISOString();
        fbMap[key] = typeof portalTermFeedbackStateFromTodayList === 'function'
          ? portalTermFeedbackStateFromTodayList(key, dayWord, {
            staffId: staffId,
            maxEndMs: maxEnd,
            relAll: relAll,
            relFb: relFb,
            cur: cur,
            todayKey: todayKey,
            catchUpDay: portalTermIsCatchUpFeedbackDate(key, staffId)
          })
          : 'pending';
        if(portalTermDateForcedComplete(key, staffId)) fbMap[key] = 'complete';
        cur.setDate(cur.getDate() + 1);
      }
      const termExtraCatchUpIsoKeys = (function(){
        const seen = Object.create(null);
        const out = [];
        function add(iso){
          const k = String(iso || '').trim().slice(0, 10);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(k) || seen[k]) return;
          seen[k] = true;
          out.push(k);
        }
        portalTermStaffExtraCalendarDates(staffId).forEach(add);
        portalTermStaffCatchUpFeedbackDates(staffId).forEach(add);
        if(typeof portalStaffInstructorCoverCalendarIsoKeys === 'function'){
          portalStaffInstructorCoverCalendarIsoKeys(staffId, viewFrom, viewTo).forEach(add);
        }
        return out;
      })();
      termExtraCatchUpIsoKeys.forEach(function(isoKey){
        if(Object.prototype.hasOwnProperty.call(fbMap, isoKey)) return;
        const curExtra = new Date(String(isoKey) + 'T12:00:00');
        const w = curExtra.getDay();
        const isExtraCatchUp = portalTermStaffExtraCalendarDates(staffId).indexOf(isoKey) >= 0;
        const isCoverDay = typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
          && portalStaffHasInstructorCoverOnCalendarDate(isoKey, staffId);
        if(!isExtraCatchUp && !isCoverDay && !worked.includes(w)) return;
        const dayWord = curExtra.toLocaleDateString('en-GB', { weekday: 'long' });
        if(portalTermDateForcedComplete(isoKey, staffId)) {
          fbMap[isoKey] = 'complete';
          return;
        }
        if(portalTermStaffAwayOnDate(isoKey, staffId) || portalTermStaffOffWeekdayOnDate(isoKey, staffId)) return;
        const isRealExtra = function(s){
          if(baseRealTerm) return baseRealTerm(s, isoKey);
          const st = String(s.status || '').toLowerCase();
          if(st === 'closed' || st === 'available') return false;
          const cid = String(s.clientId || '').toLowerCase();
          return Boolean(cid && cid !== 'closed' && cid !== 'available');
        };
        const relAllExtra = typeof portalBaseClientSessionsForCalendarDate === 'function'
          ? portalBaseClientSessionsForCalendarDate(dayWord, isoKey, staffId, isRealExtra)
          : (sessionsModel || []).filter(function(s){
            return String(s.staffId || '').toLowerCase() === staffId &&
              String(s.day || '').trim() === dayWord &&
              isRealExtra(s) &&
              (typeof portalSessionSpreadsheetRowMatchesCalendarDate !== 'function'
                || portalSessionSpreadsheetRowMatchesCalendarDate(s, isoKey, dayWord));
          });
        const relFbExtra = typeof portalTermFeedbackSessionsForDate === 'function'
          ? portalTermFeedbackSessionsForDate(dayWord, isoKey, staffId, isRealExtra)
          : relAllExtra;
        if(!relAllExtra.length) return;
        const relPick = relFbExtra.length ? relFbExtra : relAllExtra;
        const catchUpDay = portalTermIsCatchUpFeedbackDate(isoKey, staffId);
        fbMap[isoKey] = portalTermResolveDayFeedbackState(dayWord, isoKey, staffId, relPick, curExtra, catchUpDay);
      });
      dashboardData.termShiftEndByDate = endMap;
      dashboardData.termFeedbackByDate = fbMap;
      try{ if(typeof window !== 'undefined') window.__PORTAL_TERM_REBUILD_LAST_SIG__ = rebuildSig; }catch(_){}
      } finally {
        try{ if(typeof window !== 'undefined') window.__PORTAL_TERM_REBUILD_IN_PROGRESS__ = false; }catch(_){}
      }
    }
    function portalOldestIsoDateNeedingTermFeedback(){
      try{
        if(typeof rebuildTermShiftAndFeedbackFromSessionModel === 'function') rebuildTermShiftAndFeedbackFromSessionModel();
      }catch(e){}
      const map = dashboardData.termFeedbackByDate;
      const keys = [];
      const sid = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      if(map && typeof map === 'object'){
        Object.keys(map).forEach(function(k){
          const v = map[k];
          if(sid && typeof portalTermStaffAwayOnDate === 'function' && portalTermStaffAwayOnDate(k, sid)) return;
          if(typeof portalFeedbackReminderDayInScope === 'function' && !portalFeedbackReminderDayInScope(k)) return;
          if(v !== 'pending' && v !== 'late') return;
          if(typeof getTermFeedbackStateForDay === 'function'){
            const isoKey = String(k || '').trim().slice(0, 10);
            const m = isoKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if(m){
              const calSt = getTermFeedbackStateForDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
              if(calSt === 'complete' || calSt === 'cancelled') return;
            }
          }
          keys.push(String(k || '').trim());
        });
      }
      const sorted = keys.filter(Boolean).sort();
      if(sorted.length) return sorted[0];
      if(typeof collectSessionReviewPendingStats === 'function'){
        const stats = collectSessionReviewPendingStats();
        const first = stats.pending && stats.pending[0];
        if(first && first.sessionKey){
          const d = String(first.sessionKey).split('|')[0].trim();
          if(/^\d{4}-\d{2}-\d{2}$/.test(d) && portalFeedbackReminderDayInScope(d)) return d;
        }
      }
      return '';
    }
    function portalOpenTermSheetAndFocusOldestFeedbackDay(){
      const iso = portalOldestIsoDateNeedingTermFeedback();
      try{
        if(typeof portalSetReviewFlowOrigin === 'function') portalSetReviewFlowOrigin('term');
      }catch(e){}
      if(typeof closeSheet === 'function') closeSheet();
      if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid();
      if(typeof openSheet === 'function') openSheet('termSheet');
      function focusCell(){
        const grid = document.getElementById('termGrid');
        if(!grid) return;
        grid.querySelectorAll('.term-cal-day--portal-reminder-focus').forEach(function(el){
          try{ el.classList.remove('term-cal-day--portal-reminder-focus'); }catch(e){}
        });
        if(!iso) return;
        const escIso = String(iso).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cell = grid.querySelector('.term-cal-day[data-term-review-date="' + escIso + '"]');
        if(cell){
          try{ cell.classList.add('term-cal-day--portal-reminder-focus'); }catch(e){}
          try{ cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(e){}
          try{ cell.focus({ preventScroll: true }); }catch(e2){
            try{ cell.focus(); }catch(e3){}
          }
        }
      }
      requestAnimationFrame(function(){ requestAnimationFrame(focusCell); });
    }
    try{ window.portalOpenTermSheetAndFocusOldestFeedbackDay = portalOpenTermSheetAndFocusOldestFeedbackDay; }catch(e){}
    function renderTermCalendarGrid(opts){
      opts = opts && typeof opts === 'object' ? opts : {};
      const el = document.getElementById('termGrid');
      if(!el) return;
      rebuildTermShiftAndFeedbackFromSessionModel();
      if(typeof portalRefreshPendingOverrideDaysCache === 'function') portalRefreshPendingOverrideDaysCache();
      let ovCount = 0;
      try{
        ovCount = (typeof portalScheduleOverrideRowsAll === 'function' ? portalScheduleOverrideRowsAll() : []).length;
      }catch(_){}
      const domSig = typeof portalTermGridDomSignature === 'function'
        ? portalTermGridDomSignature({
          staffId: STAFF_DASHBOARD_ID,
          termCalendarYear: dashboardData.termCalendarYear,
          termCalendarMonths: dashboardData.termCalendarMonths,
          termFeedbackByDate: dashboardData.termFeedbackByDate,
          overrideCount: ovCount,
          pendingOverrideDays: typeof portalPendingOverrideDaysSignature === 'function' ? portalPendingOverrideDaysSignature() : ''
        })
        : '';
      const termSheetOpen = !!(document.getElementById('termSheet') && document.getElementById('termSheet').classList.contains('open'));
      if(!opts.force && domSig && el.getAttribute('data-term-grid-sig') === domSig && el.querySelector('.term-cal-month')){
        return;
      }
      if(!opts.force && !termSheetOpen){
        if(typeof portalScheduleTermGridIdleRender === 'function'){
          portalScheduleTermGridIdleRender(function(){
            renderTermCalendarGrid({ force: true });
          }, 480);
          return;
        }
      }
      const y = Number(dashboardData.termCalendarYear) || 2026;
      let months = Array.isArray(dashboardData.termCalendarMonths) && dashboardData.termCalendarMonths.length
        ? dashboardData.termCalendarMonths.map(Number).filter(m => m >= 0 && m <= 11)
        : null;
      if(!months || !months.length){
        const single = Number(dashboardData.termCalendarMonth);
        months = [Number.isFinite(single) ? single : 4];
      }
      let worked;
      if(Array.isArray(dashboardData.termWorkedWeekdays)){
        worked = dashboardData.termWorkedWeekdays.length
          ? dashboardData.termWorkedWeekdays.map(Number)
          : [];
      } else {
        worked = [1, 2, 4, 5];
      }
      const halfWeeks = Array.isArray(dashboardData.termHalfTermWeekStarts) ? dashboardData.termHalfTermWeekStarts : [];
      const termStaffId = String(STAFF_DASHBOARD_ID || '').trim().toLowerCase();
      const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dowLate = [false, false, false, false, false, false, false];
      months.forEach(monthIndex => {
        const lastDay = new Date(y, monthIndex + 1, 0).getDate();
        const firstDomMap = dashboardData.termCalendarFirstDom;
        let firstDom = 1;
        if(firstDomMap && Object.prototype.hasOwnProperty.call(firstDomMap, monthIndex)){
          const fd = Math.floor(Number(firstDomMap[monthIndex]));
          if(Number.isFinite(fd) && fd > 1) firstDom = Math.min(fd, lastDay);
        }
        for(let day = firstDom; day <= lastDay; day++){
          const dt = new Date(y, monthIndex, day);
          const w = dt.getDay();
          const red = typeof portalTermCalendarDayIsRed === 'function'
            ? portalTermCalendarDayIsRed(y, monthIndex, day, termStaffId, halfWeeks)
            : isHalfTermDay(y, monthIndex, day, halfWeeks);
          const isWorked = worked.includes(w);
          if(red || !isWorked) continue;
          const fb = getTermFeedbackStateForDay(y, monthIndex, day);
          if(fb === 'late') dowLate[(w + 6) % 7] = true;
        }
      });
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
        dows.forEach((label, idx) => {
          const hCls = dowLate[idx] ? 'term-cal-dow term-cal-dow--attention' : 'term-cal-dow';
          parts.push(`<div class="${hCls}" role="columnheader">${label}</div>`);
        });
        for(let i = 0; i < startPad; i++) parts.push('<div class="term-cal-pad" aria-hidden="true"></div>');
        for(let day = firstDom; day <= lastDay; day++){
          const dt = new Date(y, monthIndex, day);
          const w = dt.getDay();
          const isoKey = termCalendarDateKey(y, monthIndex, day);
          const staffAway = termStaffId && typeof portalTermStaffAwayOnDate === 'function'
            && portalTermStaffAwayOnDate(isoKey, termStaffId);
          const half = typeof portalTermCalendarDayIsRed === 'function'
            ? portalTermCalendarDayIsRed(y, monthIndex, day, termStaffId, halfWeeks)
            : (isHalfTermDay(y, monthIndex, day, halfWeeks) || staffAway);
          const dayWordRoster = dt.toLocaleDateString('en-GB', { weekday: 'long' });
          const rosterApplies = !termStaffId || typeof portalStaffRosterAppliesOnCalendarDate !== 'function'
            || portalStaffRosterAppliesOnCalendarDate(isoKey, dayWordRoster, termStaffId);
          const todayKeyGrid = portalTermLocalYmdFromMs(termCalendarNowMs());
          const exportWorked = termStaffId && isoKey <= todayKeyGrid
            && typeof portalTermExportCountsAsWorkedDay === 'function'
            && portalTermExportCountsAsWorkedDay(isoKey, termStaffId, dayWordRoster);
          const extraCatchUp = termStaffId && (
            portalTermStaffExtraCalendarDates(termStaffId).indexOf(isoKey) >= 0
            || (typeof portalTermIsCatchUpFeedbackDate === 'function' && portalTermIsCatchUpFeedbackDate(isoKey, termStaffId))
          );
          const instructorCoverDay = termStaffId && typeof portalStaffHasInstructorCoverOnCalendarDate === 'function'
            && portalStaffHasInstructorCoverOnCalendarDate(isoKey, termStaffId);
          const adminAddedShiftDay = termStaffId && typeof portalStaffHasAdminAddedShiftOnCalendarDate === 'function'
            && portalStaffHasAdminAddedShiftOnCalendarDate(isoKey, termStaffId);
          const isWorked = extraCatchUp || instructorCoverDay || adminAddedShiftDay || (worked.includes(w) && (rosterApplies || exportWorked));
          let cls = 'term-cal-day';
          let label;
          let dayFlagsOff = null;
          const halfBlocksNav = half && !exportWorked && !extraCatchUp && !instructorCoverDay && !adminAddedShiftDay;
          const staffRequestedAway = termStaffId
            && portalTermStaffAwayDatesFor(termStaffId).indexOf(isoKey) >= 0;
          const adminScheduleAdjusted = termStaffId
            && typeof portalStaffTermAdminScheduleAdjustedOnDate === 'function'
            && portalStaffTermAdminScheduleAdjustedOnDate(isoKey, termStaffId);
          const hadBaselineShift = termStaffId && typeof window.PortalTermCalendarDashboard !== 'undefined'
            && window.PortalTermCalendarDashboard
            && typeof window.PortalTermCalendarDashboard.staffHadBaselineShiftOnDate === 'function'
            && window.PortalTermCalendarDashboard.staffHadBaselineShiftOnDate(isoKey, termStaffId);
          if(staffRequestedAway && worked.includes(w)){
            cls += ' half-term';
            if(hadBaselineShift){
              cls += ' term-cal-day--ov-pulse-shift-removed';
              label = `${day}, shift removed (time off requested)`;
            }else{
              cls += ' term-cal-day--ov-pulse-day-off';
              label = `${day}, day off (time off requested)`;
            }
            parts.push(`<div class="${cls}" role="gridcell" aria-label="${label}"><span class="term-cal-day-num">${day}</span></div>`);
            continue;
          }
          if(halfBlocksNav){
            const ovPulseHalf = portalTermOverridePulseClassForNonWorkedDay(isoKey, adminScheduleAdjusted, dayWordRoster);
            dayFlagsOff = typeof portalDayOverrideBadgeFlags === 'function'
              ? portalDayOverrideBadgeFlags(dayWordRoster, isoKey)
              : null;
            if(ovPulseHalf){
              /* Off-rota / half-term day but admin schedule change (cover, shadowing, etc.) → blue + outline pulse */
              cls += ' active';
              cls += ' ' + ovPulseHalf;
            }else{
              cls += ' half-term';
            }
            const offWd = termStaffId && portalTermStaffOffWeekdayOnDate(isoKey, termStaffId);
            const afterTermEnd = (typeof portalTermCalendarToIso === 'function' ? portalTermCalendarToIso() : '') && isoKey > portalTermCalendarToIso();
            label = ovPulseHalf
              ? `${day}, schedule change — see quick menu`
              : (afterTermEnd
                ? `${day}, term ended`
                : (offWd ? `${day}, not scheduled this term` : (staffAway ? `${day}, not on duty` : `${day}, half term`)));
            if(ovPulseHalf && dayFlagsOff && dayFlagsOff.hasAbsentAnnounced){
              cls += ' term-cal-day--with-badge';
            }
          } else if(isWorked){
            const dayWord = dt.toLocaleDateString('en-GB', { weekday: 'long' });
            const fb = getTermFeedbackStateForDay(y, monthIndex, day);
            const dayWordNav = dt.toLocaleDateString('en-GB', { weekday: 'long' });
            const termReviewIsoNav = termCalendarDateKey(y, monthIndex, day);
            const dayFlags = portalDayOverrideBadgeFlags(dayWord, isoKey);
            const ovPulseWorked = portalTermWorkedDayOverridePulseClass(dayFlags, adminScheduleAdjusted);
            if(ovPulseWorked) cls += ' ' + ovPulseWorked;
            if(fb === 'complete'){
              cls += ' term-feedback-complete';
              label = `${day}, all feedback complete`;
              parts.push(`<div class="${cls}" role="gridcell" tabindex="0" data-action="term-pending-review-day" data-term-review-date="${termReviewIsoNav}" data-term-review-weekday="${dayWordNav}" data-term-review-judgement="0" aria-label="${label}"><span class="term-cal-day-num">${day}</span></div>`);
              continue;
            } else if(fb === 'cancelled'){
              cls += ' term-feedback-cancelled';
              label = `${day}, all sessions cancelled`;
              parts.push(`<div class="${cls}" role="gridcell" tabindex="0" data-action="term-pending-review-day" data-term-review-date="${termReviewIsoNav}" data-term-review-weekday="${dayWordNav}" data-term-review-judgement="0" aria-label="${label}"><span class="term-cal-day-num">${day}</span></div>`);
              continue;
            } else if(fb === 'late'){
              cls += ' term-feedback-late';
              label = `${day}, feedback overdue, complete review`;
              parts.push(`<div class="${cls}" role="gridcell" tabindex="0" data-action="term-pending-review-day" data-term-review-date="${termReviewIsoNav}" data-term-review-weekday="${dayWordNav}" data-term-review-judgement="1" aria-label="${label}"><span class="term-cal-day-num">${day}</span></div>`);
              continue;
            } else {
              cls += ' active';
              label = `${day}, shift in progress or no session ended yet`;
              parts.push(`<div class="${cls}" role="gridcell" tabindex="0" data-action="term-pending-review-day" data-term-review-date="${termReviewIsoNav}" data-term-review-weekday="${dayWordNav}" data-term-review-judgement="0" aria-label="${label}"><span class="term-cal-day-num">${day}</span></div>`);
              continue;
            }
          } else {
            const ovPulseOff = portalTermOverridePulseClassForNonWorkedDay(isoKey, adminScheduleAdjusted, dayWordRoster);
            dayFlagsOff = typeof portalDayOverrideBadgeFlags === 'function'
              ? portalDayOverrideBadgeFlags(dayWordRoster, isoKey)
              : null;
            if(ovPulseOff){
              cls += ' active';
              cls += ' ' + ovPulseOff;
              if(dayFlagsOff && dayFlagsOff.hasAbsentAnnounced) cls += ' term-cal-day--with-badge';
              label = `${day}, schedule change — see quick menu`;
            }else{
              cls += ' half-term';
              label = `${day}, not on your rota`;
            }
          }
          let dayNumHtml = `<span class="term-cal-day-num">${day}</span>`;
          if(cls.indexOf('term-cal-day--with-badge') >= 0){
            const badges = [];
            if(dayFlagsOff && dayFlagsOff.hasAbsentAnnounced) badges.push('<span class="term-cal-badge term-cal-badge--absent">Absent</span>');
            if(dayFlagsOff && dayFlagsOff.hasMakeUp) badges.push('<span class="term-cal-badge term-cal-badge--pink">Make Up</span>');
            if(badges.length) dayNumHtml += `<span class="term-cal-badges">${badges.join('')}</span>`;
          }
          parts.push(`<div class="${cls}" role="gridcell" aria-label="${label}">${dayNumHtml}</div>`);
        }
        const daysShown = lastDay - firstDom + 1;
        const used = startPad + daysShown;
        const endPad = (7 - (used % 7)) % 7;
        for(let i = 0; i < endPad; i++) parts.push('<div class="term-cal-pad" aria-hidden="true"></div>');
        parts.push('</div>');
        blocks.push(`<section class="term-cal-month" aria-label="${monthCaption}">${parts.join('')}</section>`);
      });
      el.innerHTML = blocks.join('');
      if(domSig) el.setAttribute('data-term-grid-sig', domSig);
    }

    function renderQuickMenuSetupVisibility(){
      const pending = !!dashboardData.setupPending;
      document.querySelectorAll('#menuSheet [data-setup-training-item]').forEach(el => {
        el.hidden = !pending;
      });
    }

    function portalDebugLogAbsentAggregates(){
      if(!/(?:^|[?&])portalDebug=1(?:&|$)/.test(String(window.location.search||''))) return;
      try{
        const nextSessionData = Array.isArray(dashboardData.tomorrow) ? dashboardData.tomorrow : [];
        const termData = {
          termName: dashboardData.termName,
          termCalendarYear: dashboardData.termCalendarYear,
          termCalendarMonths: dashboardData.termCalendarMonths,
          termCalendarMonth: dashboardData.termCalendarMonth,
          termCalendarFirstDom: dashboardData.termCalendarFirstDom,
          termWorkedWeekdays: dashboardData.termWorkedWeekdays,
          termHalfTermWeekStarts: dashboardData.termHalfTermWeekStarts,
          termFeedbackByDate: dashboardData.termFeedbackByDate,
          termShiftEndByDate: dashboardData.termShiftEndByDate
        };
        const absentOverride = (portalScheduleOverrideRowsAll() || []).find(function(r){
          return String(r && r.override_type || '').trim() === 'client_absence_announced';
        }) || null;
        console.log("DEBUG ABSENT OVERRIDE ROW", absentOverride);
        console.log("DEBUG TODAY CANDIDATES", dashboardData.today);
        console.log("DEBUG NEXT SESSION CANDIDATES", dashboardData.tomorrow || nextSessionData);
        console.log("DEBUG WEEK CANDIDATES", dashboardData.week);
        console.log("DEBUG TERM DATA", termData || dashboardData.termCalendarMonths);
        console.log("TODAY SOURCE", dashboardData.today);
        console.log("NEXT SESSION SOURCE", nextSessionData);
        console.log("THIS WEEK SOURCE", dashboardData.week);
        console.log("TERM SOURCE", termData);
        console.log("OVERRIDE CACHE", window.__portalScheduleOverridesCache || null);
      }catch(err){
        console.warn('portalDebugLogAbsentAggregates', err);
      }
    }

    function renderLists(){
      renderTomorrowSheetTitle();
      renderWeekSheetTitle();
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
        const resolveTomorrowRowPhoto = (name, clientId, avatarFile) => {
          const fromResolve = typeof resolveParticipantPhotoUrl === 'function'
            ? resolveParticipantPhotoUrl(name, clientId)
            : '';
          if(fromResolve) return fromResolve;
          const fromItem = avatarFile ? String(avatarFile).trim() : '';
          if(fromItem) return fromItem;
          return typeof clientPhotoUrl === 'function' ? (clientPhotoUrl(name) || '') : '';
        };
        const normalizeTomorrowRow = item => {
          const foLab = item && item.futureOverrideLabel != null ? String(item.futureOverrideLabel).trim() : '';
          const foTone = item && item.futureOverrideTone != null ? String(item.futureOverrideTone).trim() : '';
          const clientId = item && item.clientId != null ? String(item.clientId).trim() : '';
          if(item && item.time != null && item.name != null){
            const slot = item.timeSlotLabel != null && String(item.timeSlotLabel).trim()
              ? String(item.timeSlotLabel).trim()
              : '';
            const name = String(item.name);
            return {
              time: String(item.time),
              timeSlotLabel: slot,
              start: item.start != null && item.start !== '' ? String(item.start) : '',
              clientId,
              name,
              venue: item.venue != null ? String(item.venue) : '—',
              avatarFile: resolveTomorrowRowPhoto(name, clientId, item.avatarFile),
              areaNote: item.areaNote != null ? String(item.areaNote).trim() : '',
              activity: item.activity != null ? String(item.activity).trim() : '',
              futureOverrideLabel: foLab,
              futureOverrideTone: foTone
            };
          }
          const d = String(item && item.detail ? item.detail : '').trim();
          const dot = d.indexOf('·');
          if(dot > 0){
            const name = d.slice(dot + 1).trim();
            return {
              time: d.slice(0, dot).trim(),
              timeSlotLabel: '',
              start: item && item.start != null && item.start !== '' ? String(item.start) : '',
              clientId,
              name,
              venue: item && item.venue != null ? String(item.venue) : '—',
              avatarFile: resolveTomorrowRowPhoto(name, clientId, item && item.avatarFile),
              areaNote: item && item.areaNote != null ? String(item.areaNote).trim() : '',
              activity: item && item.activity != null ? String(item.activity).trim() : '',
              futureOverrideLabel: foLab,
              futureOverrideTone: foTone
            };
          }
          const name = d || '—';
          return {
            time: '—',
            timeSlotLabel: '',
            start: '',
            clientId,
            name,
            venue: '—',
            avatarFile: resolveTomorrowRowPhoto(name, clientId, item && item.avatarFile),
            areaNote: '',
            activity: '',
            futureOverrideLabel: foLab,
            futureOverrideTone: foTone
          };
        };
        const tomorrowVenueParenLabel = venue => {
          const s = String(venue || '').trim();
          if(!s || s === '—') return '—';
          return '(' + s.toUpperCase() + ')';
        };
        const nextRows = dashboardData.tomorrow || [];
        const tomorrowSig = typeof portalTomorrowListSignature === 'function'
          ? portalTomorrowListSignature(nextRows.map(normalizeTomorrowRow))
          : '';
        if(typeof portalPreloadParticipantPhotoUrls === 'function'){
          portalPreloadParticipantPhotoUrls(nextRows.map(function(item){
            const row = normalizeTomorrowRow(item);
            return row.avatarFile;
          }));
        }
        if(!nextRows.length){
          tl.innerHTML = '<div class="clients-grid-empty" role="status">No sessions on your next work day in the next three weeks.</div>';
          tl.setAttribute('data-tomorrow-sig', 'empty');
        } else if(tl.getAttribute('data-tomorrow-sig') === tomorrowSig && tl.querySelector('.calendar-day--tomorrow, .calendar-day--tomorrow-btn')){
          if(typeof portalRefreshDashboardParticipantPhotos === 'function'){
            portalRefreshDashboardParticipantPhotos(tl, {
              resolvePhotoUrl: resolveParticipantPhotoUrl,
              escapeHtml: escapeHtml
            });
          }
        } else {
          tl.setAttribute('data-tomorrow-sig', tomorrowSig);
          const photoLoadAttr = typeof portalParticipantPhotoLoadingAttr === 'function'
            ? portalParticipantPhotoLoadingAttr()
            : ' loading="eager" fetchpriority="low"';
          tl.innerHTML = nextRows.map(item => {
            const row = normalizeTomorrowRow(item);
            const timeShown = row.timeSlotLabel && String(row.timeSlotLabel).trim()
              ? String(row.timeSlotLabel).trim()
              : (row.start
                ? formatHHmmAsStartLabel(row.start)
                : formatTomorrowListStartTime(row.time));
            const t = escapeHtml(timeShown);
            const n = escapeHtml(row.name);
            const vLbl = tomorrowVenueParenLabel(row.venue);
            const v = escapeHtml(vLbl);
            const vCls = venueChipClass(row.venue);
            const src = (row.avatarFile ? String(row.avatarFile).trim() : '')
              || (typeof resolveParticipantPhotoUrl === 'function' ? resolveParticipantPhotoUrl(row.name, row.clientId) : '')
              || (typeof clientPhotoUrl === 'function' ? clientPhotoUrl(row.name) : '');
            const avatar = typeof portalParticipantCalendarAvatarHtml === 'function'
              ? portalParticipantCalendarAvatarHtml(row.name, src, escapeHtml, row.clientId)
              : (src
                ? `<div class="calendar-day-avatar calendar-day-avatar--photo"><img class="portal-screenshot-protected" src="${escapeHtml(src)}" alt=""${photoLoadAttr} decoding="async" draggable="false" onerror="this.remove();"/></div>`
                : `<div class="calendar-day-avatar calendar-day-avatar--initials">${escapeHtml(clientInitials(row.name))}</div>`);
            const ovRaw = String(row.futureOverrideLabel || '').trim();
          const isMakeUpTomorrowRow = row.futureOverrideTone === 'pink'
            && /make\s*up/i.test(ovRaw);
          const isTrialTomorrowRow = row.futureOverrideTone === 'trial'
            || /trial/i.test(ovRaw);
          let makeupPillHtml = '';
          let trialPillHtml = '';
          if(isTrialTomorrowRow){
            trialPillHtml = '<span class="tomorrow-trial-pill" aria-label="Trial session"><span>TRIAL</span></span>';
          } else if(isMakeUpTomorrowRow){
            makeupPillHtml = '<span class="tomorrow-makeup-pill" aria-label="Make up session"><span>MAKE UP</span></span>';
          }
          const absentPillHtml = row.futureOverrideTone === 'absent-green'
            ? '<span class="tomorrow-absent-pill">ABSENT</span>'
            : '';
          const cancelledPillHtml = row.futureOverrideTone === 'cancelled-green'
            ? '<span class="tomorrow-cancelled-pill" aria-label="Cancelled"><span>CANCELLED</span></span>'
            : '';
          const overrideHtml = trialPillHtml + makeupPillHtml + absentPillHtml + cancelledPillHtml;
          const identityOverrideHtml = overrideHtml
            ? `<div class="calendar-day-tomorrow-override">${overrideHtml}</div>`
            : '';
          const ovToneCls = row.futureOverrideTone === 'absent-green' || row.futureOverrideTone === 'cancelled-green'
            ? ' calendar-day--tomorrow-ov-done'
            : (row.futureOverrideTone === 'trial'
            ? ' calendar-day--tomorrow-ov-trial'
            : (row.futureOverrideTone === 'pink'
            ? ' calendar-day--tomorrow-ov-pink'
            : (row.futureOverrideTone === 'pending-feedback'
              ? ' calendar-day--tomorrow-ov-pending'
              : (row.futureOverrideTone === 'done'
                ? ' calendar-day--tomorrow-ov-done'
                : (row.futureOverrideTone === 'admin' ? ' calendar-day--tomorrow-ov-admin' : '')))));
            const aria = escapeHtml(
            `${row.name}${ovRaw ? ', ' + ovRaw : ''}${trialPillHtml ? ', Trial' : ''}${makeupPillHtml ? ', Make up' : ''}, ${timeShown}, ${row.venue}${absentPillHtml ? ', Absent' : ''}${cancelledPillHtml ? ', Cancelled' : ''}`
            );
            const absentRowCls = row.futureOverrideTone === 'absent-green' || row.futureOverrideTone === 'cancelled-green' ? ' calendar-day--tomorrow-absent-noninteractive' : '';
            const absentRowTab = row.futureOverrideTone === 'absent-green' || row.futureOverrideTone === 'cancelled-green' ? ' tabindex="-1"' : '';
            const rowInner = `${avatar}<div class="calendar-day-tomorrow-identity"><span class="calendar-day-name">${n}</span>${identityOverrideHtml}</div><div class="tomorrow-venue-block ${vCls}"><span class="tomorrow-venue-block-time">${t}</span><span class="tomorrow-venue-block-venue">${v}</span></div>`;
            const rawClientId = escapeHtml(String(row.clientId || '').trim());
            const rawName = escapeHtml(String(row.name || '').trim());
            const timeSub = escapeHtml(String(timeShown || '').trim());
            if(absentRowCls){
              return `<div class="calendar-day calendar-day--tomorrow${ovToneCls}${absentRowCls}"${absentRowTab} aria-label="${aria}">${rowInner}</div>`;
            }
            return `<button type="button" class="calendar-day calendar-day--tomorrow calendar-day--tomorrow-btn${ovToneCls}" data-next-session-participant="1" data-next-session-client="${rawClientId}" data-next-session-name="${rawName}" data-next-session-time="${timeSub}" aria-label="Open profile for ${aria}">${rowInner}</button>`;
          }).join('');
        }
      }
      if(wl){
        wl.innerHTML = (dashboardData.week || []).map(renderWeekRowHtml).join('');
      }
      const termTitle = document.getElementById('termSheetTitle');
      if(termTitle) termTitle.textContent = dashboardData.termName || 'Summer Term 2026';
      renderTermCalendarGrid();
      renderQuickMenuSetupVisibility();
      if(typeof portalRefreshDashboardParticipantPhotos === 'function'){
        portalRefreshDashboardParticipantPhotos(document.getElementById('tomorrowList') || document, {
          resolvePhotoUrl: resolveParticipantPhotoUrl,
          escapeHtml: escapeHtml
        });
      }
      portalDebugLogAbsentAggregates();
    }

    function safeLsGet(k){
      try{ return localStorage.getItem(k); }catch(err){ return null; }
    }
    function safeLsSet(k, v){
      try{ localStorage.setItem(k, v); }catch(err){}
    }
    function shouldShowTermCalendarColorIntro(){
      return false;
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
        const demoExtra = (STAFF_DASH_TERM_COLOR_INTRO_DEMO && window.__PORTAL_TERM_DEMO_VISUALS__)
          ? '\n\nThis is a demo. Tap Understood to confirm you have read this.'
          : '';
        body.textContent = TERM_COLOR_INTRO_BODY_MAIN + demoExtra;
        if(demoTag) demoTag.hidden = !(STAFF_DASH_TERM_COLOR_INTRO_DEMO && window.__PORTAL_TERM_DEMO_VISUALS__);
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
      if(STAFF_DASH_TERM_COLOR_INTRO_DEMO && window.__PORTAL_TERM_DEMO_VISUALS__){
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
      const annLock = !!(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive());
      document.body.classList.toggle('dock-context-announcement-lock', annLock);
      if(typeof portalSyncAnnouncementBeforeUnloadListener === 'function') portalSyncAnnouncementBeforeUnloadListener();
      const sessionsOverviewOpen = document.getElementById('clientSessionsOverviewSheet')?.classList.contains('open');
      document.body.classList.toggle('portal-sessions-overview-open', !!sessionsOverviewOpen);
      if(typeof syncDockQuickMenuAttention === 'function') syncDockQuickMenuAttention();
      if(typeof portalSyncQuickMenuDockChrome === 'function') portalSyncQuickMenuDockChrome();
      if(typeof portalSyncParticipantsDockChrome === 'function') portalSyncParticipantsDockChrome();
    }
    function openSheet(id, opts){
      if(id === 'internalChatSheet') return; /* chat removed — see archive/chat-full-removal-20260609 */
      opts = opts || {};
      if(id === 'menuSheet' && !opts.bypassAnnouncementLock) opts.bypassAnnouncementLock = true;
      if(typeof portalRecordSheetNavigation === 'function' && !opts.skipNavRecord){
        portalRecordSheetNavigation(id);
      }
      if(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive() && id !== 'announcementsSheet' && id !== 'menuSheet'){
        closeSheet({ bypassAnnouncementLock: true });
      }
      if(closeSheet({ preserveNavStack: true, bypassAnnouncementLock: !!opts.bypassAnnouncementLock }) === false){
        if(id === 'announcementsSheet' && document.getElementById('announcementsSheet')?.classList.contains('open')){
          if(typeof renderAnnouncementsSheetContent === 'function') renderAnnouncementsSheetContent();
          syncDockNavContext();
        }
        return;
      }
      currentSheet = document.getElementById(id);
      if(!currentSheet) return;
      if(id === 'announcementsSheet' && typeof renderAnnouncementsSheetContent === 'function'){
        renderAnnouncementsSheetContent();
        const pendingAnn = portalAnnouncementPendingItem();
        if(pendingAnn && typeof portalActivatePermissionsFromSignableItem === 'function'){
          void portalActivatePermissionsFromSignableItem(pendingAnn);
        }
      }
      if(id === 'safeguardingFeedbackPolicySheet' && typeof renderSafeguardingFeedbackPolicySheet === 'function'){
        renderSafeguardingFeedbackPolicySheet();
      }
      if(id === 'menuSheet'){
        if(typeof portalApplyQuickMenuEntryMode === 'function') portalApplyQuickMenuEntryMode({ shellOnly: true });
      }
      if(id === 'setupReminderSheet' && backdropEl){
        backdropEl.classList.add('sheet-backdrop--focus');
      }
      if(id === 'internalChatSheet'){
        var restrictedBeforeOpen = false;
        try{
          restrictedBeforeOpen = typeof portalInternalChatOfficeRestricted === 'function' && portalInternalChatOfficeRestricted();
        }catch(_rbo){}
        if(restrictedBeforeOpen && typeof portalPrepRestrictedWorkerChatBeforeOpen === 'function'){
          var uiPrep = window.__PORTAL_INTERNAL_CHAT_UI || {};
          var prepOpenThread = !!(String(uiPrep.threadId || '').trim() || String(uiPrep.groupId || '').trim());
          if(!prepOpenThread) portalPrepRestrictedWorkerChatBeforeOpen();
        }
      }
      currentSheet.classList.add('open');
      if(backdropEl){
        if(id === 'internalChatSheet') backdropEl.classList.remove('open');
        else backdropEl.classList.add('open');
      }
      document.body.style.overflow = 'hidden';
      if(id === 'setupReminderSheet'){
        const tn = document.getElementById('trainingNotice');
        if(tn) tn.classList.add('notice--selected');
      }
      if(id === 'termSheet'){
        syncTermCalendarColorIntro(true);
        if(typeof renderTermCalendarGrid === 'function') renderTermCalendarGrid({ force: true });
      }
      if(id === 'clientsSheet'){
        if(typeof portalParticipantsSheetRefreshTabs === 'function') portalParticipantsSheetRefreshTabs();
        setClientsSheetTab('my');
      }
      if(id === 'menuSheet'){
        portalDeferQuickMenuHeavySync({ skipReminderSync: !!opts.skipReminderSync });
      }
      if(id === 'alertsNotificationsSheet'){
        if(typeof window.portalOnAlertsSheetOpened === 'function'){
          void window.portalOnAlertsSheetOpened();
        }else if(typeof window.portalRefreshMandatoryAlertsSettingsUi === 'function'){
          void window.portalRefreshMandatoryAlertsSettingsUi();
        }else if(typeof window.portalRefreshAlertsNotifyUi === 'function'){
          window.portalRefreshAlertsNotifyUi();
        }
      }
      if(id === 'achievementsSheet'){
        if(window.PortalParticipantAchievements && typeof window.PortalParticipantAchievements.openSheet === 'function'){
          window.PortalParticipantAchievements.openSheet();
        }
      }
      if(id === 'internalChatSheet'){
        var restrictedChatOpen = false;
        try{
          restrictedChatOpen = typeof portalInternalChatOfficeRestricted === 'function' && portalInternalChatOfficeRestricted();
        }catch(_rco){}
        try{
          window.__PORTAL_INTERNAL_CHAT_UI = window.__PORTAL_INTERNAL_CHAT_UI || {};
          if(!restrictedChatOpen && !window.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen){
            window.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
          }
          if(restrictedChatOpen){
            window.__PORTAL_INTERNAL_CHAT_UI.workerInboxTab = window.__PORTAL_INTERNAL_CHAT_UI.workerInboxTab || 'admin';
            window.__PORTAL_INTERNAL_CHAT_UI.groupId = null;
            if(!window.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen){
              window.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
            }
            window.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen = false;
          }else{
            window.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen = false;
          }
        }catch(_icc){}
        portalBindInternalChatCloseControls();
        if(window.portalLeadStaffChatDirectory && typeof window.portalLeadStaffChatDirectory.initWorkerPeerInbox === 'function'){
          window.portalLeadStaffChatDirectory.initWorkerPeerInbox();
        }
        if(window.portalLeadStaffChatDirectory && typeof window.portalLeadStaffChatDirectory.portalPrimeInternalChatShell === 'function'){
          window.portalLeadStaffChatDirectory.portalPrimeInternalChatShell();
        }
        if(restrictedChatOpen){
          var uiRo = window.__PORTAL_INTERNAL_CHAT_UI || {};
          var openThread = !!(String(uiRo.threadId || '').trim() || String(uiRo.groupId || '').trim());
          if(openThread){
            portalSyncInternalChatSheetView(true, uiRo.groupId ? (uiRo.peerLabel || 'Group') : 'Admin');
          }else{
            portalSyncInternalChatSheetView(false);
          }
        }
        void (async function(){
          if(typeof window.portalStaffDmAckInboxOpened === 'function'){
            await window.portalStaffDmAckInboxOpened();
          }
          if(!opts.skipInternalChatRender && typeof window.portalRenderInternalChatSheet === 'function'){
            await window.portalRenderInternalChatSheet();
          }
        })();
      }
      syncPortalInternalChatImmersive();
      syncDockNavContext();
      if(typeof syncPortalIosAlertPreviewStack === 'function') syncPortalIosAlertPreviewStack();
    }
    function closeSheet(opts){
      const bypass = !!(opts && opts.bypassAnnouncementLock);
      if(!bypass && typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive()){
        return false;
      }
      if(bypass){
        try{ portalAnnouncementLockRequired = false; }catch(_){}
      }
      try{ portalAnnouncementsSheetEntry = ''; }catch(_){}
      try{
        if(window.PortalParticipantAchievements && typeof window.PortalParticipantAchievements.stopCamera === 'function'){
          window.PortalParticipantAchievements.stopCamera();
        }
        if(window.PortalParticipantAchievements && typeof window.PortalParticipantAchievements.syncScreenshotGuard === 'function'){
          window.PortalParticipantAchievements.syncScreenshotGuard();
        }
      }catch(_achCam){}
      const hadClientOpen = $$('.sheet.open').some(s => s.id === 'clientSheet');
      $$('.sheet.open').forEach(s => s.classList.remove('open'));
      document.getElementById('clientGeneralSheet')?.setAttribute('aria-hidden', 'true');
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'false');
      document.getElementById('clientSessionsOverviewSheet')?.setAttribute('aria-hidden', 'true');
      document.getElementById('clientBtnSessionsOverview')?.setAttribute('aria-expanded', 'false');
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
      syncPortalInternalChatImmersive();
      syncDockNavContext();
      if(typeof syncPortalIosAlertPreviewStack === 'function') syncPortalIosAlertPreviewStack();
      if(typeof portalOnSheetClosed === 'function') portalOnSheetClosed(opts || {});
      return true;
    }

    function closeClientSessionsOverviewSheet(){
      const sheet = document.getElementById('clientSessionsOverviewSheet');
      if(!sheet || !sheet.classList.contains('open')) return;
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.getElementById('clientBtnSessionsOverview')?.setAttribute('aria-expanded', 'false');
      if(typeof portalUnlockOrientation === 'function') void portalUnlockOrientation();
      const stillOpen = document.querySelectorAll('.sheet.open').length;
      if(stillOpen === 0 && backdropEl){
        backdropEl.classList.remove('open');
        document.body.style.overflow = '';
      }
      syncDockNavContext();
    }
    function closeClientSupportPlanSheet(){
      const sheet = document.getElementById('clientSupportPlanSheet');
      if(!sheet || !sheet.classList.contains('open')) return;
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('portal-client-support-plan-open');
      document.getElementById('clientBtnSupportPlan')?.setAttribute('aria-expanded', 'false');
      const stillOpen = document.querySelectorAll('.sheet.open').length;
      if(stillOpen === 0 && backdropEl){
        backdropEl.classList.remove('open');
        document.body.style.overflow = '';
      }
      syncDockNavContext();
    }
    function supportPlanRiskChip(level){
      const lv = String(level || 'medium').toLowerCase();
      const label = lv === 'high' ? 'High' : lv === 'low' ? 'Low' : 'Medium';
      const cls = lv === 'high' ? 'isp-risk--high' : lv === 'low' ? 'isp-risk--low' : 'isp-risk--med';
      return `<span class="isp-risk ${cls}">${label}</span>`;
    }
    function formatIspWhen(iso){
      if(!iso) return '—';
      try{
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }catch(_e){
        return String(iso).slice(0, 10);
      }
    }
    async function staffFollowupApi(body){
      const box = window.__PORTAL_SUPABASE__;
      const client = box && box.client ? box.client : null;
      if(!client || !client.auth) throw new Error('not_connected');
      const sess = await client.auth.getSession();
      const token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if(!token) throw new Error('Sign in required');
      const base = String((window.SUPABASE_URL || (box && box.url) || 'https://cklpnwhlqsulpmkipmqb.supabase.co')).replace(/\/$/, '');
      const anon = String(window.SUPABASE_ANON_KEY || (box && box.anonKey) || '');
      const res = await fetch(base + '/functions/v1/portal-incident-followup-staff', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: anon,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body || {})
      });
      let j = null;
      try{ j = await res.json(); }catch(_e){ j = null; }
      if(!res.ok || !j || !j.ok) throw new Error((j && (j.error || j.message)) || 'Request failed');
      return j;
    }
    async function loadActiveSupportPlan(clientName, clientId, services){
      try{
        const j = await staffFollowupApi({
          action: 'ensure_support_plan',
          participant_name: clientName,
          participant_contact_id: clientId || null,
          services: services || []
        });
        return {
          plan: j.plan || null,
          items: j.items || [],
          pending: j.pending || null,
          invites: j.invites || [],
          service_tags: j.service_tags || [],
          error: null
        };
      }catch(e){
        const msg = e && e.message ? String(e.message) : 'load_failed';
        // Fallback: read plan via RLS if edge auth resolution fails (legacy id mismatch).
        try{
          const box = window.__PORTAL_SUPABASE__;
          const client = box && box.client ? box.client : null;
          if(!client || !client.from) throw e;
          let plan = null;
          let items = [];
          if(clientId){
            const byId = await client.from('portal_support_plans').select('*').eq('status', 'active').eq('participant_contact_id', clientId).limit(1).maybeSingle();
            if(byId && byId.data) plan = byId.data;
          }
          if(!plan && clientName){
            const byName = await client.from('portal_support_plans').select('*').eq('status', 'active').ilike('participant_name', clientName).limit(1).maybeSingle();
            if(byName && byName.data) plan = byName.data;
          }
          if(plan){
            const itemsRes = await client.from('portal_support_plan_items').select('*').eq('plan_id', plan.id).order('sort_order', { ascending: true });
            items = (itemsRes && itemsRes.data) || [];
          }
          return {
            plan,
            items,
            pending: null,
            invites: [],
            service_tags: [],
            error: plan ? null : msg,
            fallback: true
          };
        }catch(_e2){
          return {
            plan: null,
            items: [],
            pending: null,
            invites: [],
            service_tags: [],
            error: msg
          };
        }
      }
    }
    function supportPlanItemRow(it, opts){
      opts = opts || {};
      const risk = escapeHtml(it.risk_behaviour || '—');
      const strat = escapeHtml(it.strategy_in_place || '—');
      const scope = String(it.item_scope || 'individual');
      const metaBits = [
        it.is_customized ? 'Customised' : null,
        it.source_incident_id ? 'From incident' : null,
        it.updated_by_name ? ('By ' + escapeHtml(it.updated_by_name)) : null
      ].filter(Boolean);
      const meta = metaBits.length
        ? `<div class="isp-table__meta muted">${metaBits.join(' · ')}</div>`
        : '';
      const editBtn = opts.editable
        ? `<button type="button" class="isp-btn isp-btn--sm" data-isp-edit="${escapeHtml(it.id)}">Edit</button>`
        : '';
      return `<tr class="isp-row" data-isp-item="${escapeHtml(it.id)}" data-scope="${escapeHtml(scope)}">` +
        `<td class="isp-td isp-td--risk"><strong class="isp-card__risk">${risk}</strong>${meta}</td>` +
        `<td class="isp-td isp-td--strat"><div class="isp-card__strat">${strat}</div></td>` +
        `<td class="isp-td isp-td--level">${supportPlanRiskChip(it.risk_level)}${editBtn ? `<div class="isp-acts isp-acts--tight">${editBtn}</div>` : ''}</td>` +
        `</tr>`;
    }
    function supportPlanItemsTable(items, opts){
      if(!items || !items.length) return '';
      const rows = items.map(function(it){ return supportPlanItemRow(it, opts); }).join('');
      return `<div class="isp-table-wrap">` +
        `<table class="isp-table isp-table--plan">` +
        `<thead><tr>` +
        `<th class="isp-th isp-th--risk">Individual Risk / Behaviour</th>` +
        `<th class="isp-th isp-th--strat">Strategy in Place</th>` +
        `<th class="isp-th isp-th--level">Risk</th>` +
        `</tr></thead>` +
        `<tbody>${rows}</tbody>` +
        `</table></div>`;
    }
    function renderSupportPlanHost(host, payload, ctx){
      if(!host) return;
      ctx = ctx || {};
      if(payload && payload.error && payload.error !== 'not_connected' && !payload.plan){
        host.innerHTML = `<p class="pcso-empty" role="status">Could not load support plan: ${escapeHtml(payload.error)}</p>`;
        return;
      }
      if(payload && payload.error === 'not_connected'){
        host.innerHTML = '<p class="pcso-empty" role="status">Sign in to view the support plan.</p>';
        return;
      }
      const plan = payload && payload.plan;
      const items = ((payload && payload.items) || []).filter(function(it){
        return String(it.item_status || 'active') !== 'no_longer_required';
      });
      const pending = payload && payload.pending;
      const invites = (payload && payload.invites) || [];
      const tags = (payload && payload.service_tags) || [];
      let html = '<div class="isp-wrap">';
      if(invites.length){
        html += '<div class="isp-pending"><h4 class="isp-h">Meeting invitations</h4>';
        invites.forEach(function(inv){
          const m = inv.meeting || {};
          const when = m.proposed_at ? formatIspWhen(m.proposed_at) : 'TBC';
          html += `<article class="isp-card"><p class="isp-card__strat"><strong>${escapeHtml(String(m.meeting_type||'meeting').replace(/_/g,' '))}</strong> · ${escapeHtml(when)} · ${escapeHtml(m.location_mode||'')}</p>` +
            `<p class="isp-card__meta muted">Your response: ${escapeHtml(inv.response || 'pending')}</p>` +
            (inv.response === 'pending'
              ? `<div class="isp-acts"><button type="button" class="isp-btn isp-btn--ok" data-isp-avail="${escapeHtml(inv.id)}" data-r="available">Available</button>` +
                `<button type="button" class="isp-btn" data-isp-avail="${escapeHtml(inv.id)}" data-r="unable">Unable</button>` +
                `<button type="button" class="isp-btn" data-isp-avail="${escapeHtml(inv.id)}" data-r="suggest_time">Suggest time</button></div>`
              : '') +
            `</article>`;
        });
        html += '</div>';
      }
      if(pending){
        const rows = (Array.isArray(pending.payload_json) ? pending.payload_json : []).map(it => {
          return `<tr><td>${escapeHtml(it.risk_behaviour||'—')}</td><td>${escapeHtml(it.strategy_in_place||'—')}</td><td>${escapeHtml(String(it.risk_level||'').toUpperCase())}</td></tr>`;
        }).join('');
        html += `<div class="isp-pending"><h4 class="isp-h">Support Plan Update Pending</h4>` +
          `<p class="isp-lead muted">Please review proposed changes for ${escapeHtml(pending.participant_name||'participant')}.</p>` +
          `<div class="pfu-table-wrap"><table class="isp-table"><thead><tr><th>Risk</th><th>Strategy</th><th>Level</th></tr></thead><tbody>${rows||'<tr><td colspan="3">No rows</td></tr>'}</tbody></table></div>` +
          `<div class="isp-acts"><button type="button" class="isp-btn isp-btn--ok" data-isp-approve="${escapeHtml(pending.id)}">Approve</button>` +
          `<button type="button" class="isp-btn isp-btn--danger" data-isp-reject="${escapeHtml(pending.id)}">Reject</button></div></div>`;
      }
      if(!plan){
        html += '<p class="pcso-empty" role="status">Unable to open an Individual Support Plan for this participant.</p></div>';
        host.innerHTML = html;
        return;
      }
      const generals = items.filter(function(it){ return String(it.item_scope||'') === 'general'; });
      const individuals = items.filter(function(it){ return String(it.item_scope||'') !== 'general'; });
      const tagLine = tags.length
        ? `Services considered: ${escapeHtml(tags.join(', '))}`
        : 'No service tags yet — showing general (all-service) risks only. Outing / pool / climbing risks appear when those services are on the schedule.';
      html += `<p class="isp-lead muted">Individual Support Plan · last updated ${escapeHtml(formatIspWhen(plan.activated_at || plan.updated_at))}` +
        (plan.reviewed_by_name ? ` · Reviewed by ${escapeHtml(plan.reviewed_by_name)}` : '') +
        (plan.approved_by_name ? ` · Approved by ${escapeHtml(plan.approved_by_name)}` : '') +
        `</p><p class="isp-lead muted">${tagLine}</p>`;

      html += '<div class="isp-section"><div class="isp-section__head"><h4 class="isp-h">General (by services)</h4></div>';
      html += generals.length
        ? supportPlanItemsTable(generals, { editable: true })
        : '<p class="pcso-empty">No general risks for the current services.</p>';
      html += '</div>';

      html += '<div class="isp-section"><div class="isp-section__head"><h4 class="isp-h">Individual behaviours</h4>' +
        '<button type="button" class="isp-btn isp-btn--ok" data-isp-add>Add behaviour</button></div>';
      html += individuals.length
        ? supportPlanItemsTable(individuals, { editable: true })
        : '<p class="pcso-empty">No individual behaviours yet. Add ones that are specific to this participant.</p>';
      html += '</div>';

      html += `<div class="isp-add" id="ispAddPanel" hidden>
        <h4 class="isp-h">Add / edit behaviour</h4>
        <p class="isp-lead muted">Pick from the library, then edit the text if needed. The original library entry stays; your edited version is saved as a new library item.</p>
        <label class="isp-label">From library
          <select class="isp-input" id="ispLibBeh"><option value="">— Select or type below —</option></select>
        </label>
        <label class="isp-label">Risk / behaviour
          <input type="text" class="isp-input" id="ispRiskBeh" placeholder="Behaviour">
        </label>
        <label class="isp-label">Strategy library
          <select class="isp-input" id="ispLibStrat"><option value="">— Select or type below —</option></select>
        </label>
        <label class="isp-label">Strategy in place
          <textarea class="isp-input" id="ispStrat" rows="3" placeholder="Strategy"></textarea>
        </label>
        <label class="isp-label">Risk level
          <select class="isp-input" id="ispRisk"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select>
        </label>
        <input type="hidden" id="ispEditItemId" value="">
        <input type="hidden" id="ispBehLibId" value="">
        <input type="hidden" id="ispStratLibId" value="">
        <div class="isp-acts">
          <button type="button" class="isp-btn isp-btn--ok" data-isp-save-item>Save to plan + library</button>
          <button type="button" class="isp-btn" data-isp-cancel-add>Cancel</button>
        </div>
      </div></div>`;
      host.innerHTML = html;
      host.__ispCtx = ctx;
      host.__ispLastPlanId = plan.id;
      host.__ispItems = items;
      void populateIspLibrarySelects(host, ctx.services || []);
    }
    async function populateIspLibrarySelects(host, services){
      const behSel = host.querySelector('#ispLibBeh');
      const stratSel = host.querySelector('#ispLibStrat');
      if(!behSel || !stratSel) return;
      try{
        const j = await staffFollowupApi({ action: 'list_library', services: services || [] });
        host.__ispLibrary = j;
        behSel.innerHTML = '<option value="">— Select or type below —</option>' +
          (j.behaviours || []).map(function(b){
            return `<option value="${escapeHtml(b.id)}" data-label="${escapeHtml(b.label)}" data-risk="${escapeHtml(b.default_risk_level||'medium')}" data-scope="${escapeHtml(b.scope||'')}">${escapeHtml(b.label)}${b.scope === 'individual' ? ' (custom)' : ''}</option>`;
          }).join('');
        stratSel.innerHTML = '<option value="">— Select or type below —</option>' +
          (j.strategies || []).map(function(s){
            return `<option value="${escapeHtml(s.id)}" data-body="${escapeHtml(s.body)}" data-label="${escapeHtml(s.label)}">${escapeHtml(s.label)}${s.scope === 'individual' ? ' (custom)' : ''}</option>`;
          }).join('');
      }catch(_e){ /* optional */ }
    }
    async function openClientSupportPlanFullscreen(){
      const sheet = document.getElementById('clientSupportPlanSheet');
      const host = document.getElementById('clientSupportPlanHost');
      if(!sheet || !host) return;
      const item = currentOpenClientItem;
      const nameEl = document.getElementById('clientTitle');
      const timeEl = document.getElementById('clientTime');
      const ht = document.getElementById('clientSupportPlanSheetTitle');
      const sub = document.getElementById('clientSupportPlanSheetSub');
      const clientName = item && item.name ? String(item.name).trim() : (nameEl ? nameEl.textContent.trim() : '');
      const clientId = item && item.clientId ? String(item.clientId).trim() : '';
      const services = (typeof getDistinctScheduledActivitiesForClient === 'function' && clientId)
        ? getDistinctScheduledActivitiesForClient(clientId)
        : (item && item.activity ? [item.activity] : []);
      if(ht) ht.textContent = 'Individual Support Plan';
      if(sub) sub.textContent = clientName || (timeEl ? timeEl.textContent.trim() : '');
      closeClientGeneralSheet();
      closeClientSessionsOverviewSheet();
      const ps = document.getElementById('clientPanelSpecialty');
      if(ps) ps.hidden = true;
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'false');
      document.getElementById('clientBtnSessionsOverview')?.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('#clientServiceButtonsRow .client-info-btn--service').forEach(b => b.setAttribute('aria-expanded', 'false'));
      host.innerHTML = '<p class="pcso-empty" role="status">Loading…</p>';
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      document.body.classList.add('portal-client-support-plan-open');
      if(backdropEl) backdropEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('clientBtnSupportPlan')?.setAttribute('aria-expanded', 'true');
      syncDockNavContext();
      const ispCtx = { clientName, clientId, services };
      async function reloadIsp(){
        const payload = await loadActiveSupportPlan(clientName, clientId, services);
        renderSupportPlanHost(host, payload, ispCtx);
      }
      try{
        await reloadIsp();
        if(!host.__ispBound){
          host.__ispBound = true;
          host.addEventListener('change', function(ev){
            const t = ev.target;
            if(!t) return;
            if(t.id === 'ispLibBeh'){
              const opt = t.options[t.selectedIndex];
              if(opt && opt.value){
                const risk = document.getElementById('ispRiskBeh');
                const riskLv = document.getElementById('ispRisk');
                const hid = document.getElementById('ispBehLibId');
                if(risk) risk.value = opt.getAttribute('data-label') || opt.textContent || '';
                if(riskLv && opt.getAttribute('data-risk')) riskLv.value = opt.getAttribute('data-risk');
                if(hid) hid.value = opt.value;
              }
            }
            if(t.id === 'ispLibStrat'){
              const opt = t.options[t.selectedIndex];
              if(opt && opt.value){
                const strat = document.getElementById('ispStrat');
                const hid = document.getElementById('ispStratLibId');
                if(strat) strat.value = opt.getAttribute('data-body') || '';
                if(hid) hid.value = opt.value;
              }
            }
          });
          host.addEventListener('click', function(ev){
            const avail = ev.target && ev.target.closest ? ev.target.closest('[data-isp-avail]') : null;
            const approve = ev.target && ev.target.closest ? ev.target.closest('[data-isp-approve]') : null;
            const reject = ev.target && ev.target.closest ? ev.target.closest('[data-isp-reject]') : null;
            const addBtn = ev.target && ev.target.closest ? ev.target.closest('[data-isp-add]') : null;
            const cancelAdd = ev.target && ev.target.closest ? ev.target.closest('[data-isp-cancel-add]') : null;
            const saveItem = ev.target && ev.target.closest ? ev.target.closest('[data-isp-save-item]') : null;
            const editBtn = ev.target && ev.target.closest ? ev.target.closest('[data-isp-edit]') : null;
            if(!avail && !approve && !reject && !addBtn && !cancelAdd && !saveItem && !editBtn) return;
            ev.preventDefault();
            void (async function(){
              try{
                const ctx = host.__ispCtx || ispCtx;
                if(addBtn){
                  const panel = document.getElementById('ispAddPanel');
                  if(panel) panel.hidden = false;
                  const editId = document.getElementById('ispEditItemId');
                  if(editId) editId.value = '';
                  return;
                }
                if(cancelAdd){
                  const panel = document.getElementById('ispAddPanel');
                  if(panel) panel.hidden = true;
                  return;
                }
                if(editBtn){
                  const itemId = editBtn.getAttribute('data-isp-edit');
                  const items = host.__ispItems || [];
                  const row = items.find(function(it){ return String(it.id) === String(itemId); });
                  const panel = document.getElementById('ispAddPanel');
                  if(panel) panel.hidden = false;
                  const editId = document.getElementById('ispEditItemId');
                  if(editId) editId.value = itemId || '';
                  const risk = document.getElementById('ispRiskBeh');
                  const strat = document.getElementById('ispStrat');
                  const riskLv = document.getElementById('ispRisk');
                  const behHid = document.getElementById('ispBehLibId');
                  const stratHid = document.getElementById('ispStratLibId');
                  if(row){
                    if(risk) risk.value = row.risk_behaviour || '';
                    if(strat) strat.value = row.strategy_in_place || '';
                    if(riskLv) riskLv.value = row.risk_level || 'medium';
                    if(behHid) behHid.value = row.behaviour_library_id || '';
                    if(stratHid) stratHid.value = row.strategy_library_id || '';
                    const behSel = document.getElementById('ispLibBeh');
                    const stratSel = document.getElementById('ispLibStrat');
                    if(behSel && row.behaviour_library_id) behSel.value = row.behaviour_library_id;
                    if(stratSel && row.strategy_library_id) stratSel.value = row.strategy_library_id;
                  }
                  return;
                }
                if(saveItem){
                  const planId = (host.__ispLastPlanId) || null;
                  const payloadNow = await loadActiveSupportPlan(ctx.clientName, ctx.clientId, ctx.services);
                  const plan = payloadNow.plan;
                  if(!plan || !plan.id) throw new Error('No plan');
                  const editId = (document.getElementById('ispEditItemId') || {}).value || '';
                  const body = {
                    action: editId ? 'update_plan_item' : 'add_plan_item',
                    plan_id: plan.id,
                    item_id: editId || undefined,
                    risk_behaviour: (document.getElementById('ispRiskBeh') || {}).value || '',
                    strategy_in_place: (document.getElementById('ispStrat') || {}).value || '',
                    risk_level: (document.getElementById('ispRisk') || {}).value || 'medium',
                    behaviour_library_id: (document.getElementById('ispBehLibId') || {}).value || '',
                    strategy_library_id: (document.getElementById('ispStratLibId') || {}).value || '',
                    service_tags: payloadNow.service_tags || []
                  };
                  await staffFollowupApi(body);
                  await reloadIsp();
                  return;
                }
                if(avail){
                  const id = avail.getAttribute('data-isp-avail');
                  const r = avail.getAttribute('data-r');
                  let suggested_at = null;
                  if(r === 'suggest_time'){
                    const raw = window.prompt('Suggest another date/time (e.g. 2026-07-14 15:00)', '');
                    if(raw) suggested_at = new Date(raw).toISOString();
                  }
                  await staffFollowupApi({ action: 'respond_availability', invitee_id: id, response: r, suggested_at });
                  await reloadIsp();
                  return;
                }
                if(approve){
                  await staffFollowupApi({
                    action: 'approve_support_plan',
                    update_id: approve.getAttribute('data-isp-approve'),
                    services: ctx.services || []
                  });
                  await reloadIsp();
                  return;
                }
                if(reject){
                  await staffFollowupApi({ action: 'reject_support_plan', update_id: reject.getAttribute('data-isp-reject') });
                  await reloadIsp();
                }
              }catch(err){
                window.alert((err && err.message) || 'Action failed');
              }
            })();
          });
        }
      }catch(e){
        host.innerHTML = '<p class="pcso-empty" role="status">Could not load support plan. Try again.</p>';
        console.warn('[portal] support plan', e);
      }
    }
    async function openClientSessionsOverviewFullscreen(){
      const sheet = document.getElementById('clientSessionsOverviewSheet');
      const host = document.getElementById('clientSessionsOverviewHost');
      if(!sheet || !host) return;
      const item = currentOpenClientItem;
      const nameEl = document.getElementById('clientTitle');
      const timeEl = document.getElementById('clientTime');
      const ht = document.getElementById('clientSessionsOverviewSheetTitle');
      const sub = document.getElementById('clientSessionsOverviewSheetSub');
      const clientName = item && item.name ? String(item.name).trim() : (nameEl ? nameEl.textContent.trim() : '');
      const clientId = item && item.clientId ? String(item.clientId).trim() : '';
      if(ht) ht.textContent = clientName || 'Sessions Overview';
      if(sub) sub.textContent = timeEl ? timeEl.textContent.trim() : '';
      closeClientGeneralSheet();
      closeClientSupportPlanSheet();
      const ps = document.getElementById('clientPanelSpecialty');
      if(ps) ps.hidden = true;
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'false');
      document.getElementById('clientBtnSupportPlan')?.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('#clientServiceButtonsRow .client-info-btn--service').forEach(b => b.setAttribute('aria-expanded', 'false'));
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      if(backdropEl) backdropEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('clientBtnSessionsOverview')?.setAttribute('aria-expanded', 'true');
      syncDockNavContext();
      if(typeof portalLockLandscape === 'function') void portalLockLandscape();
      if(window.PortalClientSessionsOverview && typeof window.PortalClientSessionsOverview.render === 'function'){
        try{
          await window.PortalClientSessionsOverview.render(host, { clientId, clientName });
        }catch(e){
          host.innerHTML = '<p class="pcso-empty" role="status">Could not load sessions overview. Try again in a moment.</p>';
          console.warn('[portal] sessions overview', e);
        }
      }else{
        host.innerHTML = '<p class="pcso-empty" role="status">Sessions overview is not available on this page.</p>';
      }
    }
    function closeClientGeneralSheet(){
      const sheet = document.getElementById('clientGeneralSheet');
      if(!sheet || !sheet.classList.contains('open')) return;
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('portal-client-general-open');
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
      closeClientSessionsOverviewSheet();
      closeClientSupportPlanSheet();
      const item = currentOpenClientItem;
      const nameEl = document.getElementById('clientTitle');
      const timeEl = document.getElementById('clientTime');
      const ht = document.getElementById('clientGeneralSheetTitle');
      const sub = document.getElementById('clientGeneralSheetSub');
      if(ht) ht.textContent = nameEl ? nameEl.textContent.trim() : 'Participant';
      if(sub) sub.textContent = timeEl ? timeEl.textContent.trim() : '';
      setClientInfoFormattedBody('clientGeneral', resolveClientGeneralInfoText(item), 'No general information available.');
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      document.body.classList.add('portal-client-general-open');
      if(backdropEl) backdropEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('clientBtnGeneral')?.setAttribute('aria-expanded', 'true');
      syncDockNavContext();
    }
    function resetClientInfoPanels(){
      const ps = document.getElementById('clientPanelSpecialty');
      const bg = document.getElementById('clientBtnGeneral');
      const so = document.getElementById('clientBtnSessionsOverview');
      const sp = document.getElementById('clientBtnSupportPlan');
      closeClientGeneralSheet();
      closeClientSessionsOverviewSheet();
      closeClientSupportPlanSheet();
      if(ps) ps.hidden = true;
      if(bg) bg.setAttribute('aria-expanded', 'false');
      if(so) so.setAttribute('aria-expanded', 'false');
      if(sp) sp.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('#clientServiceButtonsRow .client-info-btn--service').forEach(b => b.setAttribute('aria-expanded', 'false'));
    }
    function resolveClientServiceActivities(item){
      let list = [];
      if(item && item.clientId && !CLIENT_LIST_PSEUDO_IDS.includes(item.clientId)){
        list = getDistinctScheduledActivitiesForClient(item.clientId);
      }
      if(!list.length && item && item.activity && !isBespokeActivity(item.activity)){
        list = [canonicalServiceActivityForSheet(item.activity)];
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
      const body = pickSpecialtyBody(c, activity) || '';
      setClientInfoFormattedBody('clientSpecialtyBody', body, 'No information for this programme.');
      if(genSheet && genSheet.classList.contains('open')) closeClientGeneralSheet();
      const soSheet = document.getElementById('clientSessionsOverviewSheet');
      if(soSheet && soSheet.classList.contains('open')) closeClientSessionsOverviewSheet();
      if(genBtn) genBtn.setAttribute('aria-expanded', 'false');
      document.getElementById('clientBtnSessionsOverview')?.setAttribute('aria-expanded', 'false');
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
      if(!portalStaffIsDemoAccount()){
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
      const abs = document.getElementById('clientQuickAbsence');
      const inc = document.getElementById('clientQuickIncident');
      const can = document.getElementById('clientQuickCancellation');
      const item = currentOpenClientItem;
      if(!fb || !abs || !inc || !can) return;
      if(!item || !item.sessionKey){
        fb.disabled = true;
        abs.disabled = true;
        inc.disabled = true;
        can.disabled = true;
        return;
      }
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || { feedbackDone: false, incident: false, absent: false, cancelled: false };
      const ended = isSessionEndedForFeedback(item);
      const terminal = !!(rec.absent || rec.cancelled);
      const actionsDisabledByOverride = !!(item && item.actionsDisabled);
      const bypass = portalStaffIsDemoAccount();
      fb.disabled = actionsDisabledByOverride || terminal || !!rec.feedbackDone || (!bypass && !ended);
      fb.title = actionsDisabledByOverride
        ? 'Disabled: session already resolved by Admin as Absent'
        : terminal
        ? (rec.absent ? 'Absence recorded (feedback not required)' : 'Cancellation recorded')
        : (rec.feedbackDone ? 'Feedback already recorded' : ((!bypass && !ended) ? 'Available after the session ends' : 'Open session feedback form'));
      abs.disabled = actionsDisabledByOverride || terminal || !!rec.feedbackDone || (!bypass && !ended);
      abs.title = actionsDisabledByOverride
        ? 'Disabled: session already resolved by Admin as Absent'
        : terminal
        ? (rec.absent ? 'Absence recorded' : 'Cancellation already recorded')
        : (rec.feedbackDone ? 'Feedback already recorded; absence unavailable' : ((!bypass && !ended) ? 'Available after the session ends' : 'Mark this session as absent (feedback not required)'));
      inc.disabled = actionsDisabledByOverride || terminal || (!bypass && !ended);
      inc.title = actionsDisabledByOverride
        ? 'Disabled: session already resolved by Admin as Absent'
        : terminal
        ? 'Session closed (absence or cancellation)'
        : ((!bypass && !ended) ? 'Available after the session ends' : 'Record an incident (row stays orange)');
      can.disabled = actionsDisabledByOverride || terminal || (!bypass && !ended);
      can.title = actionsDisabledByOverride
        ? 'Disabled: session already resolved by Admin as Absent'
        : terminal
        ? 'Already set'
        : ((!bypass && !ended) ? 'Available after the session ends' : 'Record absence or full cancellation for this session');
    }

    function executeClientQuickFeedback(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.feedbackDone || rec.absent || rec.cancelled) return;
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      if(!confirm('Mark feedback as completed for this session?')) return;
      mergeSessionReview(item, prev => ({ ...prev, feedbackDone: true }));
      closeSheet();
      renderToday();
    }
    async function handleClientQuickFeedback(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.feedbackDone || rec.absent || rec.cancelled) return;
      if(typeof portalEnsureLateSubmissionAllowed === 'function' && !portalStaffIsDemoAccount()){
        const gate = await portalEnsureLateSubmissionAllowed(item, 'feedback');
        if(!gate.allowed) return;
      }
      var feedbackReturnHref = '';
      try{
        const ret = new URL(portalFeedbackDashboardReturnUrl());
        ret.searchParams.set('portalPostFeedback', '1');
        const reviewDay = portalWeekdayLongFromSessionDateKey(item.sessionKey) || String(DEMO_VIEW_DAY || '').trim();
        if(reviewDay) ret.searchParams.set('portalReviewDay', reviewDay);
        const skRawFb = String(item.sessionKey || '');
        const dateFromKeyFb = (skRawFb.split('|')[0] || '').trim();
        if(/^\d{4}-\d{2}-\d{2}$/.test(dateFromKeyFb)) ret.searchParams.set('portalReviewDate', dateFromKeyFb);
        ret.searchParams.set('portalReviewOrigin', portalGetReviewFlowOrigin());
        try{
          if(typeof portalStaffIsHistoricalReviewDayMode === 'function' && !portalStaffIsHistoricalReviewDayMode()){
            const roFb = typeof portalGetReviewFlowOrigin === 'function' ? portalGetReviewFlowOrigin() : 'dashboard';
            if(roFb === 'dashboard') ret.searchParams.set('portalReturnToToday', '1');
          }
        }catch(_){}
        feedbackReturnHref = ret.href;
        sessionStorage.setItem('__portal_feedback_return_v1', feedbackReturnHref);
        try{ sessionStorage.setItem('__portal_feedback_origin_v1', portalGetReviewFlowOrigin()); }catch(_){}
        if(reviewDay) sessionStorage.setItem('__portal_feedback_review_day_v1', reviewDay);
        sessionStorage.setItem('__portal_feedback_staff_rota_key_v1', String(STAFF_DASHBOARD_ID || '').trim().toLowerCase());
      }catch(_){}
      const base = portalSessionFeedbackPageBase();
      const params = new URLSearchParams();
      params.set('sessionKey', String(item.sessionKey));
      const nmFb = String(item.name || '').trim();
      if(nmFb) params.set('clientName', nmFb);
      const cid = String(item.clientId || '').trim();
      if(cid && cid !== 'available' && cid !== 'closed') params.set('clientId', cid);
      const svc = portalFeedbackFormServiceLabel(item && item.activity)
        || portalFeedbackFormServiceLabel(item && item.__portalBaseSession && item.__portalBaseSession.activity)
        || 'Session feedback';
      params.set('service', String(svc).trim());
      const skRawFbNav = String(item.sessionKey || '').split('|')[0].trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(skRawFbNav)) params.set('date', skRawFbNav);
      const tlabFb = String(item.time || '').trim();
      if(tlabFb) params.set('time', tlabFb);
      params.set('from_portal', portalFormFromPortalParam());
      params.set('origin', portalGetReviewFlowOrigin());
      if(typeof portalIsPastSessionDateIso === 'function' && portalIsPastSessionDateIso(skRawFbNav)){
        params.set('lateApproved', '1');
      }
      if(feedbackReturnHref) params.set('return', feedbackReturnHref);
      const finalUrl = base.split('#')[0].split('?')[0] + '?' + params.toString();
      window.location.assign(finalUrl);
    }

    function executeClientQuickAbsence(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.cancelled || rec.absent || rec.feedbackDone) return;
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      if(!confirm('Mark this session as absent? Feedback will no longer be required.\n\nThis only counts when it saves to the club server — not only on this phone.')) return;
      const absBtn = document.getElementById('clientQuickAbsence');
      if(absBtn){
        absBtn.disabled = true;
        absBtn.setAttribute('aria-busy', 'true');
      }
      const commit = typeof portalCommitClientQuickAbsence === 'function'
        ? portalCommitClientQuickAbsence
        : null;
      if(!commit){
        alert('Could not save absence — please refresh and try again.');
        if(absBtn){
          absBtn.disabled = false;
          absBtn.removeAttribute('aria-busy');
        }
        return;
      }
      void commit(item).then(function(res){
        if(absBtn) absBtn.removeAttribute('aria-busy');
        if(!res || !res.ok){
          alert('Absence did not save to the club server. Check your connection and try again — the session stays open until it saves.');
          if(typeof updateClientQuickActions === 'function') updateClientQuickActions();
          return;
        }
        if(typeof updateClientQuickActions === 'function') updateClientQuickActions();
      }).catch(function(){
        if(absBtn) absBtn.removeAttribute('aria-busy');
        alert('Absence did not save to the club server. Check your connection and try again.');
        if(typeof updateClientQuickActions === 'function') updateClientQuickActions();
      });
    }
    function handleClientQuickAbsence(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.cancelled || rec.absent) return;
      if(rec.feedbackDone){
        alert('Feedback already exists for this session. Absence cannot be recorded.');
        return;
      }
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      runAfterDemoQuickGate(executeClientQuickAbsence);
    }

    async function executeClientQuickIncident(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.absent || rec.cancelled) return;
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      if(typeof portalEnsureLateSubmissionAllowed === 'function' && !portalStaffIsDemoAccount()){
        const gate = await portalEnsureLateSubmissionAllowed(item, 'incident');
        if(!gate.allowed) return;
      }
      const base = buildIncidentReportPageUrl(item);
      let finalUrl = base;
      try{
        const u = new URL(base, window.location.href);
        if(typeof portalIsPastSessionDateIso === 'function' && portalIsPastSessionDateIso(portalSessionIsoFromKey(item.sessionKey))){
          u.searchParams.set('lateApproved', '1');
        }
        finalUrl = u.href;
      }catch(_){
        finalUrl = 'portal-incident.html';
      }
      window.location.assign(finalUrl);
    }
    function handleClientQuickIncident(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.absent || rec.cancelled) return;
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      runAfterDemoQuickGate(executeClientQuickIncident);
    }

    async function executeClientQuickCancellation(itemOverride){
      const item = itemOverride || currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      if(sessionModelStatus(item) === 'Available') return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.absent || rec.cancelled) return;
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      if(typeof portalEnsureLateSubmissionAllowed === 'function' && !portalStaffIsDemoAccount()){
        const gate = await portalEnsureLateSubmissionAllowed(item, 'cancellation');
        if(!gate.allowed) return;
      }
      const base = buildCancellationReportPageUrl(item);
      let finalUrl = base;
      try{
        const u = new URL(base, window.location.href);
        if(typeof portalIsPastSessionDateIso === 'function' && portalIsPastSessionDateIso(portalSessionIsoFromKey(item.sessionKey))){
          u.searchParams.set('lateApproved', '1');
        }
        finalUrl = u.href;
      }catch(_){
        finalUrl = 'cancellation.html';
      }
      window.location.assign(finalUrl);
    }
    function handleClientQuickCancellation(){
      const item = currentOpenClientItem;
      if(!item || !item.sessionKey) return;
      if(item.actionsDisabled) return;
      if(sessionModelStatus(item) === 'Available') return;
      const rec = (typeof getEffectiveSessionReviewRecord === 'function'
        ? getEffectiveSessionReviewRecord(item)
        : getSessionReviewRecord(item)) || {};
      if(rec.absent || rec.cancelled) return;
      if(!portalStaffIsDemoAccount() && !isSessionEndedForFeedback(item)) return;
      const itemSnapshot = {
        sessionKey: item.sessionKey,
        name: item.name,
        activity: item.activity,
        clientId: item.clientId,
        time: item.time
      };
      runAfterDemoQuickGate(function(){ executeClientQuickCancellation(itemSnapshot); });
    }

    function openClient(item){
      if(!item || item.kind !== 'client' || item.openSheet === false) return;
      currentOpenClientItem = item;
      try{
        const recOpen = (typeof getEffectiveSessionReviewRecord === 'function'
          ? getEffectiveSessionReviewRecord(item)
          : getSessionReviewRecord(item)) || {};
        if(typeof isSessionEndedForFeedback === 'function' && isSessionEndedForFeedback(item)
          && !recOpen.feedbackDone && !recOpen.absent && !recOpen.cancelled){
          window.__PORTAL_TERM_JUDGEMENT_ALLOWED = true;
        }
      }catch(_){}
      resetClientInfoPanels();
      const gen = resolveClientGeneralInfoText(item);
      document.getElementById('clientTitle').textContent = item.name;
      document.getElementById('clientTime').textContent = item.time;
      syncClientPhotoSlot(item.name, item.clientId);
      setClientInfoFormattedBody('clientGeneral', gen, 'No general information available.');
      setClientInfoFormattedBody('clientSpecialtyBody', '', 'No information for this programme.');
      renderClientServiceButtons([]);
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

    portalInitNextSessionParticipantDelegation();
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
    document.getElementById('announcementsSheetBackBtn')?.addEventListener('click', function(){
      if(typeof closeSheet === 'function') closeSheet();
    });
    document.getElementById('clientSessionsOverviewSheetBack')?.addEventListener('click', closeClientSessionsOverviewSheet);
    const clientBtnSessionsOverview = document.getElementById('clientBtnSessionsOverview');
    if(clientBtnSessionsOverview){
      clientBtnSessionsOverview.addEventListener('click', () => {
        const sheet = document.getElementById('clientSessionsOverviewSheet');
        if(sheet && sheet.classList.contains('open')){
          closeClientSessionsOverviewSheet();
          return;
        }
        openClientSessionsOverviewFullscreen();
      });
    }
    document.getElementById('clientSupportPlanSheetBack')?.addEventListener('click', closeClientSupportPlanSheet);
    const clientBtnSupportPlan = document.getElementById('clientBtnSupportPlan');
    if(clientBtnSupportPlan){
      clientBtnSupportPlan.addEventListener('click', () => {
        const sheet = document.getElementById('clientSupportPlanSheet');
        if(sheet && sheet.classList.contains('open')){
          closeClientSupportPlanSheet();
          return;
        }
        openClientSupportPlanFullscreen();
      });
    }
    document.getElementById('clientServiceButtonsRow')?.addEventListener('click', e => {
      const btn = e.target.closest('.client-info-btn--service');
      if(!btn) return;
      toggleClientServicePanel(btn);
    });

    document.getElementById('clientsTabMy')?.addEventListener('click', () => setClientsSheetTab('my'));
    document.getElementById('clientsTabNew')?.addEventListener('click', () => setClientsSheetTab('new'));
    document.getElementById('clientsTabAll')?.addEventListener('click', () => setClientsSheetTab('all'));
    document.getElementById('clientsDirectorySearch')?.addEventListener('input', () => refreshClientsAllTabUI());
    document.getElementById('clientsDirectorySearch')?.addEventListener('keydown', e => {
      if(e.key === 'Escape'){
        const sug = document.getElementById('clientsDirectorySuggest');
        const si = document.getElementById('clientsDirectorySearch');
        if(sug && !sug.hidden){
          sug.hidden = true;
          sug.innerHTML = '';
          e.preventDefault();
        }
        if(si && String(si.value || '').trim()){
          si.value = '';
          refreshClientsAllTabUI();
          e.preventDefault();
        }
      }
    });
    document.getElementById('clientsDirectorySuggest')?.addEventListener('click', e => {
      const opt = e.target.closest('.clients-suggest-option[data-client-id]');
      if(opt) pickClientFromDirectorySearch(opt.getAttribute('data-client-id'));
    });
    document.getElementById('clientsListGrid')?.addEventListener('click', e => {
      const btn = e.target.closest('.clients-grid-card[data-client-id]');
      if(!btn) return;
      const clientId = btn.getAttribute('data-client-id');
      const mode = btn.getAttribute('data-list-mode');
      const sub = mode === 'all' ? CLIENT_DIRECTORY_PREP_LINE
        : (mode === 'new' ? CLIENT_NEW_PARTICIPANTS_PREP_LINE : '');
      const item = buildClientDirectorySheetItem(clientId, sub);
      if(!item) return;
      /* Clients overview (My + All): no session context → hide Feedback / Incident / Cancellation */
      item.directoryProfile = true;
      openClient(item);
    });

    const clientQuickFeedback = document.getElementById('clientQuickFeedback');
    const clientQuickAbsence = document.getElementById('clientQuickAbsence');
    const clientQuickIncident = document.getElementById('clientQuickIncident');
    const clientQuickCancellation = document.getElementById('clientQuickCancellation');
    if(clientQuickFeedback) clientQuickFeedback.addEventListener('click', handleClientQuickFeedback);
    if(clientQuickAbsence) clientQuickAbsence.addEventListener('click', handleClientQuickAbsence);
    if(clientQuickIncident) clientQuickIncident.addEventListener('click', handleClientQuickIncident);
    if(clientQuickCancellation) clientQuickCancellation.addEventListener('click', handleClientQuickCancellation);

    function handleDashboardDockClick(){
      function dashboardDockEarlyExit(){
        if(document.getElementById('internalChatSheet')?.classList.contains('open')){
          try{
            window.__PORTAL_INTERNAL_CHAT_UI = window.__PORTAL_INTERNAL_CHAT_UI || {};
            var dmTid = window.__PORTAL_INTERNAL_CHAT_UI.threadId ? String(window.__PORTAL_INTERNAL_CHAT_UI.threadId).trim() : '';
            if(dmTid && typeof portalStaffDmMarkThreadSeenNow === 'function') portalStaffDmMarkThreadSeenNow(dmTid);
            window.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
            window.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen = false;
          }catch(_dm){}
          if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
          if(typeof window.portalStaffDmSyncUnreadChrome === 'function') void window.portalStaffDmSyncUnreadChrome();
          return true;
        }
        const demoOv = document.getElementById('demoQuickActionOverlay');
        if(demoOv && !demoOv.hidden){
          hideDemoQuickOverlay();
          return true;
        }
        const lockIso = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '').trim();
        const lockDay = String(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DAY_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DAY_URL_LOCK) || '').trim();
        const flowOrigin = (typeof portalGetReviewFlowOrigin === 'function') ? portalGetReviewFlowOrigin() : 'dashboard';
        const stickyReview = !!(typeof window !== 'undefined' && window.__PORTAL_STICKY_REVIEW_DAY_LOAD__);
        const historicalHeading = (typeof portalTodaySectionTitleText === 'function') ? portalTodaySectionTitleText() : 'Today';
        const shouldForceHistoricalExit = !!lockIso || !!lockDay || stickyReview || flowOrigin === 'term' || historicalHeading !== 'Today';
        const exitedHistorical = (typeof portalExitHistoricalReviewToLiveTodayMode === 'function')
          ? portalExitHistoricalReviewToLiveTodayMode(shouldForceHistoricalExit)
          : false;
        if(exitedHistorical && typeof closeSheet === 'function'){
          closeSheet({ bypassAnnouncementLock: true });
        }
        return false;
      }
      const navResult = typeof portalHandleDashboardDockHome === 'function'
        ? portalHandleDashboardDockHome(dashboardDockEarlyExit)
        : 'home';
      if(navResult === 'handled' || navResult === 'back') return;
      if(typeof portalScrollDashboardHome === 'function') portalScrollDashboardHome();
    }
    function handleParticipantsDockClick(){
      const demoOv = document.getElementById('demoQuickActionOverlay');
      if(demoOv && !demoOv.hidden){
        hideDemoQuickOverlay();
        return;
      }
      if(typeof portalToggleParticipantsFromDock === 'function'){
        portalToggleParticipantsFromDock();
        return;
      }
      openSheet('clientsSheet');
    }
    function handleQuickMenuDockClick(){
      portalQuickMenuEntryMode = 'full';
      if(document.getElementById('internalChatSheet')?.classList.contains('open')){
        portalCloseInternalChatReturnToAlertsMenu();
        return;
      }
      const demoOv = document.getElementById('demoQuickActionOverlay');
      if(demoOv && !demoOv.hidden){
        hideDemoQuickOverlay();
        return;
      }
      const lockIso = String(typeof __PORTAL_REVIEW_DATE_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DATE_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DATE_URL_LOCK) || '').trim();
      const lockDay = String(typeof __PORTAL_REVIEW_DAY_URL_LOCK !== 'undefined' ? __PORTAL_REVIEW_DAY_URL_LOCK : (typeof window !== 'undefined' && window.__PORTAL_REVIEW_DAY_URL_LOCK) || '').trim();
      const flowOrigin = (typeof portalGetReviewFlowOrigin === 'function') ? portalGetReviewFlowOrigin() : 'dashboard';
      const stickyReview = !!(typeof window !== 'undefined' && window.__PORTAL_STICKY_REVIEW_DAY_LOAD__);
      const historicalHeading = (typeof portalTodaySectionTitleText === 'function') ? portalTodaySectionTitleText() : 'Today';
      const shouldForceHistoricalExit = !!lockIso || !!lockDay || stickyReview || flowOrigin === 'term' || historicalHeading !== 'Today';
      const exitedHistorical = (typeof portalExitHistoricalReviewToLiveTodayMode === 'function')
        ? portalExitHistoricalReviewToLiveTodayMode(shouldForceHistoricalExit)
        : false;
      if(exitedHistorical){
        if(typeof portalToggleQuickMenuFromDock === 'function') portalToggleQuickMenuFromDock();
        else openSheet('menuSheet');
        return;
      }
      const genSh = document.getElementById('clientGeneralSheet');
      if(genSh && genSh.classList.contains('open')){
        closeClientGeneralSheet();
      }
      if(typeof portalToggleQuickMenuFromDock === 'function'){
        portalToggleQuickMenuFromDock();
        return;
      }
      openSheet('menuSheet', { skipNavRecord: true, bypassAnnouncementLock: true });
    }
    window.openSheet = openSheet;
    window.handleQuickMenuDockClick = handleQuickMenuDockClick;
    window.closeSheet = closeSheet;
    window.closeClientGeneralSheet = closeClientGeneralSheet;
    window.closeClientSessionsOverviewSheet = closeClientSessionsOverviewSheet;
    if(typeof portalInitSheetBackNavigation === 'function') portalInitSheetBackNavigation();
    document.getElementById('dockDashboardTile')?.addEventListener('click', function(){
      globalThis.setTimeout(handleDashboardDockClick, 0);
    });
    document.getElementById('dockParticipantsTile')?.addEventListener('click', function(){
      globalThis.setTimeout(handleParticipantsDockClick, 0);
    });
    document.getElementById('dockQuickMenuTile')?.addEventListener('click', function(){
      globalThis.setTimeout(handleQuickMenuDockClick, 0);
    });
    if(typeof syncDockNavContext === 'function') syncDockNavContext();
    if(typeof portalSyncQuickMenuDockChrome === 'function') portalSyncQuickMenuDockChrome();
    if(typeof portalSyncParticipantsDockChrome === 'function') portalSyncParticipantsDockChrome();
    const avatarWrapEl = document.getElementById('avatarWrap');
    if(avatarWrapEl){
      avatarWrapEl.addEventListener('click', handleHeaderLogoAlertsClick);
      avatarWrapEl.addEventListener('keydown', function(ev){
        if(ev.key === 'Enter' || ev.key === ' '){
          ev.preventDefault();
          handleHeaderLogoAlertsClick();
        }
      });
    }
    document.getElementById('termCalIntroUnderstood')?.addEventListener('click', dismissTermCalendarColorIntro);

    function portalCloseTermSheetToDashboard(){
      if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
      document.body.style.overflow = '';
      if(typeof portalScrollDashboardHome === 'function') portalScrollDashboardHome();
    }
    document.getElementById('termSheetCloseBtn')?.addEventListener('click', portalCloseTermSheetToDashboard);
    const termSheetHandle = document.getElementById('termSheetHandle');
    if(termSheetHandle){
      termSheetHandle.addEventListener('click', portalCloseTermSheetToDashboard);
      termSheetHandle.addEventListener('keydown', function(e){
        if(e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        portalCloseTermSheetToDashboard();
      });
    }

    (function bindTermGridPendingReviewNavigation(){
      const grid = document.getElementById('termGrid');
      if(!grid) return;
      function activateTermLateReview(cell){
        const iso = String(cell.getAttribute('data-term-review-date') || '').trim();
        const dayWord = String(cell.getAttribute('data-term-review-weekday') || '').trim();
        if(!iso || !portalParseIsoDateLocal(iso) || !dayWord || !PORTAL_WEEK_REVIEW_VALID_DAYS.has(dayWord)) return;
        portalSetReviewFlowOrigin('term');
        const judgement = cell.getAttribute('data-term-review-judgement') === '1';
        const openDay = function(){
          if(typeof portalOpenWeekDayReviewFlow === 'function'){
            portalOpenWeekDayReviewFlow(dayWord, { portalReviewDate: iso, portalTermJudgementAllowed: judgement });
          }
        };
        openDay();
      }
      grid.addEventListener('click', function(e){
        const cell = e.target && e.target.closest ? e.target.closest('.term-cal-day[data-term-review-date]') : null;
        if(!cell) return;
        e.preventDefault();
        activateTermLateReview(cell);
      });
      grid.addEventListener('keydown', function(e){
        if(e.key !== 'Enter' && e.key !== ' ') return;
        const cell = e.target && e.target.closest ? e.target.closest('.term-cal-day[data-term-review-date]') : null;
        if(!cell || !grid.contains(cell)) return;
        e.preventDefault();
        activateTermLateReview(cell);
      });
    })();

    /* From mobile view (narrow viewport or simulator), subpages should open in mobile layout (?m=1 + sessionStorage). */
    document.addEventListener('click', e => {
      if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if(!a || a.target === '_blank') return;
      let href = a.getAttribute('href');
      if(!href || /^(?:#|mailto:|tel:)/i.test(href) || /^https?:\/\//i.test(href)) return;
      const pathOnly = href.split('#')[0].split('?')[0].trim();
      if(!/\.html$/i.test(pathOnly)) return;
      if(/^staff_dashboard\.html$/i.test(pathOnly.replace(/^.*\//,''))) return;
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
      if(document.getElementById('internalChatSheet')?.classList.contains('open')){
        return;
      }
      if(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive()){
        if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
        return;
      }
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
      if(document.getElementById('internalChatSheet')?.classList.contains('open')){
        e.preventDefault();
        return;
      }
      if(typeof portalAnnouncementLockActive === 'function' && portalAnnouncementLockActive()){
        e.preventDefault();
        if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
        return;
      }
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
      const openId = () => {
        openSheet(el.getAttribute('data-open'));
      };
      el.addEventListener('click', openId);
      el.addEventListener('keydown', e => {
        if(e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openId();
      });
    });
    document.addEventListener('change', function(e){
      const chk = e.target && e.target.id === 'safeguardingPolicyReadConfirm' ? e.target : null;
      if(!chk) return;
      const btn = document.getElementById('portalSafeguardingPolicyAckBtn');
      if(btn) btn.disabled = !chk.checked;
    });
    document.addEventListener('click', function(e){
      const pol = e.target.closest('[data-action="open-safeguarding-feedback-policy"]');
      if(pol){
        e.preventDefault();
        e.stopPropagation();
        openSheet('safeguardingFeedbackPolicySheet');
        return;
      }
      const polAck = e.target && e.target.closest ? e.target.closest('#portalSafeguardingPolicyAckBtn') : null;
      if(polAck){
        if(typeof portalMarkSafeguardingFeedbackPolicyRead === 'function') portalMarkSafeguardingFeedbackPolicyRead();
        if(typeof renderSafeguardingFeedbackPolicySheet === 'function') renderSafeguardingFeedbackPolicySheet();
        if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
        return;
      }
      const calOpen = e.target.closest('#portalOpenCalendar202627');
      if(calOpen){
        e.preventDefault();
        e.stopPropagation();
        const calUrl = typeof portalCalendar202627SectionUrl === 'function'
          ? portalCalendar202627SectionUrl()
          : '/portal/day-centre-calendar-2026-27-section.html';
        if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
        globalThis.location.assign(calUrl);
        return;
      }
      const ann = e.target.closest('#announcementNewNotice, #announcementSignedLog');
      if(ann){
        e.preventDefault();
        e.stopPropagation();
        portalOpenAnnouncementsSheet(ann.id === 'announcementSignedLog' ? 'signedLog' : 'newNotice');
        return;
      }
      const trn = e.target.closest('#trainingNotice.notice--opens-setup');
      if(trn){
        e.preventDefault();
        e.stopPropagation();
        openSheet('setupReminderSheet');
      }
    }, true);

    document.addEventListener('keydown', function(e){
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const pol = e.target.closest('[data-action="open-safeguarding-feedback-policy"]');
      if(pol){
        e.preventDefault();
        openSheet('safeguardingFeedbackPolicySheet');
        return;
      }
      const calOpen = e.target.closest('#portalOpenCalendar202627');
      if(calOpen){
        e.preventDefault();
        const calUrl = typeof portalCalendar202627SectionUrl === 'function'
          ? portalCalendar202627SectionUrl()
          : '/portal/day-centre-calendar-2026-27-section.html';
        if(typeof closeSheet === 'function') closeSheet({ bypassAnnouncementLock: true });
        globalThis.location.assign(calUrl);
        return;
      }
      const ann = e.target.closest('#announcementNewNotice, #announcementSignedLog');
      if(ann){
        e.preventDefault();
        portalOpenAnnouncementsSheet(ann.id === 'announcementSignedLog' ? 'signedLog' : 'newNotice');
        return;
      }
      const trn = e.target.closest('#trainingNotice.notice--opens-setup');
      if(trn){
        e.preventDefault();
        openSheet('setupReminderSheet');
      }
    }, true);
    document.addEventListener('change', function(e){
      const chk = e.target && e.target.id === 'announcementReadConfirm' ? e.target : null;
      if(!chk) return;
      const btn = document.getElementById('announcementSignBtn');
      if(btn) btn.disabled = !chk.checked;
    });
    document.addEventListener('click', function(e){
      const annualBtn = e.target && e.target.closest ? e.target.closest('#annualProfileAnnOpenBtn') : null;
      if(annualBtn){
        e.preventDefault();
        if(typeof portalOpenAnnualProfileUpdate === 'function'){
          void portalOpenAnnualProfileUpdate('staff_profile_update.html');
        }else{
          window.location.href = 'staff_profile_update.html';
        }
        return;
      }
      const calendarDownloadBtn = e.target && e.target.closest ? e.target.closest('#calendar202627DownloadBtn') : null;
      if(calendarDownloadBtn){
        e.preventDefault();
        if(typeof portalDownloadCalendar202627Pdf !== 'function'){
          return;
        }
        const statusEl = document.getElementById('calendar202627DownloadStatus');
        const prevLabel = calendarDownloadBtn.textContent;
        calendarDownloadBtn.disabled = true;
        if(statusEl){
          statusEl.hidden = false;
          statusEl.textContent = 'Preparing PDF…';
        }
        void portalDownloadCalendar202627Pdf().then(function(result){
          if(statusEl){
            statusEl.textContent = result && result.alreadyHad
              ? 'Already in My Documents — download started on your device.'
              : 'Saved to My Documents — download started on your device.';
          }
        }).catch(function(err){
          try{ console.warn('[portal] calendar 2026/27 download', err); }catch(_){}
          if(statusEl){
            statusEl.textContent = 'Could not save the PDF. Please try again.';
          }
        }).finally(function(){
          calendarDownloadBtn.disabled = false;
          calendarDownloadBtn.textContent = prevLabel;
        });
        return;
      }
      const signBtn = e.target && e.target.closest ? e.target.closest('#announcementSignBtn') : null;
      if(signBtn){
        e.preventDefault();
        const chk = document.getElementById('announcementReadConfirm');
        if(chk && !chk.checked) return;
        const key = String(signBtn.getAttribute('data-announcement-sign-key') || '').trim();
        if(!key) return;
        const pending = portalAnnouncementPendingItem();
        const expected = pending ? portalSignableSignatureKey(pending) : '';
        if(!pending || key !== expected){
          try{ console.warn('[portal] announcement sign key mismatch', { key: key, expected: expected }); }catch(_){}
          return;
        }
        const isProfileCampaign =
          typeof portalSignableItemIsAnnualProfileCampaign === 'function' &&
          portalSignableItemIsAnnualProfileCampaign(pending);
        if(typeof portalActivatePermissionsFromSignableItem === 'function'){
          void portalActivatePermissionsFromSignableItem(pending);
        }
        const isReminder = portalSignableItemIsReminder(pending);
        if(isReminder){
          const remAck = portalReminderAckMapLoad();
          remAck[key] = {
            title: pending.title || 'Reminder',
            text: pending.text || '',
            signedAt: Date.now(),
            portalAdminReminderId: pending.portalAdminReminderId || ''
          };
          portalReminderAckMapSave(remAck);
          if(isProfileCampaign && typeof portalAckAllAnnualProfileCampaignReminders === 'function'){
            portalAckAllAnnualProfileCampaignReminders(
              portalReminderAckMapLoad,
              portalReminderAckMapSave,
              dashboardData && dashboardData.portalRemindersFromAdmin,
              typeof portalPersistReminderAckToSupabase === 'function'
                ? portalPersistReminderAckToSupabase
                : null
            );
          }
          if(typeof portalPersistReminderAckToSupabase === 'function'){
            void portalPersistReminderAckToSupabase(pending);
          }
        }else{
        const ack = portalAnnouncementAckMapLoad();
        ack[key] = {
          title: pending.title || 'Announcement',
          text: pending.text || '',
          href: pending.href || '',
          signedAt: Date.now(),
          hideAfterAckAmount: pending.hideAfterAckAmount,
          hideAfterAckUnit: pending.hideAfterAckUnit,
          portalAnnouncementId: pending.portalAnnouncementId || ''
        };
        portalAnnouncementAckMapSave(ack);
        if(typeof portalPersistAnnouncementAckToSupabase === 'function'){
          void portalPersistAnnouncementAckToSupabase(pending);
        }
        }
        try{
          const sysDone = JSON.parse(sessionStorage.getItem('portalAnnSystemNotified_v1') || '{}') || {};
          sysDone[key] = Date.now();
          sessionStorage.setItem('portalAnnSystemNotified_v1', JSON.stringify(sysDone));
        }catch(_sysAnn){}
        portalAnnouncementLockRequired = false;
        renderAnnouncementsSheetContent();
        if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
        if(typeof renderHeader === 'function') renderHeader();
        if(isProfileCampaign){
          if(typeof portalOpenAnnualProfileUpdate === 'function'){
            void portalOpenAnnualProfileUpdate('staff_profile_update.html');
          }else{
            window.location.href = 'staff_profile_update.html';
          }
          return;
        }
        var hideMs = isReminder ? null : portalAnnouncementHideDelayMs(pending);
        if(hideMs && hideMs > 0 && hideMs < 7 * 24 * 60 * 60 * 1000){
          setTimeout(function(){
            if(typeof renderAnnouncementsSheetContent === 'function') renderAnnouncementsSheetContent();
            if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
            if(typeof renderHeader === 'function') renderHeader();
          }, hideMs + 80);
        }
        return;
      }
      const tog = e.target && e.target.closest ? e.target.closest('[data-announcement-toggle]') : null;
      if(tog){
        const item = tog.closest('.announcement-history-item');
        if(item) item.classList.toggle('is-open');
      }
    });
    if(typeof portalSyncAnnouncementBeforeUnloadListener === 'function') portalSyncAnnouncementBeforeUnloadListener();

    const menuViewModeToggle = document.getElementById('menuViewModeToggle');
    if(menuViewModeToggle){
      menuViewModeToggle.addEventListener('click', e => {
        e.stopPropagation();
        if(typeof window.staffDevMobileToggle === 'function') window.staffDevMobileToggle(e);
      });
    }

    function portalUrlBase64ToUint8Array(base64String){
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for(let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    }
    /**
     * Registers PushManager + POSTs subscription to Edge `portal-push-subscribe` so roster Web Push can arrive when this app is not open.
     * @returns {Promise<{ok?:boolean,reason?:string}>}
     */
    window.portalEnsureWebPushSubscription = async function portalEnsureWebPushSubscription(){
      if(window.__PORTAL_WPS_IN_FLIGHT_PROMISE) return window.__PORTAL_WPS_IN_FLIGHT_PROMISE;
      window.__PORTAL_WPS_IN_FLIGHT_PROMISE = (async function(){
      try{
        if(typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { ok: false, reason: 'no-sw' };
        if(typeof Notification === 'undefined' || Notification.permission !== 'granted') return { ok: false, reason: 'no-notify-perm' };
        const vapid = (typeof window !== 'undefined' && window.__PORTAL_VAPID_PUBLIC_KEY__)
          ? String(window.__PORTAL_VAPID_PUBLIC_KEY__).trim()
          : String(PORTAL_VAPID_PUBLIC_KEY || '').trim();
        if(!vapid) return { ok: false, reason: 'no-vapid' };
        const reg = typeof window.portalAwaitServiceWorkerReady === 'function'
          ? await window.portalAwaitServiceWorkerReady(15000)
          : await navigator.serviceWorker.ready;
        const keyU8 = portalUrlBase64ToUint8Array(vapid);
        const box = window.__PORTAL_SUPABASE__;
        if(!box || !box.session || !box.session.access_token) return { ok: false, reason: 'no-session' };
        if(typeof window.portalEnsureFreshPushSubscription === 'function'){
          const fresh = await window.portalEnsureFreshPushSubscription(reg, vapid, box.client, box.session);
          return fresh && fresh.ok ? { ok: true } : (fresh || { ok: false, reason: 'subscribe-failed' });
        }
        let sub = typeof window.portalSubscribePushWithCurrentVapid === 'function'
          ? await window.portalSubscribePushWithCurrentVapid(reg, vapid)
          : await (async function(){
              let existing = await reg.pushManager.getSubscription();
              if(existing) return existing;
              return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyU8 });
            })();
        if(typeof window.portalPostPushSubscriptionToServer === 'function'){
          return window.portalPostPushSubscriptionToServer(box.client, box.session, sub);
        }
        const subJson = sub.toJSON();
        if(box.client && typeof box.client.functions.invoke === 'function'){
          const fnRes = await box.client.functions.invoke('portal-push-subscribe', {
            body: { subscription: subJson, register_app: 'portal' }
          });
          if(!fnRes.error) return { ok: true };
          const st = Number(fnRes.error.status || fnRes.error.context && fnRes.error.context.status || 0);
          console.debug('[portal] portal-push-subscribe', fnRes.error);
          return { ok: false, reason: 'subscribe-fn', status: st || 0 };
        }
        const mod = await import(PORTAL_SUPABASE_CLIENT_MODULE);
        const fnUrl = typeof mod.getSupabaseFunctionUrl === 'function' ? mod.getSupabaseFunctionUrl('portal-push-subscribe') : '';
        const anon = typeof mod.getSupabaseAnonKey === 'function' ? mod.getSupabaseAnonKey() : '';
        if(!fnUrl || !anon) return { ok: false, reason: 'no-fn-url' };
        const token = String(box.session.access_token).trim();
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': anon
          },
          body: JSON.stringify({ subscription: subJson, register_app: 'portal' })
        });
        if(!res.ok){
          let detail = '';
          try{ detail = await res.text(); }catch(_){}
          console.debug('[portal] portal-push-subscribe', res.status, detail);
          return { ok: false, reason: 'subscribe-http', status: res.status };
        }
        return { ok: true };
      }catch(e){
        console.debug('[portal] portalEnsureWebPushSubscription', e);
        return { ok: false, reason: 'exception' };
      }
      })();
      try{
        return await window.__PORTAL_WPS_IN_FLIGHT_PROMISE;
      }finally{
        window.__PORTAL_WPS_IN_FLIGHT_PROMISE = null;
      }
    };

    window.addEventListener('portal:supabase-ready', function(){
      try{
        if(typeof portalMergeGuideAckFromSupabase === 'function'){
          void portalMergeGuideAckFromSupabase().then(function(){
            if(typeof portalSyncQuickMenuGuidePlacement === 'function') portalSyncQuickMenuGuidePlacement();
            if(typeof syncPortalScheduleOverridesTopSlot === 'function') syncPortalScheduleOverridesTopSlot();
          });
        }
      }catch(_guide){}
      try{
        if(typeof Notification !== 'undefined' && Notification.permission === 'granted' && typeof window.portalEnsureWebPushSubscription === 'function'){
          void window.portalEnsureWebPushSubscription();
        }
      }catch(_){}
      try{
        if(typeof window.portalEnsureMandatoryAlertsSettings === 'function'){
          void window.portalEnsureMandatoryAlertsSettings();
        }else if(typeof window.portalRefreshMandatoryAlertsSettingsUi === 'function'){
          void window.portalRefreshMandatoryAlertsSettingsUi();
        }
      }catch(_loc){}
      try{
        if(typeof window.portalStaffDmSyncUnreadChrome === 'function'){
          void window.portalStaffDmSyncUnreadChrome();
        }
      }catch(_dm){}
      try{
        if(typeof window.portalSyncServiceLeadsQuickMenu === 'function'){
          window.portalSyncServiceLeadsQuickMenu();
        }
        if(typeof window.portalSyncLeadTeamShiftUi === 'function'){
          window.portalSyncLeadTeamShiftUi();
        }
      }catch(_sl){}
    });
    window.addEventListener('portal:location-permission-change', function(){
      try{
        if(typeof window.portalRefreshLocationUi === 'function') window.portalRefreshLocationUi();
        if(typeof window.portalRefreshAlertsNotifyUi === 'function') window.portalRefreshAlertsNotifyUi();
      }catch(_){}
    });
    window.addEventListener('portal:microphone-permission-change', function(){
      try{
        if(typeof window.portalRefreshMicrophoneUi === 'function') window.portalRefreshMicrophoneUi();
        if(typeof window.portalSyncAlertsSettingsChrome === 'function') window.portalSyncAlertsSettingsChrome();
      }catch(_){}
    });
    window.addEventListener('portal:camera-permission-change', function(){
      try{
        if(typeof window.portalRefreshCameraUi === 'function') window.portalRefreshCameraUi();
        if(typeof window.portalSyncAlertsSettingsChrome === 'function') window.portalSyncAlertsSettingsChrome();
      }catch(_){}
    });
    window.addEventListener('portal:all-permissions-change', function(){
      try{
        if(typeof window.portalRefreshMandatoryAlertsSettingsUi === 'function'){
          void window.portalRefreshMandatoryAlertsSettingsUi();
        }
      }catch(_){}
    });

    document.querySelectorAll('#setupReminderSheet a.setup-row').forEach(link => {
      link.addEventListener('click', () => closeSheet());
    });

    const setupRemSheetEl = document.getElementById('setupReminderSheet');
    if(setupRemSheetEl){
      setupRemSheetEl.addEventListener('click', e => {
        const ovGo = e.target.closest('[data-action="open-roster-override-attention"]');
        if(ovGo){
          e.preventDefault();
          if(typeof portalQuickMenuDismissOverrideFromEl === 'function'){
            portalQuickMenuDismissOverrideFromEl(ovGo);
          }
          const iso = ovGo.getAttribute('data-portal-override-nav-iso') || '';
          if(typeof window.portalNavigateDashboardToOverrideDate === 'function'){
            window.portalNavigateDashboardToOverrideDate(iso);
          }
          if(typeof closeSheet === 'function') closeSheet();
          if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
          if(typeof window.portalSyncLeadTeamShiftUi === 'function') window.portalSyncLeadTeamShiftUi();
          return;
        }
        const fbGo = e.target.closest('[data-action="open-pending-feedback"]');
        if(fbGo){
          e.preventDefault();
          if(typeof portalSetReviewFlowOrigin === 'function') portalSetReviewFlowOrigin('term');
          if(typeof window.portalOpenTermSheetAndFocusOldestFeedbackDay === 'function'){
            window.portalOpenTermSheetAndFocusOldestFeedbackDay();
          }
          return;
        }
        const termOld = e.target.closest('[data-action="open-term-oldest-feedback"], [data-action="open-term-from-reminders"]');
        if(termOld){
          e.preventDefault();
          if(typeof window.portalOpenTermSheetAndFocusOldestFeedbackDay === 'function'){
            window.portalOpenTermSheetAndFocusOldestFeedbackDay();
          }
          return;
        }
        const vBtn = e.target.closest('[data-portal-venue-mark]');
        if(vBtn){
          e.preventDefault();
          portalSetVenueFlag(vBtn.getAttribute('data-portal-venue-mark'));
          if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
          return;
        }
        const venueGo = e.target.closest('[data-action="open-venue-report"]');
        if(venueGo){
          e.preventDefault();
          const kind = venueGo.getAttribute('data-portal-venue-kind') || '';
          let target = typeof portalBuildVenueQuickMenuUrl === 'function'
            ? portalBuildVenueQuickMenuUrl('portal-venue-review.html', { kind: kind })
            : 'portal-venue-review.html';
          try{
            try{ localStorage.setItem('portalLastDashboardUrl', String(window.location.href || '')); }catch(_){}
            const dash = typeof portalQuickMenuPortalReturnBaseUrl === 'function' ? portalQuickMenuPortalReturnBaseUrl() : '';
            if(dash){
              const tu = new URL(String(target || ''), window.location.href);
              tu.searchParams.set('portalReturn', dash);
              target = tu.href;
            }
          }catch(_){}
          if(typeof portalQuickMenuNavigate === 'function') portalQuickMenuNavigate(target);
          else window.location.href = target;
          return;
        }
      });
    }
    document.getElementById('menuSheet')?.addEventListener('click', function(e){
      const extBtn = e.target.closest('[data-portal-external-url]');
      if(extBtn){
        const u = extBtn.getAttribute('data-portal-external-url');
        if(u){
          e.preventDefault();
          e.stopPropagation();
          if(extBtn.id === 'quickMenuWorkVenue'){
            let target = portalBuildVenueQuickMenuUrl(u);
            try{
              try{ localStorage.setItem('portalLastDashboardUrl', String(window.location.href || '')); }catch(_){}
              const dash = portalQuickMenuPortalReturnBaseUrl();
              if(dash){
                const tu = new URL(String(target || ''), window.location.href);
                tu.searchParams.set('portalReturn', dash);
                target = tu.href;
              }
            }catch(_){}
            portalQuickMenuNavigate(target);
            return;
          }
          if(extBtn.id === 'quickMenuDropoffPickup'){
            let target = typeof portalBuildPickupQuickMenuUrl === 'function' ? portalBuildPickupQuickMenuUrl(u) : u;
            try{
              const names = typeof portalCollectTodayParticipantNames === 'function' ? portalCollectTodayParticipantNames() : [];
              if(names.length){
                sessionStorage.setItem('portalPickupRosterToday', JSON.stringify(names));
              }
            }catch(_){}
            portalQuickMenuNavigate(target);
            return;
          }
          portalQuickMenuNavigate(u);
        }
        return;
      }
      const setupHit = e.target.closest('[data-action="open-setup-reminder-sheet"]');
      if(setupHit){
        e.preventDefault();
        e.stopPropagation();
        openSheet('setupReminderSheet');
        return;
      }
      const ovHit = e.target.closest('[data-action="open-roster-override-attention"]');
      if(ovHit){
        e.preventDefault();
        e.stopPropagation();
        if(typeof portalQuickMenuDismissOverrideFromEl === 'function'){
          portalQuickMenuDismissOverrideFromEl(ovHit);
        }
        const iso = ovHit.getAttribute('data-portal-override-nav-iso') || '';
        if(typeof window.portalNavigateDashboardToOverrideDate === 'function'){
          window.portalNavigateDashboardToOverrideDate(iso);
        }
        if(typeof closeSheet === 'function') closeSheet();
        if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
        if(typeof window.portalSyncLeadTeamShiftUi === 'function') window.portalSyncLeadTeamShiftUi();
        return;
      }
      const hit = e.target.closest('[data-action="open-pending-feedback"]');
      if(!hit) return;
      e.preventDefault();
      e.stopPropagation();
      if(typeof portalSetReviewFlowOrigin === 'function') portalSetReviewFlowOrigin('term');
      if(typeof window.portalOpenTermSheetAndFocusOldestFeedbackDay === 'function'){
        window.portalOpenTermSheetAndFocusOldestFeedbackDay();
      }
    });

    (function portalWeekListReviewNav(){
      const wl = document.getElementById('weekList');
      if(!wl) return;
      wl.addEventListener('click', function(e){
        const row = e.target.closest('[data-action="week-review-day"]');
        if(!row) return;
        e.preventDefault();
        const day = row.getAttribute('data-week-day') || '';
        const iso = row.getAttribute('data-week-iso') || '';
        if(day){
          portalSetReviewFlowOrigin('this_week');
          portalOpenWeekDayReviewFlow(day, /^\d{4}-\d{2}-\d{2}$/.test(iso) ? { portalReviewDate: iso } : undefined);
        }
      });
      wl.addEventListener('keydown', function(e){
        if(e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('[data-action="week-review-day"]');
        if(!row) return;
        e.preventDefault();
        const day = row.getAttribute('data-week-day') || '';
        const iso = row.getAttribute('data-week-iso') || '';
        if(day){
          portalSetReviewFlowOrigin('this_week');
          portalOpenWeekDayReviewFlow(day, /^\d{4}-\d{2}-\d{2}$/.test(iso) ? { portalReviewDate: iso } : undefined);
        }
      });
    })();

    hydrateSessionReviewMapFromStorage();
    try{ document.body.classList.add('staff-dashboard-feedback-syncing'); }catch(_){}
    window.addEventListener('portal:supabase-ready', function(){
      try{
        if(typeof portalStaffResolveIdentityEarlyFromSession === 'function'){
          portalStaffResolveIdentityEarlyFromSession();
        }
      }catch(_){}
    });
    var _portalDeferRosterUntilAuth = !STAFF_DASHBOARD_ID && !portalStaffDashIsEditorPreviewMode();
    if(_portalDeferRosterUntilAuth && typeof portalTryOptimisticRosterFromPersistedAuth === 'function'){
      if(portalTryOptimisticRosterFromPersistedAuth()) _portalDeferRosterUntilAuth = false;
    }
    if(_portalDeferRosterUntilAuth && dashboardData){
      dashboardData.portalIdentityResolved = false;
      dashboardData.today = [];
      dashboardData.week = [];
      dashboardData.venueMeta = '';
    }else{
      portalSyncTodaySectionDisplay();
      if(typeof window.__portalSyncNextSessionFromModel === 'function') window.__portalSyncNextSessionFromModel();
      /* Pending counts need the real staff id from Supabase rehydrate; skip until then when landing from session feedback. */
      if(!(__postFbLand && __postFbLand.appliedReviewDay)){
        var _portalSkipPendingDayReset = false;
        try{ _portalSkipPendingDayReset = !!(typeof window !== 'undefined' && window.__PORTAL_STICKY_REVIEW_DAY_LOAD__); }catch(_){}
        if(!_portalSkipPendingDayReset) portalMaybeResetDemoViewDayAfterFeedbackPostLoad();
      }
    }

    applySetupRoleTrainingRow();
    if(STAFF_DASH_HIDE_DEV_VIEW_TOGGLE) document.body.classList.add('staff-dashboard-ready');
    renderHeader();
    renderToday();
    if(!_portalDeferRosterUntilAuth){
      renderMiniCounts();
      renderLists();
    }
    setInterval(() => {
      if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
      try{
        const sel = typeof portalSelectedViewCalendarIsoYmd === 'function' ? portalSelectedViewCalendarIsoYmd() : '';
        const todayIso = typeof portalIsoYmdFromDate === 'function' ? portalIsoYmdFromDate(new Date()) : '';
        if(sel && todayIso && sel === todayIso && typeof renderToday === 'function'){
          const grid = document.getElementById('todayGrid');
          const list = (dashboardData && Array.isArray(dashboardData.today)) ? dashboardData.today.slice(0, 9) : [];
          const nextSig = typeof portalTodaySessionCardsSignature === 'function'
            ? portalTodaySessionCardsSignature(list, sessionReviewRowClass)
            : '';
          if(!grid || !nextSig || grid.getAttribute('data-today-cards-sig') !== nextSig){
            renderToday();
          }
        }
      }catch(_){}
    }, 30 * 1000);
    function portalOnStaffAppBackgrounded(){
      try{
        if(typeof portalMaybeNotifyUnsignedAnnouncementPending === 'function') portalMaybeNotifyUnsignedAnnouncementPending();
      }catch(_){}
      try{
        window.__PORTAL_STAFF_HIDDEN_AT__ = Date.now();
      }catch(_){}
    }
    /* Installed PWAs (esp. iOS) resume the last in-memory page instead of doing a
       fresh network load like a browser tab, so schedule edits/new deploys never
       reach the worker. When the app is brought back to the foreground after being
       backgrounded a while, do a real reload (HTML is no-store → fresh boot + roster
       + live data). Guarded so we never interrupt an open sheet or active typing. */
    var PORTAL_STAFF_RESUME_RELOAD_MS = 4 * 60 * 1000;
    function portalStaffIsStandalonePwa(){
      try{
        if(window.navigator && window.navigator.standalone === true) return true;
        if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
        if(window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
        if(window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      }catch(_){}
      return false;
    }
    function portalStaffShouldReloadOnResume(){
      try{
        if(!portalStaffIsStandalonePwa()) return false;
        var tHid = Number(window.__PORTAL_STAFF_HIDDEN_AT__ || 0);
        if(!(tHid > 0)) return false;
        if(Date.now() - tHid < PORTAL_STAFF_RESUME_RELOAD_MS) return false;
        if(document.querySelector('.sheet.open')) return false;
        var ae = document.activeElement;
        if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(String(ae.tagName || ''))) return false;
        if(ae && ae.isContentEditable) return false;
        return true;
      }catch(_){ return false; }
    }
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible'){
        try{
          if(portalStaffShouldReloadOnResume()){
            window.location.reload();
            return;
          }
        }catch(_){}
        try{
          if(typeof Notification !== 'undefined' && Notification.permission === 'granted' && typeof window.portalEnsureWebPushSubscription === 'function'){
            void window.portalEnsureWebPushSubscription();
          }
        }catch(_wps){}
        try{
          if(typeof portalSyncAnnouncementsAndRemindersUi === 'function') portalSyncAnnouncementsAndRemindersUi();
          else if(typeof syncPortalReminderChrome === 'function') syncPortalReminderChrome();
        }catch(_){}
        try{
          var tHid = Number(window.__PORTAL_STAFF_HIDDEN_AT__ || 0);
          if(tHid > 0){
            if(window.__PORTAL_STAFF_VISIBLE_OV_DEB) clearTimeout(window.__PORTAL_STAFF_VISIBLE_OV_DEB);
            window.__PORTAL_STAFF_VISIBLE_OV_DEB = setTimeout(function(){
              window.__PORTAL_STAFF_VISIBLE_OV_DEB = null;
              if(typeof window.__PORTAL_STAFF_REMOTE_OVERRIDE_REFRESH__ === 'function'){
                void window.__PORTAL_STAFF_REMOTE_OVERRIDE_REFRESH__(null);
              }
            }, 220);
          }
        }catch(_){}
      }else if(document.visibilityState === 'hidden'){
        portalOnStaffAppBackgrounded();
      }
    });
    /* iOS/Safari back-forward cache: restored pages can keep stale JS — reload matches fresh open. */
    window.addEventListener('pageshow', function(ev){
      try{
        if(ev && ev.persisted){
          if(typeof window.__PORTAL_STAFF_REHYDRATE__ === 'function'){
            void window.__PORTAL_STAFF_REHYDRATE__();
          }else{
            window.location.reload();
          }
        }
      }catch(_){}
    });
    window.addEventListener('pagehide', function(){
      portalOnStaffAppBackgrounded();
    });
    (function portalRegisterStaffServiceWorkerEarly(){
      if(!('serviceWorker' in navigator)) return;
      try{
        var swUrl = new URL('clubsensational-portal-sw.js', window.location.href).href;
        var scopeBase = new URL('./', window.location.href).href;
        navigator.serviceWorker.register(swUrl, { scope: scopeBase }).then(function(reg){
          window.__PORTAL_SW_REG__ = reg;
        }).catch(function(e){
          console.warn('[portal] service worker register (early)', e);
        });
      }catch(e){
        console.warn('[portal] service worker (early)', e);
      }
    })();
    if('serviceWorker' in navigator){
      try{
        navigator.serviceWorker.addEventListener('message', function(ev){
          try{
            const d = ev.data;
            if(!d || d.type !== 'portal-notification-click') return;
            if(d.portalOpen === 'alerts' && typeof portalOpenLogoLiteQuickMenuFromIosAlertPreview === 'function'){
              portalOpenLogoLiteQuickMenuFromIosAlertPreview();
            }
          }catch(_){}
        });
      }catch(_){}
    }
    (function portalConsumeOpenAlertsQuery(){
      try{
        const q = new URLSearchParams(String(location.search || ''));
        if(q.get('portalOpen') !== 'alerts') return;
        q.delete('portalOpen');
        const next = location.pathname + (q.toString() ? '?' + q.toString() : '') + (location.hash || '');
        history.replaceState(null, '', next);
        requestAnimationFrame(function(){
          if(typeof portalOpenLogoLiteQuickMenuFromIosAlertPreview === 'function'){
            portalOpenLogoLiteQuickMenuFromIosAlertPreview();
          }
        });
      }catch(_){}
    })();

    /** TEMP: staff dashboard live diagnostics (?debug=1 or localStorage.portalDebug="1"). Remove when done. */
    (function portalStaffTempDebugOverlay(){
      function portalStaffDebugEnabled(){
        try{
          if (String(localStorage.getItem('portalDebug') || '').trim() === '1') return true;
        }catch(_){}
        try{
          return new URLSearchParams(String(location.search || '')).get('debug') === '1';
        }catch(_){}
        return false;
      }
      if (!portalStaffDebugEnabled()) return;
      window.__PORTAL_DEBUG_SUPABASE_READY_FIRED__ = false;
      window.addEventListener('portal:supabase-ready', function(){
        window.__PORTAL_DEBUG_SUPABASE_READY_FIRED__ = true;
      });
      var st = document.createElement('style');
      st.id = 'portal-staff-temp-debug-style';
      st.textContent = '#portalStaffTempDebugPanel{position:fixed;bottom:8px;left:8px;max-width:min(440px,94vw);max-height:42vh;overflow:auto;z-index:2147483646;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#0c1b2e;background:rgba(255,255,255,.96);border:1px solid rgba(12,27,46,.25);border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,.15);padding:8px 10px;margin:0;pointer-events:auto}#portalStaffTempDebugPanel strong{display:block;margin:0 0 6px;font-size:12px}#portalStaffTempDebugPanel pre{margin:0;white-space:pre-wrap;word-break:break-word}#portalStaffTempDebugPanel .muted{color:#5a6b7a}';
      (document.head || document.documentElement).appendChild(st);
      var el = document.createElement('div');
      el.id = 'portalStaffTempDebugPanel';
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Portal staff debug');
      el.innerHTML = '<strong class="muted">Staff debug (temp)</strong><pre id="portalStaffTempDebugPre"></pre>';
      document.body.appendChild(el);
      var pre = document.getElementById('portalStaffTempDebugPre');
      function line(label, val){
        return label + ': ' + String(val === undefined || val === null ? '—' : val) + '\n';
      }
      function tick(){
        if (!pre) return;
        var ps = window.__PORTAL_SUPABASE__;
        var sess = ps && ps.session;
        var u = sess && sess.user;
        var prof = ps && ps.staff_profile;
        var dd = window.dashboardData;
        var urlDay = '';
        try{
          urlDay = new URLSearchParams(String(location.search || '')).get('portalReviewDay') || '';
        }catch(_){}
        var txt = '';
        txt += line('URL', location.href);
        txt += line('portalReviewDay (query)', urlDay || '(empty)');
        txt += line('Supabase session', sess ? 'yes' : 'no');
        txt += line('auth user id', u && u.id);
        txt += line('auth user email', u && u.email);
        txt += line('window.__PORTAL_SUPABASE__', ps ? 'exists' : 'missing');
        txt += line('staff_profile', prof ? 'exists' : 'missing');
        txt += line('staff_profile.id', prof && prof.id);
        txt += line('staff_profile.full_name', prof && prof.full_name);
        txt += line('dashboardData.staffName', dd ? dd.staffName : '(no dashboardData)');
        txt += line('portalIdentityResolved', dd ? dd.portalIdentityResolved : '(no dashboardData)');
        txt += line('DEMO_VIEW_DAY', typeof DEMO_VIEW_DAY !== 'undefined' ? DEMO_VIEW_DAY : '(n/a)');
        txt += line('portal:supabase-ready fired', window.__PORTAL_DEBUG_SUPABASE_READY_FIRED__ ? 'yes' : 'no');
        pre.textContent = txt;
      }
      tick();
      setInterval(tick, 400);
    })();

    (function portalP1DeployFingerprintMarker(){
      try{
        if(new URLSearchParams(String(location.search || '')).get('debug') !== '1') return;
        function place(){
          if(document.getElementById('portalP1DeployFingerprint')) return;
          var d = document.createElement('div');
          d.id = 'portalP1DeployFingerprint';
          d.setAttribute('aria-hidden', 'true');
          d.textContent = 'P1 BUILD 20260521 WEEK-STAFF';
          d.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:2147483647;margin:0;padding:4px 6px;font:10px/1.2 ui-monospace,Menlo,Consolas,monospace;color:#0c1b2e;background:rgba(255,255,255,.92);border:1px solid rgba(12,27,46,.2);pointer-events:none;';
          (document.body || document.documentElement).appendChild(d);
        }
        if(document.body) place();
        else document.addEventListener('DOMContentLoaded', place);
      }catch(_){}
    })();
