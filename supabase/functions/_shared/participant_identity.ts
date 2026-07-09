/** Roster slug + worker-name resolution (portal contact ↔ session_feedback client_id). */

export function slugifyParticipantKey(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ROSTER_SPELLING_ALIASES: Record<string, string> = {
  aadam_ah: "adaam_ah",
  aadam_ahmed: "adaam_ah",
  abodi_p: "abodi_pa",
  adam_pi: "adam_p",
  amar_ra: "amar_rai",
  sammer: "samer",
  rayan_tapa: "rayan_ta",
  steven_ces: "steven",
  steven_c: "steven",
  steven_ce: "steven",
  yusuf: "yusuf_ah",
  yusef: "yusuf_ah",
};

const CLIENT_INFO_SLUG_ALIASES: Record<string, string> = {
  adam_a: "adam_ab",
  adam_abed: "adam_ab",
  abodi: "abodi_pa",
  junaid: "junaid_f",
  khalid_ab: "khalid",
  rayyan_fi: "rayyan_f",
  chaitanya_trial_28_06: "chaitanya",
};

/**
 * Portal participant display-name → roster/feedback short client_id.
 * Use only when the parent-portal record stores a fuller name than the roster
 * (e.g. "Fadi Abu daud" in portal_participants vs client_id "fadi" in the roster).
 * Scoped per participant to avoid first-name collisions across distinct children.
 */
const PORTAL_PARTICIPANT_SLUG_ALIASES: Record<string, string> = {
  fadi_abu_daud: "fadi",
  fadi_ab: "fadi",
  cyrus_mahdavi: "cyrus",
  cyrus_ma: "cyrus",
};

const CLIENT_INFO_SHEET_ALIASES: Record<string, string> = {
  rayan_tapa: "rayan_ta",
  aadam_ah: "adaam_ah",
};

export function rosterParticipantSlugAlias(slug: string): string {
  const s = slugifyParticipantKey(slug);
  if (!s) return s;
  return ROSTER_SPELLING_ALIASES[s] || CLIENT_INFO_SLUG_ALIASES[s] ||
    CLIENT_INFO_SHEET_ALIASES[s] || PORTAL_PARTICIPANT_SLUG_ALIASES[s] || s;
}

/** Legacy roster client_id values that map to the same canonical participant slug. */
function legacyClientIdVariantsByCanonical(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (legacy: string, canon: string) => {
    if (!legacy || !canon || legacy === canon) return;
    if (!out[canon]) out[canon] = [];
    if (!out[canon].includes(legacy)) out[canon].push(legacy);
  };
  for (const [legacy, canon] of Object.entries(ROSTER_SPELLING_ALIASES)) add(legacy, canon);
  for (const [legacy, canon] of Object.entries(CLIENT_INFO_SLUG_ALIASES)) add(legacy, canon);
  for (const [legacy, canon] of Object.entries(CLIENT_INFO_SHEET_ALIASES)) add(legacy, canon);
  for (const [legacy, canon] of Object.entries(PORTAL_PARTICIPANT_SLUG_ALIASES)) add(legacy, canon);
  return out;
}

/** Include historical client_id spellings so parent achievement queries find every folder photo. */
export function expandParticipantClientSlugs(slugs: string[]): string[] {
  const legacyByCanon = legacyClientIdVariantsByCanonical();
  const out = new Set<string>();
  for (const raw of slugs) {
    const slug = slugifyParticipantKey(raw);
    if (!slug) continue;
    const canon = rosterParticipantSlugAlias(slug);
    out.add(slug);
    out.add(canon);
    for (const legacy of legacyByCanon[canon] || []) out.add(legacy);
  }
  return [...out].filter(Boolean);
}

export function canonicalParticipantClientId(nameRaw: string): string {
  return rosterParticipantSlugAlias(slugifyParticipantKey(nameRaw));
}

export function normalizeParticipantLookupName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Worker roster short label pattern (e.g. Adaam Ah, Abodi Pa). */
export function workerShortName(firstName: string, lastName: string): string {
  const fn = String(firstName || "").trim();
  const ln = String(lastName || "").trim();
  if (!fn) return "";
  if (!ln) return fn;
  return `${fn} ${ln.slice(0, 2)}`;
}

export type ParticipantIdentityInput = {
  contactId?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

export function resolveParticipantClientSlugs(input: ParticipantIdentityInput): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const slug = slugifyParticipantKey(raw);
    if (!slug) return;
    out.add(slug);
    out.add(rosterParticipantSlugAlias(slug));
  };

  add(input.contactId || "");
  add(input.displayName || "");
  if (input.firstName || input.lastName) {
    add(`${input.firstName || ""} ${input.lastName || ""}`.trim());
    add(workerShortName(input.firstName || "", input.lastName || ""));
    if (input.firstName) add(input.firstName);
  }

  return [...out].filter(Boolean);
}

export function resolveParticipantLookupNames(input: ParticipantIdentityInput): string[] {
  const names = new Set<string>();
  const add = (n: string) => {
    const t = String(n || "").trim();
    if (t) names.add(t);
  };

  add(input.displayName || "");
  if (input.firstName || input.lastName) {
    add(`${input.firstName || ""} ${input.lastName || ""}`.trim());
    add(workerShortName(input.firstName || "", input.lastName || ""));
    if (input.firstName) add(input.firstName);
  }

  return [...names];
}

export function participantIdentityMatches(
  input: ParticipantIdentityInput,
  rowName: string,
  rowClientId: string,
): boolean {
  const slugs = resolveParticipantClientSlugs(input);
  const rowSlug = slugifyParticipantKey(rowClientId);
  const canonRowSlug = rosterParticipantSlugAlias(rowSlug);
  if (rowSlug && slugs.some((s) => s === rowSlug || s === canonRowSlug)) return true;

  const wantNames = resolveParticipantLookupNames(input).map(normalizeParticipantLookupName);
  const gotName = normalizeParticipantLookupName(rowName);
  if (gotName && wantNames.some((w) => w && w === gotName)) return true;

  const wantSlug = canonicalParticipantClientId(input.displayName || "");
  const gotSlug = canonicalParticipantClientId(rowName || rowClientId);
  if (wantSlug && gotSlug && wantSlug === gotSlug) return true;

  const first = normalizeParticipantLookupName(input.firstName || "");
  if (first) {
    const gotParts = normalizeParticipantLookupName(rowName).split(" ").filter(Boolean);
    if (gotParts.length === 1 && gotParts[0] === first) {
      const rowSlug = slugifyParticipantKey(rowClientId || rowName);
      const firstSlug = slugifyParticipantKey(input.firstName || "");
      if (rowSlug === firstSlug || slugs.some((s) => s === rowSlug || s === rosterParticipantSlugAlias(rowSlug))) {
        return true;
      }
    }
  }

  return false;
}
