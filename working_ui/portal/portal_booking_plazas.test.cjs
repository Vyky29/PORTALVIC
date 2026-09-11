/**
 * Booking plazas: 60' MADRE seats must not become two summed half-hours.
 * Run: node working_ui/portal/portal_booking_plazas.test.cjs
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const code = fs.readFileSync(path.join(__dirname, "portal_booking_offer.js"), "utf8");
const sandbox = { window: {}, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox);
const api = sandbox.PortalBookingOffer || sandbox.window.PortalBookingOffer;
assert.ok(api, "PortalBookingOffer missing");
assert.equal(typeof api.aggregateSlotsToHalfHourBands, "function");

const thuActon = [
  {
    id: "aq-act-thu-1730-60",
    serviceId: "aquatic",
    venue: "Acton",
    day: "Thursday",
    timeLabel: "5.30 – 6.30",
    sortTime: "17:30",
    capacity: 1,
    taken: 0,
  },
  {
    id: "aq-act-thu-1730-30",
    serviceId: "aquatic",
    venue: "Acton",
    day: "Thursday",
    timeLabel: "5.30 – 6.00",
    sortTime: "17:30",
    capacity: 1,
    taken: 1,
  },
  {
    id: "aq-act-thu-1800-30",
    serviceId: "aquatic",
    venue: "Acton",
    day: "Thursday",
    timeLabel: "6.00 – 6.30",
    sortTime: "18:00",
    capacity: 1,
    taken: 0,
  },
];

const out = api.aggregateSlotsToHalfHourBands(thuActon);
assert.strictEqual(out.length, 3, "keep three native MADRE bands, do not collapse to two half-hours");
const labels = out.map((s) => s.timeLabel).join("|");
assert.ok(labels.indexOf("5.30 – 6.30") >= 0, "60' band stays visible");
assert.ok(labels.indexOf("5.30 – 6.00") >= 0, "30' first half stays");
assert.ok(labels.indexOf("6.00 – 6.30") >= 0, "30' second half stays");
const totalLeft = out.reduce(function (n, s) {
  return n + Math.max(0, Number(s.capacity || 0) - Number(s.taken || 0));
}, 0);
assert.strictEqual(totalLeft, 2, "open plazas = 1 (60') + 1 (6–6.30), not invented 3");

console.log("portal_booking_plazas.test.cjs: ok");
