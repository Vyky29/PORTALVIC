select policyname, cmd, with_check, qual
from pg_policies
where schemaname='public' and tablename='documents'
order by policyname;

select pg_get_functiondef('public.portal_staff_profile_is_portal_admin()'::regprocedure) as def;

select id, employee_name, status, letter_document_id, letter_generated_at, submitted_by_user_id, course_title, updated_at
from public.portal_staff_ld_funding_applications
where lower(coalesce(employee_name,'')) like '%teflon%'
   or lower(coalesce(course_title,'')) like '%asa%'
order by updated_at desc nulls last
limit 10;

select exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='documents'
    and policyname='documents_insert_admin_ld_funding'
) as has_ld_insert_policy;
