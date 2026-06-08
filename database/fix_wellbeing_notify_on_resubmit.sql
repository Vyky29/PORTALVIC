-- Fix: bell notification when staff resubmits wellbeing check-in with support (same term).
-- Run in Supabase SQL Editor after apply_wellbeing_full_setup.sql
-- https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/sql/new

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

  -- On update: skip if an unread notification already exists (avoid duplicates)
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
for each row
when (new.has_concerns)
execute function public.portal_staff_wellbeing_checkins_notify_admin();

drop trigger if exists portal_staff_wellbeing_checkins_notify_upd_trg on public.portal_staff_wellbeing_checkins;
create trigger portal_staff_wellbeing_checkins_notify_upd_trg
after update of has_concerns, domains, general_note, status
on public.portal_staff_wellbeing_checkins
for each row
when (new.has_concerns)
execute function public.portal_staff_wellbeing_checkins_notify_admin();

-- Allow staff to resubmit after a completed / monitoring check-in (same term)
drop policy if exists "portal_wellbeing_checkins_update_own_draft" on public.portal_staff_wellbeing_checkins;
create policy "portal_wellbeing_checkins_update_own_draft"
  on public.portal_staff_wellbeing_checkins
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status in ('all_clear', 'needs_1to1', 'awaiting_1to1', 'in_progress', 'completed', 'monitoring')
  )
  with check (staff_user_id = auth.uid());

-- Auto-clear bell notifications when 1-to-1 is marked complete
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
