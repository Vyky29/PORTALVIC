/**
 * Link HR employment contracts to Portal staff by login name (auth-map).
 */
import {
  resolveDemoEmail,
  resolveCorporateAuthEmail,
  STAFF_USERNAME_TO_EMAIL,
  PORTAL_RETIRED_PLACEHOLDER_EMAILS
} from "./auth-map.js";

const PLACEHOLDER_AUTH = /@staff\.import\.pending$/i;

export function isPlaceholderPortalEmail(email) {
  return PLACEHOLDER_AUTH.test(String(email || "").trim());
}

export function resolvePortalAuthEmail(loginOrName) {
  return resolveDemoEmail(String(loginOrName || "").trim()) || "";
}

function pushRosterEntry(roster, seenAuth, entry) {
  const authEmail = String(entry.authEmail || "").trim().toLowerCase();
  if (!authEmail || seenAuth.has(authEmail)) return;
  if (PORTAL_RETIRED_PLACEHOLDER_EMAILS.has(authEmail)) return;
  seenAuth.add(authEmail);
  roster.push({
    profileId: entry.profileId || null,
    loginName: entry.loginName,
    displayName: entry.displayName || entry.loginName,
    authEmail
  });
}

function loadStaticStaffRoster(seenAuth) {
  const roster = [];
  Object.entries(STAFF_USERNAME_TO_EMAIL).forEach(([label, email]) => {
    if (String(label).includes("@")) return;
    if (String(label).includes(" ")) return;
    const authEmail = resolveCorporateAuthEmail(String(email));
    if (!authEmail) return;
    pushRosterEntry(roster, seenAuth, {
      loginName: label,
      displayName: label,
      authEmail
    });
  });
  roster.sort((a, b) => a.displayName.localeCompare(b.displayName, "en"));
  return roster;
}

export async function loadPortalStaffRoster(supabase) {
  const seenAuth = new Set();
  const roster = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, full_name, username, is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true });
    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        const login = String(row.username || "").trim() || String(row.full_name || "").trim();
        if (!login) return;
        const authEmail =
          resolvePortalAuthEmail(login) || resolvePortalAuthEmail(row.full_name);
        if (!authEmail) return;
        pushRosterEntry(roster, seenAuth, {
          profileId: row.id,
          loginName: login,
          displayName: String(row.full_name || login).trim(),
          authEmail
        });
      });
    }
  }

  if (!roster.length) {
    return loadStaticStaffRoster(seenAuth);
  }

  roster.sort((a, b) => a.displayName.localeCompare(b.displayName, "en"));
  return roster;
}

export async function verifyPortalStaffLink(supabase, authEmail) {
  const email = String(authEmail || "").trim().toLowerCase();
  if (!supabase || !email) {
    return { ok: false, userId: null, error: "Missing Portal account email." };
  }
  const { data, error } = await supabase.rpc("portal_user_id_for_email", { p_email: email });
  if (error) {
    return { ok: false, userId: null, error: error.message || "Could not verify Portal account." };
  }
  if (!data) {
    return {
      ok: false,
      userId: null,
      error: "No Supabase Auth user for this staff member. Run PIN sync or create the account first."
    };
  }
  return { ok: true, userId: data, error: null };
}
