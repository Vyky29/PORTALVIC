-- Explicit feedback_resolution on schedule_overrides (absent | cancelled).
-- Backfill active term overrides; new writes set payload from admin dashboard.

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('feedback_resolution', 'absent'),
  updated_at = now(),
  updated_by = coalesce(updated_by, created_by, (select id from _portal_actor))
where override_type = 'client_absence_announced'
  and coalesce(status, 'active') = 'active'
  and coalesce(payload ->> 'feedback_resolution', '') not in ('absent', 'cancelled');

update public.schedule_overrides
set
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('feedback_resolution', 'cancelled'),
  updated_at = now(),
  updated_by = coalesce(updated_by, created_by, (select id from _portal_actor))
where coalesce(status, 'active') = 'active'
  and coalesce(payload ->> 'feedback_resolution', '') not in ('absent', 'cancelled')
  and (
    override_type = 'slot_close'
    or (
      override_type = 'slot_clear_client'
      and coalesce(payload ->> 'cancelled_by_admin', '') in ('true', 't', '1')
    )
  );

update public.schedule_overrides o
set
  payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
    'portal_session_key',
    public.portal_normalize_session_key(
      o.session_date::text || '|'
      || coalesce(nullif(trim(o.anchor_start::text), ''), '00:00') || '|'
      || coalesce(nullif(trim(o.anchor_client_id), ''), '')
    )
  ),
  updated_at = now(),
  updated_by = coalesce(o.updated_by, o.created_by, (select id from _portal_actor))
where coalesce(o.status, 'active') = 'active'
  and coalesce(o.payload ->> 'feedback_resolution', '') in ('absent', 'cancelled')
  and coalesce(o.payload ->> 'portal_session_key', '') = ''
  and o.session_date is not null
  and coalesce(trim(o.anchor_client_id), '') <> '';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
