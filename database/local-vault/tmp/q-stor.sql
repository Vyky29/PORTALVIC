select policyname, cmd, coalesce(with_check,'') as with_check from pg_policies where schemaname='storage' and tablename='objects' and policyname ilike '%ld%';
