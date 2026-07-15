-- Canonical spelling: Emanuel (one m). Legacy "emmanuel" still accepted temporarily where needed.

begin;

-- staff_participant_access: rename allowed slug emmanuel → emanuel
alter table public.staff_participant_access
  drop constraint if exists staff_participant_access_participant_slug_check;

alter table public.staff_participant_access
  add constraint staff_participant_access_participant_slug_check
  check (participant_slug in ('ikram', 'serine', 'ayaan', 'emanuel'));

-- Restore planner access for Luliya / Youssef / Michelle (rows dropped during rename attempt)
insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, 'emanuel'
from public.staff_profiles sp
where sp.is_active = true
  and lower(trim(sp.username)) in ('luliya', 'lulia', 'youssef', 'michelle')
on conflict do nothing;

-- Live roster / feedback / payments display names (idempotent)
update public.portal_roster_rows
set client_name = 'Emanuel', updated_at = now()
where lower(trim(client_name)) = 'emmanuel';

update public.session_feedback
set
  client_name = replace(replace(client_name, 'Emmanuel', 'Emanuel'), 'emmanuel', 'emanuel'),
  client_id = replace(client_id, 'emmanuel', 'emanuel'),
  portal_session_key = replace(portal_session_key, 'emmanuel', 'emanuel'),
  positive_feedback = replace(replace(coalesce(positive_feedback, ''), 'Emmanuel', 'Emanuel'), 'emmanuel', 'emanuel'),
  exceptional_challenges = replace(replace(coalesce(exceptional_challenges, ''), 'Emmanuel', 'Emanuel'), 'emmanuel', 'emanuel'),
  relevant_information = replace(replace(coalesce(relevant_information, ''), 'Emmanuel', 'Emanuel'), 'emmanuel', 'emanuel')
where lower(coalesce(client_name, '')) like '%emmanuel%'
   or lower(coalesce(client_id, '')) like '%emmanuel%'
   or lower(coalesce(portal_session_key, '')) like '%emmanuel%';

update public.portal_participant_owner_counts
set
  client_slug = replace(client_slug, 'emmanuel', 'emanuel'),
  client_name = replace(replace(client_name, 'Emmanuel', 'Emanuel'), 'emmanuel', 'emanuel')
where lower(coalesce(client_slug, '')) like '%emmanuel%'
   or lower(coalesce(client_name, '')) like '%emmanuel%';

update public.client_payments
set
  client_key = replace(client_key, 'emmanuel', 'emanuel'),
  client_name = replace(replace(client_name, 'Emmanuel', 'Emanuel'), 'emmanuel', 'emanuel')
where lower(coalesce(client_key, '')) like '%emmanuel%'
   or lower(coalesce(client_name, '')) like '%emmanuel%';

commit;
