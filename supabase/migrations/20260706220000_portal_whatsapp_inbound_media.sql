-- Inbound WhatsApp media (stickers, images, video, audio, documents).
-- The webhook downloads the media from Meta and stores it in a Storage bucket;
-- the admin panel renders it. Reactions store the actual emoji in body_text.

begin;

alter table public.portal_parent_whatsapp_inbound
  add column if not exists media_url  text,
  add column if not exists media_mime text;

-- Public bucket for inbound WhatsApp media. Object paths use the (long,
-- unguessable) wa_message_id, so URLs are effectively private-by-obscurity
-- while staying simple to render with <img src>.
insert into storage.buckets (id, name, public)
values ('wa-inbound-media', 'wa-inbound-media', true)
on conflict (id) do update set public = true;

commit;
