-- Incident coverage fix + two-tier notification (owner push / on-encounter alert).
--
-- Problem ("arreglar la cobertura"): the base roster lives in the frontend
-- spreadsheet bundle; the DB only had the OVERRIDE layer (portal_roster_rows).
-- Both the team notifier (portal_participant_team_user_ids) and the roster-peer
-- read policy (portal_staff_has_participant_on_roster) read only that override
-- layer, so they resolved NOBODY for most participants (Tom, Elijah, ...).
--
-- Ground truth for "who actually teaches a child" is session_feedback
-- (submitted_by_user_id per client_id/client_name + session_date). That id is
-- already an auth user id (no token matching), and it captures owners, covers
-- AND makeups (e.g. Roberto giving Elijah a Friday makeup).
--
-- This migration:
--   1) Adds portal_staff_announcements.related_incident_id (link + de-dup).
--   2) portal_participant_owner_user_ids(): predominant instructor(s) from
--      session_feedback = the child's OWNER(s); roster fallback if no feedback.
--   3) Rewrites portal_incident_notify_team() to push the OWNER only (minus the
--      reporter), tagging related_incident_id and de-duplicating.
--   4) Broadens portal_staff_has_participant_on_roster() so anyone who actually
--      taught the child (session_feedback) also gets roster-peer READ access.
--   5) On-encounter alert: portal_session_feedback_incident_alert() fires when
--      any instructor logs a session for a child that already had an incident,
--      notifying that instructor ONCE per incident (covers / makeups / future
--      overrides, e.g. Dan if he covers Elijah again).

begin;

-- 1) Link + de-dup column -----------------------------------------------------
alter table public.portal_staff_announcements
  add column if not exists related_incident_id uuid null
  references public.incident_reports (id) on delete cascade;

comment on column public.portal_staff_announcements.related_incident_id is
  'When set, this announcement is about that incident. Used to link and to avoid notifying the same user about the same incident twice.';

create index if not exists portal_staff_announcements_related_incident_idx
  on public.portal_staff_announcements (related_incident_id, target_user_id)
  where related_incident_id is not null;

-- 2) Owner resolution (predominant instructor from actual sessions) -----------
create or replace function public.portal_participant_owner_user_ids(
  p_client_id text,
  p_client_name text
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select lower(trim(coalesce(p_client_name, ''))) as cname,
           public.portal_normalize_client_slug(p_client_id) as cid
  ),
  counts as (
    select sf.submitted_by_user_id as uid, count(*)::bigint as cnt
    from public.session_feedback sf, norm
    where sf.submitted_by_user_id is not null
      and (
        (norm.cname <> '' and lower(trim(sf.client_name)) = norm.cname)
        or (norm.cid <> ''
            and public.portal_normalize_client_slug(coalesce(sf.client_id, sf.client_name)) = norm.cid)
      )
    group by sf.submitted_by_user_id
  ),
  ranked as (
    select uid, cnt, max(cnt) over () as maxc from counts
  )
  -- Owner(s): instructors with at least half of the top instructor's session
  -- count. Excludes occasional covers (Dan 2 vs Aurora 5), keeps clear
  -- co-owners (e.g. two instructors who share a child roughly equally).
  select r.uid
  from ranked r
  join public.staff_profiles sp on sp.id = r.uid and sp.is_active
  where r.cnt >= 0.5 * r.maxc
  union
  -- Fallback only when there is NO session feedback yet for this child:
  -- use the roster instructors (cannot distinguish owner from cover there).
  select uid
  from public.portal_participant_team_user_ids(p_client_id, p_client_name) as uid
  where not exists (select 1 from counts);
$$;

revoke all on function public.portal_participant_owner_user_ids(text, text) from public;
grant execute on function public.portal_participant_owner_user_ids(text, text) to authenticated, service_role;

comment on function public.portal_participant_owner_user_ids(text, text) is
  'Owner(s) of a participant = predominant instructor(s) by delivered session_feedback count (>= 50%% of the top). Roster fallback when no feedback. Used for the at-incident push.';

-- 3) At-incident push → OWNER only (minus reporter), de-duplicated ------------
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
  -- Participant incidents only; staff-injury incidents do not fan out.
  if coalesce(lower(trim(new.subject_type)), 'participant') = 'staff' then
    return new;
  end if;

  participant_label := coalesce(nullif(btrim(coalesce(new.client_name, '')), ''), 'un participante');
  reporter_label := nullif(btrim(coalesce(new.submitted_by_name, '')), '');

  notice_body := 'Se ha registrado un incidente con ' || participant_label ||
    case when reporter_label is not null then ' (por ' || reporter_label || ')' else '' end ||
    '. Ábrelo para revisarlo.';

  for team_id in
    select uid from public.portal_participant_owner_user_ids(new.client_id, new.client_name) as uid
  loop
    -- Never notify the instructor who logged the incident.
    if new.submitted_by_user_id is not null and team_id = new.submitted_by_user_id then
      continue;
    end if;

    -- De-dup: one notice per (incident, user).
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
       'Incidente en tu equipo',
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
  'AFTER INSERT on incident_reports: push the participant OWNER(s) (predominant instructors), except the reporter. Participant incidents only; de-duplicated by related_incident_id; never blocks the insert.';

-- 4) Broaden roster-peer READ access to "actually taught" ---------------------
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

  -- (a) Actual delivery: the caller has taught this participant (owner, cover
  --     or makeup) per session_feedback. This is the real "coverage" signal and
  --     works even when the child is not in the portal_roster_rows override layer.
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

  -- (b) Roster override layer (unchanged): token match against instructor cells.
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
  'True if the caller works with the participant: (a) has delivered a session_feedback for them (owner/cover/makeup), or (b) is an instructor on their active portal_roster_rows override, or is admin/ceo/lead. Governs roster-peer read of session_feedback + incident_reports.';

-- 5) On-encounter alert: teaching a child with a past incident ----------------
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
    -- The reporter of that incident already knows.
    if new.submitted_by_user_id = inc.submitted_by_user_id then
      continue;
    end if;

    -- Already aware (owner notice or a previous encounter alert for this incident).
    if exists (
      select 1 from public.portal_staff_announcements a
      where a.related_incident_id = inc.id
        and a.target_user_id = new.submitted_by_user_id
    ) then
      continue;
    end if;

    participant_label := coalesce(nullif(btrim(coalesce(inc.client_name, '')), ''), 'Este participante');
    notice_body := participant_label || ' tuvo un incidente el ' ||
      to_char(inc.session_date, 'DD/MM/YYYY') ||
      '. Ábrelo y léelo para estar al corriente.';

    insert into public.portal_staff_announcements
      (created_by, title, body, message_type, priority, audience_scope,
       delivery_scope, target_user_id, related_incident_id, ends_at)
    values
      (new.submitted_by_user_id,
       'Incidente previo de un participante',
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
  'AFTER INSERT on session_feedback: if the participant already had an incident (on/before this session), alert this instructor once per incident (covers/makeups/future overrides). Excludes the reporter; de-duplicated by related_incident_id; never blocks the insert.';

drop trigger if exists "portal-session-feedback-incident-alert" on public.session_feedback;
create trigger "portal-session-feedback-incident-alert"
after insert on public.session_feedback
for each row
execute function public.portal_session_feedback_incident_alert();

commit;
