-- Family messages: store outbound photo/document/audio metadata on notify log.

begin;

alter table public.portal_parent_notify_log
  add column if not exists message_type text not null default 'text';

alter table public.portal_parent_notify_log
  add column if not exists media_path text;

alter table public.portal_parent_notify_log
  add column if not exists media_mime text;

comment on column public.portal_parent_notify_log.message_type is
  'text | image | audio | video | document — outbound WhatsApp payload kind.';
comment on column public.portal_parent_notify_log.media_path is
  'Object path in wa-inbound-media for outbound attachment (admin copy).';
comment on column public.portal_parent_notify_log.media_mime is
  'MIME type of outbound attachment.';

commit;
