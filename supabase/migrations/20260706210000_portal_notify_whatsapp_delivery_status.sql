-- WhatsApp delivery/read tracking for outbound parent messages.
--
-- Meta sends status callbacks (sent -> delivered -> read, or failed) to the
-- webhook. We store the progression on portal_parent_notify_log, matched by
-- whatsapp_message_id. The webhook advances whatsapp_status and stamps the
-- delivered/read timestamps so the admin Family messages panel can show ticks.

alter table public.portal_parent_notify_log
  add column if not exists whatsapp_delivered_at timestamptz,
  add column if not exists whatsapp_read_at timestamptz;

create index if not exists portal_parent_notify_log_wa_msg_id_idx
  on public.portal_parent_notify_log (whatsapp_message_id)
  where whatsapp_message_id is not null;
