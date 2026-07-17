/**
+ * Add Michael Morrissey as co-parent of Arthur Morrissey (contact 201)
+ * and allow multiple parents per contact_id.
+ *
+ * APPLY=1 to write.
+ */
+import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
+
+const APPLY = (Deno.env.get("APPLY") || "") === "1";
+
+function secret(name: string): string {
+  const fromEnv = Deno.env.get(name);
+  if (fromEnv) return fromEnv.trim();
+  try {
+    const text = Deno.readTextFileSync("local-secrets/secrets.env");
+    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
+    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
+  } catch {
+    return "";
+  }
+}
+
+const admin = createClient(
+  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
+  secret("SUPABASE_SERVICE_ROLE_KEY"),
+  { auth: { persistSession: false, autoRefreshToken: false } },
+);
+
+const CONTACT_ID = "201";
+const MICHAEL_PARENT_ID = "michael-morrissey";
+
+const { data: jane, error: janeErr } = await admin
+  .from("portal_parent_contacts")
+  .select("*")
+  .eq("contact_id", CONTACT_ID)
+  .eq("parent_person_id", "1338816")
+  .maybeSingle();
+if (janeErr || !jane) throw new Error(`Jane/Arthur row missing: ${janeErr?.message}`);
+
+const { data: existing } = await admin
+  .from("portal_parent_contacts")
+  .select("id,parent_person_id,parent_display")
+  .eq("contact_id", CONTACT_ID)
+  .eq("parent_person_id", MICHAEL_PARENT_ID)
+  .maybeSingle();
+
+console.log("Jane row:", {
+  contact_id: jane.contact_id,
+  parent: jane.parent_display,
+  child: jane.child_display,
+  dob: jane.dob_iso,
+});
+console.log("Michael existing:", existing);
+
+if (!APPLY) {
+  console.log("Dry run — set APPLY=1 to insert Michael and relax contact_id uniqueness.");
+  Deno.exit(0);
+}
+
+// Allow multiple carers per participant.
+const dropSql = `
+drop index if exists public.portal_parent_contacts_contact_id_uidx;
+create unique index if not exists portal_parent_contacts_contact_parent_uidx
+  on public.portal_parent_contacts (contact_id, parent_person_id);
+`;
+const { error: ddlErr } = await admin.rpc("exec_sql", { query: dropSql }).maybeSingle?.() ?? { error: { message: "no_rpc" } };
+
+// Prefer PostgREST-friendly path: try to insert; if unique fails, run via raw SQL edge.
+if (ddlErr) {
+  // Fall back: call through pg via a one-off edge isn't available; use temporary contact then
+  // try insert and surface the unique error so we know to run migration SQL.
+  console.log("Note: exec_sql RPC unavailable — applying via insert/update only if unique already relaxed.");
+}
+
+const row = {
+  contact_id: CONTACT_ID,
+  parent_person_id: MICHAEL_PARENT_ID,
+  child_display: jane.child_display,
+  child_first_name: jane.child_first_name,
+  child_last_name: jane.child_last_name,
+  parent_display: "Michael Morrissey",
+  parent_first_name: "Michael",
+  parent_last_name: "Morrissey",
+  email: null,
+  mobile: null,
+  address_line1: jane.address_line1,
+  address_line2: jane.address_line2,
+  city: jane.city,
+  postcode: jane.postcode,
+  dob_iso: jane.dob_iso,
+  in_class: jane.in_class,
+  on_waiting_list: jane.on_waiting_list,
+  updated_at: new Date().toISOString(),
+};
+
+if (existing) {
+  const { error } = await admin
+    .from("portal_parent_contacts")
+    .update(row)
+    .eq("id", existing.id);
+  if (error) throw error;
+  console.log("Updated existing Michael row");
+} else {
+  const { error } = await admin.from("portal_parent_contacts").insert(row);
+  if (error) {
+    console.error("Insert failed (likely unique contact_id still active):", error.message);
+    console.error("Run migration 20260717200000_portal_parent_contacts_multi_parent.sql first.");
+    Deno.exit(1);
+  }
+  console.log("Inserted Michael Morrissey as co-parent of Arthur");
+}
+
+for (const [fn, ln, dob] of [
+  ["Jane", "Mackey", "31102012"],
+  ["Michael", "Morrissey", "31102012"],
+] as const) {
+  const { data, error } = await admin.rpc("portal_parent_match_identity_dob", {
+    p_parent_first_name: fn,
+    p_parent_last_name: ln,
+    p_login_dob: dob,
+  });
+  console.log("login check", fn, ln, data, error?.message || "ok");
+}
