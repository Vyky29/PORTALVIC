-- The roster-peer read policy calls this function, which used to SELECT
-- session_feedback while that table's own policy was running. Staff then got
-- an error and Sessions Overview fell back to the June export.

begin;

create or replace function public.portal_staff_has_participant_on_roster(
  p_client_id text,
  p_client_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  sp record;
  norm_cname text;
  norm_cid text;
  staff_tokens text[];
  tok text;
begin
  select id, username, full_name, app_role
    into sp
  from public.staff_profiles
  where id = auth.uid();

  if not found then
    return false;
  end if;

  if sp.app_role in ('admin', 'ceo', 'lead') then
    return true;
  end if;

  norm_cname := lower(trim(coalesce(p_client_name, '')));
  norm_cid := public.portal_normalize_client_slug(p_client_id);

  if norm_cname = '' and norm_cid = '' then
    return false;
  end if;

  if exists (
    select 1
    from public.session_feedback sf
    where sf.submitted_by_user_id = sp.id
      and (
        (norm_cname <> '' and lower(trim(sf.client_name)) = norm_cname)
        or (norm_cid <> ''
            and public.portal_normalize_client_slug(coalesce(sf.client_id, sf.client_name)) = norm_cid)
      )
  ) then
    return true;
  end if;

  staff_tokens := array_remove(array[
    lower(trim(coalesce(sp.username, ''))),
    lower(trim(split_part(coalesce(sp.full_name, sp.username, ''), ' ', 1))),
    lower(trim(coalesce(sp.full_name, '')))
  ], '');

  foreach tok in array staff_tokens loop
    if exists (
      select 1
      from public.portal_roster_rows r
      where r.status = 'active'
        and (
          (norm_cname <> '' and lower(trim(r.client_name)) = norm_cname)
          or (norm_cid <> '' and public.portal_normalize_client_slug(r.client_name) = norm_cid)
        )
        and lower(r.instructors) like '%' || tok || '%'
    ) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.portal_staff_has_participant_on_roster(text, text) is
  'True if the caller works with the participant (taught them, or is on their active roster, or is admin/ceo/lead). row_security off so the session_feedback lookup does not re-enter the roster-peer policy.';

commit;
