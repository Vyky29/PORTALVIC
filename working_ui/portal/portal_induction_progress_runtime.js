/**
 * General Induction pages: restore progress from Supabase and sync back to staff readiness.
 */
import { bootstrapDashboardSupabase } from "/portal/auth-handler.js?v=20260624-push-icon-ghost-handoff";

function queueSync() {
  if (typeof window.portalSyncTrainingProgressToSupabase === "function") {
    void window.portalSyncTrainingProgressToSupabase();
  }
}

async function bootInductionProgressRuntime() {
  try {
    await bootstrapDashboardSupabase({ page: "general_induction" });
    await import("./portal_training_progress_sync.js?v=20260604-induction-persist");
    if (typeof window.portalHydrateInductionProgressFromSupabase === "function") {
      await window.portalHydrateInductionProgressFromSupabase();
    }
    queueSync();
    window.dispatchEvent(new CustomEvent("portal:induction-hydrated"));
  } catch (err) {
    try {
      console.debug("[portal] induction progress runtime", err);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("portal:induction-hydrated"));
  }
}

window.__portalInductionProgressReady = bootInductionProgressRuntime();
void window.__portalInductionProgressReady;

window.addEventListener("portal:induction-progress", queueSync);
window.addEventListener("portal:induction-progress-restored", queueSync);
window.addEventListener("pagehide", queueSync);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") queueSync();
});
