-- Sunday 2026-06-28 · dedupe Youssef instructor_reassign covers (9 unique slots).
-- Keep aurora-anchored rows (post anchor-fix); cancel older dan-anchored duplicates.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set status = 'cancelled',
    updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid,
    updated_at = now(),
    reason = '[voided 2026-06-30: duplicate Youssef cover 28-Jun; kept aurora-anchored row]'
where id in (
  '85f9c351-7347-47c2-b8fd-f20bbb620f24',
  '3e68ac10-d987-4f30-834d-fdfe56133d13',
  '87a513a9-5883-4876-80b6-a0b67c7def49',
  'eb899277-f76a-465b-9725-fb105d5332a8',
  '69b96d1b-7ce5-4f3a-9091-d929784d5275',
  'b19f27db-12ea-443b-9ec4-a136a0a97bd7',
  '0efa171a-8071-4252-b41a-9401e7fcec0f',
  'e1bafb5d-3286-436f-87e0-e27767ce06e7',
  'e23d53f6-9e03-4793-b045-e5b9d0140ddb'
)
and status = 'active';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select anchor_staff_id, anchor_client_id, to_char(anchor_start,'HH24:MI') as st,
       payload->>'covering_staff_id' as cover, status
from public.schedule_overrides
where session_date = '2026-06-28'
  and override_type = 'instructor_reassign'
  and payload->>'covering_staff_id' = 'youssef'
order by anchor_start, status, anchor_staff_id;
