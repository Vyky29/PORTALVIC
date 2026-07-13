/**
 * Prune live MADRE: remove staff days whose sessionDate falls outside their
 * parent week [start,end]. Those stale copies caused flatten to emit
 * conflicting Today cards for ANY staff (not just Michelle).
 *
 * Runtime flatten now also skips them; this cleans the source document.
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
let removed = 0;
const samples = [];

(doc.weeks || []).forEach((w, wi) => {
  const start = String(w.start || "").slice(0, 10);
  const end = String(w.end || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return;
  }
  Object.values(w.staff || {}).forEach((st) => {
    const before = Array.isArray(st.days) ? st.days.length : 0;
    st.days = (st.days || []).filter((d) => {
      const iso = String(d.sessionDate || d.session_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true;
      const ok = iso >= start && iso <= end;
      if (!ok) {
        removed += 1;
        if (samples.length < 25) {
          samples.push(
            `week${wi} ${start}…${end} ${st.staffKey || st.staffName}: drop ${iso}`
          );
        }
      }
      return ok;
    });
    if ((st.days || []).length !== before) {
      /* keep */
    }
  });
});

console.log("out-of-range days to remove:", removed);
samples.forEach((s) => console.log(" ", s));
if (!removed) {
  console.log("Nothing to prune.");
  process.exit(0);
}

const patch = await fetch(
  url + "/rest/v1/portal_madre_document?term_key=eq.summer-2026",
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      document: doc,
      revision: prevRev + 1,
      updated_at: new Date().toISOString(),
    }),
  }
);
const body = await patch.text();
if (!patch.ok) {
  console.error(patch.status, body);
  process.exit(1);
}
console.log("OK revision", prevRev, "→", prevRev + 1, "removed", removed);
