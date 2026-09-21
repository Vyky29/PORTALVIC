-- Fadi absent until Mon 21 Sep — DC boards Fri 11–Fri 18 (Victor sign-off).
-- Cancel Fadi Absent chips; dated SwimFarm Day Centre seats; Thu offs.
--
--   npx supabase db query --linked -f database/local-vault/office-fadi-absent-dc-boards-11-18-20260909.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- 1) Cancel Fadi absences so he is not painted Absent until Mon 21
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Fadi removed from DC until Mon 21 (no Absent chip)',
  spreadsheet_revision = 'office:fadi-absent-dc-boards-11-18-20260909',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where status = 'active'
  and override_type = 'client_absence_announced'
  and anchor_client_id = 'fadi'
  and session_date >= '2026-09-01'::date
  and session_date < '2026-09-21'::date;

-- 2) Replace dated DC boards (no Fadi)
delete from public.portal_roster_rows
where status = 'active'
  and session_date in (
    '2026-09-11'::date, '2026-09-14'::date, '2026-09-15'::date,
    '2026-09-16'::date, '2026-09-17'::date, '2026-09-18'::date
  )
  and lower(coalesce(service, '')) like '%day centre%'
  and venue ilike '%SwimFarm%';

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select v.client_name, v.instructors, v.time_slot, v.area, v.day, 'Day Centre', 'SwimFarm',
  v.session_date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    -- Fri 11
    ('Emanuel', 'ROBERTO', '11 to 3', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Ikram', 'LULIYA', '11 to 4', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Ikram', 'YOUSSEF', '11 to 3', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Timi', 'VICTOR', '11 to 1', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Emanuel', 'VICTOR', '3 to 4', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Timi', 'MICHELLE', '11 to 1', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Ikram', 'MICHELLE', '3 to 4', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Timi', 'RAUL', '11 to 1', 'Hub Room', 'Friday', '2026-09-11'::date),
    ('Emanuel', 'RAUL', '3 to 4', 'Hub Room', 'Friday', '2026-09-11'::date),
    -- Mon 14
    ('Emanuel', 'ROBERTO', '11 to 3', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Ikram', 'LULIYA', '11 to 3', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Ikram', 'YOUSSEF', '11 to 3', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Timi', 'VICTOR', '11 to 1', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Emanuel', 'VICTOR', '3 to 4', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Timi', 'MICHELLE', '11 to 1', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Ikram', 'MICHELLE', '3 to 4', 'Hub Room', 'Monday', '2026-09-14'::date),
    ('Office', 'RAUL', '11 to 3', 'Hub · Office', 'Monday', '2026-09-14'::date),
    ('Ikram', 'RAUL', '3 to 4', 'Hub Room', 'Monday', '2026-09-14'::date),
    -- Tue 15
    ('ACAT', 'ROBERTO', '11 to 12', 'Hub · ACAT', 'Tuesday', '2026-09-15'::date),
    ('Ikram', 'ROBERTO', '12 to 3', 'Hub Room', 'Tuesday', '2026-09-15'::date),
    ('Ikram', 'LULIYA', '11 to 3', 'Hub Room', 'Tuesday', '2026-09-15'::date),
    ('Ikram', 'MICHELLE', '11 to 12', 'Hub Room', 'Tuesday', '2026-09-15'::date),
    ('Manager', 'MICHELLE', '12 to 3', 'Hub · Manager', 'Tuesday', '2026-09-15'::date),
    ('Ikram', 'MICHELLE', '3 to 4', 'Hub Room', 'Tuesday', '2026-09-15'::date),
    ('Office', 'VICTOR', '11 to 3', 'Hub · Office', 'Tuesday', '2026-09-15'::date),
    ('Ikram', 'VICTOR', '3 to 4', 'Hub Room', 'Tuesday', '2026-09-15'::date),
    ('Office', 'RAUL', '11 to 4', 'Hub · Office', 'Tuesday', '2026-09-15'::date),
    -- Wed 16
    ('Emanuel', 'ROBERTO', '11 to 4', 'Hub Room', 'Wednesday', '2026-09-16'::date),
    ('Ikram', 'LULIYA', '11 to 3', 'Hub Room', 'Wednesday', '2026-09-16'::date),
    ('Office', 'RAUL', '11 to 3', 'Hub · Office', 'Wednesday', '2026-09-16'::date),
    ('Ikram', 'RAUL', '3 to 4', 'Hub Room', 'Wednesday', '2026-09-16'::date),
    ('Ikram', 'MICHELLE', '11 to 4', 'Hub Room', 'Wednesday', '2026-09-16'::date),
    ('Office', 'VICTOR', '11 to 4', 'Hub · Office', 'Wednesday', '2026-09-16'::date),
    -- Thu 17 (Raul + Victor Office only)
    ('Office', 'RAUL', '11 to 4', 'Hub · Office', 'Thursday', '2026-09-17'::date),
    ('Office', 'VICTOR', '11 to 4', 'Hub · Office', 'Thursday', '2026-09-17'::date),
    -- Fri 18
    ('Emanuel', 'ROBERTO', '11 to 3', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Ikram', 'LULIYA', '11 to 4', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Ikram', 'YOUSSEF', '11 to 3', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Timi', 'VICTOR', '11 to 1', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Emanuel', 'VICTOR', '3 to 4', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Timi', 'MICHELLE', '11 to 1', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Ikram', 'MICHELLE', '3 to 4', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Timi', 'RAUL', '11 to 1', 'Hub Room', 'Friday', '2026-09-18'::date),
    ('Emanuel', 'RAUL', '3 to 4', 'Hub Room', 'Friday', '2026-09-18'::date)
) as v(client_name, instructors, time_slot, area, day, session_date);

-- 3) Thu 17 offs: Roberto, Luliya, Michelle, Youssef
insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
select
  d.name_key,
  coalesce(sp.full_name, initcap(d.name_key)),
  sp.id,
  '2026-09-17'::date,
  'Time off — DC closed for staff (Fadi away week; Raul+Victor Office only)'
from (
  values ('roberto'), ('luliya'), ('michelle'), ('youssef')
) as d(name_key)
left join public.staff_profiles sp on lower(sp.username) = d.name_key
on conflict (name_key, off_date) do update
set
  reason = excluded.reason,
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name;

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

-- Verify
select 'fadi_active' as kind, count(*)::text as n
from public.schedule_overrides
where status = 'active'
  and override_type = 'client_absence_announced'
  and anchor_client_id = 'fadi'
  and session_date >= '2026-09-01' and session_date < '2026-09-21'
union all
select 'dc_rows_' || session_date::text, count(*)::text
from public.portal_roster_rows
where status = 'active'
  and session_date in (
    '2026-09-11','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18'
  )
  and lower(coalesce(service,'')) like '%day centre%'
group by session_date
union all
select 'thu_off', string_agg(name_key, ',')
from public.staff_unavailability
where off_date = '2026-09-17'
  and name_key in ('roberto','luliya','michelle','youssef')
order by 1;
