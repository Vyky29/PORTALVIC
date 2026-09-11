/**
 * Date-indexed feedback matching must equal full N×M matching (Roberto-scale).
 * Run: npx -y deno test -A working_ui/portal/portal_feedback_key_index.test.mjs
 */
import {
  portalGroupSessionKeysByDate,
  portalFeedbackSubmittedKeyMatchesRosterKey,
} from "./supabase-client.js";

function naiveMatch(submitted, roster, opts) {
  const out = new Set();
  for (const rk of roster) {
    for (const fk of submitted) {
      if (portalFeedbackSubmittedKeyMatchesRosterKey(fk, rk, opts || {})) {
        out.add(rk);
        break;
      }
    }
  }
  return [...out].sort();
}

function indexedMatch(submitted, roster, opts) {
  const submittedExact = new Set(submitted.map((k) => String(k).trim()).filter(Boolean));
  const byDate = portalGroupSessionKeysByDate(submitted);
  const out = new Set();
  for (const rk of roster) {
    const rosterKey = String(rk).trim();
    if (!rosterKey) continue;
    if (submittedExact.has(rosterKey)) {
      out.add(rosterKey);
      continue;
    }
    const rDate = rosterKey.slice(0, 10);
    const cands = [...(byDate.get(rDate) || [])];
    const t = Date.parse(rDate + "T12:00:00");
    if (Number.isFinite(t)) {
      const n = new Date(t + 86400000);
      const next =
        n.getFullYear() +
        "-" +
        String(n.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(n.getDate()).padStart(2, "0");
      for (const fk of byDate.get(next) || []) cands.push(fk);
    }
    for (const fk of cands) {
      if (portalFeedbackSubmittedKeyMatchesRosterKey(fk, rosterKey, opts || {})) {
        out.add(rosterKey);
        break;
      }
    }
  }
  return [...out].sort();
}

Deno.test("group keys by date", () => {
  const g = portalGroupSessionKeysByDate([
    "2026-09-11|16:00|amber",
    "2026-09-11||amber",
    "2026-09-10|09:00|yusuf",
    "bad",
    "",
  ]);
  if (g.get("2026-09-11").length !== 2) throw new Error("sep11");
  if (g.get("2026-09-10").length !== 1) throw new Error("sep10");
});

Deno.test("indexed matching equals nested matching", () => {
  const roster = [];
  const submitted = [];
  for (let d = 1; d <= 11; d++) {
    const iso = "2026-09-" + String(d).padStart(2, "0");
    for (let i = 0; i < 20; i++) {
      roster.push(iso + "|16:00|client" + i);
      roster.push(iso + "||client" + i);
    }
    if (d <= 8) {
      submitted.push(iso + "|16:00|client0");
      submitted.push(iso + "||client1");
    }
  }
  submitted.push("2026-09-11|16:00|client0");
  const a = naiveMatch(submitted, roster, {});
  const b = indexedMatch(submitted, roster, {});
  if (a.join("|") !== b.join("|")) {
    throw new Error("mismatch " + a.length + " vs " + b.length);
  }
  if (!b.includes("2026-09-11|16:00|client0")) throw new Error("missing exact");
});
