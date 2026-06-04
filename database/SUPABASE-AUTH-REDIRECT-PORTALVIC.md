# Supabase Auth — un solo dominio (portalvic)

## Problema

Pides magic link / recuperación desde [https://portalvic.vercel.app/](https://portalvic.vercel.app/) pero el correo abre otro host (p. ej. `https://clubsensational-portal-2026.vercel.app/#error=access_denied&error_code=otp_expired`). El token se consume en el host equivocado o caduca → `otp_expired`.

**Causa habitual:** en Supabase proyecto **portal** (`cklpnwhlqsulpmkipmqb`), **Authentication → URL Configuration**, el **Site URL** sigue apuntando al deploy antiguo.

**No es un bug del HTML de login:** los enlaces de correo los genera Supabase con `Site URL` + plantillas (`{{ .ConfirmationURL }}`).

---

## 1. Arreglar Supabase (obligatorio)

Dashboard: [Supabase → portal → Authentication → URL Configuration](https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/auth/url-configuration)

| Campo | Valor recomendado |
|--------|-------------------|
| **Site URL** | `https://portalvic.vercel.app/login.html` |
| **Redirect URLs** (añadir todas las que uses) | `https://portalvic.vercel.app/**` |
| | `https://portalvic.vercel.app/login.html` |
| | `https://portalvic.vercel.app/admin_dashboard.html` |
| | `https://portalvic.vercel.app/staff_dashboard.html` |
| | `https://portalvic.vercel.app/lead_dashboard.html` |

Opcional: quitar de la lista los hosts `clubsensational-portal-2026.vercel.app` y `portal-2025-eta.vercel.app` si ya no los necesitas.

**Después:** envía un **enlace nuevo** (el anterior con `otp_expired` no sirve).

Comprueba en **Authentication → Email Templates** que los enlaces usan `{{ .ConfirmationURL }}` / `{{ .SiteURL }}`, no una URL fija al proyecto 2026.

---

## 2. Desactivar el otro proyecto en Vercel

En el equipo **vic-s-projects1** existen al menos:

| Proyecto | Producción (CLI) | Uso |
|----------|------------------|-----|
| **portalvic** | https://portalvic.vercel.app | **Producción PORTALVIC** (este repo, `working_ui/`) |
| **clubsensational-portal-2026** | https://portal-2025-eta.vercel.app (+ alias `clubsensational-portal-2026.vercel.app`) | Prototipo / hub antiguo — **desconectar** |

Pasos en [vercel.com](https://vercel.com):

1. Abre **clubsensational-portal-2026** → **Settings → Git** → **Disconnect** (deja de desplegar al hacer push).
2. O **Settings → Domains** → quita dominios de producción si no los necesitas.
3. Si el proyecto ya no sirve: **Settings → Advanced → Delete Project** (irreversible).

Mantén **portalvic** como único deploy de este repo para el portal staff/lead/admin.

---

## 3. Comprobar

1. Supabase Site URL = portalvic.
2. Desde portalvic, pide magic link / reset de nuevo.
3. El correo debe abrir `https://portalvic.vercel.app/...` (no `clubsensational-portal-2026`).
4. Tras abrir el enlace, `login.html` redirige al dashboard si la sesión es válida.

Si aún caes en el host 2026 por un bookmark viejo, `auth-handler.js` en portalvic intenta reenviar el hash a `portalvic/login.html` cuando esa página carga el mismo bundle (el fix definitivo sigue siendo Site URL + desactivar el otro Vercel).

---

## Relacionado

- Push / secrets: `database/PORTAL-WEB-PUSH-SETUP-GUIDE.md` (URLs solo portalvic).
- Supabase único backend: proyecto **portal** `cklpnwhlqsulpmkipmqb`.
