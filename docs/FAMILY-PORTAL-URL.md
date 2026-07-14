# Family portal — URL canónica

## Dónde vive (producto)

| Audiencia | URL canónica | Host técnico |
|-----------|--------------|--------------|
| **Padres / familias** | **https://www.clubsensational.org/parent** → **https://family.clubsensational.org/parent** | `portalvic` (Vercel) |
| **Instructores / leads** | https://clubsensational-staff.vercel.app | `clubsensational-staff` (Vercel) |
| **Admin / CEO** | https://portalvic.vercel.app | `portalvic` (Vercel) |

El family portal **no** debe usarse en el dominio staff.  
`clubsensational-staff.vercel.app/parent` redirige a `www.clubsensational.org/parent`.

## Rutas family (portalvic)

- `/parent` — login + portal
- `/parents` — redirige a `/parent` (typo plural)
- `/parent/re-enrolment` — re-enrolment 2026/27
- `/parent/registration` — registro general
- `/parent/climbing-registration` — escalada
- `/bookingservice` — oferta pública de clases (mock / filtros)

Mientras `clubsensational.org/parent` no esté enlazado, todo funciona en:

**https://portalvic.vercel.app/parent**  
**https://family.clubsensational.org/bookingservice** (o `portalvic.vercel.app/bookingservice`)

## Conectar `clubsensational.org/parent`

WordPress ya usa `www.clubsensational.org`. Para que `/parent`, `/parents` y `/bookingservice` abran el portal:

### Opción A — Plugin WordPress (recomendada, ~2 min)

En el repo: `wordpress/clubsensational-family-portal-redirect/` (v1.3+ = **proxy** + bookingservice)

1. Comprimir la carpeta en ZIP o subirla por FTP a `wp-content/plugins/`
2. WordPress → **Plugins** → activar **clubSENsational Family Portal Proxy**
3. Probar:
   - https://www.clubsensational.org/parent — portal carga **sin cambiar** la URL
   - https://www.clubsensational.org/parents → mismo contenido
   - https://www.clubsensational.org/parent/re-enrolment
   - https://www.clubsensational.org/bookingservice — catálogo de clases

El plugin hace **reverse proxy** desde `family.clubsensational.org` (Vercel). Requiere DNS **A** `family` → `76.76.21.21`.

### Opción B — Redirección WordPress (plugin Redirection)

| Origen | Destino |
|--------|---------|
| `/parent` | `https://portalvic.vercel.app/parent` |
| `/parent/(.*)` | `https://portalvic.vercel.app/parent/$1` |
| `/parents` | `https://portalvic.vercel.app/parent` |
| `/parents/(.*)` | `https://portalvic.vercel.app/parent/$1` |

Los padres verán `portalvic.vercel.app` en la barra hasta usar subdominio o proxy.

### Opción C — Subdominio en Vercel ✅ configurado (pendiente DNS)

1. ~~Vercel → proyecto **portalvic** → Domains → `family.clubsensational.org`~~ **Hecho**
2. **DNS (Wix):** registro **A** `family` → `76.76.21.21` — ver `docs/FAMILY-SUBDOMAIN-DNS.md`
3. Actualizar plugin WordPress a v1.1.0 (redirige a family, no portalvic)
4. Comunicar a familias: **https://www.clubsensational.org/parent** (redirect) o **https://family.clubsensational.org/parent** (directo)

Actualizar `PORTAL_FAMILY_ORIGIN` en Vercel (portalvic + clubsensational-staff):

```
PORTAL_FAMILY_ORIGIN=https://family.clubsensational.org
```

### Opción D — Mantener `/parent` en clubsensational.org (proxy)

Requiere Cloudflare Worker o proxy inverso que envíe `/parent/*` a `portalvic.vercel.app/parent/*` sin cambiar la URL visible. Configuración en Cloudflare/DNS, no en este repo.

## Variables Vercel

| Variable | Proyecto | Valor por defecto |
|----------|----------|-------------------|
| `PORTAL_FAMILY_ORIGIN` | portalvic, clubsensational-staff | `https://family.clubsensational.org` |
| `CLUBSENSATIONAL_FAMILY_ORIGIN` | (alias) | igual |

## Comprobar

```bash
curl -sI https://clubsensational-staff.vercel.app/parent | grep -i location
# → https://www.clubsensational.org/parent
```

Tras enlazar dominio o redirect WordPress, abrir **https://www.clubsensational.org/parent** y hacer sign-in de prueba.
