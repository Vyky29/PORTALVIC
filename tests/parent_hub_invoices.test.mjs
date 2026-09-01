/**
 * Parent hub — Invoices shortcut and the 2026/27 term place chip.
 *
 * Renders the real hub through ParentPortalParticipant.render in jsdom and asserts
 * against the resulting DOM. Guards three rules that were each broken in Aug 2026:
 *
 *   1. The Invoices shortcut turns red whenever the family owes money — including
 *      children whose 2026/27 place is not re-enrolled (the invoice fetch used to sit
 *      behind an early return, so it never ran for them).
 *   2. An LA / NHS office-billed term keeps a plain "Re-enrolled" chip. An unpaid
 *      parent-pay extra (crash course billed to the family) is chased on Invoices and
 *      must not make the term place look unpaid.
 *   3. A term invoice raised by the office counts as a confirmed place, so the hub
 *      cannot demand payment and call the same place "not confirmed".
 *
 *   npm run test:parent-hub
 *
 * Set PP_SRC to point at another copy of the script (e.g. one extracted from an older
 * commit with `git show`) to compare behaviour before and after a change.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const SRC = process.env.PP_SRC ||
  fileURLToPath(new URL("../working_ui/portal/parent_portal_participant.js", import.meta.url));

function invoice(over) {
  return {
    payment_status: "unpaid",
    payment_method_hint: "bank_transfer",
    can_setup_gocardless: false,
    payment_schedule: [],
    amount_paid_gbp: 0,
    ...over,
  };
}

/** Unpaid crash course plus the unpaid Autumn first half. */
const CRASH_AND_TERM = [
  invoice({
    invoice_number: "INV-P-CRASH-EXAMPLE",
    title: "Summer crash course Jul 2026",
    reference_text: "Summer crash course Jul 2026",
    line_description: "Summer crash course Jul 2026",
    due_date: "2026-07-15",
    amount_gbp: 300,
  }),
  invoice({
    invoice_number: "INV-P-0346",
    title: "Autumn term 26/27",
    billing_term: "Autumn",
    reference_text: "Autumn term 26/27",
    due_date: "2026-08-15",
    next_instalment_due: "2026-08-15",
    amount_gbp: 975,
    payment_schedule: [
      { seq: 1, due_date: "2026-08-15", amount_gbp: 487.5, status: "pending" },
      { seq: 2, due_date: "2026-10-26", amount_gbp: 487.5, status: "pending" },
    ],
  }),
];

const CRASH_ONLY_UNPAID = [
  invoice({
    invoice_number: "INV-P-0119",
    title: "Summer crash course Jul 2026",
    reference_text: "Summer crash course Jul 2026",
    line_description: "Summer crash course Jul 2026",
    due_date: "2026-07-15",
    amount_gbp: 125,
  }),
];

const CRASH_ONLY_PAID = [
  invoice({
    invoice_number: "INV-P-0119",
    title: "Summer crash course Jul 2026",
    reference_text: "Summer crash course Jul 2026",
    payment_status: "paid",
    due_date: "2026-07-15",
    amount_gbp: 125,
  }),
];

function participant(over) {
  return {
    ok: true,
    participant: {
      contact_id: "test-1",
      display_name: "Test Child",
      first_name: "Test",
      last_name: "Child",
      date_of_birth: "2014-05-12",
    },
    services_detail: [],
    sessions: [],
    messages: [],
    documents: [],
    consents: [],
    photos: [],
    absences: [],
    weekly_notes: [],
    crash_course: { dates: [], week_ids: [], awaiting_payment: false, booking_statuses: [] },
    ...over,
  };
}

/** Private place, 2026/27 form never submitted. */
function notReenrolled(reenrolOver) {
  return participant({
    participant: {
      contact_id: "7559001",
      display_name: "Patrick Example",
      first_name: "Patrick",
      last_name: "Example",
      date_of_birth: "2014-05-12",
    },
    reenrolment: {
      submitted: false,
      continuing: false,
      not_continuing: false,
      parent_action: "required",
      parent_action_reasons: [],
      show_invoices: true,
      ...reenrolOver,
    },
    show_invoices: true,
    can_book_extras: true,
  });
}

/** LA (Ealing) + NHS place: office invoices the funder, so the term renews itself. */
function officeBilledLaNhs() {
  return participant({
    participant: {
      contact_id: "gap-tinashe-icloud",
      display_name: "Tinashe Example",
      first_name: "Tinashe",
      last_name: "Example",
      date_of_birth: "2009-11-03",
    },
    reenrolment: {
      submitted: false,
      continuing: false,
      not_continuing: false,
      parent_action: "auto",
      parent_action_reasons: ["la_funded"],
      show_invoices: true,
    },
    show_invoices: true,
    can_book_extras: false,
  });
}

async function renderHub(data, invoices) {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url: "https://www.clubsensational.org/parent",
  });
  const { window } = dom;
  const script = window.document.createElement("script");
  script.textContent = readFileSync(SRC, "utf8");
  window.document.body.appendChild(script);
  if (!window.ParentPortalParticipant) throw new Error("ParentPortalParticipant not exported");

  const host = window.document.getElementById("host");
  let listInvoicesCalls = 0;
  /* render() writes _hub* flags onto data, so every case gets its own deep copy. */
  window.ParentPortalParticipant.render(host, JSON.parse(JSON.stringify(data)), {
    listInvoices: () => {
      listInvoicesCalls += 1;
      return Promise.resolve({ ok: true, invoices, receipts: [], show_invoices: true });
    },
  });
  await new Promise((r) => setTimeout(r, 50));

  const tile = host.querySelector('.pp-hub-shortcut--invoices[data-pp-open="invoices"]');
  const chip = host.querySelector("[data-pp-hub-reenrol-chip]");
  const block = host.querySelector('[data-pp-term-chips="this"]');
  return {
    listInvoicesCalls,
    tileExists: !!tile,
    tileRed: !!(tile && tile.classList.contains("pp-hub-shortcut--invoices-unpaid")),
    tileAria: tile ? tile.getAttribute("aria-label") : null,
    chipText: chip ? chip.textContent.replace(/\s+/g, " ").trim() : null,
    blockClass: block ? block.className : "",
  };
}

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

console.log("=== Not re-enrolled, crash + Autumn both unpaid ===");
const a = await renderHub(notReenrolled(), CRASH_AND_TERM);
check("invoices are fetched even though the place is not confirmed", a.listInvoicesCalls, 1);
check("Invoices tile is present", a.tileExists, true);
check("Invoices tile is red", a.tileRed, true);
check("aria-label flags unpaid", a.tileAria, "Invoices — unpaid invoices");
check("term block stays not confirmed", a.blockClass.includes("pp-hub-term-block--unconfirmed"), true);
check("no misleading Re-enrolled chip", a.chipText, null);

console.log("\n=== Not re-enrolled, nothing owed ===");
const b = await renderHub(notReenrolled(), []);
check("tile is not red", b.tileRed, false);
check("term block stays not confirmed", b.blockClass.includes("pp-hub-term-block--unconfirmed"), true);
check("no chip", b.chipText, null);

console.log("\n=== Office raised the Autumn 26/27 invoice (no parent form) ===");
const c = await renderHub(notReenrolled({ office_term_invoice: true }), CRASH_AND_TERM);
check("Invoices tile is red", c.tileRed, true);
check("chip reads Re-enrolled (unpaid)", c.chipText, "\u2713Re-enrolled (unpaid)");
check("term block is unpaid orange", c.blockClass.includes("pp-hub-term-block--unpaid"), true);
check("term block is no longer unconfirmed", c.blockClass.includes("unconfirmed"), false);

console.log("\n=== LA / NHS office-billed term, crash course unpaid ===");
const d = await renderHub(officeBilledLaNhs(), CRASH_ONLY_UNPAID);
check("Invoices tile is present", d.tileExists, true);
check("Invoices tile is red", d.tileRed, true);
check("chip is plain Re-enrolled", d.chipText, "\u2713Re-enrolled");
check("term block is settled", d.blockClass.includes("pp-hub-term-block--settled"), true);

console.log("\n=== LA / NHS office-billed term, crash course paid ===");
const e = await renderHub(officeBilledLaNhs(), CRASH_ONLY_PAID);
check("tile is not red", e.tileRed, false);
check("chip is plain Re-enrolled", e.chipText, "\u2713Re-enrolled");

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
