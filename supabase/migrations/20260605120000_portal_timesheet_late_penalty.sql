-- Timesheet late-submission rule + penalty (applies to all staff).
--
-- Payroll cycle is 25 -> 24. On-time deadline is the 23rd of the closing month.
-- Submitting on the 24th (the last day of the cycle) is LATE: the timesheet is
-- moved to the NEXT month's pay and a fixed £5 penalty is deducted, because
-- worked hours must be reported to HMRC on time.
--
-- All amounts stay server-side (the front-end only submits hours). The trigger
-- computes lateness from submitted_on, the effective payroll month, the penalty
-- and the net cost.

begin;

alter table public.staff_timesheets
  add column if not exists is_late boolean not null default false,
  add column if not exists penalty_amount numeric(10,2) not null default 0,
  add column if not exists net_cost numeric(12,2) null;

comment on column public.staff_timesheets.is_late is
  'True when submitted on/after the 24th (deadline is the 23rd). Late sheets roll to next month.';
comment on column public.staff_timesheets.penalty_amount is
  'Fixed late penalty deducted from pay (£5 when late, 0 otherwise).';
comment on column public.staff_timesheets.net_cost is
  'total_cost minus penalty_amount (never below 0).';

create or replace function public.staff_timesheets_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric(10,2);
  v_sub date;
  v_day int;
  v_period_end_month date;
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

  -- Pay rate (server-side only).
  select r.hourly_rate
  into v_rate
  from public.staff_pay_rates r
  where r.user_id = new.submitted_by_user_id;

  new.hourly_rate_used := v_rate;
  if v_rate is not null then
    new.total_cost := round(coalesce(new.total_hours, 0) * v_rate, 2);
  else
    new.total_cost := null;
  end if;

  -- Late / penalty / effective payroll month (cycle 25 -> 24, deadline 23rd).
  v_sub := coalesce(new.submitted_on, current_date);
  v_day := extract(day from v_sub)::int;
  if v_day >= 25 then
    v_period_end_month := date_trunc('month', (v_sub + interval '1 month'))::date;
  else
    v_period_end_month := date_trunc('month', v_sub)::date;
  end if;

  if v_day = 24 then
    -- Submitted on the last day of the cycle: too late for this month's payroll.
    new.is_late := true;
    new.penalty_amount := 5.00;
    new.period_month := (v_period_end_month + interval '1 month')::date;
  else
    new.is_late := false;
    new.penalty_amount := 0;
    new.period_month := v_period_end_month;
  end if;

  if new.total_cost is not null then
    new.net_cost := greatest(round(new.total_cost - coalesce(new.penalty_amount, 0), 2), 0);
  else
    new.net_cost := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_timesheets_apply_server_fields on public.staff_timesheets;
create trigger trg_staff_timesheets_apply_server_fields
before insert or update on public.staff_timesheets
for each row
execute function public.staff_timesheets_apply_server_fields();

commit;
