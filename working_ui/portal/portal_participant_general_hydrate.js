/**
 * Hydrate participant general info from Supabase into staff/admin clientNotesById.
 */
(function (global) {
  "use strict";

  var STORE = { byContactId: {}, byName: {} };

  function normName(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function registerGeneralInfo(contactId, displayName, sheet) {
    sheet = String(sheet || "").trim();
    if (!sheet) return;
    /* Staff UI hides Other Notes; keep full sheet in STORE for admin if needed via name key. */
    var id = String(contactId || "").trim();
    if (id) STORE.byContactId[id] = sheet;
    var nk = normName(displayName);
    if (nk) STORE.byName[nk] = sheet;
  }

  function stripOtherNotesForStaff(sheet) {
    var t = String(sheet || "").replace(/\r\n|\r/g, "\n").trim();
    if (!t) return "";
    t = t.replace(/(?:^|\n)\s*15\.\s*Other Notes:\s*[\s\S]*$/i, "").trim();
    t = t.replace(/(?:^|\n)\s*15\.\s*[^:\n]+:\s*[\s\S]*$/i, "").trim();
    return t;
  }

  function portalParticipantGeneralInfoText(clientId, displayName) {
    var id = String(clientId || "").trim();
    var sheet = "";
    if (id && STORE.byContactId[id]) sheet = STORE.byContactId[id];
    if (!sheet) {
      var nk = normName(displayName);
      if (nk && STORE.byName[nk]) sheet = STORE.byName[nk];
    }
    if (!sheet && global.PortalParticipantIdentity && typeof global.PortalParticipantIdentity.canonicalClientId === "function") {
      var want = global.PortalParticipantIdentity.canonicalClientId(displayName || clientId);
      var keys = Object.keys(STORE.byName);
      for (var i = 0; i < keys.length; i++) {
        if (global.PortalParticipantIdentity.canonicalClientId(keys[i]) === want) {
          sheet = STORE.byName[keys[i]];
          break;
        }
      }
    }
    return stripOtherNotesForStaff(sheet);
  }

  function applyToClientNotes(clientNotesById) {
    if (!clientNotesById || typeof clientNotesById !== "object") return;
    Object.keys(clientNotesById).forEach(function (cid) {
      var note = clientNotesById[cid];
      if (!note) return;
      var sheet = portalParticipantGeneralInfoText(cid, note.name || cid);
      if (sheet) note.generalInfoSheet = sheet;
      var infoText = String(note.generalInfoSheet || "").trim();
      if (infoText && typeof global.portalDeriveMedicalAlertFromInfo === "function") {
        note.hasMedicalAlert = !!global.portalDeriveMedicalAlertFromInfo(infoText);
      } else if (infoText && typeof global.StaffDashboardSpreadsheetAdapter === "object"
        && typeof global.StaffDashboardSpreadsheetAdapter.deriveMedicalAlertFromInfo === "function") {
        note.hasMedicalAlert = !!global.StaffDashboardSpreadsheetAdapter.deriveMedicalAlertFromInfo(infoText);
      }
    });
    Object.keys(STORE.byName).forEach(function (nk) {
      Object.keys(clientNotesById).forEach(function (cid) {
        var note = clientNotesById[cid];
        if (!note) return;
        if (normName(note.name || cid) === nk) {
          note.generalInfoSheet = stripOtherNotesForStaff(STORE.byName[nk]);
          var infoText = String(note.generalInfoSheet || "").trim();
          if (infoText && typeof global.portalDeriveMedicalAlertFromInfo === "function") {
            note.hasMedicalAlert = !!global.portalDeriveMedicalAlertFromInfo(infoText);
          }
        }
      });
    });
  }

  async function hydrateParticipantGeneralInfoFromSupabase() {
    var box = global.__PORTAL_SUPABASE__;
    var sb = box && box.client;
    if (!sb) return false;

    var res = await sb
      .from("portal_participant_general_info")
      .select("contact_id, general_info_sheet, portal_participants(display_name)")
      .not("general_info_sheet", "eq", "");

    if (res.error || !Array.isArray(res.data)) {
      console.warn("[portal] participant general info hydrate", res.error || "no data");
      return false;
    }

    res.data.forEach(function (row) {
      if (!row || !row.general_info_sheet) return;
      var name =
        row.portal_participants && row.portal_participants.display_name
          ? row.portal_participants.display_name
          : "";
      registerGeneralInfo(row.contact_id, name, row.general_info_sheet);
    });

    if (typeof global.clientNotesById !== "undefined") {
      applyToClientNotes(global.clientNotesById);
    }
    return true;
  }

  function bindHydrate() {
    global.addEventListener("portal:supabase-ready", function () {
      void hydrateParticipantGeneralInfoFromSupabase();
    });
    global.addEventListener("portal:staff-dashboard-ready", function () {
      if (typeof global.clientNotesById !== "undefined") {
        applyToClientNotes(global.clientNotesById);
      }
    });
    if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      void hydrateParticipantGeneralInfoFromSupabase();
    }
  }

  global.PORTAL_PARTICIPANT_GENERAL_INFO = STORE;
  global.portalParticipantGeneralInfoText = portalParticipantGeneralInfoText;
  global.portalApplyParticipantGeneralInfoToNotes = applyToClientNotes;
  global.portalHydrateParticipantGeneralInfoFromSupabase = hydrateParticipantGeneralInfoFromSupabase;
  bindHydrate();
})(typeof window !== "undefined" ? window : globalThis);
