/**
 * Sync the same PIN across co-parents who share any child contact_id.
 */
export async function familyPersonIdsForParent(
  supabase: { from: (t: string) => any },
  parentPersonId: string,
): Promise<string[]> {
  const pid = String(parentPersonId || "").trim();
  if (!pid) return [];

  const { data: own } = await supabase
    .from("portal_parent_contacts")
    .select("contact_id")
    .eq("parent_person_id", pid);
  const contactIds = [
    ...new Set((own || []).map((r: { contact_id?: unknown }) => String(r.contact_id || "").trim()).filter(Boolean)),
  ];
  if (!contactIds.length) return [pid];

  const { data: related } = await supabase
    .from("portal_parent_contacts")
    .select("parent_person_id")
    .in("contact_id", contactIds);
  const ids = [
    ...new Set(
      (related || [])
        .map((r: { parent_person_id?: unknown }) => String(r.parent_person_id || "").trim())
        .filter(Boolean),
    ),
  ];
  return ids.length ? ids : [pid];
}

export async function upsertFamilyPin(
  supabase: { from: (t: string) => any },
  parentPersonId: string,
  pin4: string,
  pinHash: string,
  changedByParent: boolean,
): Promise<string[]> {
  const ids = await familyPersonIdsForParent(supabase, parentPersonId);
  const now = new Date().toISOString();
  for (const id of ids) {
    const { error } = await supabase.from("portal_parent_portal_credentials").upsert(
      {
        parent_person_id: id,
        pin_hash: pinHash,
        pin_display: pin4,
        changed_by_parent: changedByParent,
        updated_at: now,
      },
      { onConflict: "parent_person_id" },
    );
    if (error) throw error;
  }
  return ids;
}
