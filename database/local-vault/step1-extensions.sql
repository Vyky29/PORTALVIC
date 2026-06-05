-- Portal: verify pg_cron + pg_net (hosted Supabase — do NOT re-create if already on).
--
-- On Portal (cklpnwhlqsulpmkipmqb) extensions are usually already enabled via
-- Dashboard → Database → Extensions. Re-running CREATE EXTENSION can fail with
-- "dependent privileges exist" from Supabase's pg_cron install hook.
--
-- Run: supabase db query --linked -f database/local-vault/step1-extensions.sql

do $$
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
      'Missing extension(s): %. Enable in Supabase Dashboard → Database → Extensions, then re-run.',
      array_to_string(missing, ', ');
  end if;

  raise notice 'OK: pg_cron and pg_net are enabled.';
end $$;

select extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;
