-- Feedback announcement: exact staff copy (written/voice, no AI filter).
-- Old Filter-with-AI notice stays ended. Unsigned staff see this body when they open it.

begin;

update public.portal_staff_announcements
set ends_at = coalesce(ends_at, now())
where id = 'a0270301-0001-4000-8000-00000a270301'::uuid
  and (ends_at is null or ends_at > now());

update public.portal_staff_announcements
set
  title = 'NEW session feedback — written or voice (no AI filter)',
  body = E'Session feedback has changed. Please read this carefully, then sign below to confirm.

HOW TO SUBMIT FEEDBACK
1. Open feedback from the ORANGE session card on Today (it pre-fills the participant).
2. Rate Engagement (1–5 stars).
3. Select emotions/regulation and independence — all that apply.
4. Session narrative in English (Reception · Session · Handover). There are TWO ways:
• Written — type it yourself
• Voice — speak it; the portal transcribes it to English
5. After that, you can use any spell-checker or editor to fix spelling, wording and structure. There is NO Filter with AI on your form any more.
6. Notes are optional. If you have nothing internal to add for the office, leave Notes blank.
7. Tap Submit. The card turns green.

WHAT HAPPENS NEXT
Admin reviews what you submitted. If vocabulary is not appropriate for families, admin filters or edits it before parents see it.',
  message_type = 'announcement',
  priority = 'high',
  audience_scope = 'all_staff',
  delivery_scope = 'everyone',
  ends_at = null
where id = 'a0270312-0001-4000-8000-00000a270312'::uuid;

commit;
