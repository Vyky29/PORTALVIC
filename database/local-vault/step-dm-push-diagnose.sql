-- Run in Supabase SQL Editor (Portal cklpnwhlqsulpmkipmqb) to diagnose chat/call push.

-- 1) Triggers must list all five names
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

-- 2) Header must contain x-portal-webhook-secret (not only Content-Type)
select tgname, pg_get_triggerdef(oid) as trigger_def
from pg_trigger
where tgname in (
  'portal-staff-dm-admin-chat-push',
  'portal-staff-dm-worker-chat-push',
  'portal-staff-dm-incoming-call-push'
);

-- 3) Subscriptions for directors + Teflon demo worker
select sp.username, sp.full_name, left(pps.endpoint, 55) as endpoint, pps.updated_at
from portal_push_subscriptions pps
join staff_profiles sp on sp.id = pps.user_id
where lower(sp.username) in ('raul', 'victor', 'javi', 'sevitha', 'info', 'teflon')
order by sp.username, pps.updated_at desc;

-- 4) Recent dedupe rows = pushes attempted (admin inbox)
select source_table, count(*) as sends, max(sent_at) as last_sent
from portal_webpush_admin_alert_sent
where source_table in ('portal_staff_dm_messages', 'portal_ceo_group_message')
group by 1;

-- 5) Staff worker DM push dedupe (management → worker)
select source_table, count(*) as sends, max(sent_at) as last_sent
from portal_webpush_staff_dm_sent
group by 1;

select source_table, count(*) as sends, max(sent_at) as last_sent
from portal_webpush_incoming_call_sent
group by 1;

-- 6) Trigger HTTP failures — 401 = Edge Function still requires JWT (redeploy with --no-verify-jwt)
select status_code, count(*) as n, max(created) as last_at
from net._http_response
where created > now() - interval '24 hours'
group by 1
order by 1;

select created, status_code, left(content::text, 160) as content
from net._http_response
where created > now() - interval '2 hours'
  and (status_code >= 400 or content::text ilike '%sent%')
order by created desc
limit 12;
