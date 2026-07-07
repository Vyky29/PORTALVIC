-- Notify a participant's instructor team when an incident is logged for them.
--
-- When a row is inserted into public.incident_reports for a PARTICIPANT, every
-- instructor who works with that participant on the active roster (their "team")
-- gets a targeted staff announcement (delivery_scope = 'single_user'). The existing
-- portal-push-dispatch-announcement webhook turns each announcement into a Web Push
-- + in-app notice, so team members stay aware even if another instructor logged it.
--
-- Team members already have READ access to the incident + relevant information via
-- policies session_feedback_select_roster_peer / incident_reports_select_roster_peer
-- (migration 20260614120000). This migration only adds the *notification* fan-out.
--
-- No new Edge Function or Dashboard webhook is required: it reuses the announcements
-- pipeline. Staff-injury incidents (subject_type = 'staff') do NOT notify the team.

begin;

-- 1) Inverse of portal_staff_has_participant_on_roster: list every instructor
--    (staff_profiles.id = auth user id) on a participant's active roster rows.
create or replace function public.portal_participant_team_user_ids(
  p_client_id text,
  p_client_name text
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  norm_cname text;
  norm_cid text;
  instr_blob text;
begin
  norm_cname := lower(trim(coalesce(p_client_name, '')));
  norm_cid := public.portal_normalize_client_slug(p_client_id);

  if norm_cname = '' and norm_cid = '' then
    return;
  end if;

  -- All instructor strings for this participant's active roster rows, space-padded
  -- so token LIKE matches stay inside a single roster cell.
  select string_agg(' ' || lower(coalesce(r.instructors, '')) || ' ', ' | ')
    into instr_blob
  from public.portal_roster_rows r
  where r.status = 'active'
    and (
      (norm_cname <> '' and lower(trim(r.client_name)) = norm_cname)
      or (norm_cid <> '' and public.portal_normalize_client_slug(r.client_name) = norm_cid)
    );

  if instr_blob is null or btrim(instr_blob) = '' then
    return;
  end if;

  return query
  select sp.id
  from public.staff_profiles sp
  where sp.is_active
    and (
      (nullif(lower(trim(sp.username)), '') is not null
        and instr_blob like '%' || lower(trim(sp.username)) || '%')
      or (nullif(lower(trim(split_part(coalesce(sp.full_name, sp.username, ''), ' ', 1))), '') is not null
        and instr_blob like '%' || lower(trim(split_part(coalesce(sp.full_name, sp.username, ''), ' ', 1))) || '%')
      or (nullif(lower(trim(sp.full_name)), '') is not null
        and instr_blob like '%' || lower(trim(sp.full_name)) || '%')
    );
end;
$$;

revoke all on function public.portal_participant_team_user_ids(text, text) from public;
grant execute on function public.portal_participant_team_user_ids(text, text) to authenticated, service_role;

comment on function public.portal_participant_team_user_ids(text, text) is
  'Auth ids of all instructors on a participant''s active roster (inverse of portal_staff_has_participant_on_roster). Used to notify the team on incident insert.';

-- 2) On incident insert, create one targeted announcement per team member (except
--    the instructor who logged it). SECURITY DEFINER so it can insert regardless of
--    the incident submitter's RLS. Wrapped so a failure never blocks the incident.
create or replace function public.portal_incident_notify_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_id uuid;
  participant_label text;
  reporter_label text;
  notice_body text;
begin
  -- Participant incidents only; staff-injury incidents do not fan out to the team.
  if coalesce(lower(trim(new.subject_type)), 'participant') = 'staff' then
    return new;
  end if;

  participant_label := nullif(btrim(coalesce(new.client_name, '')), '');
  if participant_label is null then
    participant_label := 'un participante';
  end if;
  reporter_label := nullif(btrim(coalesce(new.submitted_by_name, '')), '');

  notice_body := 'Se ha registrado un incidente con ' || participant_label ||
    case when reporter_label is not null then ' (por ' || reporter_label || ')' else '' end ||
    '. Ábrelo para revisarlo.';

  for team_id in
    select uid from public.portal_participant_team_user_ids(new.client_id, new.client_name) as uid
  loop
    -- Do not notify the instructor who logged the incident.
    if new.submitted_by_user_id is not null and team_id = new.submitted_by_user_id then
      continue;
    end if;

    insert into public.portal_staff_announcements
      (created_by, title, body, message_type, priority, audience_scope, delivery_scope, target_user_id, ends_at)
    values
      (coalesce(new.submitted_by_user_id, team_id),
       'Incidente en tu equipo',
       notice_body,
       'incident_team',
       'high',
       'all_staff',
       'single_user',
       team_id,
       now() + interval '30 days');
  end loop;

  return new;
exception when others then
  raise warning 'portal_incident_notify_team failed for incident %: %', new.id, sqlerrm;
  return new;
end;
$$;

comment on function public.portal_incident_notify_team() is
  'AFTER INSERT on incident_reports: notify the participant''s instructor team (single_user announcements → push + in-app). Participant incidents only; never blocks the incident insert.';

drop trigger if exists "portal-incident-notify-team" on public.incident_reports;
create trigger "portal-incident-notify-team"
after insert on public.incident_reports
for each row
execute function public.portal_incident_notify_team();

commit;
