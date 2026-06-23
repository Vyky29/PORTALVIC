-- Sunday SwimFarm Multi-Activity: support staff = 5h payable; only Berta/John leads = 5.5h.
-- Correct June 2026 payroll-period submissions that stored 5.5h for non-lead support workers.

begin;

alter table public.staff_timesheets disable trigger trg_staff_timesheets_apply_server_fields;

with staff_keys as (
  select
    st.id,
    st.submitted_by_user_id,
    st.entries,
    st.hourly_rate_used,
    st.penalty_amount,
    lower(trim(coalesce(sp.username, ''))) as username_key
  from public.staff_timesheets st
  join public.staff_profiles sp on sp.id = st.submitted_by_user_id
  where st.period_month = date '2026-06-01'
),
entry_fix as (
  select
    sk.id,
    jsonb_agg(
      case
        when lower(coalesce(e.value->>'day', '')) = 'sunday'
          and coalesce((e.value->>'hours')::numeric, 0) = 5.5
          and sk.username_key not in ('john', 'berta')
          and (
            lower(coalesce(e.value->>'role', '')) = 'support worker'
            or lower(coalesce(e.value->>'service', '')) like '%multi%'
          )
        then jsonb_set(e.value, '{hours}', to_jsonb(5::numeric))
        else e.value
      end
      order by e.ord
    ) as new_entries
  from staff_keys sk
  cross join lateral jsonb_array_elements(coalesce(sk.entries, '[]'::jsonb)) with ordinality as e(value, ord)
  group by sk.id
),
payable as (
  select
    ef.id,
    ef.new_entries,
    coalesce(
      sum(
        case
          when coalesce((e.value->>'completed')::boolean, true)
            then coalesce((e.value->>'hours')::numeric, 0)
          else 0
        end
      ),
      0
    ) as new_total_hours
  from entry_fix ef
  cross join lateral jsonb_array_elements(ef.new_entries) as e(value)
  group by ef.id, ef.new_entries
)
update public.staff_timesheets st
set
  entries = p.new_entries,
  total_hours = round(p.new_total_hours, 2),
  total_cost = case
    when st.hourly_rate_used is not null then round(p.new_total_hours * st.hourly_rate_used, 2)
    else st.total_cost
  end,
  net_cost = case
    when st.hourly_rate_used is not null then greatest(
      round(p.new_total_hours * st.hourly_rate_used, 2) - coalesce(st.penalty_amount, 0),
      0
    )
    else st.net_cost
  end
from payable p
where st.id = p.id
  and st.entries is distinct from p.new_entries;

alter table public.staff_timesheets enable trigger trg_staff_timesheets_apply_server_fields;

commit;
