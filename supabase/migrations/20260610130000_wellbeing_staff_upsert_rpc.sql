-- Staff wellbeing check-in resubmit (incl. after admin opened 1-to-1).

drop policy if exists "portal_wellbeing_checkins_update_own_draft" on public.portal_staff_wellbeing_checkins;

create policy "portal_wellbeing_checkins_update_own_draft"
  on public.portal_staff_wellbeing_checkins
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status in (
      'all_clear',
      'needs_1to1',
      'awaiting_1to1',
      'in_progress',
      'completed',
      'monitoring'
    )
  )
  with check (staff_user_id = auth.uid());

create or replace function public.portal_wellbeing_staff_upsert_checkin(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  out_row public.portal_staff_wellbeing_checkins;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(p_row->>'staff_user_id', '') = '' then
    raise exception 'staff_user_id required';
  end if;

  if (p_row->>'staff_user_id')::uuid is distinct from uid then
    raise exception 'staff_user_id mismatch';
  end if;

  insert into public.portal_staff_wellbeing_checkins (
    staff_user_id,
    staff_name,
    staff_role,
    term_key,
    status,
    has_concerns,
    highest_level,
    domains,
    general_note
  )
  values (
    uid,
    coalesce(nullif(trim(p_row->>'staff_name'), ''), 'Staff member'),
    nullif(trim(p_row->>'staff_role'), ''),
    coalesce(nullif(trim(p_row->>'term_key'), ''), 'unknown'),
    coalesce(nullif(trim(p_row->>'status'), ''), 'all_clear'),
    coalesce((p_row->>'has_concerns')::boolean, false),
    coalesce(nullif(trim(p_row->>'highest_level'), ''), 'green'),
    coalesce(p_row->'domains', '{}'::jsonb),
    nullif(trim(p_row->>'general_note'), '')
  )
  on conflict (staff_user_id, term_key) do update
  set
    staff_name = excluded.staff_name,
    staff_role = excluded.staff_role,
    status = excluded.status,
    has_concerns = excluded.has_concerns,
    highest_level = excluded.highest_level,
    domains = excluded.domains,
    general_note = excluded.general_note,
    updated_at = now()
  returning * into out_row;

  return to_jsonb(out_row);
end;
$$;

revoke all on function public.portal_wellbeing_staff_upsert_checkin(jsonb) from public;
grant execute on function public.portal_wellbeing_staff_upsert_checkin(jsonb) to authenticated;
