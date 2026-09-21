/**
 * Smoke: Overview staffing board contracts (Office duty + expand seats).
 *
 *   npx -y deno run -A database/local-vault/smoke-overview-board-contracts-20260917.ts
 */
import { existsSync, readFileSync } from "node:fs";
import standingOccupants from "../../supabase/functions/_shared/portal_capacity_chain_standing_occupants.json" with {
  type: "json",
};

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  const line = (pass ? "OK  " : "FAIL") + "  " + label + (detail ? " — " + detail : "");
  console.log(line);
  if (!pass) fails.push(label + (detail ? ": " + detail : ""));
}

const hub = readFileSync("working_ui/portal/admin-sessions-hub.js", "utf8");

ok("hub defines isOverviewExpandableSeat", hub.includes("function isOverviewExpandableSeat"));
ok(
  "hub expand uses isOverviewExpandableSeat (not client-only gate)",
  /if \(!isOverviewExpandableSeat\(r\.client_name\)\) continue/.test(hub),
);
ok(
  "hub expandable includes staff_duty",
  /function isOverviewExpandableSeat[\s\S]{0,220}k === "staff_duty"/.test(hub),
);
ok(
  "hub paints OFFICE name-text on duty cards",
  /dutyLow === "office"[\s\S]{0,40}dutyDisp = "OFFICE"/.test(hub),
);
ok(
  "hub still excludes duty from feedback dayStats",
  hub.includes("slotIsStaffDutyNoFeedback") &&
    /slotIncludedInDayStats[\s\S]{0,200}slotIsStaffDutyNoFeedback/.test(hub),
);

/* Michelle Fri Office 1-3 in capacity / fadi-off or dated Fri board */
{
  const by = (standingOccupants as { bySlotId?: Record<string, unknown> }).bySlotId || {};
  const friKeys = Object.keys(by).filter((k) => /day_centre.*friday/i.test(k));
  let foundOffice = false;
  for (const k of friKeys) {
    const slot = by[k] as { seatLines?: Array<{ instructor?: string; client?: string }> };
    for (const line of slot.seatLines || []) {
      if (
        /michelle/i.test(String(line.instructor || "")) &&
        /office/i.test(String(line.client || ""))
      ) {
        foundOffice = true;
      }
    }
  }
  ok(
    "capacity has Michelle Office seat on a Friday DC board",
    foundOffice,
    "friKeys=" + friKeys.length,
  );
}

/* Canonical Acton Tue: Reggie on Luliya */
{
  const canon = readFileSync("working_ui/portal/portal_roster_canonical.js", "utf8");
  ok(
    "canonical Tue board seats Reggie on LULIYA 4.30",
    /staff:\s*"LULIYA"[\s\S]{0,120}Reggie Conlon[\s\S]{0,80}4\.30 to 5/.test(canon),
  );
  ok(
    "canonical starts Reggie from 2026-09-22",
    /"Reggie Conlon":\s*"2026-09-22"/.test(canon) || /Reggie Conlon": "2026-09-22"/.test(canon),
  );
}

if (fails.length) {
  console.log("\nSMOKE FAIL (" + fails.length + ")");
  for (const f of fails) console.log(" - " + f);
  Deno.exit(1);
}
console.log("\nSMOKE PASS");
