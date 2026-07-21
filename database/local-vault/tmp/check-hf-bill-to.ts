import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveLaFunderBillTo } from "../../../supabase/functions/_shared/portal_invoice_funding.ts";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const cases = [
  { contactId: "354", displayName: "Adam Pilcher" },
  { contactId: "119", displayName: "Yassir Boujettif" },
  { contactId: "181", displayName: "Elijah Yared" },
  { contactId: "209", displayName: "Faris Lobinet" },
  { contactId: "186", displayName: "Stephanie Ng" },
  { contactId: "216", displayName: "Matthias Mekonnen" },
  { contactId: "396", displayName: "Simon Yohannes" },
  { contactId: "gap-saaib-abdullah", displayName: "Saaib Abdullah" },
  { contactId: "abodi", displayName: "Abodi Patel" },
];

for (const c of cases) {
  const bill = await resolveLaFunderBillTo(admin, c);
  console.log(
    JSON.stringify({
      name: c.displayName,
      profile: bill.profileKey,
      billTo: bill.name,
      pay: bill.paymentEmail,
      cc: bill.paymentCcEmail,
      addr: bill.lines.slice(0, 3).join(" · "),
    }),
  );
}
