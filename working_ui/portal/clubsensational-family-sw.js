/* clubSENsational Family — service worker for installability + Web Push.
 * Register from parent_portal after sign-in. Push payload: JSON { title, body, url?, portalOpen?, tag?, appBadge? }
 * v20260905-family-push-36
 */
var FAMILY_PUSH_ICON_PATH = '/portal/app-icon/icon-192.png?v=20260624-push-icon';
var FAMILY_ALERT_VIBRATE = [200, 80, 200, 80, 280, 100, 200];
var familyStoredAppBadge = 0;

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

function familyPersistBadgeCount(n) {
  familyStoredAppBadge = Math.max(0, Number(n) || 0);
  return caches.open('family-app-badge-v1').then(function (c) {
    return c.put('count', new Response(String(familyStoredAppBadge)));
  }).catch(function () {});
}

function familyReadPersistedBadgeCount() {
  return caches.open('family-app-badge-v1')
    .then(function (c) {
      return c.match('count').then(function (r) {
        if (!r) return familyStoredAppBadge;
        return r.text().then(function (t) {
          var parsed = parseInt(t, 10);
          if (parsed > 0) familyStoredAppBadge = parsed;
          return familyStoredAppBadge;
        });
      });
    })
    .catch(function () {
      return familyStoredAppBadge;
    });
}

function familyPaintAppBadge(n) {
  var count = Math.max(0, Number(n) || 0);
  var persist = familyPersistBadgeCount(count);
  if (!self.navigator || typeof self.navigator.setAppBadge !== 'function') return persist;
  var paint =
    count < 1 && typeof self.navigator.clearAppBadge === 'function'
      ? self.navigator.clearAppBadge()
      : self.navigator.setAppBadge(count);
  return Promise.all([persist, Promise.resolve(paint)]).catch(function () {});
}

function familyBumpAppBadge() {
  return familyReadPersistedBadgeCount().then(function (n) {
    return familyPaintAppBadge(n + 1);
  });
}

function familyHasVisibleClient() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    if (!clientList || !clientList.length) return false;
    for (var i = 0; i < clientList.length; i++) {
      var client = clientList[i];
      if (client && client.visibilityState === 'visible') return true;
    }
    return false;
  });
}

function familyNotifyOpenClients(title, body, portalOpen, url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    clientList.forEach(function (client) {
      try {
        client.postMessage({
          type: 'family-push-received',
          title: title,
          body: body,
          portalOpen: portalOpen,
          url: url,
        });
      } catch (e) {}
    });
  });
}

self.addEventListener('message', function (event) {
  var d = event.data;
  if (!d || !d.type) return;
  if (d.type === 'family-set-app-badge') {
    event.waitUntil(familyPaintAppBadge(d.count));
  }
});

self.addEventListener('push', function (event) {
  var title = 'clubSENsational Family';
  var body = 'Club update';
  var url = familyDefaultOpenUrl();
  var portalOpen = 'messages';
  var tag = 'family-' + Date.now();
  var requireInteraction = true;
  var vibrate = FAMILY_ALERT_VIBRATE;
  var appBadgeCount = null;
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
      if (j && j.appBadge != null && isFinite(Number(j.appBadge))) {
        appBadgeCount = Math.max(0, Number(j.appBadge));
      }
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
  event.waitUntil(
    familyHasVisibleClient().then(function (hasVisibleClient) {
      var tasks = [familyNotifyOpenClients(title, body, portalOpen, url)];
      /* Aviso interno covers the open Family PWA. Aviso del sistema
         (logo + vibrate) only when locked, another app, or the PWA is in the background. */
      if (!hasVisibleClient) {
        tasks.unshift(self.registration.showNotification(title, notifyOpts));
        tasks.push(
          appBadgeCount != null ? familyPaintAppBadge(appBadgeCount) : familyBumpAppBadge()
        );
      }
      return Promise.all(tasks);
    })
  );
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
