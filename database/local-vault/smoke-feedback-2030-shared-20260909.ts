/**
 * Smoke: 20:30 matcher should treat Bismark Tinashe as covering Godsway,
 * and Aida Luliya as covering roster LULIYA.
 *   npx -y deno run -A database/local-vault/smoke-feedback-2030-shared-20260909.ts
 */
import {
  applyFeedback2030BoardPolicy,
  slotIsResolved,
  type Feedback2030Slot,
} from "../../supabase/functions/_shared/portal_feedback_2030_match.ts";

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
const clockProbe = String(joelleSimonLate.time || "").toLowerCase().match(/(\d{1,2})[:.](\d{2})/);

const DEBUG_LOG = "/Users/victor/cursor/PORTALVIC/.cursor/debug-f1029b.log";
function dbg(hid: string, msg: string, data: Record<string, unknown>) {
  try {
    Deno.writeTextFileSync(
      DEBUG_LOG,
      JSON.stringify({
        sessionId: "f1029b",
        runId: "pre-fix",
        hypothesisId: hid,
        location: "smoke-feedback-2030-shared-20260909.ts",
        message: msg,
        data,
        timestamp: Date.now(),
      }) + "\n",
      { append: true },
    );
  } catch (_) {}
}

dbg("B", "joelle-6.30-clock-parse", {
  time: joelleSimonLate.time,
  firstHm: clockProbe ? `${clockProbe[1]}:${clockProbe[2]}` : null,
  droppedLen: joelleDropped.length,
  kept530: joelleKept530.length,
});

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
];

let failed = 0;
for (const [label, got, want] of checks) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok" : "FAIL"}  ${label}  got=${got} want=${want}`);
  dbg("A", "check", { label, got, want, ok });
}
if (failed) {
  Deno.exit(1);
}
