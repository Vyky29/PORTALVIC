-- No-submission penalty ledger + London-time late rule.
--
-- Rule (payroll cycle 25 -> 24, deadline the 24th at 00:00 London):
--   * Submit by the 23rd (London)            -> on time, paid this month, no penalty.
--   * Submit on the 24th (London)             -> late, rolls to next month, £5 penalty.
--   * Did NOT submit by the 24th 00:00 cut-off -> the monthly report records a
--     pending £5 penalty; it is deducted automatically from their NEXT timesheet.
--
-- The penalty is a flat £5 per timesheet (a late submission that also carries a
-- pending no-submission penalty is still only £5, never doubled).

begin;

create table if not exists public.staff_timesheet_penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  missed_month date not null,
  amount numeric(10,2) not null default 5,
  reason text not null default 'no_timesheet',
  created_at timestamptz not null default now(),
  consumed_at timestamptz null,
  consumed_timesheet_id uuid null references public.staff_timesheets (id) on delete set null,
  constraint staff_timesheet_penalties_unique unique (user_id, missed_month)
);

comment on table public.staff_timesheet_penalties is
  'Pending £5 penalties for workers who missed the monthly timesheet deadline. Deducted from their next timesheet by the staff_timesheets trigger.';

create index if not exists staff_timesheet_penalties_user_open_idx
  on public.staff_timesheet_penalties (user_id, missed_month)
  where consumed_at is null;

alter table public.staff_timesheet_penalties enable row level security;

grant select on table public.staff_timesheet_penalties to authenticated;

-- Read your own; admins/CEOs read all. Inserts come from the report (service
-- role) and consumption from the trigger (security definer) — both bypass RLS.
drop policy if exists "stp_select_own_admin_ceo" on public.staff_timesheet_penalties;
create policy "stp_select_own_admin_ceo"
on public.staff_timesheet_penalties
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

-- Rebuild the timesheet server-fields trigger: pay + London-time late rule +
-- consume pending no-submission penalties (flat £5).
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

drop trigger if exists trg_staff_timesheets_apply_server_fields on public.staff_timesheets;
create trigger trg_staff_timesheets_apply_server_fields
before insert or update on public.staff_timesheets
for each row
execute function public.staff_timesheets_apply_server_fields();

-- After insert, mark the consumed pending penalties (FK needs the row to exist).
create or replace function public.staff_timesheets_consume_penalties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff_timesheet_penalties p
  set consumed_at = now(),
      consumed_timesheet_id = new.id
  where p.user_id = new.submitted_by_user_id
    and p.consumed_at is null
    and p.missed_month < new.period_month;
  return null;
end;
$$;

drop trigger if exists trg_staff_timesheets_consume_penalties on public.staff_timesheets;
create trigger trg_staff_timesheets_consume_penalties
after insert on public.staff_timesheets
for each row
execute function public.staff_timesheets_consume_penalties();

commit;
