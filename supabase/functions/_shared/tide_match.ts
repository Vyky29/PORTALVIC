/** Tide CSV parse + INV-P match scoring (Deno / shared). */

export type TideMatchScore = "strong" | "medium" | "none";

export type TideCsvRow = {
  tide_tx_id: string;
  booking_date: string | null;
  amount_gbp: number;
  reference_raw: string;
  debit: boolean;
};

export type TideInvoiceCandidate = {
  id: string;
  invoice_number: string | null;
  amount_gbp: number | string | null;
  contact_id: string | null;
  reference_text: string | null;
  parent_reported_ref: string | null;
  display_name?: string | null;
};

const PAYOUT_NOISE =
  /\b(stripe|gocardless|go\s*cardless|paypal|sumup|shopify|payout|transferwise|wise\s+payments)\b/i;

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeRef(v: unknown): string {
  return clean(v, 300)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function amountsEqual(a: unknown, b: unknown, eps = 0.011): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= eps;
}

/** Stable id when Tide export has no transaction id column. */
export function tideTxIdFromParts(
  bookingDate: string | null,
  amountGbp: number,
  referenceRaw: string,
): string {
  const key = [
    bookingDate || "",
    amountGbp.toFixed(2),
    normalizeRef(referenceRaw),
  ].join("|");
  // FNV-1a 32-bit → hex (no crypto dep for Deno/node smoke)
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "tide-" + (h >>> 0).toString(16).padStart(8, "0") + "-" +
    Math.abs(Math.round(amountGbp * 100)).toString(16);
}

function parseAmountCell(raw: string): number | null {
  let s = clean(raw, 40).replace(/£/g, "").replace(/,/g, "");
  if (!s) return null;
  // Accounting: (12.50) = debit/negative
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

function parseDateCell(raw: string): string | null {
  const s = clean(raw, 40);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function headerIndex(headers: string[], aliases: string[]): number {
  const norm = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, "")
  );
  for (const a of aliases) {
    const want = a.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const i = norm.indexOf(want);
    if (i >= 0) return i;
  }
  // contains
  for (const a of aliases) {
    const want = a.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const i = norm.findIndex((h) => h.includes(want));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Parse Tide / generic bank CSV. Credits (amount > 0) only.
 * Flexible headers: Date, Amount, Description|Reference|Narrative, optional Transaction ID.
 */
export function parseTideCsv(csvText: string): {
  rows: TideCsvRow[];
  skipped: number;
  error?: string;
} {
  const text = String(csvText || "").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { rows: [], skipped: 0, error: "csv_empty" };

  const headers = splitCsvLine(lines[0]).map((h) => clean(h, 80));
  const iDate = headerIndex(headers, [
    "date",
    "bookingdate",
    "transactiondate",
    "valuedate",
  ]);
  const iAmount = headerIndex(headers, [
    "amount",
    "amountgbp",
    "value",
    "credit",
  ]);
  const iRef = headerIndex(headers, [
    "description",
    "reference",
    "narrative",
    "details",
    "payeereference",
    "transactiondescription",
  ]);
  const iId = headerIndex(headers, [
    "transactionid",
    "id",
    "txid",
    "banktransactionid",
  ]);

  if (iAmount < 0 || iRef < 0) {
    return {
      rows: [],
      skipped: 0,
      error: "csv_missing_columns",
    };
  }

  const rows: TideCsvRow[] = [];
  let skipped = 0;
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li]);
    if (!cols.some((c) => clean(c, 20))) continue;
    const amount = parseAmountCell(cols[iAmount] || "");
    if (amount == null) {
      skipped++;
      continue;
    }
    const debit = amount < 0;
    const amountAbs = Math.abs(amount);
    if (amountAbs < 0.01) {
      skipped++;
      continue;
    }
    const reference_raw = clean(cols[iRef] || "", 300);
    const booking_date = iDate >= 0 ? parseDateCell(cols[iDate] || "") : null;
    let tide_tx_id = iId >= 0 ? clean(cols[iId] || "", 120) : "";
    if (!tide_tx_id) {
      tide_tx_id = tideTxIdFromParts(booking_date, amountAbs, reference_raw);
    }
    if (debit || PAYOUT_NOISE.test(reference_raw)) {
      // Still store debits/noise? Plan says ignore — skip insert for these.
      skipped++;
      continue;
    }
    rows.push({
      tide_tx_id,
      booking_date,
      amount_gbp: amountAbs,
      reference_raw,
      debit: false,
    });
  }
  return { rows, skipped };
}

function invoiceNumberInRef(refNorm: string, invoiceNumber: string | null): boolean {
  const inv = clean(invoiceNumber, 40).toUpperCase();
  if (!inv) return false;
  const invNorm = normalizeRef(inv);
  if (invNorm && refNorm.includes(invNorm)) return true;
  // INV-P-0012 style without dashes
  const m = inv.match(/INV-?P-?(\d+)/i);
  if (m) {
    const compact = "INVP" + m[1];
    if (refNorm.includes(compact)) return true;
  }
  return false;
}

function fuzzyNameHit(refNorm: string, candidates: string[]): boolean {
  for (const c of candidates) {
    const tokens = clean(c, 120)
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3);
    if (!tokens.length) continue;
    const hits = tokens.filter((t) => refNorm.includes(normalizeRef(t)));
    if (hits.length >= Math.min(2, tokens.length) || (tokens.length === 1 && hits.length === 1)) {
      return true;
    }
  }
  return false;
}

export function scoreTideAgainstInvoice(
  row: TideCsvRow,
  inv: TideInvoiceCandidate,
): TideMatchScore {
  if (!amountsEqual(row.amount_gbp, inv.amount_gbp)) return "none";
  const refNorm = normalizeRef(row.reference_raw);
  if (!refNorm) return "none";

  if (invoiceNumberInRef(refNorm, inv.invoice_number)) return "strong";

  const soft = [
    inv.reference_text,
    inv.parent_reported_ref,
    inv.display_name,
  ].filter(Boolean) as string[];
  if (fuzzyNameHit(refNorm, soft)) return "medium";
  return "none";
}

export function bestMatchForRow(
  row: TideCsvRow,
  invoices: TideInvoiceCandidate[],
): { invoice: TideInvoiceCandidate | null; score: TideMatchScore } {
  let best: TideInvoiceCandidate | null = null;
  let bestScore: TideMatchScore = "none";
  const rank = { none: 0, medium: 1, strong: 2 };
  for (const inv of invoices) {
    const s = scoreTideAgainstInvoice(row, inv);
    if (rank[s] > rank[bestScore]) {
      bestScore = s;
      best = inv;
    }
  }
  return { invoice: bestScore === "none" ? null : best, score: bestScore };
}
