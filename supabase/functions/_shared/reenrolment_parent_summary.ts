/** Parent-safe summary of a 2026/27 re-enrolment submission payload. */

type SlotSnapshot = {
  id?: string;
  displayLabel?: string;
  serviceType?: string;
  day?: string;
  timeSlot?: string;
  venue?: string;
  durationMin?: number;
};

type WeeklyChoice = { choice?: string; alternative?: string | null };

const WEEKLY_CHOICE_LABEL: Record<string, string> = {
  keep: "Keep for 2026/27",
  change: "Request a change",
  withdraw: "Not continuing",
};

const DAY_CENTRE_LABEL: Record<string, string> = {
  continue: "Continue Day Centre",
  discuss: "Discuss changes",
  withdraw: "Not continuing Day Centre",
};

function clean(raw: unknown, max = 200): string {
  return String(raw ?? "").trim().slice(0, max);
}

function slotLabel(slot: SlotSnapshot): string {
  const display = clean(slot.displayLabel, 160);
  if (display) return display;
  const dur = slot.durationMin ? `${slot.durationMin}'` : "";
  const svc = clean(slot.serviceType, 80)
    .replace(/\bAQUATIC ACTIVITY\b/i, "Aquatic Activity")
    .replace(/\bCLIMBING ACTIVITY\b/i, "Climbing Activity")
    .replace(/\bSW\b/i, "Aquatic Activity");
  const sessionDate = clean((slot as { sessionDate?: string }).sessionDate, 20);
  let dateBit = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    const [y, m, d] = sessionDate.split("-").map(Number);
    dateBit = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const timeRaw = clean(slot.timeSlot, 40);
  const time = timeRaw
    ? dateBit
      ? ` - ${dateBit}, ${timeRaw}`
      : ` - ${timeRaw}`
    : dateBit
      ? ` - ${dateBit}`
      : "";
  const dayRaw = clean(slot.day, 20);
  const day = dayRaw ? `, ${dayRaw}${dayRaw.endsWith("s") ? "" : "s"}` : "";
  const venue = slot.venue ? ` (${clean(slot.venue, 40)})` : "";
  return `${dur ? `${dur} ` : ""}${svc}${time}${day}${venue}`.trim() || "Activity";
}

function weeklyChoiceText(choice: WeeklyChoice | undefined): string {
  const key = clean(choice?.choice, 40).toLowerCase() || "keep";
  let text = WEEKLY_CHOICE_LABEL[key] || key;
  const alt = clean(choice?.alternative, 200);
  if (key === "change" && alt) text += `: ${alt}`;
  return text;
}

export type ReenrolmentSummaryItem = {
  label: string;
  choice: string;
};

export type ReenrolmentParentSummary = {
  submitted: boolean;
  submitted_at: string | null;
  summary_hint: string;
  items: ReenrolmentSummaryItem[];
};

export function buildReenrolmentParentSummary(
  payload: Record<string, unknown> | null | undefined,
  submittedAt: string | null,
): ReenrolmentParentSummary {
  if (!payload || typeof payload !== "object") {
    return {
      submitted: false,
      submitted_at: null,
      summary_hint: "Not submitted yet",
      items: [],
    };
  }

  const choices = (payload.choices && typeof payload.choices === "object"
    ? payload.choices
    : {}) as Record<string, unknown>;
  const weeklyChoices = (choices.weekly && typeof choices.weekly === "object"
    ? choices.weekly
    : {}) as Record<string, WeeklyChoice>;
  const dayCentreChoice = clean(choices.day_centre, 40).toLowerCase();

  const slotsRaw = payload.weekly_slots_snapshot;
  const slots: SlotSnapshot[] = Array.isArray(slotsRaw)
    ? (slotsRaw as SlotSnapshot[])
    : [];

  const slotById = new Map<string, SlotSnapshot>();
  for (const slot of slots) {
    const id = clean(slot?.id, 80);
    if (id) slotById.set(id, slot);
  }

  const items: ReenrolmentSummaryItem[] = [];

  for (const [slotId, choice] of Object.entries(weeklyChoices)) {
    const slot = slotById.get(slotId);
    items.push({
      label: slot ? slotLabel(slot) : clean(slotId, 120) || "Activity",
      choice: weeklyChoiceText(choice),
    });
  }

  if (dayCentreChoice) {
    items.push({
      label: "Day Centre",
      choice: DAY_CENTRE_LABEL[dayCentreChoice] || dayCentreChoice,
    });
  }

  const funding = payload.funding && typeof payload.funding === "object"
    ? (payload.funding as Record<string, unknown>)
    : null;
  const funding2627 = funding?.choices_2627 && typeof funding.choices_2627 === "object"
    ? (funding.choices_2627 as Record<string, unknown>)
    : null;
  if (funding2627) {
    const fund = clean(funding2627.funding_label, 80);
    const pay = clean(funding2627.payment_method_label, 80);
    const sched = clean(funding2627.payment_schedule_label, 80);
    const bits = [fund, pay, sched].filter(Boolean);
    if (bits.length) {
      items.push({
        label: "Funding & payment 2026/27",
        choice: bits.join(" · "),
      });
    }
  }

  const submitted = !!submittedAt;
  let summaryHint = "Not submitted yet";
  if (submitted && items.length) {
    const keeps = Object.values(weeklyChoices).filter((c) =>
      clean(c?.choice, 40).toLowerCase() === "keep" || !clean(c?.choice, 40)
    ).length;
    const changes = Object.values(weeklyChoices).filter((c) =>
      clean(c?.choice, 40).toLowerCase() === "change"
    ).length;
    const withdraws = Object.values(weeklyChoices).filter((c) =>
      clean(c?.choice, 40).toLowerCase() === "withdraw"
    ).length;
    const parts: string[] = [];
    if (keeps) parts.push(`${keeps} kept`);
    if (changes) parts.push(`${changes} change${changes === 1 ? "" : "s"}`);
    if (withdraws) parts.push(`${withdraws} withdrawn`);
    if (dayCentreChoice === "continue") parts.push("Day Centre continue");
    else if (dayCentreChoice === "discuss") parts.push("Day Centre — discuss");
    else if (dayCentreChoice === "withdraw") parts.push("Day Centre withdrawn");
    summaryHint = parts.length ? parts.join(" · ") : items[0].label.slice(0, 48);
  } else if (submitted) {
    summaryHint = "Submitted — awaiting review";
  }

  return {
    submitted,
    submitted_at: submittedAt,
    summary_hint: summaryHint,
    items,
  };
}
