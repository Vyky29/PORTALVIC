-- Purge portal staff DMs from the current ISO week (Europe/London).
-- KEEPS messages only in this window (London time):
--   2026-06-07 08:30 → 2026-06-07 23:00
-- in threads where BOTH participants are in the keep roster:
--   Raúl, Victor, Dan, John, Javier (staff), Carlos, Michelle, Javi (CEO), Aurora, Sevitha.
--
-- Run the whole script at once in Supabase SQL editor.
-- NOTE: If you already ran the old "keep TODAY" version, June 7 messages may already be
-- gone — this script cannot restore deleted rows (only Supabase PITR backup could).

begin;

with allowed as (
  select sp.id
  from public.staff_profiles sp
  where lower(coalesce(sp.username, '')) in (
    'raul', 'victor', 'dan', 'john', 'javier', 'carlos', 'michelle', 'javi', 'aurora', 'sevitha'
  )
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])raul([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])victor([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])dan([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])carlos([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])michelle([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])aurora([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])sevitha([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ '(^|[[:space:]])javi([[:space:]]|$|[[:punct:]])'
  or lower(coalesce(sp.full_name, '')) ~ 'john[[:space:]]+kyei'
  or lower(coalesce(sp.full_name, '')) ~ 'javier[[:space:]]+marquez'
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
    (timestamp '2026-06-07 08:30:00' at time zone 'Europe/London') as keep_from,
    (timestamp '2026-06-07 23:00:00' at time zone 'Europe/London') as keep_until
)
delete from public.portal_staff_dm_messages m
using bounds b
where m.created_at >= b.week_start
  and not (
    m.created_at >= b.keep_from
    and m.created_at <= b.keep_until
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
