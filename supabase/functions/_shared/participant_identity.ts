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
  // Canonical roster slug is "emanuel" (legal spelling). Legacy double-m maps here.
  emmanuel: "emanuel",
  emmanuel_dodson: "emanuel",
  emmanuel_do: "emanuel",
  emanuel_dodson: "emanuel",
  emanuel_do: "emanuel",
  gap_emanuel_dodson: "emanuel",
  gap_emmanuel_dodson: "emanuel",
  // Portal "Thomas (Tom) Eriksson" vs roster client_id "tom"
  thomas_tom_eriksson: "tom",
  thomas_tom: "tom",
  thomas_tom_er: "tom",
  thomas_eriksson: "tom",
  // Portal "Timi Dairo" / Oluwatimilehin vs roster client_id "timi"
  timi_dairo: "timi",
  gap_timi_dairo: "timi",
  oluwatimilehin_nathan_dairo: "timi",
  oluwatimilehin_nathan: "timi",
  oluwatimilehin_na: "timi",
  oluwatimilehin: "timi",
  // No-extra-booking LA clients (full portal names → roster short ids)
  tinashe_nekati: "tinashe",
  ikram_omar: "ikram",
  // ACAT Monday 11–12 members (portal full name / contact_id → roster short id)
  kate_fordham: "kate",
  kamy_akhavan: "kamy",
  jack_walker: "jack_w",
  gap_jack_walker: "jack_w",
  jack_w_walker: "jack_w",
  jack_stratton: "jack_s",
  jack_s_stratton: "jack_s",
};

/** Collective roster / feedback client for Monday 11–12 ACAT aquatic. */
export const ACAT_GROUP_CLIENT_SLUGS = new Set(["acat", "acat_group"]);

/** Individual ACAT members who attend the Monday group slot. */
export const ACAT_MEMBER_CLIENT_SLUGS = new Set(["kate", "kamy", "jack_w", "jack_s"]);

/**
 * LA / Day Centre clients who must not book crash courses or other extras
 * (office-managed programmes only). Canonical roster first-name slugs.
 */
export const NO_EXTRA_BOOKING_CLIENT_SLUGS = new Set([
  "tinashe",
  "ikram",
  "fadi",
  "timi",
]);

export const NO_EXTRA_BOOKING_NOTE =
  "Extra holiday sessions (including crash courses) are not available for this place — please contact the office if you need help.";

export function participantBlocksExtraBooking(input: ParticipantIdentityInput): boolean {
  const slugs = expandParticipantClientSlugs(resolveParticipantClientSlugs(input));
  for (const s of slugs) {
    const c = rosterParticipantSlugAlias(s);
    if (NO_EXTRA_BOOKING_CLIENT_SLUGS.has(c)) return true;
    const head = c.split("_")[0];
    if (head && NO_EXTRA_BOOKING_CLIENT_SLUGS.has(head)) return true;
  }
  return false;
}

export function isAcatGroupClientId(clientIdOrName: string): boolean {
  const slug = slugifyParticipantKey(clientIdOrName);
  return !!slug && ACAT_GROUP_CLIENT_SLUGS.has(slug);
}

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

/** Prefer "Tom" from "Thomas (Tom)" / "Thomas (Tom) Eriksson". */
function extractParentheticalNicknames(raw: string): string[] {
  const out: string[] = [];
  const re = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  const s = String(raw || "");
  while ((m = re.exec(s))) {
    const nick = String(m[1] || "").trim();
    if (nick) out.push(nick);
  }
  return out;
}

/** Legal / outer name without parenthetical nicknames. */
function stripParentheticalNicknames(raw: string): string {
  return String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  add(stripParentheticalNicknames(input.displayName || ""));

  const lastName = stripParentheticalNicknames(input.lastName || "");
  const firstRaw = String(input.firstName || "").trim();
  const firstClean = stripParentheticalNicknames(firstRaw);
  const nicks = [
    ...extractParentheticalNicknames(input.displayName || ""),
    ...extractParentheticalNicknames(firstRaw),
  ];

  if (firstRaw || lastName) {
    add(`${firstRaw} ${lastName}`.trim());
    add(workerShortName(firstRaw, lastName));
    if (firstRaw) add(firstRaw);
  }
  if (firstClean && firstClean !== firstRaw) {
    add(`${firstClean} ${lastName}`.trim());
    add(workerShortName(firstClean, lastName));
    add(firstClean);
  }
  for (const nick of nicks) {
    add(nick);
    if (lastName) {
      add(`${nick} ${lastName}`.trim());
      add(workerShortName(nick, lastName));
    }
  }

  return [...out].filter(Boolean);
}

export function isAcatMemberIdentity(input: ParticipantIdentityInput): boolean {
  const slugs = expandParticipantClientSlugs(resolveParticipantClientSlugs(input));
  return slugs.some((s) => ACAT_MEMBER_CLIENT_SLUGS.has(rosterParticipantSlugAlias(s)));
}

/**
 * When loading feedback / service lookups for an ACAT member, also query the
 * collective `acat` group rows staff submit for Monday 11–12.
 */
export function withAcatGroupClientSlugs(slugs: string[]): string[] {
  const out = new Set(slugs.map(slugifyParticipantKey).filter(Boolean));
  const isMember = [...out].some((s) => ACAT_MEMBER_CLIENT_SLUGS.has(rosterParticipantSlugAlias(s)));
  if (isMember) {
    for (const g of ACAT_GROUP_CLIENT_SLUGS) out.add(g);
  }
  return [...out];
}

/**
 * Kate Fordham — ACAT Monday member who has not attended enough sessions for a
 * parent-facing Sessions Overview / weekly notes / group feedback rollup.
 * Kamy + Jack W + Jack S keep progress; Jacks also have Sunday Multiactivity.
 */
export function parentPortalSuppressSessionProgress(
  input: ParticipantIdentityInput,
): boolean {
  const contact = slugifyParticipantKey(input.contactId || "");
  if (contact === "197") return true;
  const slugs = expandParticipantClientSlugs(resolveParticipantClientSlugs(input));
  return slugs.some((s) => rosterParticipantSlugAlias(s) === "kate");
}

/**
 * ACAT group feedback rollup for parent portal — Kate excluded; Kamy / Jack W /
 * Jack S included (Sunday Multiactivity uses their own jack_* rows).
 */
export function acatGroupFeedbackEligibleSlugs(slugs: string[]): string[] {
  const base = expandParticipantClientSlugs(slugs);
  if (base.some((s) => rosterParticipantSlugAlias(s) === "kate")) {
    // Kate: never query / match collective ACAT feedback.
    return base.filter((s) => !ACAT_GROUP_CLIENT_SLUGS.has(slugifyParticipantKey(s)));
  }
  return withAcatGroupClientSlugs(base);
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
  const slugs = expandParticipantClientSlugs(resolveParticipantClientSlugs(input));
  const rowSlug = slugifyParticipantKey(rowClientId);
  const canonRowSlug = rosterParticipantSlugAlias(rowSlug);
  if (rowSlug && slugs.some((s) => s === rowSlug || s === canonRowSlug || rosterParticipantSlugAlias(s) === canonRowSlug)) {
    return true;
  }

  // Staff often write Monday 11–12 under collective "ACAT"; Kamy / Jack parents see it.
  // Kate is excluded (irregular attendance — no parent session progress / notes).
  if (
    (isAcatGroupClientId(rowClientId) || isAcatGroupClientId(rowName)) &&
    slugs.some((s) => {
      const canon = rosterParticipantSlugAlias(s);
      return ACAT_MEMBER_CLIENT_SLUGS.has(canon) && canon !== "kate";
    })
  ) {
    return true;
  }

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
