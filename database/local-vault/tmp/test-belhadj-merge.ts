import {
  mergeWeeklySlotsFromRosterAndPayment,
  paymentRowToContext,
  parseServiceString,
  slotsFromPublishedSessions,
} from "../../../supabase/functions/_shared/reenrolment_catalog.ts";

const eijiSessions = [
  { day: "Sunday", area: "Wall", venue: "Westway", service: "Climbing Activity", timeSlot: "10 to 11", instructor: "ALEX", durationMin: 60 },
  { day: "Sunday", area: "Hub Room → Big Pool", venue: "SwimFarm", service: "Multi-Activity", timeSlot: "11 to 12.30", instructor: "GIUSEPPE", durationMin: 90 },
  { day: "Thursday", area: "Lane (DE)", venue: "Acton", service: "Aquatic Activity", timeSlot: "5.30 to 6.30", instructor: "SIMON", durationMin: 60 },
  { day: "Tuesday", area: "Lane (DE)", venue: "Acton", service: "Aquatic Activity", timeSlot: "5.30 to 6", instructor: "JAVIER", durationMin: 30 },
  { day: "Tuesday", area: "Lane (DE)", venue: "Acton", service: "Aquatic Activity", timeSlot: "6 to 6.30", instructor: "ROBERTO", durationMin: 30 },
];

const eijiPayment = {
  client_key: "eiji",
  client_name: "Eiji",
  parent_name: "Lea",
  payment_status: "Paid",
  sheet: "PARENTS",
  data: {
    "Client Name": "Eiji",
    "Services": "60’ SW (Tu&Th) 60' C (Sun) & 90' S&C (Sun)",
    "Cost": "100/100/70/120",
    "Sessions": "13/11/11",
    "Total": "4690",
  },
};

const ctx = paymentRowToContext(eijiPayment as unknown as Record<string, unknown>);
const pub = slotsFromPublishedSessions(eijiSessions).filter((s) => !s.isDayCentre);
const merged = mergeWeeklySlotsFromRosterAndPayment("Kacem Eiji BELHADJ", pub, ctx.weeklySlots, []);
console.log("=== Eiji merged");
let autumnKept = 0;
for (const s of merged) {
  console.log(`${s.serviceType} ${s.durationMin}' ${s.day} price=${s.pricePerSession} autumn=${s.termTotals.autumn}`);
}
// Mother kept Tue Aquatic + Sun Climbing + Sun Multi (withdrew Thursday)
for (const s of merged) {
  if (s.day === "Thursday") continue;
  autumnKept += s.termTotals.autumn;
}
console.log("Eiji autumn (kept slots):", autumnKept, "— expected 3235 to match Hazem");

console.log("\n=== Regression: other combined service strings");
const samples: Array<[string, string]> = [
  ["adam-p", "90' Aquatic (Mon) + 90' Aquatic (Fri)"],
  ["yassir", "60' Aquatic (Tue) / 30' Aquatic (Thu)"],
  ["cyrus", "90' FF (Thu), 30' SW (Wed), 90' S&C (Wed), 90' S&C (Sun)"],
  ["scott", "90' S&C (Wed), 60' CL (Sun)"],
  ["zakariya", "30’ SW & 60’ CL (Su)"],
  ["ayman", "30' SW (Tu) 30' SW (Thu)"],
  ["rodin", "60’ CL & 30' SW(Su)"],
  ["zaid", "90’ S&C & 60’ CL (Su)"],
];
for (const [key, svc] of samples) {
  const slots = parseServiceString(svc);
  console.log(
    key,
    "→",
    slots.map((s) => `${s.serviceType}|${s.durationMin}'|${s.day || "?"}|£${s.pricePerSession}`).join("  "),
  );
}
