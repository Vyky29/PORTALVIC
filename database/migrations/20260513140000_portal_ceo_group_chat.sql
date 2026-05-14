-- Shared "All CEOs" group thread for admin CEO's Chat (one conversation, all admins/CEOs with shared inbox access).
-- App lists `portal_ceo_group` rows in CEO's Chat alongside 1:1 DM threads.

begin;

create table if not exists public.portal_ceo_group (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_ceo_group_message (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.portal_ceo_group (id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_ceo_group_message_group_created_idx
  on public.portal_ceo_group_message (group_id, created_at desc);

create or replace function public.portal_ceo_group_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
begin
  update public.portal_ceo_group
  set updated_at = new.created_at
  where id = new.group_id;
  return new;
end;
$$;

drop trigger if exists portal_ceo_group_message_touch on public.portal_ceo_group_message;
create trigger portal_ceo_group_message_touch
  after insert on public.portal_ceo_group_message
  for each row execute procedure public.portal_ceo_group_touch_updated_at();

alter table public.portal_ceo_group enable row level security;
alter table public.portal_ceo_group_message enable row level security;

drop policy if exists "portal_ceo_group_select_admin_ceo" on public.portal_ceo_group;
create policy "portal_ceo_group_select_admin_ceo"
  on public.portal_ceo_group
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_ceo_group_message_select_admin_ceo" on public.portal_ceo_group_message;
create policy "portal_ceo_group_message_select_admin_ceo"
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_ceo_group_message_insert_admin_ceo" on public.portal_ceo_group_message;
create policy "portal_ceo_group_message_insert_admin_ceo"
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_admin_or_ceo()
    and exists (
      select 1 from public.portal_ceo_group g where g.id = group_id
    )
  );

insert into public.portal_ceo_group (slug, title)
values ('all_ceos', 'All CEOs (group)')
on conflict (slug) do nothing;

insert into public.portal_ceo_group (slug, title)
values ('ceo_liaison', 'CEO & Ops liaison (group)')
on conflict (slug) do nothing;

alter table public.portal_ceo_group_message replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'portal_ceo_group_message'
    ) then
      alter publication supabase_realtime add table public.portal_ceo_group_message;
    end if;
  end if;
end $$;

commit;
