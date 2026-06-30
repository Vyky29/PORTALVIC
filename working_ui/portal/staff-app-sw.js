/**
 * clubSENsational Staff — cache static portal assets (JS/CSS/icons).
 * HTML stays network-first; scripts/styles cache-first for repeat visits.
 */
var STAFF_CACHE = "clubsensational-staff-static-v10";
var STAFF_PRECACHE = [
  "/portal/app-icon/icon-192.png",
  "/portal/staff-dashboard.css",
  "/portal/staff-app-chunks.js",
  "/portal/staff-app-boot.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(STAFF_CACHE)
      .then(function (cache) {
        return Promise.all(
          STAFF_PRECACHE.map(function (u) {
            return cache.add(u).catch(function () {});
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k.indexOf("clubsensational-staff-static-") === 0 && k !== STAFF_CACHE) {
            return caches.delete(k);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function staffCacheable(url) {
  try {
    var p = new URL(url).pathname;
    if (p.indexOf("/portal/") === 0 && /\.(js|css|png|jpg|webp|svg|woff2?)$/i.test(p)) return true;
    if (p === "/portal-static-bootstrap.js" || p === "/staff-app-config.js") return true;
  } catch (_) {}
  return false;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  if (!staffCacheable(req.url)) return;
  event.respondWith(
    caches.open(STAFF_CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req)
          .then(function (res) {
            if (res && res.ok) {
              try {
                cache.put(req, res.clone());
              } catch (_) {}
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
