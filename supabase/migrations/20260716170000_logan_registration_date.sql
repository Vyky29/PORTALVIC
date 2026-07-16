-- Logan Hibbitts joined mid-term (registered 11 May 2026).
-- Parent hub chips use registration_date so projected weekdays before start are hidden.
update public.portal_parent_contacts
set registration_date = date '2026-05-11'
where contact_id = 'gap-logan-hibbitts'
  and (registration_date is null or registration_date <> date '2026-05-11');
