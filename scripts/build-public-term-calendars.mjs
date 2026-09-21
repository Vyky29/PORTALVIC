#!/usr/bin/env node
/**
 * Builds the public 2026/27 "Our Terms" calendar widget
 * (same look as the WordPress HTML on clubsensational.org).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "working_ui/portal/public-term-calendars-2026-27.html");

function iso(d) {
  return d.toISOString().slice(0, 10);
}
function inRange(isoDay, from, to) {
  return isoDay >= from && isoDay <= to;
}

const CLOSED = [
  ["2026-12-19", "2027-01-03"],
  ["2027-03-26", "2027-04-11"],
];
const BANK = new Set(["2027-05-03"]);
const AS_WEEKEND_CLOSED = [
  ["2026-10-24", "2026-10-25"],
  ["2026-10-31", "2026-11-01"],
  ["2027-02-13", "2027-02-14"],
  ["2027-02-20", "2027-02-21"],
  ["2027-05-29", "2027-05-30"],
  ["2027-06-05", "2027-06-06"],
];
const DC_TERMS = [
  ["2026-09-01", "2026-12-18"],
  ["2027-01-04", "2027-03-25"],
  ["2027-04-12", "2027-07-16"],
  ["2027-07-19", "2027-07-30"],
];
const AS_WEEKDAY_FROM = "2026-09-07";
const AS_WEEKEND_FROM = "2026-09-05";
const AS_LAST = "2027-07-16";
const AS_HALF_TERM = [
  ["2026-10-26", "2026-10-30"],
  ["2027-02-15", "2027-02-19"],
  ["2027-05-31", "2027-06-04"],
];

function isClosed(day) {
  if (BANK.has(day)) return true;
  return CLOSED.some(([a, b]) => inRange(day, a, b));
}
function isAsWeekendClosed(day) {
  return AS_WEEKEND_CLOSED.some(([a, b]) => inRange(day, a, b));
}
function isDcOpen(day, weekday) {
  if (isClosed(day)) return false;
  if (weekday === 0 || weekday === 6) return false;
  return DC_TERMS.some(([a, b]) => inRange(day, a, b));
}
function isAsOpen(day, weekday) {
  if (isClosed(day) || isAsWeekendClosed(day)) return false;
  if (day > AS_LAST) return false;
  if (AS_HALF_TERM.some(([a, b]) => inRange(day, a, b))) return false;
  const weekend = weekday === 0 || weekday === 6;
  if (weekend) return day >= AS_WEEKEND_FROM;
  return day >= AS_WEEKDAY_FROM && DC_TERMS.some(([a, b]) => inRange(day, a, b));
}
function showDay(d) {
  const day = iso(d);
  const wd = d.getUTCDay();
  return isDcOpen(day, wd) || isAsOpen(day, wd);
}

function monthGrid(year, monthIndex) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const startWd = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let dom = 1; dom <= daysInMonth; dom++) cells.push(dom);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function cellHtml(year, monthIndex, dom) {
  if (!dom) return '<td><div class="cell empty">.</div></td>';
  const d = new Date(Date.UTC(year, monthIndex, dom));
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  if (!showDay(d)) return '<td><div class="cell empty">.</div></td>';
  const cls = weekend ? "cell weekend-number" : "cell";
  return `<td><div class="${cls}">${dom}</div></td>`;
}

function monthHtml(year, monthIndex) {
  const name = new Date(Date.UTC(year, monthIndex, 1))
    .toLocaleString("en-GB", { month: "long", timeZone: "UTC" })
    .toUpperCase();
  const rows = monthGrid(year, monthIndex)
    .map(
      (row) =>
        "<tr>" +
        row.map((dom) => cellHtml(year, monthIndex, dom)).join("") +
        "</tr>",
    )
    .join("\n");
  return `      <div class="month">
        <div class="month-name">${name} ${year}</div>
        <table>
          <tr>
            <th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th>
            <th class="weekend">Sa</th><th class="weekend">Su</th>
          </tr>
          ${rows}
        </table>
      </div>`;
}

function termHtml(cls, title, dates, months) {
  return `  <section class="term ${cls}">
    <div class="term-header">
      <p class="term-title">${title}</p>
      <p class="term-dates">${dates}</p>
    </div>
    <div class="month-row">
${months.map(([y, m]) => monthHtml(y, m)).join("\n")}
    </div>
  </section>`;
}

const css = `    .cs-calendar{
      max-width:1400px;
      margin:0 auto;
      background:#fff;
      font-family:Arial, Helvetica, sans-serif;
      color:#111;
    }
    .cs-calendar .term{
      border:4px solid #000;
      margin:0 0 24px 0;
      background:#fff;
    }
    .cs-calendar .term-header{
      text-align:center;
      padding:8px 10px;
      border-bottom:4px solid #000;
    }
    .cs-calendar .term-title{
      font-size:20px;
      font-weight:900;
      margin:0;
      letter-spacing:0.4px;
    }
    .cs-calendar .term-dates{
      font-size:15px;
      font-weight:800;
      margin:4px 0 0 0;
    }
    .cs-calendar .month-row{ display:flex; flex-wrap:wrap; }
    .cs-calendar .month{
      flex:1 1 25%;
      border-right:4px solid #000;
      min-width:0;
    }
    .cs-calendar .month:last-child{ border-right:none; }
    .cs-calendar .month-name{
      text-align:center;
      font-weight:900;
      font-size:15px;
      padding:6px;
      border-bottom:3px solid #000;
    }
    .cs-calendar .autumn .month-name{background:#f2c1a8;}
    .cs-calendar .spring .month-name{background:#9ec2dd;}
    .cs-calendar .summer .month-name{background:#f3dd8d;}
    .cs-calendar table{
      width:100%;
      border-collapse:collapse;
      table-layout:fixed;
    }
    .cs-calendar th, .cs-calendar td{
      border:2px solid #000;
      padding:0;
    }
    .cs-calendar th{
      height:20px;
      font-size:11px;
      font-weight:900;
      background:#d9d9d9;
    }
    .cs-calendar th.weekend{ background:#9b9b9b; }
    .cs-calendar td{ height:22px; }
    .cs-calendar .cell{
      display:flex;
      align-items:center;
      justify-content:center;
      height:100%;
      font-size:13px;
      line-height:1;
    }
    .cs-calendar .weekend-number{ font-weight:900; }
    .cs-calendar .empty{ color:transparent; }
    .cs-calendar .cs-cal-note{
      margin:0 0 16px;
      font-size:13px;
      line-height:1.45;
      font-weight:600;
      min-width:0;
      overflow-wrap:break-word;
    }
    @media (max-width:1000px){
      .cs-calendar .month{
        flex:1 1 50%;
        border-right:none;
        border-bottom:4px solid #000;
      }
      .cs-calendar .month:last-child{ border-bottom:none; }
    }
    @media (max-width:600px){
      .cs-calendar .month{ flex:1 1 100%; }
    }`;

const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>clubSENsational term dates 2026/27</title>
</head>
<body>
<div class="cs-calendar" data-cs-year="2026-27">
  <style>
${css}
  </style>
  <p class="cs-cal-note">Academic year 2026/27. Day Centre: weekdays from 1 Sep (including half term). After-school and weekends from 5/7 Sep; after-school closed in half term. Last day 18 Dec; closed 19 Dec-3 Jan. Spring 4 Jan-25 Mar. Summer 12 Apr-16 Jul plus summer provision 19-30 Jul. Closed Easter 26 Mar-11 Apr and Mon 3 May.</p>
${termHtml(
  "autumn",
  "AUTUMN TERM",
  "1 Sep - 23 Oct / 2 Nov - 18 Dec 2026",
  [
    [2026, 8],
    [2026, 9],
    [2026, 10],
    [2026, 11],
  ],
)}
${termHtml(
  "spring",
  "SPRING TERM",
  "4 Jan - 12 Feb / 22 Feb - 25 Mar 2027",
  [
    [2027, 0],
    [2027, 1],
    [2027, 2],
  ],
)}
${termHtml(
  "summer",
  "SUMMER TERM",
  "12 Apr - 28 May / 7 Jun - 16 Jul 2027 | summer provision 19-30 Jul",
  [
    [2027, 3],
    [2027, 4],
    [2027, 5],
    [2027, 6],
  ],
)}
</div>
</body>
</html>
`;

writeFileSync(OUT, html, "utf8");
console.log("Wrote", OUT);
