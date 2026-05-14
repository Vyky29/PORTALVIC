(function () {
  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function parseHm(token) {
    const t = String(token || "").trim();
    if (!t) return { h: 0, m: 0 };
    const parts = t.split(".");
    const h = parseInt(parts[0], 10) || 0;
    const m = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;
    return { h, m };
  }

  function hourTo24(hour, day) {
    if (day !== "Sunday" && hour < 8) return hour + 12;
    if (day === "Sunday" && hour >= 1 && hour <= 3) return hour + 12;
    return hour;
  }

  function parseTimeSlot(timeSlot, day) {
    const normalized = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = normalized.split(/\s+to\s+/i);
    if (parts.length < 2) {
      return { start: "16:00", end: "16:30" };
    }
    const a = parseHm(parts[0]);
    const b = parseHm(parts[1]);
    const ah = hourTo24(a.h, day);
    const bh = hourTo24(b.h, day);
    const start = `${String(ah).padStart(2, "0")}:${String(a.m).padStart(2, "0")}`;
    const end = `${String(bh).padStart(2, "0")}:${String(b.m).padStart(2, "0")}`;
    return { start, end };
  }

  function dayNameToday() {
    return new Date().toLocaleDateString("en-GB", { weekday: "long" });
  }

  function normalizePersonId(value) {
    const v = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    if (!v) return "";
    if (v === "yousef" || v === "youssef") return "yusef";
    return v;
  }

  /** Instructor tokens on a row → canonical `staffProfiles` keys (one session row per key). */
  function instructorProfileKeysForRow(instructorsRaw, profiles) {
    const keys = Object.keys(profiles || {});
    const parts = String(instructorsRaw || "")
      .split(/,|\/|&|\band\b/gi)
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < parts.length; i++) {
      const n = normalizePersonId(parts[i]);
      if (!n) continue;
      let hit = keys.find((k) => normalizePersonId(k) === n);
      if (!hit && n === "yusef") {
        hit = keys.find((k) => String(k).toLowerCase() === "youssef");
      }
      if (hit && !seen.has(hit)) {
        seen.add(hit);
        out.push(hit);
      }
    }
    return out;
  }

  const EMPTY_NOTE = {
    name: "",
    generalLead: "",
    generalInfoSheet: "",
    avatarFile: "",
    bespokeSchedule: "",
    goals: [],
    communication: "",
    medical: "",
    sessionFocus: "",
    progressNotes: "",
    homePractice: "",
  };

  function mergeClientsInfoRows(clientNotesById, rows) {
    const list = Array.isArray(rows) ? rows : [];
    const bySlug = new Map();
    list.forEach((r) => {
      const id = slugify(r.client_name || "");
      const txt = String(r.client_info || "").trim();
      if (id && txt) bySlug.set(id, txt);
    });
    Object.keys(clientNotesById).forEach((k) => {
      if (k === "available" || k === "closed") return;
      const t = bySlug.get(k);
      if (t) clientNotesById[k].generalInfoSheet = t;
    });
  }

  /** Every real client on any roster row (any instructor): powers ALL CLIENTS without changing MY CLIENTS logic. */
  function mergeCompanyClientsFromRosterRows(clientNotesById, rows) {
    const list = Array.isArray(rows) ? rows : [];
    list.forEach((row) => {
      const nameRaw = String(row.client_name || "").trim();
      const nameLower = nameRaw.toLowerCase();
      if (!nameRaw || nameLower === "closed") return;
      const clientId = slugify(nameRaw);
      if (!clientId || clientId === "closed" || clientId === "available") return;
      if (clientNotesById[clientId]) return;
      const rosterService = String(row.service || "").trim();
      const rosterArea =
        row.area !== undefined && row.area !== null ? String(row.area).trim() : "";
      const venue = String(row.venue || "").trim();
      clientNotesById[clientId] = Object.assign({}, EMPTY_NOTE, {
        name: nameRaw,
        generalLead: `${venue} · ${rosterService || rosterArea || ""}`.trim(),
      });
    });
  }

  function buildForStaff(source, staffIdForMatch, staffIdStored) {
    const rows = Array.isArray(source && source.rows) ? source.rows : [];
    const sessionsModel = [];
    const clientNotesById = {};
    const profiles = (source && source.staffProfiles) || {};
    const wanted = normalizePersonId(staffIdForMatch);
    const stored =
      staffIdStored != null && String(staffIdStored).trim()
        ? String(staffIdStored).trim().toLowerCase()
        : null;

    rows.forEach((row) => {
      const targets = instructorProfileKeysForRow(row.instructors, profiles);
      if (!targets.some((k) => normalizePersonId(k) === wanted)) return;

      const nameRaw = String(row.client_name || "").trim();
      const nameLower = nameRaw.toLowerCase();
      const isClosed = nameLower === "closed";
      const timeSlotLabel = String(row.time_slot || "").trim();
      const rosterService = String(row.service || "").trim();
      const rosterArea =
        row.area !== undefined && row.area !== null ? String(row.area).trim() : "";
      const venue = String(row.venue || "").trim();
      const day = String(row.day || "").trim();

      const selfKey =
        targets.find((k) => normalizePersonId(k) === wanted) ||
        String(staffIdForMatch || "").trim().toLowerCase();
      const staffKeyOut = stored || String(selfKey).toLowerCase();

      if (!timeSlotLabel && !nameRaw && !rosterService && !rosterArea) return;

      const t = parseTimeSlot(row.time_slot, row.day);

      const baseSession = {
        staffId: staffKeyOut,
        day,
        start: t.start,
        end: t.end,
        venue,
        rosterService,
        rosterArea,
        timeSlotLabel,
      };

      if (isClosed) {
        sessionsModel.push(
          Object.assign({}, baseSession, {
            clientId: "closed",
            activity: "",
            status: "closed",
          })
        );
        return;
      }

      if (!nameRaw) {
        if (!timeSlotLabel) return;
        sessionsModel.push(
          Object.assign({}, baseSession, {
            clientId: "available",
            activity: rosterService || "Swimming",
            status: "available",
          })
        );
        return;
      }

      const clientId = slugify(nameRaw);
      sessionsModel.push(
        Object.assign({}, baseSession, {
          clientId,
          activity: rosterService || "Swimming",
          status: "scheduled",
        })
      );

      if (!clientNotesById[clientId]) {
        clientNotesById[clientId] = Object.assign({}, EMPTY_NOTE, {
          name: nameRaw,
          generalLead: `${venue} · ${rosterService || rosterArea || ""}`.trim(),
        });
      }
    });

    if (!clientNotesById.available) {
      clientNotesById.available = Object.assign({}, EMPTY_NOTE, {
        name: "No client",
        generalLead: "Open roster slot — new clients welcome",
      });
    }

    sessionsModel.sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return a.start.localeCompare(b.start);
    });

    return { sessionsModel, clientNotesById };
  }

  function bootstrap(options) {
    const source = (options && options.source) || window.STAFF_DASHBOARD_SOURCE || {};
    const rawId = String((options && options.staffId) || "").trim().toLowerCase();
    const profiles = (source && source.staffProfiles) || {};
    const profile = profiles[rawId] || {};

    const isDemoAcct = rawId === "demo";
    const effectiveRowStaffId = isDemoAcct ? "youssef" : rawId;
    const built = buildForStaff(source, effectiveRowStaffId, isDemoAcct ? "demo" : null);
    const allRows = Array.isArray(source && source.rows) ? source.rows : [];
    mergeCompanyClientsFromRosterRows(built.clientNotesById, allRows);

    let clientsInfo = (source && source.clientsInfo) || [];
    if (
      (!clientsInfo || !clientsInfo.length) &&
      typeof window !== "undefined" &&
      Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS)
    ) {
      clientsInfo = window.PORTAL_CLIENTS_INFO_ROWS;
    }
    mergeClientsInfoRows(built.clientNotesById, clientsInfo);

    return {
      staffName: profile.staffName || rawId || "Staff",
      avatarFile: profile.avatarFile || "",
      staffRoleTrack: profile.staffRoleTrack || "swimming",
      defaultViewDay: dayNameToday(),
      sessionsModel: built.sessionsModel,
      clientNotesById: built.clientNotesById,
    };
  }

  window.StaffDashboardSpreadsheetAdapter = { bootstrap };
})();
