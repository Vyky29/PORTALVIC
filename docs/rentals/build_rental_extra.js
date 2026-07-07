/**
 * Generates two rental reference PDFs (HTML source) using the authoritative
 * 2026/27 calendar data:
 *   - Westway — Sundays climbing (2 entrances)
 *   - SwimFarm — HubRoom (3 terms) + Sunday pool hire 9–3 + Day Centre pool (Mon/Wed/Fri 12–1)
 * Shares the CSS/branding of pool-room-rental-schedule-2026-27.html.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const CAL_SECTION = path.resolve(
  DIR,
  "../../working_ui/portal/day-centre-calendar-2026-27-section.html"
);
const BASE_HTML = path.join(DIR, "pool-room-rental-schedule-2026-27.html");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_IDX = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
};

function d(iso) { const [y,m,dd]=iso.split("-").map(Number); return new Date(Date.UTC(y,m-1,dd,12)); }
function iso(dt){ return dt.toISOString().slice(0,10); }
function fmt(dt){ return dt.getUTCDate()+" "+MONTHS[dt.getUTCMonth()]; }
function fmtLong(isoStr){ const t=d(isoStr); return t.getUTCDate()+" "+MONTHS[t.getUTCMonth()]+" "+t.getUTCFullYear(); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function gbp(n){ return "\u00a3" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ---- After-School & Weekends terms (for Sundays) ---- */
const AS_TERMS = [
  { name: "Autumn Term", year: "2026", start: "2026-09-05", end: "2026-12-18" },
  { name: "Spring Term", year: "2027", start: "2027-01-04", end: "2027-03-25" },
  { name: "Summer Term", year: "2027", start: "2027-04-12", end: "2027-07-16" },
];
const AS_CLOSED = [
  ["2026-10-24","2026-11-01"],
  ["2026-12-19","2027-01-03"],
  ["2027-02-13","2027-02-21"],
  ["2027-03-26","2027-04-11"],
  ["2027-05-29","2027-06-06"],
];
function asClosed(dt){ const s=iso(dt); return AS_CLOSED.some(([a,b])=>s>=a&&s<=b); }
function sundaysFor(term){
  const out=[]; const end=d(term.end);
  for(let c=d(term.start); c<=end; c=new Date(c.getTime()+86400000)){
    if(c.getUTCDay()!==0) continue;
    if(asClosed(c)) continue;
    out.push(fmt(c));
  }
  return out;
}

/* ---- Day Centre open days parsed from the calendar's green cells ---- */
function parseDayCentreOpenDates(){
  const html = fs.readFileSync(CAL_SECTION, "utf8");
  const startIdx = html.indexOf('id="dcCalDayCentrePanel"');
  const endIdx = html.indexOf('id="dcCalSessionsPanel"');
  const panel = html.slice(startIdx, endIdx > -1 ? endIdx : undefined);
  const segments = panel.split(/<h4 class="dc-cal-month__label">/).slice(1);
  const open = [];
  segments.forEach((seg) => {
    const label = seg.slice(0, seg.indexOf("</h4>")).trim().toLowerCase();
    const parts = label.split(/\s+/);
    const mo = MONTH_IDX[parts[0]];
    const yr = parseInt(parts[1], 10);
    if (mo == null || !yr) return;
    const re = /dc-cal-cell--green[^>]*>\s*<span class="dc-cal-day">(\d+)<\/span>/g;
    let m;
    while ((m = re.exec(seg))) {
      const day = parseInt(m[1], 10);
      const isoStr = yr + "-" + String(mo + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      open.push(isoStr);
    }
  });
  return open.sort();
}

const DC_TERMS = [
  { name: "Autumn Term", year: "2026", start: "2026-09-01", end: "2026-12-18" },
  { name: "Spring Term", year: "2027", start: "2027-01-04", end: "2027-03-25" },
  { name: "Summer Term", year: "2027", start: "2027-04-12", end: "2027-07-30" },
];
function dcMonWedFriByTerm(openDates){
  const set = new Set(openDates);
  const byTerm = DC_TERMS.map((t) => ({ term: t, dates: [] }));
  Array.from(set).sort().forEach((s) => {
    const dt = d(s);
    const dow = dt.getUTCDay(); // Mon=1 Wed=3 Fri=5
    if (dow !== 1 && dow !== 3 && dow !== 5) return;
    const hit = byTerm.find((b) => s >= b.term.start && s <= b.term.end);
    if (hit) hit.dates.push(fmt(dt));
  });
  return byTerm;
}

/* ---- Shared shell ---- */
const baseHtml = fs.readFileSync(BASE_HTML, "utf8");
const STYLE = baseHtml.slice(baseHtml.indexOf("<style>"), baseHtml.indexOf("</style>") + 8);

const EXTRA_STYLE = `<style>
  table.dates tfoot td { padding: 8px 10px; font-size: 10.5px; border-top: 2px solid var(--teal); background: var(--teal-soft); }
  table.dates tfoot .tfoot-label { font-weight: 700; color: var(--ink); }
  table.dates tfoot .tfoot-val { font-weight: 800; color: var(--teal); font-variant-numeric: tabular-nums; }
  table.dates tfoot td.center { text-align: center; }
  .doc-title .cont { font-size: 14px; font-weight: 600; color: var(--muted); }
</style>`;

function docHtml(title, bodyPages){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${STYLE}
${EXTRA_STYLE}
</head>
<body>
${bodyPages}
</body>
</html>`;
}

function header(tag){
  return `  <header class="doc-head">
    <svg class="brand-mark" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M30 50c0-11 9-20 20-20s20 9 20 20-9 20-20 20-20-9-20-20z" fill="none" stroke="#0e7c86" stroke-width="7"/>
      <path d="M50 50c0-11 9-20 20-20s20 9 20 20-9 20-20 20-20-9-20-20z" fill="none" stroke="#e8912d" stroke-width="7" transform="translate(-20 0)"/>
    </svg>
    <div class="brand-text">
      <span class="brand-name">club<span class="sen">SEN</span>sational</span>
      <span class="brand-sub">Autism Consultancy Services</span>
    </div>
    <div class="doc-meta">
      <div class="doc-year">Academic Year 2026 / 27</div>
      <span class="doc-tag">${esc(tag || "Rental Reference")}</span>
    </div>
  </header>
`;
}
function footer(right){
  return `  <footer class="foot">\n    <span>clubSENsational · Rental Reference</span>\n    <span>${esc(right)}</span>\n  </footer>\n`;
}

/* ================= WESTWAY ================= */
function buildWestway(){
  let blocks = "";
  let totalSun = 0;
  AS_TERMS.forEach((term) => {
    const s = sundaysFor(term);
    totalSun += s.length;
    blocks += `\n  <div class="term-block">\n    <div class="term-head"><span class="term-name">${esc(term.name)} ${term.year}</span><span class="term-span">${fmtLong(term.start)} – ${fmtLong(term.end)}</span></div>\n    <table class="dates">\n      <thead><tr><th style="width:14%">Day</th><th style="width:22%">Resource to book</th><th style="width:8%" class="center">Sun</th><th>Dates to pay</th></tr></thead>\n      <tbody>\n        <tr><td class="day">Sunday</td><td class="res"><span class="pill pill--room">Climbing · 2 entrances</span></td><td class="center count">${s.length}</td><td class="list">${s.join(" · ")}</td></tr>\n      </tbody>\n    </table>\n  </div>\n`;
  });
  const page = `  <section class="page">\n${header("After School & Weekends")}
  <div class="title-band">
    <h1 class="doc-title">Climbing Entrances to Pay — Westway</h1>
    <p class="venue-line"><strong>Venue:</strong> Westway &nbsp;·&nbsp; Sundays only · <strong>2 climbing entrances per Sunday</strong></p>
  </div>
  <p class="purpose">Term-time Sundays only (same calendar as After-School &amp; Weekends). <strong>Not included (excluded):</strong> half-term weekends (25 Oct &amp; 1 Nov 2026, 14 &amp; 21 Feb 2027, 30 May &amp; 6 Jun 2027), Christmas and Easter.</p>
${blocks}
  <div class="summary">
    <h2>Totals to pay</h2>
    <div class="cards">
      <div class="card"><div class="k"><span class="dot dot--pool"></span>Sundays open</div><div class="v">${totalSun}<small> / year</small></div><div class="d">Autumn + Spring + Summer</div></div>
      <div class="card"><div class="k"><span class="dot dot--room"></span>Climbing entrances</div><div class="v">${totalSun * 2}<small> / year</small></div><div class="d">2 entrances × ${totalSun} Sundays</div></div>
    </div>
  </div>
${footer("Westway — Sundays climbing")}  </section>\n`;
  return docHtml("Westway — Sunday Climbing Entrances 2026/27", page);
}

/* ================= SWIMFARM ================= */
const POOL_NET = 275, POOL_VAT_RATE = 0.2;
function buildSwimFarm(openDates){
  // Section 1: HubRoom (3 terms @ £4,800)
  const hubPerTerm = 4800;
  let hubRows = "";
  DC_TERMS.forEach((t) => {
    const span = t.name === "Summer Term"
      ? "12 Apr – 16 Jul 2027 (+ summer provision 19–30 Jul)"
      : `${fmtLong(t.start)} – ${fmtLong(t.end)}`;
    hubRows += `        <tr><td class="day">${t.name} ${t.year}</td><td class="time">${span}</td><td class="center count">${gbp(hubPerTerm)}</td></tr>\n`;
  });
  const hubTotal = hubPerTerm * DC_TERMS.length;
  const sec1 = `\n  <div class="term-block">\n    <div class="term-head"><span class="term-name">1 · HubRoom rental</span><span class="term-span">3 terms · ${gbp(hubPerTerm)} per term</span></div>\n    <table class="dates">\n      <thead><tr><th style="width:34%">Term</th><th>Period</th><th style="width:20%" class="center">Cost / term</th></tr></thead>\n      <tbody>\n${hubRows}      </tbody>\n      <tfoot><tr><td colspan="2" class="tfoot-label">Total HubRoom (3 terms)</td><td class="center tfoot-val">${gbp(hubTotal)}</td></tr></tfoot>\n    </table>\n  </div>\n`;

  // Section 2: Sunday pool hire 9–3 (£275/session)
  let poolRows = "";
  let poolSun = 0;
  AS_TERMS.forEach((term) => {
    const s = sundaysFor(term);
    poolSun += s.length;
    poolRows += `        <tr><td class="day">${term.name} ${term.year}</td><td class="center count">${s.length}</td><td class="center">${gbp(s.length*POOL_NET)}</td><td class="list">${s.join(" · ")}</td></tr>\n`;
  });
  const poolNetTotal = poolSun * POOL_NET;
  const poolVat = poolNetTotal * POOL_VAT_RATE;
  const poolGross = poolNetTotal + poolVat;
  const sec2 = `\n  <div class="term-block">\n    <div class="term-head"><span class="term-name">2 · Pool hire · Sundays 9:00 am – 3:00 pm</span><span class="term-span">${gbp(POOL_NET)} net per Sunday</span></div>\n    <table class="dates">\n      <thead><tr><th style="width:24%">Term</th><th style="width:8%" class="center">Sun</th><th style="width:16%" class="center">Net</th><th>Dates to pay</th></tr></thead>\n      <tbody>\n${poolRows}      </tbody>\n      <tfoot>\n        <tr><td class="tfoot-label">Total net</td><td class="center count">${poolSun}</td><td class="center tfoot-val">${gbp(poolNetTotal)}</td><td></td></tr>\n        <tr><td class="tfoot-label">VAT (20%)</td><td></td><td class="center tfoot-val">${gbp(poolVat)}</td><td></td></tr>\n        <tr><td class="tfoot-label">Total incl. VAT</td><td></td><td class="center tfoot-val">${gbp(poolGross)}</td><td></td></tr>\n      </tfoot>\n    </table>\n  </div>\n`;

  // Section 3: Day Centre pool hire Mon/Wed/Fri 12–1
  const byTerm = dcMonWedFriByTerm(openDates);
  let dcRows = "";
  let dcTotal = 0;
  byTerm.forEach((b) => {
    dcTotal += b.dates.length;
    const span = b.term.name === "Summer Term"
      ? "12 Apr – 30 Jul 2027"
      : `${fmtLong(b.term.start)} – ${fmtLong(b.term.end)}`;
    dcRows += `        <tr><td class="day">${b.term.name} ${b.term.year}</td><td class="time">${span}</td><td class="center count">${b.dates.length}</td><td class="list">${b.dates.join(" · ")}</td></tr>\n`;
  });
  const sec3 = `\n  <div class="term-block">\n    <div class="term-head"><span class="term-name">3 · Day Centre pool hire · Mon / Wed / Fri 12:00 – 1:00 pm</span><span class="term-span">2026/27 · all open Day Centre days</span></div>\n    <table class="dates">\n      <thead><tr><th style="width:20%">Term</th><th style="width:22%">Period</th><th style="width:8%" class="center">Days</th><th>Dates to book</th></tr></thead>\n      <tbody>\n${dcRows}      </tbody>\n      <tfoot><tr><td colspan="2" class="tfoot-label">Total Day Centre days (Mon/Wed/Fri)</td><td class="center tfoot-val">${dcTotal}</td><td></td></tr></tfoot>\n    </table>\n  </div>\n`;

  const page1 = `  <section class="page">\n${header("Rental Reference")}
  <div class="title-band">
    <h1 class="doc-title">Pool &amp; Room Rentals — SwimFarm</h1>
    <p class="venue-line"><strong>Venue:</strong> SwimFarm &nbsp;·&nbsp; HubRoom · Sunday pool hire · Day Centre pool hire</p>
  </div>
${sec1}
${sec2}
${footer("SwimFarm — Page 1 of 2")}  </section>\n`;

  const page2 = `  <section class="page page--cont">\n${header("Rental Reference")}
  <div class="title-band">
    <h1 class="doc-title">Pool &amp; Room Rentals — SwimFarm <span class="cont">(continued)</span></h1>
    <p class="venue-line"><strong>Section 3:</strong> Day Centre pool hire · Monday, Wednesday &amp; Friday · 12:00–1:00 pm</p>
  </div>
  <p class="purpose">All Day Centre open days for 2026/27 (the Day Centre runs through half terms). <strong>Excluded:</strong> Christmas, Easter and bank holidays (e.g. Mon 3 May 2027). Summer provision (19–30 Jul 2027) is included.</p>
${sec3}
${footer("SwimFarm — Page 2 of 2")}  </section>\n`;

  return docHtml("SwimFarm — Rentals 2026/27", page1 + page2);
}

/* ---- write ---- */
const openDates = parseDayCentreOpenDates();
fs.writeFileSync(path.join(DIR, "westway-sunday-climbing-2026-27.html"), buildWestway());
fs.writeFileSync(path.join(DIR, "swimfarm-rentals-2026-27.html"), buildSwimFarm(openDates));

// Console validation
console.log("Sundays per term:");
AS_TERMS.forEach((t)=>console.log("  "+t.name+" "+t.year+": "+sundaysFor(t).length+" -> "+sundaysFor(t).join(", ")));
console.log("\nDay Centre Mon/Wed/Fri per term:");
dcMonWedFriByTerm(openDates).forEach((b)=>console.log("  "+b.term.name+" "+b.term.year+": "+b.dates.length));
console.log("  DC open dates parsed:", openDates.length);
