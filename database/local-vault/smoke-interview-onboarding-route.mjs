#!/usr/bin/env node
/**
 * Smoke: interview outcomes → destinations
 *   - Successful (ready) → Onboarding
 *   - Unsuccessful → Call back later (kept to contact again)
 *
 *   node database/local-vault/smoke-interview-onboarding-route.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from local-secrets/secrets.env
 * Uses PostgREST (no @supabase/supabase-js install required).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function phaseOf(c) {
  const face = (c.faceToFaceInterview && c.faceToFaceInterview.status) || "";
  const call = (c.callInterview && c.callInterview.status) || "";
  const ob = c.onboarding || {};
  if (ob.readyToStart || ob.onboardingCompleted) return "ready";
  if (face === "successful-ready" || face === "successful") return "onboarding";
  if (face === "successful-hold") return "callback_hold";
  if (face === "unsuccessful") return "callback_unsuccessful";
  if (call === "successful") return "face_to_face";
  if (call === "unsuccessful") return "callback_call";
  return "new";
}

function bucketOf(phase) {
  if (phase === "ready" || phase === "onboarding") return "onboarding";
  if (String(phase).startsWith("callback")) return "callback_later";
  return "in_progress";
}

const url = (readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(/\/$/, "");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const rest = url + "/rest/v1/onboarding_candidates";
const headers = {
  apikey: serviceKey,
  Authorization: "Bearer " + serviceKey,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=representation",
};

const now = new Date().toISOString();
const day = now.slice(0, 10);
const successId = "cand_smoke_success_jul24";
const callbackId = "cand_smoke_callback_jul24";

const successCandidate = {
  id: successId,
  name: "Smoke Test Success (Jul24)",
  createdAt: now,
  updatedAt: now,
  callInterview: {
    interviewerName: "Smoke Tester",
    date: day,
    time: "10:00",
    comments: "Smoke: call passed.",
    status: "successful",
    unsuccessfulReason: "",
    generalNotes: "Clear communicator; good availability.",
  },
  faceToFaceInterview: {
    interviewerName: "Smoke Tester",
    date: day,
    time: "11:00",
    comments: "Smoke: face-to-face passed — ready for onboarding.",
    status: "successful-ready",
    unsuccessfulReason: "",
    successfulHoldReason: "",
    readyOnboardingNotes: "Move straight into Support Worker onboarding checklist.",
    finalKnowledge: 3,
    finalAttitude: 4,
  },
  onboarding: {
    role: "Support Worker",
    welcomeEmailSent: true,
    folderCreated: true,
    healthQuestionnaireSent: true,
    healthQuestionnaireReceived: false,
    referencesRequested: false,
    referenceOneReceived: false,
    referenceOneInfo: "",
    referenceTwoReceived: false,
    referenceTwoInfo: "",
    referencesChecked: false,
    referencesCheckedInfo: "",
    dbsRequested: false,
    dbsEmailToEmployee: false,
    dbsVerified: false,
    dbsDateEnVigor: "",
    dbsCompleted: false,
    passportReceived: false,
    britishStatus: "Yes",
    rightToWorkCode: "",
    rightToWorkVerifiedDate: "",
    rightToWorkVerified: false,
    certificate1Received: false,
    certificate2Received: false,
    certificate2Date: "",
    safetyAwardTrainingDate: "",
    starterChecklistCompleted: false,
    onboardingCompleted: false,
    readyToStart: false,
    onboardingNotes: "Smoke test — successful path into onboarding.",
  },
  historyLog: [
    { at: now, summary: "Smoke: call successful → face successful-ready → onboarding started." },
  ],
};

const callbackCandidate = {
  id: callbackId,
  name: "Smoke Test Callback (Jul24)",
  createdAt: now,
  updatedAt: now,
  callInterview: {
    interviewerName: "Smoke Tester",
    date: day,
    time: "14:00",
    comments: "Smoke: call passed; face not progressing now.",
    status: "successful",
    unsuccessfulReason: "",
    generalNotes: "Warm candidate; timing not right.",
  },
  faceToFaceInterview: {
    interviewerName: "Smoke Tester",
    date: day,
    time: "15:00",
    comments: "Smoke: unsuccessful for this round — keep for a future call.",
    status: "unsuccessful",
    unsuccessfulReason:
      "Not progressing to onboarding this round (smoke). Keep on Call back later list to contact again when a Support Worker / SEN seat opens.",
    successfulHoldReason: "",
    readyOnboardingNotes: "",
    finalKnowledge: 2,
    finalAttitude: 3,
  },
  onboarding: {
    role: "Support Worker",
    welcomeEmailSent: false,
    folderCreated: false,
    healthQuestionnaireSent: false,
    healthQuestionnaireReceived: false,
    referencesRequested: false,
    referenceOneReceived: false,
    referenceOneInfo: "",
    referenceTwoReceived: false,
    referenceTwoInfo: "",
    referencesChecked: false,
    referencesCheckedInfo: "",
    dbsRequested: false,
    dbsEmailToEmployee: false,
    dbsVerified: false,
    dbsDateEnVigor: "",
    dbsCompleted: false,
    passportReceived: false,
    britishStatus: "",
    rightToWorkCode: "",
    rightToWorkVerifiedDate: "",
    rightToWorkVerified: false,
    certificate1Received: false,
    certificate2Received: false,
    certificate2Date: "",
    safetyAwardTrainingDate: "",
    starterChecklistCompleted: false,
    onboardingCompleted: false,
    readyToStart: false,
    onboardingNotes: "",
  },
  historyLog: [
    { at: now, summary: "Smoke: face unsuccessful → Call back later (future contact)." },
  ],
};

const results = [];
function log(step, ok, detail) {
  results.push({ step, ok: !!ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? " — " + detail : ""}`);
}

async function upsertCandidate(c) {
  const res = await fetch(rest, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: c.id,
      updated_at: c.updatedAt,
      data: c,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + text.slice(0, 300));
  return text;
}

async function loadByIds(ids) {
  const q =
    rest +
    "?select=id,data,updated_at&id=in.(" +
    ids.map(encodeURIComponent).join(",") +
    ")";
  const res = await fetch(q, {
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + " " + text.slice(0, 300));
  return JSON.parse(text);
}

async function main() {
  console.log("Interview smoke → route successful / unsuccessful\n");

  try {
    await upsertCandidate(successCandidate);
    log("upsert_success", true, successId);
  } catch (e) {
    log("upsert_success", false, e.message || String(e));
  }

  try {
    await upsertCandidate(callbackCandidate);
    log("upsert_callback", true, callbackId);
  } catch (e) {
    log("upsert_callback", false, e.message || String(e));
  }

  let data = [];
  try {
    data = await loadByIds([successId, callbackId]);
    log("reload", true, String(data.length) + " rows");
  } catch (e) {
    log("reload", false, e.message || String(e));
    process.exit(1);
  }

  const byId = new Map(data.map((r) => [r.id, r.data]));
  const s = byId.get(successId);
  const u = byId.get(callbackId);
  const sp = s ? phaseOf(s) : "";
  const up = u ? phaseOf(u) : "";

  log("success_phase", sp === "onboarding", sp || "missing");
  log("success_bucket", bucketOf(sp) === "onboarding", bucketOf(sp));
  log("callback_phase", up === "callback_unsuccessful", up || "missing");
  log("callback_bucket", bucketOf(up) === "callback_later", bucketOf(up));

  console.log("\nDestinations:");
  console.log("  Successful → Admin → Interviews → Onboarding");
  console.log("             Working_interview.html?q=Smoke%20Test%20Success");
  console.log("  Unsuccessful → Admin → Interviews → Call back later");
  console.log("               Working_interview.html?q=Smoke%20Test%20Callback");

  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
