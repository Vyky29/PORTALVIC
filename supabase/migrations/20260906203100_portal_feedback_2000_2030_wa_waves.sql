-- Two WhatsApp waves per staff per London day: 20:00 then 20:30 if still outstanding.
-- Must run after 20260906203000_portal_feedback_2030_whatsapp.sql

begin;

alter table public.portal_feedback_2030_wa_sent
  add column if not exists wave text;

update public.portal_feedback_2030_wa_sent
set wave = '2030'
where wave is null or btrim(wave) = '';

alter table public.portal_feedback_2030_wa_sent
  alter column wave set default '2000';

alter table public.portal_feedback_2030_wa_sent
  alter column wave set not null;

alter table public.portal_feedback_2030_wa_sent
  drop constraint if exists portal_feedback_2030_wa_sent_uidx;

alter table public.portal_feedback_2030_wa_sent
  add constraint portal_feedback_2030_wa_sent_uidx unique (session_date, staff_user_id, wave);

comment on table public.portal_feedback_2030_wa_sent is
  'Dedup: one WhatsApp per staff per London day per wave (2000 then 2030 if still outstanding).';

commit;
