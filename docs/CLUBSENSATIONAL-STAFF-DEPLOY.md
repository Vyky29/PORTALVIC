# clubSENsational Staff — deploy separado (Vercel)

App móvil/web para **instructores y leads**. Nombre de producto: **clubSENsational Staff** (sin “vic”).

## Proyectos Vercel

| Proyecto | URL típica | Contenido |
|----------|------------|-----------|
| **clubsensational-staff** | `https://clubsensational-staff.vercel.app` | Login staff, dashboard, formularios del día a día |
| **portalvic** (actual) | `https://portalvic.vercel.app` | Admin, CEO, formularios públicos, HR |

Mismo repo GitHub **PORTALVIC**, dos proyectos Vercel.

## Dispositivos (qué optimizar dónde)

| Audiencia | URL / app | Dispositivo principal | Notas |
|-----------|-----------|------------------------|--------|
| **Instructores / leads** | `clubsensational-staff.vercel.app` | **Móvil e iPad** | App dedicada (`PORTAL_STAFF_APP`). Carga ligera en handheld; en escritorio (p. ej. en casa) usa el mismo build con scripts en paralelo. |
| **Admin / CEO / office** | `portalvic.vercel.app` | **Escritorio** (también móvil/iPad) | `admin_dashboard.html`, `ceo_dashboard.html`, etc. |
| **Staff en casa (opcional)** | `portalvic.vercel.app/staff_dashboard.html` | Escritorio | Mismo HTML que producción histórica, **sin** parches móviles de la app staff. |
| **Familias** | `https://www.clubsensational.org/parent` (técnico: `portalvic.vercel.app/parent`) | **Cualquiera** | Teléfono, tablet y ordenador; layout ancho desde 720px. **No** usar `clubsensational-staff.vercel.app/parent`. |

La detección handheld en la app staff incluye **iPad** (también cuando Safari reporta “Macintosh” con touch).

## Crear el proyecto en Vercel

1. [Vercel Dashboard](https://vercel.com) → **Add New** → **Project** → importar repo **PORTALVIC**.
2. **Project Name:** `clubsensational-staff`
3. **Framework Preset:** Other
4. **Build settings** — Vercel los bloquea porque lee `vercel.json` del repo. **No hace falta cambiarlos.** El script `scripts/vercel-build.mjs` detecta el nombre del proyecto (`clubsensational-staff`) y construye la app staff sola.
5. **Environment variables** (Production + Preview):

   | Variable | Valor |
   |----------|--------|
   | `STAFF_PROFILE_PORTAL_BRIDGE_SECRET` | Igual que en portalvic |
   | `CLUBSENSATIONAL_STAFF_ORIGIN` | `https://clubsensational-staff.vercel.app` |
   | `PORTAL_ADMIN_ORIGIN` | `https://portalvic.vercel.app` |
   | `PORTAL_FAMILY_ORIGIN` | `https://www.clubsensational.org` |

6. Deploy.

## Supabase Auth (checklist)

En [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/auth/url-configuration):

- [ ] **Redirect URL:** `https://clubsensational-staff.vercel.app/**`
- [ ] (Opcional preview) `https://*.vercel.app/**` si usáis previews del proyecto staff

**Site URL** puede seguir siendo portalvic; lo importante es que el redirect de la staff app esté permitido.

## Plan → visualVIC (rutinas)

- El botón **Plan** en portalvic **y** en clubSENsational Staff abre **visualVIC** (`https://visual-vic.vercel.app/planner`) con la sesión Supabase del usuario (handoff SSO).
- **No** hace falta configurar en visualVIC ninguna URL del portal staff ni de portalvic para que Plan funcione.
- Quién ve qué en visualVIC (servicio, participantes, carpetas premium, etc.) se configura **en visualVIC / Supabase**, no en variables de entorno del portal.

Ejemplos de alcance (producto visualVIC / `staff_participant_access`):

- Sandra → Fitness, Ayaan, Serine & Core
- Alex / Andres / Carlos → Climbing & Core
- Bismark → Climbing, Tinashe & Core
- Giuseppe / Godsway / John → Tinashe & Core
- Roberto → Fadi & Core
- Luliya → Ikram & Core
- Youssef → Fadi, Emanuel & Core
- Michelle / Victor / Raul / Palankas → proyecto completo (`planner_full_access`)
- Day Centre (legacy note) → Day Centre, Core, Emanuel, Fadi, Ikram, Timi + carpeta premium (shower, getting changed, …)

## Staff app rollout (open to all — Jul 2026)

**Staff app URL:** `https://clubsensational-staff.vercel.app/login.html`

Open to **all staff**. `PORTAL_STAFF_APP_OPEN_TO_ALL` in `working_ui/portal/portal_staff_app_pilot.js` — no kick to portalvic. On `portalvic` staff dashboard, a banner points people to the staff app.

Desktop/admin still: `https://portalvic.vercel.app` (admin/CEO/HR).

## Comportamiento

- **Staff / lead** → entran y quedan en `staff_dashboard.html`.
- **Admin / CEO / office** → tras login se redirigen al portal admin (`PORTAL_ADMIN_ORIGIN`).
- **PWA:** nombre **clubSENsational Staff**; en iPad/iPhone mostrar aviso “Add to Home Screen” en login.

## Build local

```bash
npm run build:staff-app
# Salida: dist/clubsensational-staff/
```

## Archivos clave

- `scripts/build-clubsensational-staff.mjs` — empaqueta `working_ui/` sin admin/CEO
- `working_ui/portal/staff-app-boot.js` — preconnect, preload, assets diferidos
- `working_ui/portal/staff-app-install-hint.js` — aviso PWA en login
- `working_ui/clubsensational-staff-*.webmanifest` — PWA branding
