/**
 * Count real session dates from booking/invoice windows (TERM_DATE_WINDOWS),
 * same logic chips/invoices use — not school-week abstractions.
 *
 *   npx -y deno run --allow-read database/local-vault/office-count-booking-portal-sessions.ts
 */
import {
  collectTermSessionDates,
  slotYearSessionDates,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { SESSION_COUNTS } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const TERMS = ["autumn", "spring", "summer"] as const;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

console.log("Source: TERM_DATE_WINDOWS in portal_xero_product_catalog.ts");
console.log("(same date engine as booking portal chips / INV-P line dates)\n");
console.log("Autumn weekday start: 2026-09-05 (Sat) — club first week, not school Mon 1 Sep");
console.log("Summer weekday start: 2027-04-17 — not school Mon 12 Apr\n");

console.log("=== Sessions per day per term (actual dates) ===");
for (const day of DAYS) {
  const parts = TERMS.map((t) => {
    const dates = collectTermSessionDates(t, day);
    return `${t}=${dates.length}`;
  });
  const year = slotYearSessionDates(day);
  const eng =
    day === "Saturday" || day === "Sunday"
      ? SESSION_COUNTS.weekend
      : SESSION_COUNTS.weekday;
  const match = year.length === eng.annual ? "OK" : `engine=${eng.annual}`;
  console.log(
    `${day.padEnd(10)} ${parts.join("  ")}  YEAR=${year.length}  ${match}`,
  );
}

console.log("\n=== Tinashe (Mon + Wed) — exact dates ===");
for (const day of ["Monday", "Wednesday"] as const) {
  console.log(`\n${day}:`);
  for (const term of TERMS) {
    const dates = collectTermSessionDates(term, day);
    console.log(
      `  ${term} (${dates.length}): ${dates.map(iso).join(", ")}`,
    );
  }
}

const mon = slotYearSessionDates("Monday").length;
const wed = slotYearSessionDates("Wednesday").length;
console.log(`\nTinashe session units: Mon ${mon} + Wed ${wed} = ${mon + wed}`);
console.log(`At £345/session ( £690/week when both days): £${(mon + wed) * 345}`);
console.log(`At 38 × £690 package weeks: £${38 * 690}`);

console.log("\n=== Early May BH 2027-05-03 in Monday list? ===");
const monSummer = collectTermSessionDates("summer", "Monday").map(iso);
console.log("  included?", monSummer.includes("2027-05-03") ? "YES (should close)" : "NO (already excluded or outside window)");
console.log("  summer Mondays:", monSummer.join(", "));
console.log("\n=== Wed 2027-05-05 (same week as Early May BH)? ===");
const wedSummer = collectTermSessionDates("summer", "Wednesday").map(iso);
console.log("  included?", wedSummer.includes("2027-05-05") ? "YES" : "NO");
