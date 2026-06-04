/**
 * Applies PortalTeflonGuideDemoData only when the active staff account is Teflon.
 */
(function () {
  function pinnedGuideIso() {
    var data = window.PortalTeflonGuideDemoData;
    if (!data) return data ? data.defaultIso : "2026-06-04";
    try {
      var p = new URLSearchParams(String(window.location.search || ""));
      var iso = String(p.get("portalGuideIso") || "").trim().slice(0, 10);
      if (data.isShowcaseIso(iso)) return iso;
    } catch (_) {}
    return data.defaultIso;
  }

  function buildBoot() {
    var data = window.PortalTeflonGuideDemoData;
    var Adapter = window.StaffDashboardSpreadsheetAdapter;
    if (!data || !Adapter || typeof Adapter.bootstrap !== "function") return null;
    return Adapter.bootstrap({
      source: {
        staffProfiles: { teflon: data.profile },
        rows: data.rows,
        clientsInfo: data.clientsInfo,
      },
      staffId: "teflon",
    });
  }

  window.PortalTeflonGuideDemo = {
    pinnedIso: pinnedGuideIso,
    buildBoot: buildBoot,
    applyToDashboard: function () {
      var boot = buildBoot();
      if (!boot) return false;
      return boot;
    },
    seedReviewState: function (sessionReviewMapMemory, persistFn) {
      var data = window.PortalTeflonGuideDemoData;
      if (!data || !sessionReviewMapMemory) return false;
      var changed = false;
      try {
        window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__ =
          window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__ || new Set();
        data.showcaseIsos.forEach(function (iso) {
          var specs = data.reviewByIso[iso] || [];
          specs.forEach(function (sp) {
            var sk = iso + "|" + sp.start + "|" + sp.cid;
            if (sp.scheduled) {
              window.__PORTAL_TEFLON_GUIDE_SCHEDULED_KEYS__.add(sk);
              if (sessionReviewMapMemory[sk]) {
                delete sessionReviewMapMemory[sk];
                changed = true;
              }
              return;
            }
            var prev = sessionReviewMapMemory[sk] || {
              feedbackDone: false,
              incident: false,
              absent: false,
              cancelled: false,
            };
            var next = {
              feedbackDone: !!sp.feedbackDone,
              incident: !!sp.incident,
              absent: !!sp.absent,
              cancelled: false,
            };
            if (
              prev.feedbackDone !== next.feedbackDone ||
              prev.incident !== next.incident ||
              prev.absent !== next.absent
            ) {
              sessionReviewMapMemory[sk] = next;
              changed = true;
            }
          });
        });
        if (changed && typeof persistFn === "function") persistFn();
      } catch (_) {}
      return true;
    },
  };
})();
