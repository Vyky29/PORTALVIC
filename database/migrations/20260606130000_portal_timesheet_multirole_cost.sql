-- Multi-role timesheet cost: pay each session's hours at the rate for the role
-- that session belongs to (detected from its `service`), using staff_role_rates.
--
-- Keeps everything else identical to 20260605130000 (London-time late rule,
-- £5 penalty ledger). Only the cost block changes:
--   * If the worker has staff_role_rates rows: total_cost = sum over completed
--     entries of hours * rate(role). Role comes from entry.role, else mapped
--     from entry.service, else the worker's primary role. hourly_rate_used is
--     the blended effective rate (total_cost / total_hours).
--   * Otherwise: fall back to the legacy single staff_pay_rates rate.

begin;

-- service text -> pay role (used by the trigger and reusable elsewhere).
create or replace function public.portal_service_to_role(p_service text)
returns text
language sql
immutable
as $$
  select case
    when p_service is null or btrim(p_service) = '' then null
    when p_service ~* 'climb'                         then 'Climbing Instructor'
    when p_service ~* 'swim|aquatic'                  then 'Swimming Instructor'
    when p_service ~* 'physical|fitness|gym'          then 'Fitness Instructor'
    when p_service ~* 'multi|bespoke|day ?cent|support|hub' then 'Support Worker'
    else null
  end;
$$;

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
  v_sub date;
  v_day int;
  v_period_end_month date;
  v_base_late boolean;
  v_has_ledger boolean;
  v_penalty numeric(10,2);
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

  -- Legacy single rate (fallback).
  select r.hourly_rate
  into v_single_rate
  from public.staff_pay_rates r
  where r.user_id = new.submitted_by_user_id;

  -- Multi-role rates present?
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
    -- Legacy single-rate path.
    new.hourly_rate_used := v_single_rate;
    if v_single_rate is not null then
      new.total_cost := round(coalesce(new.total_hours, 0) * v_single_rate, 2);
    else
      new.total_cost := null;
    end if;
  end if;

  -- Submission date in London time (deadline is the 24th at 00:00 London).
  v_sub := (now() at time zone 'Europe/London')::date;
  new.submitted_on := v_sub;
  v_day := extract(day from v_sub)::int;
  if v_day >= 25 then
    v_period_end_month := date_trunc('month', (v_sub + interval '1 month'))::date;
  else
    v_period_end_month := date_trunc('month', v_sub)::date;
  end if;

  v_base_late := (v_day = 24);
  if v_base_late then
    new.period_month := (v_period_end_month + interval '1 month')::date;
  else
    new.period_month := v_period_end_month;
  end if;

  -- Any pending no-submission penalty from an earlier month?
  select exists (
    select 1
    from public.staff_timesheet_penalties p
    where p.user_id = new.submitted_by_user_id
      and p.consumed_at is null
      and p.missed_month < new.period_month
  ) into v_has_ledger;

  if v_base_late or v_has_ledger then
    new.is_late := true;
    v_penalty := 5.00;   -- flat £5, never doubled
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
