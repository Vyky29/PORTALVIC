-- Alex + Andres (climbing coaches): ensure planner-eligible staff role.
-- visualVIC limits them to Core + Climbing by username (alex / andres).
begin;

update public.staff_profiles
set app_role = 'staff'
where is_active = true
  and lower(trim(coalesce(username, ''))) in ('alex', 'andres')
  and (
    app_role is null
    or lower(trim(app_role)) not in ('staff', 'lead', 'admin', 'ceo')
  );

commit;
