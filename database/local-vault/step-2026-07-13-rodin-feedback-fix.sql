-- Rodin parent portal Sessions Overview corrections (live Portal DB).
-- Applied 2026-07-13 via service role.
--
-- 1) 2026-06-21 Climbing Westway (Bismark): engagement 3★, green+yellow faces
-- 2) 2026-05-17 Climbing + Aquatic: fill missing session_time from usual slots

update public.session_feedback
set
  engagement_rating = 3,
  client_emotions = 'Happy/Excited; Anxious'
where id = '00df5108-5462-4ea8-ad40-742e888f330e'
  and client_name = 'Rodin'
  and session_date = '2026-06-21'
  and service = 'Climbing Activity';

update public.session_feedback
set session_time = '1 to 2'
where id = 'fb1db8b0-fcb6-4d92-be74-330f9b0f3f13'
  and client_name = 'Rodin'
  and session_date = '2026-05-17'
  and service = 'Climbing Activity';

update public.session_feedback
set session_time = '2 to 2.30'
where id = '46250ba8-a38b-48dc-ace1-28395ece89d9'
  and client_name = 'Rodin'
  and session_date = '2026-05-17'
  and service = 'Aquatic Activity';
