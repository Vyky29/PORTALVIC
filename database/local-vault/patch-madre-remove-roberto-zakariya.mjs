/**
 * DEPRECATED — do not run.
 * Zakariya 1–2 with Roberto Mon–Thu crash week is correct (restored in
 * patch-madre-roberto-zak-alex-crash-w1.mjs / MADRE rev 215).
 * This script wrongly removed him assuming SwimFarm special was staff-less.
 *
 *   node database/local-vault/patch-madre-remove-roberto-zakariya.mjs
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

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers }
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = rows[0].document;
const notes = [];
let removed = 0;
let fadiFixed = 0;

function fixFadi(day, iso) {
  const fadi = (day.slots || []).find((s) =>
    /^fadi$/i.test(String(s.client_name || "").trim())
  );
  if (!fadi) return;
  const segs = Array.isArray(fadi.segments) ? fadi.segments : [];
  const hasGap =
    segs.some((s) => /12\.?30\s*to\s*1/i.test(String(s.time_slot || ""))) &&
    segs.some((s) => /^2\s*to\s*3/i.test(String(s.time_slot || ""))) &&
    !segs.some((s) => /^1\s*to\s*3/i.test(String(s.time_slot || "")));
  if (!hasGap) return;
  const first = segs.find((s) =>
    /12\.?30\s*to\s*1/i.test(String(s.time_slot || ""))
  );
  fadi.segments = [
    { time_slot: "12.30 to 1", area: first?.area || "Big Pool" },
    { time_slot: "1 to 3", area: "Day Centre" },
  ];
  fadiFixed++;
  notes.push(`${iso} Fadi segments → 12.30–1 + 1–3`);
}

for (const week of doc.weeks || []) {
  if (String(week.start || "").slice(0, 10) < "2026-07-13") continue;
  for (const st of week.staff || []) {
    if (!/roberto/i.test(String(st.staffKey || st.staffName || ""))) continue;
    for (const day of st.days || []) {
      const iso =
        String(day.sessionDate || "").slice(0, 10) || String(week.start);
      const before = (day.slots || []).length;
      day.slots = (day.slots || []).filter((s) => {
        if (/^zakariya$/i.test(String(s.client_name || "").trim())) {
          removed++;
          notes.push(`${iso} removed Zakariya ${s.time_slot}`);
          return false;
        }
        return true;
      });
      if (day.slots.length !== before) fixFadi(day, iso);
    }
  }
}

if (!removed && !fadiFixed) {
  console.log("noop — Roberto already has no Zakariya from 2026-07-13", {
    revision: prevRev,
  });
  process.exit(0);
}

const nextRev = prevRev + 1;
const put = await fetch(
  url +
    `/rest/v1/portal_madre_document?term_key=eq.summer-2026&revision=eq.${prevRev}`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      document: doc,
      revision: nextRev,
      updated_at: new Date().toISOString(),
      change_note: `Remove Roberto midweek Zakariya (${removed}); Fadi gap closed (${fadiFixed})`,
    }),
  }
);
const out = await put.json();
if (!put.ok || !out?.[0]) {
  console.error(put.status, out);
  process.exit(1);
}
console.log({ prevRev, nextRev: out[0].revision, removed, fadiFixed, notes });
