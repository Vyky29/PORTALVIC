/**
 * Count green session days from After-Schools calendar HTML vs SESSION_COUNTS
 * and Ealing year INV-P line quantities.
 *
 *   npx -y deno run --allow-read --allow-env --allow-net \
 *     database/local-vault/office-ealing-calendar-session-audit.ts
 */
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.49/deno-dom-wasm.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SESSION_COUNTS } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const HTML_PATH = "working_ui/portal/day-centre-calendar-2026-27-section.html";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type DayName = (typeof DAYS)[number];
type TermId = "autumn" | "spring" | "summer";

function emptyCounts(): Record<DayName, number> {
  return {
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
    Sunday: 0,
  };
}

function parseSessionsPanel(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("parse_failed");
  const panel = doc.querySelector("#dcCalSessionsPanel");
  if (!panel) throw new Error("dcCalSessionsPanel missing");

  const terms = panel.querySelectorAll("article.dc-cal-term");
  const byTerm: Record<TermId, Record<DayName, number>> = {
    autumn: emptyCounts(),
    spring: emptyCounts(),
    summer: emptyCounts(),
  };
  const redByTerm: Record<TermId, Array<{ month: string; day: number; weekday: DayName }>> = {
    autumn: [],
    spring: [],
    summer: [],
  };
  const termIds: TermId[] = ["autumn", "spring", "summer"];
  const weekLabels: string[] = [];

  terms.forEach((article, ti) => {
    const termId = termIds[ti];
    if (!termId) return;
    const weeksEl = article.querySelector(".dc-cal-term__weeks");
    weekLabels.push(String(weeksEl?.textContent || "").replace(/\s+/g, " ").trim());

    article.querySelectorAll(".dc-cal-month").forEach((monthEl) => {
      const month = String(monthEl.querySelector(".dc-cal-month__label")?.textContent || "").trim();
      const cells = [...monthEl.querySelectorAll(".dc-cal-grid > .dc-cal-cell")];
      // First non-empty cell's index in Mon-first grid → weekday
      let col = 0;
      for (const cell of cells) {
        const cls = String(cell.getAttribute("class") || "");
        if (cls.includes("dc-cal-cell--empty")) {
          col += 1;
          continue;
        }
        const dayNum = Number(cell.querySelector(".dc-cal-day")?.textContent || "");
        const weekday = DAYS[col % 7];
        if (cls.includes("dc-cal-cell--green")) {
          byTerm[termId][weekday] += 1;
        } else if (cls.includes("dc-cal-cell--red") && Number.isFinite(dayNum) && dayNum > 0) {
          redByTerm[termId].push({ month, day: dayNum, weekday });
        }
        col += 1;
      }
    });
  });

  return { byTerm, redByTerm, weekLabels };
}

const html = Deno.readTextFileSync(HTML_PATH);
const { byTerm, redByTerm, weekLabels } = parseSessionsPanel(html);

console.log("=== Calendar HTML week labels (School Services) ===");
weekLabels.forEach((w, i) => console.log(["autumn", "spring", "summer"][i] + ":", w));

console.log("\n=== SESSION_COUNTS constants (invoice engine) ===");
console.log("weekday", SESSION_COUNTS.weekday);
console.log("weekend", SESSION_COUNTS.weekend);

console.log("\n=== Green days counted from After-Schools calendar HTML ===");
const annual = emptyCounts();
for (const term of ["autumn", "spring", "summer"] as TermId[]) {
  const row = byTerm[term];
  console.log(
    term,
    DAYS.map((d) => `${d.slice(0, 3)}=${row[d]}`).join(" "),
  );
  for (const d of DAYS) annual[d] += row[d];
}
console.log(
  "ANNUAL",
  DAYS.map((d) => `${d.slice(0, 3)}=${annual[d]}`).join(" "),
);

console.log("\n=== Red weekday cells inside term months (closures / BH / half-term) ===");
for (const term of ["autumn", "spring", "summer"] as TermId[]) {
  const reds = redByTerm[term].filter((r) => !["Saturday", "Sunday"].includes(r.weekday));
  console.log(term, "weekday reds:", reds.length);
  for (const r of reds) {
    console.log(`  ${r.weekday} ${r.day} ${r.month}`);
  }
}

console.log("\n=== Compare Mon/Wed (Tinashe) calendar vs SESSION_COUNTS.weekday ===");
for (const d of ["Monday", "Wednesday"] as DayName[]) {
  const cal = {
    autumn: byTerm.autumn[d],
    spring: byTerm.spring[d],
    summer: byTerm.summer[d],
    annual: annual[d],
  };
  const eng = SESSION_COUNTS.weekday;
  const ok =
    cal.autumn === eng.autumn &&
    cal.spring === eng.spring &&
    cal.summer === eng.summer &&
    cal.annual === eng.annual;
  console.log(
    d,
    `calendar ${cal.autumn}/${cal.spring}/${cal.summer}=${cal.annual}`,
    `engine ${eng.autumn}/${eng.spring}/${eng.summer}=${eng.annual}`,
    ok ? "MATCH" : "MISMATCH",
  );
}

// Cross-check Ealing INV-P quantities
const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, amount_gbp, line_items, ready_by, contact_id")
  .ilike("ready_by", "%ealing_year%")
  .eq("share_status", "ready")
  .neq("payment_status", "void");
if (error) throw error;

const contactIds = [...new Set((shares || []).map((s) => String(s.contact_id || "")).filter(Boolean))];
const nameBy = new Map<string, string>();
if (contactIds.length) {
  const { data: contacts } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, child_display, child_first_name, child_last_name")
    .in("contact_id", contactIds);
  for (const c of contacts || []) {
    const name =
      String(c.child_display || "").trim() ||
      [c.child_first_name, c.child_last_name].filter(Boolean).join(" ");
    if (c.contact_id) nameBy.set(String(c.contact_id), name);
  }
}

console.log("\n=== Ealing INV-P session qty vs calendar (by weekday in line detail) ===");
for (const share of shares || []) {
  const name = nameBy.get(String(share.contact_id || "")) || share.ready_by;
  const lines = Array.isArray(share.line_items) ? share.line_items : [];
  console.log(`\n${share.invoice_number} · ${name} · £${share.amount_gbp}`);
  let totalQty = 0;
  for (const li of lines as Array<Record<string, unknown>>) {
    const detail = String(li.detail || "");
    const desc = String(li.description || "");
    const qty = Number(li.quantity) || 0;
    totalQty += qty;
    const dayMatch = detail.match(
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
    );
    const day = dayMatch ? (dayMatch[1] as DayName) : null;
    const calAnnual = day ? annual[day] : null;
    const flag =
      day && calAnnual != null && qty !== calAnnual && qty !== Math.round(calAnnual / 3)
        ? // qty is per-term line, not annual — detect term bucket by comparing
          ""
        : "";
    // Each line is one term; match against term counts
    let termHint = "?";
    if (day) {
      if (qty === byTerm.autumn[day]) termHint = "autumn";
      else if (qty === byTerm.spring[day]) termHint = "spring";
      else if (qty === byTerm.summer[day]) termHint = "summer";
      else if (qty === SESSION_COUNTS.weekday.autumn && !["Saturday", "Sunday"].includes(day)) {
        termHint = "autumn(engine)";
      } else if (qty === SESSION_COUNTS.weekday.spring && !["Saturday", "Sunday"].includes(day)) {
        termHint = "spring(engine)";
      } else if (qty === SESSION_COUNTS.weekday.summer && !["Saturday", "Sunday"].includes(day)) {
        termHint = "summer(engine)";
      } else if (qty === SESSION_COUNTS.weekend.autumn) termHint = "autumn(weekend-engine)";
      else if (qty === SESSION_COUNTS.weekend.spring) termHint = "spring(weekend-engine)";
      else if (qty === SESSION_COUNTS.weekend.summer) termHint = "summer(weekend-engine)";
      else termHint = `NO_MATCH calA${byTerm.autumn[day]}/S${byTerm.spring[day]}/U${byTerm.summer[day]}`;
    }
    console.log(
      `  x${qty} ${desc} (${detail}) → ${termHint}${flag}`,
    );
  }
  console.log(`  TOTAL qty units=${totalQty}`);
}
