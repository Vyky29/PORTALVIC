/**
 * Generates the "term dates to book" HTML fragment for the pool/room rental
 * reference, using the authoritative After-Schools & Weekends 2026/27 calendar
 * (portal day-centre-calendar-2026-27-section.html term info).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const TERMS = [
  { name: "Autumn Term", year: "2026", start: "2026-09-05", end: "2026-12-18" },
  { name: "Spring Term", year: "2027", start: "2027-01-04", end: "2027-03-25" },
  { name: "Summer Term", year: "2027", start: "2027-04-12", end: "2027-07-16" },
];

// Whole ranges with no sessions (half terms incl. surrounding weekends, holidays).
const CLOSED_RANGES = [
  ["2026-10-24", "2026-11-01"], // Autumn half term + weekends
  ["2026-12-19", "2027-01-03"], // Christmas
  ["2027-02-13", "2027-02-21"], // Spring half term + weekends
  ["2027-03-26", "2027-04-11"], // Easter
  ["2027-05-29", "2027-06-06"], // Summer half term + weekends
];
// Single closed days (bank holidays that land on an operating day).
const CLOSED_DAYS = new Set([
  "2027-05-03", // Early May bank holiday (Monday)
]);

// getDay(): Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
const POOL = { label: "¼ Teaching pool", cls: "pool" };
const LANE = { label: "Lane", cls: "lane", time: "4:30 – 6:30 pm" };
const ROOM2 = { label: "Room 2", cls: "room", time: "4:15 – 6:15 pm" };

const VENUES = {
  acton: {
    label: "Acton",
    days: [
      { dow: 1, name: "Monday", time: "4:00 – 6:30 pm", resources: [POOL] },
      { dow: 2, name: "Tuesday", time: "4:00 – 6:30 pm", resources: [POOL, LANE] },
      { dow: 3, name: "Wednesday", time: "4:00 – 6:30 pm", resources: [POOL, ROOM2] },
      { dow: 4, name: "Thursday", time: "4:00 – 6:30 pm", resources: [POOL, LANE] },
      { dow: 5, name: "Friday", time: "4:30 – 6:00 pm", resources: [POOL] },
      { dow: 6, name: "Saturday", time: "9:30 am – 1:00 pm", resources: [POOL] },
    ],
  },
  northolt: {
    label: "Northolt",
    days: [
      { dow: 1, name: "Monday", time: "4:30 – 6:30 pm", resources: [POOL] },
      { dow: 3, name: "Wednesday", time: "4:30 – 6:30 pm", resources: [POOL] },
    ],
  },
};

function resourceCellHtml(resources, dayTime) {
  return (resources || [])
    .map((r) => {
      const time = r.time || dayTime;
      const t = time ? ` <span class="res-t">${time}</span>` : "";
      return `<span class="pill pill--${r.cls}">${esc(r.label)}</span>${t}`;
    })
    .join("<br>");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function d(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
}
function iso(dt) {
  return dt.toISOString().slice(0, 10);
}
function isClosed(dt) {
  const s = iso(dt);
  if (CLOSED_DAYS.has(s)) return true;
  return CLOSED_RANGES.some(([a, b]) => s >= a && s <= b);
}
function fmt(dt) {
  return dt.getUTCDate() + " " + MONTHS[dt.getUTCMonth()];
}

function datesFor(term, dow) {
  const out = [];
  const end = d(term.end);
  for (let cur = d(term.start); cur <= end; cur = new Date(cur.getTime() + 86400000)) {
    if (cur.getUTCDay() !== dow) continue;
    if (isClosed(cur)) continue;
    out.push(fmt(cur));
  }
  return out;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function termBlockHtml(v, term) {
  let html = `\n  <div class="term-block">\n    <div class="term-head"><span class="term-name">${esc(term.name)} ${term.year}</span><span class="term-span">${termSpanLabel(term)}</span></div>\n    <table class="dates">\n      <thead><tr><th style="width:12%">Day</th><th style="width:14%">Session time</th><th style="width:23%">Resource to book</th><th style="width:6%" class="center">Wks</th><th>Dates to book</th></tr></thead>\n      <tbody>\n`;
  v.days.forEach((day) => {
    const dates = datesFor(term, day.dow);
    html += `        <tr><td class="day">${day.name}</td><td class="time">${day.time}</td><td class="res">${resourceCellHtml(day.resources, day.time)}</td><td class="center count">${dates.length}</td><td class="list">${dates.join(" · ")}</td></tr>\n`;
  });
  html += `      </tbody>\n    </table>\n  </div>\n`;
  return html;
}

function titleBand(label, cont) {
  return `\n  <div class="title-band">\n    <h1 class="doc-title">Term Dates to Book — ${esc(label)}${cont ? " <span class=\"cont\">(continued)</span>" : ""}</h1>\n    <p class="venue-line"><strong>Venue:</strong> ${esc(label)} &nbsp;·&nbsp; After-School &amp; Weekend sessions · book each date below</p>\n  </div>\n  <p class="purpose">Term-time open dates only. <strong>Not bookable (excluded):</strong> half terms (26–30 Oct 2026, 15–19 Feb 2027, 31 May–4 Jun 2027) &amp; their weekends, Christmas, Easter and the early May bank holiday (Mon 3 May 2027).</p>\n`;
}

// Acton: one term per A4 page (six operating days + long date lists).
function venuePagesPerTerm(key) {
  const v = VENUES[key];
  let html = "";
  TERMS.forEach((term, ti) => {
    html += `\n  <section class="page${ti === 0 ? "" : " page--cont"}">\n`;
    html += headerHtml(v.label);
    html += titleBand(v.label, ti !== 0);
    html += termBlockHtml(v, term);
    html += footerHtml(v.label, key);
    html += `  </section>\n`;
  });
  return html;
}

// Northolt: all terms on a single page (only Mon & Wed).
function venueSinglePage(key) {
  const v = VENUES[key];
  let html = `\n  <section class="page page--cont">\n`;
  html += headerHtml(v.label);
  html += titleBand(v.label, false);
  TERMS.forEach((term) => {
    html += termBlockHtml(v, term);
  });
  html += footerHtml(v.label, key);
  html += `  </section>\n`;
  return html;
}

function termSpanLabel(term) {
  return fmtLong(term.start) + " – " + fmtLong(term.end);
}
function fmtLong(isoStr) {
  const dt = d(isoStr);
  return dt.getUTCDate() + " " + MONTHS[dt.getUTCMonth()] + " " + dt.getUTCFullYear();
}

function headerHtml(label) {
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
      <span class="doc-tag">After School &amp; Weekends</span>
    </div>
  </header>
`;
}

function footerHtml(label, key) {
  return `  <footer class="foot">\n    <span>clubSENsational · Pool &amp; Room Rental Reference</span>\n    <span>${esc(label)} — term dates</span>\n  </footer>\n`;
}

const frag = venuePagesPerTerm("acton") + venueSinglePage("northolt");
fs.writeFileSync(path.join(__dirname, "_term_dates_fragment.html"), frag);

// Inject the fragment into the main rental HTML, between stable markers.
const HTML = path.join(__dirname, "pool-room-rental-schedule-2026-27.html");
const START = "<!-- TERM-DATES-START -->";
const END = "<!-- TERM-DATES-END -->";
let doc = fs.readFileSync(HTML, "utf8");
if (doc.includes(START) && doc.includes(END)) {
  const before = doc.slice(0, doc.indexOf(START) + START.length);
  const after = doc.slice(doc.indexOf(END));
  doc = before + "\n" + frag + "\n  " + after;
} else {
  const tdIdx = doc.indexOf("Term Dates to Book");
  const secIdx = doc.lastIndexOf("<section", tdIdx);
  const bodyIdx = doc.indexOf("</body>");
  doc = doc.slice(0, secIdx) + START + "\n" + frag + "\n  " + END + "\n" + doc.slice(bodyIdx);
}
fs.writeFileSync(HTML, doc);

// Console summary for validation.
["acton", "northolt"].forEach((key) => {
  const v = VENUES[key];
  console.log("\n=== " + v.label + " ===");
  TERMS.forEach((term) => {
    console.log(` ${term.name} ${term.year}:`);
    v.days.forEach((day) => {
      const dates = datesFor(term, day.dow);
      console.log(`   ${day.name.padEnd(10)} (${dates.length}): ${dates.join(", ")}`);
    });
  });
});
