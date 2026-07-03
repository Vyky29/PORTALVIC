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
    authEmail,
    contactEmail: entry.contactEmail || "",
    contactAddress: entry.contactAddress || ""
  });
}

export function formatStaffAddress(row) {
  if (!row) return "";
  return [
    row.address_line1,
    row.address_line2,
    row.address_city,
    row.address_postcode
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function resolveStaffContactEmail(row, authEmail) {
  const personal = String((row && row.email_personal) || "").trim();
  if (personal && !isPlaceholderPortalEmail(personal)) return personal;
  const auth = String(authEmail || "").trim();
  if (auth && !isPlaceholderPortalEmail(auth)) return auth;
  return "";
}

const HR_EMAIL_KEYS = [
  "Email address",
  "Email Address",
  "Email",
  "Personal email",
  "Personal Email",
  "Contact email",
  "Contact Email"
];

const HR_ADDRESS_FULL_KEYS = ["Address", "Home Address", "Home address", "Full Address"];

const HR_ADDRESS_PART_KEYS = {
  line1: ["Address line 1", "Address Line 1", "Address 1"],
  line2: ["Address line 2", "Address Line 2", "Address 2"],
  city: ["Town", "City", "Town / city", "Town/City"],
  postcode: ["Postcode", "Post code", "Postal code"]
};

function pickHrField(data, keys) {
  const src = data || {};
  for (let i = 0; i < keys.length; i++) {
    const v = src[keys[i]];
    if (v != null) {
      const trimmed = String(v).trim();
      if (trimmed && trimmed !== "-") return trimmed;
    }
  }
  return "";
}

export function formatHrAddress(data) {
  const full = pickHrField(data, HR_ADDRESS_FULL_KEYS);
  if (full) return full;
  return [
    pickHrField(data, HR_ADDRESS_PART_KEYS.line1),
    pickHrField(data, HR_ADDRESS_PART_KEYS.line2),
    pickHrField(data, HR_ADDRESS_PART_KEYS.city),
    pickHrField(data, HR_ADDRESS_PART_KEYS.postcode)
  ]
    .filter(Boolean)
    .join("\n");
}

function hrNameKey(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function loadStaffProfileContact(supabase, profileId, authEmail) {
  const out = { contactEmail: "", contactAddress: "" };
  if (!supabase || !profileId) return out;
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("email_personal, address_line1, address_line2, address_city, address_postcode")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !data) return out;
  return {
    contactEmail: resolveStaffContactEmail(data, authEmail),
    contactAddress: formatStaffAddress(data)
  };
}

async function loadHrRecordContact(supabase, entry) {
  const out = { contactEmail: "", contactAddress: "" };
  if (!supabase || !entry) return out;

  async function readRow(query) {
    const { data, error } = await query.maybeSingle();
    if (error || !data || !data.data) return null;
    return data.data;
  }

  let data = null;
  if (entry.profileId) {
    data = await readRow(
      supabase
        .from("hr_records")
        .select("data")
        .eq("sheet", "Employees info")
        .eq("staff_id", entry.profileId)
        .order("row_index", { ascending: true })
        .limit(1)
    );
  }
  if (!data && entry.displayName) {
    const key = hrNameKey(entry.displayName);
    if (key) {
      data = await readRow(
        supabase
          .from("hr_records")
          .select("data")
          .eq("sheet", "Employees info")
          .eq("name_key", key)
          .order("row_index", { ascending: true })
          .limit(1)
      );
    }
  }
  if (!data) return out;
  return {
    contactEmail: pickHrField(data, HR_EMAIL_KEYS),
    contactAddress: formatHrAddress(data)
  };
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
      .select(
        "id, full_name, username, is_active, email_personal, address_line1, address_line2, address_city, address_postcode"
      )
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
          authEmail,
          contactEmail: resolveStaffContactEmail(row, authEmail),
          contactAddress: formatStaffAddress(row)
        });
      });
    } else if (error) {
      console.warn("[hr-contract] staff_profiles roster load failed:", error.message || error);
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

export async function loadStaffContractContact(supabase, entry) {
  const out = {
    contactEmail: String((entry && entry.contactEmail) || "").trim(),
    contactAddress: String((entry && entry.contactAddress) || "").trim()
  };
  if (!supabase || !entry) return out;

  if (!out.contactEmail || !out.contactAddress) {
    const profileContact = await loadStaffProfileContact(supabase, entry.profileId, entry.authEmail);
    if (!out.contactEmail && profileContact.contactEmail) out.contactEmail = profileContact.contactEmail;
    if (!out.contactAddress && profileContact.contactAddress) out.contactAddress = profileContact.contactAddress;
  }

  if (!out.contactEmail || !out.contactAddress) {
    const hrContact = await loadHrRecordContact(supabase, entry);
    if (!out.contactEmail && hrContact.contactEmail) out.contactEmail = hrContact.contactEmail;
    if (!out.contactAddress && hrContact.contactAddress) out.contactAddress = hrContact.contactAddress;
  }

  if (out.contactEmail && out.contactAddress) return out;

  const verified = entry.authEmail
    ? await verifyPortalStaffLink(supabase, entry.authEmail)
    : { ok: false, userId: null };
  if (!verified.ok || !verified.userId) return out;

  const { data, error } = await supabase
    .from("employment_contracts")
    .select("employee_email, employee_address")
    .eq("user_id", verified.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return out;

  if (!out.contactEmail && data.employee_email) {
    out.contactEmail = String(data.employee_email).trim();
  }
  if (!out.contactAddress && data.employee_address) {
    out.contactAddress = String(data.employee_address).trim();
  }
  return out;
}
