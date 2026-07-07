-- Staff wellbeing check-in (simple) + admin/CEO alerts + full SRA draft for 1-to-1.

begin;

create table if not exists public.portal_staff_wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  staff_name text not null,
  staff_role text null,
  term_key text not null,
  status text not null default 'all_clear'
    check (status in ('all_clear', 'needs_1to1', 'in_progress', 'completed')),
  has_concerns boolean not null default false,
  highest_level text not null default 'green'
    check (highest_level in ('green', 'amber', 'red')),
  domains jsonb not null default '{}'::jsonb,
  general_note text null,
  unique (staff_user_id, term_key)
);

create index if not exists portal_staff_wellbeing_checkins_status_idx
  on public.portal_staff_wellbeing_checkins (status, created_at desc);

create index if not exists portal_staff_wellbeing_checkins_concerns_idx
  on public.portal_staff_wellbeing_checkins (created_at desc)
  where has_concerns = true;

create table if not exists public.portal_wellbeing_admin_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  checkin_id uuid not null references public.portal_staff_wellbeing_checkins (id) on delete cascade,
  headline text not null,
  body text null,
  read_at timestamptz null
);

create index if not exists portal_wellbeing_admin_notifications_unread_idx
  on public.portal_wellbeing_admin_notifications (created_at desc)
  where read_at is null;

create table if not exists public.portal_staff_wellbeing_sra (
  checkin_id uuid primary key references public.portal_staff_wellbeing_checkins (id) on delete cascade,
  draft_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) on delete set null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users (id) on delete set null
);

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  );
$$;

revoke all on function public.portal_staff_profile_is_admin_or_ceo() from public;
grant execute on function public.portal_staff_profile_is_admin_or_ceo() to authenticated;

create or replace function public.portal_staff_wellbeing_checkins_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portal_staff_wellbeing_checkins_touch_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_staff_wellbeing_checkins_touch_trg
before update on public.portal_staff_wellbeing_checkins
for each row execute function public.portal_staff_wellbeing_checkins_touch_updated_at();

create or replace function public.portal_staff_wellbeing_checkins_notify_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_domains text;
begin
  if not new.has_concerns then
    return new;
  end if;

  v_domains := coalesce(
  (
    select string_agg(
      initcap(replace(key, '_', ' ')) || ' (' || coalesce(value->>'level', '?') || ')',
      ', '
      order by key
    )
    from jsonb_each(new.domains) as t(key, value)
    where coalesce(value->>'level', 'green') <> 'green'
       or coalesce(nullif(btrim(value->>'note'), ''), '') <> ''
       or jsonb_array_length(coalesce(value->'stressors', '[]'::jsonb)) > 0
  ),
  'ù'
  );

  v_body :=
    'Staff: ' || coalesce(new.staff_name, 'ù') ||
    e'\nTerm: ' || coalesce(new.term_key, 'ù') ||
    e'\nHighest level: ' || coalesce(new.highest_level, 'ù') ||
    e'\nAreas flagged: ' || v_domains;

  if coalesce(btrim(new.general_note), '') <> '' then
    v_body := v_body || e'\n\nGeneral note:\n' || new.general_note;
  end if;

  insert into public.portal_wellbeing_admin_notifications (checkin_id, headline, body)
  values (
    new.id,
    'Wellbeing check-in ù 1-to-1 needed',
    v_body
  );

  return new;
end;
$$;

drop trigger if exists portal_staff_wellbeing_checkins_notify_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_staff_wellbeing_checkins_notify_trg
after insert
on public.portal_staff_wellbeing_checkins
for each row
when (new.has_concerns)
execute function public.portal_staff_wellbeing_checkins_notify_admin();

drop trigger if exists portal_staff_wellbeing_checkins_notify_upd_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_staff_wellbeing_checkins_notify_upd_trg
after update of has_concerns
on public.portal_staff_wellbeing_checkins
for each row
when (new.has_concerns and not coalesce(old.has_concerns, false))
execute function public.portal_staff_wellbeing_checkins_notify_admin();

alter table public.portal_staff_wellbeing_checkins enable row level security;
alter table public.portal_wellbeing_admin_notifications enable row level security;
alter table public.portal_staff_wellbeing_sra enable row level security;

grant select, insert, update on table public.portal_staff_wellbeing_checkins to authenticated;
grant select on table public.portal_wellbeing_admin_notifications to authenticated;
grant select, insert, update on table public.portal_staff_wellbeing_sra to authenticated;

drop policy if exists "portal_wellbeing_checkins_insert_own" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_insert_own"
  on public.portal_staff_wellbeing_checkins
  for insert
  to authenticated
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_wellbeing_checkins_select_own" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_select_own"
  on public.portal_staff_wellbeing_checkins
  for select
  to authenticated
  using (staff_user_id = auth.uid());

drop policy if exists "portal_wellbeing_checkins_update_own_draft" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_update_own_draft"
  on public.portal_staff_wellbeing_checkins
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status in ('all_clear', 'needs_1to1')
  )
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_wellbeing_checkins_select_admin_ceo" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_select_admin_ceo"
  on public.portal_staff_wellbeing_checkins
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_checkins_update_admin_ceo" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_update_admin_ceo"
  on public.portal_staff_wellbeing_checkins
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_admin_notifications_select_admin_ceo"
  on public.portal_wellbeing_admin_notifications;
create policy "portal_wellbeing_admin_notifications_select_admin_ceo"
  on public.portal_wellbeing_admin_notifications
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_admin_notifications_update_admin_ceo"
  on public.portal_wellbeing_admin_notifications;
create policy "portal_wellbeing_admin_notifications_update_admin_ceo"
  on public.portal_wellbeing_admin_notifications
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_sra_select_own" on public.portal_staff_wellbeing_sra;
create policy "portal_wellbeing_sra_select_own"
  on public.portal_staff_wellbeing_sra
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_staff_wellbeing_checkins c
      where c.id = checkin_id
        and c.staff_user_id = auth.uid()
    )
  );

drop policy if exists "portal_wellbeing_sra_select_admin_ceo" on public.portal_staff_wellbeing_sra;
create policy "portal_wellbeing_sra_select_admin_ceo"
  on public.portal_staff_wellbeing_sra
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_sra_upsert_admin_ceo" on public.portal_staff_wellbeing_sra;
create policy "portal_wellbeing_sra_upsert_admin_ceo"
  on public.portal_staff_wellbeing_sra
  for all
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

commit;
