-- SQL Editor / service-role updates: auth.uid() is null; keep existing updated_by.
begin;

create or replace function public.portal_roster_rows_set_updated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  return new;
end;
$$;

commit;
