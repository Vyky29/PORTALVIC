-- Purge portal staff DMs from the current ISO week (Europe/London).
-- Keeps only messages sent TODAY in threads where BOTH participants are the core team:
-- Raúl, Victor, Sevitha, Michelle, John, Javi (CEO — username javi; not staff Javier Marquez).
-- Run the whole script at once in Supabase SQL editor (no temp tables — safe if statements split).

begin;

with allowed as (
  select sp.id
  from public.staff_profiles sp
  where lower(coalesce(sp.username, '')) in (
    'raul', 'victor', 'sevitha', 'javi', 'michelle', 'john'
  )
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])raul([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])victor([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])sevitha([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])javi([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])michelle([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ 'john[[:space:]]+kyei'
),
keep_threads as (
  select t.id
  from public.portal_staff_dm_threads t
  join allowed pa on pa.id = t.participant_a
  join allowed pb on pb.id = t.participant_b
),
bounds as (
  select
    date_trunc('week', now() at time zone 'Europe/London') as week_start,
    date_trunc('day', now() at time zone 'Europe/London') as today_start
)
delete from public.portal_staff_dm_messages m
using bounds b
where m.created_at >= b.week_start
  and not (
    m.created_at >= b.today_start
    and m.thread_id in (select id from keep_threads)
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
