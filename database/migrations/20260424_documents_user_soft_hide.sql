-- Staff "Delete" in My Documents: soft-hide only (row + file kept for audit).
-- For accountant handoff, run a point-in-time export with the service role at your cutoff
-- (e.g. 24th 23:00 in your timezone) so the snapshot reflects every row that existed then, including since-hidden rows.

alter table public.documents
  add column if not exists hidden_by_user_at timestamptz null;

comment on column public.documents.hidden_by_user_at is
  'Set when the staff removes the document from My Documents. Row remains in DB for audit; accounting should use a point-in-time export (e.g. end of billing window).';

-- Staff SELECT only non-hidden rows (admin/service role bypasses RLS).
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own
on public.documents
for select
to authenticated
using (user_id = auth.uid() and hidden_by_user_at is null);

-- Controlled update: only this RPC (SECURITY DEFINER); authenticated still has no broad UPDATE grant.
create or replace function public.hide_my_document(doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if doc_id is null then
    return;
  end if;
  update public.documents
  set hidden_by_user_at = now()
  where id = doc_id
    and user_id = auth.uid()
    and hidden_by_user_at is null;
end;
$$;

grant execute on function public.hide_my_document(uuid) to authenticated;
