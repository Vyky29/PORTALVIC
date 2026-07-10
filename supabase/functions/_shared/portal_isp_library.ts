// @ts-nocheck — Edge Function shared helpers for ISP behaviour/strategy library.

export type IspServiceTag =
  | "all"
  | "swimming"
  | "climbing"
  | "fitness"
  | "outing"
  | "indoor";

export function cleanIsp(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

export function riskLevelIsp(v: unknown): "high" | "medium" | "low" {
  const s = cleanIsp(v, 20).toLowerCase();
  if (s === "high" || s === "low") return s;
  return "medium";
}

/** Map activity / service labels → ISP service tags. */
export function activitiesToServiceTags(activities: unknown): string[] {
  const tags = new Set<string>();
  const list = Array.isArray(activities)
    ? activities
    : String(activities || "")
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  for (const raw of list) {
    const k = String(raw || "").toLowerCase().replace(/[_-]+/g, " ").trim();
    if (!k) continue;
    if (
      k.includes("swim") ||
      k.includes("aquatic") ||
      k.includes("pool") ||
      k === "multi activity" ||
      k === "multiactivity"
    ) {
      tags.add("swimming");
    }
    if (k.includes("climb")) tags.add("climbing");
    if (k.includes("fitness") || k.includes("gym")) tags.add("fitness");
    if (
      k.includes("outing") ||
      k.includes("community") ||
      k.includes("trip") ||
      k.includes("offsite") ||
      k.includes("off site") ||
      k.includes("external visit") ||
      k.includes("educational visit")
    ) {
      tags.add("outing");
    }
    if (k.includes("indoor") || k.includes("day centre") || k.includes("daycenter")) {
      tags.add("indoor");
    }
  }
  return Array.from(tags);
}

/** Library row applies if tagged `all` (or empty) or intersects participant service tags. */
export function libraryMatchesServices(
  itemTags: unknown,
  participantTags: string[],
): boolean {
  const tags = Array.isArray(itemTags)
    ? itemTags.map((t) => String(t || "").toLowerCase()).filter(Boolean)
    : [];
  if (!tags.length || tags.includes("all")) return true;
  const have = new Set((participantTags || []).map((t) => String(t).toLowerCase()));
  return tags.some((t) => have.has(t));
}

function slugCode(label: string, prefix: string): string {
  const base = cleanIsp(label, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "custom";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${base}_${suffix}`.slice(0, 80);
}

type AdminClient = {
  from: (table: string) => any;
};

/** Ensure active plan exists; sync non-customized general rows from library by services. */
export async function ensureParticipantSupportPlan(
  admin: AdminClient,
  opts: {
    participantName: string;
    participantContactId?: string | null;
    services?: unknown;
    userId?: string | null;
    userName?: string | null;
  },
) {
  const name = cleanIsp(opts.participantName, 200);
  if (!name) throw new Error("participant_name_required");
  const contactId = cleanIsp(opts.participantContactId, 120) || null;
  const serviceTags = activitiesToServiceTags(opts.services);
  const now = new Date().toISOString();
  const byName = cleanIsp(opts.userName, 120) || "Staff";

  let plan: Record<string, unknown> | null = null;
  if (contactId) {
    const { data } = await admin
      .from("portal_support_plans")
      .select("*")
      .eq("status", "active")
      .eq("participant_contact_id", contactId)
      .limit(1)
      .maybeSingle();
    plan = data || null;
  }
  if (!plan) {
    const { data } = await admin
      .from("portal_support_plans")
      .select("*")
      .eq("status", "active")
      .ilike("participant_name", name)
      .limit(1)
      .maybeSingle();
    plan = data || null;
  }
  if (!plan) {
    const { data, error } = await admin
      .from("portal_support_plans")
      .insert({
        participant_name: name,
        participant_contact_id: contactId,
        status: "active",
        activated_at: now,
        activated_by: opts.userId || null,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    plan = data;
  } else if (contactId && !plan.participant_contact_id) {
    await admin
      .from("portal_support_plans")
      .update({ participant_contact_id: contactId, updated_at: now })
      .eq("id", plan.id);
    plan = { ...plan, participant_contact_id: contactId };
  }

  await syncGeneralPlanItems(admin, {
    planId: String(plan!.id),
    serviceTags,
    userId: opts.userId || null,
    userName: byName,
  });

  const { data: items } = await admin
    .from("portal_support_plan_items")
    .select("*")
    .eq("plan_id", plan!.id)
    .order("sort_order", { ascending: true });

  return {
    plan,
    items: items || [],
    service_tags: serviceTags,
  };
}

async function syncGeneralPlanItems(
  admin: AdminClient,
  opts: {
    planId: string;
    serviceTags: string[];
    userId: string | null;
    userName: string;
  },
) {
  const now = new Date().toISOString();
  const { data: behaviours } = await admin
    .from("portal_isp_behaviour_library")
    .select("*")
    .eq("is_active", true)
    .eq("scope", "general")
    .order("sort_order", { ascending: true });
  const { data: strategies } = await admin
    .from("portal_isp_strategy_library")
    .select("*")
    .eq("is_active", true)
    .eq("scope", "general")
    .order("sort_order", { ascending: true });

  const matching = (behaviours || []).filter((b: Record<string, unknown>) =>
    libraryMatchesServices(b.service_tags, opts.serviceTags)
  );
  const matchIds = new Set(matching.map((b: Record<string, unknown>) => String(b.id)));

  const { data: existing } = await admin
    .from("portal_support_plan_items")
    .select("*")
    .eq("plan_id", opts.planId);

  const byBehLib = new Map<string, Record<string, unknown>>();
  for (const row of existing || []) {
    if (row.behaviour_library_id) {
      byBehLib.set(String(row.behaviour_library_id), row);
    }
  }

  // Drop non-customized generals that no longer match services
  for (const row of existing || []) {
    if (String(row.item_scope || "") !== "general") continue;
    if (row.is_customized === true) continue;
    const libId = row.behaviour_library_id ? String(row.behaviour_library_id) : "";
    if (libId && !matchIds.has(libId)) {
      await admin
        .from("portal_support_plan_items")
        .update({
          item_status: "no_longer_required",
          updated_at: now,
          last_updated_at: now,
        })
        .eq("id", row.id);
    }
  }

  let sortBase = (existing || []).length;
  for (const b of matching) {
    const bid = String(b.id);
    const already = byBehLib.get(bid);
    if (already) {
      // Reactivate if previously filtered out and not customized
      if (
        already.is_customized !== true &&
        String(already.item_status) === "no_longer_required"
      ) {
        await admin
          .from("portal_support_plan_items")
          .update({
            item_status: "active",
            updated_at: now,
            last_updated_at: now,
          })
          .eq("id", already.id);
      }
      continue;
    }

    const strat = (strategies || []).find((s: Record<string, unknown>) => {
      const codes = Array.isArray(s.behaviour_codes) ? s.behaviour_codes : [];
      return codes.includes(b.code) &&
        libraryMatchesServices(s.service_tags, opts.serviceTags);
    }) || (strategies || []).find((s: Record<string, unknown>) => {
      const codes = Array.isArray(s.behaviour_codes) ? s.behaviour_codes : [];
      return codes.includes(b.code);
    });

    await admin.from("portal_support_plan_items").insert({
      plan_id: opts.planId,
      sort_order: sortBase++,
      risk_behaviour: cleanIsp(b.label, 500),
      strategy_in_place: cleanIsp(strat?.body || strat?.label || "", 2000),
      risk_level: riskLevelIsp(b.default_risk_level),
      behaviour_library_id: b.id,
      strategy_library_id: strat?.id || null,
      item_scope: "general",
      is_customized: false,
      service_tags: Array.isArray(b.service_tags) ? b.service_tags : ["all"],
      item_status: "active",
      last_updated_at: now,
      updated_by: opts.userId,
      updated_by_name: opts.userName,
    });
  }
}

/** Save behaviour to library; if editing an existing row with different text, fork a new entry. */
export async function upsertBehaviourLibraryFork(
  admin: AdminClient,
  opts: {
    libraryId?: string | null;
    label: string;
    riskLevel?: string;
    category?: string;
    scope?: "general" | "individual";
    serviceTags?: string[];
    userId?: string | null;
  },
) {
  const label = cleanIsp(opts.label, 500);
  if (!label) return null;
  const now = new Date().toISOString();
  const risk = riskLevelIsp(opts.riskLevel);
  const scope = opts.scope === "general" ? "general" : "individual";
  const serviceTags = Array.isArray(opts.serviceTags) && opts.serviceTags.length
    ? opts.serviceTags
    : scope === "general"
    ? ["all"]
    : ["all"];

  if (opts.libraryId) {
    const { data: orig } = await admin
      .from("portal_isp_behaviour_library")
      .select("*")
      .eq("id", opts.libraryId)
      .maybeSingle();
    if (orig) {
      const same =
        cleanIsp(orig.label, 500) === label &&
        riskLevelIsp(orig.default_risk_level) === risk;
      if (same) return orig;
      const { data: forked, error } = await admin
        .from("portal_isp_behaviour_library")
        .insert({
          code: slugCode(label, "fork"),
          label,
          category: cleanIsp(opts.category || orig.category, 80) || "custom",
          default_risk_level: risk,
          scope: "individual",
          service_tags: serviceTags,
          forked_from_id: orig.id,
          created_by: opts.userId || null,
          sort_order: 900,
          is_active: true,
          updated_at: now,
        })
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return forked;
    }
  }

  // Exact label match in library → reuse
  const { data: existing } = await admin
    .from("portal_isp_behaviour_library")
    .select("*")
    .eq("is_active", true)
    .ilike("label", label)
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("portal_isp_behaviour_library")
    .insert({
      code: slugCode(label, "custom"),
      label,
      category: cleanIsp(opts.category, 80) || "custom",
      default_risk_level: risk,
      scope,
      service_tags: serviceTags,
      created_by: opts.userId || null,
      sort_order: 900,
      is_active: true,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return created;
}

export async function upsertStrategyLibraryFork(
  admin: AdminClient,
  opts: {
    libraryId?: string | null;
    label?: string;
    body: string;
    behaviourCodes?: string[];
    category?: string;
    scope?: "general" | "individual";
    serviceTags?: string[];
    userId?: string | null;
  },
) {
  const body = cleanIsp(opts.body, 4000);
  if (!body) return null;
  const now = new Date().toISOString();
  const label = cleanIsp(opts.label, 200) || body.slice(0, 80);
  const scope = opts.scope === "general" ? "general" : "individual";
  const serviceTags = Array.isArray(opts.serviceTags) && opts.serviceTags.length
    ? opts.serviceTags
    : ["all"];
  const behaviourCodes = Array.isArray(opts.behaviourCodes)
    ? opts.behaviourCodes
    : [];

  if (opts.libraryId) {
    const { data: orig } = await admin
      .from("portal_isp_strategy_library")
      .select("*")
      .eq("id", opts.libraryId)
      .maybeSingle();
    if (orig) {
      if (cleanIsp(orig.body, 4000) === body) return orig;
      const { data: forked, error } = await admin
        .from("portal_isp_strategy_library")
        .insert({
          code: slugCode(label, "fork"),
          label,
          body,
          category: cleanIsp(opts.category || orig.category, 80) || "custom",
          behaviour_codes: behaviourCodes.length
            ? behaviourCodes
            : (orig.behaviour_codes || []),
          scope: "individual",
          service_tags: serviceTags,
          forked_from_id: orig.id,
          created_by: opts.userId || null,
          sort_order: 900,
          is_active: true,
          updated_at: now,
        })
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return forked;
    }
  }

  const { data: existing } = await admin
    .from("portal_isp_strategy_library")
    .select("*")
    .eq("is_active", true)
    .eq("body", body)
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("portal_isp_strategy_library")
    .insert({
      code: slugCode(label, "custom"),
      label,
      body,
      category: cleanIsp(opts.category, 80) || "custom",
      behaviour_codes: behaviourCodes,
      scope,
      service_tags: serviceTags,
      created_by: opts.userId || null,
      sort_order: 900,
      is_active: true,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return created;
}
