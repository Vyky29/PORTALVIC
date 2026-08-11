/**
 * Local verify: Assign MADRE fold replaces NO PARTICIPANT so weekly offer free −1.
 * Run: npx -y deno run -A database/local-vault/verify-assign-consume-open-seat.ts
 */
import {
  applyFoldToMadre,
  type MadreDoc,
} from "../../supabase/functions/_shared/portal_madre_fold_logic.ts";
import { buildWeeklyOfferFromMadre } from "../../supabase/functions/_shared/portal_booking_seat_helper.ts";

/** Two open seats + one booked on same aquatic band → free should drop by 1 after Assign. */
function sampleMadre(): MadreDoc {
  return {
    meta: { termFrom: "2026-06-01", termTo: "2026-07-19" },
    weeks: [
      {
        start: "2026-07-13",
        end: "2026-07-19",
        staff: [
          {
            staffKey: "youssef",
            staffName: "YOUSSEF",
            days: [
              {
                weekday: "Monday",
                sessionDate: "2026-07-13",
                slots: [
                  {
                    client_name: "NO PARTICIPANT",
                    time_slot: "4.30 to 5",
                    service: "Aquatic Activity",
                    venue: "Acton",
                  },
                ],
              },
            ],
          },
          {
            staffKey: "dan",
            staffName: "DAN",
            days: [
              {
                weekday: "Monday",
                sessionDate: "2026-07-13",
                slots: [
                  {
                    client_name: "NO PARTICIPANT",
                    time_slot: "4.30 to 5",
                    service: "Aquatic Activity",
                    venue: "Acton",
                  },
                  {
                    client_name: "Booked Kid",
                    time_slot: "4.30 to 5",
                    service: "Aquatic Activity",
                    venue: "Acton",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function targetSlot(
  slots: ReturnType<typeof buildWeeklyOfferFromMadre>["slots"],
) {
  return slots.find(
    (s) =>
      s.serviceId === "aquatic" &&
      s.day === "Monday" &&
      /acton/i.test(s.venue),
  );
}

const before = sampleMadre();
const offerBefore = buildWeeklyOfferFromMadre(before);
const slotBefore = targetSlot(offerBefore.slots);
const freeBefore = Math.max(
  0,
  Number(slotBefore?.capacity || 0) - Number(slotBefore?.taken || 0),
);

const after = structuredClone(before);
const fold = applyFoldToMadre(after, {
  fold_type: "participant_slot_upsert",
  session_date: "2026-07-13",
  payload: {
    client_name: "Ada Assign",
    day: "Monday",
    time_slot: "4.30 to 5",
    instructors: "YOUSSEF",
    service: "Aquatic Activity",
    venue: "Acton",
    replace_open: true,
  },
});

const offerAfter = buildWeeklyOfferFromMadre(after);
const slotAfter = targetSlot(offerAfter.slots);
const freeAfter = Math.max(
  0,
  Number(slotAfter?.capacity || 0) - Number(slotAfter?.taken || 0),
);

const youssefSlots = after.weeks?.[0]?.staff?.[0]?.days?.[0]?.slots || [];
const openOnYoussef = youssefSlots.some(
  (s) => String(s.client_name).toUpperCase() === "NO PARTICIPANT",
);
const named = youssefSlots.some((s) => s.client_name === "Ada Assign");
const openOnDan = (after.weeks?.[0]?.staff?.[1]?.days?.[0]?.slots || []).some(
  (s) => String(s.client_name).toUpperCase() === "NO PARTICIPANT",
);

const report = {
  fold,
  freeBefore,
  freeAfter,
  capacityBefore: slotBefore?.capacity,
  takenBefore: slotBefore?.taken,
  capacityAfter: slotAfter?.capacity,
  takenAfter: slotAfter?.taken,
  openOnYoussef,
  openOnDan,
  namedPresent: !!named,
  ok:
    fold.ok &&
    !!named &&
    !openOnYoussef &&
    openOnDan &&
    freeBefore >= 1 &&
    freeAfter === freeBefore - 1,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("VERIFY FAILED");
  Deno.exit(1);
}
console.log("VERIFY OK — Assign fold consumes open seat on offer");
