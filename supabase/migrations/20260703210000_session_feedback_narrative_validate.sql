-- Session feedback: narrative_validate audit source + token usage in meta.

alter table public.session_feedback_narrative_audit
  drop constraint if exists session_feedback_narrative_audit_source_check;

alter table public.session_feedback_narrative_audit
  add constraint session_feedback_narrative_audit_source_check
  check (
    source in (
      'voice_transcribe',
      'narrative_validate',
      'narrative_filter',
      'feedback_submit',
      'output_edit'
    )
  );

comment on column public.session_feedback_narrative_audit.meta is
  'OpenAI token usage, attempt counts, edit flags, input_mode, section validation JSON.';
