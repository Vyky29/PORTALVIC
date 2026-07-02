select sp.full_name, sp.username, st.*
from staff_timesheets st
join staff_profiles sp on sp.id = st.submitted_by_user_id
where st.period_month = '2026-06-01'
order by sp.full_name, st.created_at desc;

select sp.full_name, si.*
from staff_timesheet_imports si
left join staff_profiles sp on sp.id = si.user_id
where si.period_month = '2026-06-01'
order by si.name;

select sp.full_name, p.*
from staff_timesheet_penalties p
join staff_profiles sp on sp.id = p.user_id
where p.missed_month = '2026-06-01'
order by sp.full_name;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'documents'
order by ordinal_position;
