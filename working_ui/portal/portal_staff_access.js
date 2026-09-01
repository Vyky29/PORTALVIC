/**
 * Staff portal access modes. documents_only = My Documents (+ profile/contract sign) only.
 */

/** Fallback until DB portal_staff_access is set (Giuseppe, Andres, Bismark — no availability Aug 2026). */
const DOCUMENTS_ONLY_USERNAMES = new Set(["giuseppe", "andres", "bismark"]);

const ALLOWED_PATH_RE =
  /(?:^|\/)(my_documents|staff_profile_update|staff_uniform|contract_sign|training_record_sign|login)(?:\.html)?(?:$|[?#])/i;

function clean(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

function usernameKey(profile) {
  return clean(profile && profile.username).toLowerCase();
}

export function portalStaffAccessMode(profile) {
  const mode = clean(profile && profile.portal_staff_access).toLowerCase();
  if (mode === "documents_only") return "documents_only";
  if (DOCUMENTS_ONLY_USERNAMES.has(usernameKey(profile))) return "documents_only";
  return "full";
}

export function portalStaffIsDocumentsOnly(profile) {
  return portalStaffAccessMode(profile) === "documents_only";
}

export function portalStaffDocumentsOnlyPathAllowed(pathname) {
  const path = clean(pathname).toLowerCase();
  if (!path) return false;
  return ALLOWED_PATH_RE.test(path);
}

export function portalStaffDocumentsOnlyHomeUrl() {
  if (typeof window === "undefined") return "/my_documents.html?from=staff";
  try {
    return new URL("my_documents.html?from=staff", window.location.href).href;
  } catch {
    return "/my_documents.html?from=staff";
  }
}

/** If profile is documents-only and current page is not allowed, return redirect URL. */
export function portalStaffDocumentsOnlyRedirect(profile, pathname) {
  if (!portalStaffIsDocumentsOnly(profile)) return null;
  const path =
    pathname != null
      ? String(pathname)
      : String((typeof window !== "undefined" && window.location && window.location.pathname) || "");
  if (portalStaffDocumentsOnlyPathAllowed(path)) return null;
  return portalStaffDocumentsOnlyHomeUrl();
}
