-- Staff manually typed "Adam A" / "Adam" for Adam Abed (roster: Adam Ab).
-- Rename only on session days where Adam Ab is on roster or already has correct feedback.
-- Does not touch Adaam/Aadam Ah or other Adams (Adam Pi, Adam Me, …).

begin;

create temporary table _portal_adam_ab_session_dates on commit drop as
select distinct session_date as d
from public.portal_roster_rows
where lower(trim(client_name)) = 'adam ab'
union
select distinct session_date
from public.session_feedback
where lower(trim(client_name)) = 'adam ab';

update public.session_feedback sf
set
  client_name = 'Adam Ab',
  portal_session_key = case
    when coalesce(trim(sf.portal_session_key), '') = '' then sf.portal_session_key
    else regexp_replace(
      regexp_replace(
        sf.portal_session_key,
        '(^|\|)adam_a\.?(?=\||$)',
        '\1adam_ab',
        'gi'
      ),
      '(^|\|)adam(?=\||$)',
      '\1adam_ab',
      'g'
    )
  end
from _portal_adam_ab_session_dates d
where sf.session_date = d.d
  and lower(trim(sf.client_name)) in ('adam', 'adam a', 'adam a.');

update public.lead_session_reports lr
set
  client_name = 'Adam Ab',
  portal_session_key = case
    when coalesce(trim(lr.portal_session_key), '') = '' then lr.portal_session_key
    else regexp_replace(
      regexp_replace(
        lr.portal_session_key,
        '(^|\|)adam_a\.?(?=\||$)',
        '\1adam_ab',
        'gi'
      ),
      '(^|\|)adam(?=\||$)',
      '\1adam_ab',
      'g'
    )
  end
from _portal_adam_ab_session_dates d
where lr.session_date = d.d
  and lower(trim(coalesce(lr.client_name, ''))) in ('adam', 'adam a', 'adam a.');

update public.portal_participant_achievement_photos p
set
  client_name = 'Adam Ab',
  client_id = 'adam_ab',
  portal_session_key = case
    when coalesce(trim(p.portal_session_key), '') = '' then p.portal_session_key
    else regexp_replace(
      regexp_replace(
        p.portal_session_key,
        '(^|\|)adam_a\.?(?=\||$)',
        '\1adam_ab',
        'gi'
      ),
      '(^|\|)adam(?=\||$)',
      '\1adam_ab',
      'g'
    )
  end
from _portal_adam_ab_session_dates d
where p.session_date = d.d
  and lower(trim(p.client_name)) in ('adam', 'adam a', 'adam a.');

commit;
