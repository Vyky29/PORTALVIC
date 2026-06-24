-- June 2026 one-off: timesheet on-time deadline extended to the 25th (late from the 26th).
-- Portal issues delayed feedback completion; workers need the 25th to finish and submit.
-- Reverts to the normal rule (on-time through the 24th, late from the 25th) from July 2026.

begin;

comment on column public.staff_timesheets.is_late is
  'True when submitted late for the payroll month (normally on/after the 25th; June 2026 exception: on/after the 26th).';

create or replace function public.staff_timesheets_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_single_rate numeric(10,2);
  v_primary_role text;
  v_primary_rate numeric(10,2);
  v_has_role_rates boolean;
  v_cost numeric(12,2);
  v_entry jsonb;
  v_role text;
  v_hours numeric;
  v_completed boolean;
  v_erate numeric(10,2);
  v_flat numeric(10,2);
  v_sub date;
  v_day int;
  v_period_end_month date;
  v_base_late boolean;
  v_has_ledger boolean;
  v_penalty numeric(10,2);
  v_sub_month date;
begin
  if new.submitted_by_user_id is null then
    new.submitted_by_user_id := auth.uid();
  end if;
  if new.submitted_by_user_id is null then
    raise exception 'Unauthenticated user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), ''))
  into new.submitted_by_name
  from public.staff_profiles sp
  where sp.id = new.submitted_by_user_id;

  if coalesce(trim(new.submitted_by_name), '') = '' then
    raise exception 'Missing staff profile display name';
  end if;

  select r.hourly_rate
  into v_single_rate
  from public.staff_pay_rates r
  where r.user_id = new.submitted_by_user_id;

  select exists (
    select 1 from public.staff_role_rates rr where rr.user_id = new.submitted_by_user_id
  ) into v_has_role_rates;

  if v_has_role_rates then
    select rr.role, rr.hourly_rate
    into v_primary_role, v_primary_rate
    from public.staff_role_rates rr
    where rr.user_id = new.submitted_by_user_id
    order by rr.is_primary desc, rr.hourly_rate desc
    limit 1;

    v_cost := 0;
    for v_entry in
      select value from jsonb_array_elements(coalesce(new.entries, '[]'::jsonb)) as t(value)
    loop
      v_completed := coalesce((v_entry->>'completed')::boolean, true);
      if not v_completed then
        continue;
      end if;
      v_hours := coalesce((v_entry->>'hours')::numeric, 0);
      if v_hours <= 0 then
        continue;
      end if;

      v_role := nullif(btrim(v_entry->>'role'), '');
      if v_role is null then
        v_role := public.portal_service_to_role(v_entry->>'service');
      end if;

      v_flat := public.portal_service_flat_rate(coalesce(nullif(v_entry->>'service', ''), v_role));
      if v_flat is not null then
        v_erate := v_flat;
      else
        v_erate := null;
        if v_role is not null then
          select rr.hourly_rate into v_erate
          from public.staff_role_rates rr
          where rr.user_id = new.submitted_by_user_id and rr.role = v_role
          limit 1;
        end if;
        if v_erate is null then
          v_erate := v_primary_rate;
        end if;
        if v_erate is null then
          v_erate := v_single_rate;
        end if;
      end if;

      if v_erate is not null then
        v_cost := v_cost + round(v_hours * v_erate, 2);
      end if;
    end loop;

    new.total_cost := round(v_cost, 2);
    if coalesce(new.total_hours, 0) > 0 then
      new.hourly_rate_used := round(new.total_cost / new.total_hours, 2);
    else
      new.hourly_rate_used := v_primary_rate;
    end if;
  else
    new.hourly_rate_used := v_single_rate;
    if v_single_rate is not null then
      new.total_cost := round(coalesce(new.total_hours, 0) * v_single_rate, 2);
    else
      new.total_cost := null;
    end if;
  end if;

  v_sub := (now() at time zone 'Europe/London')::date;
  new.submitted_on := v_sub;
  v_day := extract(day from v_sub)::int;
  v_sub_month := date_trunc('month', v_sub)::date;

  if v_day >= 25 then
    v_period_end_month := date_trunc('month', (v_sub + interval '1 month'))::date;
  else
    v_period_end_month := date_trunc('month', v_sub)::date;
  end if;

  -- June 2026 one-off: on-time through the 25th; late from the 26th.
  if v_sub_month = date '2026-06-01' and v_day = 25 then
    v_period_end_month := date '2026-06-01';
    v_base_late := false;
  elsif v_sub_month = date '2026-06-01' and v_day >= 26 then
    v_period_end_month := date '2026-07-01';
    v_base_late := true;
  else
    v_base_late := (v_day >= 25);
  end if;

  new.period_month := v_period_end_month;

  select exists (
    select 1
    from public.staff_timesheet_penalties p
    where p.user_id = new.submitted_by_user_id
      and p.consumed_at is null
      and p.missed_month < new.period_month
  ) into v_has_ledger;

  if v_base_late or v_has_ledger then
    new.is_late := true;
    v_penalty := 5.00;
  else
    new.is_late := false;
    v_penalty := 0;
  end if;
  new.penalty_amount := v_penalty;

  if new.total_cost is not null then
    new.net_cost := greatest(round(new.total_cost - v_penalty, 2), 0);
  else
    new.net_cost := null;
  end if;

  return new;
end;
$$;

commit;
