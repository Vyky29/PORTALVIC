-- Carlos 29 Jun: void stale Luliya→Carlos cover override (11-16) superseded by dated
-- portal_roster_rows split (11-12 Youssef+Carlos, 12-4 Michelle+Carlos) for Ikram Day Centre.
-- CLI updates need trigger disabled (schedule_overrides_set_updated_trg sets updated_by := auth.uid()).

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set status = 'cancelled',
    updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid,
    reason = '[voided 2026-06-30: superseded by dated portal_roster_rows 11-12/12-4 for Ikram Day Centre; Carlos covered via those rows]'
where id = '60585ff2-c256-4e0c-aff1-ed5a66c62e7b'
  and status = 'active';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;
