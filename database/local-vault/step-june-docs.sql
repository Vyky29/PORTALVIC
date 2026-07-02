select sp.full_name, sp.username, d.id, d.title, d.category, d.doc_type, d.period_label, d.storage_path, d.created_at
from documents d
join staff_profiles sp on sp.id = d.owner_id
where d.doc_type ilike '%timesheet%'
  and (d.period_label ilike '%2026-06%' or d.period_label ilike '%june%2026%' or d.title ilike '%june%2026%')
order by sp.full_name, d.created_at desc;

select sp.full_name, ps.start_month
from staff_payroll_start ps
join staff_profiles sp on sp.id = ps.user_id
where sp.full_name in ('Andres Borrego','Bismark Gyan','Dan Clarke','Godsway Yatofo','John Kyei-Fram','Teflon','Youssef Moustafa');

select sp.full_name, rr.role, rr.is_primary, pr.hourly_rate
from staff_profiles sp
left join staff_role_rates rr on rr.user_id = sp.id
left join staff_pay_rates pr on pr.user_id = sp.id
where sp.username in ('Bismark','Dan','Godsway','John','teflon','Youssef','Andres')
order by sp.full_name;
