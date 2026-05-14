-- Backup / snapshot BEFORE enabling RLS on:
--   public.clients
--   public.sessions
--   public.announcements
--
-- Purpose:
-- 1) Capture current security posture (RLS/grants/policies/dependencies)
-- 2) Keep a rollback-ready reference in git before applying any hardening
--
-- How to use:
-- - Run this file first in Supabase SQL editor (or psql).
-- - Save/export query results externally as your snapshot evidence.
-- - Then apply the new RLS migration.

begin;

-- 0) Table existence check
select
  t as expected_table,
  to_regclass('public.' || t) as resolved_regclass
from (values ('clients'), ('sessions'), ('announcements')) v(t);

-- 1) Core table structure
select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('clients', 'sessions', 'announcements')
order by c.table_name, c.ordinal_position;

-- 2) RLS flags
select
  n.nspname as schema_name,
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced
from pg_class cls
join pg_namespace n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relkind = 'r'
  and cls.relname in ('clients', 'sessions', 'announcements')
order by cls.relname;

-- 3) Existing policies
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'sessions', 'announcements')
order by tablename, policyname;

-- 4) Current grants (table privileges)
select
  grantor,
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('clients', 'sessions', 'announcements')
order by table_name, grantee, privilege_type;

-- 5) Dependency overview (views/materialized views/functions mentioning these tables)
select
  n.nspname as dependent_schema,
  c.relname as dependent_name,
  c.relkind as dependent_kind,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm')
  and n.nspname not in ('pg_catalog', 'information_schema')
  and (
    pg_get_viewdef(c.oid, true) ilike '%public.clients%'
    or pg_get_viewdef(c.oid, true) ilike '%public.sessions%'
    or pg_get_viewdef(c.oid, true) ilike '%public.announcements%'
  )
order by n.nspname, c.relname;

-- 6) Function dependency hints
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prokind = 'f'
  and (
    pg_get_functiondef(p.oid) ilike '%public.clients%'
    or pg_get_functiondef(p.oid) ilike '%public.sessions%'
    or pg_get_functiondef(p.oid) ilike '%public.announcements%'
  )
order by n.nspname, p.proname;

-- 7) Rollback reference (expected pre-state from Security Advisor: RLS disabled)
-- NOTE: keep this block as documented restore template.
-- Run only if you need to revert the new RLS migration.
--
-- drop policy if exists "clients_select_authenticated" on public.clients;
-- drop policy if exists "sessions_select_authenticated" on public.sessions;
-- drop policy if exists "announcements_select_authenticated" on public.announcements;
--
-- alter table public.clients disable row level security;
-- alter table public.sessions disable row level security;
-- alter table public.announcements disable row level security;
--
-- revoke select on table public.clients from authenticated;
-- revoke select on table public.sessions from authenticated;
-- revoke select on table public.announcements from authenticated;
--
-- Optional, only if prior snapshot confirms it existed:
-- grant select on table public.clients to anon;
-- grant select on table public.sessions to anon;
-- grant select on table public.announcements to anon;

commit;

