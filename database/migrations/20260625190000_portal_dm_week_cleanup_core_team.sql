-- Purge portal staff DMs from the current ISO week (Europe/London).
-- Keeps only messages sent TODAY in threads where BOTH participants are the core team:
-- Raúl, Victor, Sevitha, Javier, Michelle, John, Javi.
-- Run once in Supabase SQL editor on the Portal project.

begin;

create temporary table _portal_dm_cleanup_allowed on commit drop as
select sp.id
from public.staff_profiles sp
where lower(coalesce(sp.username, '')) in (
  'raul', 'raúl', 'victor', 'sevitha', 'javier', 'javi', 'michelle', 'john'
)
or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])raul([[:space:]]|$|[[:punct:]])'
or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])victor([[:space:]]|$|[[:punct:]])'
or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])sevitha([[:space:]]|$|[[:punct:]])'
or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])javier([[:space:]]|$|[[:punct:]])'
or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])javi([[:space:]]|$|[[:punct:]])'
or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])michelle([[:space:]]|$|[[:punct:]])'
or lower(coalesce(sp.full_name, '')) ~ 'john[[:space:]]+kyei';

create temporary table _portal_dm_cleanup_keep_threads on commit drop as
select t.id
from public.portal_staff_dm_threads t
join _portal_dm_cleanup_allowed pa on pa.id = t.participant_a
join _portal_dm_cleanup_allowed pb on pb.id = t.participant_b;

with bounds as (
  select
    date_trunc('week', now() at time zone 'Europe/London') as week_start,
    date_trunc('day', now() at time zone 'Europe/London') as today_start
)
delete from public.portal_staff_dm_messages m
using bounds b
where m.created_at >= b.week_start
  and not (
    m.created_at >= b.today_start
    and m.thread_id in (select id from _portal_dm_cleanup_keep_threads)
  );

with bounds as (
  select date_trunc('week', now() at time zone 'Europe/London') as week_start
)
delete from public.portal_staff_dm_threads t
using bounds b
where t.updated_at >= b.week_start
  and not exists (
    select 1
    from public.portal_staff_dm_messages m
    where m.thread_id = t.id
  );

commit;