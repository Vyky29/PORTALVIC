/* clubSENsational portal — minimal service worker for installability + Web Push.
 * Register from staff/lead/admin dashboard after login. Push payload: JSON { title, body, url?, portalOpen?, tag?, requireInteraction? }
 */
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

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

function portalNotifyOpenClients(title, body, portalOpen) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    clientList.forEach(function (client) {
      try {
        client.postMessage({
          type: 'portal-push-received',
          title: title,
          body: body,
          portalOpen: portalOpen,
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
  try {
    if (event.data) {
      var j = event.data.json();
      if (j && j.title) title = String(j.title);
      if (j && j.body) body = String(j.body);
      if (j && j.url) url = String(j.url);
      if (j && j.portalOpen) portalOpen = String(j.portalOpen);
      if (j && j.tag) tag = String(j.tag);
      if (j && j.requireInteraction) requireInteraction = true;
    }
  } catch (e) {
    try {
      var t = event.data && event.data.text();
      if (t) body = t.slice(0, 200);
    } catch (e2) {}
  }
  if (portalOpen === 'alerts') {
    requireInteraction = true;
  }
  var icon = portalPushIconUrl();
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: body,
        icon: icon,
        badge: icon,
        tag: tag,
        renotify: true,
        requireInteraction: requireInteraction,
        data: { url: url, portalOpen: portalOpen },
      }),
      portalNotifyOpenClients(title, body, portalOpen),
    ])
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var u = data.url || self.registration.scope || '/';
  var openAlerts = String(data.portalOpen || '') === 'alerts';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && 'focus' in list[i]) {
          try {
            list[i].postMessage({
              type: 'portal-notification-click',
              portalOpen: openAlerts ? 'alerts' : '',
            });
          } catch (e) {}
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) {
        var target = openAlerts ? portalAppendQueryParam(u, 'portalOpen', 'alerts') : u;
        return self.clients.openWindow(target);
      }
    })
  );
});
