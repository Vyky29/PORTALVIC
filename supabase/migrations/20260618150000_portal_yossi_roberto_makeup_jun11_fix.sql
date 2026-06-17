-- Yossi Thu 2026-06-11: makeup was with Roberto (feedback already on 5–5.30 slot), not Aurora 4.30–5.
begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Orphan make-up row (Aurora / Aqsa anchor) — session ran with Roberto; feedback submitted 5–5.30.
update public.schedule_overrides
set
  status = 'cancelled',
  reason = coalesce(nullif(trim(reason), ''), 'Make-up ran with Roberto (5–5.30); feedback submitted'),
  updated_at = now(),
  updated_by = coalesce(updated_by, created_by, (select id from _portal_actor))
where id = '8043cb27-0b30-46d3-a762-8bf8c942887d'
  and status = 'active'
  and override_type = 'client_replace_in_slot';

delete from public.portal_webpush_override_sent
where override_id = '8043cb27-0b30-46d3-a762-8bf8c942887d';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
