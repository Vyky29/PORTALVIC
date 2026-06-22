-- Live MADRE in Supabase + auto-fold on portal_roster_rows / schedule_overrides (pg_net).
-- Replace __PORTAL_MADRE_WEBHOOK_SECRET__ with PORTAL_PUSH_WEBHOOK_SECRET from Edge secrets.

begin;

create table if not exists public.portal_madre_document (
  term_key text primary key,
  schema_version int not null default 2,
  revision bigint not null default 0,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

comment on table public.portal_madre_document is
  'Live roster MADRE. Updated automatically when admin saves roster rows or schedule overrides.';

create index if not exists portal_madre_document_updated_at_idx
  on public.portal_madre_document (updated_at desc);

alter table public.portal_madre_document enable row level security;

drop policy if exists portal_madre_document_staff_select on public.portal_madre_document;
create policy portal_madre_document_staff_select
  on public.portal_madre_document for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid() and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_madre_document_admin_all on public.portal_madre_document;
create policy portal_madre_document_admin_all
  on public.portal_madre_document for all to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

revoke all on public.portal_madre_document from anon;
grant select on public.portal_madre_document to authenticated;

create or replace function public.portal_madre_fold_http_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _body jsonb;
begin
  _body := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', to_jsonb(NEW)
  );
  perform net.http_post(
    url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-madre-apply-fold',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-portal-webhook-secret', '__PORTAL_MADRE_WEBHOOK_SECRET__'
    ),
    body := _body
  );
  return NEW;
exception when others then
  raise warning 'portal_madre_fold_http_trigger: %', SQLERRM;
  return NEW;
end;
$$;

drop trigger if exists portal_roster_rows_madre_fold on public.portal_roster_rows;
create trigger portal_roster_rows_madre_fold
  after insert or update on public.portal_roster_rows
  for each row
  execute function public.portal_madre_fold_http_trigger();

drop trigger if exists schedule_overrides_madre_fold on public.schedule_overrides;
create trigger schedule_overrides_madre_fold
  after insert or update on public.schedule_overrides
  for each row
  execute function public.portal_madre_fold_http_trigger();

commit;
