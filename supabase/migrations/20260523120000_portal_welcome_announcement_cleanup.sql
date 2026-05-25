-- Remove test portal announcements and seed the production welcome notice.
-- Run in Supabase SQL Editor (Portal project) after prior portal_staff_announcements migrations.

begin;

delete from public.portal_staff_announcements
where message_type = 'announcement'
  and (
    lower(trim(title)) = 'ase'
    or lower(trim(title)) like '%pool safety%spring%'
    or lower(trim(title)) like '%bank holiday%revised%'
  );

with admin_user as (
  select sp.id
  from public.staff_profiles sp
  where sp.id is not null
    and (
      lower(coalesce(sp.username, '')) in ('victor', 'javi', 'raul', 'sevitha')
      or sp.staff_role::text in ('admin', 'ceo', 'manager')
    )
  order by case when sp.staff_role::text = 'ceo' then 0 when sp.staff_role::text = 'admin' then 1 else 2 end
  limit 1
),
welcome_body as (
  select
    'Welcome to the new Club Sensational portal' as title,
    'We have launched the new staff portal. Please read this update, then sign to confirm.

Open the Quick menu (menu icon on your dashboard) and tap Guide for step-by-step instructions on how to use the app — today''s sessions, feedback, venue checks, timesheets, announcements, and more.

The Guide button stays at the top of the Quick menu for your first month, then moves under Settings. If you have questions, check the Guide first.' as body
)
insert into public.portal_staff_announcements (
  created_by,
  title,
  body,
  message_type,
  priority,
  audience_scope,
  delivery_scope
)
select u.id, w.title, w.body, 'announcement', 'high', v.scope, 'everyone'
from admin_user u
cross join welcome_body w
cross join (values ('all_staff'), ('leads')) as v(scope)
where not exists (
  select 1
  from public.portal_staff_announcements a
  where a.message_type = 'announcement'
    and a.audience_scope = v.scope
    and lower(trim(a.title)) like 'welcome to the new%portal%'
);

commit;
