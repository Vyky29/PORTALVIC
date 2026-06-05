-- Late session feedback admin push: SQL trigger + 21:00 digest cron.

-- Apply in Portal Supabase SQL Editor (cklpnwhlqsulpmkipmqb).

-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with Edge secret PORTAL_PUSH_WEBHOOK_SECRET (same as roster trigger).

--

-- Requires: portal-push-dispatch-admin-alert + portal-push-feedback-9pm-digest deployed.

-- Also run: 20260620190000_portal_late_feedback_admin_notify.sql (dedupe table).

--

-- If cron fails with "schema cron does not exist":

--   Dashboard → Database → Extensions → enable **pg_cron** and **pg_net**, then re-run STEP 3 below.



-- =============================================================================

-- STEP 1 — Extensions (pg_cron + pg_net).
-- On hosted Portal: enable in Dashboard → Database → Extensions first.
-- Do not re-run CREATE EXTENSION here if already on (Supabase hook can error).

-- =============================================================================

do $ext$
declare
  missing text[] := array[]::text[];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    missing := array_append(missing, 'pg_cron');
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    missing := array_append(missing, 'pg_net');
  end if;
  if array_length(missing, 1) > 0 then
    raise exception
      'Enable extension(s) in Dashboard first: %',
      array_to_string(missing, ', ');
  end if;
end
$ext$;



-- =============================================================================

-- STEP 2 — Trigger on late session_feedback INSERT

-- =============================================================================

begin;



drop trigger if exists "session-feedback-admin-web-push" on public.session_feedback;



create trigger "session-feedback-admin-web-push"

after insert on public.session_feedback

for each row

execute function supabase_functions.http_request(

  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-admin-alert',

  'POST',

  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',

  '{}',

  '5000'

);



commit;



-- =============================================================================

-- STEP 3 — Cron: 21:00 UTC daily (≈ 21:00 London in winter; 22:00 in BST).

--           In summer use '0 20 * * *' if you want 21:00 London.

-- =============================================================================

do $cron$

begin

  if not exists (

    select 1 from pg_namespace where nspname = 'cron'

  ) then

    raise exception

      'pg_cron is not enabled. Supabase Dashboard → Database → Extensions → enable pg_cron and pg_net, then re-run STEP 3 only.';

  end if;



  begin

    perform cron.unschedule('portal-feedback-9pm-digest');

  exception

    when others then null;

  end;



  perform cron.schedule(

    'portal-feedback-9pm-digest',

    '0 21 * * *',

    $job$

    select net.http_post(

      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-feedback-9pm-digest',

      headers := jsonb_build_object(

        'Content-Type', 'application/json',

        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'

      ),

      body := '{}'::jsonb,

      timeout_milliseconds := 30000

    ) as request_id;

    $job$

  );

end

$cron$;


