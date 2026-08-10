/**
 * Monday aquatic standing:
 *   Acton  → Roberto + Youssef (Angel's Acton Mon clients → Roberto; Angel off)
 *   Northolt → Luliya + Dan (Roberto's Northolt Mon clients → Luliya; Roberto off Northolt Mon)
 *
 *   node database/local-vault/patch-madre-monday-acton-roberto-youssef-northolt-luliya-dan.mjs
 */
import fs from "fs";

const env = fs.readFileSync(
  "/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env",
  "utf8",
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

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function findStaff(week, keys) {
  const wants = (Array.isArray(keys) ? keys : [keys]).map((k) =>
    String(k).toLowerCase(),
  );
  return Object.values(week.staff || {}).find((s) =>
    wants.includes(String(s.staffKey || "").toLowerCase()),
  );
}

function ensureStaff(week, key, name) {
  let st = findStaff(week, key);
  if (st) return st;
  const staffKey = String(key).toLowerCase();
  week.staff = week.staff || {};
  st = { staffKey, staffName: name, name, days: [] };
  week.staff[staffKey] = st;
  return st;
}

function ensureDay(st, iso, weekday) {
  let d = (st.days || []).find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  if (d) return d;
  d = { weekday, sessionDate: iso, slots: [] };
  st.days = st.days || [];
  st.days.push(d);
  return d;
}

function sortSlots(day) {
  const rank = (t) => {
    const m = String(t || "")
      .toLowerCase()
      .match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 8) h += 12;
    return h * 60 + mi;
  };
  day.slots.sort((a, b) => rank(a.time_slot) - rank(b.time_slot));
}

function isMonAquaticAt(day, slot, venueRe) {
  if (norm(day.weekday) !== "Monday") return false;
  const iso = norm(day.sessionDate).slice(0, 10);
  if (!iso) return false;
  if (!venueRe.test(norm(slot.venue))) return false;
  const svc = norm(slot.service);
  if (svc && !/aquatic|swim/i.test(svc)) return false;
  // Drop pure shadowing blocks when transferring swimming seats.
  if (/shadow/i.test(norm(slot.client_name))) return false;
  return true;
}

function cloneSlot(slot) {
  return JSON.parse(JSON.stringify(slot));
}

function transferDaySlots(fromSt, toSt, venueRe, label) {
  const moved = [];
  if (!fromSt) return moved;
  const keepDays = [];
  for (const day of fromSt.days || []) {
    const iso = norm(day.sessionDate).slice(0, 10);
    const wd = norm(day.weekday);
    const keep = [];
    const transfer = [];
    for (const slot of day.slots || []) {
      if (isMonAquaticAt(day, slot, venueRe)) transfer.push(slot);
      else keep.push(slot);
    }
    if (!transfer.length) {
      keepDays.push(day);
      continue;
    }
    const toDay = ensureDay(toSt, iso, wd || "Monday");
    // Clear existing aquatic at this venue on that Monday for target (avoid dup opens).
    toDay.slots = (toDay.slots || []).filter((s) => {
      if (!venueRe.test(norm(s.venue))) return true;
      const svc = norm(s.service);
      if (svc && !/aquatic|swim/i.test(svc)) return true;
      if (/shadow/i.test(norm(s.client_name))) return false; // drop shadowing placeholder
      return false;
    });
    for (const slot of transfer) {
      const c = cloneSlot(slot);
      if (!norm(c.service)) c.service = "Aquatic Activity";
      toDay.slots.push(c);
      moved.push(`${label} ${iso} ${c.time_slot} ${c.client_name}`);
    }
    sortSlots(toDay);
    if (keep.length) {
      day.slots = keep;
      keepDays.push(day);
    }
  }
  fromSt.days = keepDays;
  return moved;
}

function dropEmptyStaff(week, key) {
  const st = findStaff(week, key);
  if (!st) return;
  if ((st.days || []).some((d) => (d.slots || []).length)) return;
  for (const [k, s] of Object.entries(week.staff || {})) {
    if (String(s.staffKey || "").toLowerCase() === String(key).toLowerCase()) {
      delete week.staff[k];
    }
  }
}

function patchWeek(week) {
  const angel = findStaff(week, "angel");
  const roberto = ensureStaff(week, "roberto", "Roberto");
  const youssef = findStaff(week, "youssef");
  const dan = findStaff(week, "dan");
  const existingLuliya = findStaff(week, ["luliya", "lulia"]);
  const luliya = ensureStaff(
    week,
    (existingLuliya && existingLuliya.staffKey) || "lulia",
    "Luliya",
  );

  const moved = [];
  // 1) Angel Mon Acton aquatic → Roberto Acton
  moved.push(...transferDaySlots(angel, roberto, /acton/i, "Angel→Roberto Acton"));
  // 2) Roberto Mon Northolt aquatic → Luliya Northolt
  moved.push(
    ...transferDaySlots(roberto, luliya, /northolt/i, "Roberto→Luliya Northolt"),
  );

  dropEmptyStaff(week, "angel");

  return {
    week: `${week.start || "?"}–${week.end || "?"}`,
    moved,
    hasYoussef: !!youssef,
    hasDan: !!dan,
  };
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

const summaries = [];
for (const week of doc.weeks || []) {
  const s = patchWeek(week);
  if (s.moved.length) summaries.push(s);
}

if (!summaries.length) {
  console.log("Nothing to patch.");
  process.exit(0);
}

doc.meta = doc.meta || {};
doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
const note = `rev ${prevRev + 1}: Mon Acton Roberto+Youssef (Angel→Roberto); Mon Northolt Luliya+Dan (Roberto→Luliya)`;
doc.meta.notes.push(note);

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

// Cancel Angel Mon Acton open templates if any (exact instructor match)
const rrHeaders = {
  apikey: key,
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const angelTpl = await fetch(
  url +
    "/rest/v1/portal_roster_rows?instructors=eq.ANGEL&day=eq.Monday&venue=ilike.*Acton*&status=eq.active&select=id,time_slot,client_name",
  { headers: rrHeaders },
).then((r) => r.json());
if (Array.isArray(angelTpl) && angelTpl.length) {
  const ids = angelTpl.map((r) => r.id);
  const c = await fetch(url + `/rest/v1/portal_roster_rows?id=in.(${ids.join(",")})`, {
    method: "PATCH",
    headers: rrHeaders,
    body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
  });
  console.log("cancelled Angel Mon Acton templates", c.status, await c.json());
}

console.log(
  JSON.stringify(
    {
      prevRev,
      nextRev: out[0].revision,
      weeksPatched: summaries.length,
      movedTotal: summaries.reduce((n, s) => n + s.moved.length, 0),
      sample: summaries.slice(-2),
    },
    null,
    2,
  ),
);
