-- Anuncios y asignación a staff o lead (Supabase / PostgreSQL)

create extension if not exists "uuid-ossp";

create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Destinatarios: por usuario de auth, por rol, o por fila de staff
create table if not exists public.announcement_targets (
  id uuid primary key default uuid_generate_v4(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  target_type text not null check (target_type in ('auth_user', 'role', 'staff')),
  auth_user_id uuid references auth.users (id) on delete cascade,
  role_id uuid references public.roles (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint announcement_targets_one_fk check (
    (target_type = 'auth_user' and auth_user_id is not null and role_id is null and staff_id is null)
    or (target_type = 'role' and role_id is not null and auth_user_id is null and staff_id is null)
    or (target_type = 'staff' and staff_id is not null and auth_user_id is null and role_id is null)
  )
);

create index if not exists announcement_targets_announcement_idx
  on public.announcement_targets (announcement_id);

comment on table public.announcements is 'Anuncios creados desde el Admin Dashboard.';
comment on table public.announcement_targets is 'Distribución: usuario, rol o registro de staff.';
