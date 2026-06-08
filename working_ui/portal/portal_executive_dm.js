/**
 * Portable admin CS Cliq DM runtime for staff/lead/CEO embed sheets.
 */
(function (global) {
  "use strict";

  function $(id) { return global.document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function getSchedSupabaseClient() {
    var box = global.__PORTAL_SUPABASE__;
    return box && box.client ? box.client : null;
  }
  function portalDmPeerIdForThread(me, row) {
    var a = String(row && row.participant_a || "");
    var b = String(row && row.participant_b || "");
    return a === me ? b : a;
  }

  function portalAdminDmCsCliqEmbedActive() {
    if (global.__PORTAL_CS_CLIQ_EMBED_OPEN) return true;
    return !!(global.__PORTAL_CS_CLIQ_ACTIVE && global.__PORTAL_CS_CLIQ_EMBED_SHEET);
  }
  function portalAdminDmPremiumSheetActive() {
    return false;
  }

    function portalAdminDmMe(){
      var box = window.__PORTAL_SUPABASE__;
      return String((box && box.session && box.session.user && box.session.user.id) || (box && box.staff_profile && box.staff_profile.id) || '').trim();
    }
    function portalAdminDmAuthorIds(){
      var box = window.__PORTAL_SUPABASE__;
      var ids = [];
      var sid = String(box && box.session && box.session.user && box.session.user.id || '').trim();
      var pid = String(box && box.staff_profile && box.staff_profile.id || '').trim();
      if(sid) ids.push(sid);
      if(pid && ids.indexOf(pid) < 0) ids.push(pid);
      return ids;
    }
    function portalAdminDmIsMyMessage(authorId){
      authorId = String(authorId || '').trim().toLowerCase();
      if(!authorId) return false;
      return portalAdminDmAuthorIds().some(function(id){
        return String(id || '').trim().toLowerCase() === authorId;
      });
    }
    function portalAdminDmChannel(){
      return String(window.__PORTAL_ADMIN_DM_CHANNEL || 'staff_lead').trim() === 'ceo_exec' ? 'ceo_exec' : 'staff_lead';
    }
    function portalAdminDmIsWorkerRecipient(row){
      if(typeof window.portalInternalDmIsWorkerRecipient === 'function'){
        return window.portalInternalDmIsWorkerRecipient(row);
      }
      if(!row || row.is_active === false) return false;
      var app = String(row.app_role || '').toLowerCase();
      if(app === 'admin' || app === 'ceo') return false;
      var sr = String(row.staff_role || '').toLowerCase();
      if(sr === 'manager' || sr === 'admin') return false;
      return !!(row.full_name || row.username);
    }
    function portalAdminDmProfileIsOfficeParticipant(row){
      if(!row || row.is_active === false) return false;
      var app = String(row.app_role || '').toLowerCase();
      if(app === 'admin' || app === 'ceo') return true;
      var sr = String(row.staff_role || '').toLowerCase();
      return sr === 'manager' || sr === 'admin';
    }
    function portalAdminDmUsesSharedStaffInbox(){
      var prof = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
      if(!prof) return false;
      var app = String(prof.app_role || '').toLowerCase();
      if(app === 'admin' || app === 'ceo') return true;
      var sr = String(prof.staff_role || '').toLowerCase();
      return sr === 'manager' || sr === 'admin';
    }
    function portalAdminDmWorkerPeerFromThread(row, profBy, me){
      if(!row) return '';
      var a = String(row.participant_a || '');
      var b = String(row.participant_b || '');
      var pa = profBy[a] || {};
      var pb = profBy[b] || {};
      if(portalAdminDmIsWorkerRecipient(pa)) return a;
      if(portalAdminDmIsWorkerRecipient(pb)) return b;
      return portalDmPeerIdForThread(me, row);
    }
    function portalAdminDmIsPeerTeamChatThread(row, profBy){
      if(!row || !profBy) return false;
      var a = String(row.participant_a || '');
      var b = String(row.participant_b || '');
      if(!a || !b) return false;
      return portalAdminDmIsWorkerRecipient(profBy[a] || {}) && portalAdminDmIsWorkerRecipient(profBy[b] || {});
    }
    function portalAdminDmTeamChatLabel(row, names){
      if(!row) return 'Team chat';
      names = names || {};
      var a = String(row.participant_a || '');
      var b = String(row.participant_b || '');
      var la = String(names[a] || a.slice(0, 8) || '?').trim();
      var lb = String(names[b] || b.slice(0, 8) || '?').trim();
      return la + ' ↔ ' + lb;
    }
    async function portalAdminDmFindStaffLeadThreadForWorker(client, workerId){
      workerId = String(workerId || '').trim();
      if(!client || !workerId) return '';
      var res = await client
        .from('portal_staff_dm_threads')
        .select('id,participant_a,participant_b,updated_at')
        .or('participant_a.eq.' + workerId + ',participant_b.eq.' + workerId)
        .order('updated_at', { ascending: false })
        .limit(40);
      if(res.error || !Array.isArray(res.data) || !res.data.length) return '';
      var officeIds = [];
      res.data.forEach(function(r){
        var o = String(r.participant_a) === workerId ? String(r.participant_b) : String(r.participant_a);
        if(o && officeIds.indexOf(o) === -1) officeIds.push(o);
      });
      var profBy = {};
      if(officeIds.length){
        var pr = await client.from('staff_profiles').select('id,app_role,staff_role,dashboard_route,is_active').in('id', officeIds);
        if(!pr.error && Array.isArray(pr.data)){
          pr.data.forEach(function(p){
            if(p && p.id) profBy[String(p.id)] = p;
          });
        }
      }
      for(var i = 0; i < res.data.length; i++){
        var r = res.data[i];
        var officePeer = String(r.participant_a) === workerId ? String(r.participant_b) : String(r.participant_a);
        if(portalAdminDmProfileIsOfficeParticipant(profBy[officePeer] || {})) return String(r.id || '');
      }
      return '';
    }
    async function portalAdminDmFetchStaffDmThreads(client, me, ch){
      if(ch === 'staff_lead' && portalAdminDmUsesSharedStaffInbox()){
        return client
          .from('portal_staff_dm_threads')
          .select('id,participant_a,participant_b,updated_at')
          .order('updated_at', { ascending: false })
          .limit(300);
      }
      return client
        .from('portal_staff_dm_threads')
        .select('id,participant_a,participant_b,updated_at')
        .or('participant_a.eq.' + me + ',participant_b.eq.' + me)
        .order('updated_at', { ascending: false });
    }
    function portalAdminDmFinishPeerDirectoryLoad(search){
      if(!search) return;
      var n = (window.__PORTAL_ADMIN_DM_PEER_ROWS || []).length;
      if(n > 0){
        search.placeholder = 'Search ' + n + ' people by name…';
        return;
      }
      var prof = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
      var myApp = String((prof && prof.app_role) || '').toLowerCase();
      var myStaff = String((prof && prof.staff_role) || '').toLowerCase();
      if(myApp !== 'admin' && myApp !== 'ceo' && myStaff !== 'manager' && myStaff !== 'admin'){
        search.placeholder = 'Directory blocked — your profile needs app_role admin/ceo or staff_role manager in Supabase';
      }else{
        search.placeholder = 'No staff found — run migration 20260523150000 in Supabase SQL Editor';
      }
    }
    /** Internal chat (admin): threads with staff or leads only — not admin↔admin (those live under CEO's Chat). CEO's Chat: CEOs and other admins. */
    function portalAdminDmProfileMatchesChannel(profileRow, channelOverride){
      var ch = channelOverride || portalAdminDmChannel();
      var role = String(profileRow && profileRow.app_role || '').toLowerCase();
      if(ch === 'staff_lead'){
        return portalAdminDmIsWorkerRecipient(profileRow);
      }
      return role === 'ceo' || role === 'admin';
    }
    function portalAdminDmPremiumSheetOpen(){
      var sh = document.getElementById('internalChatSheet');
      var bd = document.getElementById('portalInternalChatBackdrop');
      if(!sh) return false;
      sh.classList.add('open');
      sh.setAttribute('aria-hidden', 'false');
      if(bd){
        bd.classList.add('open');
        bd.setAttribute('aria-hidden', 'false');
      }
      document.body.classList.add('portal-internal-chat-open');
      window.__PORTAL_ADMIN_PREMIUM_CHAT_OPEN = true;
      return true;
    }
    function portalAdminDmPremiumSheetActive(){
      var sh = document.getElementById('internalChatSheet');
      return !!(sh && sh.classList.contains('open'));
    }
    var PORTAL_ADMIN_DM_CS_CLIQ_ID_MAP = {
      admDmListPanel: 'csCliqListPanel',
      admDmComposePanel: 'csCliqComposePanel',
      admDmThreadPanel: 'csCliqThreadPanel',
      admDmCeoQuickWrap: 'csCliqCeoQuickWrap',
      admDmStaffLeadsQuickWrap: 'csCliqStaffLeadsQuickWrap',
      admDmQLeadsChannel: 'csCliqQLeadsChannel',
      admDmQRingAllLeads: 'csCliqQRingAllLeads',
      admDmQCallSelectedLeads: 'csCliqQCallSelectedLeads',
      admDmQStaffLeadsGroup: 'csCliqQStaffLeadsGroup',
      admDmQCeosHost: 'csCliqQCeosHost',
      admDmQOpsAdmin: 'csCliqQOpsAdmin',
      admDmQCeoGroup: 'csCliqQCeoGroup',
      admDmPeerSearch: 'csCliqPeerSearch',
      admDmPeerUser: 'csCliqPeerUser',
      admDmPeerSuggest: 'csCliqPeerSuggest',
      admDmFirstBody: 'csCliqFirstBody',
      admDmComposeErr: 'csCliqComposeErr',
      admDmComposeBack: 'csCliqComposeBack',
      admDmComposeSend: 'csCliqComposeSend',
      admDmBtnNew: 'csCliqBtnNew',
      admDmThreadPeer: 'csCliqThreadPeerHidden'
    };
    function portalAdminDmEl(id){
      if(portalAdminDmCsCliqEmbedActive()){
        var mapped = PORTAL_ADMIN_DM_CS_CLIQ_ID_MAP[id];
        if(mapped){
          var el = document.getElementById(mapped);
          if(el) return el;
        }
      }
      return $(id);
    }
    function portalAdminCsCliqBindControls(){
      if(!portalAdminDmCsCliqEmbedActive()) return;
      function bindClick(elId, fn){
        var el = document.getElementById(elId);
        if(!el || el.dataset.portalCsCliqBound === '1') return;
        el.dataset.portalCsCliqBound = '1';
        el.addEventListener('click', fn);
      }
      bindClick('csCliqBackBtn', function(){
        window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
        window.__PORTAL_ADMIN_DM_UI.threadId = '';
        window.__PORTAL_ADMIN_DM_UI.groupId = '';
        window.__PORTAL_ADMIN_DM_UI.peerLabel = '';
        portalAdminDmTogglePanels('list');
        void portalAdminDmRenderList();
      });
      bindClick('csCliqTabStaff', function(){
        if(portalAdminDmChannel() === 'staff_lead') return;
        window.__PORTAL_ADMIN_DM_CHANNEL = 'staff_lead';
        window.__PORTAL_ADMIN_DM_UI = { threadId: '', groupId: '', panel: 'list', peerLabel: '' };
        portalAdminDmPremiumSyncView();
        void portalAdminDmRenderList();
        var wrapQ = portalAdminDmEl('admDmCeoQuickWrap');
        if(wrapQ) wrapQ.hidden = true;
        var wrapSl = portalAdminDmEl('admDmStaffLeadsQuickWrap');
        if(wrapSl) wrapSl.hidden = false;
        void portalAdminDmFillStaffLeadsQuickPicks();
      });
      bindClick('csCliqTabCeo', function(){
        if(portalAdminDmChannel() === 'ceo_exec') return;
        window.__PORTAL_ADMIN_DM_CHANNEL = 'ceo_exec';
        window.__PORTAL_ADMIN_DM_UI = { threadId: '', groupId: '', panel: 'list', peerLabel: '' };
        portalAdminDmPremiumSyncView();
        void portalAdminDmRenderList();
        var wrapQ = portalAdminDmEl('admDmCeoQuickWrap');
        if(wrapQ) wrapQ.hidden = false;
        var wrapSl = portalAdminDmEl('admDmStaffLeadsQuickWrap');
        if(wrapSl) wrapSl.hidden = true;
        void portalAdminDmFillCeoQuickPicks();
      });
      bindClick('csCliqSendBtn', function(){ void portalAdminDmSendReply(); });
      var inp = document.getElementById('csCliqInput');
      if(inp && inp.dataset.portalDmEnterBound !== '1'){
        inp.dataset.portalDmEnterBound = '1';
        inp.addEventListener('keydown', function(ev){
          if(ev.key === 'Enter' && !ev.shiftKey){
            ev.preventDefault();
            void portalAdminDmSendReply();
          }
        });
      }
      bindClick('csCliqBtnNew', function(){
        portalAdminDmTogglePanels('compose');
        portalResetAdminDmPeerPick();
        void portalLoadDmPeerUserSelect().then(function(){
          var s = portalAdminDmEl('admDmPeerSearch');
          if(s){ try{ s.focus(); }catch(_f){} }
        });
      });
      bindClick('csCliqComposeBack', function(){
        portalAdminDmTogglePanels('list');
        window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
        window.__PORTAL_ADMIN_DM_UI.threadId = '';
        window.__PORTAL_ADMIN_DM_UI.groupId = '';
        void portalAdminDmRenderList();
      });
      bindClick('csCliqComposeSend', function(){ void portalSendInternalDmFirstMessage(); });
      portalWireAdminDmPeerAutocomplete();
    }
    function portalAdminCsCliqInitChat(channel){
      channel = String(channel || 'staff_lead').trim() === 'ceo_exec' ? 'ceo_exec' : 'staff_lead';
      window.__PORTAL_CS_CLIQ_ACTIVE = true;
      window.__PORTAL_ADMIN_DM_CHANNEL = channel;
      window.__PORTAL_ADMIN_DM_OPEN = true;
      window.__PORTAL_ADMIN_DM_UI = { threadId: '', groupId: '', panel: 'list', peerLabel: '' };
      portalAdminDmApplyTeamTileUnreadClass();
      try{ portalAdminDmPatchGlobalChatBanner(); }catch(_cbn){}
      portalInitAdminDmRealtime();
      portalAdminCsCliqBindControls();
      portalAdminDmBindVoiceControls();
      portalAdminDmPremiumSyncView();
      portalAdminDmTogglePanels('list');
      void portalLoadDmPeerUserSelect();
      void portalAdminDmRenderList();
      var wrapQ = portalAdminDmEl('admDmCeoQuickWrap');
      if(wrapQ) wrapQ.hidden = channel !== 'ceo_exec';
      var wrapSl = portalAdminDmEl('admDmStaffLeadsQuickWrap');
      if(wrapSl) wrapSl.hidden = channel !== 'staff_lead';
      if(channel === 'ceo_exec') void portalAdminDmFillCeoQuickPicks();
      if(channel === 'staff_lead') void portalAdminDmFillStaffLeadsQuickPicks();
      if(typeof window.portalInitFloatingInternalChat === 'function') window.portalInitFloatingInternalChat();
      window.__PORTAL_DM_REFRESH_THREAD = function(){ return portalAdminDmLoadMessages(); };
      if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.bindCallBar === 'function'){
        window.portalStaffChatCalls.bindCallBar();
      }
      if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.syncCallBar === 'function'){
        window.portalStaffChatCalls.syncCallBar({ inThread: false });
      }
    }
    function portalAdminDmPremiumSheetClose(){
      var sh = document.getElementById('internalChatSheet');
      var bd = document.getElementById('portalInternalChatBackdrop');
      if(sh){
        sh.classList.remove('open');
        sh.setAttribute('aria-hidden', 'true');
      }
      if(bd){
        bd.classList.remove('open');
        bd.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('portal-internal-chat-open');
      window.__PORTAL_ADMIN_PREMIUM_CHAT_OPEN = false;
      window.__PORTAL_INTERNAL_CHAT_UI = window.__PORTAL_INTERNAL_CHAT_UI || {};
      window.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
      window.__PORTAL_INTERNAL_CHAT_UI.peerLabel = '';
      if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.syncCallBar === 'function'){
        window.portalStaffChatCalls.syncCallBar({ inThread: false });
      }
    }
    function portalAdminDmPremiumActive(){
      return portalAdminDmCsCliqEmbedActive() || portalAdminDmPremiumSheetActive();
    }
    function portalAdminDmListHostEl(){
      if(portalAdminDmCsCliqEmbedActive()) return document.getElementById('csCliqListWrap');
      if(portalAdminDmPremiumSheetActive()) return document.getElementById('internalChatListWrap');
      return $('admDmListHost');
    }
    function portalAdminDmMsgsEl(){
      if(portalAdminDmCsCliqEmbedActive()) return document.getElementById('csCliqMessages');
      if(portalAdminDmPremiumSheetActive()) return document.getElementById('internalChatMessages');
      return $('admDmMsgs');
    }
    function portalAdminDmReplyInputEl(){
      if(portalAdminDmCsCliqEmbedActive()) return document.getElementById('csCliqInput');
      if(portalAdminDmPremiumSheetActive()) return document.getElementById('internalChatInput');
      return $('admDmReplyBody');
    }
    function portalAdminDmReplyErrEl(){
      if(portalAdminDmCsCliqEmbedActive()) return document.getElementById('csCliqErr');
      if(portalAdminDmPremiumSheetActive()) return document.getElementById('internalChatErr');
      return $('admDmThreadErr');
    }
    function portalAdminDmReplySendEl(){
      if(portalAdminDmCsCliqEmbedActive()) return document.getElementById('csCliqSendBtn');
      if(portalAdminDmPremiumSheetActive()) return document.getElementById('internalChatSendBtn');
      return $('admDmThreadSend');
    }
    function portalAdminDmPremiumSyncChannelTabs(){
      var ch = portalAdminDmChannel();
      if(portalAdminDmCsCliqEmbedActive()){
        var tabStaffCs = document.getElementById('csCliqTabStaff');
        var tabCeoCs = document.getElementById('csCliqTabCeo');
        if(tabStaffCs) tabStaffCs.classList.toggle('is-active', ch === 'staff_lead');
        if(tabCeoCs) tabCeoCs.classList.toggle('is-active', ch === 'ceo_exec');
        return;
      }
      var tabStaff = document.getElementById('internalChatAdminTabStaff');
      var tabCeo = document.getElementById('internalChatAdminTabCeo');
      var nav = document.getElementById('internalChatAdminChannelNav');
      if(tabStaff) tabStaff.classList.toggle('is-active', ch === 'staff_lead');
      if(tabCeo) tabCeo.classList.toggle('is-active', ch === 'ceo_exec');
      if(nav) nav.hidden = !portalAdminDmPremiumSheetActive();
    }
    function portalAdminCsCliqSyncMobileSubscreen(panel){
      var mobile = false;
      try{ mobile = adminTouchCompactLayoutActive(); }catch(_mob){}
      var sub = mobile && (panel === 'thread' || panel === 'compose');
      document.body.classList.toggle('admin-cs-cliq-mobile-subscreen', sub);
      var root = document.getElementById('csCliqRoot');
      if(root){
        root.classList.toggle('portal-cs-cliq--subscreen', sub);
        root.setAttribute('data-cs-cliq-panel', String(panel || 'list'));
      }
    }
    function portalAdminCsCliqSyncChatView(){
      if(window.PortalAdminCsCliq && typeof window.PortalAdminCsCliq.syncInboxLayout === 'function'){
        window.PortalAdminCsCliq.syncInboxLayout({
          onMobileSubscreen: portalAdminCsCliqSyncMobileSubscreen,
          onChannelTabs: portalAdminDmPremiumSyncChannelTabs,
          inboxTitle: function(){
            return portalAdminDmChannel() === 'ceo_exec' ? "CEO's chat" : 'Inbox';
          }
        });
        return;
      }
    }
    function portalAdminDmPremiumSyncView(){
      if(portalAdminDmCsCliqEmbedActive()){
        portalAdminCsCliqSyncChatView();
        return;
      }
      if(!portalAdminDmPremiumSheetActive()) return;
      var ui = window.__PORTAL_ADMIN_DM_UI || {};
      var panel = String(ui.panel || 'list');
      var inThread = panel === 'thread';
      var listWrap = document.getElementById('internalChatListWrap');
      var threadWrap = document.getElementById('internalChatThreadWrap');
      var backBtn = document.getElementById('internalChatBackBtn');
      var titleEl = document.getElementById('internalChatTitle');
      var brandEl = document.getElementById('internalChatInboxBrand');
      var nav = document.getElementById('internalChatAdminChannelNav');
      if(listWrap) listWrap.hidden = inThread;
      if(threadWrap){
        threadWrap.hidden = !inThread;
        threadWrap.setAttribute('aria-hidden', inThread ? 'false' : 'true');
      }
      if(backBtn) backBtn.hidden = !inThread;
      if(brandEl) brandEl.hidden = inThread;
      if(nav) nav.hidden = inThread;
      portalAdminDmPremiumSyncChannelTabs();
      if(titleEl){
        if(!inThread){
          titleEl.textContent = portalAdminDmChannel() === 'ceo_exec' ? "CEO's chat" : 'Chats';
        }else{
          var peerEl = portalAdminDmEl('admDmThreadPeer');
          var peerTxt = String(ui.peerLabel || '').trim();
          if(!peerTxt && peerEl) peerTxt = String(peerEl.textContent || '').trim();
          titleEl.textContent = peerTxt || 'Conversation';
        }
      }
      var gid = ui.groupId ? String(ui.groupId).trim() : '';
      var tid = ui.threadId ? String(ui.threadId).trim() : '';
      window.__PORTAL_INTERNAL_CHAT_UI = window.__PORTAL_INTERNAL_CHAT_UI || {};
      window.__PORTAL_INTERNAL_CHAT_UI.threadId = inThread && tid && !gid ? tid : null;
      window.__PORTAL_INTERNAL_CHAT_UI.peerLabel = inThread && !gid && titleEl ? String(titleEl.textContent || '').trim() : '';
      var showCalls = inThread && (!!tid || !!gid);
      if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.syncCallBar === 'function'){
        window.portalStaffChatCalls.syncCallBar({ inThread: showCalls });
      }else{
        var callBar = document.getElementById('internalChatCallBar');
        if(callBar){
          callBar.hidden = !showCalls;
          callBar.setAttribute('aria-hidden', showCalls ? 'false' : 'true');
        }
      }
    }
    function portalAdminPremiumBindSheetControls(){
      if(window.__PORTAL_ADMIN_PREMIUM_CHAT_BOUND) return;
      window.__PORTAL_ADMIN_PREMIUM_CHAT_BOUND = true;
      var closeBtn = document.getElementById('internalChatCloseBtn');
      if(closeBtn){
        closeBtn.addEventListener('click', function(){
          window.__PORTAL_ADMIN_DM_OPEN = false;
          portalAdminDmPremiumSheetClose();
          try{ portalAdminDmPatchGlobalChatBanner(); }catch(_cb){}
        });
      }
      var backBtn = document.getElementById('internalChatBackBtn');
      if(backBtn){
        backBtn.addEventListener('click', function(){
          window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
          window.__PORTAL_ADMIN_DM_UI.threadId = '';
          window.__PORTAL_ADMIN_DM_UI.groupId = '';
          portalAdminDmTogglePanels('list');
          void portalAdminDmRenderList();
        });
      }
      var bd = document.getElementById('portalInternalChatBackdrop');
      if(bd){
        bd.addEventListener('click', function(){
          window.__PORTAL_ADMIN_DM_OPEN = false;
          portalAdminDmPremiumSheetClose();
          try{ portalAdminDmPatchGlobalChatBanner(); }catch(_cb2){}
        });
      }
      var tabStaff = document.getElementById('internalChatAdminTabStaff');
      var tabCeo = document.getElementById('internalChatAdminTabCeo');
      if(tabStaff){
        tabStaff.addEventListener('click', function(){
          if(portalAdminDmChannel() === 'staff_lead') return;
          window.__PORTAL_ADMIN_DM_CHANNEL = 'staff_lead';
          window.__PORTAL_ADMIN_DM_UI = { threadId: '', groupId: '', panel: 'list' };
          portalAdminDmPremiumSyncView();
          void portalAdminDmRenderList();
        });
      }
      if(tabCeo){
        tabCeo.addEventListener('click', function(){
          if(portalAdminDmChannel() === 'ceo_exec') return;
          window.__PORTAL_ADMIN_DM_CHANNEL = 'ceo_exec';
          window.__PORTAL_ADMIN_DM_UI = { threadId: '', groupId: '', panel: 'list' };
          portalAdminDmPremiumSyncView();
          void portalAdminDmRenderList();
        });
      }
      var sendBtn = document.getElementById('internalChatSendBtn');
      if(sendBtn && !sendBtn.dataset.portalDmBound){
        sendBtn.dataset.portalDmBound = '1';
        sendBtn.addEventListener('click', function(){ void portalAdminDmSendReply(); });
      }
      var inp = document.getElementById('internalChatInput');
      if(inp && !inp.dataset.portalDmEnterBound){
        inp.dataset.portalDmEnterBound = '1';
        inp.addEventListener('keydown', function(ev){
          if(ev.key === 'Enter' && !ev.shiftKey){
            ev.preventDefault();
            void portalAdminDmSendReply();
          }
        });
      }
    }
    function openAdminPremiumInternalChat(channel){
      channel = String(channel || 'staff_lead').trim() === 'ceo_exec' ? 'ceo_exec' : 'staff_lead';
      var onAdmin = false;
      try{ onAdmin = /admin_dashboard\.html/i.test(String(window.location.pathname || '')); }catch(_ap){}
      if(!onAdmin && window.portalCsCliqEmbed && typeof window.portalCsCliqEmbed.open === 'function'){
        window.portalCsCliqEmbed.open(channel);
        return;
      }
      window.__PORTAL_CS_CLIQ_PENDING_CHANNEL = channel;
      window.__PORTAL_CS_CLIQ_PENDING_PANE = 'chats';
      if(typeof closeSidebarMob === 'function') closeSidebarMob();
      if(typeof setView === 'function') setView('cs_cliq');
    }
    window.portalOpenInternalChatFromHeaderQuickMenu = function portalOpenInternalChatFromHeaderQuickMenu(){
      openAdminPremiumInternalChat(window.__PORTAL_ADMIN_DM_CHANNEL || 'staff_lead');
    };
    function portalAdminDmTogglePanels(panel){
      window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || { threadId: '', groupId: '' };
      window.__PORTAL_ADMIN_DM_UI.panel = panel;
      var L = portalAdminDmEl('admDmListPanel');
      var C = portalAdminDmEl('admDmComposePanel');
      var T = portalAdminDmEl('admDmThreadPanel');
      if(L) L.hidden = panel !== 'list';
      if(C) C.hidden = panel !== 'compose';
      if(T) T.hidden = panel !== 'thread';
      portalAdminDmPremiumSyncView();
    }
    function portalAdminDmApplyTeamTileUnreadClass(){
      var onStaff = !!window.__PORTAL_ADMIN_DM_UNREAD;
      var onCeo = !!(window.__PORTAL_ADMIN_CEO_DM_UNREAD || window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD);
      var onAny = onStaff || onCeo;
      document.querySelectorAll('[data-dayops-act="admin_chat_hub"]').forEach(function(hub){
        hub.classList.toggle('dayops-screen-nav__card--portal-dm-unread', onStaff);
        hub.classList.toggle('dayops-screen-nav__card--portal-ceo-dm-unread', onCeo);
        hub.classList.toggle('dayops-screen-nav__card--portal-ceo-group-unread', onCeo);
      });
      document.querySelectorAll('[data-dayops-act="team_dm"]').forEach(function(b1){
        b1.classList.toggle('dayops-screen-nav__card--portal-dm-unread', onStaff);
      });
      document.querySelectorAll('[data-dayops-act="ceo_exec_dm"]').forEach(function(b2){
        b2.classList.toggle('dayops-screen-nav__card--portal-ceo-dm-unread', onCeo);
      });
      document.querySelectorAll('[data-dayops-act="ceo_all_group_dm"]').forEach(function(b3){
        b3.classList.toggle('dayops-screen-nav__card--portal-ceo-group-unread', onCeo);
      });
      document.querySelectorAll('#dayopsChatHubInternal').forEach(function(el){
        el.classList.toggle('dayops-screen-nav__card--portal-dm-unread', onStaff);
      });
      document.querySelectorAll('#dayopsChatHubCeo').forEach(function(el){
        el.classList.toggle('dayops-screen-nav__card--portal-ceo-dm-unread', onCeo || !!window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD);
      });
      document.querySelectorAll('#adminNav button[data-view="operations"], #adminNav button[data-view="dashboard"], #adminNav button[data-view="cs_cliq"]').forEach(function(nb){
        nb.classList.toggle('admin-nav-item--chat-unread', onAny);
      });
    }
    function portalAdminDmHasUnread(){
      return !!(window.__PORTAL_ADMIN_DM_UNREAD || window.__PORTAL_ADMIN_CEO_DM_UNREAD || window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD);
    }
    /** Chat unread: campana only (no in-page banner — it shifted layout / overlapped controls). */
    function portalAdminDmShouldShowChatBanner(){
      return false;
    }
    function portalAdminDmChatBannerHtml(){
      var hints = window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ || [];
      var senderBtns = '';
      if(hints.length){
        senderBtns = hints.slice(0, 4).map(function(h, idx){
          var nm = esc(String(h.displayName || 'Someone'));
          return '<button type="button" class="btn btn--link btn--sm" data-portal-admin-open-dm-hint="'+String(idx)+'" style="padding:0 4px;font-weight:700">'+nm+'</button>';
        }).join(', ');
      }
      var staff = !!window.__PORTAL_ADMIN_DM_UNREAD;
      var ceo = !!(window.__PORTAL_ADMIN_CEO_DM_UNREAD || window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD);
      var who = [];
      if(staff) who.push('staff or a lead');
      if(ceo) who.push('CEO / admin chat');
      var whoTxt = who.length === 2 ? who.join(' and ') : (who[0] || 'someone');
      var senderLine = senderBtns
        ? '<span style="display:block;margin-top:6px;min-width:0;overflow-wrap:break-word">From: '+senderBtns+' — tap a name to open that chat.</span>'
        : '';
      var btns =
        '<button type="button" class="btn btn--pri btn--sm" data-portal-admin-open-chat-hub style="margin-top:8px;margin-right:8px">Open chat</button>';
      if(staff) btns += '<button type="button" class="btn btn--sec btn--sm" data-portal-admin-open-staff-chat style="margin-top:8px;margin-right:8px">Staff &amp; leads</button>';
      if(ceo) btns += '<button type="button" class="btn btn--sec btn--sm" data-portal-admin-open-ceo-chat style="margin-top:8px">CEO chat</button>';
      return (
        '<div id="portalAdminChatBanner" class="card card-pad" style="margin-bottom:12px;border-color:rgba(220,38,38,.25);background:var(--dangerSoft)">' +
        '<p style="margin:0;font-size:13px;overflow-wrap:break-word"><strong>New chat message</strong> — '+esc(whoTxt)+' sent a message while you were away.'+senderLine+' '+btns+'</p></div>'
      );
    }
    function portalAdminDmBindChatBanner(root){
      if(!root || root._portalChatBannerBound) return;
      root._portalChatBannerBound = true;
      root.addEventListener('click', function(ev){
        var hintBtn = ev.target.closest('[data-portal-admin-open-dm-hint]');
        if(hintBtn){
          ev.preventDefault();
          var idx = hintBtn.getAttribute('data-portal-admin-open-dm-hint');
          void portalAdminDmOpenFromHint(idx);
          return;
        }
        var hub = ev.target.closest('[data-portal-admin-open-chat-hub]');
        if(hub){ ev.preventDefault(); openDayOpsAdminChatHubModal(); return; }
        var st = ev.target.closest('[data-portal-admin-open-staff-chat]');
        if(st){ ev.preventDefault(); openInternalDmChatModal(); return; }
        var ce = ev.target.closest('[data-portal-admin-open-ceo-chat]');
        if(ce){ ev.preventDefault(); openCeoExecDmChatModal(); return; }
      });
    }
    async function portalAdminDmOpenFromHint(idx){
      var hints = window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ || [];
      var hint = hints[Number(idx)];
      if(!hint) return;
      if(hint.kind === 'ceo_group'){
        openCeoExecDmChatModal();
        if(hint.groupId && String(hint.groupId) !== '__unread__'){
          await portalAdminDmOpenGroupThread(hint.groupId);
        }
        return;
      }
      var ch = hint.channel === 'ceo_exec' || hint.kind === 'ceo_dm' ? 'ceo_exec' : 'staff_lead';
      if(ch === 'ceo_exec') openCeoExecDmChatModal();
      else openInternalDmChatModal();
      if(hint.threadId) await portalAdminDmOpenThread(hint.threadId);
    }
    function portalAdminDmPatchGlobalChatBanner(){
      var el = document.getElementById('portalAdminChatBanner');
      if(el) el.remove();
    }
    function portalAdminDmOnUnreadAttentionChanged(prevUnread){
      try{ portalAdminDmPatchGlobalChatBanner(); }catch(_pb){}
      var nowUnread = portalAdminDmHasUnread();
      if(prevUnread === nowUnread) return;
      try{ if(typeof recomputeOperatorSuggestions === 'function') recomputeOperatorSuggestions(); }catch(_rs){}
      try{
        if(typeof state !== 'undefined' && state && state.view === 'operator' && typeof portalOperatorSuggestionsInnerHtml === 'function'){
          var sugHost = $('portalOperatorSuggestHost');
          if(sugHost){
            sugHost.innerHTML = portalOperatorSuggestionsInnerHtml();
            if(typeof bindOperatorSuggestButtons === 'function') bindOperatorSuggestButtons();
          }
        }
      }catch(_op){}
      if(!prevUnread && nowUnread) portalAdminDmNotifyIncomingChat();
      try{
        var hintCount = (window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ || []).length;
        window.__PORTAL_STAFF_DM_UNREAD_COUNT__ = hintCount || (nowUnread ? 1 : 0);
        if(typeof window.portalSyncFloatingChatUnreadFromMenuBtn === 'function'){
          window.portalSyncFloatingChatUnreadFromMenuBtn();
        }
      }catch(_fab){}
    }
    function portalAdminDmNotifyIncomingChat(){
      var hints = typeof window.portalAdminBellResolveChatHints === 'function'
        ? window.portalAdminBellResolveChatHints()
        : (window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ || []);
      var names = hints.slice(0, 3).map(function(h){
        return String(h.displayName || '').trim();
      }).filter(Boolean);
      var title = names.length ? ('Chat · ' + names.join(', ')) : 'New chat message';
      var parts = [];
      if(window.__PORTAL_ADMIN_DM_UNREAD) parts.push('staff & leads');
      if(window.__PORTAL_ADMIN_CEO_DM_UNREAD) parts.push('CEO / admin DM');
      if(window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD) parts.push('CEO group');
      var sub = names.length
        ? 'Tap Alerts or open Chat to reply.'
        : ('Unread in ' + (parts.join(' · ') || 'internal chat') + ' — open Chat from Day operations.');
      if(typeof window.portalAdminShowInboundAlert === 'function'){
        window.portalAdminShowInboundAlert({ title: title, sub: sub });
      }
    }
    function portalAdminDmTryOsNotifyIncoming(kind){
      kind = String(kind || 'staff').trim();
      try{
        if(typeof document === 'undefined' || !document.hidden) return;
        var sk = kind === 'ceo' ? 'portal_admin_ceo_dm_notify_ts' : 'portal_admin_dm_notify_ts';
        var last = 0;
        try{ last = Number(sessionStorage.getItem(sk) || 0) || 0; }catch(_){ last = 0; }
        if(Date.now() - last < 90000) return;
        try{ sessionStorage.setItem(sk, String(Date.now())); }catch(_){}
        if(typeof Notification === 'undefined') return;
        var title = kind === 'ceo' ? 'CEO\'s Chat' : 'Internal chat';
        var hints = window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ || [];
        var names = hints.slice(0, 2).map(function(h){ return String(h.displayName || '').trim(); }).filter(Boolean);
        var body = names.length
          ? ('New message from '+names.join(', ')+'.')
          : (kind === 'ceo' ? 'New message in CEO / admin chat.' : 'New reply from staff or a lead.');
        if(Notification.permission === 'granted'){
          try{
            new Notification(title, { body: body, tag: kind === 'ceo' ? 'portal-admin-ceo-dm' : 'portal-admin-dm' });
          }catch(_n){}
        }else if(Notification.permission === 'default'){
          Notification.requestPermission().then(function(p){
            if(p === 'granted') portalAdminDmTryOsNotifyIncoming(kind);
          }).catch(function(){});
        }
      }catch(_e){}
    }
    async function portalAdminDmCollectUnreadHints(client, me, cfg){
      var hints = [];
      var profBy = cfg.profBy || {};
      async function pushDmSenders(threadIds, kind, channel){
        if(!threadIds || !threadIds.length) return;
        var q = await client.from('portal_staff_dm_messages')
          .select('thread_id,author_id,created_at,body')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
          .limit(120);
        if(q.error || !Array.isArray(q.data)) return;
        var seen = {};
        q.data.forEach(function(m){
          if(!m || !m.thread_id) return;
          if(!portalAdminDmMessageCountsAsUnread(m)) return;
          var tid = String(m.thread_id);
          if(!portalAdminDmIsMessageAfterAck(m.created_at, portalAdminDmGetThreadAck(tid))) return;
          var aid = String(m.author_id || '');
          var sk = kind + ':' + tid + ':' + aid;
          if(seen[sk]) return;
          seen[sk] = true;
          var pr = profBy[aid] || {};
          var nm = String(pr.full_name || pr.username || '').trim() || 'Unknown sender';
          hints.push({ kind: kind, threadId: tid, authorId: aid, displayName: nm, channel: channel, created_at: m.created_at || null });
        });
      }
      if(cfg.hs) await pushDmSenders(cfg.staffTids, 'staff', 'staff_lead');
      if(cfg.hc) await pushDmSenders(cfg.execTids, 'ceo_dm', 'ceo_exec');
      if(cfg.hg && cfg.gids && cfg.gids.length){
        var gq = await client.from('portal_ceo_group_message')
          .select('group_id,author_id,created_at,body')
          .in('group_id', cfg.gids)
          .order('created_at', { ascending: false })
          .limit(48);
        var groupTitles = cfg.groupTitles || {};
        if(!gq.error && Array.isArray(gq.data)){
          var gseen = {};
          var extraIds = [];
          gq.data.forEach(function(m){
            var aid = String(m.author_id || '');
            if(aid && !profBy[aid]) extraIds.push(aid);
          });
          if(extraIds.length){
            var ep = await client.from('staff_profiles').select('id,full_name,username').in('id', extraIds);
            if(!ep.error && Array.isArray(ep.data)){
              ep.data.forEach(function(p){ if(p && p.id) profBy[String(p.id)] = p; });
            }
          }
          gq.data.forEach(function(m){
            if(!m || !m.group_id) return;
            if(!portalAdminDmMessageCountsAsUnread(m)) return;
            var gid = String(m.group_id);
            if(!portalAdminDmIsMessageAfterAck(m.created_at, portalAdminDmGetGroupAck(gid))) return;
            var aid = String(m.author_id || '');
            var sk = 'g:' + gid + ':' + aid;
            if(gseen[sk]) return;
            gseen[sk] = true;
            var pr = profBy[aid] || {};
            var nm = String(pr.full_name || pr.username || '').trim() || 'Unknown sender';
            var gt = groupTitles[gid] || 'Group';
            var groupSlug = '';
            var slugMatch = gt.toLowerCase();
            var channel = 'ceo_exec';
            if(gt === 'Session leads' || slugMatch.indexOf('session leads') >= 0 || slugMatch.indexOf('staff & leads') >= 0){
              channel = 'staff_lead';
            }
            hints.push({ kind: 'ceo_group', groupId: gid, authorId: aid, displayName: nm + ' (' + gt + ')', channel: channel, created_at: m.created_at || null });
          });
        }
      }
      return hints;
    }
    async function portalAdminDmSyncIncomingAttention(){
      var prevUnread = portalAdminDmHasUnread();
      var client = getSchedSupabaseClient();
      var me = portalAdminDmMe();
      if(!client || !me){
        window.__PORTAL_ADMIN_DM_UNREAD = false;
        window.__PORTAL_ADMIN_CEO_DM_UNREAD = false;
        window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD = false;
        window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ = [];
        portalAdminDmApplyTeamTileUnreadClass();
        portalAdminDmOnUnreadAttentionChanged(prevUnread);
        return;
      }
      try{
        var hs = false;
        var hc = false;
        var profBy = {};
        var staffTids = [];
        var execTids = [];
        async function dmThreadListHasUnread(ids){
          if(!ids || !ids.length) return false;
          var q = await client.from('portal_staff_dm_messages')
            .select('thread_id,created_at,author_id,body')
            .in('thread_id', ids)
            .limit(300);
          if(q.error || !Array.isArray(q.data)) return false;
          return q.data.some(function(m){
            if(!portalAdminDmMessageCountsAsUnread(m)) return false;
            return portalAdminDmIsMessageAfterAck(m.created_at, portalAdminDmGetThreadAck(m.thread_id));
          });
        }
        async function groupListHasUnread(ids){
          if(!ids || !ids.length) return false;
          var q = await client.from('portal_ceo_group_message')
            .select('group_id,created_at,author_id,body')
            .in('group_id', ids)
            .limit(300);
          if(q.error || !Array.isArray(q.data)) return false;
          return q.data.some(function(m){
            if(!portalAdminDmMessageCountsAsUnread(m)) return false;
            return portalAdminDmIsMessageAfterAck(m.created_at, portalAdminDmGetGroupAck(m.group_id));
          });
        }
        var tr = await portalAdminDmFetchStaffDmThreads(client, me, 'staff_lead');
        var trExec = await portalAdminDmFetchStaffDmThreads(client, me, 'ceo_exec');
        var allT = [];
        if(!tr.error && tr.data) allT = allT.concat(tr.data);
        if(!trExec.error && trExec.data){
          trExec.data.forEach(function(t){
            if(!t || !t.id) return;
            if(allT.some(function(x){ return String(x.id) === String(t.id); })) return;
            allT.push(t);
          });
        }
        if(allT.length){
          var allPeerIds = [];
          allT.forEach(function(t){
            if(t.participant_a) allPeerIds.push(String(t.participant_a));
            if(t.participant_b) allPeerIds.push(String(t.participant_b));
          });
          allPeerIds = allPeerIds.filter(function(id, idx, arr){ return id && arr.indexOf(id) === idx; });
          profBy = {};
          if(allPeerIds.length){
            var pr = await client.from('staff_profiles').select('id,full_name,username,app_role,staff_role,dashboard_route,is_active').in('id', allPeerIds);
            if(!pr.error && Array.isArray(pr.data)){
              pr.data.forEach(function(p){
                if(p && p.id) profBy[String(p.id)] = p;
              });
            }
          }
          staffTids = [];
          execTids = [];
          allT.forEach(function(t){
            var wid = portalAdminDmWorkerPeerFromThread(t, profBy, me);
            var wprof = profBy[wid] || {};
            if(portalAdminDmIsWorkerRecipient(wprof)) staffTids.push(String(t.id));
            else {
              var pid = portalDmPeerIdForThread(me, t);
              var role = String((profBy[pid] && profBy[pid].app_role) || '').toLowerCase();
              if(role === 'ceo' || role === 'admin') execTids.push(String(t.id));
            }
          });
          hs = staffTids.length ? await dmThreadListHasUnread(staffTids) : false;
          hc = execTids.length ? await dmThreadListHasUnread(execTids) : false;
        }
        var hgStaff = false;
        var hgCeo = false;
        var gids = [];
        var gidsStaff = [];
        var groupTitles = {};
        try{
          var gr = await client.from('portal_ceo_group').select('id,slug,title');
          if(!gr.error && Array.isArray(gr.data)){
            gr.data.forEach(function(r){
              if(!r || !r.id) return;
              var gsl = String(r.slug || '').toLowerCase();
              var gidStr = String(r.id);
              groupTitles[gidStr] = String(r.title || r.slug || 'Group');
              if(portalAdminDmStaffChannelGroupSlug(gsl)){
                gidsStaff.push(gidStr);
                return;
              }
              if(!portalAdminDmViewerSeesCeoGroupSlug(gsl)) return;
              gids.push(gidStr);
            });
          }
          var gidLeads = await portalAdminDmResolveSessionLeadsGroupId(client);
          if(gidLeads && gidsStaff.indexOf(gidLeads) < 0) gidsStaff.push(gidLeads);
          hgStaff = gidsStaff.length ? await groupListHasUnread(gidsStaff) : false;
          hgCeo = gids.length ? await groupListHasUnread(gids) : false;
        }catch(_g){ hgStaff = false; hgCeo = false; }
        var unreadHints = [];
        try{
          unreadHints = await portalAdminDmCollectUnreadHints(client, me, {
            profBy: profBy || {},
            staffTids: staffTids || [],
            execTids: execTids || [],
            gids: gids.concat(gidsStaff),
            groupTitles: groupTitles,
            hs: hs,
            hc: hc,
            hg: hgStaff || hgCeo
          });
        }catch(_uh){ unreadHints = []; }
        window.__PORTAL_ADMIN_DM_UNREAD_HINTS__ = unreadHints;
        window.__PORTAL_ADMIN_DM_UNREAD = hs || hgStaff;
        window.__PORTAL_ADMIN_CEO_DM_UNREAD = hc;
        window.__PORTAL_ADMIN_CEO_GROUP_DM_UNREAD = hgCeo;
        portalAdminDmApplyTeamTileUnreadClass();
        portalAdminDmOnUnreadAttentionChanged(prevUnread);
        if(hs || hgStaff) portalAdminDmTryOsNotifyIncoming('staff');
        if(hc || hgCeo) portalAdminDmTryOsNotifyIncoming('ceo');
      }catch(_e){
        try{ console.warn('[portal] portalAdminDmSyncIncomingAttention', _e); }catch(_log){}
        portalAdminDmApplyTeamTileUnreadClass();
        portalAdminDmOnUnreadAttentionChanged(prevUnread);
      }
    }
    function portalInitAdminDmRealtime(){
      try{
        if(window.__PORTAL_ADMIN_DM_RT_CH) return;
        var box = window.__PORTAL_SUPABASE__;
        if(!box || !box.client || typeof box.client.channel !== 'function') return;
        var ch = box.client
          .channel('admin-portal-dm-' + String(Date.now()))
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'portal_staff_dm_messages' },
            function(payload){
              if(window.__PORTAL_ADMIN_DM_RT_DEB) clearTimeout(window.__PORTAL_ADMIN_DM_RT_DEB);
              window.__PORTAL_ADMIN_DM_RT_DEB = setTimeout(function(){
                window.__PORTAL_ADMIN_DM_RT_DEB = null;
                var row = payload && (payload.new || payload.record);
                var aid = row && row.author_id ? String(row.author_id) : '';
                var me = portalAdminDmMe();
                if(row && window.portalStaffChatCalls && typeof window.portalStaffChatCalls.onDmMessageInsert === 'function'){
                  window.portalStaffChatCalls.onDmMessageInsert(row);
                }
                if(portalAdminDmMessageCountsAsUnread(row)) void portalAdminDmSyncIncomingAttention();
                if(!window.__PORTAL_ADMIN_DM_OPEN) return;
                var ui = window.__PORTAL_ADMIN_DM_UI || {};
                var tid = ui.threadId ? String(ui.threadId) : '';
                var changedTid = row && row.thread_id ? String(row.thread_id) : '';
                if(ui.panel === 'thread' && tid && changedTid && tid !== changedTid) return;
                if(ui.panel === 'thread' && typeof portalAdminDmLoadMessages === 'function'){
                  void portalAdminDmLoadMessages();
                }else if(ui.panel === 'list' && typeof portalAdminDmRenderList === 'function'){
                  void portalAdminDmRenderList();
                }
              }, 320);
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'portal_ceo_group_message' },
            function(payload){
              if(window.__PORTAL_ADMIN_DM_RT_DEB2) clearTimeout(window.__PORTAL_ADMIN_DM_RT_DEB2);
              window.__PORTAL_ADMIN_DM_RT_DEB2 = setTimeout(function(){
                window.__PORTAL_ADMIN_DM_RT_DEB2 = null;
                var row = payload && (payload.new || payload.record);
                var aid = row && row.author_id ? String(row.author_id) : '';
                var me = portalAdminDmMe();
                if(row && window.portalStaffChatCalls && typeof window.portalStaffChatCalls.onGroupMessageInsert === 'function'){
                  window.portalStaffChatCalls.onGroupMessageInsert(row);
                }
                if(portalAdminDmMessageCountsAsUnread(row)) void portalAdminDmSyncIncomingAttention();
                if(!window.__PORTAL_ADMIN_DM_OPEN) return;
                var ui = window.__PORTAL_ADMIN_DM_UI || {};
                var gid = ui.groupId ? String(ui.groupId) : '';
                var changedGid = row && row.group_id ? String(row.group_id) : '';
                if(ui.panel === 'thread' && gid && changedGid && gid === changedGid){
                  void portalAdminDmLoadMessages();
                }else if(ui.panel === 'list' && typeof portalAdminDmRenderList === 'function'){
                  void portalAdminDmRenderList();
                }
              }, 320);
            }
          )
          .subscribe(function(status, err){
            if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
              try{ console.warn('[portal] Realtime admin DM', status, err || ''); }catch(_e){}
            }
          });
        window.__PORTAL_ADMIN_DM_RT_CH = ch;
      }catch(e){
        try{ console.warn('[portal] portalInitAdminDmRealtime', e); }catch(_e2){}
      }
    }
    var PORTAL_CEO_ALL_GROUP_SLUG = 'all_ceos';
    var PORTAL_CEO_LIAISON_GROUP_SLUG = 'ceo_liaison';
    var PORTAL_STAFF_LEADS_OPS_GROUP_SLUG = 'staff_leads_ops';
    var PORTAL_SESSION_LEADS_GROUP_SLUG = 'session_leads';
    function portalAdminDmMyAppRole(){
      return String((window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile && window.__PORTAL_SUPABASE__.staff_profile.app_role) || '').toLowerCase();
    }
    /** Internal CEO circle (`all_ceos`): visible to CEOs and to Victor/Raul/Javi — not to other admins. */
    function portalAdminDmViewerSeesInternalCeoRingGroup(){
      if(portalAdminDmMyAppRole() === 'ceo') return true;
      return portalAdminCanOpenAllCeoGroup();
    }
    function portalAdminDmViewerSeesCeoGroupSlug(slug){
      slug = String(slug || '').toLowerCase();
      if(slug === PORTAL_CEO_ALL_GROUP_SLUG) return portalAdminDmViewerSeesInternalCeoRingGroup();
      return true;
    }
    /** Quick-open / default compose group: internal ring for CEOs + inner ops admins; liaison for other admins. */
    async function portalAdminDmResolveQuickCeoGroupId(client){
      if(!client) return '';
      if(portalAdminDmMyAppRole() === 'ceo' || portalAdminCanOpenAllCeoGroup()){
        return portalAdminDmResolveInternalCeoGroupId(client);
      }
      return portalAdminDmResolveLiaisonCeoGroupId(client);
    }
    async function portalAdminDmResolveInternalCeoGroupId(client){
      if(!client) return '';
      var g = await client.from('portal_ceo_group').select('id').eq('slug', PORTAL_CEO_ALL_GROUP_SLUG).maybeSingle();
      if(g.error || !g.data || !g.data.id) return '';
      return String(g.data.id);
    }
    async function portalAdminDmResolveLiaisonCeoGroupId(client){
      if(!client) return '';
      var g = await client.from('portal_ceo_group').select('id').eq('slug', PORTAL_CEO_LIAISON_GROUP_SLUG).maybeSingle();
      if(g.error || !g.data || !g.data.id) return '';
      return String(g.data.id);
    }
    async function portalAdminDmResolveStaffLeadsOpsGroupId(client){
      if(!client) return '';
      var g = await client.from('portal_ceo_group').select('id,title').eq('slug', PORTAL_STAFF_LEADS_OPS_GROUP_SLUG).maybeSingle();
      if(g.error || !g.data || !g.data.id) return '';
      return String(g.data.id);
    }
    async function portalAdminDmResolveSessionLeadsGroupId(client){
      if(!client) return '';
      var g = await client.from('portal_ceo_group').select('id,title,slug').eq('slug', PORTAL_SESSION_LEADS_GROUP_SLUG).maybeSingle();
      if(g.error || !g.data || !g.data.id) return '';
      return String(g.data.id);
    }
    function portalAdminDmStaffChannelGroupSlug(slug){
      slug = String(slug || '').toLowerCase();
      if(slug === PORTAL_SESSION_LEADS_GROUP_SLUG || slug === PORTAL_STAFF_LEADS_OPS_GROUP_SLUG) return true;
      if(window.portalCsCliqAnnouncementInbox && typeof window.portalCsCliqAnnouncementInbox.isStaffPoolChannelSlug === 'function'){
        return window.portalCsCliqAnnouncementInbox.isStaffPoolChannelSlug(slug);
      }
      return slug === 'swimming_instructors' || slug === 'climbing_instructors' || slug === 'support_staff' || slug === 'pool_leads';
    }
    function portalAdminDmMessageCountsAsUnread(m){
      if(!m) return false;
      if(portalAdminDmIsMyMessage(m.author_id)) return false;
      var body = String(m.body || '');
      if(body.indexOf('[[portal-staff-call:') >= 0 || body.indexOf('[[portal-staff-call-end:') >= 0) return false;
      return true;
    }
    function portalAdminDmAckIsoFromMessages(arr){
      var latestIso = new Date().toISOString();
      if(Array.isArray(arr) && arr.length){
        for(var li = arr.length - 1; li >= 0; li--){
          if(arr[li] && arr[li].created_at){ latestIso = arr[li].created_at; break; }
        }
      }
      try{
        return new Date(new Date(latestIso).getTime() + 1).toISOString();
      }catch(_ack){ return latestIso; }
    }
    async function portalAdminDmRingAllLeads(gid){
      gid = String(gid || '').trim();
      if(!gid) return;
      await portalAdminDmOpenGroupThread(gid);
      if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.startCall === 'function'){
        await window.portalStaffChatCalls.startCall('video');
      }
    }
    async function portalAdminDmResolveAllCeoGroupId(client){
      return portalAdminDmResolveInternalCeoGroupId(client);
    }
    async function portalAdminDmResolveFirstOpsAdminId(client){
      if(!client) return '';
      var q = await client.from('staff_profiles').select('id,is_active').eq('app_role', 'admin').order('full_name', { ascending: true }).limit(40);
      if(q.error || !Array.isArray(q.data)) return '';
      var row = q.data.find(function(r){ return r && r.is_active !== false; });
      return row && row.id ? String(row.id) : '';
    }
    async function portalAdminDmEnsureDmThreadAndOpen(peerId){
      var client = getSchedSupabaseClient();
      var me = portalAdminDmMe();
      peerId = String(peerId || '').trim();
      if(!client || !me || !peerId || peerId === me) return;
      var guess = portalDmCanonThreadParticipantsGuess(me, peerId);
      var a = guess.participant_a;
      var b = guess.participant_b;
      function pickId(rows){
        var row0 = Array.isArray(rows) && rows[0] ? rows[0] : null;
        return row0 && row0.id ? String(row0.id) : '';
      }
      var r = await client.from('portal_staff_dm_threads').select('id').eq('participant_a', a).eq('participant_b', b).maybeSingle();
      if(r.error) return;
      var tid = r.data && r.data.id ? String(r.data.id) : '';
      if(!tid){
        var ins = await client.from('portal_staff_dm_threads').insert([{ participant_a: a, participant_b: b }]).select('id');
        tid = pickId(ins.data);
        if(!tid && ins.error && portalDmIsCheckOrderedPairError(ins.error)){
          ins = await client.from('portal_staff_dm_threads').insert([{ participant_a: b, participant_b: a }]).select('id');
          tid = pickId(ins.data);
        }
        if(!tid){
          var r2 = await client.from('portal_staff_dm_threads').select('id').eq('participant_a', a).eq('participant_b', b).maybeSingle();
          tid = r2.data && r2.data.id ? String(r2.data.id) : '';
        }
        if(!tid){
          var r3 = await client.from('portal_staff_dm_threads').select('id').eq('participant_a', b).eq('participant_b', a).maybeSingle();
          tid = r3.data && r3.data.id ? String(r3.data.id) : '';
        }
      }
      if(tid) await portalAdminDmOpenThread(tid);
    }
    try{
      window.portalAdminDmOpenGroupThread = portalAdminDmOpenGroupThread;
      window.portalAdminDmEnsureDmThreadAndOpen = portalAdminDmEnsureDmThreadAndOpen;
      window.portalAdminDmResolveSessionLeadsGroupId = portalAdminDmResolveSessionLeadsGroupId;
      window.portalAdminDmResolveStaffLeadsOpsGroupId = portalAdminDmResolveStaffLeadsOpsGroupId;
    }catch(_dmExport){}
    async function portalAdminDmOpenGroupThread(gid){
      gid = String(gid || '').trim();
      if(!gid) return;
      window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
      window.__PORTAL_ADMIN_DM_UI.threadId = '';
      window.__PORTAL_ADMIN_DM_UI.groupId = gid;
      window.__PORTAL_ADMIN_DM_UI.groupSlug = '';
      portalAdminDmTogglePanels('thread');
      var client = getSchedSupabaseClient();
      var peerEl = portalAdminDmEl('admDmThreadPeer');
      var groupLabel = 'Group';
      if(client){
        var gr = await client.from('portal_ceo_group').select('title,slug').eq('id', gid).maybeSingle();
        groupLabel = (!gr.error && gr.data && gr.data.title) ? String(gr.data.title) : 'Group';
        window.__PORTAL_ADMIN_DM_UI.groupSlug = (!gr.error && gr.data && gr.data.slug) ? String(gr.data.slug) : '';
      }
      if(peerEl) peerEl.textContent = groupLabel;
      window.__PORTAL_ADMIN_DM_UI.peerLabel = groupLabel;
      window.__PORTAL_ADMIN_DM_UI.peerRole = 'Group';
      window.__PORTAL_ADMIN_DM_UI.peerIsLeadOrManagement = true;
      var inp = portalAdminDmReplyInputEl();
      if(inp) inp.value = '';
      var errB = portalAdminDmReplyErrEl();
      if(errB) errB.textContent = '';
      portalAdminDmPremiumSyncView();
      if(portalAdminDmPremiumActive()) portalAdminDmBindVoiceControls();
      await portalAdminDmLoadMessages();
    }
    function openCeoExecDmChatModalToAllCeoGroup(){
      portalAdminDmApplyTeamTileUnreadClass();
      openCeoExecDmChatModal();
      setTimeout(function(){ void portalAdminDmJumpToQuickCeoGroupWhenReady(); }, 200);
    }
    async function portalAdminDmJumpToQuickCeoGroupWhenReady(){
      var cl = getSchedSupabaseClient();
      var gid = await portalAdminDmResolveQuickCeoGroupId(cl);
      if(gid && window.__PORTAL_ADMIN_DM_OPEN && portalAdminDmChannel() === 'ceo_exec') await portalAdminDmOpenGroupThread(gid);
    }
    async function portalAdminDmFillCeoQuickPicks(){
      if(portalAdminDmChannel() !== 'ceo_exec') return;
      var wrap = portalAdminDmEl('admDmCeoQuickWrap');
      var host = portalAdminDmEl('admDmQCeosHost');
      var opsBtn = portalAdminDmEl('admDmQOpsAdmin');
      var ceoGrpBtn = portalAdminDmEl('admDmQCeoGroup');
      if(host) host.innerHTML = '';
      var client = getSchedSupabaseClient();
      if(!client || !host) return;
      var gidQuick = await portalAdminDmResolveQuickCeoGroupId(client);
      if(opsBtn){
        opsBtn.onclick = function(){
          void (async function(){
            var oid = await portalAdminDmResolveFirstOpsAdminId(client);
            if(!oid){
              try{ alert('No operations admin profile found.'); }catch(_a){}
              return;
            }
            await portalAdminDmEnsureDmThreadAndOpen(oid);
          })();
        };
      }
      if(ceoGrpBtn){
        if(!gidQuick){
          ceoGrpBtn.hidden = true;
          ceoGrpBtn.onclick = null;
        }else{
          ceoGrpBtn.hidden = false;
          ceoGrpBtn.onclick = function(){
            void (async function(){ await portalAdminDmOpenGroupThread(gidQuick); })();
          };
        }
      }
      var me = portalAdminDmMe();
      var lr = await client.from('staff_profiles').select('id,full_name,username').eq('app_role', 'ceo').or('is_active.is.null,is_active.eq.true').order('full_name', { ascending: true });
      if(lr.error || !Array.isArray(lr.data)) return;
      lr.data.forEach(function(row){
        if(!row || !row.id) return;
        var id0 = String(row.id);
        if(me && id0 === me) return;
        var lab = ((row.full_name || row.username || '').trim() || id0.slice(0, 8)).split(/\s+/)[0] || 'CEO';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--sec btn--sm';
        btn.textContent = lab;
        btn.addEventListener('click', function(){
          void portalAdminDmEnsureDmThreadAndOpen(id0);
        });
        host.appendChild(btn);
      });
      if(wrap) wrap.hidden = false;
    }
    async function portalAdminDmFillStaffLeadsQuickPicks(){
      if(portalAdminDmChannel() !== 'staff_lead') return;
      var wrap = portalAdminDmEl('admDmStaffLeadsQuickWrap');
      var channelBtn = portalAdminDmEl('admDmQLeadsChannel');
      var ringBtn = portalAdminDmEl('admDmQRingAllLeads');
      var pickBtn = portalAdminDmEl('admDmQCallSelectedLeads');
      var client = getSchedSupabaseClient();
      if(!client) return;
      var gid = await portalAdminDmResolveSessionLeadsGroupId(client);
      function wire(btn, fn){
        if(!btn) return;
        if(!gid){
          btn.hidden = true;
          btn.onclick = null;
          return;
        }
        btn.hidden = false;
        btn.onclick = fn;
      }
      wire(channelBtn, function(){
        if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.openLeadsChannelPicker === 'function'){
          void window.portalStaffChatCalls.openLeadsChannelPicker();
        }
      });
      wire(ringBtn, function(){
        void portalAdminDmRingAllLeads(gid);
      });
      wire(pickBtn, function(){
        if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.openLeadsCallPicker === 'function'){
          void window.portalStaffChatCalls.openLeadsCallPicker();
        }
      });
      if(wrap) wrap.hidden = !gid;
    }
    function portalAdminDmReadStoreKey(){
      var box = window.__PORTAL_SUPABASE__;
      var uid = String(box && box.session && box.session.user && box.session.user.id || '').trim();
      return 'portal_admin_dm_read_v2_' + (uid || portalAdminDmMe() || 'anon');
    }
    function portalAdminDmReadStore(){
      try{
        var raw = localStorage.getItem(portalAdminDmReadStoreKey());
        if(!raw) return { threads: {}, groups: {} };
        var o = JSON.parse(raw);
        return { threads: o.threads || {}, groups: o.groups || {} };
      }catch(_a){ return { threads: {}, groups: {} }; }
    }
    function portalAdminDmSaveReadStore(store){
      try{ localStorage.setItem(portalAdminDmReadStoreKey(), JSON.stringify(store || { threads: {}, groups: {} })); }catch(_b){}
    }
    function portalAdminDmGetThreadAck(threadId){
      threadId = String(threadId || '').trim();
      if(!threadId) return '';
      return String(portalAdminDmReadStore().threads[threadId] || '').trim();
    }
    function portalAdminDmSetThreadAck(threadId, iso){
      threadId = String(threadId || '').trim();
      iso = String(iso || '').trim();
      if(!threadId || !iso) return;
      var s = portalAdminDmReadStore();
      s.threads[threadId] = iso;
      portalAdminDmSaveReadStore(s);
    }
    function portalAdminDmGetGroupAck(groupId){
      groupId = String(groupId || '').trim();
      if(!groupId) return '';
      return String(portalAdminDmReadStore().groups[groupId] || '').trim();
    }
    function portalAdminDmSetGroupAck(groupId, iso){
      groupId = String(groupId || '').trim();
      iso = String(iso || '').trim();
      if(!groupId || !iso) return;
      var s = portalAdminDmReadStore();
      s.groups[groupId] = iso;
      portalAdminDmSaveReadStore(s);
    }
    function portalAdminDmIsMessageAfterAck(createdAt, ackIso){
      if(!createdAt) return false;
      if(!ackIso) return true;
      try{
        return new Date(createdAt).getTime() > new Date(ackIso).getTime();
      }catch(_d){ return true; }
    }
    function portalAdminDmPreviewBody(row){
      if(!row) return 'Message';
      var mt = String(row.message_type || 'text').toLowerCase();
      if(mt === 'voice') return 'Voice message';
      if(mt === 'image') return 'Photo';
      if(mt === 'file') return 'Document';
      var body = String(row.body || '').trim();
      if(body.indexOf('[[portal-staff-call:') >= 0) return 'Call invite';
      if(body.indexOf('[[portal-staff-call-end:') >= 0){
        if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.parseCallEndPayload === 'function'){
          var endData = window.portalStaffChatCalls.parseCallEndPayload(body);
          if(endData && typeof window.portalStaffChatCalls.formatCallEndLabel === 'function'){
            return window.portalStaffChatCalls.formatCallEndLabel(endData.kind, endData.durationSec);
          }
        }
        return 'Call ended';
      }
      body = body.replace(/\s+/g, ' ');
      if(body.length > 80) body = body.slice(0, 79).trimEnd() + '\u2026';
      return body || 'Message';
    }
    function portalAdminDmSenderLabel(authorId, profBy, itemCtx){
      authorId = String(authorId || '').trim();
      var pr = profBy[authorId] || {};
      var mine = authorId && portalAdminDmIsMyMessage(authorId);
      var peerRole = '';
      if(itemCtx && itemCtx.peerProf){
        peerRole = String(itemCtx.peerProf.app_role || '').toLowerCase();
      }else if(window.__PORTAL_ADMIN_DM_UI && window.__PORTAL_ADMIN_DM_UI.peerRole){
        peerRole = String(window.__PORTAL_ADMIN_DM_UI.peerRole || '').toLowerCase();
      }
      if(
        window.portalChatActorIdentity &&
        typeof window.portalChatActorIdentity.managementListSenderLabel === 'function'
      ){
        return window.portalChatActorIdentity.managementListSenderLabel(pr, {
          mine: mine,
          channel: portalAdminDmChannel(),
          peerRole: peerRole
        });
      }
      if(mine) return 'You';
      return String(pr.full_name || pr.username || '').trim() || 'Unknown sender';
    }
    function portalAdminDmWorkerRoleTag(prof){
      prof = prof || {};
      var ar = String(prof.app_role || '').toLowerCase();
      if(ar === 'lead') return 'Lead';
      if(ar === 'staff') return 'Staff';
      var sr = String(prof.staff_role || '').toLowerCase();
      if(sr.indexOf('lead') >= 0) return 'Lead';
      return '';
    }
    function portalAdminDmPeerRoleLabel(prof){
      prof = prof || {};
      var ar = String(prof.app_role || '').toLowerCase();
      if(ar === 'admin' || ar === 'ceo') return 'Management';
      return portalAdminDmWorkerRoleTag(prof) || 'Staff';
    }
    function portalAdminDmPeerIsLeadOrManagement(prof){
      var label = portalAdminDmPeerRoleLabel(prof);
      return label === 'Lead' || label === 'Management';
    }
    function portalAdminDmFormatListWhen(iso){
      if(!iso) return '';
      try{
        return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      }catch(_d){ return ''; }
    }
    async function portalAdminDmEnrichListItems(client, me, ch, merged, profBy){
      if(!client || !me || !Array.isArray(merged) || !merged.length) return merged;
      profBy = profBy || {};
      var dmIds = merged.filter(function(i){ return i.kind === 'dm'; }).map(function(i){ return i.id; });
      var groupIds = merged.filter(function(i){ return i.kind === 'group'; }).map(function(i){ return i.id; });
      async function ensureAuthors(ids){
        var missing = (ids || []).filter(function(id, idx, arr){
          return id && arr.indexOf(id) === idx && !profBy[id];
        });
        if(!missing.length) return;
        var pr = await client.from('staff_profiles').select('id,full_name,username,app_role,staff_role').in('id', missing);
        if(!pr.error && Array.isArray(pr.data)){
          pr.data.forEach(function(p){ if(p && p.id) profBy[String(p.id)] = p; });
        }
      }
      if(dmIds.length){
        var lastByThread = {};
        var unreadByThread = {};
        var lq = await client.from('portal_staff_dm_messages')
          .select('thread_id,author_id,body,created_at,message_type')
          .in('thread_id', dmIds)
          .order('created_at', { ascending: false })
          .limit(Math.min(Math.max(dmIds.length * 4, 24), 240));
        if(!lq.error && Array.isArray(lq.data)){
          var authorIds = [];
          lq.data.forEach(function(m){
            if(!m || !m.thread_id) return;
            var tid = String(m.thread_id);
            if(!lastByThread[tid]){
              lastByThread[tid] = m;
              authorIds.push(String(m.author_id || ''));
            }
          });
          await ensureAuthors(authorIds);
        }
        var uq = await client.from('portal_staff_dm_messages')
          .select('thread_id,author_id,created_at,body')
          .in('thread_id', dmIds);
        if(!uq.error && Array.isArray(uq.data)){
          uq.data.forEach(function(m){
            if(!m || !m.thread_id) return;
            if(!portalAdminDmMessageCountsAsUnread(m)) return;
            var tid = String(m.thread_id);
            if(!portalAdminDmIsMessageAfterAck(m.created_at, portalAdminDmGetThreadAck(tid))) return;
            unreadByThread[tid] = (unreadByThread[tid] || 0) + 1;
          });
        }
        merged.forEach(function(item){
          if(item.kind !== 'dm') return;
          var m = lastByThread[item.id];
          if(m){
            item.lastSender = portalAdminDmSenderLabel(m.author_id, profBy, item);
            item.lastPreview = portalAdminDmPreviewBody(m);
            item.when = m.created_at || item.when;
          }
          item.unreadCount = unreadByThread[item.id] || 0;
        });
      }
      if(groupIds.length){
        var lastByGroup = {};
        var unreadByGroup = {};
        var glq = await client.from('portal_ceo_group_message')
          .select('group_id,author_id,body,created_at,message_type')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false })
          .limit(Math.min(Math.max(groupIds.length * 4, 16), 120));
        if(!glq.error && Array.isArray(glq.data)){
          var gAuthorIds = [];
          glq.data.forEach(function(m){
            if(!m || !m.group_id) return;
            var gid = String(m.group_id);
            if(!lastByGroup[gid]){
              lastByGroup[gid] = m;
              gAuthorIds.push(String(m.author_id || ''));
            }
          });
          await ensureAuthors(gAuthorIds);
        }
        var guq = await client.from('portal_ceo_group_message')
          .select('group_id,author_id,created_at,body')
          .in('group_id', groupIds);
        if(!guq.error && Array.isArray(guq.data)){
          guq.data.forEach(function(m){
            if(!m || !m.group_id) return;
            if(!portalAdminDmMessageCountsAsUnread(m)) return;
            var gid = String(m.group_id);
            if(!portalAdminDmIsMessageAfterAck(m.created_at, portalAdminDmGetGroupAck(gid))) return;
            unreadByGroup[gid] = (unreadByGroup[gid] || 0) + 1;
          });
        }
        merged.forEach(function(item){
          if(item.kind !== 'group') return;
          var gm = lastByGroup[item.id];
          if(gm){
            item.lastSender = portalAdminDmSenderLabel(gm.author_id, profBy);
            item.lastPreview = portalAdminDmPreviewBody(gm);
            item.when = gm.created_at || item.when;
          }
          item.unreadCount = unreadByGroup[item.id] || 0;
        });
      }
      return merged;
    }
    function portalAdminDmCsCliqUnifiedInbox(){
      return !!(global.__PORTAL_CS_CLIQ_ACTIVE);
    }
    function portalAdminDmSimplifyGroupLabel(slug, title){
      if(global.portalCsCliqAnnouncementInbox && typeof global.portalCsCliqAnnouncementInbox.simplifyGroupLabel === 'function'){
        return global.portalCsCliqAnnouncementInbox.simplifyGroupLabel(slug, title);
      }
      slug = String(slug || '').toLowerCase();
      title = String(title || '').trim();
      if(slug === 'all_ceos' || /all\s*ceos/i.test(title)) return 'Executive group';
      if(slug === 'ceo_liaison' || /ceo\s*liaison/i.test(title)) return 'Management group';
      if(slug === 'staff_leads_ops' || /operations\s*group/i.test(title)) return 'Leads coordination';
      return title || 'Group';
    }
    function portalAdminDmRenderInboxSectionLabel(text){
      var el = document.createElement('p');
      el.className = 'portal-cs-cliq-inbox-section__label';
      el.textContent = text;
      return el;
    }
    function portalAdminDmRenderThreadListItem(item, me, ch){
      var when = portalAdminDmFormatListWhen(item.when);
      var unread = Number(item.unreadCount) || 0;
      var ui = window.__PORTAL_ADMIN_DM_UI || {};
      var active =
        (item.kind === 'group' && String(ui.groupId || '') === String(item.id || '')) ||
        (item.kind !== 'group' && String(ui.threadId || '') === String(item.id || ''));
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'portal-dm-thread-item' +
        (unread > 0 ? ' portal-dm-thread-item--unread' : '') +
        (active ? ' portal-dm-thread-item--active' : '');
      if(item.kind === 'group'){
        btn.setAttribute('data-adm-dm-group', item.id);
        btn.addEventListener('click', function(){
          void portalAdminDmOpenGroupThread(item.id);
        });
      }else{
        btn.setAttribute('data-adm-dm-thread', item.id);
        btn.addEventListener('click', function(){
          void portalAdminDmOpenThread(item.id);
        });
      }
      var roleTag = '';
      var peerProf = item.peerProf || null;
      var avatarItem = {
        kind: item.kind,
        label: item.label,
        unreadCount: unread,
        isTeamChat: !!item.isTeamChat,
        peerProfile: peerProf,
        username: peerProf && peerProf.username ? String(peerProf.username).trim() : ''
      };
      if(item.kind === 'dm' && ch === 'staff_lead'){
        if(item.isTeamChat){
          roleTag = '<span class="portal-dm-thread-role-tag portal-dm-thread-role-tag--team">Team chat</span>';
        }else{
          var rt = portalAdminDmWorkerRoleTag(item.peerProf || {});
          if(rt === 'Lead'){
            roleTag = '<span class="portal-dm-thread-role-tag portal-dm-thread-role-tag--lead">Lead</span>';
            avatarItem.roleTone = 'lead';
          }else if(rt === 'Staff'){
            roleTag = '<span class="portal-dm-thread-role-tag portal-dm-thread-role-tag--staff">Staff</span>';
            avatarItem.roleTone = 'staff';
          }
        }
      }else if(item.kind === 'group'){
        roleTag = '<span class="portal-dm-thread-role-tag portal-dm-thread-role-tag--group">Group</span>';
      }else if(ch === 'ceo_exec'){
        avatarItem.roleTone = 'exec';
      }
      var avatarHtml = '';
      if(window.portalDmThreadAvatar && typeof window.portalDmThreadAvatar.html === 'function'){
        avatarHtml = window.portalDmThreadAvatar.html(avatarItem, esc, ch);
      }
      var preview = '';
      if(item.lastSender || item.lastPreview){
        var sender = esc(String(item.lastSender || '').trim());
        var prev = esc(String(item.lastPreview || '').trim());
        preview = '<div class="portal-dm-thread-preview"><span class="portal-dm-thread-preview-sender">'+sender+(sender && prev ? ': ' : '')+'</span><span class="portal-dm-thread-preview-text">'+prev+'</span></div>';
      }else{
        preview = '<div class="portal-dm-thread-preview portal-dm-thread-preview--empty">No messages yet</div>';
      }
      var badge = unread > 0
        ? '<span class="portal-dm-thread-unread-badge" aria-label="'+esc(String(unread)+' unread')+'">'+esc(unread > 99 ? '99+' : String(unread))+'</span>'
        : '';
      btn.innerHTML =
        avatarHtml+
        '<div class="portal-dm-thread-item__body">'+
          '<div class="portal-dm-thread-item__head">'+
            '<span class="portal-dm-thread-peer">'+esc(item.label)+roleTag+'</span>'+
            '<span class="portal-dm-thread-when">'+esc(when || 'Conversation')+'</span>'+
          '</div>'+
          preview+
        '</div>'+
        badge;
      return btn;
    }
    async function portalAdminDmRenderList(){
      var host = portalAdminDmListHostEl();
      var client = getSchedSupabaseClient();
      var me = portalAdminDmMe();
      var ch = portalAdminDmChannel();
      if(!host) return;
      if(!client || !me){
        host.innerHTML = '<p class="muted" style="margin:0;font-size:13px;min-width:0;overflow-wrap:break-word">Sign in to load conversations.</p>';
        return;
      }
      host.innerHTML = '<p class="muted" style="margin:0;font-size:13px">Loading conversations…</p>';
      var merged = [];
      var unified = portalAdminDmCsCliqUnifiedInbox();
      var groupIds = {};
      function pushGroup(g){
        if(!g || !g.id) return;
        var gid = String(g.id);
        if(groupIds[gid]) return;
        var gsl = String(g.slug || '').toLowerCase();
        if(!portalAdminDmViewerSeesCeoGroupSlug(gsl)) return;
        groupIds[gid] = true;
        merged.push({
          kind: 'group',
          id: gid,
          slug: gsl,
          label: portalAdminDmSimplifyGroupLabel(gsl, String(g.title || g.slug || 'Group')),
          when: g.updated_at
        });
      }
      if(unified){
        var gresAll = await client.from('portal_ceo_group').select('id,title,slug,updated_at').order('updated_at', { ascending: false });
        if(!gresAll.error && Array.isArray(gresAll.data)){
          gresAll.data.forEach(pushGroup);
        }
      }else if(ch === 'ceo_exec'){
        var gres = await client.from('portal_ceo_group').select('id,title,slug,updated_at').order('updated_at', { ascending: false });
        if(!gres.error && Array.isArray(gres.data)) gres.data.forEach(pushGroup);
      }else if(ch === 'staff_lead'){
        var gidLeads = await portalAdminDmResolveSessionLeadsGroupId(client);
        if(gidLeads){
          var gLeads = await client.from('portal_ceo_group').select('id,title,slug,updated_at').eq('id', gidLeads).maybeSingle();
          if(!gLeads.error && gLeads.data) pushGroup(gLeads.data);
        }
      }
      var res;
      if(unified && global.portalCsCliqHubRoles && typeof global.portalCsCliqHubRoles.getTier === 'function' && global.portalCsCliqHubRoles.getTier() === 'management'){
        var resSl = await portalAdminDmFetchStaffDmThreads(client, me, 'staff_lead');
        var resCe = await portalAdminDmFetchStaffDmThreads(client, me, 'ceo_exec');
        var rowsMerged = [];
        if(!resSl.error && Array.isArray(resSl.data)) rowsMerged = rowsMerged.concat(resSl.data);
        if(!resCe.error && Array.isArray(resCe.data)) rowsMerged = rowsMerged.concat(resCe.data);
        var seenTid = {};
        rowsMerged = rowsMerged.filter(function(r){
          var id = String(r && r.id || '');
          if(!id || seenTid[id]) return false;
          seenTid[id] = true;
          return true;
        });
        res = { data: rowsMerged, error: resSl.error || resCe.error };
      }else{
        res = await portalAdminDmFetchStaffDmThreads(client, me, ch);
      }
      if(res.error){
        host.innerHTML = '<p class="muted" style="margin:0;color:var(--danger);min-width:0;overflow-wrap:break-word">'+esc(String(res.error.message || res.error))+'</p>';
        return;
      }
      var rows = Array.isArray(res.data) ? res.data : [];
      var allIds = [];
      rows.forEach(function(r){
        if(r.participant_a) allIds.push(String(r.participant_a));
        if(r.participant_b) allIds.push(String(r.participant_b));
      });
      allIds = allIds.filter(function(id, idx, arr){ return id && arr.indexOf(id) === idx; });
      var names = {};
      var profBy = {};
      if(allIds.length){
        var pr = await client.from('staff_profiles').select('id,full_name,username,app_role,staff_role,dashboard_route,is_active').in('id', allIds);
        if(!pr.error && Array.isArray(pr.data)){
          pr.data.forEach(function(p){
            var id0 = String(p.id || '');
            profBy[id0] = p;
            names[id0] = ((p.full_name || p.username || '').trim() || id0.slice(0, 8));
          });
        }
      }
      rows = rows.filter(function(r){
        var peerSl = portalAdminDmWorkerPeerFromThread(r, profBy, me);
        var peerCe = portalDmPeerIdForThread(me, r);
        if(unified){
          return portalAdminDmProfileMatchesChannel(profBy[peerSl] || {}, 'staff_lead') ||
            portalAdminDmIsPeerTeamChatThread(r, profBy) ||
            portalAdminDmProfileMatchesChannel(profBy[peerCe] || {}, 'ceo_exec');
        }
        var pid = ch === 'staff_lead' ? peerSl : peerCe;
        return portalAdminDmProfileMatchesChannel(profBy[pid] || {});
      });
      rows.forEach(function(r){
        var id = String(r.id || '');
        var peerSl = portalAdminDmWorkerPeerFromThread(r, profBy, me);
        var peerCe = portalDmPeerIdForThread(me, r);
        var peer = ch === 'staff_lead' ? peerSl : peerCe;
        var isTeamChat = ch === 'staff_lead' && portalAdminDmIsPeerTeamChatThread(r, profBy);
        if(unified){
          isTeamChat = portalAdminDmIsPeerTeamChatThread(r, profBy);
          if(isTeamChat || portalAdminDmProfileMatchesChannel(profBy[peerSl] || {}, 'staff_lead')){
            peer = peerSl;
          }else{
            peer = peerCe;
          }
        }
        var label = isTeamChat ? portalAdminDmTeamChatLabel(r, names) : (names[peer] || ('Chat · ' + peer.slice(0, 8)));
        merged.push({
          kind: 'dm',
          id: id,
          label: label,
          when: r.updated_at,
          peerId: peer,
          peerProf: profBy[peer] || {},
          isTeamChat: isTeamChat,
          threadRow: r
        });
      });
      await portalAdminDmEnrichListItems(client, me, ch, merged, profBy);
      merged.sort(function(a, b){
        var ta = 0;
        var tb = 0;
        try{ if(a.when) ta = new Date(a.when).getTime(); }catch(_e){}
        try{ if(b.when) tb = new Date(b.when).getTime(); }catch(_e2){}
        return tb - ta;
      });
      host.innerHTML = '';
      if(merged.length){
        var groups = merged.filter(function(item){ return item.kind === 'group'; });
        var dms = merged.filter(function(item){ return item.kind !== 'group'; });
        if(unified){
          if(dms.length){
            host.appendChild(portalAdminDmRenderInboxSectionLabel('Messages'));
            dms.forEach(function(item){
              host.appendChild(portalAdminDmRenderThreadListItem(item, me, ch));
            });
          }
          if(groups.length){
            host.appendChild(portalAdminDmRenderInboxSectionLabel('Groups'));
            groups.forEach(function(item){
              host.appendChild(portalAdminDmRenderThreadListItem(item, me, ch));
            });
          }
        }else{
          merged.forEach(function(item){
            host.appendChild(portalAdminDmRenderThreadListItem(item, me, ch));
          });
        }
      }
      if(!host.children.length){
        host.innerHTML = '<p class="muted" style="margin:0;font-size:13px;min-width:0;overflow-wrap:break-word">No conversations yet. Use <strong>New message</strong> to start.</p>';
      }
    }
    async function portalAdminDmOpenThread(tid){
      tid = String(tid || '').trim();
      if(!tid) return;
      window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
      window.__PORTAL_ADMIN_DM_UI.groupId = '';
      window.__PORTAL_ADMIN_DM_UI.groupSlug = '';
      window.__PORTAL_ADMIN_DM_UI.threadId = tid;
      portalAdminDmTogglePanels('thread');
      var me = portalAdminDmMe();
      var client = getSchedSupabaseClient();
      var peerEl = portalAdminDmEl('admDmThreadPeer');
      var peerLabel = '';
      if(client && me){
        var tres = await client.from('portal_staff_dm_threads').select('participant_a,participant_b').eq('id', tid).maybeSingle();
        var peerId = '';
        var profMap = {};
        if(tres && tres.data){
          var trow = tres.data;
          var ids = [String(trow.participant_a||''), String(trow.participant_b||'')].filter(Boolean);
          if(ids.length){
            var prM = await client.from('staff_profiles').select('id,full_name,username,app_role,staff_role,dashboard_route,is_active').in('id', ids);
            if(!prM.error && Array.isArray(prM.data)){
              prM.data.forEach(function(p){ if(p && p.id) profMap[String(p.id)] = p; });
            }
          }
          peerId = portalAdminDmChannel() === 'staff_lead'
            ? portalAdminDmWorkerPeerFromThread(trow, profMap, me)
            : portalDmPeerIdForThread(me, trow);
          if(portalAdminDmChannel() === 'staff_lead' && portalAdminDmIsPeerTeamChatThread(trow, profMap)){
            var namesMap = {};
            Object.keys(profMap).forEach(function(k){
              var p = profMap[k] || {};
              namesMap[k] = String(p.full_name || p.username || '').trim() || k.slice(0, 8);
            });
            peerLabel = portalAdminDmTeamChatLabel(trow, namesMap);
            peerId = '';
            window.__PORTAL_ADMIN_DM_UI.peerRole = 'Team';
            window.__PORTAL_ADMIN_DM_UI.peerIsLeadOrManagement = true;
          }
        }
        var peerProf = peerId ? (profMap[peerId] || {}) : {};
        if(peerId && !peerLabel){
          var pr2 = await client.from('staff_profiles').select('full_name,username,app_role,staff_role').eq('id', peerId).maybeSingle();
          if(!pr2.error && pr2.data){
            peerLabel = (pr2.data.full_name || pr2.data.username || '').trim() || peerId;
            peerProf = pr2.data;
          }else{
            peerLabel = peerId;
          }
        }
        if(peerId){
          window.__PORTAL_ADMIN_DM_UI.peerRole = portalAdminDmPeerRoleLabel(peerProf);
          window.__PORTAL_ADMIN_DM_UI.peerIsLeadOrManagement = portalAdminDmPeerIsLeadOrManagement(peerProf);
        }
      }
      window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
      window.__PORTAL_ADMIN_DM_UI.peerLabel = peerLabel || 'Conversation';
      if(peerEl) peerEl.textContent = window.__PORTAL_ADMIN_DM_UI.peerLabel;
      var inp = portalAdminDmReplyInputEl();
      if(inp) inp.value = '';
      var errB = portalAdminDmReplyErrEl();
      if(errB) errB.textContent = '';
      portalAdminDmPremiumSyncView();
      if(portalAdminDmPremiumActive()) portalAdminDmBindVoiceControls();
      await portalAdminDmLoadMessages();
    }
    function portalAdminDmMarkChannelReadFromMessages(arr, opts){
      opts = opts || {};
      var gid = opts.groupId ? String(opts.groupId).trim() : '';
      var tid = opts.threadId ? String(opts.threadId).trim() : '';
      var latestIso = portalAdminDmAckIsoFromMessages(arr);
      if(gid) portalAdminDmSetGroupAck(gid, latestIso);
      else if(tid) portalAdminDmSetThreadAck(tid, latestIso);
    }
    async function portalAdminDmLoadMessages(){
      var msgsBox = portalAdminDmMsgsEl();
      var client = getSchedSupabaseClient();
      var me = portalAdminDmMe();
      var ui = window.__PORTAL_ADMIN_DM_UI || {};
      var gid = ui.groupId ? String(ui.groupId).trim() : '';
      var tid = ui.threadId ? String(ui.threadId).trim() : '';
      if(!msgsBox || !client){
        if(msgsBox) msgsBox.innerHTML = '<p class="muted" style="margin:0">Not available.</p>';
        return;
      }
      msgsBox.innerHTML = '<p class="muted" style="margin:0">Loading…</p>';
      var arr = [];
      var mres;
      if(gid){
        mres = await client.from('portal_ceo_group_message').select(window.portalDmVoice ? window.portalDmVoice.MSG_FIELDS : 'id,author_id,body,created_at,message_type,audio_storage_path,audio_mime,duration_ms').eq('group_id', gid).order('created_at', { ascending: true });
        if(mres.error){
          msgsBox.innerHTML = '<p class="muted" style="margin:0;color:var(--danger);min-width:0;overflow-wrap:break-word">'+esc(String(mres.error.message || mres.error))+'</p>';
          return;
        }
        arr = mres.data || [];
      }else{
        if(!tid){
          if(msgsBox) msgsBox.innerHTML = '<p class="muted" style="margin:0">Not available.</p>';
          return;
        }
        mres = await client.from('portal_staff_dm_messages').select(window.portalDmVoice ? window.portalDmVoice.MSG_FIELDS : 'id,author_id,body,created_at,message_type,audio_storage_path,audio_mime,duration_ms').eq('thread_id', tid).order('created_at', { ascending: true });
        if(mres.error){
          msgsBox.innerHTML = '<p class="muted" style="margin:0;color:var(--danger);min-width:0;overflow-wrap:break-word">'+esc(String(mres.error.message || mres.error))+'</p>';
          return;
        }
        arr = mres.data || [];
      }
      msgsBox.innerHTML = '';
      var ch = portalAdminDmChannel();
      var peerRole = '';
      if(!gid && tid){
        var tres0 = await client.from('portal_staff_dm_threads').select('participant_a,participant_b').eq('id', tid).maybeSingle();
        var peerId0 = '';
        if(tres0 && tres0.data){
          var t0 = tres0.data;
          var ids0 = [String(t0.participant_a||''), String(t0.participant_b||'')].filter(Boolean);
          var prof0 = {};
          if(ids0.length){
            var pr0 = await client.from('staff_profiles').select('id,app_role,staff_role,dashboard_route,is_active').in('id', ids0);
            if(!pr0.error && Array.isArray(pr0.data)){
              pr0.data.forEach(function(p){ if(p && p.id) prof0[String(p.id)] = p; });
            }
          }
          peerId0 = ch === 'staff_lead' ? portalAdminDmWorkerPeerFromThread(t0, prof0, me) : portalDmPeerIdForThread(me, t0);
        }
        if(peerId0){
          var prPeer = await client.from('staff_profiles').select('app_role').eq('id', peerId0).maybeSingle();
          if(!prPeer.error && prPeer.data) peerRole = String(prPeer.data.app_role || '').toLowerCase();
          window.__PORTAL_ADMIN_DM_UI = window.__PORTAL_ADMIN_DM_UI || {};
          window.__PORTAL_ADMIN_DM_UI.peerRole = peerRole;
        }
      }
      var authorIds = [];
      arr.forEach(function(m){
        var x = String(m.author_id || '').trim();
        if(x && authorIds.indexOf(x) === -1) authorIds.push(x);
      });
      var authorBy = {};
      if(authorIds.length){
        var ap = await client.from('staff_profiles').select('id,full_name,username,app_role').in('id', authorIds);
        if(!ap.error && Array.isArray(ap.data)){
          ap.data.forEach(function(p){
            if(p && p.id) authorBy[String(p.id)] = p;
          });
        }
      }
      if(!arr.length){
        var ph = document.createElement('p');
        ph.className = 'muted';
        ph.style.margin = '0';
        ph.style.fontSize = '13px';
        ph.textContent = 'No messages yet.';
        msgsBox.appendChild(ph);
      }else{
        if(arr.length && window.portalStaffChatCalls && typeof window.portalStaffChatCalls.scanThreadForIncomingCall === 'function'){
          window.portalStaffChatCalls.scanThreadForIncomingCall(arr[arr.length - 1], me);
        }
        for(var mi = 0; mi < arr.length; mi++){
          var m = arr[mi];
          if(window.portalStaffChatCalls && typeof window.portalStaffChatCalls.renderCallEndRow === 'function'){
            var callEndRow = window.portalStaffChatCalls.renderCallEndRow(m);
            if(callEndRow){
              msgsBox.appendChild(callEndRow);
              continue;
            }
          }
          var mine = portalAdminDmIsMyMessage(m.author_id);
          var aid = String(m.author_id || '').trim();
          var arow = authorBy[aid] || {};
          var row = document.createElement('div');
          row.className = 'portal-dm-msg-row ' + (mine ? 'portal-dm-msg-row--mine' : 'portal-dm-msg-row--them');
          var div = document.createElement('div');
          div.className = 'portal-dm-msg ' + (mine ? 'portal-dm-msg--mine' : 'portal-dm-msg--them');
          var tline = '';
          try{ if(m.created_at) tline = new Date(m.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }catch(_t){}
          var chip = portalAdminDmMsgAuthorChip({
            mine: mine,
            channel: ch,
            peerRole: peerRole,
            authorRole: String(arow.app_role || '').toLowerCase(),
            authorRow: arow,
            authorProf: arow
          });
          if(chip){
            var chipEl = document.createElement('div');
            chipEl.className = 'portal-dm-msg-by';
            chipEl.textContent = chip;
            div.appendChild(chipEl);
          }
          var bodyHost = document.createElement('div');
          bodyHost.className = 'portal-dm-msg-body';
          bodyHost.style.minWidth = '0';
          if(window.portalStaffChatCalls && window.portalStaffChatCalls.fillMessageBody){
            await window.portalStaffChatCalls.fillMessageBody(bodyHost, m, client, esc, me);
          }else if(window.portalDmVoice && window.portalDmVoice.fillMessageBody){
            await window.portalDmVoice.fillMessageBody(bodyHost, m, client, esc);
          }else{
            bodyHost.style.whiteSpace = 'pre-wrap';
            bodyHost.style.overflowWrap = 'break-word';
            bodyHost.textContent = String(m.body || '');
          }
          div.appendChild(bodyHost);
          if(tline){
            var timeEl = document.createElement('div');
            timeEl.className = 'portal-dm-msg-time';
            timeEl.textContent = tline;
            div.appendChild(timeEl);
          }
          row.appendChild(div);
          msgsBox.appendChild(row);
        }
      }
      var uiRead = window.__PORTAL_ADMIN_DM_UI || {};
      if((uiRead.threadId || uiRead.groupId) && (uiRead.panel === 'thread' || String(uiRead.panel || '') === 'thread')){
        portalAdminDmMarkChannelReadFromMessages(arr, { groupId: gid, threadId: tid });
        void portalAdminDmSyncIncomingAttention();
      }
      msgsBox.scrollTop = msgsBox.scrollHeight;
    }
    function portalAdminDmBindAttachmentControls(){
      var pa = window.portalDmAttachments;
      if(!pa || typeof pa.attachFilePickers !== 'function') return;
      function bindAttach(textareaId, photoBtnId, docBtnId, errPick){
        var ta = document.getElementById(textareaId);
        if(!ta || ta.dataset.portalAttachUiBound === '1') return;
        ta.dataset.portalAttachUiBound = '1';
        pa.attachFilePickers({
          textareaId: textareaId,
          photoBtnId: photoBtnId,
          docBtnId: docBtnId,
          getContext: function(){
            var ui = window.__PORTAL_ADMIN_DM_UI || {};
            return {
              client: getSchedSupabaseClient(),
              threadId: String(ui.threadId || '').trim(),
              groupId: String(ui.groupId || '').trim(),
              authorId: portalAdminDmMe()
            };
          },
          onSent: function(){ return portalAdminDmLoadMessages(); },
          onError: function(msg){
            var errB = errPick();
            if(errB) errB.textContent = msg;
          }
        });
      }
      bindAttach('admDmReplyBody', 'admDmPhotoBtn', 'admDmDocBtn', function(){ return $('admDmThreadErr'); });
      bindAttach('internalChatInput', 'internalChatPhotoBtn', 'internalChatDocBtn', function(){ return document.getElementById('internalChatErr'); });
      bindAttach('csCliqInput', 'csCliqPhotoBtn', 'csCliqDocBtn', function(){ return document.getElementById('csCliqErr'); });
    }
    function portalAdminDmBindVoiceControls(){
      var pv = window.portalDmVoice;
      if(!pv) return;
      function bindVoice(btnId, taId, errPick){
        var replyTa = document.getElementById(taId);
        if(!replyTa || replyTa.dataset.portalVoiceBound === '1') return;
        replyTa.dataset.portalVoiceBound = '1';
        pv.ensureMicButtonBefore(replyTa, btnId);
        pv.attachVoiceButton({
          buttonId: btnId,
          textareaId: taId,
          hintId: btnId + 'Hint',
          getContext: function(){
            var ui = window.__PORTAL_ADMIN_DM_UI || {};
            return {
              client: getSchedSupabaseClient(),
              threadId: String(ui.threadId || '').trim(),
              groupId: String(ui.groupId || '').trim(),
              authorId: portalAdminDmMe()
            };
          },
          onSent: function(){ return portalAdminDmLoadMessages(); },
          onError: function(msg){
            var errB = errPick();
            if(errB) errB.textContent = msg;
          }
        });
      }
      bindVoice('admDmVoiceBtn', 'admDmReplyBody', function(){ return $('admDmThreadErr'); });
      bindVoice('internalChatVoiceBtn', 'internalChatInput', function(){ return document.getElementById('internalChatErr'); });
      bindVoice('csCliqVoiceBtn', 'csCliqInput', function(){ return document.getElementById('csCliqErr'); });
      portalAdminDmBindAttachmentControls();
    }
    async function portalAdminDmSendReply(){
      var client = getSchedSupabaseClient();
      if(
        window.portalChatActorIdentity &&
        typeof window.portalChatActorIdentity.ensureSessionProfile === 'function' &&
        client
      ){
        await window.portalChatActorIdentity.ensureSessionProfile(client);
      }
      var ui = window.__PORTAL_ADMIN_DM_UI || {};
      var gid = ui.groupId ? String(ui.groupId).trim() : '';
      var tid = ui.threadId ? String(ui.threadId).trim() : '';
      var inp = portalAdminDmReplyInputEl();
      var errB = portalAdminDmReplyErrEl();
      var sendBtn = portalAdminDmReplySendEl();
      var body = inp ? String(inp.value || '').trim() : '';
      var me = portalAdminDmMe();
      if(errB) errB.textContent = '';
      if(!client || (!tid && !gid)){
        if(errB) errB.textContent = 'Not available.';
        return;
      }
      if(!body){
        if(errB) errB.textContent = 'Enter a message.';
        return;
      }
      if(sendBtn) sendBtn.disabled = true;
      try{
        if(gid){
          var insG = await client.from('portal_ceo_group_message').insert([{ group_id: gid, author_id: me, body: body, message_type: 'text' }]).select('id');
          if(insG.error) throw insG.error;
        }else{
          var ins = await client.rpc('portal_staff_dm_insert_message', {
            p_thread_id: tid,
            p_body: body,
            p_message_type: 'text'
          });
          if(ins.error){
            ins = await client.from('portal_staff_dm_messages').insert([{ thread_id: tid, author_id: me, body: body, message_type: 'text' }]).select('id');
          }
          if(ins.error) throw ins.error;
        }
        if(inp) inp.value = '';
        await portalAdminDmLoadMessages();
        if(tid) portalAdminDmSetThreadAck(tid, new Date().toISOString());
        else if(gid) portalAdminDmSetGroupAck(gid, new Date().toISOString());
        void portalAdminDmSyncIncomingAttention();
        var uiAfter = window.__PORTAL_ADMIN_DM_UI || {};
        if(String(uiAfter.panel || '') === 'list' && typeof portalAdminDmRenderList === 'function'){
          void portalAdminDmRenderList();
        }
      }catch(e){
        if(errB) errB.textContent = String((e && e.message) || e || 'Send failed');
      }finally{
        if(sendBtn) sendBtn.disabled = false;
      }
    }
    function portalAdminDmPeerLabelFromRow(row){
      var id0 = String(row && row.id || '');
      var label = (row.full_name || row.username || '').trim() || id0.slice(0, 8);
      var bits = [];
      if(row.app_role) bits.push(row.app_role);
      if(row.staff_role) bits.push(row.staff_role);
      return label + (bits.length ? ' — ' + bits.join(' · ') : '');
    }
    function portalAdminDmShortDisplayName(row){
      var t = String((row && (row.full_name || row.username)) || '').trim();
      if(!t) return '';
      var parts = t.split(/\s+/);
      return parts[0] || t;
    }
    /** Line above DM bubble — staff lane vs management board (see portal_chat_actor_identity.js). */
    function portalAdminDmMsgAuthorChip(opts){
      opts = opts || {};
      if(
        window.portalChatActorIdentity &&
        typeof window.portalChatActorIdentity.managementMsgAuthorChip === 'function'
      ){
        return window.portalChatActorIdentity.managementMsgAuthorChip(opts);
      }
      if(opts.mine) return '';
      var ch = String(opts.channel || '').trim();
      var peerRole = String(opts.peerRole || '').toLowerCase();
      var ar = String(opts.authorRole || '').toLowerCase();
      var authorRow = opts.authorRow || {};
      if(ch === 'staff_lead' && (peerRole === 'staff' || peerRole === 'lead')){
        if(ar === 'admin' || ar === 'ceo') return 'Admin';
        return portalAdminDmShortDisplayName(authorRow) || 'Team';
      }
      if(ch === 'ceo_exec'){
        if(ar === 'admin') return 'Admin';
        if(ar === 'ceo') return portalAdminDmShortDisplayName(authorRow) || 'CEO';
        return portalAdminDmShortDisplayName(authorRow) || '';
      }
      return portalAdminDmShortDisplayName(authorRow) || '';
    }
    function portalAdminDmNormPeerKey(s){
      return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
    }
    /** All-CEOs group DM: Victor, Raúl, Javi only (not other admins e.g. Sevitha). Uses signed-in `staff_profiles` first name or username. */
    function portalAdminCanOpenAllCeoGroup(){
      var sp = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
      if(!sp) return false;
      var full = String(sp.full_name || '').trim();
      var user = String(sp.username || '').trim();
      var first = (full.split(/\s+/)[0] || user || '').trim();
      var n = portalAdminDmNormPeerKey(first);
      if(!n) return false;
      return n === 'victor' || n === 'raul' || n === 'javi';
    }
    function portalAdminDmDisplayNameFromLabel(label){
      var t = String(label || '').trim();
      var i = t.indexOf(' —');
      return (i === -1 ? t : t.slice(0, i)).trim();
    }
    /** If hidden peer empty, resolve from typed search (exact / unique match / Group). */
    function portalAdminDmSyncHiddenPeerFromSearch(){
      var hidden = portalAdminDmEl('admDmPeerUser');
      var search = portalAdminDmEl('admDmPeerSearch');
      if(!hidden || !search) return;
      if(String(hidden.value || '').trim()) return;
      var id = portalAdminDmResolvePeerIdFromSearchText(search.value);
      if(id) hidden.value = id;
    }
    function portalAdminDmResolvePeerIdFromSearchText(raw){
      var q0 = String(raw || '').trim();
      if(!q0) return '';
      var rows = window.__PORTAL_ADMIN_DM_PEER_ROWS || [];
      var ch = portalAdminDmChannel();
      var qn = portalAdminDmNormPeerKey(q0);
      if(!qn) return '';
      if(ch === 'ceo_exec'){
        if(qn === 'group' || qn === 'grupo' || qn.indexOf('allceo') === 0 || qn.indexOf('allceos') === 0 || qn.indexOf('ceogroup') === 0 || qn === 'liaison') return '__CEO_GROUP__';
      }
      if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q0)){
        var byUuid = rows.find(function(r){ return String(r.id).toLowerCase() === q0.toLowerCase(); });
        if(byUuid) return String(byUuid.id);
      }
      var i;
      var exact = rows.filter(function(r){
        if(String(r.id) === '__ALL_CEO__' || String(r.id) === '__CEO_GROUP__') return false;
        return portalAdminDmNormPeerKey(portalAdminDmDisplayNameFromLabel(r.label)) === qn;
      });
      if(exact.length === 1) return String(exact[0].id);
      var firstTok = rows.filter(function(r){
        if(String(r.id) === '__ALL_CEO__' || String(r.id) === '__CEO_GROUP__') return false;
        var np = portalAdminDmDisplayNameFromLabel(r.label);
        var first = (np.split(/\s+/)[0] || '').trim();
        return portalAdminDmNormPeerKey(first) === qn;
      });
      if(firstTok.length === 1) return String(firstTok[0].id);
      var ql = q0.toLowerCase();
      var sub = rows.filter(function(r){
        if(String(r.id) === '__ALL_CEO__' || String(r.id) === '__CEO_GROUP__') return false;
        return String(r.label || '').toLowerCase().indexOf(ql) !== -1;
      });
      if(sub.length === 1) return String(sub[0].id);
      var pref = rows.filter(function(r){
        if(String(r.id) === '__ALL_CEO__' || String(r.id) === '__CEO_GROUP__') return false;
        var np = portalAdminDmNormPeerKey(portalAdminDmDisplayNameFromLabel(r.label));
        return np.indexOf(qn) === 0;
      });
      if(pref.length === 1) return String(pref[0].id);
      return '';
    }
    function portalWireAdminDmPeerAutocomplete(){
      var search = portalAdminDmEl('admDmPeerSearch');
      var hidden = portalAdminDmEl('admDmPeerUser');
      var box = portalAdminDmEl('admDmPeerSuggest');
      if(!search || !hidden || !box) return;
      if(search.dataset.portalAdmPeerComboBound) return;
      search.dataset.portalAdmPeerComboBound = '1';
      function renderSuggest(q){
        q = String(q || '').trim().toLowerCase();
        var rows = window.__PORTAL_ADMIN_DM_PEER_ROWS || [];
        var filtered = !q
          ? rows.slice(0, 100)
          : rows.filter(function(r){
              return String(r.label || '').toLowerCase().indexOf(q) !== -1;
            }).slice(0, 60);
        box.innerHTML = '';
        if(!filtered.length){
          box.hidden = true;
          return;
        }
        filtered.forEach(function(r){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'adm-dm-peer-suggest__btn';
          b.textContent = r.label;
          b.setAttribute('data-peer-id', r.id);
          b.addEventListener('click', function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            hidden.value = r.id;
            search.value = r.label;
            box.hidden = true;
          });
          box.appendChild(b);
        });
        box.hidden = false;
      }
      search.addEventListener('input', function(){
        hidden.value = '';
        renderSuggest(search.value);
      });
      search.addEventListener('focus', function(){
        if(!(window.__PORTAL_ADMIN_DM_PEER_ROWS || []).length){
          void portalLoadDmPeerUserSelect().then(function(){
            renderSuggest(search.value);
          });
          return;
        }
        renderSuggest(search.value);
      });
      search.addEventListener('blur', function(){
        setTimeout(function(){
          portalAdminDmSyncHiddenPeerFromSearch();
        }, 120);
      });
      if(!window.__PORTAL_ADMIN_DM_PEER_DOC_CLICK){
        window.__PORTAL_ADMIN_DM_PEER_DOC_CLICK = true;
        document.addEventListener('click', function(ev){
          var t = ev.target;
          if(t && t.closest && (t.closest('#admDmPeerSuggest') || t.closest('#admDmPeerSearch') || t.closest('#csCliqPeerSuggest') || t.closest('#csCliqPeerSearch'))) return;
          var bx = portalAdminDmEl('admDmPeerSuggest');
          if(bx) bx.hidden = true;
        });
      }
    }
    function portalResetAdminDmPeerPick(){
      var search = portalAdminDmEl('admDmPeerSearch');
      var hidden = portalAdminDmEl('admDmPeerUser');
      var box = portalAdminDmEl('admDmPeerSuggest');
      if(search) search.value = '';
      if(hidden) hidden.value = '';
      if(box){
        box.innerHTML = '';
        box.hidden = true;
      }
    }
    function portalLoadDmPeerUserSelect(){
      window.__PORTAL_ADMIN_DM_PEER_ROWS = [];
      var seen = {};
      var hidden = portalAdminDmEl('admDmPeerUser');
      var search = portalAdminDmEl('admDmPeerSearch');
      if(hidden) hidden.value = '';
      if(search) search.value = '';
      var box = portalAdminDmEl('admDmPeerSuggest');
      if(box){
        box.innerHTML = '';
        box.hidden = true;
      }
      var client = getSchedSupabaseClient();
      var me = portalAdminDmMe();
      var ch = portalAdminDmChannel();
      var myRole = String((window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile && window.__PORTAL_SUPABASE__.staff_profile.app_role) || '').toLowerCase();
      if(search) search.placeholder = 'Type to search by name…';
      if(!client){
        if(search) search.placeholder = 'Sign in to load directory';
        return Promise.resolve();
      }
      function pushRow(row){
        if(!row || row.is_active === false) return;
        var role = String(row.app_role || '').toLowerCase();
        var id0 = String(row.id || '');
        if(!id0 || id0 === me) return;
        if(ch === 'staff_lead'){
          if(!portalAdminDmIsWorkerRecipient(row)) return;
        }else{
          if(myRole === 'ceo'){
            if(role !== 'admin' && role !== 'ceo') return;
          }else{
            if(role !== 'ceo' && role !== 'admin') return;
          }
        }
        if(seen[id0]) return;
        seen[id0] = 1;
        window.__PORTAL_ADMIN_DM_PEER_ROWS.push({
          id: id0,
          label: portalAdminDmPeerLabelFromRow(row),
        });
      }
      var chunk = 800;
      var from = 0;
      var selectCols = 'id,full_name,username,app_role,staff_role,dashboard_route,is_active';
      function pullPage(){
        var to = from + chunk - 1;
        return client
          .from('staff_profiles')
          .select(selectCols)
          .order('full_name', { ascending: true })
          .range(from, to)
          .then(function(res){
            if(res.error){
              var errMsg = String(res.error.message || res.error || 'Load failed');
              if(selectCols.indexOf('dashboard_route') !== -1 && /dashboard_route/i.test(errMsg)){
                selectCols = 'id,full_name,username,app_role,staff_role,is_active';
                from = 0;
                window.__PORTAL_ADMIN_DM_PEER_ROWS = [];
                seen = {};
                return pullPage();
              }
              if(search) search.placeholder = errMsg;
              return;
            }
            var batch = res.data || [];
            batch.forEach(pushRow);
            if(batch.length < chunk){
              window.__PORTAL_ADMIN_DM_PEER_ROWS.sort(function(a, b){
                return String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' });
              });
              portalWireAdminDmPeerAutocomplete();
              portalAdminDmFinishPeerDirectoryLoad(search);
              return;
            }
            from += chunk;
            return pullPage();
          });
      }
      return pullPage();
    }
    function openInternalDmChatModal(){
      if(document.getElementById('internalChatSheet')){
        openAdminPremiumInternalChat('staff_lead');
        return;
      }
      openAdminDmChannelModal('staff_lead');
    }
    function openCeoExecDmChatModal(){
      if(document.getElementById('internalChatSheet')){
        openAdminPremiumInternalChat('ceo_exec');
        return;
      }
      openAdminDmChannelModal('ceo_exec');
    }
    function openAdminDmChannelModal(channel){
      openAdminPremiumInternalChat(channel);
      return;
      channel = String(channel || 'staff_lead').trim() === 'ceo_exec' ? 'ceo_exec' : 'staff_lead';
      window.__PORTAL_ADMIN_DM_CHANNEL = channel;
      window.__PORTAL_ADMIN_DM_OPEN = true;
      window.__PORTAL_ADMIN_DM_UI = { threadId: '', groupId: '', panel: 'list' };
      portalAdminDmApplyTeamTileUnreadClass();
      try{ portalAdminDmPatchGlobalChatBanner(); }catch(_cbn){}
      portalInitAdminDmRealtime();
      if(channel === 'staff_lead') void portalLoadDmPeerUserSelect();
      var title = channel === 'ceo_exec' ? 'CEO\'s Chat' : 'Internal chat';
      var listBlurb = channel === 'ceo_exec'
        ? ('CEOs and ops admins. <strong>CEO group</strong> opens your shared thread (liaison for most admins; internal CEO circle for CEOs and Victor/Raul/Javi — each role only sees the groups that apply). For <strong>staff and leads only</strong>, use <strong>Internal chat</strong> in Team.')
        : 'Message any <strong>staff</strong> or <strong>session lead</strong> (swimming, climbing, fitness, support). Search by name. For admins or CEOs, use <strong>CEO\'s Chat</strong>.';
      openModal(
        '<div class="modal-h"><h2 id="modalTitle">'+esc(title)+'</h2></div>'+
        '<div class="modal-b" style="min-width:0">'+
        '<style>'+
        '#admDmListHost .portal-dm-thread-item{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;width:100%;min-width:0;padding:12px 44px 12px 14px;border-radius:14px;border:1px solid rgba(0,0,0,.1);background:var(--surface,#fff);cursor:pointer;font:inherit;margin:0 0 8px;box-sizing:border-box;position:relative}'+
        '#admDmListHost .portal-dm-thread-item--unread{border-color:rgba(45,132,179,.35);background:linear-gradient(180deg,#f4fbff,#fff)}'+
        '#admDmListHost .portal-dm-thread-item:active{opacity:.92}'+
        '#admDmListHost .portal-dm-thread-item__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;width:100%;min-width:0}'+
        '#admDmListHost .portal-dm-thread-peer{font-weight:700;font-size:15px;min-width:0;overflow-wrap:break-word;flex:1}'+
        '#admDmListHost .portal-dm-thread-when{flex-shrink:0;font-size:11px;color:#145a3a;white-space:nowrap}'+
        '#admDmListHost .portal-dm-thread-role-tag{font-size:11px;font-weight:700;margin-left:6px}'+
        '#admDmListHost .portal-dm-thread-role-tag--staff{color:#145a3a}'+
        '#admDmListHost .portal-dm-thread-role-tag--lead{color:#7c3aed}'+
        '#admDmListHost .portal-dm-thread-role-tag--group{color:#0369a1}'+
        '#admDmListHost .portal-dm-thread-role-tag--team{color:#b45309}'+
        '#admDmListHost .portal-dm-thread-preview{font-size:13px;line-height:1.4;color:var(--muted,#64748b);min-width:0;width:100%;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
        '#admDmListHost .portal-dm-thread-item--unread .portal-dm-thread-preview{color:var(--ink,#173247);font-weight:600}'+
        '#admDmListHost .portal-dm-thread-preview-sender{font-weight:700}'+
        '#admDmListHost .portal-dm-thread-unread-badge{position:absolute;top:50%;right:12px;transform:translateY(-50%);min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;line-height:1}'+
        '#admDmListHost .portal-dm-thread-meta{font-size:12px;color:var(--muted,#64748b)}'+
        '#admDmMsgs{display:flex;flex-direction:column;gap:4px;align-items:stretch;min-width:0;min-height:140px;max-height:46vh;overflow:auto;padding:6px 2px;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:#e5e7eb}'+
        '#admDmMsgs .portal-dm-msg-row{display:flex;width:100%;min-width:0;padding:2px 6px;box-sizing:border-box}'+
        '#admDmMsgs .portal-dm-msg-row--mine{justify-content:flex-end}'+
        '#admDmMsgs .portal-dm-msg-row--them{justify-content:flex-start}'+
        '#admDmMsgs .portal-dm-msg{box-sizing:border-box;max-width:min(82%,320px);min-width:0;padding:8px 11px 6px;font-size:14px;line-height:1.45;overflow-wrap:break-word;word-break:break-word}'+
        '#admDmMsgs .portal-dm-msg--mine{background:#d9fdd3;color:#111b21;border-radius:18px 18px 4px 18px;box-shadow:0 1px 1px rgba(11,20,26,.08)}'+
        '#admDmMsgs .portal-dm-msg--them{background:#fff;color:#111b21;border-radius:18px 18px 18px 4px;border:0;box-shadow:0 1px 1px rgba(11,20,26,.1)}'+
        '#admDmMsgs .portal-dm-msg--mine .portal-dm-msg-time{color:rgba(17,27,33,.55);text-align:right}'+
        '#admDmMsgs .portal-dm-msg-time{font-size:11px;color:var(--muted);margin-top:4px;display:block}'+
        '#admDmMsgs .portal-dm-msg-by{font-size:11px;font-weight:600;line-height:1.2;margin:0 0 4px;min-width:0;overflow-wrap:break-word;color:#667781}'+
        '#admDmMsgs .portal-dm-msg--mine .portal-dm-msg-by,#admDmMsgs .portal-dm-msg--them .portal-dm-msg-by{color:#667781}'+
        '#admDmPeerPickWrap{position:relative;margin:6px 0 10px;min-width:0}'+
        '#admDmPeerSearch{width:100%;max-width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.14);font:inherit;font-size:14px;min-width:0}'+
        '#admDmPeerSuggest{position:absolute;left:0;right:0;top:100%;z-index:50;margin-top:4px;max-height:min(40vh,260px);overflow:auto;padding:6px;border-radius:12px;border:1px solid rgba(0,0,0,.1);background:var(--surface,#fff);box-shadow:0 12px 40px rgba(15,23,42,.15)}'+
        '.adm-dm-peer-suggest__btn{display:block;width:100%;text-align:left;padding:10px 12px;margin:0;border:none;border-radius:8px;background:transparent;font:inherit;font-size:13px;cursor:pointer;color:var(--ink,#173247)}'+
        '.adm-dm-peer-suggest__btn:hover{background:rgba(45,132,179,.1)}'+
        '#admDmComposeActions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}'+
        '#admDmComposeActions .btn{flex:1 1 auto;min-width:min(100%,140px)}'+
        '</style>'+
        '<div id="admDmListPanel">'+
        (listBlurb ? '<p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.45;min-width:0;overflow-wrap:break-word">'+listBlurb+'</p>' : '')+
        '<div id="admDmCeoQuickWrap" hidden style="margin:0 0 12px;min-width:0">'+
        '<p class="muted" style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Quick open</p>'+
        '<div class="filter-row" style="flex-wrap:wrap;gap:8px;min-width:0">'+
        '<button type="button" class="btn btn--sec btn--sm" id="admDmQOpsAdmin">Operations admin</button>'+
        '<button type="button" class="btn btn--pri btn--sm" id="admDmQCeoGroup">CEO group</button>'+
        '</div>'+
        '<div id="admDmQCeosHost" class="filter-row" style="flex-wrap:wrap;gap:8px;margin-top:8px;min-width:0"></div>'+
        '</div>'+
        '<div id="admDmStaffLeadsQuickWrap" hidden class="portal-dm-staff-leads-quick" style="margin:0 0 14px;min-width:0;padding:14px 12px 12px;border-radius:14px;background:#f8fafc;border:1px solid rgba(45,132,179,.12)">'+
        '<p class="muted" style="margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Leads channel</p>'+
        '<div class="filter-row" style="flex-wrap:wrap;gap:10px;min-width:0">'+
        '<button type="button" class="btn btn--sec btn--sm" id="admDmQLeadsChannel">Open channel…</button>'+
        '<button type="button" class="btn btn--pri btn--sm" id="admDmQRingAllLeads">Ring all leads</button>'+
        '<button type="button" class="btn btn--sec btn--sm" id="admDmQCallSelectedLeads">Call selected…</button>'+
        '</div></div>'+
        '<div id="admDmListHost" style="min-width:0;max-height:44vh;overflow:auto"></div>'+
        '<div class="filter-row" style="margin-top:12px;flex-wrap:wrap;gap:8px">'+
        '<button type="button" class="btn btn--sec btn--sm" id="admDmBtnClose">Close</button>'+
        '<button type="button" class="btn btn--pri btn--sm" id="admDmBtnNew">New message</button>'+
        '</div></div>'+
        '<div id="admDmComposePanel" hidden>'+
        '<label class="muted">Recipient</label>'+
        '<div id="admDmPeerPickWrap">'+
        '<input type="text" id="admDmPeerSearch" autocomplete="off" autocapitalize="off" spellcheck="false" aria-autocomplete="list" aria-controls="admDmPeerSuggest" placeholder="Loading directory…" style="max-width:100%;min-width:0"/>'+
        '<input type="hidden" id="admDmPeerUser" value="" />'+
        '<div id="admDmPeerSuggest" class="adm-dm-peer-suggest" hidden role="listbox"></div>'+
        '</div>'+
        '<label class="muted">Message</label>'+
        '<textarea class="txa" id="admDmFirstBody" placeholder="Type your message…" style="max-width:100%;min-width:0;box-sizing:border-box;min-height:100px"></textarea>'+
        '<p class="muted" id="admDmComposeErr" style="margin:10px 0 0;min-height:1.2em;font-size:12px;color:var(--danger)"></p>'+
        '<div id="admDmComposeActions" class="filter-row">'+
        '<button type="button" class="btn btn--sec btn--sm" id="admDmComposeBack">Back to threads</button>'+
        '<button type="button" class="btn btn--pri btn--sm" id="admDmComposeSend">Send</button>'+
        '</div></div>'+
        '<div id="admDmThreadPanel" hidden>'+
        '<button type="button" class="btn btn--sec btn--sm" id="admDmThreadBack" style="margin-bottom:8px">Back to threads</button>'+
        '<p id="admDmThreadPeer" class="muted" style="margin:0 0 8px;font-size:14px;font-weight:700;min-width:0;overflow-wrap:break-word"></p>'+
        '<div id="admDmMsgs"></div>'+
        '<label class="sr-only" for="admDmReplyBody">Reply</label>'+
        '<textarea class="txa" id="admDmReplyBody" placeholder="Write a message…" style="max-width:100%;min-width:0;box-sizing:border-box;min-height:88px;margin-top:10px" maxlength="8000"></textarea>'+
        '<p class="muted" id="admDmThreadErr" style="margin:8px 0 0;min-height:1.2em;font-size:12px;color:var(--danger)"></p>'+
        '<button type="button" class="btn btn--pri" id="admDmThreadSend" style="width:100%;max-width:100%;box-sizing:border-box;margin-top:8px;justify-content:center">Send</button>'+
        '</div></div>'
      );
      var bd = $('modalBackdrop');
      if(bd) bd.onclick = function(e){
        if(e.target === bd){
          window.__PORTAL_ADMIN_DM_OPEN = false;
          try{ portalAdminDmPatchGlobalChatBanner(); }catch(_cbn2){}
          closeModal();
        }
      };
      var bc = $('admDmBtnClose');
      if(bc) bc.onclick = function(){
        window.__PORTAL_ADMIN_DM_OPEN = false;
        try{ portalAdminDmPatchGlobalChatBanner(); }catch(_cbn3){}
        closeModal();
      };
      var bn = $('admDmBtnNew');
      if(bn) bn.onclick = function(){
        portalAdminDmTogglePanels('compose');
        portalResetAdminDmPeerPick();
        void portalLoadDmPeerUserSelect().then(function(){
          var s = $('admDmPeerSearch');
          if(s){
            try{ s.focus(); }catch(_f){}
          }
        });
      };
      var bb = $('admDmComposeBack');
      if(bb) bb.onclick = function(){
        portalAdminDmTogglePanels('list');
        window.__PORTAL_ADMIN_DM_UI.threadId = '';
        window.__PORTAL_ADMIN_DM_UI.groupId = '';
        void portalAdminDmRenderList();
      };
      var tb = $('admDmThreadBack');
      if(tb) tb.onclick = function(){
        window.__PORTAL_ADMIN_DM_UI.threadId = '';
        window.__PORTAL_ADMIN_DM_UI.groupId = '';
        portalAdminDmTogglePanels('list');
        void portalAdminDmRenderList();
      };
      var cs = $('admDmComposeSend');
      if(cs) cs.onclick = function(){ void portalSendInternalDmFirstMessage(); };
      var ts = $('admDmThreadSend');
      if(ts) ts.onclick = function(){ void portalAdminDmSendReply(); };
      portalAdminDmBindVoiceControls();
      void portalAdminDmRenderList();
      var wrapQ = $('admDmCeoQuickWrap');
      if(wrapQ) wrapQ.hidden = channel !== 'ceo_exec';
      var wrapSl = $('admDmStaffLeadsQuickWrap');
      if(wrapSl) wrapSl.hidden = channel !== 'staff_lead';
      if(channel === 'ceo_exec') void portalAdminDmFillCeoQuickPicks();
      if(channel === 'staff_lead') void portalAdminDmFillStaffLeadsQuickPicks();
    }


  global.portalExecutiveDmInit = function portalExecutiveDmInit(channel) {
    if (typeof portalAdminCsCliqInitChat === "function") {
      portalAdminCsCliqInitChat(channel || "staff_lead");
    }
  };
  global.portalExecutiveDmRenderList = portalAdminDmRenderList;
  global.portalExecutiveDmOpenThread = portalAdminDmOpenThread;
  global.portalAdminDmCsCliqBindControls = portalAdminCsCliqBindControls;
})(typeof window !== "undefined" ? window : globalThis);
