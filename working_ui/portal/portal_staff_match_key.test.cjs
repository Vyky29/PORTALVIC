/**
 * Contract tests: portal_staff_match_key
 * Run: node working_ui/portal/portal_staff_match_key.test.cjs
 */
"use strict";

const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "portal_staff_match_key.js"));

assert.strictEqual(m.canonicalStaffMatchKey("javi"), "javi");
assert.strictEqual(m.canonicalStaffMatchKey("javier"), "javier");
assert.strictEqual(m.canonicalStaffMatchKey("Javi Palankas"), "javi");
assert.strictEqual(m.canonicalStaffMatchKey("Javier Marquez"), "javier");
assert.strictEqual(m.canonicalStaffMatchKey("stf017"), "javi");
assert.strictEqual(m.canonicalStaffMatchKey("stf010"), "javier");
assert.strictEqual(m.canonicalStaffMatchKey("Lulia"), "luliya");
assert.strictEqual(m.canonicalStaffMatchKey("cover_needed"), "coverneeded");
assert.strictEqual(m.isBlankOrCoverNeededStaffId("cover_needed"), true);
assert.strictEqual(m.isBlankOrCoverNeededStaffId("youssef"), false);
assert.strictEqual(m.staffIdsMatch("Youssef", "yousef"), true);
assert.strictEqual(m.staffIdsMatch("javi", "javier"), false);

console.log("portal_staff_match_key.test.cjs: ok");
