-- portal_participants registry (avatars in Storage) + sibling-aware parent login.
-- Login: parent first name + last name + DOB of oldest linked participant (DDMMYYYY).

begin;

-- ----------------------------------------------------------------------------
-- 1) Canonical participants (photos → participant-avatars bucket path)
-- ----------------------------------------------------------------------------
create table if not exists public.portal_participants (
  contact_id            text primary key,
  display_name          text not null,
  first_name            text,
  last_name             text,
  dob_iso               date,
  parent_person_id      text not null,
  avatar_storage_path   text,
  avatar_updated_at     timestamptz,
  in_class              boolean,
  on_waiting_list       boolean,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists portal_participants_parent_person_idx
  on public.portal_participants (parent_person_id);

create index if not exists portal_participants_dob_idx
  on public.portal_participants (dob_iso)
  where dob_iso is not null;

comment on table public.portal_participants is
  'Club participants for parent portal and avatar paths (Supabase Storage participant-avatars).';

comment on column public.portal_participants.avatar_storage_path is
  'Object path inside bucket participant-avatars, e.g. {contact_id}/avatar.jpg';

-- Backfill from parent contacts export (idempotent).
insert into public.portal_participants (
  contact_id, display_name, first_name, last_name, dob_iso, parent_person_id,
  in_class, on_waiting_list
)
select
  c.contact_id,
  c.child_display,
  c.child_first_name,
  c.child_last_name,
  c.dob_iso,
  c.parent_person_id,
  c.in_class,
  c.on_waiting_list
from public.portal_parent_contacts c
on conflict (contact_id) do update set
  display_name = excluded.display_name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  dob_iso = excluded.dob_iso,
  parent_person_id = excluded.parent_person_id,
  in_class = excluded.in_class,
  on_waiting_list = excluded.on_waiting_list,
  updated_at = now();

-- Storage bucket for participant profile photos (staff/admin upload; parents read via signed URLs later).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'participant-avatars',
  'participant-avatars',
  false,
  8388608,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, update on public.portal_participants to service_role;

-- ----------------------------------------------------------------------------
-- 2) Parent login match — first + last name + oldest sibling DOB
-- ----------------------------------------------------------------------------
create or replace function public.portal_parent_parse_dob_input(p text)
returns date
language plpgsql
immutable
as $$
declare
  s text;
  d int;
  m int;
  y int;
begin
  s := regexp_replace(coalesce(trim(p), ''), '\D', '', 'g');
  if length(s) <> 8 then
    return null;
  end if;
  d := substring(s from 1 for 2)::int;
  m := substring(s from 3 for 2)::int;
  y := substring(s from 5 for 4)::int;
  return make_date(y, m, d);
exception
  when others then
    return null;
end;
$$;

create or replace function public.portal_parent_match_identity_dob(
  p_parent_first_name text,
  p_parent_last_name  text,
  p_login_dob         text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select
      public.portal_normalize_full_name(p_parent_first_name) as fn_norm,
      public.portal_normalize_full_name(p_parent_last_name)  as ln_norm,
      public.portal_parent_parse_dob_input(p_login_dob)      as dob_parsed
  ),
  family_oldest as (
    select
      c.parent_person_id,
      min(c.dob_iso) filter (where c.dob_iso is not null) as oldest_dob
    from public.portal_parent_contacts c
    group by c.parent_person_id
  ),
  candidates as (
    select distinct c.parent_person_id
    from public.portal_parent_contacts c
    inner join family_oldest fo on fo.parent_person_id = c.parent_person_id
    cross join norm
    where norm.fn_norm <> ''
      and norm.ln_norm <> ''
      and norm.dob_parsed is not null
      and fo.oldest_dob = norm.dob_parsed
      and public.portal_normalize_full_name(coalesce(c.parent_first_name, '')) = norm.fn_norm
      and public.portal_normalize_full_name(coalesce(c.parent_last_name, '')) = norm.ln_norm
    limit 2
  ),
  agg as (
    select array_agg(parent_person_id) as ids, count(*) as n
    from candidates
  )
  select case when n = 1 then ids[1] else null end
  from agg;
$$;

revoke all on function public.portal_parent_match_identity_dob(text, text, text) from public;
revoke all on function public.portal_parent_match_identity_dob(text, text, text) from anon;
revoke all on function public.portal_parent_match_identity_dob(text, text, text) from authenticated;
grant execute on function public.portal_parent_match_identity_dob(text, text, text) to service_role;

comment on function public.portal_parent_match_identity_dob(text, text, text) is
  'Parent portal login: carer first + last name and oldest linked participant DOB (DDMMYYYY).';

-- Drop legacy 2-arg overload if present from earlier iteration.
drop function if exists public.portal_parent_match_identity_dob(text, text);

commit;
