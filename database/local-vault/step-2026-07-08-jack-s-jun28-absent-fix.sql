-- Jack S Sun 28 Jun 2026: absent all day (Bismark hub quick mark). A prior fix wrongly
-- re-labelled Luliya pool feedback as Bismark present — remove it.
-- Also revert Samer slot_clear_client (Samer was taught: Luliya pool 9:30, Giuseppe hub 10:15).
-- CLI updates need trigger disabled (schedule_overrides_set_updated_trg sets updated_by := auth.uid()).

begin;

delete from public.session_feedback
where id = '76a91dc5-2117-4104-8eaf-c25613075b94'
  and session_date = '2026-06-28'
  and client_name = 'Jack S';

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set status = 'cancelled',
    updated_at = now(),
    updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid,
    reason = trim(both ' ' from coalesce(reason, '') || ' [2026-07-08 reverted: Samer taught; Jack S absent — see split-slot absence rule]')
where session_date = '2026-06-28'
  and anchor_client_id = 'samer'
  and override_type = 'slot_clear_client'
  and anchor_staff_id = 'bismark'
  and status = 'active';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

-- Jack S absent authority (unchanged): portal_staff_session_quick_marks
--   Bismark  2026-06-28|09:30|jack_s|hub_room  (support worker hub 45')
--   Roberto  2026-06-28|10:00|jack_s|big_pool   (swimming instructor pool 45')
--   Giuseppe 2026-06-28|09:30|jack_s|hub_room   (roster anchor — same absent outcome)
