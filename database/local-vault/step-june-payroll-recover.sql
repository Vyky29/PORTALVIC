alter table public.staff_timesheets disable trigger trg_staff_timesheets_apply_server_fields;

update public.staff_timesheets st
set
  period_month = '2026-06-01',
  submitted_on = (st.created_at at time zone 'Europe/London')::date,
  is_late = false,
  penalty_amount = 0,
  net_cost = st.total_cost
where st.period_month = '2026-07-01'
  and st.created_at < timestamptz '2026-06-26 12:00:00+00';

with ranked as (
  select id,
         row_number() over (
           partition by submitted_by_user_id
           order by created_at desc
         ) as rn
  from public.staff_timesheets
  where period_month = '2026-06-01'
)
delete from public.staff_timesheets st
using ranked r
where st.id = r.id and r.rn > 1;

delete from public.staff_timesheet_penalties where missed_month = '2026-06-01';

alter table public.staff_timesheets enable trigger trg_staff_timesheets_apply_server_fields;

select period_month::text as pm, count(*)::int as n
from public.staff_timesheets
where period_month in ('2026-06-01', '2026-07-01')
group by 1
order by 1;
