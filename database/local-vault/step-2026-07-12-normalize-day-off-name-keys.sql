-- Normalize staff_unavailability.name_key to portal username when staff_id is known.
-- Fixes Staff & HR "Days off" empty for Berta (bertatrapero vs bertatraperocasado / berta)
-- and aligns Michelle / Javier / Youssef / etc. with roster + timesheet keys.

begin;

-- Drop slug-key rows when a username-key row already exists for the same person+date.
delete from public.staff_unavailability u
using public.staff_profiles sp, public.staff_unavailability keep
where u.staff_id = sp.id
  and keep.staff_id = u.staff_id
  and keep.off_date = u.off_date
  and keep.id <> u.id
  and nullif(trim(sp.username), '') is not null
  and lower(trim(keep.name_key)) = lower(trim(sp.username))
  and lower(trim(u.name_key)) is distinct from lower(trim(sp.username));

-- Rename remaining rows to username (unique is name_key+off_date).
update public.staff_unavailability u
set name_key = lower(trim(sp.username))
from public.staff_profiles sp
where u.staff_id = sp.id
  and nullif(trim(sp.username), '') is not null
  and lower(trim(u.name_key)) is distinct from lower(trim(sp.username))
  and not exists (
    select 1
    from public.staff_unavailability x
    where x.name_key = lower(trim(sp.username))
      and x.off_date = u.off_date
      and x.id <> u.id
  );

commit;

-- Check:
-- select name_key, staff_name, off_date, reason
-- from public.staff_unavailability
-- where off_date between '2026-06-01' and '2026-07-31'
-- order by off_date, name_key;
