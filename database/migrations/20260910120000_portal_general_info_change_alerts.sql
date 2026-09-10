-- General info change alerts: staff/admin can read the log; realtime for admin bell.

begin;

alter table public.portal_participant_general_info_log
  add column if not exists source text not null default 'parent';

comment on column public.portal_participant_general_info_log.source is
  'Who wrote the change: parent | admin';

grant select on public.portal_participant_general_info_log to authenticated;

drop policy if exists portal_participant_general_info_log_select_staff
  on public.portal_participant_general_info_log;
create policy portal_participant_general_info_log_select_staff
  on public.portal_participant_general_info_log
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

alter table public.portal_participant_general_info_log replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'portal_participant_general_info_log'
     )
  then
    alter publication supabase_realtime add table public.portal_participant_general_info_log;
  end if;
end $$;

commit;
