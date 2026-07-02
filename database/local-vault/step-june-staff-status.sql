-- June 2026 staff timesheet status
select sp.id, sp.username, sp.full_name,
  exists(select 1 from staff_timesheets st where st.submitted_by_user_id = sp.id and st.period_month = '2026-06-01') as has_timesheet_row,
  exists(select 1 from staff_timesheet_imports si where si.user_id = sp.id and si.period_month = '2026-06-01') as has_import,
  (select st.is_late from staff_timesheets st where st.submitted_by_user_id = sp.id and st.period_month = '2026-06-01' order by st.created_at desc limit 1) as is_late,
  (select st.penalty_amount from staff_timesheets st where st.submitted_by_user_id = sp.id and st.period_month = '2026-06-01' order by st.created_at desc limit 1) as penalty,
  (select st.total_cost from staff_timesheets st where st.submitted_by_user_id = sp.id and st.period_month = '2026-06-01' order by st.created_at desc limit 1) as gross,
  (select st.total_hours from staff_timesheets st where st.submitted_by_user_id = sp.id and st.period_month = '2026-06-01' order by st.created_at desc limit 1) as hours
from staff_profiles sp
where sp.is_active is distinct from false
  and (
    exists(select 1 from staff_pay_rates r where r.user_id = sp.id)
    or exists(select 1 from staff_role_rates rr where rr.user_id = sp.id)
  )
order by sp.full_name;
