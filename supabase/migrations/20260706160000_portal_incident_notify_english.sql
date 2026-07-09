-- Incident notifications must be in ENGLISH (staff dashboard language).
--
-- The two notifier functions from 20260706130000 emitted Spanish titles/bodies
-- ("Incidente en tu equipo", "Se ha registrado un incidente...", etc.). This
-- migration re-creates both with English copy. Logic is unchanged: at-incident
-- push to the owner(s) minus the reporter, and on-encounter alerts to whoever
-- teaches a child that already had an incident. De-dup via related_incident_id.

begin;

-- At-incident push → OWNER only (minus reporter), de-duplicated (English) ------
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
  if coalesce(lower(trim(new.subject_type)), 'participant') = 'staff' then
    return new;
  end if;

  participant_label := coalesce(nullif(btrim(coalesce(new.client_name, '')), ''), 'a participant');
  reporter_label := nullif(btrim(coalesce(new.submitted_by_name, '')), '');

  notice_body := 'An incident has been logged for ' || participant_label ||
    case when reporter_label is not null then ' (by ' || reporter_label || ')' else '' end ||
    '. Open it to review.';

  for team_id in
    select uid from public.portal_participant_owner_user_ids(new.client_id, new.client_name) as uid
  loop
    if new.submitted_by_user_id is not null and team_id = new.submitted_by_user_id then
      continue;
    end if;

    if exists (
      select 1 from public.portal_staff_announcements a
      where a.related_incident_id = new.id
        and a.target_user_id = team_id
    ) then
      continue;
    end if;

    insert into public.portal_staff_announcements
      (created_by, title, body, message_type, priority, audience_scope,
       delivery_scope, target_user_id, related_incident_id, ends_at)
    values
      (coalesce(new.submitted_by_user_id, team_id),
       'Incident in your team',
       notice_body,
       'incident_team',
       'high',
       'all_staff',
       'single_user',
       team_id,
       new.id,
       now() + interval '30 days');
  end loop;

  return new;
exception when others then
  raise warning 'portal_incident_notify_team failed for incident %: %', new.id, sqlerrm;
  return new;
end;
$$;

comment on function public.portal_incident_notify_team() is
  'AFTER INSERT on incident_reports: push the participant OWNER(s) (predominant instructors), except the reporter. Participant incidents only; de-duplicated by related_incident_id; never blocks the insert. English copy.';

-- On-encounter alert: teaching a child with a past incident (English) ----------
create or replace function public.portal_session_feedback_incident_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inc record;
  norm_cname text;
  norm_cid text;
  participant_label text;
  notice_body text;
begin
  if new.submitted_by_user_id is null then
    return new;
  end if;

  norm_cname := lower(trim(coalesce(new.client_name, '')));
  norm_cid := public.portal_normalize_client_slug(coalesce(new.client_id, new.client_name));
  if norm_cname = '' and norm_cid = '' then
    return new;
  end if;

  for inc in
    select ir.id, ir.client_name, ir.session_date, ir.submitted_by_user_id
    from public.incident_reports ir
    where coalesce(lower(trim(ir.subject_type)), 'participant') <> 'staff'
      and ir.session_date <= new.session_date
      and (
        (norm_cname <> '' and lower(trim(ir.client_name)) = norm_cname)
        or (norm_cid <> ''
            and public.portal_normalize_client_slug(coalesce(ir.client_id, ir.client_name)) = norm_cid)
      )
  loop
    if new.submitted_by_user_id = inc.submitted_by_user_id then
      continue;
    end if;

    if exists (
      select 1 from public.portal_staff_announcements a
      where a.related_incident_id = inc.id
        and a.target_user_id = new.submitted_by_user_id
    ) then
      continue;
    end if;

    participant_label := coalesce(nullif(btrim(coalesce(inc.client_name, '')), ''), 'This participant');
    notice_body := participant_label || ' had an incident on ' ||
      to_char(inc.session_date, 'DD/MM/YYYY') ||
      '. Open and read it to stay informed.';

    insert into public.portal_staff_announcements
      (created_by, title, body, message_type, priority, audience_scope,
       delivery_scope, target_user_id, related_incident_id, ends_at)
    values
      (new.submitted_by_user_id,
       'Previous incident for a participant',
       notice_body,
       'incident_encounter',
       'high',
       'all_staff',
       'single_user',
       new.submitted_by_user_id,
       inc.id,
       now() + interval '60 days');
  end loop;

  return new;
exception when others then
  raise warning 'portal_session_feedback_incident_alert failed for feedback %: %', new.id, sqlerrm;
  return new;
end;
$$;

comment on function public.portal_session_feedback_incident_alert() is
  'AFTER INSERT on session_feedback: if the participant already had an incident (on/before this session), alert this instructor once per incident (covers/makeups/future overrides). Excludes the reporter; de-duplicated by related_incident_id; never blocks the insert. English copy.';

commit;
