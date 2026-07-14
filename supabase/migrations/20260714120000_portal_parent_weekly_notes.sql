-- Parent portal weekly notes (AI summary of the week's session feedback).
-- Week = Saturday → Friday (week_start = Saturday).

begin;

create table if not exists public.portal_parent_weekly_notes (
  id                    uuid primary key default gen_random_uuid(),
  contact_id            text not null,
  week_start            date not null,
  week_end              date not null,
  body                  text not null,
  share_status          text not null default 'ready'
    check (share_status in ('draft', 'ready', 'hidden')),
  source_feedback_ids   uuid[] not null default '{}',
  source_fingerprint    text not null,
  review_model          text null,
  generated_early       boolean not null default false,
  generated_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint portal_parent_weekly_notes_week_chk check (week_end = week_start + 6),
  constraint portal_parent_weekly_notes_contact_week_uq unique (contact_id, week_start)
);

create index if not exists portal_parent_weekly_notes_contact_idx
  on public.portal_parent_weekly_notes (contact_id, week_start desc);

comment on table public.portal_parent_weekly_notes is
  'Celebratory Saturday–Friday weekly summary for the family portal, built from filtered or raw session feedback.';

alter table public.portal_parent_weekly_notes enable row level security;
revoke all on public.portal_parent_weekly_notes from public, anon, authenticated;
grant select, insert, update, delete on public.portal_parent_weekly_notes to service_role;

commit;
