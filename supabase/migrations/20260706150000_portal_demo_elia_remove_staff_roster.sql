-- Remove demo participant "Elia" (Victor Matilla) from the staff-facing roster.
--
-- Elia is a parent-portal-only mock created to preview the family experience
-- (see 20260704160000_portal_reenrol_demo_elia_matilla.sql). Those roster sample
-- rows leaked onto instructor dashboards (e.g. Roberto — Tue 7–8, Youssef — Sun
-- 3–4:30), so instructors were seeing a fake participant.
--
-- This deletes ONLY the mock's roster override rows. Parent-portal demo data is
-- intentionally kept: portal_parent_contacts, portal_participants,
-- portal_participant_general_info, client_payments, and any re-enrolment rows.
-- Staff records (staff_profiles / auth users) are NOT touched.

begin;

delete from public.portal_roster_rows
where lower(trim(client_name)) = 'elia';

commit;
