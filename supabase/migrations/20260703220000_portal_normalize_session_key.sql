-- Canonical portal_session_key on write (quick marks, feedback, cancellations).
-- Mirrors working_ui/portal/portal_session_key.js (time HH:MM, client slug aliases).

create or replace function public.portal_norm_time_key_token(p_token text, p_day_word text default '')
returns text
language plpgsql
immutable
as $$
declare
  s text;
  hm text[];
  dot text[];
  dh int;
  dm int;
begin
  s := lower(trim(coalesce(p_token, '')));
  if s = '' then
    return '';
  end if;
  if s ~ '^\d{1,2}:\d{2}(:\d{2})?$' then
    hm := regexp_match(s, '^(\d{1,2}):(\d{2})');
    return lpad(hm[1], 2, '0') || ':' || lpad(hm[2], 2, '0');
  end if;
  if s ~ '^\d{1,2}\.\d{1,2}$' then
    dot := regexp_match(s, '^(\d{1,2})\.(\d{1,2})$');
    dh := dot[1]::int;
    dm := coalesce(dot[2]::int, 0);
    if coalesce(p_day_word, '') <> 'Sunday' and dh < 8 then
      dh := dh + 12;
    elsif p_day_word = 'Sunday' and dh between 1 and 7 then
      dh := dh + 12;
    elsif p_day_word = '' and dh between 1 and 7 then
      dh := dh + 12;
    end if;
    return lpad(dh::text, 2, '0') || ':' || lpad(dm::text, 2, '0');
  end if;
  return '';
end;
$$;

create or replace function public.portal_slugify_key_token(p_token text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(lower(trim(coalesce(p_token, ''))), '[^a-z0-9]+', '_', 'g'));
$$;

create or replace function public.portal_canonical_client_slug(p_slug text)
returns text
language sql
immutable
as $$
  select case public.portal_slugify_key_token(p_slug)
    when 'adam_pi' then 'adam_p'
    when 'aadam_ah' then 'adaam_ah'
    when 'abodi_p' then 'abodi_pa'
    when 'abodi' then 'abodi_pa'
    when 'amar_rai' then 'amar_ra'
    when 'sammer' then 'samer'
    when 'rayan_tapa' then 'rayan_ta'
    when 'steven_ces' then 'steven'
    when 'steven_c' then 'steven'
    when 'steven_ce' then 'steven'
    when 'yusuf' then 'yusuf_ah'
    when 'yusef' then 'yusuf_ah'
    when 'eddie_mc' then 'eddie'
    when 'adam_a' then 'adam_ab'
    when 'junaid' then 'junaid_f'
    when 'khalid_ab' then 'khalid'
    when 'rayyan_fi' then 'rayyan_f'
    when 'chaitanya_trial_28_06' then 'chaitanya'
    else public.portal_slugify_key_token(p_slug)
  end;
$$;

create or replace function public.portal_normalize_session_key(p_key text)
returns text
language plpgsql
immutable
as $$
declare
  raw text;
  parts text[];
  out_parts text[];
  i int;
  p text;
  day_word text;
  norm_t text;
  slug text;
  non_client boolean;
begin
  raw := trim(coalesce(p_key, ''));
  if raw = '' then
    return raw;
  end if;
  parts := string_to_array(raw, '|');
  if coalesce(array_length(parts, 1), 0) < 1 then
    return raw;
  end if;
  if parts[1] !~ '^\d{4}-\d{2}-\d{2}$' then
    return raw;
  end if;
  day_word := trim(to_char(parts[1]::date, 'FMDay'));
  out_parts := array[parts[1]];
  for i in 2..coalesce(array_length(parts, 1), 0) loop
    p := parts[i];
    if p is null or p = '' then
      out_parts := array_append(out_parts, '');
      continue;
    end if;
    norm_t := public.portal_norm_time_key_token(p, day_word);
    if norm_t <> '' then
      out_parts := array_append(out_parts, norm_t);
      continue;
    end if;
    slug := public.portal_slugify_key_token(p);
    non_client := slug in (
      'merge', 'wall', 'aquatic', 'day_centre', 'bespoke_shared', 'hub_room',
      'teaching_pool', 'big_pool', 'small_pool', 'climbing', 'climbing_wall',
      'multi_activity', 'multi-activity', 'bespoke', 'room_2', 'lane_de', 'lane_se'
    );
    if non_client then
      out_parts := array_append(out_parts, slug);
    else
      out_parts := array_append(out_parts, public.portal_canonical_client_slug(slug));
    end if;
  end loop;
  return array_to_string(out_parts, '|');
end;
$$;

comment on function public.portal_normalize_session_key(text) is
  'Canonical portal_session_key: ISO date, HH:MM times, client slug aliases, service tokens.';

create or replace function public.portal_trg_normalize_session_key()
returns trigger
language plpgsql
as $$
begin
  if new.portal_session_key is null or trim(new.portal_session_key) = '' then
    return new;
  end if;
  new.portal_session_key := public.portal_normalize_session_key(new.portal_session_key);
  return new;
end;
$$;

drop trigger if exists portal_staff_session_quick_marks_normalize_key on public.portal_staff_session_quick_marks;
create trigger portal_staff_session_quick_marks_normalize_key
before insert or update of portal_session_key
on public.portal_staff_session_quick_marks
for each row
execute function public.portal_trg_normalize_session_key();

drop trigger if exists session_feedback_normalize_key on public.session_feedback;
create trigger session_feedback_normalize_key
before insert or update of portal_session_key
on public.session_feedback
for each row
execute function public.portal_trg_normalize_session_key();

drop trigger if exists cancellation_reports_normalize_key on public.cancellation_reports;
create trigger cancellation_reports_normalize_key
before insert or update of portal_session_key
on public.cancellation_reports
for each row
execute function public.portal_trg_normalize_session_key();
