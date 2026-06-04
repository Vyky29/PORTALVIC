# Portal — corporate @clubsensational.org emails

Proyecto Supabase **portal** (`cklpnwhlqsulpmkipmqb`).

## Los cinco correos

| Email | Rol | Portal login (Supabase Auth) |
|-------|-----|------------------------------|
| `victor@clubsensational.org` | CEO | Sí — usuario propio |
| `javier@clubsensational.org` | CEO | Sí — usuario propio |
| `raul@clubsensational.org` | CEO | Sí — usuario propio |
| `sevitha@clubsensational.org` | Admin (Sevitha) | Sí — **único** Auth de Sevitha |
| `info@clubsensational.org` | Contacto público | **Alias** — el formulario resuelve a `sevitha@` (misma contraseña) |
| `admin@clubsensational.org` | Remitente sistema (roster, avisos, SMTP) | **No** — solo `PORTAL_MAIL_FROM_EMAIL` |
| `management@clubsensational.org` | Safeguarding (opcional) | **No** — Reply-To grave |

## Código

- `database/auth-map.js` → sincronizado a `working_ui/portal/auth-map.js`
- `working_ui/login.html` mapa inline
- `database/staff_login_map.json` / `.js`
- `working_ui/portal/portal_brand.js` — constantes mail para UI futura

## Supabase (hacer en Dashboard + SQL)

1. **Authentication → Users:** crear o resetear contraseña para los **cuatro** Auth: victor@, javier@, raul@, sevitha@.  
   No crear un segundo usuario solo para info@.

2. **SQL Editor:** ejecutar `supabase/migrations/20260618120000_portal_five_corporate_emails.sql`  
   (limpia duplicados, enlaza `staff_profiles`, opcional contraseña test `121212`).

3. Si Sevitha solo existía como `info@` en Auth, descomenta el bloque `update auth.users` en la migración para renombrar a `sevitha@`, o crea `sevitha@` y borra `info@` huérfano.

4. **DNS / Google:** reenvío `info@` → buzón de Sevitha; `admin@` para SMTP cuando conectéis Resend/SendGrid.

## Probar login

```powershell
$env:SUPABASE_URL="https://cklpnwhlqsulpmkipmqb.supabase.co"
$env:SUPABASE_ANON_KEY="..."
$env:PORTAL_TEST_PASSWORD="tu-contraseña"
python database/validate_portal_admin_logins.py
```

Debe pasar victor@, raul@, javier@, sevitha@ e **info@** (alias).

## Próximo: envío de correos

Secrets sugeridos (cuando implementéis Edge Functions / Resend):

- `PORTAL_MAIL_FROM=admin@clubsensational.org`
- `PORTAL_MAIL_REPLY_TO=info@clubsensational.org`
- `PORTAL_MAIL_SAFEGUARDING=management@clubsensational.org`

No usar Gmail personales en producción.
