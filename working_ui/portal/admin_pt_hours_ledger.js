/**
 * Admin-only Day Centre PT hours ledger.
 * Not loaded by timesheet.html or staff_dashboard.html.
 * Pay is unchanged (annual salary includes holiday). Do not deduct.
 */
export const ADMIN_PT_HOURS_LEDGER = [
  {
    staffKey: "roberto",
    staffName: "Roberto Reali",
    payMonth: "2026-09",
    weekOf: "2026-09-01",
    label: "Week 1 · Tue 1 - Fri 4 Sep 2026",
    contractedTueFriH: 17,
    workedH: 14,
    shortfallH: 3,
    vsFullWeekH: 7,
    deductPay: false,
    showOnStaffTimesheet: false,
    note:
      "PT 21 h week: no Monday (BH 31 Aug; contract starts Tue 1). Thu 3 Sep OFF (Fadi). Tinashe starts Fri 11. Wed 2 + Fri 4 were 11-4. Worked 14 h vs 17 h Tue-Fri (3 h short). Paid in full.",
  },
];

export function adminPtHoursForPayMonth(ym) {
  const key = String(ym || "").slice(0, 7);
  return ADMIN_PT_HOURS_LEDGER.filter((row) => row.payMonth === key);
}
