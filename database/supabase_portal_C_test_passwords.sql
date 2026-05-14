-- Una sola sentencia: RUN. Contraseña de prueba 990099 para todos los stf* (incl. Demo; mín. 6 chars en Supabase).

update auth.users
set
  encrypted_password = crypt('990099', gen_salt('bf')),
  updated_at = now()
where email in (
  'stf001@staff.import.pending',
  'stf002@staff.import.pending',
  'stf003@staff.import.pending',
  'stf004@staff.import.pending',
  'stf005@staff.import.pending',
  'stf006@staff.import.pending',
  'stf007@staff.import.pending',
  'stf008@staff.import.pending',
  'stf009@staff.import.pending',
  'stf010@staff.import.pending',
  'stf011@staff.import.pending',
  'stf012@staff.import.pending',
  'stf013@staff.import.pending',
  'stf014@staff.import.pending',
  'stf015@staff.import.pending',
  'stf017@staff.import.pending',
  'stf018@staff.import.pending',
  'stf019@staff.import.pending',
  'stf020@staff.import.pending'
);
