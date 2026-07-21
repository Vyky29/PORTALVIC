select policyname from pg_policies where schemaname='public' and tablename='documents' and policyname ilike '%ld%';
