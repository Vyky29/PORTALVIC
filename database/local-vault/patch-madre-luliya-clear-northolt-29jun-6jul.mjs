/**
 * Clear stale Northolt afternoon from Luliya's Madré column on days she only
 * worked Day Centre morning (feedbacks + timesheet + cancelled shadowing).
 *
 * 2026-06-29 — DC morning only; Northolt clients were Roberto (not Luliya).
 * 2026-07-06 — DC morning only; shadowing override cancelled; Northolt = Roberto/Dan.
 *
 * Moves those Northolt slots onto the staff who actually signed feedbacks,
 * then strips them from Luliya (keeps SwimFarm Day Centre).
 *
 *   node database/local-vault/patch-madre-luliya-clear-northolt-29jun-6jul.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const LOCAL_MADRE = path.join(root, "working_ui/portal/roster_term_master.json");

const env = fs.readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8");
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

/** @type {{ iso: string, weekStart: string, weekday: string, move: Record<string, string>, dropClientRe?: RegExp }} */
const DAYS = [
  {
    iso: "2026-06-29",
    weekStart: "2026-06-29",
    weekday: "Monday",
    // client -> destination staffKey
    move: {
      yunis: "roberto",
      gemma: "roberto",
      yamik: "roberto",
    },
    // Zayana cancelled that day (Dan slot_clear) — drop, do not rehome
    dropClientRe: /^zayana$/i,
  },
  {
    iso: "2026-07-06",
    weekStart: "2026-07-06",
    weekday: "Monday",
    move: {
      yunis: "roberto",
      yamik: "roberto",
      gemma: "dan",
    },
    dropClientRe: /^zayana$/i,
  },
];

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function staffList(week) {
  const s = week.staff;
  if (Array.isArray(s)) return s;
  return Object.values(s || {});
}

function findStaff(week, keys) {
  const want = keys.map((k) => String(k).toLowerCase());
  return staffList(week).find((s) => {
    const sk = String(s?.staffKey || "").toLowerCase();
    return want.includes(sk);
  });
}

function ensureDay(st, iso, weekday) {
  st.days = Array.isArray(st.days) ? st.days : [];
  let d = st.days.find((x) => String(x.sessionDate || "").slice(0, 10) === iso);
  if (d) {
    d.weekday = weekday;
    d.sessionDate = iso;
    d.slots = Array.isArray(d.slots) ? d.slots : [];
    return d;
  }
  d = { weekday, sessionDate: iso, slots: [] };
  st.days.push(d);
  return d;
}

function startMin(t) {
  const m = String(t || "")
    .toLowerCase()
    .replace(/:/g, ".")
    .match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if (!m) return 9999;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h >= 1 && h <= 8) h += 12;
  return h * 60 + mi;
}

function sortSlots(day) {
  day.slots.sort((a, b) => startMin(a.time_slot) - startMin(b.time_slot));
}

function isNortholtAfternoon(slot) {
  if (!/northolt/i.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  const client = norm(slot.client_name);
  if (/shadow/i.test(client) || /shadow/i.test(svc)) return true;
  if (svc && !/aquatic|swim|multi/i.test(svc)) return false;
  return startMin(slot.time_slot) >= 16 * 60;
}

function clientKey(name) {
  return norm(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function slotSig(s) {
  return [
    clientKey(s.client_name),
    norm(s.time_slot).toLowerCase().replace(/:/g, "."),
    norm(s.venue).toLowerCase(),
  ].join("|");
}

function instructorForDest(destKey) {
  if (destKey === "dan") return "DAN";
  if (destKey === "roberto") return "ROBERTO";
  return String(destKey || "").toUpperCase();
}

function patchDoc(doc) {
  const log = [];
  for (const spec of DAYS) {
    const week = (doc.weeks || []).find(
      (w) => String(w.start || "").slice(0, 10) === spec.weekStart,
    );
    if (!week) {
      // summer weeks sometimes start on Monday of that ISO
      const alt = (doc.weeks || []).find((w) => {
        const start = String(w.start || "").slice(0, 10);
        return start <= spec.iso && spec.iso <= addDays(start, 6);
      });
      if (!alt) {
        log.push(`${spec.iso}: WEEK MISSING`);
        continue;
      }
      Object.assign(spec, { _week: alt });
    }
    const weekObj =
      spec._week ||
      (doc.weeks || []).find(
        (w) => String(w.start || "").slice(0, 10) === spec.weekStart,
      );
    const lulia = findStaff(weekObj, ["lulia", "luliya"]);
    if (!lulia) {
      log.push(`${spec.iso}: Luliya staff missing`);
      continue;
    }
    const day = ensureDay(lulia, spec.iso, spec.weekday);
    const keep = [];
    const moved = [];
    const dropped = [];
    for (const slot of day.slots || []) {
      if (!isNortholtAfternoon(slot)) {
        keep.push(slot);
        continue;
      }
      const ck = clientKey(slot.client_name);
      if (spec.dropClientRe && spec.dropClientRe.test(norm(slot.client_name))) {
        dropped.push(`${slot.time_slot} ${slot.client_name}`);
        continue;
      }
      let destKey = null;
      for (const [nameFrag, staffKey] of Object.entries(spec.move)) {
        if (ck.includes(nameFrag)) {
          destKey = staffKey;
          break;
        }
      }
      if (!destKey) {
        // Unknown Northolt on her column — still strip from Luliya
        dropped.push(`${slot.time_slot} ${slot.client_name} (stripped, no rehome)`);
        continue;
      }
      const dest = findStaff(weekObj, [destKey]);
      if (!dest) {
        dropped.push(`${slot.time_slot} ${slot.client_name} (dest ${destKey} missing)`);
        continue;
      }
      const destDay = ensureDay(dest, spec.iso, spec.weekday);
      const clone = {
        ...slot,
        instructors: instructorForDest(destKey),
      };
      const sig = slotSig(clone);
      const exists = (destDay.slots || []).some((s) => slotSig(s) === sig);
      if (!exists) {
        destDay.slots.push(clone);
        sortSlots(destDay);
      }
      moved.push(
        `${slot.time_slot} ${slot.client_name} → ${destKey}${exists ? " (already)" : ""}`,
      );
    }
    day.slots = keep;
    sortSlots(day);

    // 6 Jul: Zayana cancelled and Gemma ran 5.30–6 with Dan (feedbacks).
    if (spec.iso === "2026-07-06") {
      const dan = findStaff(weekObj, ["dan"]);
      if (dan) {
        const danDay = ensureDay(dan, spec.iso, spec.weekday);
        const has530 = (danDay.slots || []).some(
          (s) =>
            /gemma/i.test(norm(s.client_name)) &&
            /5\.?30\s*to\s*6/i.test(norm(s.time_slot)),
        );
        if (!has530) {
          const g = (danDay.slots || []).find((s) =>
            /gemma/i.test(norm(s.client_name)),
          );
          danDay.slots.push({
            client_name: "Gemma",
            time_slot: "5.30 to 6",
            service: "Aquatic Activity",
            venue: "Northolt",
            area: g?.area || "",
            pool_note: g?.pool_note || "",
            instructors: "DAN",
            participant_info: g?.participant_info || "",
          });
          sortSlots(danDay);
          moved.push("5.30 to 6 Gemma → dan (from cancelled Zayana)");
        }
      }
    }

    log.push({
      iso: spec.iso,
      kept: keep.map((s) => `${s.time_slot} ${s.client_name} (${s.venue})`),
      moved,
      dropped,
    });
  }
  return log;
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const res = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at",
  { headers },
);
const rows = await res.json();
if (!Array.isArray(rows) || !rows[0]) throw new Error("madre missing");
const prevRev = Number(rows[0].revision) || 0;
const doc = structuredClone(rows[0].document);

const summary = patchDoc(doc);
console.log("portal patch preview:", JSON.stringify(summary, null, 2));

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
doc.meta.notes.push(
  `rev ${prevRev + 1}: Luliya 29 Jun + 6 Jul — strip Northolt afternoon (morning DC only); rehome slots to Roberto/Dan per feedbacks`,
);

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
    }),
  },
);
const out = await put.json();
if (!put.ok || !out?.[0]) {
  console.error(put.status, out);
  process.exit(1);
}
console.log("portal madre rev", prevRev, "→", nextRev);

if (fs.existsSync(LOCAL_MADRE)) {
  const local = JSON.parse(fs.readFileSync(LOCAL_MADRE, "utf8"));
  const localSummary = patchDoc(local);
  local.meta = local.meta || {};
  local.meta.notes = Array.isArray(local.meta.notes) ? local.meta.notes : [];
  local.meta.notes.push(
    `rev ${nextRev}: Luliya 29 Jun + 6 Jul — strip Northolt afternoon (morning DC only); rehome to Roberto/Dan`,
  );
  fs.writeFileSync(LOCAL_MADRE, JSON.stringify(local, null, 2) + "\n");
  console.log("local madre patched", JSON.stringify(localSummary, null, 2));
} else {
  console.log("skip local madre (file missing)");
}

// Verify
const check = await fetch(
  url +
    "/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=revision,document",
  { headers },
);
const [row] = await check.json();
for (const iso of ["2026-06-29", "2026-07-06"]) {
  console.log(`\n=== verify ${iso} ===`);
  for (const week of row.document.weeks || []) {
    for (const st of staffList(week)) {
      if (!st) continue;
      for (const day of st.days || []) {
        if (String(day.sessionDate || "").slice(0, 10) !== iso) continue;
        for (const slot of day.slots || []) {
          const sk = String(st.staffKey || "");
          if (/luli/i.test(sk) || /northolt/i.test(String(slot.venue || ""))) {
            if (/luli/i.test(sk) || /yunis|gemma|zayana|yamik/i.test(String(slot.client_name || ""))) {
              console.log(
                `  ${sk}: ${slot.client_name} | ${slot.time_slot} | ${slot.venue} | ${slot.instructors || ""}`,
              );
            }
          }
        }
      }
    }
  }
}
