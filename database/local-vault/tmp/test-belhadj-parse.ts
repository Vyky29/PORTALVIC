import { paymentRowToContext } from "../../../supabase/functions/_shared/reenrolment_catalog.ts";

const eiji = {
  client_key: "eiji",
  client_name: "Eiji",
  parent_name: "Lea",
  payment_status: "Paid",
  amount: "4690.00",
  sheet: "PARENTS",
  data: {
    "Client Name": "Eiji",
    "Parent": "Lea",
    "Payment Method": "Own Way (upfront)",
    "Services": "60’ SW (Tu&Th) 60' C (Sun) & 90' S&C (Sun)",
    "Cost": "100/100/70/120",
    "Sessions": "13/11/11",
    "Total": "4690",
    "VAT": "EXCEMP",
  },
};

const hazem = {
  client_key: "hazem",
  client_name: "Hazem",
  parent_name: "Lea",
  payment_status: "Paid",
  amount: "4690.00",
  sheet: "DIRECT_PAYMENTS",
  data: {
    "Services": "60' Aquatic Activity (Sunday)",
    "Cost / session": "100",
    "Cost": "100/100/70/120",
    "Total": "4690",
    "VAT": "Exempt",
    "Client Name": "Hazem",
    "Parent": "Lea",
  },
};

for (const row of [eiji, hazem]) {
  const ctx = paymentRowToContext(row as unknown as Record<string, unknown>);
  console.log("=== ", row.client_name);
  for (const s of ctx.weeklySlots) {
    console.log(
      `${s.serviceType} ${s.durationMin}' ${s.day} price=${s.pricePerSession} autumn=${s.termTotals.autumn}`,
    );
  }
}
