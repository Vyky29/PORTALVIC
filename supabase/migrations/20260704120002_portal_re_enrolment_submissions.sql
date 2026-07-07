-- Parent re-enrolment 2026/27 submissions (weekly/weekend + Day Centre confirmation).
-- Parents submit via public link or family portal; admin/CEO read in Supabase.

begin;

create table if not exists public.portal_re_enrolment_submissions (
  id                          uuid primary key default gen_random_uuid(),
  academic_year               text not null default '2026-27',
  source                      text not null check (source in ('link', 'parent_portal')),
  parent_first_name           text,
  parent_last_name            text,
  participant_name            text not null,
  participant_contact_id      text,
  parent_person_id            text,
  client_payments_client_key  text,
  payment_status_at_submit    text,
  outstanding_amount          numeric(12, 2),
  payload                     jsonb not null default '{}'::jsonb,
  ip_hash                     text,
  user_agent_hash             text,
  submitted_at                timestamptz not null default now()
);

create index if not exists portal_re_enrolment_submissions_year_idx
  on public.portal_re_enrolment_submissions (academic_year, submitted_at desc);

create index if not exists portal_re_enrolment_submissions_participant_idx
  on public.portal_re_enrolment_submissions (participant_contact_id);

create index if not exists portal_re_enrolment_submissions_parent_person_idx
  on public.portal_re_enrolment_submissions (parent_person_id);

comment on table public.portal_re_enrolment_submissions is
  'Parent/carer re-enrolment choices for 2026/27. Admin/CEO only (PII).';

alter table public.portal_re_enrolment_submissions enable row level security;

grant select, insert, update, delete on table public.portal_re_enrolment_submissions to authenticated;

drop policy if exists "portal_re_enrolment_submissions_admin_all" on public.portal_re_enrolment_submissions;
create policy "portal_re_enrolment_submissions_admin_all"
on public.portal_re_enrolment_submissions
for all
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
