-- Keep updated_by from the payload when auth.uid() is null (service role / edge cases).
-- Stops upsert UPDATE from wiping updated_by and failing NOT NULL.
begin;

create or replace function public.portal_staff_timetable_cells_set_updated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  elsif new.updated_by is null and old.updated_by is not null then
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;

commit;
