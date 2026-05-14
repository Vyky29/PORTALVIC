-- Roles y vinculación con usuarios (Supabase / PostgreSQL)

create extension if not exists "uuid-ossp";

create table if not exists public.roles (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users (id),
  unique (auth_user_id, role_id)
);

create index if not exists user_roles_user_idx on public.user_roles (auth_user_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

comment on table public.roles is 'Catálogo de roles (admin, staff, lead, …).';
comment on table public.user_roles is 'Asignación N:N entre usuarios de Auth y roles.';

-- Datos iniciales opcionales (ajusta claves a tu convención)
insert into public.roles (key, label, description)
values
  ('admin', 'Administrator', 'Acceso completo al portal y configuración.'),
  ('staff', 'Staff', 'Panel de staff y tareas operativas.'),
  ('lead', 'Lead', 'Coordinación y revisión para su equipo.')
on conflict (key) do nothing;
