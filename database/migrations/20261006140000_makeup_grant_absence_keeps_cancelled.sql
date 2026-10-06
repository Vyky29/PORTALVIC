-- A cancelled makeup can keep the original absence, and the replacement
-- grant for that same missed day can point at it too.

drop index if exists public.portal_parent_makeup_grants_absence_unique_idx;

create unique index if not exists portal_parent_makeup_grants_absence_unique_idx
  on public.portal_parent_makeup_grants (absence_report_id)
  where absence_report_id is not null
    and status not in ('cancelled', 'forfeited');
