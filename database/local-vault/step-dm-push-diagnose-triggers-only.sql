select tgname as trigger_name, tgrelid::regclass as on_table
from pg_trigger
where not tgisinternal
  and tgname in (
    'portal-staff-dm-admin-chat-push',
    'portal-ceo-group-admin-chat-push',
    'portal-staff-dm-worker-chat-push',
    'portal-staff-dm-incoming-call-push',
    'portal-ceo-group-incoming-call-push'
  )
order by 1;

select tgname, pg_get_triggerdef(oid) as trigger_def
from pg_trigger
where tgname in (
  'portal-staff-dm-admin-chat-push',
  'portal-staff-dm-worker-chat-push',
  'portal-staff-dm-incoming-call-push'
);

select sp.username, sp.full_name, left(pps.endpoint, 55) as endpoint, pps.updated_at
from portal_push_subscriptions pps
join staff_profiles sp on sp.id = pps.user_id
where lower(sp.username) in ('raul', 'victor', 'javi', 'sevitha')
order by sp.username, pps.updated_at desc;

select source_table, count(*) as sends, max(sent_at) as last_sent
from portal_webpush_admin_alert_sent
where source_table in ('portal_staff_dm_messages', 'portal_ceo_group_message')
group by 1;
