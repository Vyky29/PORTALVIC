/** Parent portal session feedback — academic year windows (Autumn 26/27 is current). */

export const PARENT_FEEDBACK_CURRENT_YEAR = "2026-27";
export const PARENT_FEEDBACK_PRIOR_YEAR = "2025-26";

/** Default session-feedback lower bound for the current academic year (after-school). */
export const PARENT_SESSION_TERM_START_ISO = "2026-09-05";

export const PARENT_FEEDBACK_DAY_CENTRE_START_ISO = "2026-09-01";
export const PARENT_FEEDBACK_AFTERSCHOOL_START_ISO = "2026-09-05";
export const PARENT_FEEDBACK_AFTERSCHOOL_WEEKDAY_START_ISO = "2026-09-08";

export type ParentFeedbackYearDef = {
  key: string;
  label: string;
  fromIso: string;
  toIso: string;
  isCurrent: boolean;
};

export const PARENT_FEEDBACK_YEARS: ParentFeedbackYearDef[] = [
  {
    key: PARENT_FEEDBACK_PRIOR_YEAR,
    label: "Summer 2025/26",
    fromIso: "2026-04-12",
    toIso: "2026-08-31",
    isCurrent: false,
  },
  {
    key: PARENT_FEEDBACK_CURRENT_YEAR,
    label: "2026/27",
    fromIso: PARENT_FEEDBACK_DAY_CENTRE_START_ISO,
    toIso: "2027-08-31",
    isCurrent: true,
  },
];

export function resolveParentFeedbackYear(raw: unknown): ParentFeedbackYearDef {
  const key = String(raw || "").trim();
  const found = PARENT_FEEDBACK_YEARS.find((y) => y.key === key);
  if (found) return found;
  return PARENT_FEEDBACK_YEARS.find((y) => y.isCurrent) || PARENT_FEEDBACK_YEARS[1];
}

export function sessionDateInFeedbackYear(iso: string, year: ParentFeedbackYearDef): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return iso >= year.fromIso && iso <= year.toIso;
}

export function weekStartInFeedbackYear(weekStart: string, year: ParentFeedbackYearDef): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return false;
  return weekStart >= year.fromIso && weekStart <= year.toIso;
}

/** Earliest session date for the selected year (after-school vs day centre). */
export function feedbackYearSessionFromIso(
  year: ParentFeedbackYearDef,
  hasDayCentre: boolean,
): string {
  if (year.key === PARENT_FEEDBACK_CURRENT_YEAR && hasDayCentre) {
    return PARENT_FEEDBACK_DAY_CENTRE_START_ISO;
  }
  if (year.key === PARENT_FEEDBACK_CURRENT_YEAR) {
    return PARENT_FEEDBACK_AFTERSCHOOL_START_ISO;
  }
  return year.fromIso;
}

/** New families starting Autumn 26/27 skip the year picker; returning families pick first. */
export function participantNeedsFeedbackYearPicker(
  registrationDateIso: string | null | undefined,
  hasDayCentre: boolean,
): boolean {
  const autumnStart = hasDayCentre
    ? PARENT_FEEDBACK_DAY_CENTRE_START_ISO
    : PARENT_FEEDBACK_AFTERSCHOOL_START_ISO;
  const reg = String(registrationDateIso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reg)) return true;
  return reg < autumnStart;
}

export function feedbackYearsForParticipant(
  registrationDateIso: string | null | undefined,
  hasDayCentre: boolean,
): ParentFeedbackYearDef[] {
  if (!participantNeedsFeedbackYearPicker(registrationDateIso, hasDayCentre)) {
    return PARENT_FEEDBACK_YEARS.filter((y) => y.isCurrent);
  }
  return PARENT_FEEDBACK_YEARS.slice();
}
