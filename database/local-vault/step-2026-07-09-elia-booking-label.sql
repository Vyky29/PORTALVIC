update public.portal_re_enrolment_submissions
set payload = jsonb_set(
  payload,
  '{weekly_slots_snapshot}',
  '[
    {
      "id": "demo-elia-50",
      "raw": "30'' SW (Tuesday)",
      "serviceType": "AQUATIC ACTIVITY",
      "durationMin": 30,
      "day": "Tuesday",
      "isWeekend": false,
      "isDayCentre": false,
      "pricePerSession": 50,
      "sessions": {"autumn": 1, "spring": 0, "summer": 0, "annual": 1},
      "termTotals": {"autumn": 50, "spring": 0, "summer": 0, "annual": 50},
      "venue": "Acton Centre",
      "timeSlot": "19:00–19:30",
      "displayLabel": "30'' Aquatic Activity · Tuesday 19:00–19:30 · Acton Centre"
    }
  ]'::jsonb
)
where id = '0ed33158-4b4b-4bcc-8dd4-4d19a0b43ff7';

select payload->'weekly_slots_snapshot'->0->>'displayLabel' as label
from public.portal_re_enrolment_submissions
where id = '0ed33158-4b4b-4bcc-8dd4-4d19a0b43ff7';
