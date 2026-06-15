select id, created_at, override_type, status, anchor_client_id, anchor_start, anchor_end, anchor_venue, anchor_staff_id, anchor_time_slot_label, payload, reason
from public.schedule_overrides
where session_date = '2026-06-15'
  and lower(trim(anchor_staff_id)) = 'youssef'
  and lower(trim(anchor_venue)) = 'acton'
order by created_at;
