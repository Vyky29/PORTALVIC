-- Commissioning T&Cs v1.1: absence always chargeable; discretionary makeup for LA.
-- Supersedes active 1.0 document row; does not touch family T&Cs.

begin;

update public.portal_terms_documents
set status = 'superseded'
where audience = 'commissioning'
  and version = '1.0'
  and status = 'active';

insert into public.portal_terms_documents (
  audience, slug, version, title, public_path, content_hash, effective_from, status
) values (
  'commissioning',
  'la-commissioning-terms',
  '1.1',
  'Local Authority and Commissioning Organisation Terms & Conditions',
  '/commissioning/terms',
  'v1.1-2026-07-20-absence-makeup',
  date '2026-07-20',
  'active'
) on conflict (audience, version) do update
  set title = excluded.title,
      public_path = excluded.public_path,
      content_hash = excluded.content_hash,
      status = 'active',
      effective_from = excluded.effective_from;

commit;
