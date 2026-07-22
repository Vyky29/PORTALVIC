-- Align booking lead identity with registration form field parent_name.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'portal_booking_leads'
      and column_name = 'first_name'
  ) then
    alter table public.portal_booking_leads rename column first_name to parent_name;
  end if;
end $$;

comment on column public.portal_booking_leads.parent_name is
  'Parent/carer full name — same meaning as parent_registration.parent_name (not the participant).';

commit;
