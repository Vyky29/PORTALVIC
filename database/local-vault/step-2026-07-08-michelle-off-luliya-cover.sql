-- 2026-07-08 (Wed) Day Centre coverage + shadowing cancellations.
--  * Michelle off (unpaid; "Time off requested" style -> red pulsing on her card).
--  * Ikram (SwimFarm Day Centre) covered by Luliya + Youssef 11-3 and Victor 3-4.
--  * Luliya shadowing on Mon 6 Jul and Wed 8 Jul cancelled (13 & 15 Jul kept).
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-07-08-michelle-off-luliya-cover.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- 1) Cancel Luliya's shadowing on 2026-07-06 and 2026-07-08 (keep 13 & 15 Jul).
alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;
update public.schedule_overrides
set status = 'cancelled', updated_at = now(), updated_by = (select id from _portal_actor)
where anchor_staff_id = 'lulia'
  and override_type = 'session_add'
  and payload->>'kind' = 'shadowing'
  and session_date in ('2026-07-06', '2026-07-08')
  and status = 'active';
alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

-- 2) Michelle off Wed 8 (unpaid). Self-read via RLS renders "Day off
--    (Time Off Requested)" + red pulsing on her own dashboard.
insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
values ('michelle', 'Michelle', '4ae392bb-edd1-4aea-88bb-19eedc2a03c1', '2026-07-08', 'Time off requested — Not working')
on conflict (name_key, off_date)
do update set reason = excluded.reason, staff_id = excluded.staff_id, staff_name = excluded.staff_name;

-- 3) Ikram Wed 8 coverage: retire base 11-4 slot, add 11-3 (Luliya + Youssef)
--    and 3-4 (Victor). Cancelled dated row suppresses the base bundle slot.
update public.portal_roster_rows
set status = 'cancelled', updated_at = now(), updated_by = (select id from _portal_actor)
where session_date = '2026-07-08'::date
  and lower(trim(client_name)) = 'ikram'
  and status = 'active'
  and exists (select 1 from _portal_actor);

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Wednesday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-07-08'::date, v.status, a.id, a.id
from _portal_actor a
cross join (
  values
    ('Ikram', '11 to 4', 'LULIA, MICHELLE', 'Day Centre', 'Hub Room', 'cancelled'),
    ('Ikram', '11 to 3', 'LULIYA, YOUSSEF', 'Day Centre', 'Hub Room', 'active'),
    ('Ikram', '3 to 4', 'VICTOR', 'Day Centre', 'Hub Room', 'active')
) as v(client_name, time_slot, instructors, service, area, status);

commit;

select 'shadowing' as kind, session_date::text as info, status
from public.schedule_overrides
where anchor_staff_id = 'lulia' and override_type = 'session_add'
  and payload->>'kind' = 'shadowing' and session_date between '2026-07-06' and '2026-07-15'
union all
select 'michelle_off', off_date::text, reason from public.staff_unavailability where name_key = 'michelle' and off_date = '2026-07-08'
union all
select 'ikram_roster', time_slot || ' ' || instructors, status from public.portal_roster_rows where session_date = '2026-07-08'::date and lower(trim(client_name)) = 'ikram'
order by kind, info;
