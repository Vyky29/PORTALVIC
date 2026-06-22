/**
 * Queue admin overrides for folding back into roster_term_master.json (MADRE).
 * Live view = MADRE (bundle) + Supabase overlays; permanent edits must fold or MADRE goes stale.
 */
(function (global) {
  "use strict";

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function queueFold(client, row) {
    if (!client || typeof client.from !== "function") {
      return Promise.resolve({ skipped: true, reason: "no_client" });
    }
    var payload = {
      fold_type: row.fold_type,
      session_date: row.session_date || null,
      payload: row.payload || {},
      before_snapshot: row.before_snapshot || null,
      source_module: row.source_module || null,
      source_row_id: row.source_row_id || null,
      status: "pending",
    };
    return client
      .from("portal_madre_fold_queue")
      .insert([payload])
      .then(function (res) {
        if (res.error) {
          console.warn("[portal_madre_fold_queue]", res.error);
          return { error: res.error };
        }
        return { ok: true, data: res.data };
      })
      .catch(function (err) {
        console.warn("[portal_madre_fold_queue]", err);
        return { error: err };
      });
  }

  /** After Edit term slot / portal_roster_rows save. */
  function queueParticipantSlotChange(client, opts) {
    opts = opts || {};
    var after = opts.after || {};
    var before = opts.before || null;
    var iso = normIso(opts.session_date || after.session_date);
    var cancelled =
      String(after.status || "").toLowerCase() === "cancelled" ||
      opts.action === "cancel" ||
      opts.term_action === "cancel_service" ||
      opts.term_action === "no_participant";
    return queueFold(client, {
      fold_type: cancelled ? "participant_slot_cancel" : "participant_slot_upsert",
      session_date: iso || null,
      payload: {
        client_name: after.client_name || opts.client_name,
        day: after.day || opts.day,
        time_slot: after.time_slot || opts.time_slot,
        instructors: after.instructors || opts.instructors,
        service: after.service || opts.service,
        area: after.area || opts.area,
        venue: after.venue || opts.venue,
        scope: opts.scope || null,
        term_action: opts.term_action || null,
      },
      before_snapshot: before,
      source_module: opts.source_module || "term_roster_edit",
      source_row_id: opts.roster_row_id || null,
    });
  }

  /** After Schedule & Covers save (day-of override). */
  function queueScheduleOverrideChange(client, opts) {
    opts = opts || {};
    var row = opts.row || {};
    var payload = row.payload || {};
    var ovType = String(row.override_type || "").toLowerCase();
    var iso = normIso(row.session_date || opts.session_date);
    var isStaffCover =
      ovType.indexOf("staff") >= 0 ||
      ovType === "instructor_cover" ||
      !!payload.covering_staff_id;
    if (isStaffCover) {
      return queueFold(client, {
        fold_type: "staff_shift_upsert",
        session_date: iso || null,
        payload: {
          staff_name: payload.covering_staff_name || payload.covering_staff_id || "",
          venue: row.anchor_venue || payload.venue || "",
          time_range: row.anchor_time_slot_label || "",
          day: payload.day || "",
          raw_assignment: payload.raw_assignment || "",
          override_type: ovType,
        },
        before_snapshot: opts.before || null,
        source_module: opts.source_module || "schedule_overrides",
        source_row_id: opts.override_id || null,
      });
    }
    return queueFold(client, {
      fold_type:
        ovType === "slot_clear_client" || ovType === "client_cancelled"
          ? "participant_slot_cancel"
          : "participant_slot_upsert",
      session_date: iso || null,
      payload: {
        client_name: payload.replacement_client_name || payload.to_client_name || row.anchor_client_id || "",
        instructors: payload.covering_staff_id || row.anchor_staff_id || "",
        time_slot: row.anchor_time_slot_label || "",
        venue: row.anchor_venue || "",
        service: payload.service || "",
        area: payload.area || "",
        override_type: ovType,
      },
      before_snapshot: opts.before || null,
      source_module: opts.source_module || "schedule_overrides",
      source_row_id: opts.override_id || null,
    });
  }

  global.PortalMadreFold = {
    queueFold: queueFold,
    queueParticipantSlotChange: queueParticipantSlotChange,
    queueScheduleOverrideChange: queueScheduleOverrideChange,
  };
})(typeof window !== "undefined" ? window : globalThis);
