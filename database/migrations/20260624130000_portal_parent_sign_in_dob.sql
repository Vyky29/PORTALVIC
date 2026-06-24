-- Parent portal sign-in: parent/carer name + participant date of birth (DDMMYYYY).
-- Replaces phone + OTP matching for portal_parent_match_identity.

begin;

create or replace function public.portal_parent_parse_dob_input(p text)
returns date
language plpgsql
immutable
as $$
declare
  s text;
  d int;
  m int;
  y int;
begin
  s := regexp_replace(coalesce(trim(p), ''), '\D', '', 'g');
  if length(s) <> 8 then
    return null;
  end if;
  d := substring(s from 1 for 2)::int;
  m := substring(s from 3 for 2)::int;
  y := substring(s from 5 for 4)::int;
  return make_date(y, m, d);
exception
  when others then
    return null;
end;
$$;

comment on function public.portal_parent_parse_dob_input(text) is
  'Parse participant DOB from DDMMYYYY digits (e.g. 29031988 → 1988-03-29).';

create or replace function public.portal_parent_match_identity_dob(
  p_parent_name      text,
  p_participant_dob  text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select
      public.portal_normalize_full_name(p_parent_name) as fn_norm,
      public.portal_parent_parse_dob_input(p_participant_dob) as dob_parsed
  ),
  candidates as (
    select distinct c.parent_person_id
    from public.portal_parent_contacts c, norm
    where norm.fn_norm <> ''
      and norm.dob_parsed is not null
      and c.dob_iso = norm.dob_parsed
      and (
        public.portal_normalize_full_name(c.parent_display) = norm.fn_norm
        or public.portal_normalize_full_name(
             trim(coalesce(c.parent_first_name, '') || ' ' || coalesce(c.parent_last_name, ''))
           ) = norm.fn_norm
      )
    limit 2
  ),
  agg as (
    select array_agg(parent_person_id) as ids, count(*) as n
    from candidates
  )
  select case when n = 1 then ids[1] else null end
  from agg;
$$;

revoke all on function public.portal_parent_match_identity_dob(text, text) from public;
revoke all on function public.portal_parent_match_identity_dob(text, text) from anon;
revoke all on function public.portal_parent_match_identity_dob(text, text) from authenticated;
grant execute on function public.portal_parent_match_identity_dob(text, text) to service_role;

comment on function public.portal_parent_match_identity_dob(text, text) is
  'Match parent/carer name + participant DOB; returns parent_person_id or NULL (service_role only).';

commit;
