-- Display name: Chaitanya (not "Chaitanya (Trial 28/06)") on trial overrides.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  payload = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(payload, '{}'::jsonb),
          '{to_client_name}',
          '"Chaitanya"'::jsonb,
          true
        ),
        '{replacement_client_name}',
        '"Chaitanya"'::jsonb,
        true
      ),
      '{to_client_id}',
      '"chaitanya"'::jsonb,
      true
    ),
    '{replacement_client_id}',
    '"chaitanya"'::jsonb,
    true
  ),
  updated_at = now(),
  updated_by = created_by
where lower(coalesce(payload->>'to_client_name', '')) like '%chaitanya%'
   or lower(coalesce(payload->>'replacement_client_name', '')) like '%chaitanya%';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
