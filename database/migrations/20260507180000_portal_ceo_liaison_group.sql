-- CEO liaison group row (slug ceo_liaison). The table is created in
-- 20260513140000_portal_ceo_group_chat.sql — run that migration first if you see
-- "relation portal_ceo_group does not exist".
--
-- That file also inserts this row; this migration stays as a safe no-op / catch-up
-- when databases applied 20260513140000 before the liaison seed was added.

do $body$
begin
  if to_regclass('public.portal_ceo_group') is null then
    raise notice 'portal_ceo_group missing — apply 20260513140000_portal_ceo_group_chat.sql first; skipping ceo_liaison seed.';
    return;
  end if;
  insert into public.portal_ceo_group (slug, title)
  values ('ceo_liaison', 'CEO & Ops liaison (group)')
  on conflict (slug) do nothing;
end
$body$;
