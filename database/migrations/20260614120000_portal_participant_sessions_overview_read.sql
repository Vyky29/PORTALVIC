-- Staff/lead on a participant's roster can read session feedback + incidents from all workers for that client.

begin;

create or replace function public.portal_normalize_client_slug(p text)
returns text
language sql
immutable
as $$
  select trim(both '_' from lower(regexp_replace(coalesce(trim(p), ''), '[^a-zA-Z0-9]+', '_', 'g')));
$$;

create or replace function public.portal_staff_has_participant_on_roster(
  p_client_id text,
  p_client_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
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

revoke all on function public.portal_staff_has_participant_on_roster(text, text) from public;
grant execute on function public.portal_staff_has_participant_on_roster(text, text) to authenticated;

drop policy if exists "session_feedback_select_roster_peer" on public.session_feedback;
create policy "session_feedback_select_roster_peer"
on public.session_feedback
for select
to authenticated
using (
  public.portal_staff_has_participant_on_roster(client_id, client_name)
);

drop policy if exists "incident_reports_select_roster_peer" on public.incident_reports;
create policy "incident_reports_select_roster_peer"
on public.incident_reports
for select
to authenticated
using (
  public.portal_staff_has_participant_on_roster(client_id, client_name)
);

commit;
