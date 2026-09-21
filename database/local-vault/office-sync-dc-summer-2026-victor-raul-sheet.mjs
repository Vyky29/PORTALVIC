/**
 * Sync LA Day Centre Summer 2026 payment rows to Victor/Raul spreadsheet
 * (green = paid, orange = unpaid). Clients: Fadi, Ikram, Timi, Emanuel.
 * Uplift stays on aggregate row nhs-inflation-uplift-jul2026 (not per-child amount).
 *
 *   node database/local-vault/office-sync-dc-summer-2026-victor-raul-sheet.mjs
 *   APPLY=1 node database/local-vault/office-sync-dc-summer-2026-victor-raul-sheet.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve("local-secrets/secrets.env"));
loadEnv(resolve("database/local-vault/private/parent-portal-secrets.env"));

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function money(n) {
  return Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sheet totals (DC + transport where listed). Uplift excluded — aggregate row. */
const SHEET = {
  fadi: {
    apr: 9712.5,
    may: 9712.5,
    jun: 12950,
    julUnpaid: 9712.5,
    julPaid0384: 6475,
    invPaid: "0335 (Apr) · 1659 (May) · 0384 (Jul £6,475)",
    invUnpaid: "0360 (Jun) · 0361 (Jul £9,712.50)",
  },
  ikram: {
    mar: 3850 + 760,
    apr: 9300 + 1600 + 1368.6,
    may: 7150 + 1100,
    jun: 10400 + 1600,
    jul: 13000 + 2000,
    inv: "0342 Mar · 0343/0357 Apr · 0354 May · 0355 Jun · 0356 Jul (+ transport lines)",
  },
  timi: {
    apr: 250,
    may: 750,
    jun: 3150,
    jul: 3150,
    inv: "0388 Apr · 0387 May · 0386 Jun · 0385 Jul",
  },
  emanuel: {
    jun: 3500,
    jul: 7500,
    invPaid: "0359 (Jul)",
    invUnpaid: "0358 (Jun)",
  },
};

const fadiFace =
  SHEET.fadi.apr +
  SHEET.fadi.may +
  SHEET.fadi.jun +
  SHEET.fadi.julUnpaid +
  SHEET.fadi.julPaid0384;
const fadiOut = SHEET.fadi.jun + SHEET.fadi.julUnpaid;
const fadiPaid = SHEET.fadi.apr + SHEET.fadi.may + SHEET.fadi.julPaid0384;

const ikramFace =
  SHEET.ikram.mar + SHEET.ikram.apr + SHEET.ikram.may + SHEET.ikram.jun + SHEET.ikram.jul;

const timiFace = SHEET.timi.apr + SHEET.timi.may + SHEET.timi.jun + SHEET.timi.jul;

const updates = [
  {
    client_key: "fadi",
    matchTerm: /summer/i,
    amount: fadiFace,
    payment_status: "Partial",
    patchData: (d) => ({
      ...d,
      Term: "Summer term 2026",
      Invoice: `Paid Inv ${SHEET.fadi.invPaid} · unpaid Inv ${SHEET.fadi.invUnpaid}`,
      "Payment status": "Partial",
      "April invoice (25/26)": SHEET.fadi.apr,
      "April paid (25/26)": SHEET.fadi.apr,
      "May invoice (25/26)": SHEET.fadi.may,
      "May paid (25/26)": SHEET.fadi.may,
      "June invoice (25/26)": SHEET.fadi.jun,
      "July invoice (25/26)": SHEET.fadi.julUnpaid,
      "July paid Inv 0384 (25/26)": SHEET.fadi.julPaid0384,
      "April–May invoices (25/26)": SHEET.fadi.apr + SHEET.fadi.may,
      "NHS due months":
        `Apr £${money(SHEET.fadi.apr)} paid · May £${money(SHEET.fadi.may)} paid · `
        + `Jun £${money(SHEET.fadi.jun)} unpaid · Jul Inv 0384 £${money(SHEET.fadi.julPaid0384)} paid · `
        + `Jul Inv 0361 £${money(SHEET.fadi.julUnpaid)} unpaid`,
      "Summer basis":
        `Apr £${money(SHEET.fadi.apr)} paid (0335) · May £${money(SHEET.fadi.may)} paid (1659) · `
        + `Jun £${money(SHEET.fadi.jun)} unpaid (0360) · Jul Inv 0384 £${money(SHEET.fadi.julPaid0384)} paid · `
        + `Jul Inv 0361 £${money(SHEET.fadi.julUnpaid)} unpaid · face £${money(fadiFace)} · `
        + `outstanding £${money(fadiOut)} (uplift INV-0389/0361 on NHS uplift row)`,
      Next:
        `Summer 25/26 NHS: paid £${money(fadiPaid)} · still due Jun+Jul Inv 0361 = £${money(fadiOut)} `
        + `(Victor/Raul sheet)`,
      "Year outstanding": `£${money(fadiOut)}`,
      "Sheet sync": "Victor/Raul Day Centre Summer 2026 · 2026-09-02",
    }),
  },
  {
    client_key: "ikram-omar",
    matchTerm: /summer/i,
    amount: ikramFace,
    payment_status: "Outstanding",
    patchData: (d) => ({
      ...d,
      Term: "Summer term 2026",
      Invoice: SHEET.ikram.inv,
      "Payment status": "Outstanding",
      "March invoice (25/26)": SHEET.ikram.mar,
      "April invoice (25/26)": SHEET.ikram.apr,
      "May invoice (25/26)": SHEET.ikram.may,
      "June invoice (25/26)": SHEET.ikram.jun,
      "July invoice (25/26)": SHEET.ikram.jul,
      "April–May invoices (25/26)": SHEET.ikram.apr + SHEET.ikram.may,
      Extras:
        `Mar DC+transport £${money(SHEET.ikram.mar)} · Apr DC+transport £${money(SHEET.ikram.apr)} `
        + `(incl Inv 0357 £1,368.60) · May–Jul DC+transport`,
      "NHS due months":
        `Mar £${money(SHEET.ikram.mar)} unpaid · Apr £${money(SHEET.ikram.apr)} unpaid · `
        + `May £${money(SHEET.ikram.may)} unpaid · Jun £${money(SHEET.ikram.jun)} unpaid · `
        + `Jul £${money(SHEET.ikram.jul)} unpaid`,
      "Summer basis":
        `Mar £${money(SHEET.ikram.mar)} + Apr £${money(SHEET.ikram.apr)} + May £${money(SHEET.ikram.may)} `
        + `+ Jun £${money(SHEET.ikram.jun)} + Jul £${money(SHEET.ikram.jul)} = £${money(ikramFace)} `
        + `(DC + transport; uplift INV-0390 on NHS uplift row)`,
      Sessions: "Mar–Jul outstanding · DC + transport per Victor/Raul sheet",
      Next: `Yr 25/26 NHS due Mar–Jul: £${money(ikramFace)} · all unpaid (Victor/Raul sheet)`,
      "Year billed (25/26)": `£${money(ikramFace)}`,
      "Year received (25/26)": "£0",
      "Year outstanding": `£${money(ikramFace)}`,
      "Sheet sync": "Victor/Raul Day Centre Summer 2026 · 2026-09-02",
    }),
  },
  {
    client_key: "timi",
    matchTerm: /summer/i,
    amount: timiFace,
    payment_status: "Outstanding",
    patchData: (d) => ({
      ...d,
      Term: "SUMMER TERM 25/26",
      Invoice: SHEET.timi.inv,
      "Payment status": "Outstanding",
      Extras: `Apr £${money(SHEET.timi.apr)} + May £${money(SHEET.timi.may)} · + Jun/Jul day centre`,
      "April invoice (25/26)": SHEET.timi.apr,
      "May invoice (25/26)": SHEET.timi.may,
      "June invoice (25/26)": SHEET.timi.jun,
      "July invoice (25/26)": SHEET.timi.jul,
      "April–May invoices (25/26)": SHEET.timi.apr + SHEET.timi.may,
      "NHS due months":
        `Apr £${money(SHEET.timi.apr)} unpaid · May £${money(SHEET.timi.may)} unpaid · `
        + `Jun £${money(SHEET.timi.jun)} unpaid · Jul £${money(SHEET.timi.jul)} unpaid`,
      "Summer basis":
        `Apr £${money(SHEET.timi.apr)} (0388) + May £${money(SHEET.timi.may)} (0387) + `
        + `Jun £${money(SHEET.timi.jun)} (0386) + Jul £${money(SHEET.timi.jul)} (0385) = £${money(timiFace)} `
        + `(uplift INV-0392 on NHS uplift row)`,
      Sessions: "Mon & Fri · 11–1 · Apr–Jul invoices per Victor/Raul sheet",
      Next: `Summer 25/26: £${money(timiFace)} all unpaid · Inv ${SHEET.timi.inv}`,
      "Year billed (25/26)": `£${money(timiFace)}`,
      "Year received (25/26)": "£0",
      "Year outstanding": `£${money(timiFace)}`,
      "Sheet sync": "Victor/Raul Day Centre Summer 2026 · 2026-09-02",
    }),
  },
  {
    client_key: "emanuel",
    matchTerm: /summer/i,
    amount: SHEET.emanuel.jun + SHEET.emanuel.jul,
    payment_status: "Partial",
    patchData: (d) => ({
      ...d,
      Term: "Summer term 2026",
      Invoice: `Inv ${SHEET.emanuel.invUnpaid} unpaid · Inv ${SHEET.emanuel.invPaid} paid (portal INV-P-0128/0129)`,
      "Payment status": "Partial",
      "June invoice (25/26)": SHEET.emanuel.jun,
      "July invoice (25/26)": SHEET.emanuel.jul,
      "June invoice no": "Inv 0358 / INV-P-0128",
      "July invoice no": "Inv 0359 / INV-P-0129",
      "NHS due months":
        `Jun £${money(SHEET.emanuel.jun)} unpaid · Jul £${money(SHEET.emanuel.jul)} PAID`,
      "Summer basis":
        `Jun £${money(SHEET.emanuel.jun)} (Inv 0358) unpaid + Jul £${money(SHEET.emanuel.jul)} (Inv 0359) paid = £${money(SHEET.emanuel.jun + SHEET.emanuel.jul)}`,
      Next:
        `Summer 25/26 NHS: Jul Inv 0359 £${money(SHEET.emanuel.jul)} paid · Jun Inv 0358 £${money(SHEET.emanuel.jun)} still due`,
      "Year billed (25/26)": `£${money(SHEET.emanuel.jun + SHEET.emanuel.jul)}`,
      "Year received (25/26)": `£${money(SHEET.emanuel.jul)}`,
      "Year outstanding": `£${money(SHEET.emanuel.jun)}`,
      "Sheet sync": "Victor/Raul Day Centre Summer 2026 · 2026-09-02",
    }),
  },
];

const { data: rows, error } = await sb
  .from("client_payments")
  .select("id, client_key, client_name, amount, payment_status, data")
  .eq("sheet", "LA")
  .in("client_key", ["fadi", "ikram-omar", "timi", "emanuel"]);

if (error) {
  console.error(error);
  process.exit(1);
}

console.log("Mode:", APPLY ? "APPLY" : "DRY-RUN");
console.log("Sheet targets:", {
  fadiFace,
  fadiPaid,
  fadiOut,
  ikramFace,
  timiFace,
  emanuelFace: SHEET.emanuel.jun + SHEET.emanuel.jul,
});

for (const u of updates) {
  const candidates = (rows || []).filter((r) => r.client_key === u.client_key);
  const row = candidates.find((r) => u.matchTerm.test(String(r.data?.Term || r.data?.term || "")))
    || candidates.find((r) => /summer/i.test(JSON.stringify(r.data || {})))
    || null;
  if (!row) {
    console.error("MISSING row", u.client_key);
    continue;
  }
  const nextData = u.patchData(row.data || {});
  console.log("\n---", row.client_name, row.id);
  console.log("  before:", row.amount, row.payment_status);
  console.log("  after: ", u.amount, u.payment_status);
  console.log("  outstanding hint:", nextData["Year outstanding"]);
  if (!APPLY) continue;
  const { error: upErr } = await sb
    .from("client_payments")
    .update({
      amount: u.amount,
      payment_status: u.payment_status,
      data: nextData,
    })
    .eq("id", row.id);
  if (upErr) console.error("UPDATE FAIL", row.id, upErr);
  else console.log("  UPDATED");
}

/* Uplift aggregate: note Fadi sheet Inv 0361 == portal INV-0389 */
const { data: uplift } = await sb
  .from("client_payments")
  .select("id, amount, data")
  .eq("sheet", "LA")
  .eq("client_key", "nhs-inflation-uplift-jul2026")
  .maybeSingle();

if (uplift) {
  const d = { ...(uplift.data || {}) };
  d.Next =
    "Outstanding NHS uplift INV-0389–0392 · Fadi sheet lists uplift on Inv 0361 (£985.81 = INV-0389) · "
    + "bill-to NHS North West London ICB";
  d["Sheet sync"] = "Victor/Raul Day Centre Summer 2026 · 2026-09-02";
  d["Office owed note"] =
    "Aggregate NHS Day Centre inflation uplift — base DC/transport on Fadi/Ikram/Timi/Emanuel rows; "
    + "Fadi uplift amount matches sheet Inv 0361";
  console.log("\n--- uplift row", uplift.id, "£" + uplift.amount);
  if (APPLY) {
    const { error: uErr } = await sb
      .from("client_payments")
      .update({ data: d })
      .eq("id", uplift.id);
    if (uErr) console.error("UPLIFT FAIL", uErr);
    else console.log("  UPDATED notes");
  }
}

console.log(APPLY ? "\nDone." : "\nDry-run only. Re-run with APPLY=1 to write.");
