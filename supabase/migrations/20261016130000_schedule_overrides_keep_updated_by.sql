-- Service-role updates (finish booking displacing a makeup) have no auth.uid().
-- Keep the updated_by passed on the row, or the previous one, instead of writing null.

create or replace function public.schedule_overrides_set_updated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  elsif new.updated_by is null then
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;
