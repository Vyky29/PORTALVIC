/**
 * Smoke: 20:30 matcher. Covers, another staff's absent mark, an aquatic
 * cancel stored under a Day Centre key, and Elias only from his start date.
 * The ring sends once, then again after 30 minutes, until the feedback is in.
 *   npx -y deno run -A database/local-vault/smoke-feedback-2030-shared-20260909.ts
 */
import {
  applyFeedback2030BoardPolicy,
  applyScheduleOverridesToFeedback2030Slots,
  feedbackRingAlreadySentToday,
  mergeFeedback2030Slots,
  outstandingByStaff,
  slotIsResolved,
  slotsFromCapacityChainOccupants,
  slotsFromRosterRows,
  type Feedback2030Slot,
} from "../../supabase/functions/_shared/portal_feedback_2030_match.ts";
import { rosterSlotIsComplete } from "../../supabase/functions/_shared/portal_feedback_digest_match.ts";

const iso = "2026-09-09";
const emptyCtx = {
  feedbackRows: [] as { client_name?: string; completed_by_name?: string; portal_session_key?: string; service?: string }[],
  cancelRows: [],
  absentMarks: [],
  feedbackDoneMarks: [],
};

const godsway: Feedback2030Slot = {
  staff: "GODSWAY",
  client: "Tinashe",
  time: "4.30 to 6",
  service: "Bespoke Programme",
};
const luliyaV: Feedback2030Slot = {
  staff: "LULIYA",
  client: "Vithura",
  time: "4.30 to 5",
  service: "Aquatic Activity",
};
const luliyaA: Feedback2030Slot = {
  staff: "LULIYA",
  client: "Amber",
  time: "5.30 to 6",
  service: "Aquatic Activity",
};

const tinasheFb = {
  client_name: "Tinashe",
  completed_by_name: "Bismark Gyan",
  portal_session_key: "2026-09-09|tinashe|bespoke_shared",
  service: "Bespoke Programme",
};
const vithuraFb = {
  client_name: "Vithura",
  completed_by_name: "Aida Luliya",
  portal_session_key: "2026-09-09|vithura|aquatic",
  service: "Aquatic Activity",
};
const amberFb = {
  client_name: "Amber",
  completed_by_name: "Aida Luliya",
  portal_session_key: "2026-09-09|amber|aquatic",
  service: "Aquatic Activity",
};

const joelleAurora: Feedback2030Slot = {
  staff: "AURORA",
  client: "Joelle",
  time: "5.30 to 6",
  service: "Aquatic Activity",
};
const joelleSimon: Feedback2030Slot = {
  staff: "SIMON",
  client: "Joelle",
  time: "5.30 to 6",
  service: "Aquatic Activity",
};
const joelleSimonLate: Feedback2030Slot = {
  staff: "SIMON",
  client: "Joelle",
  time: "6 to 6.30",
  service: "Aquatic Activity",
};
const joelleAuroraFb = {
  client_name: "Joelle",
  completed_by_name: "Aurora Garcia",
  portal_session_key: "2026-09-10|joelle|17:30|aquatic",
  service: "Aquatic Activity",
};

const ctx = {
  ...emptyCtx,
  feedbackRows: [tinasheFb, vithuraFb, amberFb],
};
const joelleCtx = {
  ...emptyCtx,
  feedbackRows: [joelleAuroraFb],
};
const joelleDropped = applyFeedback2030BoardPolicy([joelleSimonLate], "2026-09-10");
const joelleKept530 = applyFeedback2030BoardPolicy([joelleSimon], "2026-09-10");

const fadiYoussef: Feedback2030Slot = {
  staff: "Youssef",
  client: "Fadi",
  time: "12.30 to 3",
  service: "Day Centre",
};
const fadiAbsentCtx = {
  ...emptyCtx,
  absentMarks: [{
    portal_session_key: "2026-09-28|fadi|day_centre",
    staff_user_id: "roberto-not-youssef",
    mark_type: "absent",
  }],
};
const emmanuelAbate: Feedback2030Slot = {
  staff: "Luliya",
  client: "Emmanuel Abate",
  time: "4.00 to 4.30",
  service: "Aquatic Activity",
};
const emanuelDayCentre: Feedback2030Slot = {
  staff: "Roberto",
  client: "Emanuel",
  time: "12.30 to 3",
  service: "Day Centre",
};
const luliyaCancelCtx = {
  ...emptyCtx,
  cancelRows: [{
    client_name: "Emmanuel",
    portal_session_key: "2026-10-06|emmanuel|day_centre",
    service: "Aquatic Activity",
    session_time: "4 to 4.30",
  }],
};
const eliasBoard = {
  "live-aquatic-acton-wednesday-16-00-4-00-4-30": {
    serviceId: "aquatic",
    day: "Wednesday",
    venue: "Acton",
    timeLabel: "4.00 - 4.30",
    seatLines: [{
      kind: "booked",
      client: "Elias",
      instructor: "Youssef",
      bookedFrom: "2026-09-23",
    }],
  },
};
const eliasBefore = slotsFromCapacityChainOccupants(eliasBoard, "2026-09-16");
const eliasOn = slotsFromCapacityChainOccupants(eliasBoard, "2026-09-23");
const emmanuelDayCentreSameSpelling: Feedback2030Slot = {
  staff: "Roberto",
  client: "Emmanuel",
  time: "11 to 1",
  service: "Day Centre",
};
const nameOnlyCancelCtx = {
  ...emptyCtx,
  cancelRows: [{
    client_name: "Emmanuel",
    portal_session_key: "2026-10-06|emmanuel|day_centre",
  }],
};
const digestCtx = {
  feedbackRows: [],
  cancelRows: luliyaCancelCtx.cancelRows,
  absentMarks: [],
  feedbackDoneMarks: [],
};
const abateRoster = {
  client_name: "Emmanuel Abate",
  time_slot: "4 to 4.30",
  service: "Aquatic Activity",
  instructors: "Luliya",
};
const dcRoster = {
  client_name: "Emmanuel",
  time_slot: "11 to 1",
  service: "Day Centre",
  instructors: "Roberto",
};

const checks = [
  ["godsway tinashe covered by bismark", slotIsResolved(godsway, iso, ctx), true],
  ["luliya vithura as Aida Luliya", slotIsResolved(luliyaV, iso, ctx), true],
  ["luliya amber as Aida Luliya", slotIsResolved(luliyaA, iso, ctx), true],
  ["godsway still open without fb", slotIsResolved(godsway, iso, emptyCtx), false],
  ["joelle 2:1 aurora submit clears simon 5.30", slotIsResolved(joelleSimon, "2026-09-10", joelleCtx), true],
  ["joelle 2:1 aurora submit clears aurora 5.30", slotIsResolved(joelleAurora, "2026-09-10", joelleCtx), true],
  ["joelle 2:1 5.30 submit does not clear 6.30", slotIsResolved(joelleSimonLate, "2026-09-10", joelleCtx), false],
  ["thu10 drops joelle 6-6.30 from 20:30 list", joelleDropped.length === 0, true],
  ["thu10 keeps joelle 5.30-6 on 20:30 list", joelleKept530.length === 1, true],
  [
    "absent mark from another staff clears the seat",
    slotIsResolved(fadiYoussef, "2026-09-28", fadiAbsentCtx),
    true,
  ],
  [
    "aquatic cancel keyed as day centre still closes Emmanuel Abate",
    slotIsResolved(emmanuelAbate, "2026-10-06", luliyaCancelCtx),
    true,
  ],
  [
    "that aquatic cancel does not close Day Centre Emanuel",
    slotIsResolved(emanuelDayCentre, "2026-10-06", luliyaCancelCtx),
    false,
  ],
  ["Elias is not a seat before 23 Sep", eliasBefore.length === 0, true],
  ["Elias is a seat from 23 Sep", eliasOn.length === 1, true],
  ["ring waits 30 minutes before sending again", feedbackRingAlreadySentToday([{ id: "1" }]), true],
  ["ring still sends when nothing was logged", feedbackRingAlreadySentToday([]), false],
  [
    "aquatic cancel does not close Day Centre Emmanuel",
    slotIsResolved(emmanuelDayCentreSameSpelling, "2026-10-06", luliyaCancelCtx),
    false,
  ],
  [
    "name-only day centre key does not close Emmanuel Abate",
    slotIsResolved(emmanuelAbate, "2026-10-06", nameOnlyCancelCtx),
    false,
  ],
  ["9pm digest keeps the aquatic cancel", rosterSlotIsComplete(abateRoster, "2026-10-06", digestCtx), true],
  ["9pm digest keeps Day Centre Emmanuel open", rosterSlotIsComplete(dcRoster, "2026-10-06", digestCtx), false],
];

const danHalves = slotsFromRosterRows([
  {
    client_name: "Amar Rai",
    time_slot: "5.30 to 6",
    service: "Aquatic Activity",
    instructors: "DAN",
    day: "Monday",
  },
  {
    client_name: "Amar Rai",
    time_slot: "5 to 5.30",
    service: "Aquatic Activity",
    instructors: "DAN",
    day: "Monday",
  },
], "2026-10-12");
const danMerged = mergeFeedback2030Slots([danHalves]);
const danOpen = outstandingByStaff(danMerged, "2026-10-12", emptyCtx);
const danAbsent = outstandingByStaff(danMerged, "2026-10-12", {
  ...emptyCtx,
  absentMarks: [
    { portal_session_key: "2026-10-12|amar_ra|aquatic", mark_type: "absent" },
    { portal_session_key: "2026-10-12|17:30|amar_ra", mark_type: "absent" },
  ],
});
const youssefAdam = applyScheduleOverridesToFeedback2030Slots(
  slotsFromRosterRows([{
    client_name: "Adam P",
    time_slot: "4 to 5.30",
    service: "Aquatic Activity",
    instructors: "ROBERTO",
    day: "Monday",
  }], "2026-10-12"),
  [
    {
      override_type: "instructor_reassign",
      status: "active",
      anchor_staff_id: "roberto",
      anchor_client_id: "adam_p",
      anchor_time_slot_label: "16 to 16.30",
      payload: { covering_staff_id: "youssef", covering_staff_name: "Youssef" },
    },
    {
      override_type: "instructor_reassign",
      status: "active",
      anchor_staff_id: "roberto",
      anchor_client_id: "adam_p",
      anchor_time_slot_label: "16.30 to 17",
      payload: { covering_staff_id: "youssef", covering_staff_name: "Youssef" },
    },
    {
      override_type: "instructor_reassign",
      status: "active",
      anchor_staff_id: "roberto",
      anchor_client_id: "adam_p",
      anchor_time_slot_label: "17 to 17.30",
      payload: { covering_staff_id: "youssef", covering_staff_name: "Youssef" },
    },
    {
      override_type: "slot_clear_client",
      status: "active",
      anchor_staff_id: "roberto",
      anchor_client_id: "adam_p",
      anchor_time_slot_label: "17 to 17.30",
      payload: { cancelled_by_admin: true, feedback_resolution: "cancelled" },
    },
  ],
);
const youssefOpen = outstandingByStaff(youssefAdam, "2026-10-12", emptyCtx);
const youssefDone = outstandingByStaff(youssefAdam, "2026-10-12", {
  ...emptyCtx,
  feedbackRows: [{
    client_name: "Adam P",
    completed_by_name: "Youssef",
    portal_session_key: "2026-10-12|adam_p|aquatic",
    service: "Aquatic Activity",
  }],
});
const youssefDebt = youssefOpen.find((d) => d.staffKey === "youssef");
checks.push(
  ["Dan hour is one card labelled 5 to 6", danMerged.length === 1 && danOpen[0]?.sample[0] === "Amar Rai 5 to 6", true],
  ["Dan absent on amar_ra clears the hour", danAbsent.length === 0, true],
  ["Youssef 4-5 is one card, not 16:00-16:30", youssefDebt?.pending === 1 && youssefDebt?.sample[0] === "Adam P 4 to 5", true],
  ["Youssef block feedback clears both halves", youssefDone.every((d) => d.staffKey !== "youssef"), true],
  [
    "5.30 submit still does not clear a separate 6-6.30 card",
    slotIsResolved(joelleSimonLate, "2026-09-10", joelleCtx) === false,
    true,
  ],
);

let failed = 0;
for (const [label, got, want] of checks) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok" : "FAIL"}  ${label}  got=${got} want=${want}`);
}
if (failed) {
  Deno.exit(1);
}
