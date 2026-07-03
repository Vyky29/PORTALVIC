-- Staff session narrative (English) — source text before AI split into positive + relevant.
alter table public.session_feedback
  add column if not exists session_narrative text null;

comment on column public.session_feedback.session_narrative is
  'Staff session narrative (Reception / Session / Handover) before Filter with AI.';
