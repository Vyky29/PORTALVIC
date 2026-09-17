// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-office-operator
// Phase-1 office operator tools (read-only + confirm-gated PIN reveal).
// No free-form writes (covers, invoices, day offs) yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { mandateIsActive } from "../_shared/gocardless_portal.ts";

type ToolName =
  | "catalog"
  | "list_pending_mandates"
  | "lookup_family_access";

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function invoiceLooksOpen(row: Record<string, unknown>): boolean {
  const status = clean(row.payment_status, 40).toLowerCase();
  if (status === "paid" || status === "settled" || status === "complete") return false;
  const amount = Number(row.amount_gbp || 0);
  const paid = Number(row.amount_paid_gbp || 0);
  if (amount > 0 && paid >= amount - 0.01) return false;
  return true;
}

function catalogPayload() {
  return {
    ok: true,
    tool: "catalog",
    tools: [
      {
        id: "list_pending_mandates",
        title: "List Direct Payment mandates still to authorise",
        read_only: true,
        how: "Ask: who has not authorised Direct Payment / mandate?",
      },
      {
        id: "lookup_family_access",
        title: "Find parent portal access (PIN after Confirm)",
        read_only: true,
        confirm_required: true,
        how: "Ask: parent portal PIN for [child or parent name]. Confirm reveal before PIN shows.",
      },
      {
        id: "guide_answer",
        title: "Office help guide answer (client-side)",
        read_only: true,
        how: "Any how-to question — answered from admin_office_help.json in the browser.",
      },
    ],
    never_alone: [
      "Schedule & Covers writes",
      "day offs / COVER",
      "mark paid / create invoices",
      "WhatsApp send without a human",
    ],
  };
}

async function listPendingMandates(supabase: ReturnType<typeof createClient>) {
  const { data: shares, error: shareErr } = await supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, contact_id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_method_hint, billing_term, due_date, updated_at",
    )
    .eq("payment_method_hint", "gocardless")
    .limit(3000);

  if (shareErr) {
    console.error("[office-operator] shares", shareErr.message);
    return portalAdminJson(500, { ok: false, error: "shares_failed" });
  }

  const openShares = (shares || []).filter((r) => invoiceLooksOpen(r as Record<string, unknown>));
  const contactIds = Array.from(
    new Set(openShares.map((r) => clean(r.contact_id, 80)).filter(Boolean)),
  );

  if (!contactIds.length) {
    return portalAdminJson(200, {
      ok: true,
      tool: "list_pending_mandates",
      count: 0,
      families: [],
      script_hint:
        "No open Direct Payment invoices found that still need a mandate. If a family still sees Set up Direct Payment, check their parent portal invoice card.",
    });
  }

  const { data: mandates, error: manErr } = await supabase
    .from("portal_parent_gocardless_mandates")
    .select(
      "contact_id, parent_person_id, mandate_status, gocardless_mandate_id, authorisation_url, updated_at",
    )
    .in("contact_id", contactIds);

  if (manErr) {
    console.error("[office-operator] mandates", manErr.message);
    return portalAdminJson(500, { ok: false, error: "mandates_failed" });
  }

  const mandateByContact = new Map<string, Record<string, unknown>>();
  for (const m of mandates || []) {
    mandateByContact.set(clean(m.contact_id, 80), m as Record<string, unknown>);
  }

  const { data: contacts, error: contactErr } = await supabase
    .from("portal_parent_contacts")
    .select(
      "contact_id, parent_person_id, parent_display, parent_first_name, parent_last_name, child_display, child_first_name, email, mobile",
    )
    .in("contact_id", contactIds);

  if (contactErr) {
    console.error("[office-operator] contacts", contactErr.message);
    return portalAdminJson(500, { ok: false, error: "contacts_failed" });
  }

  const contactById = new Map<string, Record<string, unknown>>();
  for (const c of contacts || []) {
    contactById.set(clean(c.contact_id, 80), c as Record<string, unknown>);
  }

  const byParent = new Map<
    string,
    {
      parent_person_id: string;
      parent: string;
      email: string;
      mobile: string;
      children: string[];
      invoices: string[];
      mandate_status: string;
      has_authorisation_url: boolean;
    }
  >();

  for (const share of openShares) {
    const cid = clean(share.contact_id, 80);
    const man = mandateByContact.get(cid);
    const status = clean(man?.mandate_status, 40) || (man ? "unknown" : "missing");
    if (mandateIsActive(status) && clean(man?.gocardless_mandate_id, 80)) {
      continue;
    }
    const contact = contactById.get(cid) || {};
    const pid =
      clean(contact.parent_person_id, 80) ||
      clean(man?.parent_person_id, 80) ||
      cid;
    const parent =
      clean(contact.parent_display, 120) ||
      `${clean(contact.parent_first_name, 40)} ${clean(contact.parent_last_name, 40)}`.trim() ||
      pid;
    const child =
      clean(contact.child_display, 120) ||
      clean(contact.child_first_name, 40) ||
      "Child";
    if (!byParent.has(pid)) {
      byParent.set(pid, {
        parent_person_id: pid,
        parent,
        email: clean(contact.email, 120),
        mobile: clean(contact.mobile, 40),
        children: [],
        invoices: [],
        mandate_status: status,
        has_authorisation_url: !!clean(man?.authorisation_url, 20),
      });
    }
    const row = byParent.get(pid)!;
    if (child && !row.children.includes(child)) row.children.push(child);
    const inv = clean(share.invoice_number, 40) || clean(share.id, 12);
    if (inv && !row.invoices.includes(inv)) row.invoices.push(inv);
    // Prefer non-active status detail
    if (!mandateIsActive(status)) row.mandate_status = status;
  }

  const families = Array.from(byParent.values()).sort((a, b) =>
    a.parent.localeCompare(b.parent),
  );

  return portalAdminJson(200, {
    ok: true,
    tool: "list_pending_mandates",
    count: families.length,
    families: families.map((f) => ({
      parent_person_id: f.parent_person_id,
      parent: f.parent,
      children: f.children,
      email: f.email,
      mobile: f.mobile,
      invoices: f.invoices,
      mandate_status: f.mandate_status,
      has_authorisation_url: f.has_authorisation_url,
    })),
    phone_script: {
      title: "Phone script — authorise Direct Payment",
      steps: [
        "Open Parent portal: https://www.clubsensational.org/parent and sign in (PIN / email).",
        "Open the child / invoices / payment area.",
        "Tap the blinking red Set up Direct Payment button.",
        "Complete GoCardless bank authorisation.",
        "Confirm the portal shows Direct Payment set up.",
      ],
      note: "Office cannot authorise the bank mandate for them.",
    },
  });
}

async function lookupFamilyAccess(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const query = clean(body.query || body.q || body.name, 80);
  const confirm = body.confirm === true || body.confirm === "true" || body.confirm === 1;
  const parentId = clean(body.parent_person_id, 80);

  if (confirm && parentId) {
    const { data: cred, error: credErr } = await supabase
      .from("portal_parent_portal_credentials")
      .select("parent_person_id, pin_display, changed_by_parent, updated_at")
      .eq("parent_person_id", parentId)
      .maybeSingle();
    if (credErr) {
      console.error("[office-operator] pin", credErr.message);
      return portalAdminJson(500, { ok: false, error: "pin_failed" });
    }
    if (!cred) {
      return portalAdminJson(404, {
        ok: false,
        error: "no_pin",
        message: "No parent portal PIN on file for that family.",
      });
    }
    const { data: contacts } = await supabase
      .from("portal_parent_contacts")
      .select(
        "parent_person_id, parent_display, child_display, child_first_name, email, mobile",
      )
      .eq("parent_person_id", parentId)
      .limit(20);
    const kids = Array.from(
      new Set(
        (contacts || [])
          .map((c) => clean(c.child_display, 80) || clean(c.child_first_name, 40))
          .filter(Boolean),
      ),
    );
    const parent =
      clean(contacts?.[0]?.parent_display, 120) || parentId;
    const loginNames = kids
      .map((k) => k.split(/\s+/)[0])
      .filter(Boolean)
      .join(" / ");
    return portalAdminJson(200, {
      ok: true,
      tool: "lookup_family_access",
      confirmed: true,
      family: {
        parent_person_id: parentId,
        parent,
        children: kids,
        login_names: loginNames,
        email: clean(contacts?.[0]?.email, 120),
        mobile: clean(contacts?.[0]?.mobile, 40),
        pin: clean(cred.pin_display, 20),
        changed_by_parent: !!cred.changed_by_parent,
        portal_url: "https://www.clubsensational.org/parent",
      },
      whatsapp_hint:
        "Parent portal: https://www.clubsensational.org/parent — use child first name + PIN to sign in. Then open invoices and tap Set up Direct Payment if still needed.",
    });
  }

  if (!query || query.length < 2) {
    return portalAdminJson(400, {
      ok: false,
      error: "query_required",
      message: "Type a child or parent name to look up access.",
    });
  }

  const qn = norm(query);
  const { data: contacts, error: contactErr } = await supabase
    .from("portal_parent_contacts")
    .select(
      "parent_person_id, parent_display, parent_first_name, parent_last_name, child_display, child_first_name, email, mobile",
    )
    .limit(5000);
  if (contactErr) {
    console.error("[office-operator] contact search", contactErr.message);
    return portalAdminJson(500, { ok: false, error: "contacts_failed" });
  }

  const scored = new Map<
    string,
    { parent_person_id: string; parent: string; children: string[]; email: string; mobile: string; score: number }
  >();

  for (const c of contacts || []) {
    const pid = clean(c.parent_person_id, 80);
    if (!pid) continue;
    const parent =
      clean(c.parent_display, 120) ||
      `${clean(c.parent_first_name, 40)} ${clean(c.parent_last_name, 40)}`.trim();
    const child = clean(c.child_display, 120) || clean(c.child_first_name, 40);
    const blob = norm([parent, child, clean(c.email, 80), clean(c.mobile, 40)].join(" "));
    if (!blob.includes(qn) && !qn.split(" ").every((t) => t.length < 2 || blob.includes(t))) {
      continue;
    }
    let score = 0;
    if (norm(child).includes(qn) || norm(parent).includes(qn)) score += 10;
    qn.split(" ").forEach((t) => {
      if (t.length > 1 && blob.includes(t)) score += 3;
    });
    if (!scored.has(pid)) {
      scored.set(pid, {
        parent_person_id: pid,
        parent,
        children: [],
        email: clean(c.email, 120),
        mobile: clean(c.mobile, 40),
        score,
      });
    }
    const row = scored.get(pid)!;
    row.score = Math.max(row.score, score);
    if (child && !row.children.includes(child)) row.children.push(child);
  }

  const matches = Array.from(scored.values())
    .sort((a, b) => b.score - a.score || a.parent.localeCompare(b.parent))
    .slice(0, 8)
    .map((m) => ({
      parent_person_id: m.parent_person_id,
      parent: m.parent,
      children: m.children,
      email: m.email,
      mobile: m.mobile,
      pin_revealed: false,
    }));

  return portalAdminJson(200, {
    ok: true,
    tool: "lookup_family_access",
    confirmed: false,
    query,
    count: matches.length,
    matches,
    confirm_required: true,
    confirm_message:
      "PIN is hidden until you Confirm reveal for one family. Office copies PIN for WhatsApp — there is no automatic resend.",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) || {};
  } catch (_) {
    body = {};
  }

  const tool = clean(body.tool || body.action || "catalog", 60) as ToolName;

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return portalAdminJson(500, { ok: false, error: "config" });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (tool === "catalog" || tool === "tools") {
    return portalAdminJson(200, catalogPayload());
  }
  if (tool === "list_pending_mandates") {
    return await listPendingMandates(supabase);
  }
  if (tool === "lookup_family_access") {
    return await lookupFamilyAccess(supabase, body);
  }

  return portalAdminJson(400, {
    ok: false,
    error: "unknown_tool",
    message: "Unknown tool. Call tool=catalog for the allow-list.",
  });
});
