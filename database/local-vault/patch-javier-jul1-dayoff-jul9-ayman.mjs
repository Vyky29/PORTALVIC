/**
 * Javier: 2026-07-01 day off requested + MADRE cleanup;
 * 2026-07-09 remove ghost Ayman "16 to 17" slot (duplicate of "4 to 5").
 */
import fs from "fs";

const env = fs.readFileSync(
  "/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env",
  "utf8"
);
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const url = get("SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const headers = {
  apikey: key,
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const JAVIER_ID = "688afb7d-d5ad-4c9b-a04f-e28ddccda91f";
const OFF_DAY = "2026-07-01";
const FB_DAY = "2026-07-09";

async function api(method, path, body) {
  const r = await fetch(url + "/rest/v1/" + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(method + " " + path + " " + r.status + " " + t.slice(0, 600));
  return t ? JSON.parse(t) : null;
}

const notes = [];

// --- 1) Day off 2026-07-01 ---
{
  const existing = await api(
    "GET",
    `staff_unavailability?name_key=eq.javier&off_date=eq.${OFF_DAY}&select=id`
  );
  if (existing && existing.length) {
    notes.push("day-off Jul1 already present: " + existing[0].id);
  } else {
    const inserted = await api("POST", "staff_unavailability", {
      name_key: "javier",
      staff_name: "Javier Marquez",
      staff_id: JAVIER_ID,
      off_date: OFF_DAY,
      reason: "Time off requested — Planned Absence",
    });
    notes.push("day-off Jul1 inserted: " + (inserted && inserted[0] && inserted[0].id));
  }
}

// --- 2) MADRE patch ---
{
  const rows = await api(
    "GET",
    "portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at"
  );
  if (!rows || !rows[0]) throw new Error("madre missing");
  const prevRev = Number(rows[0].revision) || 0;
  const doc = rows[0].document;
  const weeks = Array.isArray(doc.weeks) ? doc.weeks : [];

  function findStaff(week, key) {
    const want = String(key).toLowerCase();
    return Object.values(week.staff || {}).find(
      (s) => String(s.staffKey || "").toLowerCase() === want
    );
  }
  function findDay(st, iso) {
    return (st.days || []).find((d) => String(d.sessionDate || "").slice(0, 10) === iso);
  }
  function weekFor(iso) {
    return weeks.find(
      (w) => String(w.start).slice(0, 10) <= iso && String(w.end).slice(0, 10) >= iso
    );
  }

  // Jul 1: clear Javier slots (did not work; covered via reassign)
  {
    const week = weekFor(OFF_DAY);
    if (!week) throw new Error("week missing for " + OFF_DAY);
    const st = findStaff(week, "javier");
    if (!st) throw new Error("javier staff missing");
    const d = findDay(st, OFF_DAY);
    if (d) {
      const n = (d.slots || []).length;
      d.slots = [];
      notes.push(`madre Jul1: cleared ${n} javier slots`);
    } else {
      notes.push("madre Jul1: no day row");
    }
  }

  // Jul 1: remove Javier staffShifts row
  {
    const shiftRows = doc.staffShifts && Array.isArray(doc.staffShifts.rows)
      ? doc.staffShifts.rows
      : null;
    if (shiftRows) {
      const before = shiftRows.length;
      doc.staffShifts.rows = shiftRows.filter((r) => {
        const iso = String(r.session_date || "").slice(0, 10);
        const sk = String(r.staff_key || "").toLowerCase();
        return !(iso === OFF_DAY && sk === "javier");
      });
      notes.push(
        `staffShifts Jul1 javier removed: ${before - doc.staffShifts.rows.length}`
      );
    } else {
      notes.push("staffShifts.rows missing");
    }
  }

  // Jul 9: remove ghost "16 to 17" / ayman (keep real "4 to 5" / Ayman)
  {
    const week = weekFor(FB_DAY);
    if (!week) throw new Error("week missing for " + FB_DAY);
    const st = findStaff(week, "javier");
    const d = findDay(st, FB_DAY);
    if (!d) throw new Error("javier day missing for " + FB_DAY);
    const before = (d.slots || []).length;
    d.slots = (d.slots || []).filter((s) => {
      const slot = String(s.time_slot || "").trim().toLowerCase().replace(/\s+/g, " ");
      const client = String(s.client_name || "").trim().toLowerCase();
      const isGhost =
        client === "ayman" &&
        (slot === "16 to 17" || slot === "16-17" || slot === "16:00 to 17:00");
      return !isGhost;
    });
    notes.push(`madre Jul9: removed ghost ayman slots (${before} → ${d.slots.length})`);
    notes.push(
      "madre Jul9 remaining: " +
        d.slots.map((s) => `${s.time_slot}:${s.client_name}`).join(" | ")
    );
  }

  doc.meta = doc.meta || {};
  doc.meta.revisionNote =
    "javier: Jul1 day off (clear slots/shift); Jul9 drop ghost 16-17 ayman";
  doc.meta.patchedAt = new Date().toISOString();

  const nextRev = prevRev + 1;
  const patchRes = await fetch(
    url +
      "/rest/v1/portal_madre_document?term_key=eq.summer-2026&revision=eq." +
      prevRev,
    {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        document: doc,
        revision: nextRev,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  const patchText = await patchRes.text();
  if (!patchRes.ok) {
    throw new Error("madre patch failed " + patchRes.status + " " + patchText.slice(0, 600));
  }
  const patched = patchText ? JSON.parse(patchText) : [];
  if (!patched.length) {
    throw new Error("madre patch conflict (revision moved); retry");
  }
  notes.push("madre revision " + prevRev + " → " + nextRev);
}

// Absence override stays as-is: portal_session_key 2026-07-09|16:00|ayman matches
// remaining "4 to 5" Ayman slot (service-role PATCH nulls updated_by via trigger).
notes.push(
  "absence override unchanged (key 16:00|ayman covers remaining 4 to 5 Ayman)"
);

console.log(notes.join("\n"));
