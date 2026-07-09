-- Fill missing staff_profiles.nationality (mic hints + HR self-service).

begin;

update public.staff_profiles
set nationality = 'Spanish'
where lower(trim(username)) in ('arranz', 'raul', 'teflon', 'victor')
  and (nationality is null or trim(nationality) = '');

update public.staff_profiles
set nationality = 'British'
where lower(trim(username)) in ('michelle', 'sevitha')
  and (nationality is null or trim(nationality) = '');

commit;
