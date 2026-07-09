/** Parent-facing role label for session feedback author (name shown separately). */

const LEAD_KEYS = new Set(["john", "berta", "michelle"]);
const MANAGER_KEYS = new Set(["victor", "raul"]);

function clean(v: unknown, max = 200): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normKey(name: unknown): string {
  const s = clean(name, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!s) return "";
  if (s === "yousef" || s === "youssef" || s === "yusef") return "youssef";
  if (s === "luliya" || s === "lulia") return "lulia";
  return s.split(/\s+/)[0] || s;
}

function isDayCentreService(service: string): boolean {
  const s = service.toLowerCase();
  return (
    s.includes("day centre") ||
    s.includes("day center") ||
    s.includes("daycentre") ||
    s.includes("daycare")
  );
}

export function feedbackAuthorFirstName(staffName: unknown): string {
  const full = clean(staffName, 120);
  if (!full) return "";
  const parts = full.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function resolveFeedbackAuthorRole(staffName: unknown, service: unknown): string {
  const key = normKey(staffName);
  const svc = clean(service, 200).toLowerCase();

  if (key === "michelle" && isDayCentreService(svc)) return "MANAGER";
  if (MANAGER_KEYS.has(key)) return "MANAGER";
  if (LEAD_KEYS.has(key)) return "SUPPORT WORKER";

  if (svc.includes("climb")) return "CLIMBING INSTRUCTOR";
  if (svc.includes("aquatic") || svc.includes("swim")) return "SWIMMING INSTRUCTOR";
  if (svc.includes("multi activity") || svc.includes("multi-activity")) return "SUPPORT WORKER";
  if (isDayCentreService(svc)) return "SUPPORT WORKER";

  return "SUPPORT WORKER";
}
