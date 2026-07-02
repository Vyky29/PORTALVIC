-- Allow admins to edit the family-portal session summary; auto-sanitize must not overwrite.

begin;

alter table public.portal_parent_feedback_share
  add column if not exists admin_edited_at timestamptz null,
  add column if not exists admin_edited_by_user_id uuid null references auth.users (id) on delete set null;

comment on column public.portal_parent_feedback_share.admin_edited_at is
  'When an admin last edited parent_message manually (blocks OpenAI re-sanitize).';

comment on column public.portal_parent_feedback_share.admin_edited_by_user_id is
  'staff_profiles.id of the admin who last edited parent_message.';

commit;
