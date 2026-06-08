-- WELLBEING  run ALL of this in Supabase SQL Editor (Portal cklpnwhlqsulpmkipmqb)
-- Step 1 creates tables if missing. Step 2 applies the refined notification flow.
-- https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/sql/new

-- ========== STEP 1: Base tables (safe if already exist) ==========

create table if not exists public.portal_staff_wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  staff_name text not null,
  staff_role text null,
  term_key text not null,
  status text not null default 'all_clear',
  has_concerns boolean not null default false,
  highest_level text not null default 'green',
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

alter table public.portal_staff_wellbeing_checkins enable row level security;
alter table public.portal_wellbeing_admin_notifications enable row level security;
alter table public.portal_staff_wellbeing_sra enable row level security;

grant select, insert, update on table public.portal_staff_wellbeing_checkins to authenticated;
grant select on table public.portal_wellbeing_admin_notifications to authenticated;
grant select, insert, update on table public.portal_staff_wellbeing_sra to authenticated;

drop policy if exists "portal_wellbeing_checkins_insert_own" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_insert_own"
  on public.portal_staff_wellbeing_checkins for insert to authenticated
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_wellbeing_checkins_select_own" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_select_own"
  on public.portal_staff_wellbeing_checkins for select to authenticated
  using (staff_user_id = auth.uid());

drop policy if exists "portal_wellbeing_checkins_select_admin_ceo" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_select_admin_ceo"
  on public.portal_staff_wellbeing_checkins for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_checkins_update_admin_ceo" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_update_admin_ceo"
  on public.portal_staff_wellbeing_checkins for update to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_admin_notifications_select_admin_ceo" on public.portal_wellbeing_admin_notifications;
create policy "portal_wellbeing_admin_notifications_select_admin_ceo"
  on public.portal_wellbeing_admin_notifications for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_admin_notifications_update_admin_ceo" on public.portal_wellbeing_admin_notifications;
create policy "portal_wellbeing_admin_notifications_update_admin_ceo"
  on public.portal_wellbeing_admin_notifications for update to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_sra_select_own" on public.portal_staff_wellbeing_sra;
create policy "portal_wellbeing_sra_select_own"
  on public.portal_staff_wellbeing_sra for select to authenticated
  using (
    exists (
      select 1 from public.portal_staff_wellbeing_checkins c
      where c.id = checkin_id and c.staff_user_id = auth.uid()
    )
  );

drop policy if exists "portal_wellbeing_sra_select_admin_ceo" on public.portal_staff_wellbeing_sra;
create policy "portal_wellbeing_sra_select_admin_ceo"
  on public.portal_staff_wellbeing_sra for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_wellbeing_sra_upsert_admin_ceo" on public.portal_staff_wellbeing_sra;
create policy "portal_wellbeing_sra_upsert_admin_ceo"
  on public.portal_staff_wellbeing_sra for all to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

-- ========== STEP 2: Refined statuses + notifications ==========

alter table public.portal_staff_wellbeing_checkins
  drop constraint if exists portal_staff_wellbeing_checkins_status_chk;

alter table public.portal_staff_wellbeing_checkins
  drop constraint if exists portal_staff_wellbeing_checkins_status_check;

alter table public.portal_staff_wellbeing_checkins
  add constraint portal_staff_wellbeing_checkins_status_chk
  check (status in (
    'all_clear',
    'needs_1to1',
    'awaiting_1to1',
    'in_progress',
    'completed',
    'monitoring'
  ));

update public.portal_staff_wellbeing_checkins
set status = 'awaiting_1to1'
where status = 'needs_1to1';

create or replace function public.portal_staff_wellbeing_checkins_notify_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_area text;
  v_areas text := '';
  v_domain record;
  v_labels jsonb := '{
    "demands": "Workload and job demands",
    "control": "Job control",
    "support": "Support, resources and communication",
    "relations": "Work relationships",
    "role": "Job role and conditions",
    "change": "Job security and change"
  }'::jsonb;
  v_stressors text;
begin
  if not new.has_concerns then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      select 1
      from public.portal_wellbeing_admin_notifications n
      where n.checkin_id = new.id
        and n.read_at is null
    ) then
      return new;
    end if;
  end if;

  for v_domain in
    select key, value
    from jsonb_each(coalesce(new.domains, '{}'::jsonb)) as t(key, value)
  loop
    if coalesce(v_domain.value->>'response', '') = 'support_requested'
       or (
         coalesce(v_domain.value->>'response', '') <> 'all_good'
         and (
           coalesce(v_domain.value->>'level', 'green') in ('amber', 'red')
           or coalesce(nullif(btrim(v_domain.value->>'note'), ''), '') <> ''
           or jsonb_array_length(coalesce(v_domain.value->'stressors', '[]'::jsonb)) > 0
         )
       ) then

      v_stressors := coalesce(
        (
          select string_agg(s.elem::text, ', ')
          from jsonb_array_elements_text(coalesce(v_domain.value->'stressors', '[]'::jsonb)) as s(elem)
        ),
        ''
      );

      v_area :=
        '- ' || coalesce(v_labels->>v_domain.key, initcap(replace(v_domain.key, '_', ' ')));

      if v_stressors <> '' then
        v_area := v_area || ': ' || v_stressors;
      end if;

      if coalesce(nullif(btrim(v_domain.value->>'note'), ''), '') <> '' then
        v_area := v_area || e'\n  Staff comments: ' || btrim(v_domain.value->>'note');
      end if;

      v_areas := v_areas || v_area || e'\n';
    end if;
  end loop;

  v_body :=
    coalesce(new.staff_name, 'Staff member') || ' has requested a wellbeing conversation.' ||
    e'\n\nAreas flagged:' || e'\n' || coalesce(nullif(btrim(v_areas), ''), '- (see check-in record)');

  if coalesce(btrim(new.general_note), '') <> '' then
    v_body := v_body || e'\n\nGeneral note:\n' || new.general_note;
  end if;

  insert into public.portal_wellbeing_admin_notifications (checkin_id, headline, body)
  values (
    new.id,
    'Wellbeing Support Request',
    v_body
  );

  return new;
end;
$$;

drop trigger if exists portal_staff_wellbeing_checkins_notify_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_staff_wellbeing_checkins_notify_trg
after insert on public.portal_staff_wellbeing_checkins
for each row when (new.has_concerns)
execute function public.portal_staff_wellbeing_checkins_notify_admin();

drop trigger if exists portal_staff_wellbeing_checkins_notify_upd_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_staff_wellbeing_checkins_notify_upd_trg
after update of has_concerns, domains, general_note, status
on public.portal_staff_wellbeing_checkins
for each row
when (new.has_concerns)
execute function public.portal_staff_wellbeing_checkins_notify_admin();

drop policy if exists "portal_wellbeing_checkins_update_own_draft" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_update_own_draft"
  on public.portal_staff_wellbeing_checkins for update to authenticated
  using (
    staff_user_id = auth.uid()
    and status in ('all_clear', 'needs_1to1', 'awaiting_1to1', 'completed', 'monitoring')
  )
  with check (staff_user_id = auth.uid());

create or replace function public.portal_wellbeing_notifications_resolve_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status not in ('needs_1to1', 'awaiting_1to1', 'in_progress') then
    update public.portal_wellbeing_admin_notifications
    set read_at = now()
    where checkin_id = new.id
      and read_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists portal_wellbeing_notifications_resolve_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_wellbeing_notifications_resolve_trg
after update of status on public.portal_staff_wellbeing_checkins
for each row
execute function public.portal_wellbeing_notifications_resolve_on_checkin();
