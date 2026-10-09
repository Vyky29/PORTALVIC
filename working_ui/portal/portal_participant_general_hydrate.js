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

  /** Card titles keep "(Trial)". The registration row is stored under the child name. */
  function rosterNameForInfo(name) {
    return normName(
      String(name || "")
        .replace(/\(\s*trial[^)]*\)/gi, " ")
        .replace(/\s+trial\s*$/i, " ")
    );
  }

  function registerGeneralInfo(contactId, displayName, sheet) {
    sheet = String(sheet || "").trim();
    if (!sheet) return;
    /* Staff UI hides Other Notes; keep full sheet in STORE for admin if needed via name key. */
    var id = String(contactId || "").trim();
    if (id) STORE.byContactId[id] = sheet;
    var nk = rosterNameForInfo(displayName);
    if (nk) {
      STORE.byName[nk] = sheet;
      /* Same slug the photo index uses (ilyas_aziz), so a trial card id hits this sheet. */
      var slug = nk.replace(/\s+/g, "_");
      if (slug && slug !== id) STORE.byContactId[slug] = sheet;
    }
  }

  function stripOtherNotesForStaff(sheet) {
    var t = String(sheet || "").replace(/\r\n|\r/g, "\n").trim();
    if (!t) return "";
    t = t.replace(/(?:^|\n)\s*15\.\s*Other Notes:\s*[\s\S]*?(?=\n\s*\d+\.\s+|$)/i, "").trim();
    t = t.replace(/(?:^|\n)\s*15\.\s*[^:\n]+:\s*[\s\S]*?(?=\n\s*\d+\.\s+|$)/i, "").trim();
    return t;
  }

  function portalParticipantGeneralInfoText(clientId, displayName) {
    var id = String(clientId || "").trim();
    var sheet = "";
    if (id && STORE.byContactId[id]) sheet = STORE.byContactId[id];
    var nk = rosterNameForInfo(displayName);
    if (!sheet && nk && STORE.byName[nk]) sheet = STORE.byName[nk];
    if (!sheet && nk) {
      var nameSlug = nk.replace(/\s+/g, "_");
      if (nameSlug && STORE.byContactId[nameSlug]) sheet = STORE.byContactId[nameSlug];
    }
    if (!sheet && global.PortalParticipantIdentity && typeof global.PortalParticipantIdentity.canonicalClientId === "function") {
      var want = global.PortalParticipantIdentity.canonicalClientId(nk || displayName || clientId);
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
        if (rosterNameForInfo(note.name || cid) === nk || normName(cid) === nk) {
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

  function bit(payload, key) {
    var v = payload && payload[key];
    if (v == null) return "";
    if (Array.isArray(v)) {
      return v
        .map(function (x) {
          return String(x == null ? "" : x).trim();
        })
        .filter(Boolean)
        .join(", ");
    }
    return String(v).trim();
  }

  function ageLabelFromDob(dobIso) {
    var s = String(dobIso || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var p = s.split("-").map(Number);
    var dob = new Date(p[0], p[1] - 1, p[2]);
    if (isNaN(dob.getTime())) return "";
    var now = new Date();
    var age = now.getFullYear() - dob.getFullYear();
    var m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    if (age < 0 || age > 120) return "";
    return age + " years";
  }

  function sheetLooksNumbered(sheet) {
    return /(?:^|\n)\s*\d+\.\s+[^:\n]+:/.test(String(sheet || ""));
  }

  /** Full Clients Info rows from a booking-portal registration payload. */
  function sheetFromRegistrationPayload(payload, dobIso) {
    var p = payload && typeof payload === "object" ? payload : {};
    var lines = [];
    var age = ageLabelFromDob(dobIso || bit(p, "participant_dob"));
    if (age) lines.push("1. Age: " + age);
    var medical = [
      bit(p, "medical_conditions"),
      bit(p, "allergies") ? "Allergies: " + bit(p, "allergies") : "",
      bit(p, "medication") ? "Regular medication: " + bit(p, "medication") : "",
      bit(p, "health_plan") === "Yes" && bit(p, "health_plan_details")
        ? "Health plan: " + bit(p, "health_plan_details")
        : "",
      bit(p, "ehcp") ? "EHCP: " + bit(p, "ehcp") : "",
      bit(p, "ehcp_details") ? "EHCP details: " + bit(p, "ehcp_details") : "",
      bit(p, "social_worker_name") ? "Social worker: " + bit(p, "social_worker_name") : "",
    ]
      .filter(Boolean)
      .join(". ");
    if (medical) lines.push("2. Medical: " + medical);
    if (bit(p, "motivators")) lines.push("3. Likes/Motivators: " + bit(p, "motivators"));
    if (bit(p, "dislikes")) lines.push("4. Dislikes/Avoids: " + bit(p, "dislikes"));
    if (bit(p, "triggers")) lines.push("5. Known Triggers: " + bit(p, "triggers"));
    var strategies = [bit(p, "strategies"), bit(p, "behaviour_notes")].filter(Boolean).join(". ");
    if (strategies) lines.push("6. Regulation Strategies: " + strategies);
    var support = [bit(p, "support_regulated"), bit(p, "support_dysregulated")].filter(Boolean).join(". ");
    if (support) lines.push("7. Level of Support: " + support);
    if (bit(p, "expressive_comm")) lines.push("8. Communication: " + bit(p, "expressive_comm"));
    var pref = [bit(p, "understand_instructions"), bit(p, "comm_strategies")].filter(Boolean).join(". ");
    if (pref) lines.push("9. Preferred Communication: " + pref);
    if (bit(p, "mobility")) lines.push("10. Mobility: " + bit(p, "mobility"));
    if (bit(p, "personal_care")) lines.push("11. Personal Care: " + bit(p, "personal_care"));
    if (bit(p, "task_engagement")) lines.push("12. Task Engagement: " + bit(p, "task_engagement"));
    if (bit(p, "transitions")) lines.push("13. Transitions/Flexibility: " + bit(p, "transitions"));
    if (bit(p, "risk_awareness")) lines.push("14. Safety: " + bit(p, "risk_awareness"));
    if (bit(p, "anything_else")) lines.push("15. Other Notes: " + bit(p, "anything_else"));
    var booking = p.booking_request && typeof p.booking_request === "object" ? p.booking_request : {};
    var slot = [booking.service_name || booking.service, booking.venue, booking.day, booking.time]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(" · ");
    if (slot) lines.push("16. Requested booking: " + slot);
    return lines.join("\n");
  }

  function namesMatch(a, b) {
    return rosterNameForInfo(a) && rosterNameForInfo(a) === rosterNameForInfo(b);
  }

  /**
   * Booking registrations only seeded a short line dump.
   * When this login can read the form, rebuild the numbered sheet for display.
   */
  async function expandGeneralInfoFromRegistration(clientId, displayName) {
    var name = rosterNameForInfo(displayName);
    var id = String(clientId || "").trim();
    var current = portalParticipantGeneralInfoText(id, displayName);
    if (sheetLooksNumbered(current) && /(?:^|\n)\s*1\.\s*Age:/i.test(current)) return "";
    var box = global.__PORTAL_SUPABASE__;
    var sb = box && box.client;
    if (!sb || !name) return "";
    var res = await sb
      .from("portal_participant_documents")
      .select("participant_name, participant_dob, payload_json, form_type, submitted_at")
      .eq("form_type", "client_registration")
      .ilike("participant_name", name)
      .order("submitted_at", { ascending: false })
      .limit(8);
    if (res.error || !Array.isArray(res.data) || !res.data.length) return "";
    var sheet = "";
    var matchedName = name;
    var bestSections = 0;
    for (var i = 0; i < res.data.length; i++) {
      var candidate = res.data[i];
      if (!candidate || !namesMatch(candidate.participant_name, name)) continue;
      var built = sheetFromRegistrationPayload(candidate.payload_json, candidate.participant_dob);
      if (!built || !sheetLooksNumbered(built)) continue;
      var n = (built.match(/(?:^|\n)\s*\d+\.\s+[^:\n]+:/g) || []).length;
      if (n > bestSections) {
        sheet = built;
        matchedName = candidate.participant_name || name;
        bestSections = n;
      }
    }
    if (!sheet) return "";
    registerGeneralInfo(id, matchedName || name, sheet);
    if (global.clientNotesById && id && global.clientNotesById[id]) {
      global.clientNotesById[id].generalInfoSheet = stripOtherNotesForStaff(sheet);
    }
    return stripOtherNotesForStaff(sheet);
  }

  global.PORTAL_PARTICIPANT_GENERAL_INFO = STORE;
  global.portalParticipantGeneralInfoText = portalParticipantGeneralInfoText;
  global.portalApplyParticipantGeneralInfoToNotes = applyToClientNotes;
  global.portalHydrateParticipantGeneralInfoFromSupabase = hydrateParticipantGeneralInfoFromSupabase;
  global.portalExpandGeneralInfoFromRegistration = expandGeneralInfoFromRegistration;
  bindHydrate();
})(typeof window !== "undefined" ? window : globalThis);
