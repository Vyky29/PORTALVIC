/* clubSENsational portal — minimal service worker for installability + Web Push.
 * Register from staff/lead/admin dashboard after login. Push payload: JSON { title, body, url?, portalOpen?, tag?, requireInteraction?, vibrate?, call? }
 * v20260621-incoming-call
 */
self.addEventListener('install', function (event) {
  self.skipWaiting();
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
    return new URL('portal/app-icon/apple-touch-icon.png', self.registration.scope).href;
  } catch (e) {
    return 'portal/app-icon/apple-touch-icon.png';
  }
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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && 'focus' in list[i]) {
          try {
            list[i].postMessage({
              type: 'portal-notification-click',
              portalOpen: openAlerts ? 'alerts' : (openCall ? 'incoming_call' : ''),
              call: data.call || null,
            });
          } catch (e) {}
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) {
        var target = u;
        if (openAlerts) {
          target = portalAppendQueryParam(u, 'portalOpen', 'alerts');
        }
        return self.clients.openWindow(target);
      }
    })
  );
});
