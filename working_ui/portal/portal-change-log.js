/**
 * Portal change log — tiny shared audit helper.
 *
 * Any admin module calls window.PortalChangeLog.record({...}) right after a
 * successful save. It appends one row to public.change_log (Portal Supabase,
 * RLS admin/CEO) capturing WHO (from the signed-in staff_profile), WHEN
 * (occurred_at default now()), and WHAT (area / entity / action / summary +
 * structured details). Fire-and-forget: it never blocks or breaks a save.
 *
 * It also exposes diff(oldObj, newObj) to build a readable field-by-field
 * change summary, and load(opts) for the Activity log page.
 */
(function (global) {
  "use strict";

  function box() { return global.__PORTAL_SUPABASE__ || {}; }
  function client() { return box().client || null; }
  function profile() { return box().staff_profile || null; }

  function actorName(p) {
    if (!p) return "Unknown";
    return p.full_name || p.username || p.email || "Unknown";
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

  // opts: { limit, area, query, since } -> Promise<rows[]> newest first.
  function load(opts) {
    opts = opts || {};
    var c = client();
    if (!c) return Promise.resolve([]);
    var q = c.from("change_log")
      .select("id, occurred_at, actor_name, actor_role, area, entity, action, summary, details")
      .order("occurred_at", { ascending: false })
      .limit(opts.limit || 1000);
    if (opts.area) q = q.eq("area", opts.area);
    if (opts.since) q = q.gte("occurred_at", opts.since);
    return q.then(function (res) {
      if (res && res.error) throw res.error;
      return res.data || [];
    });
  }

  global.PortalChangeLog = { record: record, diff: diff, load: load };
})(typeof window !== "undefined" ? window : globalThis);
