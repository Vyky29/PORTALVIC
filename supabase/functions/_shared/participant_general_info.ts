export type GeneralInfoField = {
  num: string;
  label: string;
  value: string;
};

export function cleanText(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
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

export function parseGeneralInfoSheet(raw: string): GeneralInfoField[] {
  const t = String(raw || "").trim();
  if (!t) return [];

  let chunks: string[] = [];
  if (/\n\s*\d+\.\s+/.test(t)) {
    chunks = t.split(/\n(?=\s*\d+\.\s+)/).map((s) => s.trim()).filter(Boolean);
  }
  if (chunks.length < 2) {
    chunks = t.split(/\s(?=\d+\.\s+)/).map((s) => s.trim()).filter(Boolean);
  }

  const rowRe = /^(\d+)\.\s*([^:]+):\s*(.*)$/s;
  const out: GeneralInfoField[] = [];
  for (const chunk of chunks) {
    const m = chunk.match(rowRe);
    if (!m) continue;
    out.push({
      num: m[1],
      label: m[2].trim(),
      value: m[3].trim(),
    });
  }
  return out;
}

export function rebuildGeneralInfoSheet(fields: GeneralInfoField[]): string {
  return (fields || [])
    .filter((f) => f && String(f.label || "").trim())
    .map((f) => {
      const num = String(f.num || "").trim() || "1";
      const label = String(f.label || "").trim();
      const value = String(f.value ?? "").trim();
      return `${num}. ${label}: ${value}`;
    })
    .join("\n");
}

export function instructorFirstName(raw: unknown): string {
  const t = cleanText(raw, 120);
  if (!t || t === "—") return "—";
  const first = t.split(/\s+/).filter(Boolean)[0] || t;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function formatGeneralInfoHtml(raw: string, emptyLabel = "No general information yet."): string {
  const fields = parseGeneralInfoSheet(raw);
  if (!fields.length) {
    const t = String(raw || "").trim();
    if (!t) return `<p class="pp-gen-empty">${escapeHtml(emptyLabel)}</p>`;
    return `<p class="pp-gen-fallback">${escapeHtml(t).replace(/\n/g, "<br>")}</p>`;
  }
  return (
    '<div class="pp-gen-list" role="list">' +
    fields
      .map(
        (f) =>
          '<div class="pp-gen-row" role="listitem">' +
          `<div class="pp-gen-row__label">${escapeHtml(f.label)}</div>` +
          `<div class="pp-gen-row__value">${escapeHtml(f.value || "—")}</div>` +
          "</div>",
      )
      .join("") +
    "</div>"
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
