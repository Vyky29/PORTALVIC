/** Payroll band hours for roster-derived timesheet rows (PDF distribute + audit). */

export const WEEKDAY_MA_BESPOKE_PAY_HOURS = 2;
export const WEEKDAY_MA_BESPOKE_STAFF_KEYS = new Set(["john", "giuseppe", "bismark", "godsway"]);

export const SUNDAY_SUPPORT_MA_PAY_HOURS = 5;
export const SUNDAY_LEAD_MA_PAY_HOURS = 5.5;
export const SUNDAY_MA_LEAD_KEYS = new Set(["berta", "john", "michelle"]);

export const SUNDAY_SWIM_PAY_HOURS = 6;
export const SUNDAY_ROBERTO_SWIM_PAY_HOURS = 6.5;

/** Mon–Wed + Fri day-centre closing (10:45–16:15). */
export const MICHELLE_DAY_CENTRE_PAY_HOURS = 5.5;
export const MICHELLE_DAY_CENTRE_DOWS = new Set([1, 2, 3, 5]);

export function sessionServiceLower(session) {
  return String((session && (session.rosterService || session.service || session.activity)) || "").toLowerCase();
}

export function isMaOrBespokeService(serviceLower) {
  const s = String(serviceLower || "").toLowerCase();
  return /\bbespoke\b/.test(s) || /multi[-\s]?activity/.test(s);
}

export function isWeekdayMaBespokePayBand(dayName, rosterKey, role, dayRows) {
  if (!dayName || dayName === "Sunday") return false;
  const key = String(rosterKey || "")
    .trim()
    .toLowerCase();
  if (!WEEKDAY_MA_BESPOKE_STAFF_KEYS.has(key)) return false;
  if (String(role || "").trim() !== "Support Worker") return false;
  const rows = dayRows || [];
  if (!rows.length) return false;
  return rows.some((s) => isMaOrBespokeService(sessionServiceLower(s)));
}

export function weekdayMaBespokePayableHours(dayName, rosterKey, role, computedHours, dayRows) {
  if (!isWeekdayMaBespokePayBand(dayName, rosterKey, role, dayRows)) return computedHours;
  return WEEKDAY_MA_BESPOKE_PAY_HOURS;
}

export function isMichelleDayCentrePayBand(rosterKey, dateObj, role, dayRows) {
  const key = String(rosterKey || "")
    .trim()
    .toLowerCase();
  if (key !== "michelle") return false;
  if (!dateObj || typeof dateObj.getDay !== "function") return false;
  if (!MICHELLE_DAY_CENTRE_DOWS.has(dateObj.getDay())) return false;
  if (String(role || "").trim() !== "Support Worker") return false;
  const rows = dayRows || [];
  if (!rows.length) return false;
  return rows.some((s) => /day\s*centre/.test(sessionServiceLower(s)));
}

export function michelleDayCentrePayableHours(rosterKey, dateObj, role, computedHours, dayRows) {
  if (!isMichelleDayCentrePayBand(rosterKey, dateObj, role, dayRows)) return computedHours;
  return MICHELLE_DAY_CENTRE_PAY_HOURS;
}

export function isSundayMaSupportPayBand(dayName, role, service, dayRows) {
  if (String(dayName || "") !== "Sunday") return false;
  const svc = String(service || "").toLowerCase();
  const r = String(role || "").trim();
  if (r === "Support Worker" || /multi[-\s]?activity/.test(svc)) {
    const rows = dayRows || [];
    if (!rows.length) return true;
    return rows.some((s) => {
      const st = String(s.status || "").toLowerCase();
      if (st === "closed" || st === "available") return false;
      const act = sessionServiceLower(s);
      const venue = String(s.venue || s.area || "").toLowerCase();
      if (/climb/.test(act)) return false;
      return /multi|support|hub|bespoke/.test(act) || venue.indexOf("hub") >= 0 || venue.indexOf("pool") >= 0;
    });
  }
  return false;
}

export function sundayMaSupportPayableHours(dayName, rosterKey, role, service, computedHours, dayRows) {
  if (!isSundayMaSupportPayBand(dayName, role, service, dayRows)) return computedHours;
  const key = String(rosterKey || "")
    .trim()
    .toLowerCase();
  return SUNDAY_MA_LEAD_KEYS.has(key) ? SUNDAY_LEAD_MA_PAY_HOURS : SUNDAY_SUPPORT_MA_PAY_HOURS;
}

export function isSundaySwimfarmAquaticBand(dayName, role, service, dayRows) {
  if (String(dayName || "") !== "Sunday") return false;
  const r = String(role || "").trim();
  const svc = String(service || "").toLowerCase();
  if (r !== "Swimming Instructor" && !/swim|aquatic/.test(svc)) return false;
  const rows = dayRows || [];
  if (!rows.length) return /swim|aquatic/.test(svc);
  return rows.some((s) => {
    const st = String(s.status || "").toLowerCase();
    if (st === "closed" || st === "available") return false;
    const act = sessionServiceLower(s);
    if (/climb/.test(act) || /multi|bespoke|support|hub/.test(act)) return false;
    const venue = String(s.venue || s.area || "").toLowerCase();
    return venue.indexOf("swimfarm") >= 0 || venue.indexOf("pool") >= 0;
  });
}

export function sundaySwimPayableHours(dayName, rosterKey, role, service, computedHours, dayRows) {
  if (!isSundaySwimfarmAquaticBand(dayName, role, service, dayRows)) return computedHours;
  const key = String(rosterKey || "")
    .trim()
    .toLowerCase();
  if (key === "roberto") return SUNDAY_ROBERTO_SWIM_PAY_HOURS;
  return SUNDAY_SWIM_PAY_HOURS;
}

/** Apply payroll bands in fixed order (weekday bespoke → Michelle day centre → Sunday MA → Sunday swim). */
export function applyRosterEntryPayBands({
  hours,
  dayName,
  rosterKey,
  role,
  service,
  dateObj,
  dayRows,
}) {
  let h = Number(hours || 0);
  h = weekdayMaBespokePayableHours(dayName, rosterKey, role, h, dayRows);
  h = michelleDayCentrePayableHours(rosterKey, dateObj, role, h, dayRows);
  h = sundayMaSupportPayableHours(dayName, rosterKey, role, service, h, dayRows);
  h = sundaySwimPayableHours(dayName, rosterKey, role, service, h, dayRows);
  return Number(h.toFixed(2));
}
