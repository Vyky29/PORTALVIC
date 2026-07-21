select id, session_date, anchor_start, anchor_end, anchor_staff_id, anchor_client_id,
       anchor_venue, override_type, status, created_at,
       payload->>'covering_staff_id' as covering_staff_id,
       payload->>'covering_staff_name' as covering_staff_name,
       left(payload::text, 500) as payload_snip
from schedule_overrides
where status = 'active'
  and session_date = '2026-07-16'
  and (
    lower(coalesce(anchor_client_id,'')) like '%elijah%'
    or payload::text ilike '%elijah%'
    or payload::text ilike '%simon%'
    or lower(coalesce(anchor_staff_id,'')) like '%aurora%'
    or lower(coalesce(anchor_staff_id,'')) like '%simon%'
  )
order by created_at desc;

select id, username, full_name
from staff_profiles
where username ilike '%simon%' or full_name ilike '%simon%'
limit 10;

-- all instructor_reassign for today
select session_date, anchor_start, anchor_staff_id, anchor_client_id,
       payload->>'covering_staff_id' as covering,
       override_type, status
from schedule_overrides
where status='active' and session_date='2026-07-16' and override_type='instructor_reassign'
order by anchor_start;
