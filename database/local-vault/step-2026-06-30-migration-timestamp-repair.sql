-- Repair schema_migrations after splitting duplicate 20260703180000 timestamp.
-- 20260703180100 = portal_youssef_swim_22_support_20 (was recorded as 180000)
-- 20260703180200 = portal_calendar_2026_27_announcement (applied via db query)

begin;

update supabase_migrations.schema_migrations
set version = '20260703180100'
where version = '20260703180000';

insert into supabase_migrations.schema_migrations (version)
values ('20260703180200')
on conflict (version) do nothing;

commit;
