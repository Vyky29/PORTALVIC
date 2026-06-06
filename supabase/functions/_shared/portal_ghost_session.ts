/** Shared helpers for admin ghost-view (teleport) sessions. */

const STAFF_CODE_TO_ROSTER_KEY: Record<string, string> = {
  stf001: "sandra",
  stf002: "roberto",
  stf003: "dan",
  stf004: "angel",
  stf005: "youssef",
  stf006: "john",
  stf007: "bismark",
  stf008: "giuseppe",
  stf009: "godsway",
  stf010: "javier",
  stf011: "aurora",
  stf012: "berta",
  stf013: "victor",
  stf014: "carlos",
  stf015: "alex",
  stf017: "javi",
  stf018: "raul",
  stf019: "sevitha",
  stf020: "teflon",
  stf021: "lulia",
  stf022: "andres",
};

const AUTH_EMAIL_TO_ROSTER_KEY: Record<string, string> = {
  "b.traperocasado@gmail.com": "berta",
  "johnnyosti37@gmail.com": "john",
  "stf012@staff.import.pending": "berta",
  "stf006@staff.import.pending": "john",
  "stf021@staff.import.pending": "lulia",
};

export const GHOST_SESSION_TTL_MS = 30 * 60 * 1000;

export function normalizeRosterKey(value: string): string {
  let k = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (!k) return "";
  if (k === "luliya" || k === "aida") k = "lulia";
  return STAFF_CODE_TO_ROSTER_KEY[k] || k;
}

export function rosterKeyFromAuthEmail(email: string): string {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return "";
  if (AUTH_EMAIL_TO_ROSTER_KEY[em]) return AUTH_EMAIL_TO_ROSTER_KEY[em];
  const local = em.split("@")[0] || "";
  if (!local) return "";
  return STAFF_CODE_TO_ROSTER_KEY[local] || "";
}

type StaffProfileRow = {
  username?: string | null;
  full_name?: string | null;
  app_role?: string | null;
  staff_role?: string | null;
};

export function resolveRosterKeyFromProfile(
  profile: StaffProfileRow | null | undefined,
  authEmail: string,
): string {
  const p = profile || {};
  const fromEmail = rosterKeyFromAuthEmail(authEmail);
  if (fromEmail) return fromEmail;

  const usernameKey = normalizeRosterKey(String(p.username || ""));
  if (usernameKey && !/^stf\d{3}$/.test(usernameKey)) return usernameKey;
  if (usernameKey && STAFF_CODE_TO_ROSTER_KEY[usernameKey]) {
    return STAFF_CODE_TO_ROSTER_KEY[usernameKey];
  }

  const firstNameKey = normalizeRosterKey(
    String(p.full_name || "").split(/\s+/)[0] || "",
  );
  if (firstNameKey) return firstNameKey;

  const localKey = normalizeRosterKey(String(authEmail || "").split("@")[0] || "");
  return localKey;
}

export function parseGhostSurface(value: unknown): "staff" | "lead" {
  const s = String(value || "").trim().toLowerCase();
  return s === "lead" ? "lead" : "staff";
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newGhostToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim() || "";
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}
