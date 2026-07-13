-- Javier Marquez: day off 2026-07-01 (did not work; slots covered by reassign).
-- Live MADRE cleared via patch-javier-jul1-dayoff-jul9-ayman.mjs (ghost Ayman Jul 9 too).

begin;

insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
values (
  'javier',
  'Javier Marquez',
  '688afb7d-d5ad-4c9b-a04f-e28ddccda91f',
  '2026-07-01',
  'Time off requested — Planned Absence'
)
on conflict (name_key, off_date)
do update set
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name,
  reason = excluded.reason;

commit;
