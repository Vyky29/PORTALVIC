-- Una sola sentencia: RUN o EXPLAIN. Emails de la lista que aún no existen en auth.users.

select x.email as missing_auth_user
from (
  values
    ('stf001@staff.import.pending'),
    ('stf002@staff.import.pending'),
    ('stf003@staff.import.pending'),
    ('stf004@staff.import.pending'),
    ('stf005@staff.import.pending'),
    ('stf006@staff.import.pending'),
    ('stf007@staff.import.pending'),
    ('stf008@staff.import.pending'),
    ('stf009@staff.import.pending'),
    ('stf010@staff.import.pending'),
    ('stf011@staff.import.pending'),
    ('stf012@staff.import.pending'),
    ('stf013@staff.import.pending'),
    ('stf014@staff.import.pending'),
    ('stf015@staff.import.pending'),
    ('stf017@staff.import.pending'),
    ('stf018@staff.import.pending'),
    ('stf019@staff.import.pending'),
    ('stf020@staff.import.pending')
) as x(email)
where not exists (
  select 1 from auth.users au where lower(au.email) = lower(x.email)
)
order by 1;
