select id, username, full_name from staff_profiles
where lower(username) like '%simon%' or lower(full_name) like '%simon%';

select id, session_date, anchor_start, anchor_end, anchor_staff_id, anchor_client_id, anchor_venue,
       payload
from schedule_overrides
where id in (
  select id from schedule_overrides
  where status='active' and session_date='2026-07-16' and override_type='instructor_reassign'
  limit 5
);
