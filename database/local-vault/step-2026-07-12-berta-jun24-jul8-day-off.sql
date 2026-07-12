-- Berta Trapero Casado: day off 2026-06-24 (requested time off).
-- Jul 8 already recorded via session-disruption validate (name_key bertatraperocasado).
-- Self-read RLS uses staff_id; term calendar also lists both in termStaffAwayDatesByProfileKey.

begin;

insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
values (
  'berta',
  'Berta Trapero Casado',
  '98e2738b-07a0-4cd2-8b7a-a9487d64a292',
  '2026-06-24',
  'Time off requested — Planned Absence'
)
on conflict (name_key, off_date)
do update set
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name,
  reason = excluded.reason;

commit;

-- Check:
-- select name_key, off_date, reason from public.staff_unavailability
-- where staff_id = '98e2738b-07a0-4cd2-8b7a-a9487d64a292' order by off_date;
