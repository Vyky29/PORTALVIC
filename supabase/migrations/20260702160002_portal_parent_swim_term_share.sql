-- Parent-visible swimming term reviews (instructor PDF marked ready for families).

begin;

create table if not exists public.portal_parent_swim_term_share (
  document_id           uuid primary key references public.documents (id) on delete cascade,
  contact_id            text not null,
  share_status          text not null default 'hidden'
    check (share_status in ('ready', 'hidden')),
  ready_at              timestamptz null,
  ready_by              text null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists portal_parent_swim_term_share_contact_idx
  on public.portal_parent_swim_term_share (contact_id, ready_at desc nulls last);

comment on table public.portal_parent_swim_term_share is
  'Swimming term review PDFs approved for the family portal (documents.document_type = swim_term_review).';

alter table public.portal_parent_swim_term_share enable row level security;
revoke all on public.portal_parent_swim_term_share from public, anon, authenticated;
grant select, insert, update on public.portal_parent_swim_term_share to service_role;

commit;
