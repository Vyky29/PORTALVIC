/**
 * Staff: sign training attendance for a Training Record participant row.
 */
import { bootstrapDashboardSupabase } from "/portal/auth-handler.js?v=20260703-ld-funding";

const TYPE_LABELS = {
  emergency_evacuation: "Emergency evacuation",
  venue_induction: "Venue induction",
  internal_training: "Internal training",
  external_training: "External training",
  swimming_shadowing: "Swimming shadowing",
  behaviour_communication: "Behaviour & communication",
  practical_assessment: "Practical assessment",
  policy_briefing: "Policy briefing",
  other: "Other",
};

const params = new URLSearchParams(location.search);
const recordId = String(params.get("record_id") || "").trim();
const participantId = String(params.get("participant_id") || "").trim();

const $ = (id) => document.getElementById(id);
const C = window.ContractCore;

let client = null;
let session = null;
let record = null;
let participant = null;
let sessions = [];
let sigUrl = "";
let padApi = null;

function show(id) {
  ["loading", "errorBox", "doneBox", "signPanel"].forEach((k) => {
    const el = $(k);
    if (el) el.classList.toggle("hidden", k !== id);
  });
}

function showError(msg) {
  const box = $("errorBox");
  if (box) box.textContent = msg || "Something went wrong.";
  show("errorBox");
}

function clean(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

function typeLabel(code) {
  return TYPE_LABELS[clean(code)] || clean(code) || "Training";
}

function fmtDate(iso) {
  const s = clean(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  try {
    return new Date(s + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch (_) {
    return s;
  }
}

function refreshSubmit() {
  const typed = clean($("typedName") && $("typedName").value);
  const ack = $("ack") && $("ack").checked;
  const btn = $("submitBtn");
  if (btn) btn.disabled = !(typed && ack && sigUrl);
}

function renderMeta() {
  $("titleEl").textContent = clean(record.title) || "Training";
  $("subRef").textContent = typeLabel(record.training_type);
  const sess = sessions[0];
  const bits = [
    ["Type", typeLabel(record.training_type)],
    ["Venue", clean(record.venue_label) || "—"],
    ["Date", sess ? fmtDate(sess.session_date) : "—"],
    [
      "Time",
      sess
        ? [(sess.start_time || "").slice(0, 5), (sess.end_time || "").slice(0, 5)]
            .filter(Boolean)
            .join(" – ") || "—"
        : "—",
    ],
    ["Hours", record.total_hours != null ? String(record.total_hours) : "—"],
  ];
  $("metaEl").innerHTML = bits
    .map(
      ([k, v]) =>
        "<dt>" +
        k +
        "</dt><dd>" +
        String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;") +
        "</dd>",
    )
    .join("");
}

async function ensureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("jsPDF failed to load"));
    document.head.appendChild(s);
  });
  return window.jspdf;
}

async function buildAttendancePdfBlob() {
  const jspdf = await ensureJsPdf();
  const pdf = new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const margin = 18;
  let y = 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Training attendance record", margin, y);
  y += 10;
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  const lines = [
    "clubSENsational Ltd",
    "",
    "Title: " + clean(record.title),
    "Type: " + typeLabel(record.training_type),
    "Venue: " + (clean(record.venue_label) || "—"),
    "Staff: " + (clean(participant.display_name) || clean($("typedName").value)),
    "Date: " + (sessions[0] ? fmtDate(sessions[0].session_date) : "—"),
    "Hours: " + (record.total_hours != null ? String(record.total_hours) : "—"),
    "Signed: " + new Date().toLocaleString("en-GB"),
    "Typed name: " + clean($("typedName").value),
  ];
  lines.forEach((line) => {
    if (!line) {
      y += 4;
      return;
    }
    const wrapped = pdf.splitTextToSize(line, 174);
    wrapped.forEach((wl) => {
      pdf.text(wl, margin, y);
      y += 6;
    });
  });
  if (sigUrl) {
    try {
      y += 6;
      pdf.setFont("helvetica", "bold");
      pdf.text("Signature", margin, y);
      y += 4;
      pdf.addImage(sigUrl, "PNG", margin, y, 60, 24);
    } catch (_) {}
  }
  return pdf.output("blob");
}

async function load() {
  try {
    await bootstrapDashboardSupabase({ page: "staff" });
  } catch (_) {
    showError("Sign in to the portal to sign training attendance.");
    return;
  }
  const box = window.__PORTAL_SUPABASE__ || {};
  client = box.client;
  session = box.session;
  if (!client || !session?.user?.id) {
    location.href = "login.html?next=" + encodeURIComponent(location.href);
    return;
  }
  if (!recordId || !participantId) {
    showError("Missing training record link. Open the request from your dashboard.");
    return;
  }

  const recRes = await client.from("portal_training_records").select("*").eq("id", recordId).maybeSingle();
  if (recRes.error || !recRes.data) {
    showError("Training record not found or you are not assigned.");
    return;
  }
  record = recRes.data;

  const partRes = await client
    .from("portal_training_record_participants")
    .select("*")
    .eq("id", participantId)
    .eq("record_id", recordId)
    .maybeSingle();
  if (partRes.error || !partRes.data) {
    showError("Participant row not found.");
    return;
  }
  participant = partRes.data;
  if (String(participant.user_id) !== String(session.user.id)) {
    showError("This signature request is for another staff member.");
    return;
  }
  if (participant.signed_at) {
    show("doneBox");
    return;
  }

  const sessRes = await client
    .from("portal_training_record_sessions")
    .select("*")
    .eq("record_id", recordId)
    .order("sort_index", { ascending: true });
  sessions = sessRes.data || [];

  renderMeta();
  $("typedName").value = clean(participant.display_name) || "";
  if (C && typeof C.setupSignaturePad === "function") {
    padApi = C.setupSignaturePad($("sigCanvas"), { drawing: false }, (url) => {
      sigUrl = url;
      refreshSubmit();
    });
  }
  $("clearSig").addEventListener("click", () => {
    sigUrl = "";
    if (padApi && padApi.clear) padApi.clear();
    refreshSubmit();
  });
  $("typedName").addEventListener("input", refreshSubmit);
  $("ack").addEventListener("change", refreshSubmit);
  $("submitBtn").addEventListener("click", onSubmit);
  show("signPanel");
}

async function onSubmit() {
  const btn = $("submitBtn");
  btn.disabled = true;
  try {
    const typed = clean($("typedName").value);
    if (!typed || !sigUrl || !$("ack").checked) {
      btn.disabled = false;
      return;
    }

    const blob = await buildAttendancePdfBlob();
    let documentId = null;
    try {
      const mod = await import("/portal/portal_documents.js?v=20260714-tr-p1");
      const uploaded = await mod.portalUploadPdfAndCreateDocument({
        blob,
        document_type: "training_attendance_record",
        category: "training",
        title: "Training attendance — " + clean(record.title),
        source_page: "training_record_sign",
        related_date: sessions[0] ? String(sessions[0].session_date).slice(0, 10) : null,
        reuseAuth: { supabase: client, user: session.user },
      });
      documentId = uploaded && uploaded.id ? uploaded.id : null;
    } catch (err) {
      console.warn("[training sign] pdf upload", err);
    }

    const upd = await client
      .from("portal_training_record_participants")
      .update({
        attendance_status: "present",
        outcome: "completed",
        typed_name: typed,
        signature_png: sigUrl.slice(0, 350000),
        signed_at: new Date().toISOString(),
        document_id: documentId,
      })
      .eq("id", participant.id)
      .eq("user_id", session.user.id);
    if (upd.error) throw upd.error;

    // Clear the signature-request announcement so it leaves the halo lock.
    if (participant.announcement_id) {
      try {
        await client.from("portal_staff_announcement_acks").upsert(
          {
            announcement_id: participant.announcement_id,
            user_id: session.user.id,
            acknowledged_at: new Date().toISOString(),
          },
          { onConflict: "announcement_id,user_id" },
        );
      } catch (ackErr) {
        console.warn("[training sign] ack", ackErr);
      }
    }

    show("doneBox");
  } catch (err) {
    console.warn("[training sign]", err);
    showError((err && err.message) || "Could not save signature. Please try again.");
    btn.disabled = false;
  }
}

void load();
