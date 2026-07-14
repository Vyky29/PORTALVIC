-- Optional swimming E/R/I on Day Centre (support worker) session feedback.
-- Main engagement / emotions / independence stay Day Centre; swim_* is additive.

begin;

alter table public.session_feedback
  add column if not exists swim_done boolean not null default false;

alter table public.session_feedback
  add column if not exists swim_engagement_rating smallint null;

alter table public.session_feedback
  add column if not exists swim_regulation text null;

alter table public.session_feedback
  add column if not exists swim_independence text null;

alter table public.session_feedback
  drop constraint if exists session_feedback_swim_engagement_rating_check;

alter table public.session_feedback
  add constraint session_feedback_swim_engagement_rating_check
  check (
    swim_engagement_rating is null
    or swim_engagement_rating between 1 and 4
  );

comment on column public.session_feedback.swim_done is
  'True when Day Centre (or similar) feedback includes a swimming judgment for that day.';
comment on column public.session_feedback.swim_engagement_rating is
  'Optional aquatic engagement 1–4; does not replace engagement_rating.';
comment on column public.session_feedback.swim_regulation is
  'Optional aquatic regulation label; does not replace client_emotions.';
comment on column public.session_feedback.swim_independence is
  'Optional aquatic independence label; does not replace engagement_patterns.';

commit;
