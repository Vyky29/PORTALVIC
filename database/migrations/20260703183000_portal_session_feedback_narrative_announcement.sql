-- Mirror of supabase/migrations/20260703183000_portal_session_feedback_narrative_announcement.sql

begin;

insert into public.portal_staff_announcements (
  id,
  created_by,
  title,
  body,
  message_type,
  priority,
  audience_scope,
  delivery_scope
)
select
  'a0270301-0001-4000-8000-00000a270301'::uuid,
  u.id,
  'NEW session feedback — narrative + Filter with AI',
  E'Session feedback has changed. Please read this carefully, then sign below to confirm.

HOW TO SUBMIT FEEDBACK
1. Open feedback from the ORANGE session card on Today (it pre-fills the participant).
2. Rate Engagement (1–5 stars).
3. Select emotions/regulation and independence — all that apply.
4. Write your Session narrative in English:
   • Reception — arrival and parent handover
   • Session — plan, strategies, challenges, what worked
   • Handover — what you told the family
   You can type or use the microphone (optional in Settings).
5. Tap Filter with AI — it fills Positive feedback (family app) and Relevant information (admin only).
6. Review both fields. If you edit the narrative, run Filter with AI again.
7. Tap Submit. The card turns green.

Submit is blocked until Filter with AI has run successfully.

FULL GUIDE WITH PICTURES
Quick menu → Settings → Staff help guide → Session feedback (NEW — narrative + Filter with AI).
Or tap the club logo → open the guide link from Portal help.

If you still see the old form, close the portal app completely and open it again.

Mark Absent from the session card if the participant did not attend — no separate feedback needed.',
  'announcement',
  'high',
  'all_staff',
  'everyone'
from auth.users u
where u.id in (
  select id from public.staff_profiles
  where lower(coalesce(app_role, '')) in ('admin', 'ceo')
  limit 1
)
on conflict (id) do update set
  title = excluded.title,
  body = excluded.body,
  message_type = excluded.message_type,
  priority = excluded.priority,
  audience_scope = excluded.audience_scope,
  delivery_scope = excluded.delivery_scope;

commit;
