-- Live MADRE in Supabase (mirror of supabase/migrations/20260622150000_portal_madre_document.sql)

begin;

create table if not exists public.portal_madre_document (
  term_key text primary key,
  schema_version int not null default 2,
  revision bigint not null default 0,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.portal_madre_document enable row level security;

commit;
