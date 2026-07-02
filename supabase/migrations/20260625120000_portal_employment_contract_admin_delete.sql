-- HR admin/CEO: delete test or mistaken employment contracts from the contract wizard.

begin;

drop policy if exists documents_storage_delete_admin_employment_contracts on storage.objects;
create policy documents_storage_delete_admin_employment_contracts
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and public.portal_staff_profile_is_admin_or_ceo()
    and (storage.foldername(name))[2] = 'contract_sign'
  );

create or replace function public.portal_admin_delete_employment_contract(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.employment_contracts%rowtype;
  v_file_path text;
  v_ann_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'forbidden';
  end if;

  select *
  into v_contract
  from public.employment_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  v_ann_id := v_contract.announcement_id;
  v_file_path := null;

  if v_contract.document_id is not null then
    select d.file_url
    into v_file_path
    from public.documents d
    where d.id = v_contract.document_id;

    delete from public.documents
    where id = v_contract.document_id;
  end if;

  if v_ann_id is not null then
    delete from public.portal_staff_announcement_acks
    where announcement_id = v_ann_id;

    delete from public.portal_staff_announcements
    where id = v_ann_id
      and message_type = 'contract_signing';
  end if;

  delete from public.employment_contracts
  where id = p_contract_id;

  return jsonb_build_object(
    'id', p_contract_id,
    'storage_path', v_file_path,
    'storage_deleted', false
  );
end;
$$;

revoke all on function public.portal_admin_delete_employment_contract(uuid) from public;
grant execute on function public.portal_admin_delete_employment_contract(uuid) to authenticated;

comment on function public.portal_admin_delete_employment_contract(uuid) is
  'Admin/CEO: remove employment contract row, linked dashboard notice, document row; browser removes storage PDF via Storage API.';

commit;
