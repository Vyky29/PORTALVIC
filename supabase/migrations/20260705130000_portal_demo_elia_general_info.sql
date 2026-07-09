-- Demo general information for Elia Matilla (family portal preview).
-- contact_id: elia-matilla-demo

begin;

insert into public.portal_participant_general_info (
  contact_id,
  general_info_sheet,
  updated_at,
  updated_by_parent_person_id
)
values (
  'elia-matilla-demo',
  $sheet$1. Age: 13 years
2. Medical: Mild asthma — salbutamol inhaler kept in bag (used rarely). Allergies: None. Regular medication: Salbutamol inhaler as needed
3. Likes/Motivators: Swimming, music, Lego, praise and high-fives, water play
4. Dislikes/Avoids: Loud sudden noises, long waiting without a visual timer, crowded changing rooms
5. Known Triggers: Loud or unexpected noise; Transitions or changes to routine; Waiting or delays
6. Regulation Strategies: Movement / space to pace or jump; Quiet space or break; Visual support; Supportive adult staying nearby
7. Level of Support: 1to1. Needs adult nearby and occasional guidance when dysregulated
8. Communication: Verbal – limited words or scripts; Gestural or non-verbal cues
9. Preferred Communication: Visual support needed. First/then boards, short step instructions, and calm tone
10. Mobility: Walks independently
11. Personal Care: Fully independent (toileting, dressing)
12. Task Engagement: Needs 1:1 support to complete most activities
13. Transitions/Flexibility: Struggles with unexpected changes or waiting time
14. Safety: Understands basic safety rules
15. Other Notes: Thrives in pool sessions; give a 2-minute warning before end of activity. EHCP in progress.$sheet$,
  now(),
  'parent-victor-matilla-demo'
)
on conflict (contact_id) do update set
  general_info_sheet = excluded.general_info_sheet,
  updated_at = excluded.updated_at,
  updated_by_parent_person_id = excluded.updated_by_parent_person_id;

commit;
