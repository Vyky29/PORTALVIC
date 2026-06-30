-- Mirror of database/migrations/20260703140000_portal_parent_feedback_sanitize_webhook.sql

begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.portal_parent_feedback_sanitize_http_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _body jsonb;
begin
  _body := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', to_jsonb(NEW),
    'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
  );
  perform net.http_post(
    url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-parent-feedback-sanitize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
    ),
    body := _body
  );
  return NEW;
exception when others then
  raise warning 'portal_parent_feedback_sanitize_http_trigger: %', SQLERRM;
  return NEW;
end;
$$;

drop trigger if exists portal_session_feedback_parent_sanitize on public.session_feedback;
create trigger portal_session_feedback_parent_sanitize
  after insert or update on public.session_feedback
  for each row
  execute function public.portal_parent_feedback_sanitize_http_trigger();

commit;
