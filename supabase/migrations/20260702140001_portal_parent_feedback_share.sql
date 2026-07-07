-- Parent-safe session feedback copies (OpenAI-reviewed, cached for parent portal).

begin;

create table if not exists public.portal_parent_feedback_share (
  session_feedback_id   uuid primary key references public.session_feedback (id) on delete cascade,
  contact_id            text not null,
  source_fingerprint    text not null,
  parent_message        text null,
  share_status          text not null default 'pending'
    check (share_status in ('pending', 'approved', 'hidden')),
  review_model          text null,
  reviewed_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists portal_parent_feedback_share_contact_idx
  on public.portal_parent_feedback_share (contact_id, reviewed_at desc);

comment on table public.portal_parent_feedback_share is
  'Cached parent-safe wording for session_feedback rows shown in the family portal.';

alter table public.portal_parent_feedback_share enable row level security;
revoke all on public.portal_parent_feedback_share from public, anon, authenticated;
grant select, insert, update on public.portal_parent_feedback_share to service_role;

commit;
