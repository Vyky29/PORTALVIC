#!/usr/bin/env node
/**
 * Editable Payments verify list (Participant · Service · Day · Paid · Invoice type).
 *
 *   node database/local-vault/tmp/gen-payments-verify-html.mjs
 *   node database/local-vault/tmp/gen-payments-verify-html.mjs --serve
 *
 * --serve opens http://127.0.0.1:8765 and Save writes to Portal (client_payments + roster).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { exec } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = path.join(root, "database/local-vault/tmp");
const outHtml = path.join(outDir, "payments-verify-list.html");
const PORT = 8765;
const SERVE = process.argv.includes("--serve");

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAID = {
  PRIVATE: "Using Private Funds",
  DP: "Using Funds from LA",
  LA: "Funded by LA",
  NHS: "Funded by NHS",
};
const INV = {
  PARENT_20: "Parent (20% included invoice)",
  PARENT_EX: "Parent (Exempt invoice)",
  LA: "Local Authority (Exempt invoice)",
  NHS: "NHS (Exempt invoice)",
};
const PAID_OPTS = [PAID.PRIVATE, PAID.DP, PAID.LA, PAID.NHS];
const INV_OPTS = [INV.PARENT_20, INV.PARENT_EX, INV.LA, INV.NHS];

/** Paid locks Invoice type — no free choice. */
function invForPaid(paid) {
  if (paid === PAID.PRIVATE) return INV.PARENT_20;
  if (paid === PAID.DP) return INV.PARENT_EX;
  if (paid === PAID.LA) return INV.LA;
  if (paid === PAID.NHS) return INV.NHS;
  return INV.PARENT_20;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dayTitle(d) {
  const map = {
    MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday",
    FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
    Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday",
    Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday", Sunday: "Sunday",
  };
  const t = String(d || "").trim();
  if (map[t]) return map[t];
  const up = t.slice(0, 3).toUpperCase();
  return map[up] || t || "";
}

function kindTitle(s) {
  const low = String(s || "").toLowerCase();
  if (/day\s*centre/.test(low)) return "Day Centre";
  if (/aquatic|swim/.test(low)) return "Aquatic Activity";
  if (/climb/.test(low)) return "Climbing Activity";
  if (/multi/.test(low)) return "Multi-Activity";
  if (/bespoke|\bff\b/.test(low)) return "Bespoke Programme";
  if (/physical|fitness|\bft\b/.test(low)) return "Physical Activity";
  if (/admin\s*fee|gocardless/i.test(low)) return "Admin Fee (GoCardless)";
  return String(s || "").trim() || "Activity";
}

function formatLine(sess) {
  const dur = Number(sess.durationMin) || 0;
  const svc = kindTitle(sess.service);
  if (svc === "Admin Fee (GoCardless)") return svc;
  const day = dayTitle(sess.day);
  const time = String(sess.timeSlot || sess.time || "").trim();
  const head = (dur ? dur + "' " : "") + svc;
  if (day && time) return `${head}, ${day} - ${time}`;
  if (day) return `${head}, ${day}`;
  if (time) return `${head} - ${time}`;
  return head;
}

/** Parse "90' Multi-Activity, Sunday - 12.30 pm to 2 pm" → session object. */
function parseServiceLine(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/admin\s*fee|gocardless/i.test(s)) {
    return { service: "Admin Fee (GoCardless)", day: "", timeSlot: "", durationMin: 0 };
  }
  const m = s.match(
    /^(\d+)\s*['′']?\s*([^,]+?)(?:,\s*([A-Za-z]+))?(?:\s*-\s*(.+))?$/i,
  );
  if (!m) {
    return { service: kindTitle(s), day: "", timeSlot: "", durationMin: 0 };
  }
  return {
    durationMin: parseInt(m[1], 10) || 0,
    service: kindTitle(m[2].trim()),
    day: dayTitle(m[3] || ""),
    timeSlot: String(m[4] || "").trim(),
  };
}

function slugify(name, key) {
  const s = String(key || name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (s.indexOf("aydaan") === 0) return "aydaan";
  if (s === "eiji" || s.indexOf("kacem_eiji") === 0 || (s.includes("belhadj") && s.includes("eiji"))) return "eiji";
  if (s === "hazem" || s.indexOf("hazem") === 0) return "hazem";
  if (s.indexOf("elijah") === 0) return "elijah";
  if (s.indexOf("aboodi") === 0 || s.indexOf("abodi") === 0) return "abodi-patel";
  return s;
}

function routeFromSheet(sheet, data) {
  const sh = String(sheet || "").toUpperCase();
  const paidRaw = String((data && (data.Paid || data["Paid by"])) || "");
  const fund = String((data && (data.Funder || data.Funding || data["Invoice type"])) || "");
  const blob = (paidRaw + " " + fund).toLowerCase();
  if (/funded by nhs|nhs \(exempt/i.test(blob)) {
    return { paid: PAID.NHS, inv: INV.NHS, group: "NHS", sheet: "LA" };
  }
  if (sh === "LA" || /funded by la|local authority \(exempt/i.test(blob)) {
    return { paid: PAID.LA, inv: INV.LA, group: "LA", sheet: "LA" };
  }
  if (sh === "DIRECT_PAYMENTS" || /using funds from la|parent \(exempt/i.test(blob)) {
    return { paid: PAID.DP, inv: INV.PARENT_EX, group: "Direct Payments", sheet: "DIRECT_PAYMENTS" };
  }
  if (sh === "PARENTS" || /using private funds|parent \(20/i.test(blob)) {
    return { paid: PAID.PRIVATE, inv: INV.PARENT_20, group: "Private", sheet: "PARENTS" };
  }
  if (/using private funds/i.test(paidRaw)) return { paid: PAID.PRIVATE, inv: INV.PARENT_20, group: "Private", sheet: "PARENTS" };
  if (/funded by la/i.test(paidRaw)) return { paid: PAID.LA, inv: INV.LA, group: "LA", sheet: "LA" };
  if (/using funds from la/i.test(paidRaw)) return { paid: PAID.DP, inv: INV.PARENT_EX, group: "Direct Payments", sheet: "DIRECT_PAYMENTS" };
  return { paid: paidRaw || "—", inv: String((data && data["Invoice type"]) || "—"), group: sh || "?", sheet: sh || "PARENTS" };
}

function sheetFromPaid(paid) {
  if (paid === PAID.PRIVATE) return "PARENTS";
  if (paid === PAID.DP) return "DIRECT_PAYMENTS";
  if (paid === PAID.LA || paid === PAID.NHS) return "LA";
  return "PARENTS";
}

function groupFromPaid(paid) {
  if (paid === PAID.PRIVATE) return "Private";
  if (paid === PAID.DP) return "Direct Payments";
  if (paid === PAID.NHS) return "NHS";
  if (paid === PAID.LA) return "LA";
  return "?";
}

/** Prefer Term on client_payments.data (Summer vs Autumn rows can share client_key). */
function termFromPaymentData(data) {
  const d = data && typeof data === "object" ? data : {};
  const raw = String(d.Term || d.term || d["Billing term"] || "").toLowerCase();
  if (/autumn|fall|\b26\s*\/\s*27\b|2026\s*[–\-/]\s*27|from 1 sep/i.test(raw)) return "Autumn 26/27";
  if (/summer|\b25\s*\/\s*26\b|2025\s*[–\-/]\s*26|from 1 jun/i.test(raw)) return "Summer 25/26";
  if (d["Autumn basis"] || d["Year billed (26/27)"]) return "Autumn 26/27";
  if (d["Summer basis"] || d["Year billed (25/26)"]) return "Summer 25/26";
  return "Summer 25/26";
}

/** Skip test demos + legacy Summer leavers (already settled / not re-enrolled). */
function skipVerifyPaymentRow(p, bySlug) {
  const name = String(p.client_name || "");
  const parent = String(p.parent_name || "");
  const key = String(p.client_key || "").toLowerCase();
  const data = p.data && typeof p.data === "object" ? p.data : {};
  const status = String(p.payment_status || "").toLowerCase();
  const servicesRaw = String(data.Services || data.Service || "");
  if (/\(test\)|\bTEST\b|demo £|matilla-2526/i.test(`${name} ${parent} ${key} ${servicesRaw}`)) return true;
  if (/not re-?enrolled|left|archived|inactive/i.test(status)) return true;
  const slug = slugify(p.client_name, p.client_key);
  const sessions = (bySlug && (bySlug[slug] || bySlug[key])) || [];
  const hasSvc = sessions.length > 0 || servicesRaw.split(/\s*[·•\n;]+\s*/).some((x) => x.trim());
  if (!hasSvc && /paid|settled|complete/i.test(status)) return true;
  if (!hasSvc && (p.amount == null || Number(p.amount) === 0) && !termFromPaymentData(data).startsWith("Autumn")) {
    /* Empty legacy summer shell with nothing to verify. */
    return true;
  }
  return false;
}

function autumnRoute(share, summer) {
  const via = String(share.created_via || "");
  const hint = String(share.payment_method_hint || "").toLowerCase();
  const summerSheet = summer ? String(summer.sheet || "").toUpperCase() : "";
  if (via === "la_office_auto" || hint === "la_funded" || summerSheet === "LA") {
    const label = String(share.funding_label || (summer && summer.data && summer.data.Funder) || "");
    if (/nhs/i.test(label)) return { paid: PAID.NHS, inv: INV.NHS, group: "NHS", sheet: "LA" };
    return { paid: PAID.LA, inv: INV.LA, group: "LA", sheet: "LA" };
  }
  if (summerSheet === "DIRECT_PAYMENTS") {
    return { paid: PAID.DP, inv: INV.PARENT_EX, group: "Direct Payments", sheet: "DIRECT_PAYMENTS" };
  }
  if (summerSheet === "PARENTS" || hint === "gocardless" || hint === "bank_transfer" || hint === "payment_link") {
    return { paid: PAID.PRIVATE, inv: INV.PARENT_20, group: "Private", sheet: "PARENTS" };
  }
  const vat = String(share.vat_mode || "").toLowerCase();
  if (vat === "exempt") return { paid: PAID.DP, inv: INV.PARENT_EX, group: "Direct Payments", sheet: "DIRECT_PAYMENTS" };
  return { paid: PAID.PRIVATE, inv: INV.PARENT_20, group: "Private", sheet: "PARENTS" };
}

function preferredParticipantName(summerName, autumnName) {
  const s = String(summerName || "").trim();
  const a = String(autumnName || "").trim();
  if (!s) return a || "—";
  if (!a) return s;
  if (s.toLowerCase() === a.toLowerCase()) return a;
  const sTok = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const aTok = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  /* Same first name → prefer the fuller portal form. */
  if (sTok[0] && sTok[0] === aTok[0]) {
    if (aTok.length > sTok.length || a.length >= s.length + 2) return a;
    if (sTok.length > aTok.length) return s;
    return a.length >= s.length ? a : s;
  }
  /* Short workbook / payment name inside legal name (Eiji ⊂ Kacem Eiji BELHADJ). */
  if (sTok.length === 1 && aTok.includes(sTok[0]) && aTok.length > 1) return a;
  if (aTok.length === 1 && sTok.includes(aTok[0]) && sTok.length > 1) return s;
  return s;
}

function preferredParentName(summerParent, autumnParent) {
  function personBit(raw) {
    let s = String(raw || "").trim();
    const ix = s.indexOf("·");
    if (ix > 0) {
      const left = s.slice(0, ix).trim();
      if (/ealing|h\s*&\s*f|nhs|lbhf|cwd|local authority|la\b/i.test(left)) {
        s = s.slice(ix + 1).trim() || s;
      }
    }
    return s;
  }
  return preferredParticipantName(personBit(summerParent), personBit(autumnParent));
}

function findSummerPayment(name, summerByNorm, summerByKey, clientKey) {
  if (clientKey && summerByKey[String(clientKey).toLowerCase()]) {
    return summerByKey[String(clientKey).toLowerCase()];
  }
  const nk = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!nk) return null;
  if (summerByNorm[nk]) return summerByNorm[nk];
  const first = nk.split(" ")[0];
  let hit = null;
  let hitScore = 0;
  Object.keys(summerByNorm).forEach((k) => {
    const row = summerByNorm[k];
    const kn = k;
    const kFirst = kn.split(" ")[0];
    if (kFirst !== first) return;
    /* Prefer summer key whose name is a prefix of autumn (Aydaan Ah ⊂ Aydaan Ahmed). */
    let score = 0;
    if (nk.startsWith(kn)) score = kn.length + 10;
    else if (kn.startsWith(nk)) score = nk.length + 5;
    else if (kFirst === first) score = first.length;
    if (score > hitScore) {
      hitScore = score;
      hit = row;
    }
  });
  return hit;
}

async function fetchAll(table, cols) {
  const rows = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await admin.from(table).select(cols).range(from, from + page - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return rows;
}

function rowIsValid(servicesText, paid, inv) {
  const reasons = [];
  if (invForPaid(paid) !== inv) reasons.push("Paid ≠ Invoice");
  const lines = String(servicesText || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) reasons.push("No service");
  lines.forEach((line) => {
    if (/admin\s*fee|gocardless/i.test(line)) return;
    if (!/\d+\s*['′']/.test(line)) reasons.push("Need duration");
    else if (!/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(line)) {
      reasons.push("Need day");
    } else if (!/\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?\s*(?:to|[–\-—])\s*\d/i.test(line)) {
      reasons.push("Need time");
    }
  });
  /* Deduplicate reasons */
  const uniq = [...new Set(reasons)];
  return { ok: uniq.length === 0, reasons: uniq };
}

function reviewStatusToken(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "done" || s === "ok" || s === "yes" || s === "true" || s === "1" || s === "reviewed";
}

/** Reviewed flag from client_payments.data — per term when present. */
function isReviewedFromData(data, term) {
  if (!data || typeof data !== "object") return false;
  const byTerm = data["Payments verify"] || data.PaymentsVerify;
  if (byTerm && typeof byTerm === "object") {
    const entry = byTerm[term] || byTerm[String(term || "").trim()];
    if (entry && typeof entry === "object") return reviewStatusToken(entry.status || entry.reviewed);
    if (reviewStatusToken(entry)) return true;
  }
  if (term && String(term).startsWith("Autumn")) {
    return reviewStatusToken(data["Payments review Autumn"]);
  }
  return reviewStatusToken(data["Payments review"] || data.PaymentsReview || data.verify_reviewed);
}

function setReviewedInData(data, term, reviewed) {
  const next = { ...(data && typeof data === "object" ? data : {}) };
  const byTerm = {
    ...(next["Payments verify"] && typeof next["Payments verify"] === "object"
      ? next["Payments verify"]
      : {}),
  };
  const key = String(term || "Summer 25/26").trim() || "Summer 25/26";
  if (reviewed) {
    byTerm[key] = { status: "Done", at: new Date().toISOString() };
    next["Payments review"] = "Done";
    next["Payments review at"] = byTerm[key].at;
    if (key.startsWith("Autumn")) next["Payments review Autumn"] = "Done";
  } else {
    delete byTerm[key];
    if (!Object.keys(byTerm).length) {
      delete next["Payments review"];
      delete next["Payments review at"];
      delete next["Payments review Autumn"];
      delete next["Payments verify"];
    } else {
      const anyDone = Object.values(byTerm).some((e) =>
        e && typeof e === "object" ? reviewStatusToken(e.status) : reviewStatusToken(e),
      );
      if (anyDone) next["Payments review"] = "Done";
      else delete next["Payments review"];
      if (key.startsWith("Autumn")) delete next["Payments review Autumn"];
    }
  }
  if (Object.keys(byTerm).length) next["Payments verify"] = byTerm;
  return next;
}

function selectHtml(name, value, opts) {
  return `<select class="ed ${name}" data-field="${name}">${opts.map((o) =>
    `<option value="${esc(o)}"${o === value ? " selected" : ""}>${esc(o)}</option>`,
  ).join("")}</select>`;
}

function buildHtml(rows) {
  const counts = { Private: 0, "Direct Payments": 0, LA: 0, NHS: 0, "?": 0 };
  let okN = 0;
  let badN = 0;
  let doneN = 0;
  let pendingN = 0;
  rows.forEach((r) => {
    const paid = PAID_OPTS.includes(r.paid) ? r.paid : PAID.PRIVATE;
    const g = groupFromPaid(paid);
    counts[g] = (counts[g] || 0) + 1;
    if (r.reviewed) doneN += 1;
    else pendingN += 1;
  });

  const body = rows.map((r, i) => {
    const servicesText = (r.services || []).join("\n");
    const paid = PAID_OPTS.includes(r.paid) ? r.paid : PAID.PRIVATE;
    const inv = invForPaid(paid);
    const group = groupFromPaid(paid);
    const check = rowIsValid(servicesText, paid, inv);
    if (check.ok) okN += 1;
    else badN += 1;
    const reviewed = !!r.reviewed;
    const dirtyHint = check.ok ? "" : " warn";
    const reviewedHint = reviewed ? " reviewed" : " pending";
    const validHtml = check.ok
      ? `<span class="valid ok" title="Format OK">OK</span>`
      : `<span class="valid bad" title="${esc(check.reasons.join(" · "))}">${esc(check.reasons[0] || "Check")}</span>`;
    return `<tr class="row${dirtyHint}${reviewedHint}" data-group="${esc(group)}" data-term="${esc(r.term)}" data-valid="${check.ok ? "1" : "0"}" data-reviewed="${reviewed ? "1" : "0"}"
  data-payment-id="${esc(r.paymentId || "")}"
  data-client-key="${esc(r.clientKey || "")}"
  data-client-name="${esc(r.participant || "")}"
  data-orig-paid="${esc(paid)}"
  data-orig-inv="${esc(inv)}"
  data-orig-svc="${esc(servicesText)}"
  data-orig-reviewed="${reviewed ? "1" : "0"}">
  <td class="n">${i + 1}</td>
  <td class="term">${esc(r.term)}</td>
  <td class="name"><strong>${esc(r.participant)}</strong>${r.parent ? `<div class="sub">${esc(r.parent)}</div>` : ""}${r.clientKey ? `<div class="sub key">${esc(r.clientKey)}</div>` : ""}</td>
  <td class="svc-cell"><textarea class="ed svc" data-field="services" rows="${Math.max(2, (r.services || []).length || 2)}" spellcheck="false">${esc(servicesText)}</textarea><div class="hint">One line per slot · e.g. 90' Multi-Activity, Sunday - 12.30 pm to 2 pm</div></td>
  <td>${selectHtml("paid", paid, PAID_OPTS)}</td>
  <td>${selectHtml("inv", inv, [inv])}</td>
  <td class="valid-cell">${validHtml}</td>
  <td class="review-cell">
    <input type="checkbox" class="ed review sr-only" data-field="reviewed"${reviewed ? " checked" : ""} />
    <div class="review-seg" role="group" aria-label="Review status">
      <button type="button" class="review-btn pending${!reviewed ? " on" : ""}" data-review="0">Pending</button>
      <button type="button" class="review-btn done${reviewed ? " on" : ""}" data-review="1">Done</button>
    </div>
  </td>
</tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payments verify — editable</title>
<style>
  :root { --bg:#f6f3ee; --ink:#1a1a1a; --muted:#6b6560; --line:#ddd6cc; --card:#fff; --accent:#1f4b3a; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 "IBM Plex Sans", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
  header { padding: 16px 20px 12px; background: #fff; border-bottom: 1px solid var(--line); }
  h1 { margin: 0 0 4px; font-size: 1.25rem; font-weight: 700; }
  .meta { color: var(--muted); font-size: 12px; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
  .filters label { font-size: 12px; color: var(--muted); }
  select, input[type="search"], input.ed, textarea.ed { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; width: 100%; }
  textarea.ed { min-height: 52px; resize: vertical; line-height: 1.35; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
  button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: #fff; cursor: pointer; font-weight: 600; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: wait; }
  button.active { background: #fff3e0; border-color: #ffcc80; color: #e65100; }
  label.chk { display: inline-flex; align-items: center; gap: 6px; }
  #status { font-size: 13px; color: var(--muted); }
  #status.ok { color: #1b5e20; }
  #status.err { color: #b71c1c; }
  .counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .counts span { background: #faf8f5; border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .wrap { padding: 12px 16px 48px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
  th, td { padding: 8px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  thead th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); background: #faf8f5; }
  .n { width: 36px; color: var(--muted); }
  .term { white-space: nowrap; font-size: 12px; color: var(--muted); width: 90px; }
  .name { min-width: 130px; max-width: 180px; }
  .sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .sub.key { font-size: 11px; opacity: .8; }
  .svc-cell { min-width: 300px; }
  .hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .valid-cell { white-space: nowrap; min-width: 72px; }
  .valid { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid var(--line); }
  .valid.ok { background: #e8f5e9; border-color: #a5d6a7; color: #1b5e20; }
  .valid.bad { background: #fff3e0; border-color: #ffcc80; color: #e65100; }
  .review-cell { min-width: 156px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
  .review-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; }
  .review-btn { font: inherit; font-size: 12px; font-weight: 700; padding: 6px 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
  .review-btn.pending.on { background: #fff3e0; color: #e65100; }
  .review-btn.done.on { background: #e8f5e9; color: #1b5e20; }
  .review-btn:not(.on):hover { background: #f5f5f5; color: var(--ink); }
  tr.reviewed { background: #f1f8f2; }
  tr.pending { background: #fff; }
  tr.warn { background: #fff8e1; }
  tr.warn.reviewed { background: #e8f5e9; }
  tr.dirty { outline: 2px solid #fb8c00; outline-offset: -2px; }
  tr.hide { display: none; }
  select.ed { min-width: 150px; }
  select.ed.inv { background: #f5f5f5; color: var(--muted); }
  .add-panel { margin: 12px 16px 0; padding: 12px 14px; background: #fff; border: 1px solid var(--line); border-radius: 12px; }
  .add-panel h2 { margin: 0 0 8px; font-size: 14px; }
  .add-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; align-items: end; }
  .add-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
  .add-grid .wide { grid-column: 1 / -1; }
  .add-grid textarea { min-height: 64px; }
  tr.new-row { background: #e3f2fd; }
  .linkish { font-size: 12px; color: var(--accent); word-break: break-all; }
</style>
</head>
<body>
<header>
  <h1>Payments verify — editable</h1>
  <div class="meta">Fuera del portal admin · <span class="linkish">http://127.0.0.1:8765/</span> · Click <strong>Done</strong> · <strong>Save</strong> escribe en Portal · puedes <strong>añadir filas</strong> abajo</div>
  <div class="filters">
    <label>Term
      <select id="term">
        <option value="">All</option>
        <option value="Summer 25/26">Summer 25/26</option>
        <option value="Autumn 26/27">Autumn 26/27</option>
      </select>
    </label>
    <label>Paid group
      <select id="group">
        <option value="">All</option>
        <option value="Private">Private</option>
        <option value="Direct Payments">Direct Payments</option>
        <option value="LA">LA</option>
        <option value="NHS">NHS</option>
      </select>
    </label>
    <label>Review
      <select id="reviewFilter">
        <option value="pending">Pending (not touched)</option>
        <option value="">All</option>
        <option value="done">Done (touched)</option>
      </select>
    </label>
    <label>Search <input type="search" id="q" placeholder="name…" /></label>
    <button type="button" id="btnOnlyBad">Format not OK</button>
    <button type="button" id="btnShowAll">Show all</button>
    <label class="chk"><input type="checkbox" id="onlyWarn" /> Format not OK</label>
  </div>
  <div class="actions">
    <button type="button" class="primary" id="btnSave">Save changes to Portal</button>
    <button type="button" id="btnExport">Download edits JSON</button>
    <button type="button" id="btnAddFocus">+ Add participant</button>
    <span id="status"></span>
  </div>
  <div class="counts">
    <span>Rows: ${rows.length}</span>
    <span>Pending: ${pendingN}</span>
    <span>Done: ${doneN}</span>
    <span>Format OK: ${okN}</span>
    <span>Format fix: ${badN}</span>
    <span id="dirtyCount">Edits: 0</span>
  </div>
</header>
<div class="add-panel" id="addPanel">
  <h2>Add participant row</h2>
  <div class="add-grid">
    <label>Name <input id="addName" placeholder="Participant" /></label>
    <label>Parent <input id="addParent" placeholder="Parent / funder label" /></label>
    <label>Client key <input id="addKey" placeholder="optional · auto from name" /></label>
    <label>Term
      <select id="addTerm">
        <option value="Summer 25/26">Summer 25/26</option>
        <option value="Autumn 26/27">Autumn 26/27</option>
      </select>
    </label>
    <label>Paid
      <select id="addPaid">
        <option value="Using Private Funds">Using Private Funds</option>
        <option value="Using Funds from LA">Using Funds from LA</option>
        <option value="Funded by LA">Funded by LA</option>
        <option value="Funded by NHS">Funded by NHS</option>
      </select>
    </label>
    <label class="wide">Services (one line per slot)
      <textarea id="addSvc" placeholder="90' Multi-Activity, Sunday - 12.30 pm to 2 pm"></textarea>
    </label>
  </div>
  <div class="actions" style="margin-top:8px">
    <button type="button" class="primary" id="btnAddRow">Add row to list</button>
    <span class="meta">Then edit if needed and Save to Portal (creates client_payments + roster)</span>
  </div>
</div>
<div class="wrap">
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Term</th>
      <th>Participant</th>
      <th>Service</th>
      <th>Paid</th>
      <th>Invoice type</th>
      <th>Format</th>
      <th>Reviewed</th>
    </tr>
  </thead>
  <tbody id="payBody">
${body}
  </tbody>
</table>
</div>
<script>
(function () {
  var term = document.getElementById("term");
  var group = document.getElementById("group");
  var reviewFilter = document.getElementById("reviewFilter");
  var q = document.getElementById("q");
  var onlyWarn = document.getElementById("onlyWarn");
  var statusEl = document.getElementById("status");
  var dirtyCount = document.getElementById("dirtyCount");
  var API = location.origin.indexOf("127.0.0.1") >= 0 || location.origin.indexOf("localhost") >= 0
    ? location.origin + "/api/save"
    : "";

  var INV_FOR_PAID = {
    "Using Private Funds": "Parent (20% included invoice)",
    "Using Funds from LA": "Parent (Exempt invoice)",
    "Funded by LA": "Local Authority (Exempt invoice)",
    "Funded by NHS": "NHS (Exempt invoice)",
  };
  var GROUP_FOR_PAID = {
    "Using Private Funds": "Private",
    "Using Funds from LA": "Direct Payments",
    "Funded by LA": "LA",
    "Funded by NHS": "NHS",
  };

  function validateServices(text, paid, inv) {
    var reasons = [];
    if ((INV_FOR_PAID[paid] || "") !== inv) reasons.push("Paid ≠ Invoice");
    var lines = String(text || "").split(/\\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!lines.length) reasons.push("No service");
    lines.forEach(function (line) {
      if (/admin\\s*fee|gocardless/i.test(line)) return;
      if (!/\\d+\\s*['′']/.test(line)) reasons.push("Need duration");
      else if (!/\\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b/i.test(line)) reasons.push("Need day");
      else if (!/\\d{1,2}(?:[.:]\\d{2})?\\s*(?:am|pm)?\\s*(?:to|[–\\-—])\\s*\\d/i.test(line)) reasons.push("Need time");
    });
    var uniq = [];
    reasons.forEach(function (r) { if (uniq.indexOf(r) < 0) uniq.push(r); });
    return { ok: !uniq.length, reasons: uniq };
  }

  function syncInvFromPaid(tr) {
    var paidEl = tr.querySelector('[data-field="paid"]');
    var invEl = tr.querySelector('[data-field="inv"]');
    if (!paidEl || !invEl) return;
    var paid = paidEl.value;
    var inv = INV_FOR_PAID[paid] || "Parent (20% included invoice)";
    invEl.innerHTML = "";
    var opt = document.createElement("option");
    opt.value = inv;
    opt.textContent = inv;
    opt.selected = true;
    invEl.appendChild(opt);
    invEl.value = inv;
    invEl.disabled = true;
    tr.setAttribute("data-group", GROUP_FOR_PAID[paid] || "");
  }

  function refreshValid(tr) {
    var v = rowValues(tr);
    var check = validateServices(v.services, v.paid, v.inv);
    var cell = tr.querySelector(".valid-cell");
    if (!cell) return;
    if (check.ok) {
      cell.innerHTML = '<span class="valid ok" title="Format OK">OK</span>';
      tr.classList.remove("warn");
      tr.setAttribute("data-valid", "1");
    } else {
      cell.innerHTML = '<span class="valid bad" title="' + check.reasons.join(" · ").replace(/"/g, "&quot;") + '">' + check.reasons[0] + "</span>";
      tr.classList.add("warn");
      tr.setAttribute("data-valid", "0");
    }
  }

  function refreshReviewedUI(tr) {
    var box = tr.querySelector('[data-field="reviewed"]');
    var on = !!(box && box.checked);
    tr.setAttribute("data-reviewed", on ? "1" : "0");
    tr.classList.toggle("reviewed", on);
    tr.classList.toggle("pending", !on);
    tr.querySelectorAll(".review-btn").forEach(function (btn) {
      var want = btn.getAttribute("data-review") === "1";
      btn.classList.toggle("on", want === on);
    });
  }

  function rowValues(tr) {
    var box = tr.querySelector('[data-field="reviewed"]');
    var nameEl = tr.querySelector(".name strong");
    var parentEl = tr.querySelector(".name .sub:not(.key)");
    return {
      paymentId: tr.getAttribute("data-payment-id") || "",
      clientKey: tr.getAttribute("data-client-key") || "",
      clientName: tr.getAttribute("data-client-name") || (nameEl ? nameEl.textContent : "") || "",
      parentName: parentEl ? parentEl.textContent : "",
      term: tr.getAttribute("data-term") || "",
      tempId: tr.getAttribute("data-temp-id") || "",
      services: (tr.querySelector('[data-field="services"]').value || "").trim(),
      paid: tr.querySelector('[data-field="paid"]').value,
      inv: tr.querySelector('[data-field="inv"]').value,
      reviewed: !!(box && box.checked),
    };
  }

  function markDirty(tr) {
    var v = rowValues(tr);
    refreshReviewedUI(tr);
    var dirty =
      v.services !== (tr.getAttribute("data-orig-svc") || "") ||
      v.paid !== (tr.getAttribute("data-orig-paid") || "") ||
      v.inv !== (tr.getAttribute("data-orig-inv") || "") ||
      (v.reviewed ? "1" : "0") !== (tr.getAttribute("data-orig-reviewed") || "0");
    tr.classList.toggle("dirty", dirty);
    dirtyCount.textContent = "Edits: " + document.querySelectorAll("tr.dirty").length;
    refreshValid(tr);
  }

  function collectEdits() {
    return Array.prototype.map.call(document.querySelectorAll("tr.dirty"), rowValues);
  }

  function rowIsBad(tr) {
    refreshValid(tr);
    if (tr.getAttribute("data-valid") === "0") return true;
    if (tr.querySelector(".valid.bad")) return true;
    if (tr.classList.contains("warn") && !tr.querySelector(".valid.ok")) return true;
    return false;
  }

  function applyFilter() {
    var t = term.value;
    var g = group.value;
    var rf = reviewFilter ? reviewFilter.value : "";
    var needle = (q.value || "").toLowerCase().trim();
    var warnOnly = !!(onlyWarn && onlyWarn.checked);
    document.querySelectorAll("tbody tr.row").forEach(function (tr) {
      refreshReviewedUI(tr);
      var ok = true;
      if (t && tr.getAttribute("data-term") !== t) ok = false;
      if (g && tr.getAttribute("data-group") !== g) ok = false;
      if (rf === "pending" && tr.getAttribute("data-reviewed") === "1") ok = false;
      if (rf === "done" && tr.getAttribute("data-reviewed") !== "1") ok = false;
      if (warnOnly && !rowIsBad(tr)) ok = false;
      if (needle) {
        var nameEl = tr.querySelector(".name");
        var name = (tr.getAttribute("data-client-name") || "") + " " + (nameEl ? nameEl.textContent : "");
        if (name.toLowerCase().indexOf(needle) < 0 && tr.textContent.toLowerCase().indexOf(needle) < 0) ok = false;
      }
      tr.classList.toggle("hide", !ok);
    });
    var pending = 0;
    var done = 0;
    document.querySelectorAll("tbody tr.row").forEach(function (tr) {
      if (tr.getAttribute("data-reviewed") === "1") done += 1;
      else pending += 1;
    });
    if (statusEl) {
      statusEl.textContent = "Pending " + pending + " · Done " + done;
      statusEl.className = pending ? "" : "ok";
    }
  }

  function setOnlyBad(on) {
    if (onlyWarn) onlyWarn.checked = !!on;
    var btn = document.getElementById("btnOnlyBad");
    if (btn) btn.classList.toggle("active", !!on);
    document.querySelectorAll("tbody tr.row").forEach(refreshValid);
    applyFilter();
  }

  document.querySelectorAll("tbody tr.row").forEach(function (tr) {
    syncInvFromPaid(tr);
    refreshValid(tr);
    refreshReviewedUI(tr);
  });

  document.querySelectorAll("tr.row .ed").forEach(function (el) {
    el.addEventListener("input", function () { markDirty(el.closest("tr")); applyFilter(); });
    el.addEventListener("change", function () {
      var tr = el.closest("tr");
      if (el.getAttribute("data-field") === "paid") syncInvFromPaid(tr);
      markDirty(tr);
      applyFilter();
    });
  });

  document.querySelectorAll("tr.row .review-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tr = btn.closest("tr");
      var box = tr.querySelector('[data-field="reviewed"]');
      if (!box) return;
      box.checked = btn.getAttribute("data-review") === "1";
      markDirty(tr);
      applyFilter();
    });
  });

  term.addEventListener("change", applyFilter);
  group.addEventListener("change", applyFilter);
  if (reviewFilter) reviewFilter.addEventListener("change", applyFilter);
  q.addEventListener("input", applyFilter);
  if (onlyWarn) onlyWarn.addEventListener("change", function () { setOnlyBad(onlyWarn.checked); });
  var btnOnlyBad = document.getElementById("btnOnlyBad");
  var btnShowAll = document.getElementById("btnShowAll");
  if (btnOnlyBad) btnOnlyBad.addEventListener("click", function () { setOnlyBad(true); });
  if (btnShowAll) btnShowAll.addEventListener("click", function () {
    setOnlyBad(false);
    if (reviewFilter) reviewFilter.value = "";
    applyFilter();
  });

  applyFilter();

  document.getElementById("btnExport").addEventListener("click", function () {
    var edits = collectEdits();
    var blob = new Blob([JSON.stringify({ saved_at: new Date().toISOString(), edits: edits }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "payments-verify-edits.json";
    a.click();
    statusEl.textContent = "Downloaded " + edits.length + " edits";
    statusEl.className = "ok";
  });

  document.getElementById("btnSave").addEventListener("click", async function () {
    var edits = collectEdits();
    if (!edits.length) {
      statusEl.textContent = "No edits to save";
      statusEl.className = "";
      return;
    }
    if (!API) {
      statusEl.textContent = "Open via --serve (http://127.0.0.1:8765) to save to Portal";
      statusEl.className = "err";
      return;
    }
    var btn = document.getElementById("btnSave");
    btn.disabled = true;
    statusEl.textContent = "Saving " + edits.length + "…";
    statusEl.className = "";
    try {
      var res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: edits }),
      });
      var j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      statusEl.textContent = "Saved " + (j.updated || edits.length) + " · " + (j.detail || "");
      statusEl.className = "ok";
      var byTemp = {};
      (j.results || []).forEach(function (r) {
        if (r && r.tempId && r.paymentId) byTemp[r.tempId] = r;
      });
      document.querySelectorAll("tr.dirty").forEach(function (tr) {
        var v = rowValues(tr);
        var temp = tr.getAttribute("data-temp-id") || "";
        if (temp && byTemp[temp] && byTemp[temp].paymentId) {
          tr.setAttribute("data-payment-id", byTemp[temp].paymentId);
          if (byTemp[temp].clientKey) tr.setAttribute("data-client-key", byTemp[temp].clientKey);
          tr.classList.remove("new-row");
          tr.removeAttribute("data-temp-id");
        }
        tr.setAttribute("data-orig-svc", v.services);
        tr.setAttribute("data-orig-paid", v.paid);
        tr.setAttribute("data-orig-inv", v.inv);
        tr.setAttribute("data-orig-reviewed", v.reviewed ? "1" : "0");
        tr.classList.remove("dirty");
        refreshReviewedUI(tr);
      });
      dirtyCount.textContent = "Edits: 0";
      applyFilter();
    } catch (e) {
      statusEl.textContent = "Save failed: " + (e && e.message ? e.message : e);
      statusEl.className = "err";
    }
    btn.disabled = false;
  });

  function slugKey(name, key) {
    if (key && String(key).trim()) return String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  }

  function bindRowEditors(tr) {
    tr.querySelectorAll(".ed").forEach(function (el) {
      el.addEventListener("input", function () { markDirty(tr); applyFilter(); });
      el.addEventListener("change", function () {
        if (el.getAttribute("data-field") === "paid") syncInvFromPaid(tr);
        markDirty(tr);
        applyFilter();
      });
    });
    tr.querySelectorAll(".review-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var box = tr.querySelector('[data-field="reviewed"]');
        if (!box) return;
        box.checked = btn.getAttribute("data-review") === "1";
        markDirty(tr);
        applyFilter();
      });
    });
  }

  document.getElementById("btnAddFocus").addEventListener("click", function () {
    document.getElementById("addPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("addName").focus();
  });

  document.getElementById("btnAddRow").addEventListener("click", function () {
    var name = (document.getElementById("addName").value || "").trim();
    if (!name) {
      statusEl.textContent = "Name required to add a row";
      statusEl.className = "err";
      return;
    }
    var parent = (document.getElementById("addParent").value || "").trim();
    var key = slugKey(name, document.getElementById("addKey").value);
    var termVal = document.getElementById("addTerm").value || "Summer 25/26";
    var paidVal = document.getElementById("addPaid").value || "Using Private Funds";
    var invVal = INV_FOR_PAID[paidVal] || "Parent (20% included invoice)";
    var svc = (document.getElementById("addSvc").value || "").trim();
    var groupVal = GROUP_FOR_PAID[paidVal] || "";
    var tempId = "new-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
    var n = document.querySelectorAll("tbody tr.row").length + 1;
    var svcRows = Math.max(2, svc.split(/\\n+/).filter(Boolean).length || 2);
    var tr = document.createElement("tr");
    tr.className = "row pending dirty new-row warn";
    tr.setAttribute("data-group", groupVal);
    tr.setAttribute("data-term", termVal);
    tr.setAttribute("data-valid", "0");
    tr.setAttribute("data-reviewed", "0");
    tr.setAttribute("data-payment-id", "");
    tr.setAttribute("data-client-key", key);
    tr.setAttribute("data-client-name", name);
    tr.setAttribute("data-temp-id", tempId);
    tr.setAttribute("data-orig-paid", "");
    tr.setAttribute("data-orig-inv", "");
    tr.setAttribute("data-orig-svc", "");
    tr.setAttribute("data-orig-reviewed", "0");
    tr.innerHTML =
      '<td class="n">' + n + "</td>" +
      '<td class="term">' + termVal + "</td>" +
      '<td class="name"><strong>' + name.replace(/</g, "&lt;") + "</strong>" +
        (parent ? '<div class="sub">' + parent.replace(/</g, "&lt;") + "</div>" : "") +
        '<div class="sub key">' + key.replace(/</g, "&lt;") + "</div></td>" +
      '<td class="svc-cell"><textarea class="ed svc" data-field="services" rows="' + svcRows + '" spellcheck="false">' +
        svc.replace(/</g, "&lt;") + "</textarea>" +
        '<div class="hint">One line per slot · e.g. 90\\' Multi-Activity, Sunday - 12.30 pm to 2 pm</div></td>' +
      '<td><select class="ed paid" data-field="paid">' +
        ["Using Private Funds","Using Funds from LA","Funded by LA","Funded by NHS"].map(function (o) {
          return '<option value="' + o + '"' + (o === paidVal ? " selected" : "") + ">" + o + "</option>";
        }).join("") +
      "</select></td>" +
      '<td><select class="ed inv" data-field="inv" disabled><option value="' + invVal + '" selected>' + invVal + "</option></select></td>" +
      '<td class="valid-cell"><span class="valid bad">Check</span></td>' +
      '<td class="review-cell">' +
        '<input type="checkbox" class="ed review sr-only" data-field="reviewed" />' +
        '<div class="review-seg" role="group">' +
          '<button type="button" class="review-btn pending on" data-review="0">Pending</button>' +
          '<button type="button" class="review-btn done" data-review="1">Done</button>' +
        "</div></td>";
    document.getElementById("payBody").appendChild(tr);
    bindRowEditors(tr);
    syncInvFromPaid(tr);
    markDirty(tr);
    if (reviewFilter) reviewFilter.value = "";
    applyFilter();
    tr.scrollIntoView({ behavior: "smooth", block: "center" });
    statusEl.textContent = "Added " + name + " · Save to write to Portal";
    statusEl.className = "ok";
    document.getElementById("addName").value = "";
    document.getElementById("addParent").value = "";
    document.getElementById("addKey").value = "";
    document.getElementById("addSvc").value = "";
  });
})();
</script>
</body>
</html>`;
}

function sheetForPaid(paid) {
  return sheetFromPaid(paid);
}

async function applyEdits(edits) {
  const results = [];
  for (const ed of edits || []) {
    const paymentId = String(ed.paymentId || "").trim();
    const clientKey = String(ed.clientKey || "").trim();
    const clientName = String(ed.clientName || "").trim();
    const parentName = String(ed.parentName || "").trim();
    const term = String(ed.term || "").trim() || "Summer 25/26";
    const tempId = String(ed.tempId || "").trim();
    const servicesText = String(ed.services || "").trim();
    const serviceLines = servicesText.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const paid = String(ed.paid || "").trim();
    const inv = invForPaid(paid);
    const sheet = sheetForPaid(paid);
    const reviewed = !!ed.reviewed;
    const sessions = serviceLines
      .map(parseServiceLine)
      .filter((s) => s && s.service && s.service !== "Admin Fee (GoCardless)");
    const servicesJoined = serviceLines.join(" · ");
    const key = clientKey || slugify(clientName, clientKey);

    let dataBase = {
      Services: servicesJoined,
      Paid: paid,
      "Invoice type": inv,
      Term: term.startsWith("Autumn") ? "AUTUMN TERM 26/27" : "SUMMER TERM 25/26",
    };
    if (paid === PAID.PRIVATE) dataBase.Funder = "Private";
    else if (paid === PAID.NHS) dataBase.Funder = "NHS";
    else if (paid === PAID.LA) dataBase.Funder = "Local Authority";
    else if (paid === PAID.DP) dataBase.Funder = "Direct Payments / Parent";
    dataBase = setReviewedInData(dataBase, term, reviewed);

    if (paymentId) {
      const { data: cur, error: ge } = await admin
        .from("client_payments")
        .select("id, data, sheet, client_key, client_name")
        .eq("id", paymentId)
        .maybeSingle();
      if (ge) throw ge;
      if (cur) {
        let data = { ...(cur.data && typeof cur.data === "object" ? cur.data : {}), ...dataBase };
        data.Services = servicesJoined;
        data.Paid = paid;
        data["Invoice type"] = inv;
        data = setReviewedInData(data, term, reviewed);
        if (paid === PAID.PRIVATE) {
          data.Funder = data.Funder && !/local authority|funded by la/i.test(String(data.Funder))
            ? data.Funder
            : "Private";
        }
        const { error: ue } = await admin
          .from("client_payments")
          .update({ data, sheet })
          .eq("id", paymentId);
        if (ue) throw ue;
        results.push({ paymentId, client: cur.client_name, clientKey: cur.client_key, reviewed, term, ok: true, tempId });
      }
    } else if (clientName || key) {
      /* New participant row from verify list. */
      const { data: maxRows } = await admin
        .from("client_payments")
        .select("row_index")
        .order("row_index", { ascending: false })
        .limit(1);
      const rowIndex = ((maxRows && maxRows[0] && Number(maxRows[0].row_index)) || 0) + 1;
      const insert = {
        sheet,
        row_index: rowIndex,
        client_key: key || slugify(clientName, ""),
        client_name: clientName || key,
        parent_name: parentName || null,
        payment_status: "Outstanding",
        amount: 0,
        data: dataBase,
        source_file: "payments_verify_add",
      };
      const { data: created, error: ie } = await admin
        .from("client_payments")
        .insert(insert)
        .select("id, client_key, client_name")
        .maybeSingle();
      if (ie) throw ie;
      results.push({
        paymentId: created && created.id,
        client: created && created.client_name,
        clientKey: created && created.client_key,
        reviewed,
        term,
        ok: true,
        created: true,
        tempId,
      });
    }

    if (key && sessions.length) {
      const { data: existing } = await admin
        .from("portal_participant_service_lines")
        .select("id, client_key, sessions")
        .eq("client_key", key)
        .maybeSingle();
      const payload = {
        client_key: key,
        client_name: clientName || key,
        client_name_norm: String(clientName || key).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        sessions,
        services_count: sessions.length,
        updated_at: new Date().toISOString(),
        source: "payments_verify_edit",
      };
      if (existing && existing.id) {
        const { error } = await admin
          .from("portal_participant_service_lines")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("portal_participant_service_lines").insert(payload);
        if (error) throw error;
      }
      results.push({ roster: key, sessions: sessions.length, ok: true });
    }
  }
  return results;
}

async function loadRows() {
  const [payments, lines, shares, contacts, docs] = await Promise.all([
    fetchAll("client_payments", "id, client_key, client_name, parent_name, sheet, payment_status, amount, data"),
    fetchAll("portal_participant_service_lines", "client_key, client_name, sessions"),
    fetchAll(
      "portal_parent_invoice_share",
      "id, contact_id, document_id, invoice_number, amount_gbp, payment_status, payment_method_hint, vat_mode, created_via, line_description, billing_term, reference_text, line_items",
    ),
    fetchAll("portal_parent_contacts", "contact_id, child_display, parent_display, funding_label"),
    fetchAll("documents", "id, related_client, title").catch(() => []),
  ]);

  const bySlug = Object.create(null);
  for (const line of lines) {
    const slug = slugify(line.client_name, line.client_key);
    if (!slug) continue;
    bySlug[slug] = Array.isArray(line.sessions) ? line.sessions : [];
    bySlug[String(line.client_key || "").toLowerCase()] = bySlug[slug];
  }

  const summerByNorm = Object.create(null);
  const summerByKey = Object.create(null);
  const autumnPayByKey = Object.create(null);
  const autumnPayByNorm = Object.create(null);
  for (const p of payments) {
    const data = p.data && typeof p.data === "object" ? p.data : {};
    const term = termFromPaymentData(data);
    const nk = String(p.client_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const ck = p.client_key ? String(p.client_key).toLowerCase() : "";
    if (term.startsWith("Autumn")) {
      if (nk) autumnPayByNorm[nk] = p;
      if (ck) autumnPayByKey[ck] = p;
      continue;
    }
    if (nk) summerByNorm[nk] = p;
    if (ck) summerByKey[ck] = p;
  }

  const contactById = Object.create(null);
  const contactsList = contacts || [];
  for (const c of contactsList) contactById[String(c.contact_id)] = c;

  const firstNameCount = Object.create(null);
  contactsList.forEach((c) => {
    const first = String(c.child_display || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0];
    if (!first) return;
    firstNameCount[first] = (firstNameCount[first] || 0) + 1;
  });

  function contactForSummerName(clientName) {
    const nk = String(clientName || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!nk) return null;
    const toks = nk.split(/\s+/).filter(Boolean);
    let best = null;
    let bestScore = 0;
    contactsList.forEach((c) => {
      const an = String(c.child_display || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!an) return;
      if (an === nk) {
        best = c;
        bestScore = 1000;
        return;
      }
      if (an.startsWith(nk) && an.length > nk.length) {
        const score = 500 + nk.length;
        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
        return;
      }
      const aTok = an.split(/\s+/).filter(Boolean);
      if (toks[0] && toks[0] === aTok[0]) {
        if (toks[1] && aTok[1] && aTok[1].startsWith(toks[1])) {
          const score = 400 + toks[1].length;
          if (score > bestScore) {
            best = c;
            bestScore = score;
          }
        } else if (toks.length === 1 && aTok.length >= 2 && firstNameCount[toks[0]] === 1) {
          const score = 200;
          if (score > bestScore) {
            best = c;
            bestScore = score;
          }
        }
      } else if (toks.length === 1 && aTok.includes(toks[0]) && aTok.length > 1) {
        /* Eiji ⊂ Kacem Eiji BELHADJ */
        const score = 360 + toks[0].length;
        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
      }
    });
    return best;
  }

  const docById = Object.create(null);
  for (const d of docs) docById[String(d.id)] = d;

  /* paymentId → canon display names (unify Summer + Autumn). */
  const canonByPaymentId = Object.create(null);

  /* Enrich from portal contacts even without Autumn INV-P (e.g. Aydaan LA). */
  for (const p of payments) {
    const hit = contactForSummerName(p.client_name);
    if (!hit || !p.id) continue;
    const participant = preferredParticipantName(p.client_name, hit.child_display);
    const parent = preferredParentName(p.parent_name, hit.parent_display);
    canonByPaymentId[p.id] = { participant, parent, summer: p, contact: hit };
  }

  const rows = [];

  function pushPaymentRow(p, displayName, displayParent) {
    const data = p.data && typeof p.data === "object" ? p.data : {};
    const term = termFromPaymentData(data);
    const route = routeFromSheet(p.sheet, data);
    const slug = slugify(p.client_name, p.client_key);
    const sessions = bySlug[slug] || bySlug[String(p.client_key || "").toLowerCase()] || [];
    /* Autumn payment rows keep their own Services text — roster is shared across terms. */
    const services = (!term.startsWith("Autumn") && sessions.length)
      ? sessions.map(formatLine).filter(Boolean)
      : String(data.Services || data.Service || "")
          .split(/\s*[·•\n;]+\s*/)
          .map((x) => x.trim())
          .filter(Boolean);
    const days = (!term.startsWith("Autumn") && sessions.length)
      ? sessions.map((s) => dayTitle(s.day)).filter(Boolean)
      : services.map((s) => {
          const m = String(s).match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
          return m ? m[1] : "";
        }).filter(Boolean);
    const rawBits = String(data.Services || "").toLowerCase();
    if (/admin\s*fee|gocardless|direct payment.*fee/.test(rawBits)
      && !services.some((s) => /admin fee/i.test(s))) {
      services.push("Admin Fee (GoCardless)");
    }
    rows.push({
      term,
      participant: displayName || p.client_name || p.client_key || "—",
      parent: displayParent || p.parent_name || "",
      services,
      days,
      paid: route.paid,
      inv: data["Invoice type"] || route.inv,
      group: route.group,
      sheet: p.sheet,
      paymentId: p.id,
      clientKey: p.client_key || "",
      reviewed: isReviewedFromData(data, term),
    });
  }

  /* First: collect autumn ↔ summer links and canon names. */
  const autumnPacks = [];
  const autumnSeen = Object.create(null);
  for (const sh of shares) {
    const via = String(sh.created_via || "");
    if (via !== "reenrolment" && via !== "la_office_auto") continue;
    if (String(sh.payment_status || "").toLowerCase() === "void") continue;
    const cid = String(sh.contact_id || "");
    const c = contactById[cid] || {};
    const doc = docById[String(sh.document_id || "")] || {};
    const autumnName = c.child_display || doc.related_client || "—";
    const key = via === "la_office_auto" ? String(sh.id) : cid || String(sh.id);
    if (!key || autumnSeen[key]) continue;
    autumnSeen[key] = 1;
    const summer = findSummerPayment(autumnName, summerByNorm, summerByKey, "");
    const participant = preferredParticipantName(summer && summer.client_name, autumnName);
    const parent = preferredParentName(summer && summer.parent_name, c.parent_display || (summer && summer.parent_name) || "");
    if (summer && summer.id) {
      const prev = canonByPaymentId[summer.id];
      canonByPaymentId[summer.id] = {
        participant: preferredParticipantName(prev && prev.participant, participant),
        parent: preferredParentName(prev && prev.parent, parent),
        summer,
        contact: c,
      };
    }
    autumnPacks.push({ sh, c, summer, participant, parent, autumnName });
  }

  for (const p of payments) {
    if (skipVerifyPaymentRow(p, bySlug)) continue;
    const canon = p.id && canonByPaymentId[p.id];
    pushPaymentRow(
      p,
      canon ? canon.participant : p.client_name,
      canon ? canon.parent : p.parent_name,
    );
  }

  /* Names already covered by an Autumn client_payments row — don’t also invent Autumn from shares. */
  const autumnCovered = new Set();
  for (const r of rows) {
    if (!r.term.startsWith("Autumn")) continue;
    const nk = String(r.participant || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (nk) autumnCovered.add(nk);
    if (r.clientKey) autumnCovered.add(String(r.clientKey).toLowerCase());
  }

  for (const pack of autumnPacks) {
    const { sh, c, summer, participant, parent } = pack;
    const slug = slugify(participant, summer && summer.client_key);
    const nk = String(participant || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const ck = summer && summer.client_key ? String(summer.client_key).toLowerCase() : "";
    if ((nk && autumnCovered.has(nk)) || (ck && autumnCovered.has(ck)) || (slug && autumnCovered.has(slug))) {
      continue;
    }
    /* If an autumn payment exists under another name key, prefer it (already pushed). */
    const autumnPay = (ck && autumnPayByKey[ck]) || (nk && autumnPayByNorm[nk]) || null;
    if (autumnPay) continue;

    const route = autumnRoute({ ...sh, funding_label: c.funding_label }, summer);
    const sessions = bySlug[slug] || (summer ? bySlug[slugify(summer.client_name, summer.client_key)] : []) || [];
    let services = sessions.length ? sessions.map(formatLine).filter(Boolean) : [];
    if (!services.length && Array.isArray(sh.line_items)) {
      services = sh.line_items
        .map((it) => {
          const desc = String((it && it.description) || "").trim();
          const detail = String((it && it.detail) || "").trim();
          if (/gocardless|admin fee|direct payment.*fee/i.test(desc)) return "Admin Fee (GoCardless)";
          if (!desc) return "";
          const m = desc.match(/^(.+?)\s+(\d+)\s*['′']?$/i) || desc.match(/^(\d+)\s*['′']?\s*(.+)$/i);
          let head = desc;
          if (m) {
            if (/^\d+$/.test(m[1])) head = `${m[1]}' ${kindTitle(m[2])}`;
            else head = `${m[2]}' ${kindTitle(m[1])}`;
          }
          const dayMatch = detail.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
          const timeMatch = detail.match(/(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?\s*(?:to|[–\-—])\s*\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?)/i);
          const day = dayMatch ? dayMatch[1] : "";
          const time = timeMatch ? timeMatch[1].replace(/\s+/g, " ") : "";
          if (day && time) return `${head}, ${day} - ${time}`;
          if (day) return `${head}, ${day}`;
          return head;
        })
        .filter(Boolean);
    }
    if (!services.length && summer && summer.data) {
      services = String(summer.data.Services || summer.data.Service || "")
        .split(/\s*[·•\n;]+\s*/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8);
    }
    const days = sessions.length
      ? sessions.map((s) => dayTitle(s.day)).filter(Boolean)
      : services.map((s) => {
          const m = String(s).match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
          return m ? m[1] : "";
        }).filter(Boolean);

    const summerData = summer && summer.data && typeof summer.data === "object" ? summer.data : {};
    rows.push({
      term: "Autumn 26/27",
      participant,
      parent,
      services,
      days: [...new Set(days)],
      paid: route.paid,
      inv: route.inv,
      group: route.group,
      sheet: route.sheet,
      paymentId: summer ? summer.id : "",
      clientKey: (summer && summer.client_key) || slugify(participant, ""),
      reviewed: isReviewedFromData(summerData, "Autumn 26/27"),
    });
  }

  function normClientNameKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  /* Stream identity = client_key (Tinashe LA vs NHS). Do not collapse same child name across keys. */
  const autumnKeys = new Set();
  for (const r of rows) {
    if (!r.term.startsWith("Autumn")) continue;
    if (r.clientKey) autumnKeys.add(String(r.clientKey).toLowerCase());
    if (r.paymentId) autumnKeys.add("pay:" + String(r.paymentId));
  }
  for (const p of payments) {
    if (skipVerifyPaymentRow(p, bySlug)) continue;
    const data = p.data && typeof p.data === "object" ? p.data : {};
    /* Already pushed with correct term from client_payments. */
    if (termFromPaymentData(data).startsWith("Autumn")) continue;
    if (String(p.sheet || "").toUpperCase() !== "LA") continue;
    const ck = p.client_key ? String(p.client_key).toLowerCase() : "";
    if (ck && autumnKeys.has(ck)) continue;
    if (p.id && autumnKeys.has("pay:" + String(p.id))) continue;
    if (ck && autumnPayByKey[ck]) continue;
    const canon = p.id && canonByPaymentId[p.id];
    const display = canon ? canon.participant : (p.client_name || p.client_key || "—");
    const route = routeFromSheet(p.sheet, data);
    const slug = slugify(p.client_name, p.client_key);
    const sessions = bySlug[slug] || bySlug[ck] || [];
    /* Prefer payment Services (already split per funder stream). */
    let services = String(data.Services || data.Service || "")
      .split(/\s*[·•\n;]+\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!services.length && sessions.length) {
      services = sessions.map(formatLine).filter(Boolean);
    }
    if (ck) autumnKeys.add(ck);
    if (p.id) autumnKeys.add("pay:" + String(p.id));
    rows.push({
      term: "Autumn 26/27",
      participant: display,
      parent: preferredParentName(
        canon ? canon.parent : (p.parent_name || ""),
        p.parent_name || "",
      ),
      services,
      days: sessions.length
        ? sessions.map((s) => dayTitle(s.day)).filter(Boolean)
        : services.map((s) => {
            const m = String(s).match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
            return m ? m[1] : "";
          }).filter(Boolean),
      paid: route.paid,
      inv: data["Invoice type"] || route.inv,
      group: route.group,
      sheet: "LA",
      paymentId: p.id,
      clientKey: p.client_key || "",
      reviewed: isReviewedFromData(data, "Autumn 26/27"),
    });
  }

  rows.sort((a, b) => {
    if (a.term !== b.term) return a.term.localeCompare(b.term);
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return String(a.participant).localeCompare(String(b.participant));
  });
  return rows;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const rows = await loadRows();
  writeFileSync(outHtml, buildHtml(rows), "utf8");
  console.log("Wrote", outHtml);
  console.log("Summer:", rows.filter((r) => r.term.startsWith("Summer")).length);
  console.log("Autumn:", rows.filter((r) => r.term.startsWith("Autumn")).length);

  if (!SERVE) {
    console.log("\nTo edit & save to Portal, run:");
    console.log("  node database/local-vault/tmp/gen-payments-verify-html.mjs --serve");
    return;
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html" || req.url.startsWith("/?"))) {
      /* Re-read so regen without restart picks up HTML file changes when we rewrite before restart. */
      const live = readFileSync(outHtml, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(live);
      return;
    }
    if (req.method === "POST" && req.url === "/api/save") {
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body || "{}");
        const results = await applyEdits(payload.edits || []);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          updated: results.length,
          detail: results.map((r) => r.client || r.roster).filter(Boolean).slice(0, 8).join(", "),
          results,
        }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
      }
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  server.listen(PORT, "127.0.0.1", () => {
    const href = `http://127.0.0.1:${PORT}/`;
    console.log("Editable list:", href);
    exec(`open "${href}"`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
