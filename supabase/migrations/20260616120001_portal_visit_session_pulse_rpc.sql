-- Lightweight visit-session heartbeat (scalar columns only) + optional pages patch.
-- Reduces JSONB rewrite load and statement timeouts from portal_visit_tracker.js.
-- Apply on Portal Supabase (cklpnwhlqsulpmkipmqb).

begin;

create index if not exists portal_staff_visit_sessions_open_seen_idx
  on public.portal_staff_visit_sessions (last_seen_at desc)
  where still_open = true;

create or replace function public.portal_visit_session_pulse(
  p_session_id uuid,
  p_last_page_label text default null,
  p_active_tab_ms bigint default null,
  p_total_ms bigint default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_session_id is null then
    return false;
  end if;
  update public.portal_staff_visit_sessions
  set
    last_seen_at = now(),
    last_page_label = coalesce(nullif(trim(p_last_page_label), ''), last_page_label),
    active_tab_ms = coalesce(p_active_tab_ms, active_tab_ms),
    total_ms = coalesce(p_total_ms, total_ms),
    still_open = true
  where id = p_session_id
    and staff_user_id = v_uid;
  return found;
end;
$$;

create or replace function public.portal_visit_session_patch(
  p_session_id uuid,
  p_last_page_label text default null,
  p_active_tab_ms bigint default null,
  p_total_ms bigint default null,
  p_pages jsonb default null,
  p_form_submits jsonb default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_session_id is null then
    return false;
  end if;
  update public.portal_staff_visit_sessions
  set
    last_seen_at = now(),
    last_page_label = coalesce(nullif(trim(p_last_page_label), ''), last_page_label),
    active_tab_ms = coalesce(p_active_tab_ms, active_tab_ms),
    total_ms = coalesce(p_total_ms, total_ms),
    pages = coalesce(p_pages, pages),
    form_submits = coalesce(p_form_submits, form_submits),
    still_open = true
  where id = p_session_id
    and staff_user_id = v_uid;
  return found;
end;
$$;

revoke all on function public.portal_visit_session_pulse(uuid, text, bigint, bigint) from public;
revoke all on function public.portal_visit_session_patch(uuid, text, bigint, bigint, jsonb, jsonb) from public;
grant execute on function public.portal_visit_session_pulse(uuid, text, bigint, bigint) to authenticated;
grant execute on function public.portal_visit_session_patch(uuid, text, bigint, bigint, jsonb, jsonb) to authenticated;

comment on function public.portal_visit_session_pulse(uuid, text, bigint, bigint) is
  'Staff portal visit heartbeat — updates last_seen and active time only (no JSONB).';

comment on function public.portal_visit_session_patch(uuid, text, bigint, bigint, jsonb, jsonb) is
  'Staff portal visit flush — heartbeat plus optional pages / form_submits JSONB.';

commit;
