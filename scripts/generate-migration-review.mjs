#!/usr/bin/env node
/**
 * Regenerates working_ui/migration-review.html from supabase/migrations.
 * Run: node scripts/generate-migration-review.mjs
 */
import fs from "fs";
import path from "path";

const OUT = "working_ui/migration-review.html";
const SUPA = "supabase/migrations";
const DB = "database/migrations";

const files = fs.readdirSync(SUPA)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const dbFiles = fs.existsSync(DB)
  ? fs.readdirSync(DB).filter((f) => f.endsWith(".sql")).sort()
  : [];
const dbSet = new Set(dbFiles);
const supaSet = new Set(files);

function read(f) {
  return fs.readFileSync(path.join(SUPA, f), "utf8");
}

function extractObjects(content) {
  const objs = { tables: new Set(), functions: new Set(), policies: new Set() };
  let m;
  const patterns = [
    [/create table if not exists\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/create table\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/alter table\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/create or replace function\s+(?:public\.)?([^\s(]+)/gi, "functions"],
    [/create policy\s+"?([^"\n]+)"?\s+on\s+(?:public\.)?([^\s]+)/gi, "policies"],
    [/insert into\s+(?:public\.)?([^\s(]+)/gi, "tables"],
    [/update\s+(?:public\.)?([^\s]+)/gi, "tables"],
  ];
  for (const [re, kind] of patterns) {
    const re2 = new RegExp(re.source, re.flags);
    while ((m = re2.exec(content))) {
      objs[kind].add(
        kind === "policies" ? `${m[2]}::${m[1]}` : m[1].replace(/"/g, "")
      );
    }
  }
  return objs;
}

const CLUSTER_RULES = [
  {
    id: "bootstrap",
    re: /bootstrap|foundation|enable_rls_clients|supabase_admin_project|staff_profile_self_update/,
    title: "Bootstrap y base del portal",
    desc: "Primeras tablas, RLS inicial y RPC de arranque. Necesario en Supabase vacío.",
    affects: "Auth staff, tablas core, políticas base.",
  },
  {
    id: "session_feedback",
    re: /session_feedback|feedback_shared|feedback_status|parent_feedback|disruption|portal_admin_session_feedback/,
    title: "Feedback de sesión",
    desc: "Formulario staff, listado admin RPC, padres, sanitizado IA.",
    affects: "portal-session-feedback.html, admin Sessions hub.",
  },
  {
    id: "achievements",
    re: /achievement|participant.*photo|inbox.*photo|camera/,
    title: "Logros y fotos",
    desc: "Inbox fotos, storage, finalize, permisos cámara.",
    affects: "portal_participant_achievements.js, admin inbox.",
  },
  {
    id: "parent_portal",
    re: /parent_portal|parent_contacts|parent_swim|parent_whatsapp|parent_portal_message/,
    title: "Portal padres",
    desc: "Login familias, mensajes, WhatsApp inbound.",
    affects: "Flujos familias.",
  },
  {
    id: "roster_overrides",
    re: /schedule_override|roster_row|portal_roster|slot_|makeup|trial|cancel_|youssef|fadi|chaitanya|eddie|roberto|westway|sunday_202/,
    title: "Roster y overrides",
    desc: "Cuadrícula + muchos one-shots (cancel/trial por día).",
    affects: "Bookings, session cards, scheduling.",
  },
  {
    id: "timesheet_payroll",
    re: /timesheet|payroll|payslip|role_rate|contractor_invoice|expense/,
    title: "Timesheets y nómina",
    desc: "Horas, cron payroll, payslips, contractor invoice.",
    affects: "Timesheet staff, admin finance.",
  },
  {
    id: "staff_auth",
    re: /staff_profile|auth\.|login|username|admin_or_ceo|ceo_|sevitha|exec|planner_access|office_route|portal_admin/,
    title: "Staff, auth, admin/CEO",
    desc: "Perfiles, aliases, rutas admin, RLS exec.",
    affects: "login routing, admin_dashboard.",
  },
  {
    id: "announcements",
    re: /announcement|calendar_announcement|ack_insert/,
    title: "Anuncios",
    desc: "Contenido editorial insertado por SQL.",
    affects: "Campana avisos, push.",
  },
  {
    id: "push_notifications",
    re: /push_subscription|webpush|webhook|vapid|late_feedback/,
    title: "Push y crons digest",
    desc: "Web push, webhooks DB→edge, digest feedback tarde.",
    affects: "PWA push, edge crons.",
  },
  {
    id: "dm_comms",
    re: /staff_dm|internal_dm|executive_dm|dm_image|dm_voice|wellbeing/,
    title: "DM y wellbeing",
    desc: "Chat interno, wellbeing check-in.",
    affects: "DM modules, wellbeing page.",
  },
  {
    id: "documents_hr",
    re: /employment_contract|participant_document|madre_|hr_contract|hr_records/,
    title: "HR y documentos",
    desc: "Contratos, MADRE, documentos participante.",
    affects: "hr_contract.html, documents.",
  },
  {
    id: "visits_leads",
    re: /visit_session|lead_session|lead_directory|lead_peer/,
    title: "Visitas y leads",
    desc: "Visit pulse, lead reports.",
    affects: "Lead overview tools.",
  },
  {
    id: "participants",
    re: /participant_catalog|participants_and_parent|participant_general|participant_avatar|client_payment|waiting_list/,
    title: "Participantes y pagos",
    desc: "Catálogo, avatares, client_payments.",
    affects: "Participants admin, Orders.",
  },
  {
    id: "cancellations_absence",
    re: /cancellation_report|absent|quick_mark|peer_absent/,
    title: "Cancelaciones y ausencias",
    desc: "Informes cancelación, quick marks.",
    affects: "Sessions hub tabs.",
  },
  {
    id: "live_map",
    re: /live_map|live_location/,
    title: "Mapa live staff",
    desc: "Ubicaciones staff admin.",
    affects: "Live presence bar.",
  },
  {
    id: "misc",
    re: /.*/,
    title: "Otros",
    desc: "Fixes varios.",
    affects: "Caso a caso.",
  },
];

function assignCluster(filename, content) {
  const hay = `${filename} ${content.slice(0, 2500)}`;
  for (const rule of CLUSTER_RULES) {
    if (rule.id !== "misc" && rule.re.test(hay)) return rule;
  }
  return CLUSTER_RULES.find((r) => r.id === "misc");
}

function classifyKind(filename, content) {
  const hasDDL = /create table|create or replace function|create policy|alter table/i.test(
    content
  );
  const dataLines = /^insert into|^update |^delete from/m.test(content);
  const isRosterFix =
    /youssef|fadi|chaitanya|eddie|roberto|carlos|andres|makeup|trial|cancel.*2026|westway|jun\d{2}|jul\d{2}|sunday_2026/i.test(
      filename
    );
  if (isRosterFix || (dataLines && !hasDDL)) return "one-shot";
  if (hasDDL || /create or replace function/i.test(content)) return "structural";
  return "mixed";
}

const functionOwners = {};
const items = files.map((f) => {
  const content = read(f);
  const objs = extractObjects(content);
  const cluster = assignCluster(f, content);
  const kind = classifyKind(f, content);
  const m = f.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  objs.functions.forEach((fn) => {
    if (!functionOwners[fn]) functionOwners[fn] = [];
    functionOwners[fn].push(f);
  });
  const comment = content
    .split("\n")
    .filter((l) => l.trim().startsWith("--"))
    .map((l) => l.replace(/^--\s?/, "").trim())
    .filter((l) => l && !/^=/.test(l))
    .slice(0, 4)
    .join("\n");
  return {
    id: f,
    file: f,
    day: m ? `${m[1]}-${m[2]}-${m[3]}` : "?",
    time: m ? `${m[4]}:${m[5]}` : "",
    clusterId: cluster.id,
    clusterTitle: cluster.title,
    clusterDesc: cluster.desc,
    clusterAffects: cluster.affects,
    kind,
    comment,
    hasDbCopy: dbSet.has(f),
    objs: {
      tables: [...objs.tables].slice(0, 6),
      functions: [...objs.functions].slice(0, 6),
      policies: [...objs.policies].slice(0, 4),
    },
  };
});

const supersededInfo = {};
for (const [fn, list] of Object.entries(functionOwners)) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length - 1; i++) {
    if (!supersededInfo[list[i]]) supersededInfo[list[i]] = [];
    supersededInfo[list[i]].push({ fn, later: list[list.length - 1] });
  }
}

function autoRec(it) {
  const sup = supersededInfo[it.id];
  const content = read(it.file);
  if (it.kind === "one-shot")
    return {
      rec: "archive",
      label: "One-shot",
      why: "Dato puntual (roster/anuncio). En Portal prod ya aplicado — defer por defecto. Sigue en carpeta git por historial.",
    };
  if (sup?.length)
    return {
      rec: "chain",
      label: "Cadena RPC",
      why: `CREATE OR REPLACE posterior sobre ${sup.map((s) => s.fn).join(", ")}. Mantener en CLI en orden; no es duplicado.`,
    };
  if (it.kind === "structural")
    return {
      rec: "essential",
      label: "Esencial",
      why: "Esquema, RLS o RPC — el portal actual lo necesita. Keep en CLI.",
    };
  if (it.clusterId === "announcements" && /insert/i.test(content))
    return {
      rec: "archive",
      label: "Anuncio",
      why: "INSERT de contenido — defer salvo clonar entorno.",
    };
  return {
    rec: "review",
    label: "Revisar tú",
    why: "Mezcla esquema + datos o webhook/cron — decide si sigue activo en prod.",
  };
}

for (const it of items) {
  it.superseded = supersededInfo[it.id] || null;
  it.auto = autoRec(it);
}

const clusters = {};
for (const it of items) {
  if (!clusters[it.clusterId]) {
    const def = CLUSTER_RULES.find((r) => r.id === it.clusterId);
    clusters[it.clusterId] = {
      id: it.clusterId,
      title: def.title,
      desc: def.desc,
      affects: def.affects,
      items: [],
    };
  }
  clusters[it.clusterId].items.push(it);
}
const clusterList = Object.values(clusters).sort(
  (a, b) => b.items.length - a.items.length
);

/** Victor / auto review 2026-07-03 — 13 CLI + 39 database-only */
const EXPERT_52 = {
  "20260519120000_dashboard_route_vercel_paths.sql": {
    rec: "keep",
    verdict: "Keep en CLI",
    context:
      "Antes staff_profiles.dashboard_route apuntaba a rutas legacy (/p1, /l1). El portal Vercel usa *.html. UPDATE idempotente.",
    affects: "login.html → staff/lead/ceo/admin dashboard correcto tras migrar de WordPress.",
  },
  "20260522120000_portal_admin_clubsensational_emails.sql": {
    rec: "defer",
    verdict: "Guardar sin usar (no es migración)",
    context:
      "Solo SELECT de diagnóstico + UPDATE comentados para Victor/Raul/Javi/Sevitha. No cambia esquema. Era checklist SQL Editor.",
    affects: "Nada en runtime — mover a docs/local-vault.",
  },
  "20260530090000_portal_add_michelle_staff_login.sql": {
    rec: "defer",
    verdict: "Guardar sin usar (one-shot staff)",
    context:
      "Relink perfil Michelle → auth michelle@youtimecounselling.com. Ya aplicado en prod; re-ejecutar falla si no existe auth user.",
    affects: "Login Michelle lead dashboard.",
  },
  "20260601174600_portal_fix_schedule_override_push_webhook.sql": {
    rec: "keep",
    verdict: "Keep en CLI",
    context:
      "Trigger HTTP en schedule_overrides → push cuando admin cambia roster. Necesita secret sustituido en prod.",
    affects: "Push móvil al guardar override en Scheduling & Cover.",
  },
  "20260609120000_portal_late_feedback_9am_digest.sql": {
    rec: "keep",
    verdict: "Keep en cadena (cron viejo)",
    context:
      "Cron 9am digest — sustituido por migraciones posteriores (21h London). Debe quedarse: desprograma jobs viejos en orden.",
    affects: "Historial pg_cron; no ejecutar manualmente otra vez.",
  },
  "20260610120000_portal_clear_erroneous_feedback_quick_marks.sql": {
    rec: "defer",
    verdict: "Guardar sin usar (one-shot)",
    context: "DELETE quick marks feedback_done sin fila session_feedback desde 2026-06-10. Limpieza puntual tablets.",
    affects: "Staff dashboard marcas verdes incorrectas (ya corregido).",
  },
  "20260610220000_portal_late_feedback_single_21h_cron.sql": {
    rec: "keep",
    verdict: "Keep en cadena",
    context: "Unifica digest a 21:00 UTC; unschedule nombres viejos. Paso intermedio hacia London 21h.",
    affects: "pg_cron digest feedback pendiente.",
  },
  "20260611210000_portal_late_feedback_london_21h_cron.sql": {
    rec: "keep",
    verdict: "Keep en CLI (cron activo)",
    context:
      "Versión actual: 20:00 y 21:00 UTC para que Edge ejecute a las 21:00 London. Esta es la que manda hoy.",
    affects: "Push admin feedback no enviado tras turno tarde.",
  },
  "20260616140000_session_feedback_adaam_ah_worker_name.sql": {
    rec: "defer",
    verdict: "Guardar sin usar (one-shot)",
    context: "Corrige client_name Adaam Ah vs Aadam Ah en filas existentes.",
    affects: "Matching admin hub / export nombres.",
  },
  "20260620220000_portal_late_feedback_push_webhook_and_cron.sql": {
    rec: "keep",
    verdict: "Keep en CLI",
    context:
      "Trigger push en INSERT session_feedback + cron 21h. Complementa digest; trigger sigue activo.",
    affects: "Alerta admin al submit feedback; cron (parcialmente superseded).",
  },
  "20260625130100_portal_payroll_june26_9am_cron.sql": {
    rec: "defer",
    verdict: "Guardar sin usar (one-off junio 2026)",
    context:
      "Cron único 26-jun-2026 9am London payroll email. Se auto-desprograma; fecha ya pasará.",
    affects: "Email nómina a contabilidad — evento puntual.",
  },
  "20260628120000_portal_dm_chat_admin_push_webhook.sql": {
    rec: "keep",
    verdict: "Keep en CLI",
    context: "Triggers push en DM staff y CEO group → admin alert edge.",
    affects: "Push chat interno (UI chat oculta pero triggers activos).",
  },
  "20260630190000_portal_announcement_push_webhook.sql": {
    rec: "keep",
    verdict: "Keep en CLI",
    context: "Trigger push al INSERT portal_staff_announcements.",
    affects: "Push campana anuncios staff.",
  },
  // --- solo database/migrations (26 paso 2) ---
  // bootstrapKind: copy | duplicated | data | superseded
  "20260415_session_feedback.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context:
      "CREATE TABLE session_feedback. No existe en supabase/migrations (prod = SQL manual). Imprescindible Supabase vacío.",
    affects: "Formulario feedback, admin hub, triggers push.",
    supaRef: null,
  },
  "20260416_session_feedback_context.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "ALTER session_feedback (portal_session_key, etc.). Falta en cadena CLI.",
    affects: "Matching roster ↔ feedback.",
    supaRef: null,
  },
  "20260417_session_feedback_insert_rls_fix.sql": {
    rec: "copy",
    bootstrapKind: "superseded",
    verdict: "Keep — cadena (opcional)",
    context:
      "Policy INSERT v1. Sustituida por 60420 (añade ceo/admin). Copiar solo si quieres historial completo; en env nuevo basta 60420.",
    affects: "RLS INSERT feedback.",
    supaRef: "→ 20260420_session_feedback_insert_rls_ceo_admin.sql",
  },
  "20260418_session_feedback_nullable_second_phase.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "Nullable campos fase 2. Falta en CLI.",
    affects: "Formulario campos opcionales.",
    supaRef: null,
  },
  "20260420_cancellation_reports.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE cancellation_reports. Falta en CLI.",
    affects: "Tab Cancellations admin.",
    supaRef: null,
  },
  "20260420_incident_reports.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE incident_reports. Falta en CLI.",
    affects: "Tab Incidents.",
    supaRef: null,
  },
  "20260420_portal_auth_generation_and_review_select.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "RPC portal_bump_auth_session_generation + policies review. No está en supabase/migrations.",
    affects: "Logout sesión stale, auth generation.",
    supaRef: null,
  },
  "20260420_session_feedback_insert_rls_ceo_admin.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "Policy session_feedback_insert_staff_lead (staff/lead/ceo/admin). No está en supabase/migrations.",
    affects: "Victor/admin pueden enviar feedback.",
    supaRef: null,
  },
  "20260421_portal_feedback_shared_session_keys_rpc.sql": {
    rec: "copy",
    bootstrapKind: "duplicated",
    verdict: "Keep — ya duplicada",
    context:
      "RPC portal_feedback_submitted_keys_for_sessions YA en supabase (evolucionada). No hace falta copiar el espejo.",
    affects: "Historial feedback export.",
    supaRef: "20260608120000_portal_feedback_shared_history_lookback.sql, 20260616120000_portal_feedback_shared_keys_flexible_match.sql",
  },
  "20260422_venue_reviews.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE venue_reviews (distinto de venue_review_admin_notifications en jun). Falta en CLI.",
    affects: "Venue tab admin.",
    supaRef: null,
  },
  "20260423_create_documents_table_storage_and_policies.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE documents + bucket storage. Falta en CLI.",
    affects: "my_documents, HR docs.",
    supaRef: null,
  },
  "20260423_enable_rls_clients_sessions_announcements_select_authenticated.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "RLS SELECT authenticated en clients/sessions/announcements. Falta en CLI.",
    affects: "Programme data lectura staff.",
    supaRef: null,
  },
  "20260423_expense_claims_backend.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE expense_claims + trigger apply_server_fields. Falta en CLI.",
    affects: "Gastos staff.",
    supaRef: null,
  },
  "20260423_lead_session_reports.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE lead_session_reports. Supabase solo tiene RLS posterior (asume tabla ya existe).",
    affects: "Lead report tab.",
    supaRef: null,
  },
  "20260423_timesheets_backend.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE staff_pay_rates + staff_timesheets. Función apply_server_fields evoluciona después en supabase.",
    affects: "Timesheet/payroll core.",
    supaRef: null,
  },
  "20260424_documents_user_soft_hide.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "RPC hide_my_document. Falta en CLI.",
    affects: "my_documents soft-hide.",
    supaRef: null,
  },
  "20260425_staff_performance_reviews.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE staff_performance_reviews. Falta en CLI.",
    affects: "HR performance reviews.",
    supaRef: null,
  },
  "20260426_session_feedback_lead_select_all.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "Policy session_feedback_select_lead_all. No está en supabase/migrations.",
    affects: "Lead performance.html feedback context.",
    supaRef: null,
  },
  "20260427_leader_term_reviews_and_staff_observation_reports.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "CREATE leader_term_reviews + staff_observation_reports. Falta en CLI.",
    affects: "Lead tools.",
    supaRef: null,
  },
  "20260424_onboarding_candidates.sql": { rec: "delete", verdict: "Borrar espejo database/", context: "Duplicado: supabase tiene 20260424000000_onboarding_candidates.sql.", affects: "Ninguno (CLI usa supabase)." },
  "20260428_venue_review_admin_notifications.sql": { rec: "delete", verdict: "Borrar espejo database/", context: "Reemplazada por 20260614160000_venue_review_admin_notifications.sql en supabase.", affects: "Ninguno." },
  "20260429_schedule_overrides_foundation.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap (CRÍTICO)",
    context: "CREATE schedule_overrides + schedule_override_events. Referenciada en 100+ migraciones supabase pero sin CREATE en CLI.",
    affects: "Scheduling & Cover, overrides, push.",
    supaRef: null,
  },
  "20260507180000_portal_ceo_liaison_group.sql": { rec: "delete", verdict: "Borrar espejo database/", context: "Absorbida por portal_ceo_group / pool channels en supabase (jun 2026).", affects: "Ninguno." },
  "20260513140000_portal_ceo_group_chat.sql": { rec: "delete", verdict: "Borrar espejo database/", context: "Chat CEO evolucionado en supabase DM migrations.", affects: "Ninguno." },
  "20260521120000_employment_contracts_portal.sql": { rec: "delete", verdict: "Borrar espejo database/", context: "Supabase: 20260622200000_portal_employment_contract_documents_admin.sql.", affects: "Ninguno." },
  "20260521130000_employment_contracts_admin_rls.sql": { rec: "delete", verdict: "Borrar espejo database/", context: "RLS contratos — versión en supabase posterior.", affects: "Ninguno." },
  "20260528120000_remove_test_client_cancellations.sql": { rec: "delete", verdict: "Borrar espejo one-shot", context: "Limpieza datos test cancelaciones.", affects: "Ninguno en prod." },
  "20260607160000_payroll_roberto_split.sql": {
    rec: "copy",
    bootstrapKind: "data",
    verdict: "Keep — solo datos prod",
    context: "INSERT staff_timesheet_imports Roberto (contract + extras). One-shot nómina — no es esquema.",
    affects: "Reporte payroll Roberto en prod.",
    supaRef: "staff_timesheet_imports ya en 20260607130000_payroll_timesheet_imports.sql",
  },
  "20260607170000_payroll_director_roles.sql": {
    rec: "copy",
    bootstrapKind: "data",
    verdict: "Keep — solo datos prod",
    context: "UPDATE role='Director' Victor/Raul. One-shot — no es esquema.",
    affects: "Etiqueta director en payroll prod.",
    supaRef: null,
  },
  "20260607180000_payroll_import_2025.sql": { rec: "delete", verdict: "Borrar espejo one-shot", context: "Import histórico 2025 — dato puntual.", affects: "Ninguno re-aplicar." },
  "20260607190000_payroll_sevitha_2026.sql": { rec: "delete", verdict: "Borrar espejo one-shot", context: "Seed payroll Sevitha 2026.", affects: "Ninguno re-aplicar." },
  "20260607200000_payroll_contract_attributes.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar esquema",
    context: "ALTER ADD contract_type (falta en CLI). Los UPDATE de filas son seed prod — opcional en env nuevo.",
    affects: "Payroll contract section labels.",
    supaRef: null,
  },
  "20260607210000_portal_routes_cleanup_legacy.sql": { rec: "delete", verdict: "Borrar espejo one-shot", context: "UPDATE rutas legacy — overlap con dashboard_route_vercel_paths.", affects: "Ninguno." },
  "20260607220000_hr_records.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap (CRÍTICO)",
    context: "CREATE hr_records + hr_name_key(). Usada en supabase (unavailability) pero sin CREATE en CLI.",
    affects: "Unavailability, HR roster keys.",
    supaRef: "20260530110000_portal_staff_unavailability.sql (referencia)",
  },
  "20260607230000_hr_records_active.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap",
    context: "ALTER hr_records ADD active. Falta en CLI.",
    affects: "HR filtros active.",
    supaRef: null,
  },
  "20260607240000_client_payments.sql": {
    rec: "copy",
    bootstrapKind: "copy",
    verdict: "Keep — copiar bootstrap (CRÍTICO)",
    context: "CREATE client_payments. Supabase solo tiene seeds LA después.",
    affects: "Orders, Participants, payments admin.",
    supaRef: null,
  },
  "20260615200000_portal_announcements_retire_test_rows.sql": { rec: "delete", verdict: "Borrar espejo one-shot", context: "Retira filas test anuncios.", affects: "Ninguno." },
  "20260615210000_portal_announcements_clear_all.sql": { rec: "delete", verdict: "Borrar espejo (peligroso)", context: "DELETE all announcements — no reaplicar.", affects: "Ninguno." },
  "backup_before_rls_clients_sessions_announcements.sql": { rec: "delete", verdict: "Borrar backup", context: "Snapshot manual pre-RLS — no migración.", affects: "Ninguno." },
};

const defaultDecisions = {};
for (const it of items) {
  const ex = EXPERT_52[it.id];
  if (ex && (ex.rec === "keep" || ex.rec === "defer")) {
    defaultDecisions[it.id] = ex.rec;
  } else if (it.auto.rec === "essential" || it.auto.rec === "chain") {
    defaultDecisions[it.id] = "keep";
  } else if (it.auto.rec === "archive") {
    defaultDecisions[it.id] = "defer";
  }
}

const onlyDb = dbFiles.filter((f) => !supaSet.has(f));
const onlySupa = files.filter((f) => !dbSet.has(f));
const reviewItems = items.filter((i) => i.auto.rec === "review");

function expertFor(file) {
  return (
    EXPERT_52[file] || {
      rec: "review",
      verdict: "Revisar",
      context: "Sin entrada experta.",
      affects: "—",
    }
  );
}

const step2Count = onlyDb.filter((f) => expertFor(f).rec === "copy").length;

const stats = {
  total: items.length,
  essential: items.filter((i) => i.auto.rec === "essential").length,
  chain: items.filter((i) => i.auto.rec === "chain").length,
  archive: items.filter((i) => i.auto.rec === "archive").length,
  review: reviewItems.length,
  dbMirror: items.filter((i) => i.hasDbCopy).length,
  onlySupa: onlySupa.length,
  onlyDb: onlyDb.length,
  manualTotal: reviewItems.length + onlyDb.length,
  step2Count,
};

const manualReview = {
  inCliMixed: reviewItems.map((i) => {
    const ex = expertFor(i.file);
    return {
      id: i.file,
      file: i.file,
      kind: i.kind,
      cluster: i.clusterTitle,
      verdict: ex.verdict,
      rec: ex.rec,
      context: ex.context,
      affects: ex.affects,
      comment: i.comment,
    };
  }),
  onlyDatabaseFolder: onlyDb.map((f) => {
    const ex = expertFor(f);
    return {
      id: `database:${f}`,
      file: f,
      verdict: ex.verdict,
      rec: ex.rec,
      bootstrapKind: ex.bootstrapKind || null,
      context: ex.context,
      affects: ex.affects,
      supaRef: ex.supaRef || null,
    };
  }),
  step2Copy: onlyDb
    .filter((f) => expertFor(f).rec === "copy")
    .map((f) => {
      const ex = expertFor(f);
      return {
        id: `database:${f}`,
        file: f,
        path: `database/migrations/${f}`,
        verdict: ex.verdict,
        rec: ex.rec,
        bootstrapKind: ex.bootstrapKind || "copy",
        context: ex.context,
        affects: ex.affects,
        supaRef: ex.supaRef || null,
      };
    }),
};

const step2Breakdown = { copy: 0, duplicated: 0, data: 0, superseded: 0 };
for (const r of manualReview.step2Copy) {
  const k = r.bootstrapKind || "copy";
  if (step2Breakdown[k] !== undefined) step2Breakdown[k]++;
  else step2Breakdown.copy++;
}

for (const f of onlyDb) {
  const ex = expertFor(f);
  if (ex.rec === "copy") {
    defaultDecisions[`database:${f}`] = "keep";
  }
}

const expertSummary = {
  cliKeep: reviewItems.filter((i) => expertFor(i.file).rec === "keep").length,
  cliDefer: reviewItems.filter((i) => expertFor(i.file).rec === "defer").length,
  dbCopy: onlyDb.filter((f) => expertFor(f).rec === "copy").length,
  dbDelete: onlyDb.filter((f) => expertFor(f).rec === "delete").length,
};

const data = {
  generatedAt: new Date().toISOString(),
  stats,
  expertSummary,
  step2Breakdown,
  defaultDecisions,
  manualReview,
  expert52: EXPERT_52,
  clusters: clusterList,
};

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Revisión migraciones Portal</title>
<style>
:root{--bg:#eef1f6;--card:#fff;--ink:#152030;--muted:#5a6a7a;--line:#d8dfe8;--essential:#0a6e4a;--essential-bg:#e6f5ee;--chain:#2563eb;--chain-bg:#eef4ff;--archive:#b45309;--archive-bg:#fff7ed;--review:#64748b;--review-bg:#f1f5f9;--warn:#dc2626;--warn-bg:#fef2f2}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
.wrap{max-width:1100px;margin:0 auto;padding:16px 16px 100px}
header,.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:16px}
header h1,.panel h2{margin:0 0 8px;font-size:1.25rem}
.lead{color:var(--muted);font-size:14px;margin:0}
.callout{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;font-size:13px;margin:12px 0}
.callout-warn{background:var(--warn-bg);border-color:#fca5a5}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.stat{background:var(--bg);border-radius:8px;padding:8px 12px;font-size:12px;min-width:88px}
.stat b{display:block;font-size:1.1rem}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.toolbar input,.toolbar select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px}
.toolbar input{flex:1 1 180px}
.btn{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer}
.btn--primary{background:var(--essential);color:#fff;border-color:var(--essential)}
.manual-list{font-size:13px;margin:0;padding:0;list-style:none}
.manual-list li{border-bottom:1px solid var(--line);padding:10px 0;overflow-wrap:anywhere}
.manual-list li:last-child{border-bottom:none}
.manual-list code{font-size:11px}
.manual-list .mig-actions{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.manual-list li.is-defer{opacity:.72}
.cluster{margin-bottom:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.cluster-head{padding:14px 16px;background:#f8fafc;border-bottom:1px solid var(--line);cursor:pointer}
.cluster-head h3{margin:0 0 4px;font-size:1rem}
.cluster-meta{font-size:12px;color:var(--muted)}
.cluster-desc{font-size:13px;margin:6px 0 0}
.cluster-body{display:none}.cluster.is-open .cluster-body{display:block}
.mig{border-bottom:1px solid var(--line);padding:12px 16px}
.mig:last-child{border-bottom:none}
.mig--essential{background:var(--essential-bg)}.mig--chain{background:var(--chain-bg)}.mig--archive{background:var(--archive-bg)}.mig--review{background:var(--review-bg)}
.mig-file{font-family:monospace;font-size:11px;word-break:break-all}
.badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:4px;background:#e2e8f0}
.badge--essential{background:#bbf7d0}.badge--chain{background:#bfdbfe}.badge--archive{background:#fed7aa}.badge--review{background:#cbd5e1}
.badge--dup{background:#bbf7d0;color:#0a6e4a}.badge--data{background:#fed7aa;color:#b45309}.badge--boot{background:#bfdbfe;color:#1d4ed8}.badge--super{background:#e2e8f0;color:#475569}
.mig p{margin:6px 0;font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.mig-comment{font-family:monospace;font-size:11px;background:#f1f5f9;padding:6px;border-radius:4px;white-space:pre-wrap}
.mig-actions{margin-top:8px;display:flex;gap:6px}
.act{border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer}
.act--keep{background:var(--essential);color:#fff}.act--defer{background:var(--archive-bg);color:var(--archive);border:1px solid #fdba74}
.act.is-on{outline:2px solid var(--ink)}
.sticky{position:fixed;bottom:0;left:0;right:0;background:rgba(21,32,48,.94);color:#fff;padding:10px 16px;font-size:13px;z-index:20}
.hidden{display:none!important}
.panel--step2{border-color:#2563eb;background:linear-gradient(180deg,#eef4ff 0%,#fff 48px)}
.view-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.view-tabs .btn.is-active{outline:3px solid var(--ink);outline-offset:1px}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>Migraciones — recomendación automática aplicada</h1>
<p class="lead"><strong>${stats.total}</strong> en CLI (<code>supabase/migrations/</code>) · 
<strong>${stats.essential + stats.chain}</strong> Keep auto · 
<strong>${stats.archive}</strong> Guardar sin usar auto · 
<strong>${stats.manualTotal}</strong> para decidir tú (${stats.review} en CLI + ${stats.onlyDb} solo en database/)</p>
<div class="callout"><strong>Recomendación experta:</strong> CLI ${expertSummary.cliKeep} Keep + ${expertSummary.cliDefer} defer · ${step2Count ? `<strong>${step2Count} pendientes paso 2</strong> (copiar bootstrap a supabase/).` : `<strong>Paso 2 completado</strong> → <code>20260414120000_portal_april_bootstrap_consolidated.sql</code> + repair prod.`}</div>
<div class="view-tabs">
<button type="button" class="btn btn--primary is-active" id="viewAll">Ver todo (${stats.manualTotal} manual)</button>
${step2Count ? `<button type="button" class="btn" id="viewStep2">Paso 2 pendientes (${step2Count})</button>` : `<button type="button" class="btn" id="viewStep2" disabled>Paso 2 ✓ completado</button>`}
<button type="button" class="btn" id="viewCli13">Solo CLI revisar (${stats.review})</button>
</div>
<div class="stats" id="stats"></div>
<div class="toolbar hidden" id="mainToolbar">
<input type="search" id="q" placeholder="Buscar…"/>
<select id="fRec"><option value="">Todas</option><option value="essential">Esencial</option><option value="chain">Cadena</option><option value="archive">One-shot</option><option value="review">Revisar (${stats.review})</option></select>
<select id="fUser"><option value="">Tu decisión</option><option value="keep">Keep</option><option value="defer">Sin usar</option><option value="unset">Sin marcar</option></select>
<button class="btn btn--primary" id="resetAuto">Reset → recomendación automática</button>
<button class="btn" id="export">Export JSON</button>
</div>
</header>

<section class="panel panel--step2" id="step2Panel">
<h2>Paso 2 — bootstrap en <code>supabase/migrations/</code></h2>
${step2Count ? `<p class="lead">Las <strong>${step2Count}</strong> vienen pre-marcadas <strong>Keep</strong>. Veredicto experto: <strong>${step2Breakdown.copy} copiar</strong> · <strong>${step2Breakdown.duplicated} duplicada</strong> · <strong>${step2Breakdown.data} datos</strong> · <strong>${step2Breakdown.superseded} cadena</strong>.</p>
<p class="lead" style="margin-top:8px;font-size:12px">Portal prod ya tiene el esquema. No <code>db push</code> ciego en prod linked.</p>
<ul class="manual-list" id="step2List"></ul>` : `<p class="lead"><strong>Completado.</strong> Consolidado en <code>20260414120000_portal_april_bootstrap_consolidated.sql</code> + <code>20260607130100_portal_payroll_contract_type_column.sql</code>. Espejos movidos a <code>database/archive/april-bootstrap-sources/</code>. Prod repair aplicado.</p>
<ul class="manual-list" id="step2List"><li class="sub">Nada pendiente en paso 2.</li></ul>`}
</section>

<section class="panel callout-warn" id="manualPanel">
<h2>Decidir tú (${stats.manualTotal} archivos)</h2>
<p class="lead" style="margin-bottom:12px">Lista completa manual. Usa el botón <strong>Paso 2 pendientes</strong> arriba para ver solo los ${step2Count} de bootstrap.</p>
<h3 style="font-size:14px;margin:16px 0 8px" id="sectionCli">A) En CLI — revisar (${stats.review})</h3>
<ul class="manual-list" id="reviewList"></ul>
${stats.onlyDb ? `<h3 style="font-size:14px;margin:16px 0 8px" id="sectionDb">B) Solo en database/ — NO en CLI (${stats.onlyDb})</h3>
<p class="lead" style="font-size:12px;margin-bottom:8px" id="sectionDbHint">Los marcados «Copiar a supabase/» son el paso 2.</p>
<ul class="manual-list" id="onlyDbList"></ul>` : `<p class="lead" style="font-size:13px;margin-top:12px" id="sectionDbHint">B) Espejos database/ — <strong>ninguno pendiente</strong> (archivados o consolidados en supabase/).</p>`}
</section>

<div id="root"></div>
</div>
<div class="sticky" id="foot"></div>
<script>
var DATA=${JSON.stringify(data)};
var KEY='portalMigrationReview_v4';
var viewMode='all';
var decisions=Object.assign({}, DATA.defaultDecisions);
try{
  var saved=localStorage.getItem(KEY);
  if(saved) decisions=JSON.parse(saved);
}catch(e){}
Object.keys(DATA.defaultDecisions).forEach(function(k){
  if(!(k in decisions)) decisions[k]=DATA.defaultDecisions[k];
});
if(location.hash==='#paso2') viewMode='step2';
else if(location.hash==='#cli13') viewMode='cli13';

function setViewMode(mode){
  viewMode=mode;
  location.hash=mode==='step2'?'paso2':mode==='cli13'?'cli13':'';
  document.getElementById('viewAll').classList.toggle('is-active',mode==='all');
  document.getElementById('viewStep2').classList.toggle('is-active',mode==='step2');
  document.getElementById('viewCli13').classList.toggle('is-active',mode==='cli13');
  document.getElementById('step2Panel').classList.toggle('hidden',mode==='cli13');
  document.getElementById('manualPanel').classList.toggle('hidden',mode==='step2');
  document.getElementById('root').classList.toggle('hidden',mode!=='all');
  document.getElementById('mainToolbar').classList.toggle('hidden',mode!=='all');
  if(mode==='step2'){
    document.getElementById('sectionCli').classList.add('hidden');
    document.getElementById('reviewList').classList.add('hidden');
  }else{
    document.getElementById('sectionCli').classList.remove('hidden');
    document.getElementById('reviewList').classList.remove('hidden');
  }
  if(mode==='cli13'){
    var sDb=document.getElementById('sectionDb');
    var sDbH=document.getElementById('sectionDbHint');
    var oDb=document.getElementById('onlyDbList');
    if(sDb) sDb.classList.add('hidden');
    if(sDbH) sDbH.classList.add('hidden');
    if(oDb) oDb.classList.add('hidden');
  }else if(mode!=='step2'){
    var sDb=document.getElementById('sectionDb');
    var sDbH=document.getElementById('sectionDbHint');
    var oDb=document.getElementById('onlyDbList');
    if(sDb) sDb.classList.remove('hidden');
    if(sDbH) sDbH.classList.remove('hidden');
    if(oDb) oDb.classList.remove('hidden');
  }
  render();
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function save(){localStorage.setItem(KEY,JSON.stringify(decisions))}

function counts(){
  var k=0,d=0,u=0;
  DATA.clusters.forEach(function(c){c.items.forEach(function(it){
    var x=decisions[it.id]; if(x==='keep')k++; else if(x==='defer')d++; else u++;
  })});
  return {keep:k,defer:d,unset:u};
}

function bootstrapBadge(kind){
  if(kind==='duplicated') return '<span class="badge badge--dup">Ya en supabase</span>';
  if(kind==='data') return '<span class="badge badge--data">Solo datos prod</span>';
  if(kind==='superseded') return '<span class="badge badge--super">Cadena — opcional</span>';
  return '<span class="badge badge--boot">Copiar — falta CLI</span>';
}

function renderManual(){
  function row(r,labels){
    labels=labels||{};
    var keepLabel=labels.keep||'Keep';
    var deferLabel=labels.defer||'Guardar sin usar';
    var dec=decisions[r.id]||'';
    var cls=r.rec==='keep'?'essential':r.rec==='defer'?'archive':r.rec==='copy'?'chain':r.rec==='delete'?'archive':'review';
    var boot=r.bootstrapKind?bootstrapBadge(r.bootstrapKind):'';
    return '<li class="'+(dec==='defer'?'is-defer':'')+'"><code>'+esc(r.file)+'</code> '+boot+' <span class="badge badge--'+cls+'">'+esc(r.verdict)+'</span>'+
      (r.path?'<div class="sub"><strong>Ruta:</strong> '+esc(r.path)+'</div>':'')+
      (r.supaRef?'<div class="sub"><strong>En supabase:</strong> '+esc(r.supaRef)+'</div>':'')+
      '<div class="sub"><strong>Contexto:</strong> '+esc(r.context)+'</div>'+
      '<div class="sub"><strong>Afecta:</strong> '+esc(r.affects)+'</div>'+
      '<div class="mig-actions">'+
      '<button type="button" class="act act--keep'+(dec==='keep'?' is-on':'')+'" data-a="keep" data-i="'+esc(r.id)+'">'+esc(keepLabel)+'</button>'+
      '<button type="button" class="act act--defer'+(dec==='defer'?' is-on':'')+'" data-a="defer" data-i="'+esc(r.id)+'">'+esc(deferLabel)+'</button>'+
      '</div></li>';
  }
  var step2Labels={keep:'Keep',defer:'Omitir paso 2'};
  document.getElementById('step2List').innerHTML=DATA.manualReview.step2Copy.length?DATA.manualReview.step2Copy.map(function(r){return row(r,step2Labels);}).join(''):'<li class="sub">Nada pendiente.</li>';
  document.getElementById('reviewList').innerHTML=DATA.manualReview.inCliMixed.map(row).join('');
  var dbList=viewMode==='step2'?DATA.manualReview.step2Copy:DATA.manualReview.onlyDatabaseFolder;
  var onlyDbEl=document.getElementById('onlyDbList');
  if(onlyDbEl) onlyDbEl.innerHTML=dbList.map(function(r){return row(r,step2Labels);}).join('');
}

function manualCounts(list){
  var k=0,d=0,u=0;
  list.forEach(function(r){
    var x=decisions[r.id];
    if(x==='keep')k++; else if(x==='defer')d++; else u++;
  });
  return {keep:k,defer:d,unset:u};
}

function renderStats(){
  var c=counts(),s=DATA.stats;
  var mc=viewMode==='step2'?manualCounts(DATA.manualReview.step2Copy):
    viewMode==='cli13'?manualCounts(DATA.manualReview.inCliMixed):null;
  var mcTotal=viewMode==='step2'?DATA.manualReview.step2Copy.length:DATA.manualReview.inCliMixed.length;
  document.getElementById('stats').innerHTML=
    '<div class="stat"><b>'+(s.essential+s.chain)+'</b>Keep auto</div>'+
    '<div class="stat"><b>'+s.archive+'</b>Defer auto</div>'+
    '<div class="stat"><b style="color:#dc2626">'+s.manualTotal+'</b>Decidir tú</div>'+
    '<div class="stat"><b style="color:var(--essential)">'+c.keep+'</b>Tu Keep</div>'+
    '<div class="stat"><b>'+c.defer+'</b>Tu defer</div>'+
    (mc?'<div class="stat"><b style="color:#2563eb">'+mc.keep+'/'+mcTotal+'</b>Esta vista Keep</div>':'');
  var foot='Keep: '+c.keep+' · Defer: '+c.defer+' · Sin marcar: '+c.unset;
  if(mc) foot+=' · Vista: '+mc.keep+' Keep, '+mc.defer+' Omitir, '+mc.unset+' sin marcar';
  document.getElementById('foot').textContent=foot;
}

function match(it){
  var q=(document.getElementById('q').value||'').trim().toLowerCase();
  var fr=document.getElementById('fRec').value;
  var fu=document.getElementById('fUser').value;
  if(fr&&it.auto.rec!==fr)return false;
  if(fu){ var d=decisions[it.id]?'keep':'unset'; if(decisions[it.id]==='defer')d='defer'; if(fu==='unset'&&!decisions[it.id])return true; if(fu!==d)return false; if(fu==='unset')return false; }
  if(!q)return true;
  return (it.file+' '+it.comment+' '+it.auto.why).toLowerCase().indexOf(q)>=0;
}

function render(){
  renderStats(); renderManual();
  if(viewMode!=='all'){
    document.getElementById('root').innerHTML='';
    return;
  }
  var html='';
  DATA.clusters.forEach(function(cl){
    var vis=cl.items.filter(match);
    if(!vis.length)return;
    html+='<section class="cluster is-open"><div class="cluster-head" data-t="1">';
    html+='<h3>'+esc(cl.title)+' <span class="cluster-meta">('+vis.length+')</span></h3>';
    html+='<p class="cluster-desc">'+esc(cl.desc)+'</p></div><div class="cluster-body">';
    vis.forEach(function(it){
      var dec=decisions[it.id]||'';
      html+='<article class="mig mig--'+it.auto.rec+'"><div class="mig-file">'+esc(it.file)+'</div>';
      html+='<span class="badge badge--'+it.auto.rec+'">'+esc(it.auto.label)+'</span>';
      if(it.hasDbCopy)html+='<span class="badge">espejo database/</span>';
      if(it.comment)html+='<div class="mig-comment">'+esc(it.comment)+'</div>';
      html+='<p>'+esc(it.auto.why)+'</p>';
      html+='<div class="mig-actions">';
      html+='<button type="button" class="act act--keep'+(dec==='keep'?' is-on':'')+'" data-a="keep" data-i="'+esc(it.id)+'">Keep</button>';
      html+='<button type="button" class="act act--defer'+(dec==='defer'?' is-on':'')+'" data-a="defer" data-i="'+esc(it.id)+'">Guardar sin usar</button>';
      html+='</div></article>';
    });
    html+='</div></section>';
  });
  document.getElementById('root').innerHTML=html||'<p>Nada con este filtro.</p>';
}

document.getElementById('root').addEventListener('click',handleReviewClick);
document.getElementById('step2Panel').addEventListener('click',handleReviewClick);
document.getElementById('manualPanel').addEventListener('click',handleReviewClick);
function handleReviewClick(ev){
  var t=ev.target;
  if(t.dataset.t){t.closest('.cluster').classList.toggle('is-open');return}
  if(t.dataset.a){ var id=t.dataset.i,a=t.dataset.a; decisions[id]=decisions[id]===a?undefined:a; if(!decisions[id])delete decisions[id]; save(); render(); }
}
document.getElementById('q').oninput=render;
document.getElementById('fRec').onchange=render;
document.getElementById('fUser').onchange=render;
document.getElementById('resetAuto').onclick=function(){
  if(!confirm('Restaurar recomendación experta ('+DATA.stats.manualTotal+' manual + auto)?'))return;
  decisions=Object.assign({}, DATA.defaultDecisions);
  save(); render();
};
document.getElementById('export').onclick=function(){
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({decisions:decisions,manualReview:DATA.manualReview,step2Copy:DATA.manualReview.step2Copy,stats:DATA.stats},null,2)],{type:'application/json'}));
  a.download='portal-migration-decisions-v4.json'; a.click();
};
document.getElementById('viewAll').onclick=function(){ setViewMode('all'); };
document.getElementById('viewStep2').onclick=function(){ if(DATA.stats.step2Count) setViewMode('step2'); };
document.getElementById('viewCli13').onclick=function(){ setViewMode('cli13'); };
setViewMode(viewMode);
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log("Wrote", OUT, `${(html.length / 1024).toFixed(0)}KB`);
console.log("Manual review:", stats.manualTotal, "=", stats.review, "CLI +", stats.onlyDb, "database-only");
