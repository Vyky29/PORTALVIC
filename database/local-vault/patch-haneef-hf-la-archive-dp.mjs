/**
 * Haneef Yusuf → LA Hammersmith & Fulham only.
 * - portal_parent_contacts: funding_label / payment_method_label
 * - archive DIRECT_PAYMENTS client_payments row (resolver must use LA sheet)
 *
 *   node database/local-vault/patch-haneef-hf-la-archive-dp.mjs
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(
  "/Users/victor/cursor/PORTALVIC/local-secrets/secrets.env",
  "utf8",
);
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const sb = createClient(
  get("SUPABASE_URL") || get("PORTAL_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY") || get("PORTAL_SUPABASE_SERVICE_ROLE_KEY"),
);

const CONTACT_ID = "126";
const DP_ID = "ba22622f-870c-4164-8f5a-9a552a08b48c";
const LA_ID = "26de2b63-9554-4108-a122-96d0a98067ed";
const now = new Date().toISOString();

const { data: beforeContact, error: cErr } = await sb
  .from("portal_parent_contacts")
  .select("contact_id, child_display, funding_label, payment_method_label, updated_at")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (cErr) throw cErr;

const { data: beforeDp } = await sb
  .from("client_payments")
  .select("*")
  .eq("id", DP_ID)
  .maybeSingle();
const { data: beforeLa } = await sb
  .from("client_payments")
  .select("id,sheet,client_name,parent_name,payment_status,data")
  .eq("id", LA_ID)
  .maybeSingle();

const { data: contactUp, error: upErr } = await sb
  .from("portal_parent_contacts")
  .update({
    funding_label: "Local authority · H&F",
    payment_method_label: "LA invoice (BACS)",
    updated_at: now,
  })
  .eq("contact_id", CONTACT_ID)
  .select("contact_id, child_display, funding_label, payment_method_label, updated_at")
  .maybeSingle();
if (upErr) throw upErr;

const dpData = {
  ...(beforeDp?.data || {}),
  _archived_at: now,
  _archived_reason:
    "Haneef now LA-managed Hammersmith & Fulham (invoice BACS). Direct Payments row retired so funding resolver uses LA sheet only.",
  _archived_from_sheet: "DIRECT_PAYMENTS",
};

const { data: dpUp, error: dpErr } = await sb
  .from("client_payments")
  .update({
    sheet: "ARCHIVED_DIRECT_PAYMENTS",
    data: dpData,
  })
  .eq("id", DP_ID)
  .select("id, sheet, client_name, parent_name, payment_status")
  .maybeSingle();
if (dpErr) throw dpErr;

const laData = {
  ...(beforeLa?.data || {}),
  Services: "Multi-Activity",
  Funding: "Local authority · H&F",
  Funder: "H&F (Hammersmith & Fulham)",
  "Funding origin": "LA-funded",
  Payer: "Local authority / NHS (pays direct)",
  "Payment method": "LA invoice (BACS)",
  VAT: "Exempt",
  "Client Id": "2396503",
  "Client ID": "2396503",
  PO: "9005711782",
  po: "9005711782",
  "Client Name": "Haneef Yusuf",
};

const { data: laUp, error: laErr } = await sb
  .from("client_payments")
  .update({
    client_name: "Haneef Yusuf",
    parent_name: "H&F · Sabrosa",
    data: laData,
  })
  .eq("id", LA_ID)
  .select("id, sheet, client_name, parent_name, payment_status, data")
  .maybeSingle();
if (laErr) throw laErr;

const { data: verifyPays } = await sb
  .from("client_payments")
  .select("id, sheet, client_name, parent_name, payment_status")
  .or("client_name.ilike.%haneef%,client_key.eq.haneef");

console.log(
  JSON.stringify(
    {
      contact_before: beforeContact,
      contact_after: contactUp,
      dp_before: {
        id: beforeDp?.id,
        sheet: beforeDp?.sheet,
        status: beforeDp?.payment_status,
      },
      dp_after: dpUp,
      la_after: {
        id: laUp?.id,
        sheet: laUp?.sheet,
        client: laUp?.client_name,
        parent: laUp?.parent_name,
        Funding: laUp?.data?.Funding,
        Funder: laUp?.data?.Funder,
        method: laUp?.data?.["Payment method"],
        PO: laUp?.data?.PO,
      },
      all_haneef_payment_rows: verifyPays,
    },
    null,
    2,
  ),
);
