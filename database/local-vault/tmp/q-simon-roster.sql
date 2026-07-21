-- Simon Thursday 16:00 roster rows
select session_date, client_name, day, time_slot, area, venue, instructors
from (
  select distinct on (session_date, time_slot, area)
    session_date, client_name, day, time_slot, area, venue, instructors
  from (
    select null::date as session_date, 'template' as src, *
    from (values
      ('Logan', 'Tuesday', '5 to 5.30', 'Teaching Pool', 'Acton', 'SIMON'),
      ('Elijah', 'Thursday', '4 to 4.30', 'Teaching Pool', 'Acton', 'AURORA')
    ) as t(client_name, day, time_slot, area, venue, instructors)
  ) x
) y limit 5;

select id, session_date, anchor_start, anchor_end, anchor_staff_id, anchor_client_id,
       payload->>'covering_staff_id' as cover
from schedule_overrides
where status='active' and session_date='2026-07-16'
  and override_type='instructor_reassign';
