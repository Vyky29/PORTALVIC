-- Rename existing payslip document titles to "{FirstName}'s Payslip ({Month})"
-- or "{FirstName}'s Payslip ({Month} N)" when multiple payslips share the same month.

begin;

with ranked as (
  select
    d.id,
    coalesce(nullif(split_part(trim(sp.full_name), ' ', 1), ''), sp.username, 'Worker') as first_name,
    trim(to_char(d.related_date, 'FMMonth')) as month_label,
    row_number() over (
      partition by d.user_id, date_trunc('month', d.related_date::timestamp)
      order by d.created_at asc, d.id asc
    ) as seq,
    count(*) over (
      partition by d.user_id, date_trunc('month', d.related_date::timestamp)
    ) as cnt
  from public.documents d
  join public.staff_profiles sp on sp.id = d.user_id
  where lower(d.category) = 'payslips'
    and lower(d.document_type) = 'payslip'
)
update public.documents d
set title = case
  when r.cnt > 1 then r.first_name || '''s Payslip (' || r.month_label || ' ' || r.seq || ')'
  else r.first_name || '''s Payslip (' || r.month_label || ')'
end
from ranked r
where d.id = r.id;

commit;
