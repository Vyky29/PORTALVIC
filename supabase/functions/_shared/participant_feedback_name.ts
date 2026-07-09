/** Enforce the roster participant first name in feedback text (exact spelling). */

const NAME_ALIASES: Record<string, string[]> = {
  yusuf: ["yousef", "yousuf", "yosuf", "yusef"],
};

function str(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeNameKey(s: string): string {
  return str(s, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

export function canonicalParticipantFirstName(participantFullName: unknown): string {
  const parts = str(participantFullName, 200).split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function applyCanonicalCasing(canonical: string, matchedWord: string): string {
  if (matchedWord === matchedWord.toUpperCase()) return canonical.toUpperCase();
  if (matchedWord[0] === matchedWord[0].toUpperCase()) {
    return canonical.charAt(0).toUpperCase() + canonical.slice(1).toLowerCase();
  }
  return canonical.toLowerCase();
}

/** Replace misspellings (Yousef → Yusuf) with the roster first name. */
export function enforceParticipantFirstNameInText(
  text: unknown,
  participantFullName: unknown,
): string {
  const raw = str(text, 4000);
  const canonical = canonicalParticipantFirstName(participantFullName);
  if (!raw || !canonical) return raw;

  const normCanon = normalizeNameKey(canonical);
  const aliasSet = new Set((NAME_ALIASES[normCanon] || []).map(normalizeNameKey));

  return raw.replace(/\b[\p{L}]{2,24}\b/gu, (word) => {
    const wNorm = normalizeNameKey(word);
    if (!wNorm) return word;
    if (wNorm === normCanon) return applyCanonicalCasing(canonical, word);
    if (aliasSet.has(wNorm)) return applyCanonicalCasing(canonical, word);
    if (
      wNorm[0] === normCanon[0] &&
      word.length >= canonical.length - 2 &&
      word.length <= canonical.length + 2 &&
      levenshtein(wNorm, normCanon) <= 2
    ) {
      return applyCanonicalCasing(canonical, word);
    }
    return word;
  });
}

export function participantFirstNameSpellingOk(text: unknown, participantFullName: unknown): boolean {
  const raw = str(text, 4000);
  const canonical = canonicalParticipantFirstName(participantFullName);
  if (!canonical) return true;
  if (!new RegExp(`\\b${escapeRegex(canonical)}\\b`).test(raw)) return false;
  const normCanon = normalizeNameKey(canonical);
  for (const alias of NAME_ALIASES[normCanon] || []) {
    if (new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(raw)) return false;
  }
  return true;
}
