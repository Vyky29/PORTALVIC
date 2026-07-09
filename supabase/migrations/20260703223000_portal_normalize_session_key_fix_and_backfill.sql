-- Fix array append bug in portal_normalize_session_key (|| '' is invalid for text[]).
-- Then backfill historical portal_session_key values on the three write tables.

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

-- Drop quick-mark rows that would violate unique (staff_user_id, portal_session_key, mark_type) after normalize.
delete from public.portal_staff_session_quick_marks d
where d.id in (
  select q.id
  from public.portal_staff_session_quick_marks q
  join public.portal_staff_session_quick_marks k
    on k.staff_user_id = q.staff_user_id
   and k.mark_type = q.mark_type
   and k.portal_session_key = public.portal_normalize_session_key(q.portal_session_key)
   and k.id <> q.id
  where q.portal_session_key is not null
    and trim(q.portal_session_key) <> ''
    and q.portal_session_key <> public.portal_normalize_session_key(q.portal_session_key)
);

update public.portal_staff_session_quick_marks
set portal_session_key = public.portal_normalize_session_key(portal_session_key)
where portal_session_key is not null
  and trim(portal_session_key) <> ''
  and portal_session_key <> public.portal_normalize_session_key(portal_session_key);

update public.session_feedback
set portal_session_key = public.portal_normalize_session_key(portal_session_key)
where portal_session_key is not null
  and trim(portal_session_key) <> ''
  and portal_session_key <> public.portal_normalize_session_key(portal_session_key);

update public.cancellation_reports
set portal_session_key = public.portal_normalize_session_key(portal_session_key)
where portal_session_key is not null
  and trim(portal_session_key) <> ''
  and portal_session_key <> public.portal_normalize_session_key(portal_session_key);
