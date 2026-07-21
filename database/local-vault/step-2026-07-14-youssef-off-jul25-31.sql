-- Youssef: day off 25–31 July 2026 (cancel shifts / planned absence).
-- One staff_unavailability row per day. Optional any active overrides anchored on him in-window.

begin;

insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
select
  'youssef',
  coalesce(nullif(trim(sp.full_name), ''), 'Youssef Moustafa'),
  sp.id,
  d::date,
  'Time off requested — Planned Absence'
from generate_series(date '2026-07-25', date '2026-07-31', interval '1 day') as d
cross join lateral (
  select id, full_name
  from public.staff_profiles
  where id = 'de59ac92-8ff0-44e4-94c6-884ca161dd73'::uuid
     or lower(trim(username)) in ('youssef', 'yousef', 'yusef')
  order by case
    when id = 'de59ac92-8ff0-44e4-94c6-884ca161dd73'::uuid then 0
    when lower(trim(username)) = 'youssef' then 1
    else 2
  end
  limit 1
) sp
on conflict (name_key, off_date)
do update set
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name,
  reason = excluded.reason;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = created_by
where status = 'active'
  and lower(trim(anchor_staff_id)) in ('youssef', 'yousef', 'yusef')
  and session_date between date '2026-07-25' and date '2026-07-31';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

-- Check:
-- select name_key, off_date, reason from public.staff_unavailability
-- where name_key = 'youssef' and off_date between '2026-07-25' and '2026-07-31'
-- order by off_date;
