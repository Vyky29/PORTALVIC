/* clubSENsational portal — minimal service worker for installability + Web Push.
 * Register from staff/lead/admin dashboard after login. Push payload: JSON { title, body, url?, portalOpen?, tag?, requireInteraction?, vibrate?, call? }
 * v20260612-bg-push-fix
 * v20260608-incoming-call-dismiss
 * v20260609-sw-syntax-fix (restore after chat cleanup script broke ternary)
 * v20260711-always-os-banner (foreground skip broke alerts after chat UI removal)
 */
var PORTAL_PUSH_ICON_PATH = '/portal/app-icon/icon-192.png?v=20260624-push-icon';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open('portal-push-icons-v1')
      .then(function (cache) {
        return cache.add(PORTAL_PUSH_ICON_PATH).catch(function () {});
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

var PORTAL_ALERT_VIBRATE = [200, 80, 200, 80, 280, 100, 200];
var PORTAL_CALL_VIBRATE = [500, 180, 500, 180, 700, 180, 500];

function portalAppendQueryParam(absUrl, key, value) {
  try {
    var u = new URL(absUrl, self.registration.scope);
    u.searchParams.set(key, value);
    return u.href;
  } catch (e) {
    var s = String(absUrl || '');
    var sep = s.indexOf('?') >= 0 ? '&' : '?';
    return s + sep + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }
}

function portalPushIconUrl() {
  try {
    var origin =
      self.location && self.location.origin
        ? String(self.location.origin)
        : '';
    if (!origin && self.registration && self.registration.scope) {
      origin = new URL('.', self.registration.scope).origin;
    }
    if (origin) return origin + PORTAL_PUSH_ICON_PATH;
  } catch (e) {}
  return PORTAL_PUSH_ICON_PATH;
}

function portalNotifyOpenClients(title, body, portalOpen, callData, chatData, meta) {
  meta = meta || {};
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    clientList.forEach(function (client) {
      try {
        client.postMessage({
          type: 'portal-push-received',
          title: title,
          body: body,
          portalOpen: portalOpen,
          call: callData || null,
          chat: chatData || null,
          senderUserId: meta.senderUserId || '',
          targetUserId: meta.targetUserId || '',
        });
        if (portalOpen === 'incoming_call' && typeof client.focus === 'function') {
          try {
            client.focus();
          } catch (eFocus) {}
        }
      } catch (e) {}
    });
  });
}

function portalHasVisiblePortalClient() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    if (!clientList || !clientList.length) return false;
    for (var i = 0; i < clientList.length; i++) {
      var client = clientList[i];
      if (client && client.visibilityState === 'visible') return true;
    }
    return false;
  });
}

self.addEventListener('message', function (event) {
  var d = event.data;
  if (!d || !d.type) return;
  if (d.type === 'portal-show-local-test') {
    var title = String(d.title || 'Test: portal notification');
    var body = String(d.body || 'If you see this banner, notifications are working on this device.');
    var icon = portalPushIconUrl();
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: icon,
        badge: icon,
        tag: 'portal-local-test-' + Date.now(),
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: PORTAL_ALERT_VIBRATE,
        data: { url: self.registration.scope || '/', portalOpen: 'alerts' },
      })
    );
    return;
  }
  if (d.type !== 'portal-incoming-call-dismiss') return;
  var tags = Array.isArray(d.tags) ? d.tags : [];
  event.waitUntil(
    self.registration.getNotifications().then(function (list) {
      (list || []).forEach(function (n) {
        var tag = String((n && n.tag) || '');
        if (tags.indexOf(tag) >= 0 || tag.indexOf('portal-incoming-call') === 0) {
          try {
            n.close();
          } catch (e) {}
        }
      });
    })
  );
});

self.addEventListener('push', function (event) {
  var title = 'clubSENsational';
  var body = 'Schedule update';
  var url = '/';
  var portalOpen = 'alerts';
  var tag = 'portal-' + Date.now();
  var requireInteraction = false;
  var vibrate = undefined;
  var callData = null;
  var chatData = null;
  var senderUserId = '';
  var targetUserId = '';
  try {
    if (event.data) {
      var j = event.data.json();
      if (j && j.title) title = String(j.title);
      if (j && j.body) body = String(j.body);
      if (j && j.url) url = String(j.url);
      if (j && j.portalOpen) portalOpen = String(j.portalOpen);
      if (j && j.tag) tag = String(j.tag);
      if (j && j.requireInteraction) requireInteraction = true;
      if (j && j.vibrate && j.vibrate.length) vibrate = j.vibrate;
      if (j && j.call) callData = j.call;
      if (j && j.chat) chatData = j.chat;
      if (j && j.senderUserId) senderUserId = String(j.senderUserId);
      if (j && j.targetUserId) targetUserId = String(j.targetUserId);
    }
  } catch (e) {
    try {
      var t = event.data && event.data.text();
      if (t) body = t.slice(0, 200);
    } catch (e2) {}
  }
  if (
    portalOpen === 'alerts' ||
    portalOpen === 'chat' ||
    portalOpen === 'portal_staff_whatsapp' ||
    portalOpen === 'staff_whatsapp' ||
    portalOpen === 'incoming_call'
  ) {
    requireInteraction = true;
    if (!vibrate) {
      vibrate = portalOpen === 'incoming_call' ? PORTAL_CALL_VIBRATE : PORTAL_ALERT_VIBRATE;
    }
  }
  var icon = portalPushIconUrl();
  var notifyOpts = {
    body: body,
    icon: icon,
    badge: icon,
    tag: tag,
    renotify: true,
    requireInteraction: requireInteraction,
    silent: false,
    data: { url: url, portalOpen: portalOpen, call: callData, chat: chatData },
  };
  if (vibrate) notifyOpts.vibrate = vibrate;
  event.waitUntil(
    Promise.all([
      /* Always show the OS banner (app open, background, or sleeping). Skipping
         when a portal tab was visible broke alerts after the in-app handlers
         were removed with the old chat UI. */
      self.registration.showNotification(title, notifyOpts),
      portalNotifyOpenClients(title, body, portalOpen, callData, chatData, {
        senderUserId: senderUserId,
        targetUserId: targetUserId,
      }),
    ])
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var u = data.url || self.registration.scope || '/';
  var portalOpen = String(data.portalOpen || '');
  var openAlerts = portalOpen === 'alerts';
  var openCall = portalOpen === 'incoming_call';
  var openChat = portalOpen === 'chat';
  var callData = data.call || null;
  var chatData = data.chat || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && 'focus' in list[i]) {
          try {
            list[i].postMessage({
              type: 'portal-notification-click',
              portalOpen: openAlerts ? 'alerts' : (openCall ? 'incoming_call' : (openChat ? 'chat' : '')),
              call: callData,
              chat: chatData,
              url: u,
            });
          } catch (e) {}
          if (openCall && u && typeof list[i].navigate === 'function') {
            try {
              return list[i].navigate(u);
            } catch (eNav) {}
          }
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(u);
      }
    })
  );
});
