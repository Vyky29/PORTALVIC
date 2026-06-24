-- Realtime: Family messages inbox refreshes when Meta webhook inserts inbound WhatsApp.

alter table public.portal_parent_whatsapp_inbound replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'portal_parent_whatsapp_inbound'
     ) then
    alter publication supabase_realtime add table public.portal_parent_whatsapp_inbound;
  end if;
end $$;
