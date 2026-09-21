-- Sun 6 Sep 2026: Jack S <-> Samer standing swap.
-- Hub Room 10.15 is Jack S (not Samer). Retarget Sep 6 Youssef cover session keys.
-- Service-role UPDATE nulls updated_by via trigger — disable while patching.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides so
set
  payload = jsonb_set(
    coalesce(so.payload, '{}'::jsonb),
    '{portal_session_key}',
    to_jsonb(replace(coalesce(so.payload->>'portal_session_key', ''), '|samer', '|jack_s'))
  ),
  anchor_client_id = case
    when lower(trim(coalesce(so.anchor_client_id, ''))) = 'samer' then 'jack_s'
    else so.anchor_client_id
  end,
  updated_at = now(),
  updated_by = coalesce(so.updated_by, so.created_by)
where so.session_date = date '2026-09-06'
  and so.override_type = 'instructor_reassign'
  and (
    coalesce(so.payload->>'portal_session_key', '') like '%|samer%'
    or lower(trim(coalesce(so.anchor_client_id, ''))) = 'samer'
  );

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
