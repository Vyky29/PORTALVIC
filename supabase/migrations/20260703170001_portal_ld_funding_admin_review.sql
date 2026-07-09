-- L&D funding applications: admin review fields + update policy (Phase 2).

begin;

alter table public.portal_staff_ld_funding_applications
  add column if not exists reviewed_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text,
  add column if not exists funding_amount_gbp numeric(10, 2),
  add column if not exists reimbursement_schedule text,
  add column if not exists exceptional_funding_arrangement text,
  add column if not exists additional_conditions text;

comment on column public.portal_staff_ld_funding_applications.review_notes is
  'Internal HR notes (directors only).';

alter table public.portal_staff_ld_funding_applications
  drop constraint if exists portal_staff_ld_funding_applications_funding_amount_chk;

alter table public.portal_staff_ld_funding_applications
  add constraint portal_staff_ld_funding_applications_funding_amount_chk check (
    funding_amount_gbp is null or funding_amount_gbp >= 0
  );

grant update on table public.portal_staff_ld_funding_applications to authenticated;

drop policy if exists "portal_ld_funding_admin_update"
  on public.portal_staff_ld_funding_applications;
create policy "portal_ld_funding_admin_update"
  on public.portal_staff_ld_funding_applications
  for update
  to authenticated
  using (
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_profile_is_exec_operator()
  )
  with check (
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_profile_is_exec_operator()
  );

commit;
