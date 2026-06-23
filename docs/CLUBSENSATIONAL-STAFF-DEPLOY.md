# clubSENsational Staff — deploy separado (Vercel)

App móvil/web para **instructores y leads**. Nombre de producto: **clubSENsational Staff** (sin “vic”).

## Proyectos Vercel

| Proyecto | URL típica | Contenido |
|----------|------------|-----------|
| **clubsensational-staff** | `https://clubsensational-staff.vercel.app` | Login staff, dashboard, formularios del día a día |
| **portalvic** (actual) | `https://portalvic.vercel.app` | Admin, CEO, formularios públicos, HR |

Mismo repo GitHub **PORTALVIC**, dos proyectos Vercel.

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

6. Deploy.

## Supabase Auth

En [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/auth/url-configuration):

- Añadir **Redirect URL:** `https://clubsensational-staff.vercel.app/**`

## visualVIC (Planner handoff)

En el proyecto **visual-vic**, actualizar:

- `NEXT_PUBLIC_STAFF_PORTAL_URL=https://clubsensational-staff.vercel.app`

## Comportamiento

- **Staff / lead** → entran y quedan en `staff_dashboard.html`.
- **Admin / CEO / office** → tras login se redirigen al portal admin (`PORTAL_ADMIN_ORIGIN`).
- PWA: nombre **clubSENsational Staff**, icono en `/portal/app-icon/`.

## Build local

```bash
npm run build:staff-app
# Salida: dist/clubsensational-staff/
```

## Archivos clave

- `scripts/build-clubsensational-staff.mjs` — empaqueta `working_ui/` sin admin/CEO
- `vercel.staff.json` — config para el segundo proyecto Vercel
- `working_ui/clubsensational-staff-*.webmanifest` — PWA branding
