/**
 * Register must merge recent-week rows into a 1000-row RPC window without dropping this week.
 * Run: npx -y deno test -A working_ui/portal/portal_register_feedback_merge.test.mjs
 */

function feedbackRowMergeKey(row) {
  if (!row) return "";
  const id = String(row.id || "").trim();
  if (id) return "id:" + id;
  return [
    String(row.session_date || "").slice(0, 10),
    String(row.client_name || "").trim().toLowerCase(),
    String(row.session_time || "").trim(),
    String(row.completed_by_name || "").trim().toLowerCase(),
    String(row.portal_session_key || "").trim(),
  ].join("|");
}

function mergeSessionFeedbackRows(current, incoming) {
  if (!Array.isArray(incoming) || !incoming.length) {
    return Array.isArray(current) ? current : [];
  }
  if (!Array.isArray(current) || !current.length) return incoming.slice();
  const out = [];
  const at = Object.create(null);
  function add(row) {
    if (!row) return;
    const key = feedbackRowMergeKey(row);
    if (!key) {
      out.push(row);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(at, key)) {
      out[at[key]] = row;
      return;
    }
    at[key] = out.length;
    out.push(row);
  }
  current.forEach(add);
  incoming.forEach(add);
  return out;
}

Deno.test("empty incoming does not wipe a loaded payload", () => {
  const cur = [{ id: "a", session_date: "2026-09-09", client_name: "Adaam Ah" }];
  const merged = mergeSessionFeedbackRows(cur, []);
  if (merged.length !== 1 || merged[0].id !== "a") {
    throw new Error("empty incoming wiped rows");
  }
});

Deno.test("recent Wednesday row survives merge into a 1000-row window", () => {
  const wide = [];
  for (let i = 0; i < 1000; i++) {
    wide.push({
      id: "old-" + i,
      session_date: "2026-06-01",
      client_name: "Kid " + i,
    });
  }
  const recent = [
    {
      id: "wed-1",
      session_date: "2026-09-09",
      client_name: "Adaam Ah",
      engagement_rating: 4,
    },
  ];
  const merged = mergeSessionFeedbackRows(wide, recent);
  if (merged.length !== 1001) throw new Error("expected 1001 after merge, got " + merged.length);
  const wed = merged.filter((r) => r.session_date === "2026-09-09");
  if (wed.length !== 1 || wed[0].engagement_rating !== 4) {
    throw new Error("Wednesday row missing after merge");
  }
});
