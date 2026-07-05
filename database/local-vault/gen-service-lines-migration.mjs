#!/usr/bin/env node
/**
 * Generate the portal_participant_service_lines migration (table + RLS + seed)
 * from the exact roster-review dataset embedded in working_ui/client_services_review.html.
 * One-shot generator: run once, then the generated .sql is committed.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const htmlPath = path.join(root, "working_ui/client_services_review.html");
const html = fs.readFileSync(htmlPath, "utf8");

const m = html.match(
  /<script id="seed" type="application\/json">([\s\S]*?)<\/script>/,
);
if (!m) {
  console.error("seed script not found");
  process.exit(1);
}
const seed = JSON.parse(m[1]);
const clients = Array.isArray(seed.clients) ? seed.clients : [];
const rangeFrom = (seed.range && seed.range.from) || null;
const rangeTo = (seed.range && seed.range.to) || null;

/** slotMinutes mirror of the review tool (for durationMin recompute). */
function slotMinutes(slot) {
  const parts = String(slot || "").split(/to|-|—/i);
  if (parts.length !== 2) return null;
  const p = (x) => {
    const mm = String(x || "").trim().match(/^(\d{1,2})(?:[.:](\d{1,2}))?$/);
    if (!mm) return null;
    return parseInt(mm[1], 10) * 60 + (mm[2] ? parseInt(mm[2], 10) : 0);
  };
  let a = p(parts[0]);
  let b = p(parts[1]);
  if (a == null || b == null) return null;
  if (b <= a) b += 720;
  return b - a;
}

// Normalize the seed into the shape we persist. Keep it faithful to the tool:
// one entry per roster line; services_count = sessions.length.
const rows = clients
  .map((c) => {
    const name = String(c.name || "").trim();
    if (!name) return null;
    const sessions = (Array.isArray(c.sessions) ? c.sessions : []).map((s) => ({
      service: String(s.service || "").trim(),
      day: String(s.day || "").trim(),
      timeSlot: String(s.timeSlot || "").trim(),
      durationMin: s.durationMin != null ? s.durationMin : slotMinutes(s.timeSlot),
      instructor: String(s.instructor || "").trim(),
      venue: String(s.venue || "").trim(),
      area: String(s.area || "").trim(),
      weeks: s.weeks != null ? s.weeks : null,
    }));
    return { name, validated: !!c.validated, sessions };
  })
  .filter(Boolean);

const jsonLiteral = JSON.stringify(rows);

const ts = "20260705231500";
const fileName = `${ts}_portal_participant_service_lines.sql`;

const sql = `-- Parent-portal service counts sourced from the roster-review dataset.
--
-- WHY: the full term roster lives in the client-side bundle (STAFF_DASHBOARD_SOURCE),
-- which the parent-portal Edge Function cannot read. It previously derived a child's
-- "services" from session_feedback (what they attended) which UNDERCOUNTS (e.g. a child
-- with Multi-Activity + Swimming showed only what had feedback). This table is the
-- server-readable snapshot of what the admin roster review shows, keyed by the same
-- canonical participant slug used by participant_identity.ts so the Edge Function can
-- return the correct services count + list to each parent (their own child only).
--
-- Source: working_ui/client_services_review.html seed (range ${rangeFrom} → ${rangeTo}).
-- Re-seed by re-running database/local-vault/gen-service-lines-migration.mjs
-- after editing the roster review, then re-applying this migration.
--
-- ROLLBACK (manual):
--   drop table if exists public.portal_participant_service_lines cascade;

begin;

create table if not exists public.portal_participant_service_lines (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,
  client_name text not null,
  client_name_norm text not null default '',
  sessions jsonb not null default '[]'::jsonb,
  services_count integer not null default 0,
  source text not null default 'roster_review',
  term_label text null,
  range_from date null,
  range_to date null,
  validated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) default auth.uid()
);

comment on table public.portal_participant_service_lines is
  'Server-readable snapshot of each participant''s booked roster services (from the admin roster review). Feeds the parent portal services count/list. client_key = canonical participant slug (see participant_identity.ts).';

create or replace function public.portal_service_lines_set_updated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists portal_service_lines_set_updated_trg on public.portal_participant_service_lines;
create trigger portal_service_lines_set_updated_trg
before update on public.portal_participant_service_lines
for each row
execute function public.portal_service_lines_set_updated();

-- New-table Data API access is revoked by default (auto_expose_new_tables flip). Grant explicitly.
revoke all on public.portal_participant_service_lines from public, anon;
grant select, insert, update, delete on public.portal_participant_service_lines to service_role;
grant select on public.portal_participant_service_lines to authenticated;

alter table public.portal_participant_service_lines enable row level security;

-- Admin / CEO can read + maintain from the portal; service_role (Edge Functions) bypasses RLS.
drop policy if exists "portal_service_lines_admin_ceo_all" on public.portal_participant_service_lines;
create policy "portal_service_lines_admin_ceo_all"
on public.portal_participant_service_lines
for all
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo())
with check (public.portal_staff_profile_is_admin_or_ceo());

-- Seed / refresh from the roster-review dataset.
with seed as (
  select jsonb_array_elements($seed$${jsonLiteral}$seed$::jsonb) as c
)
insert into public.portal_participant_service_lines
  (client_key, client_name, client_name_norm, sessions, services_count,
   source, term_label, range_from, range_to, validated)
select
  trim(both '_' from regexp_replace(lower(c->>'name'), '[^a-z0-9]+', '_', 'g')) as client_key,
  c->>'name' as client_name,
  trim(regexp_replace(regexp_replace(lower(c->>'name'), '[^a-z0-9 ]+', ' ', 'g'), '\\s+', ' ', 'g')) as client_name_norm,
  coalesce(c->'sessions', '[]'::jsonb) as sessions,
  coalesce(jsonb_array_length(c->'sessions'), 0) as services_count,
  'roster_review' as source,
  'Summer Term 2026' as term_label,
  ${rangeFrom ? `date '${rangeFrom}'` : "null"} as range_from,
  ${rangeTo ? `date '${rangeTo}'` : "null"} as range_to,
  coalesce((c->>'validated')::boolean, false) as validated
from seed
where coalesce(trim(both '_' from regexp_replace(lower(c->>'name'), '[^a-z0-9]+', '_', 'g')), '') <> ''
on conflict (client_key) do update set
  client_name = excluded.client_name,
  client_name_norm = excluded.client_name_norm,
  sessions = excluded.sessions,
  services_count = excluded.services_count,
  source = excluded.source,
  term_label = excluded.term_label,
  range_from = excluded.range_from,
  range_to = excluded.range_to,
  updated_at = now();

commit;
`;

const outPaths = [
  path.join(root, "supabase/migrations", fileName),
  path.join(root, "database/migrations", fileName),
];
for (const p of outPaths) {
  fs.writeFileSync(p, sql, "utf8");
  console.log("wrote", path.relative(root, p), `(${rows.length} clients)`);
}
