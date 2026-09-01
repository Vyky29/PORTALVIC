/**
 * Crash Jul 2026 bill-to fixes:
 *  - Adam Pilcher (INV-P-0001): H&F Adult ASC
 *  - Saaib Abdullah (INV-P-0127): H&F Children's Services
 *  - Tinashe Nekati (INV-P-0119): mother Pat Nekati + home address (not LA Ealing / NHS)
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-crash-billto-adam-saaib-tinashe.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { resolveLaFunderBillTo } from "../../supabase/functions/_shared/portal_invoice_funding.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const jobs = [
  {
    invoice: "INV-P-0001",
    contactId: "354",
    name: "Adam Pilcher",
    expectProfile: "hf_adult_asc",
    paymentMethodHint: "la_funded" as const,
    notes:
      "Office crash course · Aquatic 90' · 2 days @ £150 = £300 · Summer crash Jul 2026 · Afterschool & Weekends. · Bill-to: H&F Adult ASC (Adam 18+).",
  },
  {
    invoice: "INV-P-0127",
    contactId: "gap-saaib-abdullah",
    name: "Saaib Abdullah",
    expectProfile: "hf_children",
    paymentMethodHint: "la_funded" as const,
    notes:
      "Office crash course · Aquatic 30' · 1 day · 2× sessions @ £50 · Summer crash Jul 2026 · Afterschool & Weekends. · Bill-to: H&F Children's Services.",
  },
  {
    invoice: "INV-P-0119",
    contactId: "gap-tinashe-icloud",
    name: "Tinashe Nekati",
    expectProfile: null as string | null,
    paymentMethodHint: "bank_transfer" as const,
    notes:
      "Office crash course · SwimFarm aquatic 30' · Mon 27 / Wed 29 / Fri 31 Jul 2026 · 1pm–1.30pm · £62.50/session · Bill-to: Pat Nekati (parent address) — not LA Ealing / NHS.",
  },
];

for (const job of jobs) {
  const { data: share } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, payment_method_hint, vat_mode, notes, share_status")
    .eq("invoice_number", job.invoice)
    .eq("contact_id", job.contactId)
    .maybeSingle();
  if (!share) {
    console.error("MISSING", job.invoice, job.name);
    continue;
  }

  if (job.expectProfile) {
    const bill = await resolveLaFunderBillTo(admin, {
      contactId: job.contactId,
      displayName: job.name,
    });
    console.log(
      job.name,
      "→ resolve",
      bill.profileKey,
      "|",
      bill.name,
      "|",
      bill.lines.slice(0, 3).join(" · "),
    );
    if (bill.profileKey !== job.expectProfile) {
      console.error("  EXPECTED", job.expectProfile, "GOT", bill.profileKey);
      Deno.exit(1);
    }
  } else {
    const { data: c } = await admin
      .from("portal_parent_contacts")
      .select("parent_display, address_line1, city, postcode")
      .eq("contact_id", job.contactId)
      .maybeSingle();
    console.log(
      job.name,
      "→ parent bill-to",
      c?.parent_display,
      "|",
      [c?.address_line1, c?.city, c?.postcode].filter(Boolean).join(", "),
    );
  }

  console.log(
    `  ${share.invoice_number}: hint ${share.payment_method_hint} → ${job.paymentMethodHint}; share ${share.share_status}`,
  );

  if (!APPLY) continue;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_method_hint: job.paymentMethodHint,
      notes: job.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) {
    console.error(upErr);
    Deno.exit(1);
  }

  const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log("  regen", regen);
}

if (!APPLY) {
  console.log("\nDry run — re-run with APPLY=1");
}
