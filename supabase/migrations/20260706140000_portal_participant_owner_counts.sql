-- Owner resolution from the PLANNED roster (predominant instructor per child).
--
-- session_feedback alone is too sparse/flat to identify a child's owner (e.g.
-- Elijah: Aurora 2 / Roberto 2 / Dan 1 / Simon 1 → everyone ties). The real
-- "owner" lives in the planned term roster (window.ROSTER_TERM_MASTER_DASHBOARD_ROWS,
-- generated from roster_term_master_seed.json): Elijah = Aurora 5 vs Dan 2 (cover),
-- Tom = Roberto 7. We seed a compact per-(child, instructor) planned-session count
-- and derive the owner(s) as the predominant instructor(s) (>= 50% of the top).
--
-- Re-generate this seed whenever the term roster master changes (same source of
-- truth as the dashboards). Encounter alerts + read access keep using the live
-- session_feedback signal from the previous migration.

begin;

create table if not exists public.portal_participant_owner_counts (
  client_slug text not null,
  client_name text not null,
  instructor_token text not null,
  planned_sessions integer not null default 0,
  primary key (client_slug, instructor_token)
);

comment on table public.portal_participant_owner_counts is
  'Planned-roster instructor session counts per participant (aggregated from ROSTER_TERM_MASTER_DASHBOARD_ROWS). Owner = predominant instructor(s). Regenerate when the term roster changes.';

revoke all on public.portal_participant_owner_counts from public, anon;
grant select on public.portal_participant_owner_counts to authenticated, service_role;

alter table public.portal_participant_owner_counts enable row level security;
drop policy if exists "portal_participant_owner_counts_read" on public.portal_participant_owner_counts;
create policy "portal_participant_owner_counts_read"
  on public.portal_participant_owner_counts for select to authenticated using (true);

-- Full refresh of the planned counts.
truncate table public.portal_participant_owner_counts;

insert into public.portal_participant_owner_counts
  (client_slug, client_name, instructor_token, planned_sessions)
values
  ('abodi_pa', 'Abodi Pa', 'youssef', 7),
  ('acat', 'ACAT', 'roberto', 7),
  ('adaam_ah', 'Adaam Ah', 'dan', 7),
  ('adaam_ah', 'Adaam Ah', 'roberto', 5),
  ('adaam_ah', 'Adaam Ah', 'bismark', 4),
  ('adaam_ah', 'Adaam Ah', 'godsway', 2),
  ('adam_ab', 'Adam Ab', 'giuseppe', 7),
  ('adam_ab', 'Adam Ab', 'javier', 7),
  ('adam_ab', 'Adam Ab', 'john', 4),
  ('adam_ab', 'Adam Ab', 'dan', 4),
  ('adam_ab', 'Adam Ab', 'berta', 2),
  ('adam_ab', 'Adam Ab', 'aurora', 2),
  ('adam_me', 'Adam Me', 'javier', 7),
  ('adam_p', 'Adam P', 'angel', 7),
  ('adam_p', 'Adam P', 'roberto', 7),
  ('amaar_ah', 'Amaar Ah', 'roberto', 12),
  ('amaar_ah', 'Amaar Ah', 'bismark', 4),
  ('amaar_ah', 'Amaar Ah', 'godsway', 2),
  ('amar_rai', 'Amar Rai', 'roberto', 14),
  ('amber', 'Amber', 'roberto', 7),
  ('amir', 'Amir', 'angel', 7),
  ('aqsa', 'Aqsa', 'aurora', 5),
  ('aqsa', 'Aqsa', 'dan', 2),
  ('arthur_ma', 'Arthur Ma', 'dan', 4),
  ('arthur_ma', 'Arthur Ma', 'john', 4),
  ('arthur_ma', 'Arthur Ma', 'berta', 2),
  ('arthur_ma', 'Arthur Ma', 'aurora', 2),
  ('arthur_mo', 'Arthur Mo', 'roberto', 5),
  ('arthur_mo', 'Arthur Mo', 'bismark', 4),
  ('arthur_mo', 'Arthur Mo', 'godsway', 2),
  ('ayaan', 'Ayaan', 'sandra', 7),
  ('aydaan_ah', 'Aydaan Ah', 'aurora', 9),
  ('aydaan_ah', 'Aydaan Ah', 'john', 4),
  ('aydaan_ah', 'Aydaan Ah', 'dan', 4),
  ('aydaan_ah', 'Aydaan Ah', 'berta', 2),
  ('ayden_w', 'Ayden W', 'alex', 5),
  ('ayden_w', 'Ayden W', 'bismark', 1),
  ('ayman', 'Ayman', 'javier', 14),
  ('ayman', 'Ayman', 'youssef', 7),
  ('bediako', 'Bediako', 'aurora', 7),
  ('cayra', 'Cayra', 'angel', 7),
  ('cyrus', 'Cyrus', 'javier', 14),
  ('cyrus', 'Cyrus', 'victor', 9),
  ('cyrus', 'Cyrus', 'giuseppe', 7),
  ('cyrus', 'Cyrus', 'john', 4),
  ('cyrus', 'Cyrus', 'dan', 4),
  ('cyrus', 'Cyrus', 'berta', 2),
  ('cyrus', 'Cyrus', 'aurora', 2),
  ('eddie', 'Eddie', 'youssef', 7),
  ('eiji', 'Eiji', 'javier', 13),
  ('eiji', 'Eiji', 'roberto', 7),
  ('eiji', 'Eiji', 'simon', 7),
  ('eiji', 'Eiji', 'giuseppe', 6),
  ('eiji', 'Eiji', 'alex', 5),
  ('eiji', 'Eiji', 'bismark', 1),
  ('elijah', 'Elijah', 'aurora', 5),
  ('elijah', 'Elijah', 'dan', 2),
  ('emani', 'Emani', 'youssef', 6),
  ('emmanuel', 'Emmanuel', 'youssef', 22),
  ('emmanuel', 'Emmanuel', 'michelle', 9),
  ('emmanuel', 'Emmanuel', 'raul', 8),
  ('emmanuel', 'Emmanuel', 'victor', 3),
  ('erik', 'Erik', 'dan', 4),
  ('erik', 'Erik', 'john', 4),
  ('erik', 'Erik', 'berta', 2),
  ('erik', 'Erik', 'aurora', 2),
  ('fadi', 'Fadi', 'roberto', 46),
  ('fadi', 'Fadi', 'youssef', 18),
  ('fadi', 'Fadi', 'victor', 17),
  ('fadi', 'Fadi', 'raul', 12),
  ('faris', 'Faris', 'dan', 4),
  ('faris', 'Faris', 'aurora', 2),
  ('gabriel', 'Gabriel', 'roberto', 5),
  ('gabriel', 'Gabriel', 'bismark', 4),
  ('gabriel', 'Gabriel', 'godsway', 2),
  ('gemma', 'Gemma', 'dan', 7),
  ('haneef', 'Haneef', 'javier', 6),
  ('haneef', 'Haneef', 'giuseppe', 6),
  ('hazem', 'Hazem', 'javier', 14),
  ('hazem', 'Hazem', 'aurora', 12),
  ('hazem', 'Hazem', 'roberto', 7),
  ('hazem', 'Hazem', 'giuseppe', 6),
  ('hazem', 'Hazem', 'carlos', 4),
  ('hazem', 'Hazem', 'dan', 2),
  ('hazem', 'Hazem', 'bismark', 1),
  ('ikram', 'Ikram', 'luliya', 36),
  ('ikram', 'Ikram', 'michelle', 29),
  ('ikram', 'Ikram', 'youssef', 10),
  ('ikram', 'Ikram', 'raul', 1),
  ('ikram', 'Ikram', 'victor', 1),
  ('jack_s', 'Jack S', 'giuseppe', 6),
  ('jack_s', 'Jack S', 'javier', 6),
  ('jack_w', 'Jack W', 'dan', 4),
  ('jack_w', 'Jack W', 'john', 4),
  ('jack_w', 'Jack W', 'berta', 2),
  ('jack_w', 'Jack W', 'aurora', 2),
  ('jad', 'Jad', 'roberto', 7),
  ('joel', 'Joel', 'youssef', 2),
  ('junaid', 'Junaid', 'aurora', 7),
  ('kareena', 'Kareena', 'javier', 7),
  ('karo', 'Karo', 'javier', 7),
  ('kayden', 'Kayden', 'javier', 7),
  ('khalid_ab', 'Khalid Ab', 'javier', 7),
  ('linda', 'Linda', 'javier', 7),
  ('logan', 'Logan', 'youssef', 7),
  ('maiyar', 'Maiyar', 'aurora', 5),
  ('maiyar', 'Maiyar', 'dan', 2),
  ('mario', 'Mario', 'angel', 7),
  ('matthias', 'Matthias', 'youssef', 6),
  ('max', 'Max', 'javier', 6),
  ('mia', 'Mia', 'dan', 7),
  ('mohammed', 'Mohammed', 'roberto', 7),
  ('patrick', 'Patrick', 'carlos', 4),
  ('patrick', 'Patrick', 'javier', 1),
  ('patrick', 'Patrick', 'bismark', 1),
  ('rayan_ta', 'Rayan Ta', 'angel', 7),
  ('rayyan_fi', 'Rayyan Fi', 'youssef', 7),
  ('rayyan_fi', 'Rayyan Fi', 'giuseppe', 6),
  ('rayyan_fi', 'Rayyan Fi', 'javier', 6),
  ('richard', 'Richard', 'angel', 7),
  ('rodin', 'Rodin', 'alex', 5),
  ('rodin', 'Rodin', 'roberto', 5),
  ('rodin', 'Rodin', 'bismark', 1),
  ('ruben', 'Ruben', 'dan', 7),
  ('saaib', 'Saaib', 'youssef', 6),
  ('samer', 'Samer', 'roberto', 5),
  ('samer', 'Samer', 'bismark', 4),
  ('samer', 'Samer', 'godsway', 2),
  ('scott', 'Scott', 'youssef', 7),
  ('scott', 'Scott', 'berta', 6),
  ('scott', 'Scott', 'alex', 5),
  ('scott', 'Scott', 'bismark', 1),
  ('scott', 'Scott', 'raul', 1),
  ('serine', 'Serine', 'sandra', 7),
  ('serine', 'Serine', 'roberto', 7),
  ('serine', 'Serine', 'carlos', 4),
  ('serine', 'Serine', 'javier', 1),
  ('serine', 'Serine', 'bismark', 1),
  ('shaan', 'Shaan', 'javier', 6),
  ('shire', 'Shire', 'javier', 6),
  ('simon', 'Simon', 'dan', 4),
  ('simon', 'Simon', 'aurora', 2),
  ('stephanie', 'Stephanie', 'youssef', 7),
  ('stephanie', 'Stephanie', 'berta', 6),
  ('stephanie', 'Stephanie', 'raul', 1),
  ('steven', 'Steven', 'angel', 7),
  ('thushyan', 'Thushyan', 'simon', 7),
  ('timi', 'Timi', 'victor', 12),
  ('timi', 'Timi', 'raul', 11),
  ('timi', 'Timi', 'roberto', 3),
  ('tinashe', 'Tinashe', 'bismark', 21),
  ('tinashe', 'Tinashe', 'john', 21),
  ('tinashe', 'Tinashe', 'giuseppe', 14),
  ('tinashe', 'Tinashe', 'godsway', 7),
  ('tom', 'Tom', 'roberto', 7),
  ('tyson', 'Tyson', 'dan', 7),
  ('vithura', 'Vithura', 'roberto', 7),
  ('yamik', 'Yamik', 'roberto', 7),
  ('yassir', 'Yassir', 'roberto', 7),
  ('yoan', 'Yoan', 'roberto', 5),
  ('yossi', 'Yossi', 'roberto', 7),
  ('yunis', 'Yunis', 'roberto', 7),
  ('yuri', 'Yuri', 'simon', 7),
  ('yusuf_ah', 'Yusuf Ah', 'bismark', 5),
  ('yusuf_ah', 'Yusuf Ah', 'alex', 5),
  ('yusuf_ah', 'Yusuf Ah', 'roberto', 5),
  ('yusuf_ah', 'Yusuf Ah', 'godsway', 2),
  ('zaid', 'Zaid', 'javier', 7),
  ('zaid', 'Zaid', 'giuseppe', 6),
  ('zaid', 'Zaid', 'carlos', 4),
  ('zaid', 'Zaid', 'bismark', 1),
  ('zakariya', 'Zakariya', 'carlos', 4),
  ('zakariya', 'Zakariya', 'dan', 4),
  ('zakariya', 'Zakariya', 'aurora', 2),
  ('zakariya', 'Zakariya', 'javier', 1),
  ('zakariya', 'Zakariya', 'bismark', 1),
  ('zayana', 'Zayana', 'dan', 7)
;

-- Owner(s) of a participant: predominant PLANNED instructor(s) (>= 50% of top),
-- mapped to auth user ids. Falls back to predominant delivered session_feedback,
-- then to the roster override team, for children not in the planned seed.
create or replace function public.portal_participant_owner_user_ids(
  p_client_id text,
  p_client_name text
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 1) Planned-roster owner (authoritative).
  return query
  with c as (
    select instructor_token as tok,
           planned_sessions as n,
           max(planned_sessions) over () as maxn
    from public.portal_participant_owner_counts
    where client_slug = public.portal_normalize_client_slug(p_client_id)
       or client_slug = public.portal_normalize_client_slug(p_client_name)
  ),
  toks as (
    select tok from c where n >= 0.5 * maxn
  )
  select distinct sp.id
  from public.staff_profiles sp
  join toks
    on lower(trim(coalesce(sp.username, ''))) = toks.tok
    or lower(trim(split_part(coalesce(sp.full_name, sp.username, ''), ' ', 1))) = toks.tok
    or lower(trim(coalesce(sp.full_name, ''))) = toks.tok
  where sp.is_active;

  if found then
    return;
  end if;

  -- 2) Fallback: predominant delivered instructor from session_feedback.
  return query
  with norm as (
    select lower(trim(coalesce(p_client_name, ''))) as cname,
           public.portal_normalize_client_slug(p_client_id) as cid
  ),
  counts as (
    select sf.submitted_by_user_id as uid, count(*)::bigint as cnt
    from public.session_feedback sf, norm
    where sf.submitted_by_user_id is not null
      and (
        (norm.cname <> '' and lower(trim(sf.client_name)) = norm.cname)
        or (norm.cid <> ''
            and public.portal_normalize_client_slug(coalesce(sf.client_id, sf.client_name)) = norm.cid)
      )
    group by sf.submitted_by_user_id
  ),
  ranked as (
    select uid, cnt, max(cnt) over () as maxc from counts
  )
  select r.uid
  from ranked r
  join public.staff_profiles sp on sp.id = r.uid and sp.is_active
  where r.cnt >= 0.5 * r.maxc;

  if found then
    return;
  end if;

  -- 3) Last resort: roster override team (cannot distinguish owner there).
  return query
  select uid from public.portal_participant_team_user_ids(p_client_id, p_client_name) as uid;
end;
$$;

comment on function public.portal_participant_owner_user_ids(text, text) is
  'Owner(s) of a participant: predominant PLANNED instructor(s) from portal_participant_owner_counts (>= 50%% of top), mapped to auth ids. Fallback: predominant session_feedback, then roster team.';

commit;
