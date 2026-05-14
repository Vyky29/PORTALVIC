/* clubSENsational portal — minimal service worker for installability + Web Push.
 * Register from staff/lead dashboard after login. Push payload: JSON { title, body, url?, portalOpen? }
 * Server send: Supabase Edge Function or worker with VAPID + subscriptions table (not in this file).
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

self.addEventListener('push', function (event) {
  var title = 'clubSENsational';
  var body = 'Schedule update';
  var url = '/';
  var portalOpen = 'alerts';
  try {
    if (event.data) {
      var j = event.data.json();
      if (j && j.title) title = String(j.title);
      if (j && j.body) body = String(j.body);
      if (j && j.url) url = String(j.url);
      if (j && j.portalOpen) portalOpen = String(j.portalOpen);
    }
  } catch (e) {
    try {
      var t = event.data && event.data.text();
      if (t) body = t.slice(0, 200);
    } catch (e2) {}
  }
  var icon = 'ELEMENTOR/MEDIOS/portal_crest.svg';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      badge: icon,
      tag: 'clubsensational-roster',
      renotify: true,
      data: { url: url, portalOpen: portalOpen },
    })
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
            list[i].postMessage({ type: 'portal-notification-click', portalOpen: openAlerts ? 'alerts' : '' });
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
