/**
 * Participants sheet: My roster only; optional "New participants" from schedule overrides (make-up / replace).
 */
(function (global) {
  const REPLACE_TYPES = new Set(["client_replace_in_slot", "replace_participant"]);

  function normKey(v) {
    if (typeof global.portalNormKeyStr === "function") {
      return global.portalNormKeyStr(v);
    }
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normIso(v) {
    if (typeof global.normaliseIsoDate === "function") {
      return global.normaliseIsoDate(v);
    }
    return String(v || "").trim().slice(0, 10);
  }

  function pseudoIds(ctx) {
    const p = ctx && ctx.pseudoIds;
    return Array.isArray(p) ? p : ["closed", "available"];
  }

  function isPseudo(cid, ctx) {
    return !cid || pseudoIds(ctx).includes(cid);
  }

  function rowsAll(ctx) {
    if (ctx && typeof ctx.scheduleOverrideRowsAll === "function") {
      return ctx.scheduleOverrideRowsAll();
    }
    return Array.isArray(global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__)
      ? global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__
      : [];
  }

  function rowApplies(row, ctx) {
    if (ctx && typeof ctx.rowAppliesToStaff === "function") {
      return ctx.rowAppliesToStaff(row);
    }
    if (typeof global.portalScheduleOverrideRowAppliesToLoggedInStaff === "function") {
      return global.portalScheduleOverrideRowAppliesToLoggedInStaff(row);
    }
    return false;
  }

  function replacementClientId(payload, ctx) {
    if (ctx && typeof ctx.replacementClientId === "function") {
      return ctx.replacementClientId(payload);
    }
    if (typeof global.portalOverrideReplacementClientId === "function") {
      return global.portalOverrideReplacementClientId(payload);
    }
    return "";
  }

  function parsePayload(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_) {
      return null;
    }
  }

  function isMakeUpDashboardRow(item) {
    if (!item || String(item.kind || "") !== "client") return false;
    if (item.portalOverrideMakeUpTag) return true;
    const ov = item.__portalScheduleOverride;
    if (!ov) return false;
    return REPLACE_TYPES.has(String(ov.override_type || "").trim());
  }

  function buildContext() {
    return {
      staffId: String(global.STAFF_DASHBOARD_ID || "").trim().toLowerCase(),
      sessionsModel: Array.isArray(global.sessionsModel) ? global.sessionsModel : [],
      clientNotesById:
        global.clientNotesById && typeof global.clientNotesById === "object"
          ? global.clientNotesById
          : {},
      dashboardData: global.dashboardData || {},
      pseudoIds: global.CLIENT_LIST_PSEUDO_IDS,
      scheduleOverrideRowsAll:
        typeof global.portalScheduleOverrideRowsAll === "function"
          ? global.portalScheduleOverrideRowsAll
          : null,
      rowAppliesToStaff:
        typeof global.portalScheduleOverrideRowAppliesToLoggedInStaff === "function"
          ? global.portalScheduleOverrideRowAppliesToLoggedInStaff
          : null,
      replacementClientId:
        typeof global.portalOverrideReplacementClientId === "function"
          ? global.portalOverrideReplacementClientId
          : null,
    };
  }

  /**
   * @returns {{ ids: string[], scheduleByClientId: Record<string, string> }}
   */
  function collectNewParticipantIds(ctx) {
    ctx = ctx || buildContext();
    const scheduleByClientId = Object.create(null);
    const seen = new Set();
    const ids = [];

    function add(cid, iso) {
      const id = String(cid || "").trim().toLowerCase();
      if (isPseudo(id, ctx) || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
      const day = normIso(iso);
      if (day && (!scheduleByClientId[id] || day < scheduleByClientId[id])) {
        scheduleByClientId[id] = day;
      }
    }

    rowsAll(ctx).forEach(function (row) {
      if (!rowApplies(row, ctx)) return;
      const t = String(row.override_type || "").trim();
      if (!REPLACE_TYPES.has(t)) return;
      const pl = parsePayload(row.payload);
      const cid = replacementClientId(pl, ctx);
      if (!cid) return;
      add(cid, row.session_date);
    });

    function scanDayList(list) {
      (list || []).forEach(function (item) {
        if (!isMakeUpDashboardRow(item)) return;
        const cid = String(item.clientId || "").trim().toLowerCase();
        if (!cid) return;
        const sk = String(item.sessionKey || "");
        const isoFromKey = /^\d{4}-\d{2}-\d{2}/.test(sk) ? sk.slice(0, 10) : "";
        add(cid, isoFromKey);
      });
    }

    scanDayList(ctx.dashboardData && ctx.dashboardData.today);
    scanDayList(ctx.dashboardData && ctx.dashboardData.tomorrow);

    ids.sort(function (a, b) {
      const na =
        (ctx.clientNotesById[a] && ctx.clientNotesById[a].name) || a;
      const nb =
        (ctx.clientNotesById[b] && ctx.clientNotesById[b].name) || b;
      return na.localeCompare(nb, "en");
    });

    return { ids: ids, scheduleByClientId: scheduleByClientId };
  }

  function formatScheduleLabel(iso) {
    const key = normIso(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
    try {
      const d = new Date(key + "T12:00:00");
      if (isNaN(d.getTime())) return key;
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch (_) {
      return key;
    }
  }

  function applyTabVisibility() {
    const allBtn = global.document && global.document.getElementById("clientsTabAll");
    const newBtn = global.document && global.document.getElementById("clientsTabNew");
    const pack = collectNewParticipantIds(buildContext());
    const hasNew = pack.ids.length > 0;

    if (allBtn) {
      allBtn.hidden = true;
      allBtn.setAttribute("aria-hidden", "true");
      allBtn.classList.remove("is-active");
      allBtn.setAttribute("aria-selected", "false");
    }

    if (newBtn) {
      const wasActive = newBtn.classList.contains("is-active");
      newBtn.hidden = !hasNew;
      newBtn.setAttribute("aria-hidden", hasNew ? "false" : "true");
      if (!hasNew) {
        newBtn.classList.remove("is-active");
        newBtn.setAttribute("aria-selected", "false");
        if (wasActive && typeof global.setClientsSheetTab === "function") {
          global.setClientsSheetTab("my");
        }
      }
    }

    return pack;
  }

  function clientNoteForSheet(clientId, ctx) {
    ctx = ctx || buildContext();
    const id = String(clientId || "").trim().toLowerCase();
    if (!id) return null;
    const notes = ctx.clientNotesById;
    const existing = notes[id];
    if (existing && String(existing.name || "").trim()) return existing;

    let name = "";
    rowsAll(ctx).forEach(function (row) {
      if (!rowApplies(row, ctx)) return;
      if (!REPLACE_TYPES.has(String(row.override_type || "").trim())) return;
      const pl = parsePayload(row.payload);
      const cid = replacementClientId(pl, ctx);
      if (cid !== id) return;
      if (typeof global.portalOverrideReplacementClientName === "function") {
        name = global.portalOverrideReplacementClientName(pl) || name;
      } else if (pl) {
        name =
          String(pl.to_client_name || pl.replacement_client_name || "").trim() ||
          name;
      }
    });

    if (!name) {
      name = id.replace(/[-_]+/g, " ").replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      });
    }

    const stub = {
      name: name,
      hasMedicalAlert: false,
      generalInfoSheet: existing && existing.generalInfoSheet ? existing.generalInfoSheet : "",
      specialty: existing && existing.specialty ? existing.specialty : "",
    };
    notes[id] = Object.assign({}, existing || {}, stub);
    return notes[id];
  }

  global.PortalParticipantsSheet = {
    REPLACE_TYPES: REPLACE_TYPES,
    buildContext: buildContext,
    collectNewParticipantIds: collectNewParticipantIds,
    applyTabVisibility: applyTabVisibility,
    isMakeUpDashboardRow: isMakeUpDashboardRow,
    formatScheduleLabel: formatScheduleLabel,
    clientNoteForSheet: clientNoteForSheet,
  };
})(typeof window !== "undefined" ? window : globalThis);
