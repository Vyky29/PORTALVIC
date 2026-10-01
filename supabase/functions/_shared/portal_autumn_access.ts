/** Autumn 2026/27 seats. A child with no seat from this date is OLD for portal access. */

export const AUTUMN_TERM_FROM = "2026-09-01";

const SKIP_NAMES = new Set([
  "",
  "no participant",
  "no client",
  "closed",
  "home",
  "manager",
  "available",
]);

export function normPersonName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Old portal account and the current roster label are one child. */
const SAME_AUTUMN_CHILD: Record<string, string> = {
  "rayyan f": "rayyan fi",
  "rayyan fida": "rayyan fi",
  "rayyan fda": "rayyan fi",
};

function autumnPersonKey(raw: unknown): string {
  const name = normPersonName(raw);
  return SAME_AUTUMN_CHILD[name] || name;
}

export async function loadAutumnClientNames(
  admin: { from: (table: string) => any },
): Promise<Set<string> | null> {
  const names = new Set<string>();
  const { data, error } = await admin
    .from("portal_roster_rows")
    .select("client_name, session_date, status")
    .eq("status", "active")
    .limit(8000);
  if (error || !data || !data.length) {
    if (error) console.warn("[portal-autumn-access] roster", error.message);
    return null;
  }
  for (const row of data || []) {
    const name = autumnPersonKey(row.client_name);
    if (SKIP_NAMES.has(name)) continue;
    const dated = String(row.session_date || "").slice(0, 10);
    if (dated && dated < AUTUMN_TERM_FROM) continue;
    names.add(name);
  }
  return names;
}

/** True when this child still has an Autumn seat. Unknown roster (null) does not lock anyone out. */
export function personOnAutumn(names: Set<string> | null, ...bits: unknown[]): boolean {
  if (!names || !names.size) return true;
  for (const bit of bits) {
    const name = autumnPersonKey(bit);
    if (!name) continue;
    if (names.has(name)) return true;
    const first = name.split(" ")[0];
    if (first && names.has(first)) return true;
  }
  return false;
}
