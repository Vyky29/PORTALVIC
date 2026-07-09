-- Shared Staff & leads group for admin ops calls (rings all staff + session leads).

begin;

insert into public.portal_ceo_group (slug, title)
values ('staff_leads_ops', 'Staff & leads (group)')
on conflict (slug) do update set title = excluded.title;

drop policy if exists portal_ceo_group_select_staff_leads_ops on public.portal_ceo_group;
create policy portal_ceo_group_select_staff_leads_ops
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'staff_leads_ops'
    and public.portal_staff_is_staff_or_lead()
  );

drop policy if exists portal_ceo_group_message_select_staff_leads_ops on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_staff_leads_ops
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'staff_leads_ops'
    )
  );

comment on table public.portal_ceo_group is
  'Shared group threads: CEO circles (ceo_exec) and Staff & leads ops ring (staff_leads_ops).';

commit;
