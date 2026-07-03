-- Audit log for staff session narratives (voice + AI filter + submit).
-- Recovery when session_feedback.session_narrative was missing or submit used wrong template.

create table if not exists public.session_feedback_narrative_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  staff_user_id uuid not null references auth.users (id) on delete restrict,
  staff_display_name text null,
  participant_name text null,
  participant_gender text null,
  session_date date null,
  service text null,
  portal_session_key text null,
  narrative_en text not null,
  filter_positive text null,
  filter_relevant text null,
  filter_status text null,
  voice_language text null,
  session_feedback_id uuid null references public.session_feedback (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  constraint session_feedback_narrative_audit_source_check
    check (source in ('voice_transcribe', 'narrative_filter', 'feedback_submit'))
);

create index if not exists session_feedback_narrative_audit_created_at_idx
  on public.session_feedback_narrative_audit (created_at desc);

create index if not exists session_feedback_narrative_audit_participant_idx
  on public.session_feedback_narrative_audit (participant_name, session_date desc);

create index if not exists session_feedback_narrative_audit_staff_idx
  on public.session_feedback_narrative_audit (staff_user_id, created_at desc);

create index if not exists session_feedback_narrative_audit_feedback_id_idx
  on public.session_feedback_narrative_audit (session_feedback_id)
  where session_feedback_id is not null;

alter table public.session_feedback_narrative_audit enable row level security;

grant select on table public.session_feedback_narrative_audit to authenticated;

drop policy if exists "session_feedback_narrative_audit_select_admin_ceo"
  on public.session_feedback_narrative_audit;
create policy "session_feedback_narrative_audit_select_admin_ceo"
on public.session_feedback_narrative_audit
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

comment on table public.session_feedback_narrative_audit is
  'Append-only audit of staff session narratives from voice transcribe, AI filter, and submit.';
