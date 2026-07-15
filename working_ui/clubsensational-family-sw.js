/* clubSENsational Family — service worker for installability + Web Push.
 * Register from parent_portal after sign-in. Push payload: JSON { title, body, url?, portalOpen?, tag? }
 * v20260715-family-push
 */
var FAMILY_PUSH_ICON_PATH = '/portal/app-icon/icon-192.png?v=20260624-push-icon';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open('family-push-icons-v1')
      .then(function (cache) {
        return cache.add(FAMILY_PUSH_ICON_PATH).catch(function () {});
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

var FAMILY_ALERT_VIBRATE = [200, 80, 200, 80, 280, 100, 200];

function familyPushIconUrl() {
  try {
    var origin =
      self.location && self.location.origin
        ? String(self.location.origin)
        : '';
    if (!origin && self.registration && self.registration.scope) {
      origin = new URL('.', self.registration.scope).origin;
    }
    if (origin) return origin + FAMILY_PUSH_ICON_PATH;
  } catch (e) {}
  return FAMILY_PUSH_ICON_PATH;
}

function familyDefaultOpenUrl() {
  try {
    var origin =
      self.location && self.location.origin
        ? String(self.location.origin)
        : '';
    if (origin) return origin + '/parent?view=messages';
  } catch (e) {}
  return '/parent?view=messages';
}

self.addEventListener('push', function (event) {
  var title = 'clubSENsational Family';
  var body = 'Club update';
  var url = familyDefaultOpenUrl();
  var portalOpen = 'messages';
  var tag = 'family-' + Date.now();
  var requireInteraction = true;
  var vibrate = FAMILY_ALERT_VIBRATE;
  try {
    if (event.data) {
      var j = event.data.json();
      if (j && j.title) title = String(j.title);
      if (j && j.body) body = String(j.body);
      if (j && j.url) url = String(j.url);
      if (j && j.portalOpen) portalOpen = String(j.portalOpen);
      if (j && j.tag) tag = String(j.tag);
      if (j && j.requireInteraction === false) requireInteraction = false;
      if (j && j.vibrate && j.vibrate.length) vibrate = j.vibrate;
    }
  } catch (e) {
    try {
      var t = event.data && event.data.text();
      if (t) body = t.slice(0, 200);
    } catch (e2) {}
  }
  var icon = familyPushIconUrl();
  var notifyOpts = {
    body: body,
    icon: icon,
    badge: icon,
    tag: tag,
    renotify: true,
    requireInteraction: requireInteraction,
    silent: false,
    vibrate: vibrate,
    data: { url: url, portalOpen: portalOpen },
  };
  event.waitUntil(self.registration.showNotification(title, notifyOpts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var u = data.url || familyDefaultOpenUrl();
  var portalOpen = String(data.portalOpen || 'messages');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && 'focus' in list[i]) {
          try {
            list[i].postMessage({
              type: 'family-notification-click',
              portalOpen: portalOpen,
              url: u,
            });
          } catch (e) {}
          if (u && typeof list[i].navigate === 'function') {
            try {
              return list[i].navigate(u).then(function () {
                return list[i].focus();
              });
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
