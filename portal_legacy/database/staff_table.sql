-- Tabla de personal (Supabase / PostgreSQL)
-- Ejecutar en el SQL Editor del proyecto Supabase o vía migración.

create extension if not exists "uuid-ossp";

create table if not exists public.staff (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users (id) on delete set null,
  slug text unique,
  display_name text not null,
  email text unique,
  phone text,
  site text,
  role_label text,
  status text not null default 'active' check (status in ('active', 'inactive', 'leave')),
  notes text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_auth_user_id_idx on public.staff (auth_user_id);
create index if not exists staff_status_idx on public.staff (status);

comment on table public.staff is 'Miembros del staff enlazables a auth.users.';
