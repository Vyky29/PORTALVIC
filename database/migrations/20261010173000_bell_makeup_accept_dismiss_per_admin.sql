-- Makeup accepted on the admin bell can be closed per admin.
-- Close on one admin does not clear it for the others.

begin;

alter table public.portal_admin_bell_item_reads
  drop constraint if exists portal_admin_bell_item_reads_item_kind_check;

alter table public.portal_admin_bell_item_reads
  add constraint portal_admin_bell_item_reads_item_kind_check
  check (item_kind in ('photo_download', 'parent_note', 'makeup_accepted'));

commit;
