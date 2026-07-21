select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
where polrelid = 'public.schedule_overrides'::regclass;
