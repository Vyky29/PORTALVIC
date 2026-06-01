/**
 * Portal change log — tiny shared audit helper.
 *
 * Any admin module calls window.PortalChangeLog.record({...}) right after a
 * successful save. It appends one row to public.change_log (Portal Supabase,
 * RLS admin/CEO) capturing WHO (from the signed-in staff_profile), WHEN
 * (occurred_at default now()), and WHAT (area / entity / action / summary +
 * structured details). Fire-and-forget: it never blocks or breaks a save.
 *
 * load() also reads schedule_override_events (all admins/CEOs) so the Activity
 * log shows every scheduling override/void, not only rows written via record().
 *
 * It also exposes diff(oldObj, newObj) to build a readable field-by-field
 * change summary, and load(opts) for the Activity log page.
 */
(function (global) {
  "use strict";

  var OVERRIDE_TYPE_LABELS = {
    client_absence_announced: "Absent",
    client_cancelled: "Cancelled",
    slot_clear_client: "No Participant",
    client_replace_in_slot: "Make up",
    instructor_reassign: "Changed instructor",
    slot_close: "Closed",
    slot_open: "Open closed slot",
    override_void: "Void",
    session_add: "Training / Shadowing",
  };

  function box() { return global.__PORTAL_SUPABASE__ || {}; }
  function client() { return box().client || null; }
  function profile() { return box().staff_profile || null; }

  function actorName(p) {
    if (!p) return "Unknown";
    return p.full_name || p.username || p.email || "Unknown";
  }

  function formatSessionDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return "";
    var p = String(iso).slice(0, 10).split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function weekdayLong(iso) {
    if (!iso) return "";
    try {
      return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
    } catch (_) { return ""; }
  }

  function titleCaseSlug(slug) {
    var s = String(slug || "").trim();
    if (!s) return "";
    return s.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function asObj(v) {
    if (!v || typeof v !== "object") return {};
    return v;
  }

  function payloadObj(row) {
    row = asObj(row);
    var p = row.payload;
    if (p && typeof p === "object") return p;
    if (typeof p === "string") {
      try { return JSON.parse(p); } catch (_) { return {}; }
    }
    return {};
  }

  function overrideContext(ev) {
    var ov = asObj(ev.schedule_overrides);
    var afterRow = asObj(ev.after_snapshot && ev.after_snapshot.row);
    var before = asObj(ev.before_snapshot);
    var slot = asObj(before.slot);
    var base = ev.action === "void" ? Object.assign({}, afterRow, before, { slot: slot }) : Object.assign({}, before, afterRow, ov);
    return {
      session_date: base.session_date || slot.sessionDate || ov.session_date || "",
      override_type: base.override_type || ov.override_type || "",
      venue: base.anchor_venue || slot.venue || ov.anchor_venue || "",
      time: base.anchor_time_slot_label || slot.whenLabel || slot.anchorTimeLabel || ov.anchor_time_slot_label || "",
      reason: base.reason || ov.reason || "",
      payload: payloadObj(base) || payloadObj(ov),
      client_slug: base.anchor_client_id || slot.clientSlug || ov.anchor_client_id || "",
      client_name: slot.clientName || slot.client || "",
    };
  }

  function overrideEventEntity(ctx) {
    if (ctx.payload.to_client_name) return String(ctx.payload.to_client_name);
    if (ctx.client_name) return String(ctx.client_name);
    return titleCaseSlug(ctx.client_slug);
  }

  function buildOverrideEventSummary(ev) {
    var ctx = overrideContext(ev);
    var ovLabel = OVERRIDE_TYPE_LABELS[ctx.override_type] || ctx.override_type || "Override";
    if (ev.action === "void") ovLabel = "Undid · " + ovLabel;
    else if (ev.action === "supersede") ovLabel = "Superseded · " + ovLabel;
    var sumBits = [ovLabel];
    if (ctx.override_type === "instructor_reassign" && ctx.payload.covering_staff_name) {
      sumBits.push("cover: " + ctx.payload.covering_staff_name);
    }
    if (ctx.override_type === "client_replace_in_slot" && ctx.payload.to_client_name) {
      sumBits.push("replacement: " + ctx.payload.to_client_name);
    }
    if (ctx.reason) sumBits.push("reason: " + ctx.reason);
    var dayLong = weekdayLong(ctx.session_date);
    var dNice = formatSessionDate(ctx.session_date);
    var whenPart = [ctx.venue, ctx.time].filter(Boolean).join(" ");
    return (dayLong ? dayLong + " " : "") + dNice + (whenPart ? " · " + whenPart : "") + " · " + sumBits.join(" · ");
  }

  function mapOverrideEventToRow(ev, profilesById) {
    var ctx = overrideContext(ev);
    var p = profilesById[ev.actor_id] || {};
    var actionMap = { create: "override", update: "override", void: "void", supersede: "override" };
    return {
      id: "sov:" + ev.id,
      occurred_at: ev.created_at,
      actor_name: actorName(p),
      actor_role: p.app_role || null,
      area: "Scheduling",
      entity: overrideEventEntity(ctx),
      action: actionMap[ev.action] || ev.action,
      summary: buildOverrideEventSummary(ev),
      details: {
        session_date: ctx.session_date,
        override_type: ctx.override_type,
        override_id: ev.override_id,
        venue: ctx.venue,
        time: ctx.time,
        event_action: ev.action,
        source_table: "schedule_override_events",
      },
      source: "schedule_override_events",
    };
  }

  function shouldKeepChangeLogRow(r, hasOverrideEvents) {
    if (!hasOverrideEvents) return true;
    if (r.area !== "Scheduling") return true;
    var det = r.details || {};
    if (det.override_type === "session_add") return true;
    if (r.source === "scheduling_training") return true;
    return false;
  }

  // Build a human summary + structured diff between two flat objects.
  // Returns { summary, changes:[{field, from, to}] } or null if nothing changed.
  function diff(oldObj, newObj, labels) {
    oldObj = oldObj || {};
    newObj = newObj || {};
    labels = labels || {};
    var keys = {};
    Object.keys(oldObj).forEach(function (k) { keys[k] = 1; });
    Object.keys(newObj).forEach(function (k) { keys[k] = 1; });
    var changes = [];
    Object.keys(keys).forEach(function (k) {
      var a = oldObj[k]; var b = newObj[k];
      var as = a == null ? "" : String(a);
      var bs = b == null ? "" : String(b);
      if (as === bs) return;
      changes.push({ field: labels[k] || k, from: as, to: bs });
    });
    if (!changes.length) return null;
    var summary = changes.map(function (c) {
      var from = c.from === "" ? "∅" : c.from;
      var to = c.to === "" ? "∅" : c.to;
      return c.field + ": " + from + " → " + to;
    }).join("; ");
    return { summary: summary, changes: changes };
  }

  // entry: { area, entity, action, summary, details, source }
  function record(entry) {
    try {
      entry = entry || {};
      var c = client();
      if (!c) return Promise.resolve(false);
      var p = profile();
      var row = {
        actor_id: (p && p.id) || null,
        actor_name: actorName(p),
        actor_role: (p && p.app_role) || null,
        area: entry.area || "General",
        entity: entry.entity || null,
        action: entry.action || "update",
        summary: entry.summary || "",
        details: entry.details || {},
        source: entry.source || "admin_dashboard",
      };
      return c.from("change_log").insert(row).then(function (res) {
        if (res && res.error) { try { console.warn("[change-log]", res.error.message); } catch (_) {} return false; }
        return true;
      }).catch(function (err) {
        try { console.warn("[change-log]", (err && err.message) || err); } catch (_) {}
        return false;
      });
    } catch (e) {
      try { console.warn("[change-log]", e); } catch (_) {}
      return Promise.resolve(false);
    }
  }

  function loadChangeLog(c, opts) {
    var q = c.from("change_log")
      .select("id, occurred_at, actor_name, actor_role, area, entity, action, summary, details, source")
      .order("occurred_at", { ascending: false })
      .limit(opts.limit || 1000);
    if (opts.area) q = q.eq("area", opts.area);
    if (opts.since) q = q.gte("occurred_at", opts.since);
    return q.then(function (res) {
      if (res && res.error) throw res.error;
      return res.data || [];
    });
  }

  function loadOverrideEvents(c, opts) {
    var q = c.from("schedule_override_events")
      .select("id, created_at, action, override_id, before_snapshot, after_snapshot, actor_id, schedule_overrides(session_date, override_type, anchor_client_id, anchor_venue, anchor_time_slot_label, payload, reason, status)")
      .order("created_at", { ascending: false })
      .limit(opts.limit || 1000);
    if (opts.since) q = q.gte("created_at", opts.since);
    return q.then(function (res) {
      if (res && res.error) throw res.error;
      var events = res.data || [];
      if (!events.length) return [];
      var actorIds = [];
      events.forEach(function (ev) {
        if (ev.actor_id && actorIds.indexOf(ev.actor_id) < 0) actorIds.push(ev.actor_id);
      });
      if (!actorIds.length) return events.map(function (ev) { return mapOverrideEventToRow(ev, {}); });
      return c.from("staff_profiles")
        .select("id, full_name, username, email, app_role")
        .in("id", actorIds)
        .then(function (pRes) {
          if (pRes && pRes.error) throw pRes.error;
          var profilesById = {};
          (pRes.data || []).forEach(function (p) { profilesById[p.id] = p; });
          return events.map(function (ev) { return mapOverrideEventToRow(ev, profilesById); });
        });
    });
  }

  // opts: { limit, area, query, since } -> Promise<rows[]> newest first.
  function load(opts) {
    opts = opts || {};
    var c = client();
    if (!c) return Promise.resolve([]);
    var limit = opts.limit || 1000;
    var areaFilter = opts.area || "";

    return loadChangeLog(c, opts).then(function (clRows) {
      if (areaFilter && areaFilter !== "Scheduling") {
        return clRows.slice(0, limit);
      }
      return loadOverrideEvents(c, opts).catch(function (err) {
        try { console.warn("[change-log] schedule_override_events", (err && err.message) || err); } catch (_) {}
        return [];
      }).then(function (ovRows) {
        var filtered = clRows.filter(function (r) { return shouldKeepChangeLogRow(r, ovRows.length > 0); });
        var merged = filtered.concat(ovRows);
        merged.sort(function (a, b) {
          return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
        });
        return merged.slice(0, limit);
      });
    });
  }

  global.PortalChangeLog = { record: record, diff: diff, load: load };
})(typeof window !== "undefined" ? window : globalThis);
