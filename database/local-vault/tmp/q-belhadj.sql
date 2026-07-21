select participant_name,
       participant_contact_id,
       submitted_at::text,
       jsonb_pretty(payload) as payload
from portal_re_enrolment_submissions
where participant_name ilike '%belhadj%'
order by submitted_at desc;
