/**
 * Apply credentials migration + generate 4-digit family PINs for all parents.
 * Syncs co-parents (shared contact_id) to the same PIN.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, writeFileSync } from "node:fs";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = readFileSync("local-secrets/secrets.env", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isWeak(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true;
  return pin === "1234" || pin === "4321" || pin === "2580";
}

function newPin(exclude: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const pin = String(arr[0] % 10000).padStart(4, "0");
    if (isWeak(pin) || exclude.has(pin)) continue;
    return pin;
  }
  return "4829";
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Apply DDL via REST isn't available — try rpc or just upsert and rely on migration apply.
const migration = readFileSync(
  "supabase/migrations/20260718110000_portal_parent_portal_credentials.sql",
  "utf8",
);
console.log("Migration SQL ready (" + migration.length + " chars). Applying via supabase db if linked…");

const { data: contacts, error } = await admin
  .from("portal_parent_contacts")
  .select(
    "parent_person_id, contact_id, parent_display, parent_first_name, parent_last_name, child_display, child_first_name, email, mobile",
  )
  .limit(5000);
if (error) {
  console.error("contacts error", error.message);
  Deno.exit(1);
}

// Build co-parent clusters: union-find by shared contact_id
const parentToContacts = new Map<string, Set<string>>();
const contactToParents = new Map<string, Set<string>>();
for (const c of contacts || []) {
  const pid = String(c.parent_person_id || "").trim();
  const cid = String(c.contact_id || "").trim();
  if (!pid) continue;
  if (!parentToContacts.has(pid)) parentToContacts.set(pid, new Set());
  if (cid) {
    parentToContacts.get(pid)!.add(cid);
    if (!contactToParents.has(cid)) contactToParents.set(cid, new Set());
    contactToParents.get(cid)!.add(pid);
  }
}

const parentIds = [...parentToContacts.keys()];
const parent = new Map<string, string>();
function find(a: string): string {
  let x = a;
  while (parent.get(x) && parent.get(x) !== x) x = parent.get(x)!;
  return x;
}
function union(a: string, b: string) {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(rb, ra);
}
for (const pid of parentIds) parent.set(pid, pid);
for (const [, pset] of contactToParents) {
  const arr = [...pset];
  for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
}

const clusters = new Map<string, string[]>();
for (const pid of parentIds) {
  const root = find(pid);
  if (!clusters.has(root)) clusters.set(root, []);
  clusters.get(root)!.push(pid);
}

const usedPins = new Set<string>();
const { data: existing } = await admin
  .from("portal_parent_portal_credentials")
  .select("parent_person_id, pin_display");
if (existing === null && (await admin.from("portal_parent_portal_credentials").select("parent_person_id").limit(1)).error) {
  console.error(
    "Table portal_parent_portal_credentials missing. Apply migration first:\n  supabase db push  OR run the SQL in Dashboard.",
  );
  console.error(
    (await admin.from("portal_parent_portal_credentials").select("parent_person_id").limit(1)).error?.message,
  );
}

for (const c of existing || []) {
  if (c.pin_display) usedPins.add(String(c.pin_display));
}

const report: Array<Record<string, unknown>> = [];
const now = new Date().toISOString();
let created = 0;
let skipped = 0;

for (const [, members] of clusters) {
  // If any member already has a PIN, reuse it for the whole cluster
  let pin = "";
  for (const pid of members) {
    const row = (existing || []).find((e) => e.parent_person_id === pid);
    if (row?.pin_display) {
      pin = String(row.pin_display);
      break;
    }
  }
  if (!pin) {
    pin = newPin(usedPins);
    usedPins.add(pin);
  }

  const pinHash = await sha256Hex("portal-pin-v1:" + pin);
  const kids = new Set<string>();
  let parentLabel = "";
  let email = "";
  let mobile = "";
  for (const pid of members) {
    for (const c of contacts || []) {
      if (String(c.parent_person_id) !== pid) continue;
      if (!parentLabel) {
        parentLabel = String(
          c.parent_display || `${c.parent_first_name || ""} ${c.parent_last_name || ""}`,
        ).trim();
        email = String(c.email || "");
        mobile = String(c.mobile || "");
      }
      const child = String(c.child_display || c.child_first_name || "").trim();
      if (child) kids.add(child);
    }
    const { error: upErr } = await admin.from("portal_parent_portal_credentials").upsert(
      {
        parent_person_id: pid,
        pin_hash: pinHash,
        pin_display: pin,
        changed_by_parent: false,
        updated_at: now,
      },
      { onConflict: "parent_person_id" },
    );
    if (upErr) {
      console.error("upsert fail", pid, upErr.message);
      skipped++;
    } else {
      created++;
    }
  }

  const loginNames = [...kids].map((k) => k.split(/\s+/)[0]).filter(Boolean);
  report.push({
    parent: parentLabel,
    parent_person_ids: members,
    children: [...kids].join("; "),
    login_with_first_name: [...new Set(loginNames)].join(" / "),
    pin,
    email,
    mobile,
  });
}

report.sort((a, b) => String(a.parent).localeCompare(String(b.parent)));
writeFileSync(
  "database/local-vault/tmp/parent-portal-family-pins.json",
  JSON.stringify({ generatedAt: now, families: report.length, rows: report }, null, 2),
);

// Human-readable list
const lines = [
  "Parent portal family PINs",
  `Generated ${now}`,
  `Families: ${report.length}`,
  "Login: participant FIRST NAME + 4-digit PIN (same PIN for all siblings / co-parents).",
  "Office master (any first name): 6-digit PIN from PARENT_PORTAL_MASTER_PIN (default 29031988).",
  "",
  "Parent | Login names | PIN | Children",
  "-------|-------------|-----|----------",
  ...report.map(
    (r) =>
      `${r.parent} | ${r.login_with_first_name} | ${r.pin} | ${r.children}`,
  ),
];
writeFileSync("database/local-vault/tmp/parent-portal-family-pins.txt", lines.join("\n"));
console.log(`Done. upserts≈${created} families=${report.length}`);
console.log("Wrote database/local-vault/tmp/parent-portal-family-pins.json");
console.log("Wrote database/local-vault/tmp/parent-portal-family-pins.txt");
