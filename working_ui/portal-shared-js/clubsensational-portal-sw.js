/* clubSENsational portal — minimal service worker for installability + Web Push.
 * Register from staff/lead/admin dashboard after login. Push payload: JSON { title, body, url?, portalOpen?, tag?, requireInteraction?, vibrate?, call? }
 * v20260608-incoming-call-push
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

var PORTAL_ALERT_VIBRATE = [120, 55, 120, 55, 160];
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

function portalNotifyOpenClients(title, body, portalOpen, callData) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    clientList.forEach(function (client) {
      try {
        client.postMessage({
          type: 'portal-push-received',
          title: title,
          body: body,
          portalOpen: portalOpen,
          call: callData || null,
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

self.addEventListener('push', function (event) {
  var title = 'clubSENsational';
  var body = 'Schedule update';
  var url = '/';
  var portalOpen = 'alerts';
  var tag = 'portal-' + Date.now();
  var requireInteraction = false;
  var vibrate = undefined;
  var callData = null;
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
    }
  } catch (e) {
    try {
      var t = event.data && event.data.text();
      if (t) body = t.slice(0, 200);
    } catch (e2) {}
  }
  if (portalOpen === 'alerts') {
    requireInteraction = true;
    if (!vibrate) vibrate = PORTAL_ALERT_VIBRATE;
  }
  if (portalOpen === 'incoming_call') {
    requireInteraction = true;
    if (!vibrate) vibrate = PORTAL_CALL_VIBRATE;
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
    data: { url: url, portalOpen: portalOpen, call: callData },
  };
  if (vibrate) notifyOpts.vibrate = vibrate;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, notifyOpts),
      portalNotifyOpenClients(title, body, portalOpen, callData),
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
  var callData = data.call || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && 'focus' in list[i]) {
          try {
            list[i].postMessage({
              type: 'portal-notification-click',
              portalOpen: openAlerts ? 'alerts' : (openCall ? 'incoming_call' : ''),
              call: callData,
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
