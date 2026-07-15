-- Mirror of database/migrations/20260617120000_staff_participant_access.sql for supabase db push.

begin;

create table if not exists public.staff_participant_access (
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  participant_slug text not null check (
    participant_slug in ('ikram', 'serine', 'ayaan', 'emanuel')
  ),
  created_at timestamptz not null default now(),
  primary key (staff_id, participant_slug)
);

create index if not exists staff_participant_access_staff_id_idx
  on public.staff_participant_access (staff_id);

alter table public.staff_participant_access enable row level security;

revoke all on public.staff_participant_access from public, anon;
grant select on public.staff_participant_access to authenticated;

drop policy if exists staff_participant_access_select_own on public.staff_participant_access;
create policy staff_participant_access_select_own
  on public.staff_participant_access
  for select
  to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.is_active = true
        and lower(sp.app_role) in ('ceo', 'admin')
    )
  );

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (
  values
    ('ikram'),
    ('emanuel')
) as v(slug)
where sp.is_active = true
  and lower(trim(sp.username)) in ('luliya', 'lulia', 'youssef', 'michelle')
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (
  values
    ('serine'),
    ('ayaan')
) as v(slug)
where sp.is_active = true
  and lower(trim(sp.username)) = 'sandra'
on conflict do nothing;

commit;
