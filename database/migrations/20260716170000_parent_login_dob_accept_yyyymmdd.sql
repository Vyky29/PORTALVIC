-- Parent portal login DOB: accept DDMMYYYY (preferred) and YYYYMMDD (ISO-style).
-- Some office WhatsApp notes sent DOB as 20220808; the form asks for 08082022.

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
  parsed date;
begin
  s := regexp_replace(coalesce(trim(p), ''), '\D', '', 'g');
  if length(s) <> 8 then
    return null;
  end if;

  -- Preferred UI format: DDMMYYYY
  begin
    d := substring(s from 1 for 2)::int;
    m := substring(s from 3 for 2)::int;
    y := substring(s from 5 for 4)::int;
    parsed := make_date(y, m, d);
    if parsed is not null then
      return parsed;
    end if;
  exception
    when others then
      parsed := null;
  end;

  -- Also accept YYYYMMDD (e.g. 20220808 from registration / WhatsApp notes)
  begin
    y := substring(s from 1 for 4)::int;
    m := substring(s from 5 for 2)::int;
    d := substring(s from 7 for 2)::int;
    return make_date(y, m, d);
  exception
    when others then
      return null;
  end;
end;
$$;

comment on function public.portal_parent_parse_dob_input(text) is
  'Parse parent-portal login DOB: DDMMYYYY preferred, YYYYMMDD also accepted.';
