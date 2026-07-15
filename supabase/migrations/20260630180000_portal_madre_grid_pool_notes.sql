-- MADRE grid export (2026-06-14): pool/area notes on existing portal_roster_rows overrides.
begin;

update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Faris')) and trim(time_slot) = '2.30 to 3';
update public.portal_roster_rows set area = 'Small Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Max')) and trim(time_slot) = '2 to 2.30';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Rodin')) and trim(time_slot) = '2 to 2.30';
update public.portal_roster_rows set area = 'Small Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Shaan')) and trim(time_slot) = '2.30 to 3';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Simon')) and trim(time_slot) = '9 to 9.30';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Yoan')) and trim(time_slot) = '2.30 to 3';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Yusuf Ah')) and trim(time_slot) = '9 to 10.15';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-07'::date and lower(trim(client_name)) = lower(trim('Zakariya')) and trim(time_slot) = '2 to 2.30';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Faris')) and trim(time_slot) = '2.30 to 3';
update public.portal_roster_rows set area = 'Small Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Max')) and trim(time_slot) = '2 to 2.30';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Rodin')) and trim(time_slot) = '2 to 2.30';
update public.portal_roster_rows set area = 'Small Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Shaan')) and trim(time_slot) = '2.30 to 3';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Simon')) and trim(time_slot) = '9 to 9.30';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Yoan')) and trim(time_slot) = '2.30 to 3';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Yusuf Ah')) and trim(time_slot) = '9 to 10.15';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-14'::date and lower(trim(client_name)) = lower(trim('Zakariya')) and trim(time_slot) = '2 to 2.30';
update public.portal_roster_rows set area = 'Hub Room', updated_at = now() where status = 'active' and session_date = '2026-06-15'::date and lower(trim(client_name)) = lower(trim('Emanuel')) and trim(time_slot) = '1.30 to 4';
update public.portal_roster_rows set area = 'Hub Room', updated_at = now() where status = 'active' and session_date = '2026-06-15'::date and lower(trim(client_name)) = lower(trim('Emanuel')) and trim(time_slot) = '11 to 12.30';
update public.portal_roster_rows set area = 'Big Pool', updated_at = now() where status = 'active' and session_date = '2026-06-15'::date and lower(trim(client_name)) = lower(trim('Emanuel')) and trim(time_slot) = '12.30 to 1.30';
update public.portal_roster_rows set area = 'Hub Room', updated_at = now() where status = 'active' and session_date = '2026-06-15'::date and lower(trim(client_name)) = lower(trim('Fadi')) and trim(time_slot) = '1.30 to 3';
update public.portal_roster_rows set area = 'Hub Room', updated_at = now() where status = 'active' and session_date = '2026-06-15'::date and lower(trim(client_name)) = lower(trim('Ikram')) and trim(time_slot) = '11 to 12.30';
update public.portal_roster_rows set area = 'Hub Room', updated_at = now() where status = 'active' and session_date = '2026-06-15'::date and lower(trim(client_name)) = lower(trim('Ikram')) and trim(time_slot) = '12.30 to 4';

update public.portal_roster_rows set area = 'Big Pool', updated_at = now()
where status = 'active' and lower(trim(day)) = 'sunday'
  and lower(trim(venue)) in ('swimfarm', 'swim farm')
  and lower(trim(service)) like '%aquatic%'
  and trim(time_slot) in ('2 to 2.30', '2.30 to 3')
  and lower(trim(area)) = 'teaching pool';
commit;
