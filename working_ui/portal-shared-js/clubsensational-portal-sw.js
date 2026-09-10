/* clubSENsational portal — minimal service worker for installability + Web Push.
 * Register from staff/lead/admin dashboard after login. Push payload: JSON { title, body, url?, portalOpen?, tag?, requireInteraction?, vibrate?, call? }
 * v20260612-bg-push-fix
 * v20260608-incoming-call-dismiss
 * v20260609-sw-syntax-fix (restore after chat cleanup script broke ternary)
 * v20260712-cs-portal-wa (Leader WhatsApp deep-link + CS Portal branding)
 * v20260711-always-os-banner (foreground skip broke alerts after chat UI removal)
 * v20260904-comms-push (Communications message + incoming-call banners)
 * v20260905-comms-36 (Home screen PWA numeric badge via Badging API)
 * v20260906-notif-open-fix (never navigate PWA to bare / — blank screen on iOS)
 * v20260906-comms-inapp-49 (always OS banner for incoming calls)
 * v20260910-staff-static (cache JS/CSS so the installed staff PWA is fast on iPhone)
 */
var PORTAL_PUSH_ICON_PATH = '/portal/app-icon/icon-192.png?v=20260624-push-icon';
var PORTAL_DEFAULT_DASHBOARD = 'staff_dashboard.html';

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

var PORTAL_STATIC_CACHE = 'clubsensational-static-v17';

function portalStaticCacheable(url) {
  try {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    var p = u.pathname;
    if (p.indexOf('/portal/') === 0 && /\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/i.test(p)) return true;
    if (p === '/portal-static-bootstrap.js' || p === '/staff-app-config.js') return true;
  } catch (e) {}
  return false;
}

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          (keys || []).map(function (k) {
            if (k === PORTAL_STATIC_CACHE) return null;
            if (
              String(k).indexOf('clubsensational-static-') === 0 ||
              String(k).indexOf('clubsensational-staff-static-') === 0
            ) {
              return caches.delete(k);
            }
            return null;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (!req || req.method !== 'GET') return;
  if (!portalStaticCacheable(req.url)) return;
  event.respondWith(
    caches.open(PORTAL_STATIC_CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req)
          .then(function (res) {
            if (res && res.ok) {
              try {
                cache.put(req, res.clone());
              } catch (ePut) {}
            }
            return res;
          })
          .catch(function () {
            return cached;
          });
        return cached || network;
      });
    })
  );
});

var PORTAL_ALERT_VIBRATE = [200, 80, 200, 80, 280, 100, 200];
var PORTAL_CALL_VIBRATE = [500, 180, 500, 180, 700, 180, 500];
/** Auth user id stamped by the page after login — used to drop pushes meant for someone else. */
var portalPushUserId = '';
/** iOS often returns no clients during `push`. Page heartbeat covers that. */
var portalForegroundUntil = 0;
var portalForegroundSince = 0;
var PORTAL_FG_CACHE = 'portal-fg-v1';
var PORTAL_FG_TTL_MS = 3500;
var PORTAL_FG_MIN_VISIBLE_MS = 2500;
var PORTAL_BADGE_CACHE = 'portal-app-badge-v1';
var portalStoredAppBadge = 0;

function portalPersistBadgeCount(n) {
  portalStoredAppBadge = Math.max(0, Number(n) || 0);
  return caches
    .open(PORTAL_BADGE_CACHE)
    .then(function (c) {
      return c.put('count', new Response(String(portalStoredAppBadge)));
    })
    .catch(function () {});
}

function portalReadPersistedBadgeCount() {
  return caches
    .open(PORTAL_BADGE_CACHE)
    .then(function (c) {
      return c.match('count').then(function (r) {
        if (!r) return portalStoredAppBadge;
        return r.text().then(function (t) {
          var parsed = parseInt(t, 10);
          if (parsed > 0) portalStoredAppBadge = parsed;
          return portalStoredAppBadge;
        });
      });
    })
    .catch(function () {
      return portalStoredAppBadge;
    });
}

function portalPaintAppBadge(n) {
  var count = Math.max(0, Number(n) || 0);
  var persist = portalPersistBadgeCount(count);
  if (!self.navigator || typeof self.navigator.setAppBadge !== 'function') return persist;
  var paint =
    count < 1 && typeof self.navigator.clearAppBadge === 'function'
      ? self.navigator.clearAppBadge()
      : self.navigator.setAppBadge(count);
  return Promise.all([persist, Promise.resolve(paint)]).catch(function () {});
}

function portalBumpAppBadge() {
  return portalReadPersistedBadgeCount().then(function (n) {
    return portalPaintAppBadge(n + 1);
  });
}

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

/** True when the open client is already a portal app page (do not navigate away). */
function portalClientIsPortalApp(client) {
  try {
    var href = String((client && client.url) || '');
    return /staff_dashboard|admin_dashboard|ceo_dashboard|office_portal|comunicaciones|parent_portal|cs_cliq|login\.html/i.test(
      href
    );
  } catch (e) {
    return false;
  }
}

/**
 * Resolve a safe open URL for notification clicks / cold starts.
 * Bare `/`, scope-only, or empty URLs blank the iOS/Android PWA (navigate to site root).
 */
function portalSafeOpenUrl(raw, portalOpen) {
  var scope = (self.registration && self.registration.scope) || '/';
  var fallback;
  try {
    fallback = new URL(PORTAL_DEFAULT_DASHBOARD, scope).href;
  } catch (e0) {
    fallback = '/' + PORTAL_DEFAULT_DASHBOARD;
  }
  var open = String(portalOpen || '').trim();
  try {
    var rawStr = String(raw || '').trim();
    if (!rawStr || rawStr === '/' || rawStr === scope) {
      return open ? portalAppendQueryParam(fallback, 'portalOpen', open) : fallback;
    }
    var abs = new URL(rawStr, scope);
    var path = String(abs.pathname || '/');
    if (path === '/' || path === '') {
      abs.pathname = '/' + PORTAL_DEFAULT_DASHBOARD;
    }
    if (open && !abs.searchParams.get('portalOpen')) {
      abs.searchParams.set('portalOpen', open);
    }
    return abs.href;
  } catch (e) {
    return open ? portalAppendQueryParam(fallback, 'portalOpen', open) : fallback;
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
        if ((portalOpen === 'incoming_call' || portalOpen === 'communications_call') && typeof client.focus === 'function') {
          try {
            client.focus();
          } catch (eFocus) {}
        }
      } catch (e) {}
    });
  });
}

function portalWriteForegroundState(until, since) {
  portalForegroundUntil = Math.max(0, Number(until) || 0);
  portalForegroundSince = Math.max(0, Number(since) || 0);
  return caches
    .open(PORTAL_FG_CACHE)
    .then(function (c) {
      return Promise.all([
        c.put('until', new Response(String(portalForegroundUntil))),
        c.put('since', new Response(String(portalForegroundSince))),
      ]);
    })
    .catch(function () {});
}

function portalParseCacheNumber(r, fallback) {
  if (!r) return Promise.resolve(fallback);
  return r.text().then(function (t) {
    var n = parseInt(t, 10);
    return Number.isFinite(n) ? n : fallback;
  });
}

function portalReadForegroundState() {
  return caches
    .open(PORTAL_FG_CACHE)
    .then(function (c) {
      return Promise.all([c.match('until'), c.match('since')]).then(function (pair) {
        return Promise.all([
          portalParseCacheNumber(pair[0], portalForegroundUntil),
          portalParseCacheNumber(pair[1], portalForegroundSince),
        ]).then(function (vals) {
          portalForegroundUntil = vals[0];
          portalForegroundSince = vals[1];
          return { until: portalForegroundUntil, since: portalForegroundSince };
        });
      });
    })
    .catch(function () {
      return { until: portalForegroundUntil, since: portalForegroundSince };
    });
}

function portalTreatAsForeground() {
  return portalReadForegroundState().then(function (st) {
    var now = Date.now();
    if (!st.until || now >= st.until) return false;
    if (!st.since || now - st.since < PORTAL_FG_MIN_VISIBLE_MS) return false;
    return true;
  });
}

function portalWritePendingInapp(payload) {
  return caches
    .open('portal-comms-inapp-v1')
    .then(function (c) {
      return c.put(
        'pending',
        new Response(JSON.stringify(payload || {}), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    })
    .catch(function () {});
}

function portalCloseCommsOsBanners() {
  return self.registration.getNotifications().then(function (list) {
    (list || []).forEach(function (n) {
      var open = String((n && n.data && n.data.portalOpen) || '');
      var tag = String((n && n.tag) || '');
      if (open === 'communications_call' || open === 'incoming_call') return;
      if (
        open === 'communications' ||
        open === 'family_messages' ||
        (tag.indexOf('comms') === 0 && tag.indexOf('comms-call') !== 0)
      ) {
        try {
          n.close();
        } catch (e) {}
      }
    });
  });
}

self.addEventListener('message', function (event) {
  var d = event.data;
  if (!d || !d.type) return;
  if (d.type === 'portal-push-set-user') {
    portalPushUserId = String(d.userId || '').trim();
    return;
  }
  if (d.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (d.type === 'portal-client-visibility') {
    if (d.visible) {
      var since = Math.max(0, Number(d.since) || Date.now());
      event.waitUntil(portalWriteForegroundState(Date.now() + PORTAL_FG_TTL_MS, since));
    } else {
      event.waitUntil(portalWriteForegroundState(0, 0));
    }
    return;
  }
  if (d.type === 'portal-close-comms-notifications') {
    event.waitUntil(
      self.registration.getNotifications().then(function (list) {
        (list || []).forEach(function (n) {
          var open = String((n && n.data && n.data.portalOpen) || '');
          var tag = String((n && n.tag) || '');
          if (open === 'communications' || tag.indexOf('comms') === 0) {
            try {
              n.close();
            } catch (e) {}
          }
        });
      })
    );
    return;
  }
  if (d.type === 'portal-set-app-badge') {
    event.waitUntil(portalPaintAppBadge(d.count));
    return;
  }
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
        data: {
          url: portalSafeOpenUrl('', 'alerts'),
          portalOpen: 'alerts',
        },
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
  var url = portalSafeOpenUrl('', 'alerts');
  var portalOpen = 'alerts';
  var tag = 'portal-' + Date.now();
  var requireInteraction = false;
  var vibrate = undefined;
  var callData = null;
  var chatData = null;
  var senderUserId = '';
  var targetUserId = '';
  var appBadgeCount = null;
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
  /* Same browser/PWA can hold one push endpoint registered under several logins.
     Never show an alert for another user, or for a message this user just sent. */
  if (portalPushUserId) {
    if (senderUserId && senderUserId === portalPushUserId) {
      return;
    }
    if (targetUserId && targetUserId !== portalPushUserId) {
      return;
    }
  }
  if (
    portalOpen === 'alerts' ||
    portalOpen === 'chat' ||
    portalOpen === 'portal_staff_whatsapp' ||
    portalOpen === 'staff_whatsapp' ||
    portalOpen === 'incoming_call' ||
    portalOpen === 'communications' ||
    portalOpen === 'communications_call' ||
    portalOpen === 'family_messages'
  ) {
    requireInteraction = true;
    if (!vibrate) {
      vibrate =
        portalOpen === 'incoming_call' || portalOpen === 'communications_call'
          ? PORTAL_CALL_VIBRATE
          : PORTAL_ALERT_VIBRATE;
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
  var isCallPush = portalOpen === 'communications_call' || portalOpen === 'incoming_call';
  var isCommsMessagePush = portalOpen === 'communications';
  var isFamilyPush = portalOpen === 'family_messages';
  event.waitUntil(
    portalTreatAsForeground().then(function (hasVisibleClient) {
      var pending = {
        at: Date.now(),
        title: title,
        body: body,
        portalOpen: portalOpen,
        senderUserId: senderUserId,
        conversationId:
          (chatData && (chatData.conversationId || chatData.conversation_id)) ||
          (callData && (callData.conversationId || callData.conversation_id)) ||
          '',
        callId: (callData && (callData.callId || callData.id)) || '',
        callType: (callData && callData.type) || '',
      };
      var tasks = [
        portalNotifyOpenClients(title, body, portalOpen, callData, chatData, {
          senderUserId: senderUserId,
          targetUserId: targetUserId,
        }),
      ];
      /* Calls always use the iOS logo toaster. A locked phone cannot show
         the in-app overlay; skipping showNotification drops the ring. */
      if (isCallPush) {
        tasks.unshift(self.registration.showNotification(title, notifyOpts));
        tasks.push(portalWritePendingInapp(pending));
      } else if ((isCommsMessagePush || isFamilyPush) && hasVisibleClient) {
        tasks.push(portalCloseCommsOsBanners());
        tasks.push(portalWritePendingInapp(pending));
      } else {
        tasks.unshift(self.registration.showNotification(title, notifyOpts));
      }
      if (!hasVisibleClient || isCallPush) {
        tasks.push(
          appBadgeCount != null ? portalPaintAppBadge(appBadgeCount) : portalBumpAppBadge()
        );
      }
      return Promise.all(tasks);
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var portalOpen = String(data.portalOpen || '');
  var callData = data.call || null;
  var chatData = data.chat || null;
  var u = portalSafeOpenUrl(data.url, portalOpen);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && 'focus' in list[i]) {
          try {
            list[i].postMessage({
              type: 'portal-notification-click',
              portalOpen: portalOpen,
              call: callData,
              chat: chatData,
              url: u,
            });
          } catch (e) {}
          /* Already on a portal page: focus only. clients.navigate('/') blanks iOS PWAs. */
          if (portalClientIsPortalApp(list[i])) {
            return list[i].focus();
          }
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
