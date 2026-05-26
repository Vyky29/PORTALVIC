-- Programme leads (John, Berta) read peer lead session reports for co-led slots.
-- UI still filters by weekday / service / venue in portal_lead_session_scope.js.

begin;

drop policy if exists "lead_session_reports_select_programme_leads" on public.lead_session_reports;

create policy "lead_session_reports_select_programme_leads"
on public.lead_session_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and lower(trim(coalesce(sp.username, ''))) in ('berta', 'john')
  )
);

commit;
